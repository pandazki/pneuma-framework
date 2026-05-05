import { join } from "node:path";
import { getStackProfile } from "../m12-reference-creation-host/profiles.js";
import type {
  GeneratedAppProject,
  GeneratedAppVersion,
} from "../m12-reference-creation-host/types.js";

export interface StartPublishedRuntimeInput {
  readonly project: GeneratedAppProject;
  readonly version: GeneratedAppVersion;
  readonly port: number;
}

export interface PublishedRuntimeHandle {
  readonly kind: "published";
  readonly app_id: string;
  readonly version_id: string;
  readonly url: string;
  readonly started_at_ms: number;
  readonly proc: ReturnType<typeof Bun.spawn>;
  readonly wait_until_exit: Promise<number>;
  readonly logs: string[];
}

export interface PublishedRuntimeHealth {
  readonly ok: boolean;
  readonly url: string;
  readonly config: unknown;
  readonly checks: readonly {
    readonly name: string;
    readonly status: "passed" | "failed";
    readonly message: string;
    readonly at_ms: number;
  }[];
}

export async function startPublishedRuntime(input: StartPublishedRuntimeInput): Promise<PublishedRuntimeHandle> {
  const profile = getStackProfile(input.version.profile_id);
  const appEntry = join(profile.template_dir, "server", "app.ts");
  const logs: string[] = [];
  const proc = Bun.spawn({
    cmd: ["bun", "run", appEntry],
    cwd: profile.template_dir,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      PNEUMA_WORKSPACE: input.version.app_workspace_dir,
      PNEUMA_DATA_DIR: join(input.version.app_workspace_dir, "data"),
      PNEUMA_SQLITE_PATH: input.version.sqlite_path,
      PNEUMA_PORT_HINT: String(input.port),
      PNEUMA_RELEASE_MODE: "published",
    },
  });
  const waitUntilExit = proc.exited;

  try {
    const url = await waitForServiceReady(proc, logs);
    consumeStream(proc.stderr, logs, "stderr");
    return {
      kind: "published",
      app_id: input.project.app_id,
      version_id: input.version.version_id,
      url,
      started_at_ms: Date.now(),
      proc,
      wait_until_exit: waitUntilExit,
      logs,
    };
  } catch (err) {
    await stopPublishedProcess(proc, waitUntilExit);
    throw err;
  }
}

export async function healthCheckPublishedRuntime(
  runtime: PublishedRuntimeHandle,
): Promise<PublishedRuntimeHealth> {
  const checks: PublishedRuntimeHealth["checks"] = [];
  const health = await fetchJson<{ ok?: boolean }>(`${runtime.url}/healthz`, "healthz");
  checks.push({
    name: "healthz",
    status: health.ok ? "passed" : "failed",
    message: health.ok ? "Published Application responded to /healthz" : "Published Application healthz returned ok=false",
    at_ms: Date.now(),
  });

  const config = await fetchJson<Record<string, unknown>>(`${runtime.url}/api/config`, "config");
  checks.push({
    name: "config",
    status: JSON.stringify(config).includes("inbox_items") ? "passed" : "failed",
    message: "Published Application config is readable",
    at_ms: Date.now(),
  });

  const operations = Array.isArray(config.operations) ? config.operations : [];
  checks.push({
    name: "operations",
    status: operations.length > 0 ? "passed" : "failed",
    message: `Published Application exposes ${operations.length} operations`,
    at_ms: Date.now(),
  });

  return {
    ok: checks.every((check) => check.status === "passed"),
    url: runtime.url,
    config,
    checks,
  };
}

export async function stopPublishedRuntime(runtime: PublishedRuntimeHandle): Promise<void> {
  await stopPublishedProcess(runtime.proc, runtime.wait_until_exit);
}

async function waitForServiceReady(proc: ReturnType<typeof Bun.spawn>, logs: string[]): Promise<string> {
  const decoder = new TextDecoder();
  const reader = proc.stdout.getReader();
  let buffer = "";
  let settled = false;

  return await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`timed out waiting for published runtime readiness\n${logs.join("\n")}`));
      }
    }, 10_000);

    proc.exited.then((code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`published runtime exited before ready with code ${code}\n${logs.join("\n")}`));
      }
    });

    void (async () => {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          logs.push(line);
          const match = line.match(/^##pneuma:service-ready api (.+)$/);
          if (match && !settled) {
            settled = true;
            clearTimeout(timeout);
            resolve(match[1]);
          }
        }
      }
    })().catch((err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  });
}

function consumeStream(stream: ReadableStream<Uint8Array>, logs: string[], label: string): void {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = "";
  void (async () => {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line) logs.push(`${label}: ${line}`);
      }
    }
  })();
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json() as T;
      lastError = new Error(`${label} failed with HTTP ${response.status}: ${await response.text()}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (attempt < 8) await wait(50);
  }
  throw lastError ?? new Error(`${label} failed`);
}

async function stopPublishedProcess(proc: ReturnType<typeof Bun.spawn>, exited: Promise<number>): Promise<void> {
  if (proc.exitCode !== null) return;
  proc.kill("SIGTERM");
  await Promise.race([exited, wait(3_000)]);
  if (proc.exitCode === null) {
    proc.kill("SIGKILL");
    await exited;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
