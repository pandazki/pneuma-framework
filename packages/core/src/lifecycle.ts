import { randomUUID } from "node:crypto";
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
  AuthorizationDecision,
  AuthorizationTarget,
  Capability,
  Principal,
} from "@pneuma-framework/core-domain";
import type {
  PermissionLedgerDecision,
  PermissionLedgerEvent,
  PermissionLedgerStore,
} from "./permission-ledger.js";
import { permissionLedgerEventId } from "./permission-ledger.js";
import { definitionApplyAuthorizationMetadata } from "./definition-authorization-metadata.js";
import type {
  DefinitionApplyFailureCategory,
  DefinitionApplyPhase,
  DefinitionApplyState,
  DefinitionApplyStatus,
  DefinitionApplyTimelineEntry,
  DefinitionRollbackPrepareFailureCategory,
  DefinitionRollbackPreparePhase,
  DefinitionRollbackPrepareState,
  DefinitionRollbackPrepareStatus,
  DefinitionRollbackPrepareTimelineEntry,
  DefinitionRollbackExecuteFailureCategory,
  DefinitionRollbackExecutePhase,
  DefinitionRollbackExecuteState,
  DefinitionRollbackExecuteStatus,
  DefinitionRollbackExecuteTimelineEntry,
  DiscoveredOperation,
  DiscoveredPolicyRule,
  DiscoveredTable,
  DiscoveredView,
  LifecycleState,
  LifecycleVerb,
  ServiceStatus,
  TemplateManifest,
  VerbExecution,
} from "./types.js";

const READY = Symbol("ready");
const EXITED = Symbol("exited");
const DEFINITION_ROLLBACK_VALIDATE_OPERATION_ID = "definition.rollback.validate";
const DEFINITION_ROLLBACK_EXECUTE_OPERATION_ID = "definition.rollback.execute";

export type FrameworkMutationTool = "definition.apply" | "definition.rollback.execute";

export interface FrameworkApprovedMutationAuthorizationInput {
  readonly tool: FrameworkMutationTool;
  readonly capability: Capability;
  readonly target: AuthorizationTarget;
  readonly prompt_id: string;
}

export type FrameworkApprovedMutationAuthorizationResult =
  | {
      readonly ok: true;
      readonly decision: AuthorizationDecision;
      readonly approval_token_id: string;
    }
  | {
      readonly ok: false;
      readonly decision: AuthorizationDecision;
    };

export type FrameworkApprovedMutationAuthorizer = (
  input: FrameworkApprovedMutationAuthorizationInput,
) => Promise<FrameworkApprovedMutationAuthorizationResult>;

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

export interface MigrateResult {
  exitCode: number;
  direction: "up" | "down";
}

export interface ForkResult {
  exitCode: number;
  /** Absolute path of the newly-populated fork target. */
  targetWorkspace: string;
}

export interface ForkOptions {
  sourceWorkspace: string;
  targetWorkspace: string;
}

export interface AddTableColumnDefinitionApply {
  readonly kind: "add_table_column";
  readonly table_id: string;
  readonly column_name: string;
  readonly cell_type: unknown;
  readonly nullable?: boolean;
  readonly default_value?: unknown;
}

export interface AddTableDefinitionApply {
  readonly kind: "add_table";
  readonly table_id: string;
  readonly columns?: readonly unknown[];
}

export interface AddOperationDefinitionApply {
  readonly kind: "add_operation";
  readonly operation_id: string;
  readonly name?: string;
  readonly description?: string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly handler: unknown;
  readonly ui_binding?: unknown;
  readonly agent_tool?: unknown;
  readonly surface?: unknown;
}

export interface AddViewDefinitionApply {
  readonly kind: "add_view";
  readonly view_id: string;
  readonly name?: string;
  readonly description?: string;
  readonly view_kind: "table" | "list" | "detail" | "custom";
  readonly source: unknown;
  readonly presentation?: unknown;
}

export interface AddPolicyRuleDefinitionApply {
  readonly kind: "add_policy_rule";
  readonly rule_id: string;
  readonly allow: readonly unknown[];
  readonly actions: readonly string[];
  readonly resource: unknown;
  readonly when?: unknown;
}

export type DefinitionApplyChange =
  | AddTableColumnDefinitionApply
  | AddTableDefinitionApply
  | AddOperationDefinitionApply
  | AddViewDefinitionApply
  | AddPolicyRuleDefinitionApply;

export type DefinitionApplyMode = "apply" | "validate";

export interface DefinitionApplyOptions {
  readonly mode?: DefinitionApplyMode;
  readonly requireApproval?: boolean;
  readonly approvedMutationAuthorization?: {
    readonly tool: "definition.apply";
    readonly capability: Capability;
    readonly target: AuthorizationTarget;
    readonly authorize: FrameworkApprovedMutationAuthorizer;
  };
}

export interface RuntimeConfigDiscovery {
  readonly operations: readonly DiscoveredOperation[];
  readonly tables: readonly DiscoveredTable[];
  readonly views: readonly DiscoveredView[];
  readonly policy_rules: readonly DiscoveredPolicyRule[];
}

export interface DefinitionApplyResult {
  readonly change_id: string;
  readonly operation_id: string;
  readonly mode: DefinitionApplyMode;
  readonly status: Exclude<DefinitionApplyStatus, "pending" | "failed">;
  readonly restart_required: boolean;
  readonly before: RuntimeConfigDiscovery;
  readonly after: RuntimeConfigDiscovery;
  readonly diff: {
    readonly changed_tables: ReadonlyArray<{
      readonly table_id: string;
      readonly before_columns: readonly string[];
      readonly after_columns: readonly string[];
      readonly added_columns: readonly string[];
    }>;
    readonly added_tables: ReadonlyArray<{
      readonly table_id: string;
      readonly columns: readonly string[];
    }>;
    readonly added_operations: ReadonlyArray<{
      readonly operation_id: string;
      readonly action: string;
      readonly handler_kind: string;
    }>;
    readonly added_views: ReadonlyArray<{
      readonly view_id: string;
      readonly kind: string;
      readonly source_operation_id: string;
    }>;
    readonly added_policy_rules: ReadonlyArray<{
      readonly rule_id: string;
      readonly actions: readonly string[];
      readonly resource: unknown;
    }>;
  };
  readonly operation_output?: unknown;
  readonly before_definition_version?: number;
  readonly after_definition_version?: number;
  readonly timeline: readonly DefinitionApplyTimelineEntry[];
  readonly authorization?: FrameworkApprovedMutationAuthorizationResult;
  readonly approval?: {
    readonly required: boolean;
    readonly prompt_id?: string;
    readonly decision?: "allow" | "deny" | "allow-always";
  };
}

export interface DefinitionRollbackPrepareInput {
  readonly target_history_version: number;
}

export interface DefinitionRollbackPrepareOptions {
  /**
   * Undefined means follow the runtime validation output. `true` forces an
   * approval prompt even for non-destructive validation; `false` bypasses the
   * prompt and only returns a prepared result.
   */
  readonly requireApproval?: boolean;
}

export interface DefinitionRollbackPrepareResult {
  readonly rollback_id: string;
  readonly operation_id: typeof DEFINITION_ROLLBACK_VALIDATE_OPERATION_ID;
  readonly target_history_version: number;
  readonly status: Exclude<DefinitionRollbackPrepareStatus, "pending" | "failed">;
  readonly validation: Record<string, unknown>;
  readonly destructive: boolean;
  readonly requires_approval: boolean;
  readonly timeline: readonly DefinitionRollbackPrepareTimelineEntry[];
  readonly approval?: {
    readonly required: boolean;
    readonly prompt_id?: string;
    readonly decision?: "allow" | "deny" | "allow-always";
  };
}

export interface DefinitionRollbackExecuteOptions {
  readonly requireApproval?: boolean;
  readonly approvedMutationAuthorization?: {
    readonly tool: "definition.rollback.execute";
    readonly capability: "definition:rollback:execute";
    readonly target: AuthorizationTarget;
    readonly authorize: FrameworkApprovedMutationAuthorizer;
  };
}

export interface DefinitionRollbackExecuteResult {
  readonly rollback_id: string;
  readonly operation_id: typeof DEFINITION_ROLLBACK_EXECUTE_OPERATION_ID;
  readonly target_history_version: number;
  readonly status: Exclude<DefinitionRollbackExecuteStatus, "pending" | "failed">;
  readonly prepare: DefinitionRollbackPrepareResult;
  readonly before: RuntimeConfigDiscovery;
  readonly after: RuntimeConfigDiscovery;
  readonly diff: {
    readonly removed_tables: readonly string[];
    readonly removed_columns: ReadonlyArray<{ table_id: string; column_name: string }>;
    readonly removed_operations: readonly string[];
    readonly removed_views: readonly string[];
  };
  readonly operation_output?: unknown;
  readonly timeline: readonly DefinitionRollbackExecuteTimelineEntry[];
  readonly authorization?: FrameworkApprovedMutationAuthorizationResult;
}

export class DefinitionApplyError extends Error {
  readonly category: DefinitionApplyFailureCategory;
  readonly change_id: string;
  readonly timeline: readonly DefinitionApplyTimelineEntry[];

  constructor(
    category: DefinitionApplyFailureCategory,
    message: string,
    opts: {
      change_id: string;
      timeline: readonly DefinitionApplyTimelineEntry[];
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "DefinitionApplyError";
    this.category = category;
    this.change_id = opts.change_id;
    this.timeline = opts.timeline;
    if (opts.cause !== undefined) {
      (this as { cause?: unknown }).cause = opts.cause;
    }
  }
}

export class DefinitionRollbackPrepareError extends Error {
  readonly category: DefinitionRollbackPrepareFailureCategory;
  readonly rollback_id: string;
  readonly target_history_version: number;
  readonly timeline: readonly DefinitionRollbackPrepareTimelineEntry[];

  constructor(
    category: DefinitionRollbackPrepareFailureCategory,
    message: string,
    opts: {
      rollback_id: string;
      target_history_version: number;
      timeline: readonly DefinitionRollbackPrepareTimelineEntry[];
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "DefinitionRollbackPrepareError";
    this.category = category;
    this.rollback_id = opts.rollback_id;
    this.target_history_version = opts.target_history_version;
    this.timeline = opts.timeline;
    if (opts.cause !== undefined) {
      (this as { cause?: unknown }).cause = opts.cause;
    }
  }
}

export class DefinitionRollbackExecuteError extends Error {
  readonly category: DefinitionRollbackExecuteFailureCategory;
  readonly rollback_id: string;
  readonly target_history_version: number;
  readonly timeline: readonly DefinitionRollbackExecuteTimelineEntry[];

