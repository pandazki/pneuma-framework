import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { execSync } from "node:child_process";
import { createServer } from "node:net";

const CLI = resolve(import.meta.dir, "../src/index.ts");
const TEMPLATE = resolve(import.meta.dir, "../../../templates/minimal");

const HAS_PYTHON = (() => {
  try { execSync("python3 --version", { stdio: "ignore" }); return true; } catch { return false; }
})();

function findFreePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", rej);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => res(port));
    });
  });
}

interface RunCliOpts {
  waitForReady?: boolean;
  env?: Record<string, string | undefined>;
}

async function runCli(args: string[], opts: RunCliOpts = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn("bun", [CLI, ...args], {
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += String(d); });
    child.stderr.on("data", (d) => { stderr += String(d); });
    child.on("error", rejectP);

    let readyTimer: ReturnType<typeof setInterval> | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    if (opts.waitForReady) {
      readyTimer = setInterval(() => {
        if (stdout.includes("[pneuma:ready]")) {
          if (readyTimer) clearInterval(readyTimer);
          readyTimer = undefined;
          child.kill("SIGINT");
        }
      }, 50);
      killTimer = setTimeout(() => {
        if (readyTimer) clearInterval(readyTimer);
        readyTimer = undefined;
        child.kill("SIGKILL");
      }, 15_000);
      killTimer.unref?.();
    }

    // Resolve on 'close' (stdio fully drained), not 'exit', so the last lines
    // of output are guaranteed to be in `stdout` when assertions run.
    child.on("close", (code) => {
      if (readyTimer) clearInterval(readyTimer);
      if (killTimer) clearTimeout(killTimer);
      resolveP({ code, stdout, stderr });
    });
  });
}

test("cli build produces a build manifest", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-e2e-"));
  const r = await runCli(["build", TEMPLATE, "--workspace", ws]);
  expect(r.code).toBe(0);
  expect(r.stdout).toMatch(/manifest at/);
});

test("cli deploy after build succeeds", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-e2e-"));
  const b = await runCli(["build", TEMPLATE, "--workspace", ws]);
  expect(b.code).toBe(0);
  const d = await runCli(["deploy", TEMPLATE, "--workspace", ws]);
  expect(d.code).toBe(0);
});

test.skipIf(!HAS_PYTHON)("cli dev reaches ready and exits cleanly on interrupt", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-e2e-"));
  const port = await findFreePort();
  const r = await runCli(
    ["dev", TEMPLATE, "--workspace", ws, "--port", String(port)],
    { waitForReady: true },
  );
  expect(r.stdout).toMatch(/\[pneuma:ready\]/);
  expect(r.stdout).toMatch(new RegExp(`service viewer: http://127\\.0\\.0\\.1:${port}`));
});
