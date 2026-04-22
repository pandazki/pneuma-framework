import { join, resolve } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";
import { parseTemplateManifest, resolveScriptPath } from "./manifest.js";
import { buildLifecycleEnv } from "./env.js";
import { parseMarker } from "./markers.js";
import { initWorkspace, stateDir, buildDir } from "./workspace.js";
import { spawnScript, type ScriptProcess } from "./process-manager.js";
import { readBuildManifest } from "./artifact.js";
import { initShadowGit } from "./shadow-git.js";
import { LogBuffer, type GetLinesOpts, type LogLine } from "./logs.js";
import type {
  LifecycleState,
  LifecycleVerb,
  ServiceStatus,
  TemplateManifest,
  VerbExecution,
} from "./types.js";

export interface OrchestratorOptions {
  templateDir: string;
  workspace: string;
  portHint?: number;
  /** Timeout (ms) the orchestrator waits for stop.sh to exit before falling back to SIGTERM on the dev process. Default 10000. */
  stopScriptTimeoutMs?: number;
  /** Timeout (ms) the orchestrator waits for the dev process to exit after SIGTERM before sending SIGKILL. Default 5000. */
  stopSigtermTimeoutMs?: number;
  /** Framework session id forwarded to scripts as PNEUMA_SESSION_ID. Usually set post-construction via setSessionContext once the wire server exists. */
  sessionId?: string;
  /** Wire server URL forwarded to scripts as PNEUMA_WS_URL. Usually set post-construction via setSessionContext once the wire server exists. */
  wsUrl?: string;
}

export interface BuildResult {
  exitCode: number;
  manifestPath?: string;
}

export interface DeployResult {
  exitCode: number;
}

export interface SetupResult {
  exitCode: number;
}

export class LifecycleOrchestrator {
  readonly templateDir: string;
  readonly workspace: string;
  readonly manifest: TemplateManifest;
  readonly state: LifecycleState;
  private devProc?: ScriptProcess;
  private devReadyResolve?: () => void;
  private devReadyPromise?: Promise<void>;
  private readonly defaultPortHint?: number;
  private readonly stopScriptTimeoutMs: number;
  private readonly stopSigtermTimeoutMs: number;
  private sessionId?: string;
  private wsUrl?: string;
  private _stopInvoked = false;
  private readonly logs = new LogBuffer({ perVerbCap: 2000 });
  private verbStdin = new Map<LifecycleVerb, (data: string) => void>();

  /**
   * True once runStop() has been entered on this orchestrator. Set BEFORE any
   * async work so concurrent callers short-circuit. This is the authoritative
   * "was teardown requested" signal — distinct from state.dev.state === "stopped",
   * which is also set by the ##pneuma:stopping marker emitted by dev.sh.
   */
  get stopInvoked(): boolean {
    return this._stopInvoked;
  }

  constructor(opts: OrchestratorOptions) {
    this.templateDir = resolve(opts.templateDir);
    this.workspace = resolve(opts.workspace);
    this.manifest = parseTemplateManifest(this.templateDir);
    initWorkspace(this.workspace);
    this.state = {
      workspace: { root: this.workspace, stateDir: stateDir(this.workspace) },
    };
    this.defaultPortHint = opts.portHint;
    this.stopScriptTimeoutMs = opts.stopScriptTimeoutMs ?? 10_000;
    this.stopSigtermTimeoutMs = opts.stopSigtermTimeoutMs ?? 5_000;
    this.sessionId = opts.sessionId;
    this.wsUrl = opts.wsUrl;
    // shadow-git init is async; kick it off but don't block constructor.
    void initShadowGit(this.workspace).catch(() => { /* best-effort for v0 */ });
  }

  /**
   * Assign / update the session context forwarded to lifecycle scripts as
   * PNEUMA_SESSION_ID + PNEUMA_WS_URL. Typically invoked by
   * `createPneumaFramework` after the wire server is up, before any dev.sh
   * spawn. Subsequent spawns pick up the new values; in-flight scripts are
   * unaffected.
   */
  setSessionContext(ctx: { sessionId?: string; wsUrl?: string }): void {
    if (ctx.sessionId !== undefined) this.sessionId = ctx.sessionId;
    if (ctx.wsUrl !== undefined) this.wsUrl = ctx.wsUrl;
  }