  constructor(
    category: DefinitionRollbackExecuteFailureCategory,
    message: string,
    opts: {
      rollback_id: string;
      target_history_version: number;
      timeline: readonly DefinitionRollbackExecuteTimelineEntry[];
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "DefinitionRollbackExecuteError";
    this.category = category;
    this.rollback_id = opts.rollback_id;
    this.target_history_version = opts.target_history_version;
    this.timeline = opts.timeline;
    if (opts.cause !== undefined) {
      (this as { cause?: unknown }).cause = opts.cause;
    }
  }
}

/**
 * Framework-owned a2v envelopes. Declared locally (instead of importing
 * WireEnvelope from wire-protocol) so the orchestrator stays agnostic about
 * the rest of the wire module.
 */
export interface FrameworkPromptEnvelope {
  dir: "a2v";
  kind: "permission-prompt";
  prompt: { id: string; tool: string; detail: Record<string, unknown> };
}

interface PermissionLedgerBaseDraft {
  readonly schema_version: 1;
  readonly event_id: string;
  readonly at_ms: number;
  readonly prompt_id: string;
  readonly session_id?: string;
  readonly app_id: string;
  readonly workspace_id: string;
  readonly tool: string;
  readonly capability?: Capability;
  readonly target?: AuthorizationTarget;
  readonly target_fingerprint?: string;
}

interface LiveFrameworkPromptLedgerMetadata {
  readonly capability?: Capability;
  readonly target?: AuthorizationTarget;
  readonly target_fingerprint?: string;
}

export type FrameworkEventEnvelope =
  | {
      dir: "a2v";
      kind: "framework-event";
      event: { type: "definition-apply-state"; state: DefinitionApplyState };
    }
  | {
      dir: "a2v";
      kind: "framework-event";
      event: { type: "definition-rollback-prepare-state"; state: DefinitionRollbackPrepareState };
    }
  | {
      dir: "a2v";
      kind: "framework-event";
      event: { type: "definition-rollback-execute-state"; state: DefinitionRollbackExecuteState };
    };

export type DeployPromptEnvelope = FrameworkPromptEnvelope;

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
  private permissionLedgerConfig?: {
    readonly ledger: PermissionLedgerStore;
    readonly appId: string;
    readonly workspaceId: string;
    readonly getRequestedPrincipal?: () => Principal;
  };
  private readonly liveFrameworkPrompts = new Map<string, FrameworkPromptEnvelope>();
  private readonly liveFrameworkPromptLedgerMetadata = new Map<string, LiveFrameworkPromptLedgerMetadata>();
  private readonly permissionLedgerTerminalPromptIds = new Set<string>();
  private _stopInvoked = false;
  private readonly logs = new LogBuffer({ perVerbCap: 2000 });
  private verbStdin = new Map<LifecycleVerb, (data: string) => void>();
  /** Guard: set to true once we've kicked off the /api/config fetch for the current dev cycle. */
  private _operationsFetched = false;

  /** When true, runDeploy skips the unattendedDeploy gate — used by CLI --unattended. */
  allowUnattendedDeploy = false;

  /**
   * Optional callback invoked once per dev cycle after `_fetchOperations` completes
   * successfully and `execution.operations` has been populated.
   * Used by OperationToolBridge to register `op.*` tools without requiring the
   * orchestrator to import tool-layer code.
   */
  onOperationsLoaded?: (operations: readonly DiscoveredOperation[]) => void;

  /**
   * Optional callback invoked when the dev process exits or is stopped
   * (any terminal state: exited / crashed / stopped).
   * Used by OperationToolBridge to clear stale `op.*` tools.
   */
  onDevStopped?: () => void;

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

  setPermissionLedger(config: {
    readonly ledger?: PermissionLedgerStore;
    readonly appId: string;
    readonly workspaceId: string;
    readonly getRequestedPrincipal?: () => Principal;
  }): void {
    this.permissionLedgerConfig = config.ledger
      ? {
          ledger: config.ledger,
          appId: config.appId,
          workspaceId: config.workspaceId,
          getRequestedPrincipal: config.getRequestedPrincipal,
        }
      : undefined;
  }

  liveFrameworkPermissionPromptIds(): ReadonlySet<string> {
    return new Set(this.liveFrameworkPrompts.keys());
  }

  liveFrameworkPermissionPromptEnvelopes(): readonly FrameworkPromptEnvelope[] {
    return [...this.liveFrameworkPrompts.values()];
  }

