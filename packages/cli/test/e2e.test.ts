import { test, expect } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { execSync } from "node:child_process";

const CLI = resolve(import.meta.dir, "../src/index.ts");
const TEMPLATE = resolve(import.meta.dir, "../../../templates/minimal");

const HAS_PYTHON = (() => {
  try { execSync("python3 --version", { stdio: "ignore" }); return true; } catch { return false; }
})();

async function runCli(args: string[], opts: { waitForReady?: boolean } = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn("bun", [CLI, ...args], {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += String(d); });
    child.stderr.on("data", (d) => { stderr += String(d); });
    child.on("error", rejectP);
    if (opts.waitForReady) {
      const readyTimer = setInterval(() => {
        if (stdout.includes("[pneuma:ready]")) {
          clearInterval(readyTimer);
          child.kill("SIGINT");
        }
      }, 50);
      setTimeout(() => {
        clearInterval(readyTimer);
        child.kill("SIGKILL");
      }, 15_000);
    }
    child.on("exit", (code) => resolveP({ code, stdout, stderr }));
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
  const r = await runCli(["dev", TEMPLATE, "--workspace", ws], { waitForReady: true });
  expect(r.stdout).toMatch(/\[pneuma:ready\]/);
  expect(r.stdout).toMatch(/service viewer: http:\/\/127\.0\.0\.1:\d+/);
});
