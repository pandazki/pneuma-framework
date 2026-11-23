import { spawn } from "node:child_process";

// ---------------------------------------------------------------------------
// PneumaSpace as the runtime of a Creation Host.
//
// The Host owns this effect; the framework never imports it. Publishing goes
// through PneumaSpace's own CLI (`appctl`), so the bundle rules (what ships,
// production dependencies, deterministic tar) stay the platform's. Reads,
// stopping an instance and removal use the admin API directly.
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
    // Decoded as a stream: a multi-byte character split across two reads must not become U+FFFD.
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (output += chunk));
    child.stderr.on("data", (chunk: string) => (output += chunk));
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

/** One binding in PneumaSpace's state inventory: where one capability's data lives, without credentials. */
export interface SpaceBinding {
  /** The capability kind, e.g. db, files, kv. */
  readonly kind: string;
  /** The engine behind it, e.g. sqlite or postgres for db. */
  readonly provider: string;
  /** active, or suspended after the app switched engines. */
  readonly state: string;
  /** For postgres: { service: "<host>:<port>", database }. For sqlite and files: { volume }. */
  readonly location: Readonly<Record<string, string>>;
}

/** PneumaSpace's answer on `GET /api/apps/<name>/state`. */
export interface SpaceState {
  readonly app: string;
  readonly release: number | null;
  readonly bundle: string | null;
  readonly bindings: readonly SpaceBinding[];
}

/** What the governed loop needs from a runtime. `Space` is the real one; tests supply a fake. */
export interface SpaceRuntime {
  /** Copy the platform's app template into an empty directory. */
  init(dir: string): Promise<CommandResult>;
  /** Whether the platform already has an app under this name, published by anyone. */
  exists(name: string): Promise<boolean>;
  /** Publish a source directory under an app name. Same name keeps all data. */
  publish(name: string, dir: string): Promise<CommandResult>;
  /** Wake the app and read its root path. Any status below 500 means it booted. */
  probe(name: string): Promise<ProbeResult>;
  /**
   * Take the address down, then delete the app and its data. Resolves to whether the platform no
   * longer has an app under this name (one that was never there counts as gone). Never throws.
   */
  discard(name: string): Promise<boolean>;
  /** Where each of the app's bindings keeps its data. Throws when the platform has no such app or does not answer. */
  state(name: string): Promise<SpaceState>;
  /** Drain and remove the app's running instance. The next request wakes it again. Throws when the platform refuses. */
  stop(name: string): Promise<void>;
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

  async exists(name: string): Promise<boolean> {
    const res = await this.admin("GET", "/api/apps");
    if (!res.ok) throw new Error(`PneumaSpace admin answered ${res.status} to GET /api/apps`);
    const apps = (await res.json()) as { name?: string }[];
    return apps.some((app) => app.name === name);
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

  async discard(name: string): Promise<boolean> {
    // 404: no app by that name. Purge refuses an app that was not removed first, and only after a
    // purge is the name free again.
    const done = (res: Response) => res.ok || res.status === 404;
    try {
      if (!done(await this.admin("POST", `/api/apps/${name}/remove`))) return false;
      return done(await this.admin("POST", `/api/apps/${name}/purge`));
    } catch {
      return false;
    }
  }

  async state(name: string): Promise<SpaceState> {
    const path = `/api/apps/${encodeURIComponent(name)}/state`;
    const res = await this.admin("GET", path);
    if (res.status === 404) throw new Error(`PneumaSpace has no app named ${name}`);
    if (!res.ok) throw new Error(`PneumaSpace admin answered ${res.status} to GET ${path}`);
    return (await res.json()) as SpaceState;
  }

  async stop(name: string): Promise<void> {
    const path = `/api/apps/${encodeURIComponent(name)}/stop`;
    const res = await this.admin("POST", path);
    if (res.status === 404) throw new Error(`PneumaSpace has no app named ${name}`);
    if (!res.ok) throw new Error(`PneumaSpace admin answered ${res.status} to POST ${path}`);
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