  runDev(portHint?: number): Promise<void> {
    const scriptPath = this.requireScript("dev");

    // Create the ready promise BEFORE spawning so we don't miss an early ##pneuma:ready.
    this.devReadyPromise = new Promise<void>((res) => {
      this.devReadyResolve = res;
    });
    // Reset the operations-fetch guard so a new dev cycle fetches fresh config.
    this._operationsFetched = false;

    const proc = this.spawnVerb("dev", scriptPath, {
      mode: "dev",
      portHint: portHint ?? this.defaultPortHint,
    });
    // Only reset the stop latch AFTER spawn succeeds — if spawn threw above,
    // the previous cycle's teardown state stays intact.
    this._stopInvoked = false;
    this.devProc = proc.proc;

    return proc.done.then(() => {
      if (this.devProc === proc.proc) this.devProc = undefined;
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
    // Notify bridge synchronously (state.dev.state is already "stopped" here).
    // Note: spawnVerb's done.then also fires onDevStopped when the process exits;
    // calling it here too is deliberate — runStop may run before the process
    // exit event propagates. Both calls are guarded; bridge.clear() is idempotent.
    if (this.onDevStopped) {
      try { this.onDevStopped(); } catch { /* best-effort */ }
    }
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

    // Gate on manifest.backends.defaultConfig.unattendedDeploy.
    // Interpretation:
    //   - defaultConfig absent entirely → treat as unattended (run directly; backward compat).
    //   - defaultConfig present, unattendedDeploy !== true → gated (await resolveConfirm).
    //   - defaultConfig present, unattendedDeploy === true → run directly.
    const defaultConfig = this.manifest.backends?.defaultConfig;
    const unattended =
      this.allowUnattendedDeploy
      || defaultConfig === undefined
      || (defaultConfig as { unattendedDeploy?: unknown }).unattendedDeploy === true;

    if (!unattended) {
      const decision = await this.awaitDeployConfirm();
      if (decision === "no") {
        this.state.lastDeploy = {
          verb: "deploy",
          pid: -1,
          startedAt: Date.now(),
          state: "exited",
          exitedAt: Date.now(),
          exitCode: 3,
          services: [],
        };
        return { exitCode: 3 };
      }
    }

    const proc = this.spawnVerb("deploy", scriptPath, {
      mode: "release",
      artifactManifestPath: manifestPath,
    });
    const result = await proc.done;
    return { exitCode: result.code ?? -1 };
  }

  private awaitDeployConfirm(): Promise<"yes" | "no"> {
    return new Promise((resolve) => {
      const slot: VerbExecution = {
        verb: "deploy",
        pid: -1,
        startedAt: Date.now(),
        state: "running",
        services: [],
        pendingConfirm: { label: "deploy", at: Date.now() },
      };
      this.state.lastDeploy = slot;
      this.deployConfirmResolver = resolve;

      // When a viewer is attached (createPneumaFramework wires the hook),
      // surface the gate as an a2v permission-prompt so <PermissionPrompt>
      // can render a banner and route Allow/Deny back through bridge.ts.
      if (this.permissionPromptPushHook) {
        const id = `pneuma:deploy:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        this.outstandingDeployPromptId = id;
        this.permissionPromptPushHook({
          dir: "a2v",
          kind: "permission-prompt",
          prompt: { id, tool: "deploy", detail: { workspace: this.workspace } },
        });
      }
    });
  }

  private deployConfirmResolver?: (decision: "yes" | "no") => void;
  private permissionPromptPushHook?: (env: FrameworkPromptEnvelope) => void;
  private frameworkEventPushHook?: (env: FrameworkEventEnvelope) => void;
  private outstandingDeployPromptId?: string;
  private definitionApplyApprovalResolver?: (decision: "allow" | "deny" | "allow-always") => void;
  private outstandingDefinitionApplyPromptId?: string;
  private definitionRollbackPrepareApprovalResolver?: (decision: "allow" | "deny" | "allow-always") => void;
  private outstandingDefinitionRollbackPreparePromptId?: string;

  /**
   * Install a broadcaster the orchestrator uses when `runDeploy` is gated —
   * `createPneumaFramework` passes `wireServer.broadcast(sid, env)` here so the
   * deploy gate surfaces as an a2v permission-prompt in any live viewers.
   */
  setDeployPushHook(fn: (env: DeployPromptEnvelope) => void): void {
    this.setPermissionPromptPushHook(fn);
  }

  /**
   * Install a broadcaster for framework-level permission prompts. These prompts
   * are owned by the framework itself (deploy, definition.apply), not by an
   * agent backend tool call.
   */
  setPermissionPromptPushHook(fn: (env: FrameworkPromptEnvelope) => void): void {
    this.permissionPromptPushHook = fn;
  }

  /**
   * Install a broadcaster for framework state transitions. Unlike permission
   * prompts, these are informational protocol events used by viewers to show
   * restart/apply/rollback progress in real time.
   */
  setFrameworkEventPushHook(fn: (env: FrameworkEventEnvelope) => void): void {
    this.frameworkEventPushHook = fn;
  }

  /**
   * Called by the wire-protocol bridge when a viewer answers a permission
   * prompt. Returns true when the id matches the current deploy gate and
   * the orchestrator dispatched its own resolver; false when the response
   * belongs to an agent-backend tool (caller should forward it there).
   */
  handleDeployPermissionResponse(id: string, decision: "allow" | "deny" | "allow-always"): boolean {
    if (id !== this.outstandingDeployPromptId) return false;
    this.outstandingDeployPromptId = undefined;
    void this.resolveConfirm("deploy", "deploy", decision === "deny" ? "no" : "yes");
    return true;
  }

  handleFrameworkPermissionResponse(id: string, decision: "allow" | "deny" | "allow-always"): boolean {
    if (id === this.outstandingDefinitionApplyPromptId && this.definitionApplyApprovalResolver) {
      const resolver = this.definitionApplyApprovalResolver;
      this.definitionApplyApprovalResolver = undefined;
      this.outstandingDefinitionApplyPromptId = undefined;
      this.recordFrameworkPermissionResponse(id, decision);
      resolver(decision);
      return true;
    }
    if (
      id === this.outstandingDefinitionRollbackPreparePromptId
      && this.definitionRollbackPrepareApprovalResolver
    ) {
      const resolver = this.definitionRollbackPrepareApprovalResolver;
      this.definitionRollbackPrepareApprovalResolver = undefined;
      this.outstandingDefinitionRollbackPreparePromptId = undefined;
      this.recordFrameworkPermissionResponse(id, decision);
      resolver(decision);
      return true;
    }
    return this.handleDeployPermissionResponse(id, decision);
  }

  async runSetup(): Promise<SetupResult> {
    const scriptPath = this.requireScript("setup");
    const proc = this.spawnVerb("setup", scriptPath, { mode: "dev" });
    const result = await proc.done;
    return { exitCode: result.code ?? -1 };
  }

  async runMigrate(opts: { direction?: "up" | "down" } = {}): Promise<MigrateResult> {
    const direction = opts.direction ?? "up";
    const scriptPath = this.requireScript("migrate");
    const proc = this.spawnVerb("migrate", scriptPath, {
      mode: "dev",
      migrateDirection: direction,
    });
    const result = await proc.done;
    return { exitCode: result.code ?? -1, direction };
  }

  async runFork(opts: ForkOptions): Promise<ForkResult> {
    const scriptPath = this.requireScript("fork");
    const proc = this.spawnVerb("fork", scriptPath, {
      mode: "dev",
      forkSource: opts.sourceWorkspace,
      forkTarget: opts.targetWorkspace,
    });
    const result = await proc.done;
    return { exitCode: result.code ?? -1, targetWorkspace: opts.targetWorkspace };
  }

  async runDefinitionApply(
    change: DefinitionApplyChange,
    options: DefinitionApplyOptions = {},
  ): Promise<DefinitionApplyResult> {
    const changeId = `def-${randomUUID()}`;
    const mode = options.mode ?? "apply";
    const operationId = operationIdForDefinitionChange(change);
    const timeline: DefinitionApplyTimelineEntry[] = [];
    let approvalDecision: "allow" | "deny" | "allow-always" | undefined;
    let approvalPromptId: string | undefined;

    const mark = (
      phase: DefinitionApplyPhase,
      status: DefinitionApplyStatus = "pending",
      detail?: Record<string, unknown>,
    ) => {
      const event: DefinitionApplyTimelineEntry = { phase, at: Date.now(), detail };
      timeline.push(event);
      this.recordDefinitionApplyState({
        change_id: changeId,
        status,
        phase,
        startedAt: timeline[0]?.at ?? event.at,
        updatedAt: event.at,
        timeline: [...timeline],
      });
    };

    const fail = (
      category: DefinitionApplyFailureCategory,
      message: string,
      cause?: unknown,
    ): never => {
      this.recordPermissionExecutionTerminal(approvalPromptId, "permission_execution_failed", "definition.apply", message);
      mark("failed", "failed", { category, message });
      this.recordDefinitionApplyFailure(changeId, category, message, timeline);
      throw new DefinitionApplyError(category, message, {
        change_id: changeId,
        timeline: [...timeline],
        cause,
      });
    };

    mark("validating");
    const serviceUrlMaybe = this.currentDevServiceUrl();
    if (!serviceUrlMaybe) {
      return fail("validation_failed", "definition.apply requires a running dev service; call lifecycle.dev.start first");
    }
    const serviceUrl = serviceUrlMaybe;

    const before = await this.fetchRuntimeConfig(serviceUrl).catch((err) =>
      fail("validation_failed", `definition.apply could not fetch current app definition: ${(err as Error).message}`, err)
    );
    this.recordRuntimeConfig(before);
    const validationError = validateDefinitionChange(before, change);
    if (validationError) fail("validation_failed", validationError);

    const predictedDiff = diffDefinitionConfigs(before, predictedAfterDefinitionConfig(before, change), change);
    if (mode === "validate") {
      mark("running", "validated", { mode: "validate" });
      return {
        change_id: changeId,
        operation_id: operationId,
        mode,
        status: "validated",
        restart_required: restartRequiredForDefinitionChange(change),
        before,
        after: before,
        diff: predictedDiff,
        timeline: [...timeline],
        approval: { required: false },
      };
    }

    if (options.requireApproval) {
      mark("awaiting-approval");
      const approval = await this.awaitDefinitionApplyApproval(changeId, change, predictedDiff, timeline).catch((err) => {
        if (err instanceof DefinitionApplyError) throw err;
        return fail("approval_unavailable", (err as Error).message, err);
      });
      approvalDecision = approval.decision;
      approvalPromptId = approval.prompt_id;
      this.recordDefinitionApplyState({
        change_id: changeId,
        status: "pending",
        phase: "awaiting-approval",
        startedAt: timeline[0]!.at,
        updatedAt: Date.now(),
        timeline: [...timeline],
        prompt_id: approvalPromptId,
      });
      if (approvalDecision === "deny") {
        mark("denied", "denied", { prompt_id: approvalPromptId });
        return {
          change_id: changeId,
          operation_id: operationId,
          mode,
          status: "denied",
          restart_required: false,
          before,
          after: before,
          diff: { changed_tables: [], added_tables: [], added_operations: [], added_views: [], added_policy_rules: [] },
          timeline: [...timeline],
          approval: {
            required: true,
            prompt_id: approvalPromptId,
            decision: approvalDecision,
          },
        };
      }
    }

    let executionAuthorization: FrameworkApprovedMutationAuthorizationResult | undefined;
    if (approvalDecision && approvalDecision !== "deny" && options.approvedMutationAuthorization && approvalPromptId) {
      executionAuthorization = await options.approvedMutationAuthorization.authorize({
        tool: options.approvedMutationAuthorization.tool,
        capability: options.approvedMutationAuthorization.capability,
        target: options.approvedMutationAuthorization.target,
        prompt_id: approvalPromptId,
      });
      if (!executionAuthorization.ok) {
        fail("approval_denied", authorizationDecisionMessage(executionAuthorization.decision));
      }
    }

    mark("applying-definition");
    const opResult = await this.callDefinitionOperation(serviceUrl, change).catch((err) =>
      fail("operation_failed", (err as Error).message, err)
    );

    mark("stopping-for-definition-apply");
    try {
      await this.runStop();
    } catch (err) {
      fail("restart_failed", `definition.apply failed while stopping dev: ${(err as Error).message}`, err);
    }

    mark("starting-after-definition-apply");
    const running = (() => {
      try {
        return this.runDev();
      } catch (err) {
        return fail("restart_failed", `definition.apply failed to start dev: ${(err as Error).message}`, err);
      }
    })();
    const first = await Promise.race([
      this.awaitDevReady().then(() => READY),
      running.then(() => EXITED),
    ]);
    if (first === EXITED) {
      const code = this.state.dev?.exitCode ?? -1;
      fail("restart_failed", `definition.apply restart failed: dev exited before ready (exit code ${code})`);
    }

    const restartedServiceUrlMaybe = this.currentDevServiceUrl();
    if (!restartedServiceUrlMaybe) {
      return fail("restart_failed", "definition.apply restart did not report a service-ready URL");
    }
    const restartedServiceUrl = restartedServiceUrlMaybe;

    mark("refreshing-definition");
    const after = await this.fetchRuntimeConfig(restartedServiceUrl).catch((err) =>
      fail("schema_refresh_failed", `definition.apply could not refresh app definition: ${(err as Error).message}`, err)
    );
    this.recordRuntimeConfig(after);
    const diff = diffDefinitionConfigs(before, after, change);
    if (!diffContainsChange(diff, change)) {
      fail("diff_mismatch", diffMismatchMessage(change));
    }

    mark("running", "applied");
    this.recordPermissionExecutionTerminal(approvalPromptId, "permission_execution_completed", "definition.apply");

    return {
      change_id: changeId,
      operation_id: operationId,
      mode,
      status: "applied",
      restart_required: restartRequiredForDefinitionChange(change),
      before,
      after,
      diff,
      operation_output: opResult.output,
      after_definition_version: extractDefinitionVersion(opResult.output),
      timeline: [...timeline],
      authorization: executionAuthorization,
      approval: {
        required: options.requireApproval === true,
        prompt_id: approvalPromptId,
        decision: approvalDecision,
      },
    };
  }

  async runDefinitionRollbackPrepare(
    input: DefinitionRollbackPrepareInput,
    options: DefinitionRollbackPrepareOptions = {},
  ): Promise<DefinitionRollbackPrepareResult> {
    const rollbackId = `rollback-${randomUUID()}`;
    const targetHistoryVersion = input.target_history_version;
    const timeline: DefinitionRollbackPrepareTimelineEntry[] = [];
    let approvalDecision: "allow" | "deny" | "allow-always" | undefined;
    let approvalPromptId: string | undefined;

    const mark = (
      phase: DefinitionRollbackPreparePhase,
      status: DefinitionRollbackPrepareStatus = "pending",
      detail?: Record<string, unknown>,
    ) => {
      const event: DefinitionRollbackPrepareTimelineEntry = { phase, at: Date.now(), detail };
      timeline.push(event);
      this.recordDefinitionRollbackPrepareState({
        rollback_id: rollbackId,
        target_history_version: targetHistoryVersion,
        status,
        phase,
        startedAt: timeline[0]?.at ?? event.at,
        updatedAt: event.at,
        timeline: [...timeline],
      });
    };

    const fail = (
      category: DefinitionRollbackPrepareFailureCategory,
      message: string,
      cause?: unknown,
    ): never => {
      this.recordPermissionExecutionTerminal(
        approvalPromptId,
        "permission_execution_failed",
        DEFINITION_ROLLBACK_VALIDATE_OPERATION_ID,
        message,
      );
      mark("failed", "failed", { category, message });
      this.recordDefinitionRollbackPrepareFailure(
        rollbackId,
        targetHistoryVersion,
        category,
        message,
        timeline,
      );
      throw new DefinitionRollbackPrepareError(category, message, {
        rollback_id: rollbackId,
        target_history_version: targetHistoryVersion,
        timeline: [...timeline],
        cause,
      });
    };

    mark("validating");
    if (!Number.isInteger(targetHistoryVersion) || targetHistoryVersion < 0) {
      fail("validation_failed", "definition.rollback.prepare requires a non-negative integer target_history_version");
    }

    const serviceUrlMaybe = this.currentDevServiceUrl();
    if (!serviceUrlMaybe) {
      return fail(
        "validation_failed",
        "definition.rollback.prepare requires a running dev service; call lifecycle.dev.start first",
      );
    }
    const serviceUrl = serviceUrlMaybe;

    const validationResult = await this.callDefinitionRollbackValidate(serviceUrl, targetHistoryVersion).catch((err) =>
      fail("operation_failed", (err as Error).message, err)
    );
    const validation = objectOutputOrError(validationResult.output);
    if (!validation) {
      return fail("operation_failed", "definition.rollback.validate returned a non-object output");
    }

    const destructive = validation.destructive === true;
    const requiresApprovalFromValidation = validation.requires_approval === true || destructive;
    const approvalRequired = options.requireApproval ?? requiresApprovalFromValidation;

    if (approvalRequired) {
      mark("awaiting-approval");
      const approval = await this.awaitDefinitionRollbackPrepareApproval(
        rollbackId,
        targetHistoryVersion,
        validation,
        timeline,
      ).catch((err) => {
        if (err instanceof DefinitionRollbackPrepareError) throw err;
        return fail("approval_unavailable", (err as Error).message, err);
      });
      approvalDecision = approval.decision;
      approvalPromptId = approval.prompt_id;
      this.recordDefinitionRollbackPrepareState({
        rollback_id: rollbackId,
        target_history_version: targetHistoryVersion,
        status: "pending",
        phase: "awaiting-approval",
        startedAt: timeline[0]!.at,
        updatedAt: Date.now(),
        timeline: [...timeline],
        prompt_id: approvalPromptId,
      });
      if (approvalDecision === "deny") {
        mark("denied", "denied", { prompt_id: approvalPromptId });
        return {
          rollback_id: rollbackId,
          operation_id: DEFINITION_ROLLBACK_VALIDATE_OPERATION_ID,
          target_history_version: targetHistoryVersion,
          status: "denied",
          validation,
          destructive,
          requires_approval: requiresApprovalFromValidation,
          timeline: [...timeline],
          approval: {
            required: true,
            prompt_id: approvalPromptId,
            decision: approvalDecision,
          },
        };
      }
    }

    mark("ready-to-execute", "ready_to_execute", {
      operation_id: DEFINITION_ROLLBACK_VALIDATE_OPERATION_ID,
      approval_required: approvalRequired,
    });
    this.recordPermissionExecutionTerminal(
      approvalPromptId,
      "permission_execution_completed",
      DEFINITION_ROLLBACK_VALIDATE_OPERATION_ID,
    );
    return {
      rollback_id: rollbackId,
      operation_id: DEFINITION_ROLLBACK_VALIDATE_OPERATION_ID,
      target_history_version: targetHistoryVersion,
      status: "ready_to_execute",
      validation,
      destructive,
      requires_approval: requiresApprovalFromValidation,
      timeline: [...timeline],
      approval: {
        required: approvalRequired,
        prompt_id: approvalPromptId,
        decision: approvalDecision,
      },
    };
  }

  async runDefinitionRollbackExecute(
    input: DefinitionRollbackPrepareInput,
    options: DefinitionRollbackExecuteOptions = {},
  ): Promise<DefinitionRollbackExecuteResult> {
    let rollbackId = `rollback-exec-${randomUUID()}`;
    const targetHistoryVersion = input.target_history_version;
    const timeline: DefinitionRollbackExecuteTimelineEntry[] = [];

    const mark = (
      phase: DefinitionRollbackExecutePhase,
      status: DefinitionRollbackExecuteStatus = "pending",
      detail?: Record<string, unknown>,
    ) => {
      const event: DefinitionRollbackExecuteTimelineEntry = { phase, at: Date.now(), detail };
      timeline.push(event);
      this.recordDefinitionRollbackExecuteState({
        rollback_id: rollbackId,
        target_history_version: targetHistoryVersion,
        status,
        phase,
        startedAt: timeline[0]?.at ?? event.at,
        updatedAt: event.at,
        timeline: [...timeline],
      });
    };

    const fail = (
      category: DefinitionRollbackExecuteFailureCategory,
      message: string,
      cause?: unknown,
    ): never => {
      mark("failed", "failed", { category, message });
      this.recordDefinitionRollbackExecuteFailure(
        rollbackId,
        targetHistoryVersion,
        category,
        message,
        timeline,
      );
      throw new DefinitionRollbackExecuteError(category, message, {
        rollback_id: rollbackId,
        target_history_version: targetHistoryVersion,
        timeline: [...timeline],
        cause,
      });
    };

    mark("preparing");
    const serviceUrlMaybe = this.currentDevServiceUrl();
    if (!serviceUrlMaybe) {
      return fail(
        "prepare_failed",
        "definition.rollback.execute requires a running dev service; call lifecycle.dev.start first",
      );
    }
    const serviceUrl = serviceUrlMaybe;
    const before = await this.fetchRuntimeConfig(serviceUrl).catch((err) =>
      fail("prepare_failed", `definition.rollback.execute could not fetch current app definition: ${(err as Error).message}`, err)
    );
    this.recordRuntimeConfig(before);

    let prepare: DefinitionRollbackPrepareResult;
    try {
      prepare = await this.runDefinitionRollbackPrepare(input, { requireApproval: options.requireApproval });
    } catch (err) {
      if (err instanceof DefinitionRollbackPrepareError) {
        rollbackId = err.rollback_id;
        return fail("prepare_failed", err.message, err);
      }
      return fail("prepare_failed", (err as Error).message, err);
    }
    rollbackId = prepare.rollback_id;
    if (prepare.status === "denied") {
      mark("denied", "denied", { prepare_status: prepare.status });
      return {
        rollback_id: rollbackId,
        operation_id: DEFINITION_ROLLBACK_EXECUTE_OPERATION_ID,
        target_history_version: targetHistoryVersion,
        status: "denied",
        prepare,
        before,
        after: before,
        diff: { removed_tables: [], removed_columns: [], removed_operations: [], removed_views: [] },
        timeline: [...timeline],
      };
    }

    let executionAuthorization: FrameworkApprovedMutationAuthorizationResult | undefined;
    if (
      prepare.approval?.decision
      && prepare.approval.decision !== "deny"
      && prepare.approval.prompt_id
      && options.approvedMutationAuthorization
    ) {
      executionAuthorization = await options.approvedMutationAuthorization.authorize({
        tool: options.approvedMutationAuthorization.tool,
        capability: options.approvedMutationAuthorization.capability,
        target: options.approvedMutationAuthorization.target,
        prompt_id: prepare.approval.prompt_id,
      });
      if (!executionAuthorization.ok) {
        fail("approval_denied", authorizationDecisionMessage(executionAuthorization.decision));
      }
    }

    const expectedRemovedTables = removedTablesFromRollbackValidation(prepare.validation);
    const expectedRemovedColumns = removedColumnsFromRollbackValidation(prepare.validation);
    const expectedRemovedOperations = removedOperationsFromRollbackValidation(prepare.validation);
    const expectedRemovedViews = removedViewsFromRollbackValidation(prepare.validation);
    mark("executing-rollback", "pending", {
      operation_id: DEFINITION_ROLLBACK_EXECUTE_OPERATION_ID,
      expected_removed_tables: expectedRemovedTables,
      expected_removed_columns: expectedRemovedColumns,
      expected_removed_operations: expectedRemovedOperations,
      expected_removed_views: expectedRemovedViews,
    });
    const opResult = await this.callDefinitionRollbackExecute(serviceUrl, targetHistoryVersion).catch((err) =>
      fail("operation_failed", (err as Error).message, err)
    );

    mark("stopping-after-rollback");
    try {
      await this.runStop();
    } catch (err) {
      fail("restart_failed", `definition.rollback.execute failed while stopping dev: ${(err as Error).message}`, err);
    }

    mark("starting-after-rollback");
    const running = (() => {
      try {
        return this.runDev();
      } catch (err) {
        return fail("restart_failed", `definition.rollback.execute failed to start dev: ${(err as Error).message}`, err);
      }
    })();
    const first = await Promise.race([
      this.awaitDevReady().then(() => READY),
      running.then(() => EXITED),
    ]);
    if (first === EXITED) {
      const code = this.state.dev?.exitCode ?? -1;
      fail("restart_failed", `definition.rollback.execute restart failed: dev exited before ready (exit code ${code})`);
    }

    const restartedServiceUrlMaybe = this.currentDevServiceUrl();
    if (!restartedServiceUrlMaybe) {
      return fail("restart_failed", "definition.rollback.execute restart did not report a service-ready URL");
    }

    mark("refreshing-definition");
    const after = await this.fetchRuntimeConfig(restartedServiceUrlMaybe).catch((err) =>
      fail(
        "schema_refresh_failed",
        `definition.rollback.execute could not refresh app definition: ${(err as Error).message}`,
        err,
      )
    );
    this.recordRuntimeConfig(after);
    const stillPresent = expectedRemovedTables.filter((table_id) =>
      after.tables.some((table) => table.id === table_id)
    );
    if (stillPresent.length > 0) {
      fail("verification_failed", `definition.rollback.execute did not remove table(s): ${stillPresent.join(", ")}`);
    }
    const columnsStillPresent = expectedRemovedColumns.filter(({ table_id, column_name }) => {
      const table = after.tables.find((candidate) => candidate.id === table_id);
      return table?.columns.some((column) => column.name === column_name) === true;
    });
    if (columnsStillPresent.length > 0) {
      fail(
        "verification_failed",
        `definition.rollback.execute did not remove column(s): ${columnsStillPresent.map((column) => `${column.table_id}.${column.column_name}`).join(", ")}`,
      );
    }
    const operationsStillPresent = expectedRemovedOperations.filter((operation_id) =>
      after.operations.some((operation) => operation.id === operation_id)
    );
    if (operationsStillPresent.length > 0) {
      fail("verification_failed", `definition.rollback.execute did not remove operation(s): ${operationsStillPresent.join(", ")}`);
    }
    const viewsStillPresent = expectedRemovedViews.filter((view_id) =>
      after.views.some((view) => view.id === view_id)
    );
    if (viewsStillPresent.length > 0) {
      fail("verification_failed", `definition.rollback.execute did not remove view(s): ${viewsStillPresent.join(", ")}`);
    }

    const status = rollbackExecuteOutputStatus(opResult.output);
    mark("running", status);

    return {
      rollback_id: rollbackId,
      operation_id: DEFINITION_ROLLBACK_EXECUTE_OPERATION_ID,
      target_history_version: targetHistoryVersion,
      status,
      prepare,
      before,
      after,
      diff: {
        removed_tables: expectedRemovedTables,
        removed_columns: expectedRemovedColumns,
        removed_operations: expectedRemovedOperations,
        removed_views: expectedRemovedViews,
      },
      operation_output: opResult.output,
      timeline: [...timeline],
      authorization: executionAuthorization,
    };
  }

  getLogs(opts: GetLinesOpts): LogLine[] {
    return this.logs.getLines(opts);
  }

  async resolveConfirm(verb: LifecycleVerb, label: string, decision: "yes" | "no"): Promise<void> {
    // Orchestrator-side gate: runDeploy() with gated manifest registers a synthetic
    // pendingConfirm on state.lastDeploy and parks on deployConfirmResolver. Resolving
    // it here does NOT involve stdin — the script hasn't been spawned yet.
    if (verb === "deploy" && label === "deploy" && this.deployConfirmResolver) {
      const resolver = this.deployConfirmResolver;
      this.deployConfirmResolver = undefined;
      const slot = this.state.lastDeploy;
      if (slot) slot.pendingConfirm = undefined;
      resolver(decision);
      return;
    }

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
      migrateDirection?: "up" | "down";
      forkSource?: string;
      forkTarget?: string;
    },
  ) {
    const env = buildLifecycleEnv({
      workspace: this.workspace,
      verb,
      mode: extra.mode,
      buildDir: extra.buildDir,
      artifactManifestPath: extra.artifactManifestPath,
      portHint: extra.portHint,
      migrateDirection: extra.migrateDirection,
      forkSource: extra.forkSource,
      forkTarget: extra.forkTarget,
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
      // Notify bridge that dev has stopped so op.* tools can be cleared.
      if (verb === "dev" && this.onDevStopped) {
        try { this.onDevStopped(); } catch { /* best-effort */ }
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

      // After the first service-ready for the dev verb, fetch /api/config once.
      // We use the URL of the first service whose name contains "app" (or falls
      // back to the very first HTTP service). Do it exactly once per dev cycle.
      // TODO: if multiple HTTP-app services exist, a `kind: "http-app"` manifest
      // field in the service descriptor would make this more precise.
      if (execution.verb === "dev" && !this._operationsFetched) {
        this._operationsFetched = true;
        void this._fetchOperations(execution, svc.url);
      }
    } else if (marker.kind === "ready") {
      this.devReadyResolve?.();
    } else if (marker.kind === "stopping") {
      execution.state = "stopped";
    } else if (marker.kind === "needs-confirm") {
      execution.pendingConfirm = { label: marker.label, at: Date.now() };
    }
  }

  private recordDefinitionApplyState(state: DefinitionApplyState): void {
    this.state.definitionApply = state;
    if (state.status !== "failed") {
      this.frameworkEventPushHook?.({
        dir: "a2v",
        kind: "framework-event",
        event: { type: "definition-apply-state", state },
      });
    }
  }

  private recordDefinitionApplyFailure(
    changeId: string,
    category: DefinitionApplyFailureCategory,
    message: string,
    timeline: readonly DefinitionApplyTimelineEntry[],
  ): void {
    const now = Date.now();
    this.state.definitionApply = {
      change_id: changeId,
      status: "failed",
      phase: "failed",
      startedAt: timeline[0]?.at ?? now,
      updatedAt: now,
      timeline: [...timeline],
      failure: { category, message },
    };
    this.frameworkEventPushHook?.({
      dir: "a2v",
      kind: "framework-event",
      event: { type: "definition-apply-state", state: this.state.definitionApply },
    });
  }

  private recordDefinitionRollbackPrepareState(state: DefinitionRollbackPrepareState): void {
    this.state.definitionRollbackPrepare = state;
    if (state.status !== "failed") {
      this.frameworkEventPushHook?.({
        dir: "a2v",
        kind: "framework-event",
        event: { type: "definition-rollback-prepare-state", state },
      });
    }
  }

  private recordDefinitionRollbackPrepareFailure(
    rollbackId: string,
    targetHistoryVersion: number,
    category: DefinitionRollbackPrepareFailureCategory,
    message: string,
    timeline: readonly DefinitionRollbackPrepareTimelineEntry[],
  ): void {
    const now = Date.now();
    this.state.definitionRollbackPrepare = {
      rollback_id: rollbackId,
      target_history_version: targetHistoryVersion,
      status: "failed",
      phase: "failed",
      startedAt: timeline[0]?.at ?? now,
      updatedAt: now,
      timeline: [...timeline],
      failure: { category, message },
    };
    this.frameworkEventPushHook?.({
      dir: "a2v",
      kind: "framework-event",
      event: { type: "definition-rollback-prepare-state", state: this.state.definitionRollbackPrepare },
    });
  }

  private recordDefinitionRollbackExecuteState(state: DefinitionRollbackExecuteState): void {
    this.state.definitionRollbackExecute = state;
    if (state.status !== "failed") {
      this.frameworkEventPushHook?.({
        dir: "a2v",
        kind: "framework-event",
        event: { type: "definition-rollback-execute-state", state },
      });
    }
  }

  private recordDefinitionRollbackExecuteFailure(
    rollbackId: string,
    targetHistoryVersion: number,
    category: DefinitionRollbackExecuteFailureCategory,
    message: string,
    timeline: readonly DefinitionRollbackExecuteTimelineEntry[],
  ): void {
    const now = Date.now();
    this.state.definitionRollbackExecute = {
      rollback_id: rollbackId,
      target_history_version: targetHistoryVersion,
      status: "failed",
      phase: "failed",
      startedAt: timeline[0]?.at ?? now,
      updatedAt: now,
      timeline: [...timeline],
      failure: { category, message },
    };
    this.frameworkEventPushHook?.({
      dir: "a2v",
      kind: "framework-event",
      event: { type: "definition-rollback-execute-state", state: this.state.definitionRollbackExecute },
    });
  }

  private async appendRequiredPermissionLedgerEvent(event: PermissionLedgerEvent): Promise<void> {
    if (!this.permissionLedgerConfig) return;
    await Promise.resolve(this.permissionLedgerConfig.ledger.append(event));
  }

  private appendBestEffortPermissionLedgerEvent(event: PermissionLedgerEvent): void {
    try {
      const result = this.permissionLedgerConfig?.ledger.append(event);
      if (result && typeof (result as Promise<void>).catch === "function") {
        void (result as Promise<void>).catch(() => {});
      }
    } catch {
      // Response routing must not crash after the Builder has acted.
    }
  }

  private permissionLedgerBase(input: {
    readonly prompt_id: string;
    readonly tool: string;
    readonly capability?: Capability;
    readonly target?: AuthorizationTarget;
    readonly target_fingerprint?: string;
  }): PermissionLedgerBaseDraft | undefined {
    const cfg = this.permissionLedgerConfig;
    if (!cfg) return undefined;
    return {
      schema_version: 1,
      event_id: permissionLedgerEventId(),
      at_ms: Date.now(),
      prompt_id: input.prompt_id,
      session_id: this.sessionId,
      app_id: cfg.appId,
      workspace_id: cfg.workspaceId,
      tool: input.tool,
      capability: input.capability,
      target: input.target,
      target_fingerprint: input.target_fingerprint ?? input.target?.fingerprint,
    };
  }

  private async recordFrameworkPermissionRequest(input: {
    readonly envelope: FrameworkPromptEnvelope;
    readonly capability: Capability;
    readonly target: AuthorizationTarget;
  }): Promise<void> {
    const base = this.permissionLedgerBase({
      prompt_id: input.envelope.prompt.id,
      tool: input.envelope.prompt.tool,
      capability: input.capability,
      target: input.target,
    });
    if (!base) return;
    await this.appendRequiredPermissionLedgerEvent({
      ...base,
      event_type: "permission_requested",
      requested_principal: this.permissionLedgerConfig?.getRequestedPrincipal?.(),
      detail: input.envelope.prompt.detail,
    });
  }

  private rememberLiveFrameworkPrompt(input: {
    readonly envelope: FrameworkPromptEnvelope;
    readonly capability: Capability;
    readonly target: AuthorizationTarget;
  }): void {
    this.liveFrameworkPrompts.set(input.envelope.prompt.id, input.envelope);
    this.liveFrameworkPromptLedgerMetadata.set(input.envelope.prompt.id, {
      capability: input.capability,
      target: input.target,
      target_fingerprint: input.target.fingerprint,
    });
  }

  private recordFrameworkPermissionResponse(id: string, decision: PermissionLedgerDecision): void {
    const env = this.liveFrameworkPrompts.get(id);
    if (!env) return;
    const metadata = this.liveFrameworkPromptLedgerMetadata.get(id);
    const base = this.permissionLedgerBase({
      prompt_id: id,
      tool: env.prompt.tool,
      capability: metadata?.capability,
      target: metadata?.target,
      target_fingerprint: metadata?.target_fingerprint,
    });
    if (base) {
      this.appendBestEffortPermissionLedgerEvent({
        ...base,
        event_type: "permission_responded",
        decision,
        decided_by: { kind: "builder", id: "builder:default" },
      });
    }
    this.liveFrameworkPrompts.delete(id);
    if (decision === "deny") {
      this.liveFrameworkPromptLedgerMetadata.delete(id);
    }
  }

  private recordPermissionExecutionTerminal(
    promptId: string | undefined,
    eventType: "permission_execution_completed" | "permission_execution_failed",
    tool: "definition.apply" | "definition.rollback.execute" | "definition.rollback.validate",
    message?: string,
  ): void {
    if (!promptId) return;
    if (this.permissionLedgerTerminalPromptIds.has(promptId)) return;
    const env = this.liveFrameworkPrompts.get(promptId);
    const metadata = this.liveFrameworkPromptLedgerMetadata.get(promptId);
    const base = this.permissionLedgerBase({
      prompt_id: promptId,
      tool: env?.prompt.tool ?? tool,
      capability: metadata?.capability,
      target: metadata?.target,
      target_fingerprint: metadata?.target_fingerprint,
    });
    if (!base) {
      this.clearFrameworkPromptSetup(promptId);
      return;
    }
    this.permissionLedgerTerminalPromptIds.add(promptId);
    this.appendBestEffortPermissionLedgerEvent(eventType === "permission_execution_completed"
      ? { ...base, event_type: "permission_execution_completed" }
      : { ...base, event_type: "permission_execution_failed", message: message ?? "Framework permission execution failed" });
    this.liveFrameworkPrompts.delete(promptId);
    this.liveFrameworkPromptLedgerMetadata.delete(promptId);
  }

  private clearFrameworkPromptSetup(promptId: string): void {
    this.liveFrameworkPrompts.delete(promptId);
    this.liveFrameworkPromptLedgerMetadata.delete(promptId);
    this.permissionLedgerTerminalPromptIds.delete(promptId);
  }

  private async awaitDefinitionApplyApproval(
    changeId: string,
    change: DefinitionApplyChange,
    diff: DefinitionApplyResult["diff"],
    timeline: readonly DefinitionApplyTimelineEntry[],
  ): Promise<{ prompt_id: string; decision: "allow" | "deny" | "allow-always" }> {
    if (!this.permissionPromptPushHook) {
      const message = "definition.apply requires approval, but no framework permission prompt hook is installed";
      this.recordDefinitionApplyFailure(changeId, "approval_unavailable", message, timeline);
      throw new DefinitionApplyError("approval_unavailable", message, {
        change_id: changeId,
        timeline: [...timeline],
      });
    }
    const promptId = `pneuma:definition-apply:${changeId}`;
    const current = this.state.definitionApply;
    if (current?.change_id === changeId) {
      this.recordDefinitionApplyState({
        ...current,
        prompt_id: promptId,
        updatedAt: Date.now(),
      });
    }
    const operationId = operationIdForDefinitionChange(change);
    const ledgerMetadata = definitionApplyAuthorizationMetadata(change);
    const envelope: FrameworkPromptEnvelope = {
      dir: "a2v",
      kind: "permission-prompt",
      prompt: {
        id: promptId,
        tool: "definition.apply",
        detail: {
          change_id: changeId,
          operation_id: operationId,
          change,
          impact: diff,
          restart_required: restartRequiredForDefinitionChange(change),
        },
      },
    };
    await this.recordFrameworkPermissionRequest({
      envelope,
      capability: ledgerMetadata.capability,
      target: ledgerMetadata.target,
    });
    this.outstandingDefinitionApplyPromptId = promptId;
    const decisionPromise = new Promise<"allow" | "deny" | "allow-always">((resolve) => {
      this.definitionApplyApprovalResolver = resolve;
    });
    this.rememberLiveFrameworkPrompt({
      envelope,
      capability: ledgerMetadata.capability,
      target: ledgerMetadata.target,
    });
    try {
      this.permissionPromptPushHook(envelope);
    } catch (err) {
      this.definitionApplyApprovalResolver = undefined;
      this.outstandingDefinitionApplyPromptId = undefined;
      this.recordPermissionExecutionTerminal(
        promptId,
        "permission_execution_failed",
        "definition.apply",
        (err as Error).message,
      );
      throw err;
    }
    const decision = await decisionPromise;
    return { prompt_id: promptId, decision };
  }

  private async awaitDefinitionRollbackPrepareApproval(
    rollbackId: string,
    targetHistoryVersion: number,
    validation: Record<string, unknown>,
    timeline: readonly DefinitionRollbackPrepareTimelineEntry[],
  ): Promise<{ prompt_id: string; decision: "allow" | "deny" | "allow-always" }> {
    if (!this.permissionPromptPushHook) {
      const message = "definition.rollback.prepare requires approval, but no framework permission prompt hook is installed";
      this.recordDefinitionRollbackPrepareFailure(
        rollbackId,
        targetHistoryVersion,
        "approval_unavailable",
        message,
        timeline,
      );
      throw new DefinitionRollbackPrepareError("approval_unavailable", message, {
        rollback_id: rollbackId,
        target_history_version: targetHistoryVersion,
        timeline: [...timeline],
      });
    }
    const promptId = `pneuma:definition-rollback:${rollbackId}`;
    const current = this.state.definitionRollbackPrepare;
    if (current?.rollback_id === rollbackId) {
      this.recordDefinitionRollbackPrepareState({
        ...current,
        prompt_id: promptId,
        updatedAt: Date.now(),
      });
    }
    const target: AuthorizationTarget = {
      kind: "rollback_target",
      id: `definition.rollback:${targetHistoryVersion}`,
      fingerprint: `definition.rollback:${targetHistoryVersion}`,
    };
    const envelope: FrameworkPromptEnvelope = {
      dir: "a2v",
      kind: "permission-prompt",
      prompt: {
        id: promptId,
        tool: DEFINITION_ROLLBACK_VALIDATE_OPERATION_ID,
        detail: {
          rollback_id: rollbackId,
          operation_id: DEFINITION_ROLLBACK_VALIDATE_OPERATION_ID,
          ...validation,
        },
      },
    };
    await this.recordFrameworkPermissionRequest({
      envelope,
      capability: "definition:rollback:execute",
      target,
    });
    this.outstandingDefinitionRollbackPreparePromptId = promptId;
    const decisionPromise = new Promise<"allow" | "deny" | "allow-always">((resolve) => {
      this.definitionRollbackPrepareApprovalResolver = resolve;
    });
    this.rememberLiveFrameworkPrompt({ envelope, capability: "definition:rollback:execute", target });
    try {
      this.permissionPromptPushHook(envelope);
    } catch (err) {
      this.definitionRollbackPrepareApprovalResolver = undefined;
      this.outstandingDefinitionRollbackPreparePromptId = undefined;
      this.recordPermissionExecutionTerminal(
        promptId,
        "permission_execution_failed",
        DEFINITION_ROLLBACK_VALIDATE_OPERATION_ID,
        (err as Error).message,
      );
      throw err;
    }
    const decision = await decisionPromise;
    return { prompt_id: promptId, decision };
  }

  /**
   * Fetches `/api/config` from the running template server and stores the
   * operations array in the execution state. Non-fatal: any failure is
   * recorded in `operations_fetch_error` and dev mode continues normally.
   * Called at most once per dev cycle (guarded by `_operationsFetched`).
   */
  private async _fetchOperations(execution: VerbExecution, serviceUrl: string): Promise<void> {
    try {
      const config = await this.fetchRuntimeConfig(serviceUrl);
      this.recordRuntimeConfig(config, execution);
    } catch (e) {
      execution.operations_fetch_error = e instanceof Error ? e.message : String(e);
    }
  }

  private async fetchRuntimeConfig(serviceUrl: string): Promise<RuntimeConfigDiscovery> {
    const url = `${new URL(serviceUrl).origin}/api/config`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = (await res.json()) as { operations?: unknown; tables?: unknown; views?: unknown; policy_rules?: unknown };
    return {
      operations: Array.isArray(data.operations) ? data.operations as readonly DiscoveredOperation[] : [],
      tables: Array.isArray(data.tables) ? data.tables as readonly DiscoveredTable[] : [],
      views: Array.isArray(data.views) ? data.views as readonly DiscoveredView[] : [],
      policy_rules: Array.isArray(data.policy_rules) ? data.policy_rules as readonly DiscoveredPolicyRule[] : [],
    };
  }

  private recordRuntimeConfig(config: RuntimeConfigDiscovery, execution: VerbExecution | undefined = this.state.dev): void {
    if (!execution) return;
    execution.operations = config.operations;
    execution.tables = config.tables;
    execution.views = config.views;
    execution.policy_rules = config.policy_rules;
    execution.operations_fetch_error = undefined;
    if (this.onOperationsLoaded) {
      try { this.onOperationsLoaded(execution.operations); } catch { /* best-effort */ }
    }
  }

  private currentDevServiceUrl(): string | undefined {
    return this.state.dev?.services[0]?.url;
  }

  private async callDefinitionOperation(serviceUrl: string, change: DefinitionApplyChange): Promise<{ output: unknown }> {
    const url = `${new URL(serviceUrl).origin}/api/operations/${encodeURIComponent(operationIdForDefinitionChange(change))}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: inputForDefinitionChange(change) }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`definition.apply operation returned HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const body = await res.json().catch(() => undefined) as { output?: unknown } | undefined;
    return { output: body?.output };
  }

  private async callDefinitionRollbackValidate(
    serviceUrl: string,
    targetHistoryVersion: number,
  ): Promise<{ output: unknown }> {
    const url = `${new URL(serviceUrl).origin}/api/operations/${encodeURIComponent(DEFINITION_ROLLBACK_VALIDATE_OPERATION_ID)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: { target_history_version: targetHistoryVersion } }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`definition.rollback.validate returned HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const body = await res.json().catch(() => undefined) as { output?: unknown } | undefined;
    return { output: body?.output };
  }

  private async callDefinitionRollbackExecute(
    serviceUrl: string,
    targetHistoryVersion: number,
  ): Promise<{ output: unknown }> {
    const url = `${new URL(serviceUrl).origin}/api/operations/${encodeURIComponent(DEFINITION_ROLLBACK_EXECUTE_OPERATION_ID)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pneuma-user-id": "framework",
      },
      body: JSON.stringify({
        input: { target_history_version: targetHistoryVersion },
        confirmed: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`definition.rollback.execute returned HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const body = await res.json().catch(() => undefined) as { output?: unknown } | undefined;
    return { output: body?.output };
  }
}

function operationIdForDefinitionChange(change: DefinitionApplyChange): string {
  if (change.kind === "add_table") return "add_table";
  if (change.kind === "add_table_column") return "add_table_column";
  if (change.kind === "add_operation") return "add_operation";
  if (change.kind === "add_view") return "add_view";
  if (change.kind === "add_policy_rule") return "add_policy_rule";
  return "";
}

function restartRequiredForDefinitionChange(change: DefinitionApplyChange): boolean {
  if (change.kind === "add_table") return true;
  if (change.kind === "add_table_column") return true;
  if (change.kind === "add_operation") return true;
  if (change.kind === "add_view") return true;
  if (change.kind === "add_policy_rule") return true;
  return true;
}

function validateDefinitionChange(
  config: RuntimeConfigDiscovery,
  change: DefinitionApplyChange,
): string | undefined {
  if (change.kind === "add_table") {
    if (typeof change.table_id !== "string" || change.table_id.length === 0) {
      return "definition.apply validation failed: table_id must be a non-empty string";
    }
    if (config.tables.some((t) => t.id === change.table_id)) {
      return `definition.apply validation failed: table '${change.table_id}' already exists`;
    }
    const columns = change.columns ?? [];
    if (!Array.isArray(columns)) {
      return "definition.apply validation failed: columns must be an array when provided";
    }
    for (const column of columns) {
      if (!isDefinitionColumn(column)) {
        return "definition.apply validation failed: columns must contain valid column declarations";
      }
    }
  }
  if (change.kind === "add_table_column") {
    if (typeof change.table_id !== "string" || change.table_id.length === 0) {
      return "definition.apply validation failed: table_id must be a non-empty string";
    }
    if (typeof change.column_name !== "string" || change.column_name.length === 0) {
      return "definition.apply validation failed: column_name must be a non-empty string";
    }
    if (typeof change.cell_type !== "object" || change.cell_type === null || Array.isArray(change.cell_type)) {
      return "definition.apply validation failed: cell_type must be an object";
    }
    const table = config.tables.find((t) => t.id === change.table_id);
    if (!table) return `definition.apply validation failed: target table '${change.table_id}' was not found`;
    if ((table.source as { kind?: unknown })?.kind !== "stored") {
      return `definition.apply validation failed: target table '${change.table_id}' is not stored`;
    }
    if (table.columns.some((c) => c.name === change.column_name)) {
      return `definition.apply validation failed: column '${change.column_name}' already exists on '${change.table_id}'`;
    }
  }
  if (change.kind === "add_operation") {
    if (typeof change.operation_id !== "string" || change.operation_id.length === 0) {
      return "definition.apply validation failed: operation_id must be a non-empty string";
    }
    if (config.operations.some((op) => op.id === change.operation_id)) {
      return `definition.apply validation failed: operation '${change.operation_id}' already exists`;
    }
    if (typeof change.handler !== "object" || change.handler === null || Array.isArray(change.handler)) {
      return "definition.apply validation failed: handler must be an object";
    }
    const handler = change.handler as { kind?: unknown; on?: unknown };
    if (handler.kind !== "query") {
      return "definition.apply validation failed: P12 add_operation only supports handler.kind='query'";
    }
    if (typeof handler.on !== "string" || handler.on.length === 0) {
      return "definition.apply validation failed: handler.on must be a non-empty table id";
    }
    if (!config.tables.some((table) => table.id === handler.on)) {
      return `definition.apply validation failed: query target table '${handler.on}' was not found`;
    }
    const surfaceError = operationSurfaceValidationError(change.surface, true);
    if (surfaceError) {
      return `definition.apply validation failed: ${surfaceError}`;
    }
  }
  if (change.kind === "add_view") {
    if (typeof change.view_id !== "string" || change.view_id.length === 0) {
      return "definition.apply validation failed: view_id must be a non-empty string";
    }
    if (config.views.some((view) => view.id === change.view_id)) {
      return `definition.apply validation failed: view '${change.view_id}' already exists`;
    }
    if (
      change.view_kind !== "table"
      && change.view_kind !== "list"
      && change.view_kind !== "detail"
      && change.view_kind !== "custom"
    ) {
      return "definition.apply validation failed: view_kind must be table, list, detail, or custom";
    }
    if (typeof change.source !== "object" || change.source === null || Array.isArray(change.source)) {
      return "definition.apply validation failed: source must be an object";
    }
    const source = change.source as { kind?: unknown; operation_id?: unknown };
    if (source.kind !== "operation") {
      return "definition.apply validation failed: add_view only supports source.kind='operation'";
    }
    if (typeof source.operation_id !== "string" || source.operation_id.length === 0) {
      return "definition.apply validation failed: source.operation_id must be a non-empty operation id";
    }
    const sourceOperation = config.operations.find((op) => op.id === source.operation_id);
    if (!sourceOperation) {
      return `definition.apply validation failed: source operation '${source.operation_id}' was not found`;
    }
    const affects = sourceOperation.affects as { reads_only?: unknown } | undefined;
    if (affects?.reads_only !== true) {
      return `definition.apply validation failed: source operation '${source.operation_id}' must be reads_only`;
    }
    const surfaceError = viewMountSurfaceError(sourceOperation);
    if (surfaceError) {
      return `definition.apply validation failed: source operation '${source.operation_id}' ${surfaceError}`;
    }
    if (change.presentation !== undefined) {
      if (typeof change.presentation !== "object" || change.presentation === null || Array.isArray(change.presentation)) {
        return "definition.apply validation failed: presentation must be an object when provided";
      }
    }
  }
  if (change.kind === "add_policy_rule") {
    if (typeof change.rule_id !== "string" || change.rule_id.length === 0) {
      return "definition.apply validation failed: rule_id must be a non-empty string";
    }
    if (config.policy_rules.some((rule) => rule.id === change.rule_id)) {
      return `definition.apply validation failed: policy rule '${change.rule_id}' already exists`;
    }
    if (!Array.isArray(change.allow) || change.allow.length === 0) {
      return "definition.apply validation failed: allow must be a non-empty array";
    }
    if (!Array.isArray(change.actions) || change.actions.length === 0 || !change.actions.every((action) => typeof action === "string")) {
      return "definition.apply validation failed: actions must be a non-empty array of strings";
    }
    if (typeof change.resource !== "object" || change.resource === null || Array.isArray(change.resource)) {
      return "definition.apply validation failed: resource must be an object";
    }
    if (change.when !== undefined && (typeof change.when !== "object" || change.when === null || Array.isArray(change.when))) {
      return "definition.apply validation failed: when must be an object when provided";
    }
  }
  return undefined;
}

function viewMountSurfaceError(operation: DiscoveredOperation): string | undefined {
  const surface = operation.surface;
  if (surface === undefined) return undefined;
  if (surface.framework_internal === true) return "is framework-internal and cannot be mounted as a View";
  if (surface.public_surface === false) return "is not part of the public app surface";
  if (surface.view_mountable === false) return "is not view_mountable";
  return undefined;
}

function operationSurfaceValidationError(surface: unknown, readsOnly: boolean): string | undefined {
  try {
    normalizeDiscoveredOperationSurface(surface, readsOnly);
    return undefined;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

function normalizeDiscoveredOperationSurface(
  surface: unknown,
  readsOnly: boolean,
): NonNullable<DiscoveredOperation["surface"]> {
  const defaults = {
    agent_callable: true,
    public_surface: true,
    view_mountable: readsOnly,
    framework_internal: false,
  };
  if (surface === undefined) return defaults;
  if (typeof surface !== "object" || surface === null || Array.isArray(surface)) {
    throw new Error("surface must be an object");
  }
  const input = surface as Record<string, unknown>;
  const normalized = {
    agent_callable: booleanSurfaceField(input, "agent_callable", defaults.agent_callable),
    public_surface: booleanSurfaceField(input, "public_surface", defaults.public_surface),
    view_mountable: booleanSurfaceField(input, "view_mountable", defaults.view_mountable),
    framework_internal: booleanSurfaceField(input, "framework_internal", defaults.framework_internal),
  };
  if (normalized.framework_internal && normalized.public_surface) {
    throw new Error("surface.framework_internal requires public_surface=false");
  }
  if (normalized.framework_internal && normalized.view_mountable) {
    throw new Error("surface.framework_internal requires view_mountable=false");
  }
  if (normalized.view_mountable && !normalized.public_surface) {
    throw new Error("surface.view_mountable requires public_surface=true");
  }
  if (normalized.view_mountable && !readsOnly) {
    throw new Error("surface.view_mountable requires reads_only=true");
  }
  return normalized;
}

function booleanSurfaceField(
  input: Record<string, unknown>,
  key: keyof NonNullable<DiscoveredOperation["surface"]>,
  fallback: boolean,
): boolean {
  const value = input[key];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`surface.${key} must be boolean`);
  return value;
}

function inputForDefinitionChange(change: DefinitionApplyChange): Record<string, unknown> {
  if (change.kind === "add_table") {
    return {
      table_id: change.table_id,
      columns: change.columns ?? [],
    };
  }
  if (change.kind === "add_table_column") {
    return {
      table_id: change.table_id,
      column_name: change.column_name,
      cell_type: change.cell_type,
      nullable: change.nullable,
      default_value: change.default_value,
    };
  }
  if (change.kind === "add_operation") {
    return {
      operation_id: change.operation_id,
      name: change.name,
      description: change.description,
      input: change.input,
      output: change.output,
      handler: change.handler,
      ui_binding: change.ui_binding,
      agent_tool: change.agent_tool,
      surface: change.surface,
    };
  }
  if (change.kind === "add_view") {
    return {
      view_id: change.view_id,
      name: change.name,
      description: change.description,
      view_kind: change.view_kind,
      source: change.source,
      presentation: change.presentation,
    };
  }
  if (change.kind === "add_policy_rule") {
    return {
      rule_id: change.rule_id,
      allow: change.allow,
      actions: change.actions,
      resource: change.resource,
      when: change.when,
    };
  }
  return {};
}

function predictedAfterDefinitionConfig(
  before: RuntimeConfigDiscovery,
  change: DefinitionApplyChange,
): RuntimeConfigDiscovery {
  if (change.kind === "add_table") {
    return {
      operations: before.operations,
      views: before.views,
      policy_rules: before.policy_rules,
      tables: [
        ...before.tables,
        {
          id: change.table_id,
          source: { kind: "stored" },
          system_owned: false,
          columns: (change.columns ?? []).map((column) => {
            const c = column as { name: string; type: unknown; nullable?: boolean };
            return {
              name: c.name,
              type: c.type,
              nullable: c.nullable === true,
            };
          }),
        },
      ],
    };
  }
  if (change.kind === "add_table_column") {
    return {
      operations: before.operations,
      views: before.views,
      policy_rules: before.policy_rules,
      tables: before.tables.map((table) => {
        if (table.id !== change.table_id) return table;
        return {
          ...table,
          columns: [
            ...table.columns,
            {
              name: change.column_name,
              type: change.cell_type,
              nullable: change.nullable === true,
            },
          ],
        };
      }),
    };
  }
  if (change.kind === "add_operation") {
    const handler = change.handler as { on?: unknown };
    return {
      tables: before.tables,
      views: before.views,
      policy_rules: before.policy_rules,
      operations: [
        ...before.operations,
        {
          id: change.operation_id,
          action: "read",
          resource: { kind: "table", table: (change.handler as { on?: unknown }).on },
          input: change.input ?? { type: "record", fields: {} },
          output: change.output ?? { kind: "row-list", row_type: handler.on },
          affects: { mutations: [], adapter_writes: [], reads_only: true, destructive: false },
          handler_kind: "query",
          surface: normalizeDiscoveredOperationSurface(change.surface, true),
        },
      ],
    };
  }
  if (change.kind === "add_view") {
    return {
      tables: before.tables,
      operations: before.operations,
      policy_rules: before.policy_rules,
      views: [
        ...before.views,
        {
          id: change.view_id,
          name: change.name ?? change.view_id,
          description: change.description ?? "",
          kind: change.view_kind,
          source: change.source,
          presentation: change.presentation as DiscoveredView["presentation"],
        },
      ],
    };
  }
  if (change.kind === "add_policy_rule") {
    return {
      tables: before.tables,
      operations: before.operations,
      views: before.views,
      policy_rules: [
        ...before.policy_rules,
        {
          id: change.rule_id,
          allow: change.allow,
          actions: change.actions,
          resource: change.resource,
          ...(change.when !== undefined ? { when: change.when } : {}),
        },
      ],
    };
  }
  return before;
}

function diffDefinitionConfigs(
  before: RuntimeConfigDiscovery,
  after: RuntimeConfigDiscovery,
  change: DefinitionApplyChange,
): DefinitionApplyResult["diff"] {
  if (change.kind === "add_table") {
    const beforeTable = before.tables.find((t) => t.id === change.table_id);
    const afterTable = after.tables.find((t) => t.id === change.table_id);
    return {
      changed_tables: [],
      added_operations: [],
      added_views: [],
      added_policy_rules: [],
      added_tables: beforeTable || !afterTable
        ? []
        : [{
            table_id: afterTable.id,
            columns: afterTable.columns.map((c) => c.name),
          }],
    };
  }
  if (change.kind === "add_table_column") {
    const beforeTable = before.tables.find((t) => t.id === change.table_id);
    const afterTable = after.tables.find((t) => t.id === change.table_id);
    const beforeColumns = beforeTable?.columns.map((c) => c.name) ?? [];
    const afterColumns = afterTable?.columns.map((c) => c.name) ?? [];
    const beforeSet = new Set(beforeColumns);
    return {
      added_tables: [],
      added_operations: [],
      added_views: [],
      added_policy_rules: [],
      changed_tables: [{
        table_id: change.table_id,
        before_columns: beforeColumns,
        after_columns: afterColumns,
        added_columns: afterColumns.filter((name) => !beforeSet.has(name)),
      }],
    };
  }
  if (change.kind === "add_operation") {
    const beforeOperation = before.operations.find((op) => op.id === change.operation_id);
    const afterOperation = after.operations.find((op) => op.id === change.operation_id);
    return {
      changed_tables: [],
      added_tables: [],
      added_views: [],
      added_policy_rules: [],
      added_operations: beforeOperation || !afterOperation
        ? []
        : [{
            operation_id: afterOperation.id,
            action: afterOperation.action,
            handler_kind: afterOperation.handler_kind,
          }],
    };
  }
  if (change.kind === "add_view") {
    const beforeView = before.views.find((view) => view.id === change.view_id);
    const afterView = after.views.find((view) => view.id === change.view_id);
    const source = afterView?.source as { operation_id?: unknown } | undefined;
    return {
      changed_tables: [],
      added_tables: [],
      added_operations: [],
      added_policy_rules: [],
      added_views: beforeView || !afterView
        ? []
        : [{
            view_id: afterView.id,
            kind: afterView.kind,
            source_operation_id: typeof source?.operation_id === "string" ? source.operation_id : "",
          }],
    };
  }
  if (change.kind === "add_policy_rule") {
    const beforeRule = before.policy_rules.find((rule) => rule.id === change.rule_id);
    const afterRule = after.policy_rules.find((rule) => rule.id === change.rule_id);
    return {
      changed_tables: [],
      added_tables: [],
      added_operations: [],
      added_views: [],
      added_policy_rules: beforeRule || !afterRule
        ? []
        : [{
            rule_id: afterRule.id,
            actions: afterRule.actions,
            resource: afterRule.resource,
          }],
    };
  }
  return { changed_tables: [], added_tables: [], added_operations: [], added_views: [], added_policy_rules: [] };
}

function diffContainsChange(diff: DefinitionApplyResult["diff"], change: DefinitionApplyChange): boolean {
  if (change.kind === "add_table") {
    return diff.added_tables.some((table) => table.table_id === change.table_id);
  }
  if (change.kind === "add_table_column") {
    return diff.changed_tables.some(
      (table) => table.table_id === change.table_id && table.added_columns.includes(change.column_name),
    );
  }
  if (change.kind === "add_operation") {
    return diff.added_operations.some((operation) => operation.operation_id === change.operation_id);
  }
  if (change.kind === "add_view") {
    return diff.added_views.some((view) => view.view_id === change.view_id);
  }
  if (change.kind === "add_policy_rule") {
    return diff.added_policy_rules.some((rule) => rule.rule_id === change.rule_id);
  }
  return false;
}

function diffMismatchMessage(change: DefinitionApplyChange): string {
  if (change.kind === "add_table") {
    return `definition.apply completed but schema diff does not contain table '${change.table_id}'`;
  }
  if (change.kind === "add_operation") {
    return `definition.apply completed but schema diff does not contain operation '${change.operation_id}'`;
  }
  if (change.kind === "add_view") {
    return `definition.apply completed but schema diff does not contain view '${change.view_id}'`;
  }
  if (change.kind === "add_policy_rule") {
    return `definition.apply completed but schema diff does not contain policy rule '${change.rule_id}'`;
  }
  return `definition.apply completed but schema diff does not contain '${change.column_name}'`;
}

function isDefinitionColumn(v: unknown): boolean {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const c = v as { name?: unknown; type?: unknown; nullable?: unknown };
  if (typeof c.name !== "string" || c.name.length === 0) return false;
  if (typeof c.type !== "object" || c.type === null || Array.isArray(c.type)) return false;
  if (c.nullable !== undefined && typeof c.nullable !== "boolean") return false;
  return true;
}

function extractDefinitionVersion(output: unknown): number | undefined {
  if (
    typeof output === "object"
    && output !== null
    && typeof (output as { definition_version?: unknown }).definition_version === "number"
  ) {
    return (output as { definition_version: number }).definition_version;
  }
  return undefined;
}

function objectOutputOrError(output: unknown): Record<string, unknown> | undefined {
  if (typeof output !== "object" || output === null || Array.isArray(output)) return undefined;
  return output as Record<string, unknown>;
}

function removedTablesFromRollbackValidation(validation: Record<string, unknown>): string[] {
  const impact = validation.impact;
  if (typeof impact !== "object" || impact === null || Array.isArray(impact)) return [];
  const removed = (impact as { removed_tables?: unknown }).removed_tables;
  if (!Array.isArray(removed)) return [];
  return removed
    .map((item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return undefined;
      const tableId = (item as { table_id?: unknown }).table_id;
      return typeof tableId === "string" ? tableId : undefined;
    })
    .filter((tableId): tableId is string => tableId !== undefined);
}

function removedColumnsFromRollbackValidation(
  validation: Record<string, unknown>,
): Array<{ table_id: string; column_name: string }> {
  const impact = validation.impact;
  if (typeof impact !== "object" || impact === null || Array.isArray(impact)) return [];
  const removed = (impact as { removed_columns?: unknown }).removed_columns;
  if (!Array.isArray(removed)) return [];
  return removed
    .map((item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return undefined;
      const tableId = (item as { table_id?: unknown }).table_id;
      const columnName = (item as { column_name?: unknown }).column_name;
      if (typeof tableId !== "string" || typeof columnName !== "string") return undefined;
      return { table_id: tableId, column_name: columnName };
    })
    .filter((column): column is { table_id: string; column_name: string } => column !== undefined);
}

function removedOperationsFromRollbackValidation(validation: Record<string, unknown>): string[] {
  const impact = validation.impact;
  if (typeof impact !== "object" || impact === null || Array.isArray(impact)) return [];
  const removed = (impact as { removed_operations?: unknown }).removed_operations;
  if (!Array.isArray(removed)) return [];
  return removed
    .map((item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return undefined;
      const operationId = (item as { operation_id?: unknown }).operation_id;
      return typeof operationId === "string" ? operationId : undefined;
    })
    .filter((operationId): operationId is string => operationId !== undefined);
}

function removedViewsFromRollbackValidation(validation: Record<string, unknown>): string[] {
  const impact = validation.impact;
  if (typeof impact !== "object" || impact === null || Array.isArray(impact)) return [];
  const removed = (impact as { removed_views?: unknown }).removed_views;
  if (!Array.isArray(removed)) return [];
  return removed
    .map((item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return undefined;
      const viewId = (item as { view_id?: unknown }).view_id;
      return typeof viewId === "string" ? viewId : undefined;
    })
    .filter((viewId): viewId is string => viewId !== undefined);
}

function rollbackExecuteOutputStatus(output: unknown): "rolled_back" | "noop" {
  if (
    typeof output === "object"
    && output !== null
    && (output as { status?: unknown }).status === "noop"
  ) {
    return "noop";
  }
  return "rolled_back";
}

function authorizationDecisionMessage(decision: AuthorizationDecision): string {
  return "message" in decision
    ? decision.message
    : `${decision.capability} authorization ${decision.reason_code}`;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}
