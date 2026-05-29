// ---------------------------------------------------------------------------
// Process helpers: run a one-shot command (verify / migrate / build) and start
// a disposable Bun runtime for preview or local publish. The Host owns process
// management; the framework boundary keeps this host-local.
// ---------------------------------------------------------------------------

export interface CommandResult {
  code: number;
  output: string;
}

export async function runCommand(
  cmd: string[],
  cwd: string,
  timeoutMs = 120_000,
  env: Record<string, string | undefined> = process.env,
): Promise<CommandResult> {
  const proc = Bun.spawn(cmd, { cwd, env, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  clearTimeout(timer);
  const output = (stdout + stderr).trim();
  return { code: timedOut ? 124 : code, output: timedOut ? output + "\n[timed out]" : output };
}

export async function waitForHealth(url: string, timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

export interface RuntimeHandle {
  url: string;
  port: number;
  persistence: "neon" | "memory";
  stop: () => Promise<void>;
}

import { createServer } from "node:net";

// Grab an actually-free ephemeral port to avoid colliding with orphaned preview
// runtimes (a fixed counter can hand out a port another process still holds).
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error("no free port"))));
    });
  });
}

/**
 * Start `bun run src/server/local.ts` for a materialized app root and wait for
 * it to answer /api/health. Pass a DATABASE_URL in env to back it with Neon;
 * omit it for a disposable in-memory preview.
 */
export async function startBunRuntime(
  root: string,
  env: Record<string, string | undefined>,
): Promise<RuntimeHandle> {
  const port = await findFreePort();
  const proc = Bun.spawn(["bun", "run", "src/server/local.ts"], {
    cwd: root,
    env: { ...env, PORT: String(port) },
    stdout: "inherit",
    stderr: "inherit",
  });
  const url = `http://127.0.0.1:${port}`;
  const healthy = await waitForHealth(`${url}/api/health`, 30_000);
  if (!healthy) {
    proc.kill();
    throw new Error(`runtime at ${root} failed to become healthy on ${url}`);
  }
  const persistence = env.DATABASE_URL ? "neon" : "memory";
  return {
    url,
    port,
    persistence,
    stop: async () => {
      proc.kill();
      await Promise.race([proc.exited, new Promise((r) => setTimeout(r, 2_000))]);
    },
  };
}