  runDev(portHint?: number): Promise<void> {
    const scriptPath = this.requireScript("dev");

    // Create the ready promise BEFORE spawning so we don't miss an early ##pneuma:ready.
    this.devReadyPromise = new Promise<void>((res) => {
      this.devReadyResolve = res;
    });

    const proc = this.spawnVerb("dev", scriptPath, {
      mode: "dev",
      portHint: portHint ?? this.defaultPortHint,
    });
    // Only reset the stop latch AFTER spawn succeeds — if spawn threw above,
    // the previous cycle's teardown state stays intact.
    this._stopInvoked = false;
    this.devProc = proc.proc;

    return proc.done.then(() => {
      if (this.state.dev && this.state.dev.state === "running") {
        this.state.dev.state = this.state.dev.exitCode === 0 ? "exited" : "crashed";
      }
      this.devProc = undefined;
    });
  }

  awaitDevReady(): Promise<void> {
    return this.devReadyPromise ?? Promise.resolve();
  }

  async runStop(): Promise<void> {
    if (this._stopInvoked) return; // idempotent: no-op if already called
    this._stopInvoked = true;
    const stopScript = resolveScriptPath(this.templateDir, this.manifest, "stop");
    if (stopScript) {
      try {
        const env = buildLifecycleEnv({
          workspace: this.workspace,
          verb: "stop",
          mode: "dev",
          sessionId: this.sessionId,
          wsUrl: this.wsUrl,
          parentEnv: process.env,
        });
        const stopProc = spawnScript({ scriptPath: stopScript, cwd: this.templateDir, env });
        stopProc.onLine((ev) => {
          this.logs.push("stop", { stream: ev.stream, line: ev.line, ts: ev.ts });
        });
        try {
          await withTimeout(stopProc.exit, this.stopScriptTimeoutMs);
        } catch {
          // stop.sh hung or errored — fall through to SIGTERM on the dev process.
          // Kill the stop.sh process group too so it doesn't leak.
          try { process.kill(-stopProc.pid, "SIGKILL"); } catch { /* already gone */ }
        }
      } catch {
        // stop.sh could not be spawned (missing, not executable, etc.). Fall through to devProc kill.
      }
    }
    if (this.devProc) {
      await this.devProc.kill("SIGTERM");
      try {
        await withTimeout(this.devProc.exit, this.stopSigtermTimeoutMs);
      } catch {
        await this.devProc.kill("SIGKILL");
      }
    }
    if (this.state.dev) this.state.dev.state = "stopped";
  }

  async runBuild(): Promise<BuildResult> {
    const scriptPath = this.requireScript("build");
    const bDir = buildDir(this.workspace);
    const manifestPath = join(bDir, "build.manifest.json");

    const proc = this.spawnVerb("build", scriptPath, {
      mode: "release",
      buildDir: bDir,
    });
    const result = await proc.done;

    let finalManifest: string | undefined;
    let finalExitCode = result.code ?? -1;
    if (finalExitCode === 0 && existsSync(manifestPath)) {
      try {
        readBuildManifest(manifestPath); // validates
        finalManifest = manifestPath;
      } catch (err) {
        throw new Error(`build.sh exited 0 but produced invalid manifest: ${(err as Error).message}`);
      }
    } else if (finalExitCode === 0 && !existsSync(manifestPath)) {
      // Script reported success but produced no manifest — treat as failure.
      finalExitCode = 1;
      if (this.state.lastBuild) {
        this.state.lastBuild.state = "crashed";
        this.state.lastBuild.exitCode = 1;
      }
    }

    if (this.state.lastBuild) {
      this.state.lastBuild.manifestPath = finalManifest;
    }
    return { exitCode: finalExitCode, manifestPath: finalManifest };
  }

  async runDeploy(options: { manifestPath?: string } = {}): Promise<DeployResult> {
    const scriptPath = this.requireScript("deploy");
    const manifestPath =
      options.manifestPath
      ?? this.state.lastBuild?.manifestPath
      ?? (this.state.lastBuild === undefined ? this.latestBuildManifest() : undefined);
    if (!manifestPath) {
      return { exitCode: 2 };
    }
    const proc = this.spawnVerb("deploy", scriptPath, {
      mode: "release",
      artifactManifestPath: manifestPath,
    });
    const result = await proc.done;
    return { exitCode: result.code ?? -1 };
  }

  async runSetup(): Promise<SetupResult> {
    const scriptPath = this.requireScript("setup");
    const proc = this.spawnVerb("setup", scriptPath, { mode: "dev" });
    const result = await proc.done;
    return { exitCode: result.code ?? -1 };
  }

  getLogs(opts: GetLinesOpts): LogLine[] {
    return this.logs.getLines(opts);
  }

