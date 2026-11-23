import { spawn } from "node:child_process";

// ---------------------------------------------------------------------------
// PneumaSpace as the runtime of a Creation Host.
//
// The Host owns this effect; the framework never imports it. Publishing goes
// through PneumaSpace's own CLI (`appctl`), so the bundle rules (what ships,
// production dependencies, deterministic tar) stay the platform's. Reads and
// removal use the admin API directly.
// ---------------------------------------------------------------------------

export interface CommandResult {
  readonly code: number;
  readonly output: string;
}

export function runCommand(
  cmd: readonly string[],
  opts: { cwd?: string; env?: Record<string, string | undefined>; timeoutMs?: number } = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const [bin, ...args] = cmd;
    const child = spawn(bin!, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs ?? 300_000);
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: 127, output: `${output}\n${err.message}`.trim() });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut ? 124 : (code ?? 1), output: (timedOut ? `${output}\n[timed out]` : output).trim() });
    });
  });
}

export interface ProbeResult {
  readonly ok: boolean;
  readonly status: number;
  readonly detail: string;
}

/** What the governed loop needs from a runtime. `Space` is the real one; tests supply a fake. */
export interface SpaceRuntime {
  /** Copy the platform's app template into an empty directory. */
  init(dir: string): Promise<CommandResult>;
  /** Publish a source directory under an app name. Same name keeps all data. */
  publish(name: string, dir: string): Promise<CommandResult>;
  /** Wake the app and read its root path. Any status below 500 means it booted. */
  probe(name: string): Promise<ProbeResult>;
  /** Take the address down, then delete its data. Used for throwaway previews only. */
  discard(name: string): Promise<void>;
  /** The address a person opens. */
  address(name: string): string;
}

export interface SpaceOptions {
  /** Path to pneuma-space/cli/appctl.ts. */
  readonly cli: string;
  /** Admin API as this process reaches it, e.g. http://gateway:8081. */
  readonly adminUrl: string;
  /** Ingress as this process reaches it, e.g. http://gateway:8080. */
  readonly ingressUrl: string;
  /** Ingress as the user's browser reaches it, e.g. http://127.0.0.1:8080. */
  readonly publicUrl: string;
  /** Owner subject for first publishes, e.g. user:me. */
  readonly owner: string;
  /** Node >= 24 binary that runs appctl. */
  readonly node?: string;
  readonly token?: string;
}

export class Space implements SpaceRuntime {
  constructor(private readonly opts: SpaceOptions) {}

  private appctl(args: readonly string[], timeoutMs = 300_000): Promise<CommandResult> {
    return runCommand([this.opts.node ?? "node", "--disable-warning=ExperimentalWarning", this.opts.cli, ...args], {
      env: { PNEUMA_SPACE_ADMIN: this.opts.adminUrl, PNEUMA_SPACE_OWNER: this.opts.owner, PNEUMA_SPACE_TOKEN: this.opts.token },
      timeoutMs,
    });
  }

  private async admin(method: string, path: string): Promise<Response> {
    return fetch(`${this.opts.adminUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers: this.opts.token ? { authorization: `Bearer ${this.opts.token}` } : {},
      signal: AbortSignal.timeout(30_000),
    });
  }

  init(dir: string): Promise<CommandResult> {
    return this.appctl(["init", dir], 30_000);
  }

  publish(name: string, dir: string): Promise<CommandResult> {
    return this.appctl(["publish", name, dir, "--owner", this.opts.owner]);
  }

  async probe(name: string): Promise<ProbeResult> {
    const url = `${this.opts.ingressUrl.replace(/\/$/, "")}/apps/${name}/`;
    try {
      const res = await fetch(url, { headers: { accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(30_000) });
      const detail = res.status >= 500 ? (await res.text()).slice(0, 400) : "";
      return { ok: res.status < 500, status: res.status, detail };
    } catch (err) {
      return { ok: false, status: 0, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  async discard(name: string): Promise<void> {
    try {
      await this.admin("POST", `/api/apps/${name}/remove`);
      await this.admin("POST", `/api/apps/${name}/purge`);
    } catch {
      // A leftover preview is visible in the console and harmless; never fail a change over it.
    }
  }

  address(name: string): string {
    return `${this.opts.publicUrl.replace(/\/$/, "")}/apps/${name}/`;
  }
}

export function spaceFromEnv(env: Record<string, string | undefined> = process.env): Space {
  const cli = env.PNEUMA_SPACE_CLI;
  if (!cli) throw new Error("PNEUMA_SPACE_CLI must point at pneuma-space/cli/appctl.ts");
  const adminUrl = env.PNEUMA_SPACE_ADMIN ?? "http://127.0.0.1:8081";
  const ingressUrl = env.PNEUMA_SPACE_INGRESS ?? "http://127.0.0.1:8080";
  return new Space({
    cli,
    adminUrl,
    ingressUrl,
    publicUrl: env.PNEUMA_SPACE_PUBLIC ?? "http://127.0.0.1:8080",
    owner: env.PNEUMA_OWNER ?? "user:me",
    node: env.PNEUMA_NODE,
    token: env.PNEUMA_SPACE_TOKEN,
  });
}