  async resolveConfirm(verb: LifecycleVerb, label: string, decision: "yes" | "no"): Promise<void> {
    const execSlot = verb === "dev" ? this.state.dev
                    : verb === "build" ? this.state.lastBuild
                    : verb === "deploy" ? this.state.lastDeploy
                    : undefined;
    if (!execSlot || execSlot.pendingConfirm?.label !== label) {
      throw new Error(`no pending confirm for verb=${verb} label=${label}`);
    }
    const write = this.verbStdin.get(verb);
    if (!write) throw new Error(`no active stdin for verb=${verb}`);
    // Quote the label if it contains whitespace so the child can unambiguously
    // separate it from the trailing yes/no token. Mirrors parseMarker's
    // `##pneuma:needs-confirm "multi word"` syntax.
    const serialized = /\s|"/.test(label) ? `"${label.replace(/"/g, '\\"')}"` : label;
    write(`##pneuma:confirm ${serialized} ${decision}\n`);
    execSlot.pendingConfirm = undefined;
  }

  // --- internals ---

  private requireScript(verb: LifecycleVerb): string {
    const p = resolveScriptPath(this.templateDir, this.manifest, verb);
    if (!p) throw new Error(`template does not declare scripts.${verb}`);
    return p;
  }

  private latestBuildManifest(): string | undefined {
    const root = join(this.workspace, ".pneuma-build");
    if (!existsSync(root)) return undefined;
    const entries = readdirSync(root)
      .map((name) => ({ name, path: join(root, name) }))
      .filter((e) => statSync(e.path).isDirectory())
      .map((e) => ({ ...e, mtime: statSync(e.path).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const entry of entries) {
      const mp = join(entry.path, "build.manifest.json");
      if (existsSync(mp)) return mp;
    }
    return undefined;
  }

  private spawnVerb(
    verb: LifecycleVerb,
    scriptPath: string,
    extra: {
      mode: "dev" | "release";
      buildDir?: string;
      artifactManifestPath?: string;
      portHint?: number;
    },
  ) {
    const env = buildLifecycleEnv({
      workspace: this.workspace,
      verb,
      mode: extra.mode,
      buildDir: extra.buildDir,
      artifactManifestPath: extra.artifactManifestPath,
      portHint: extra.portHint,
      sessionId: this.sessionId,
      wsUrl: this.wsUrl,
      parentEnv: process.env,
    });

    const proc = spawnScript({
      scriptPath,
      cwd: this.templateDir,
      env,
    });
    this.verbStdin.set(verb, (data) => proc.writeStdin(data));

    const execution: VerbExecution = {
      verb,
      pid: proc.pid,
      startedAt: Date.now(),
      state: "running",
      services: [],
    };
    // Store live execution by reference (not a shallow copy) so marker-driven
    // updates like pendingConfirm are observable while the verb is running.
    if (verb === "dev") this.state.dev = execution;
    if (verb === "build") this.state.lastBuild = execution;
    if (verb === "deploy") this.state.lastDeploy = execution;

    proc.onLine((ev) => {
      if (ev.stream === "stdout") {
        const marker = parseMarker(ev.line);
        if (marker) this.handleMarker(execution, marker);
      }
    });

    proc.onLine((ev) => {
      this.logs.push(verb, { stream: ev.stream, line: ev.line, ts: ev.ts });
    });

    const done = proc.exit.then((res) => {
      this.verbStdin.delete(verb);
      execution.exitedAt = Date.now();
      execution.exitCode = res.code;
      if (execution.state === "running") {
        execution.state = res.code === 0 ? "exited" : "crashed";
      }
      // Mirror final state into the convenience slots.
      if (verb === "build" && this.state.lastBuild) {
        this.state.lastBuild.exitedAt = execution.exitedAt;
        this.state.lastBuild.exitCode = execution.exitCode;
        this.state.lastBuild.state = execution.state;
      }
      if (verb === "deploy" && this.state.lastDeploy) {
        this.state.lastDeploy.exitedAt = execution.exitedAt;
        this.state.lastDeploy.exitCode = execution.exitCode;
        this.state.lastDeploy.state = execution.state;
      }
      return res;
    });

    return { proc, done };
  }

  private handleMarker(execution: VerbExecution, marker: ReturnType<typeof parseMarker>): void {
    if (!marker) return;
    if (marker.kind === "service-ready") {
      const svc: ServiceStatus = {
        name: marker.name,
        url: marker.url,
        startedAt: Date.now(),
      };
      execution.services.push(svc);
    } else if (marker.kind === "ready") {
      this.devReadyResolve?.();
    } else if (marker.kind === "stopping") {
      execution.state = "stopped";
    } else if (marker.kind === "needs-confirm") {
      execution.pendingConfirm = { label: marker.label, at: Date.now() };
    }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}
