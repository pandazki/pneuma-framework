import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "../src/index.ts");

async function runCli(args: string[], timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  const proc = Bun.spawn(["bun", CLI, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitPromise = proc.exited;
  const timeoutP = new Promise<"timeout">((res) => {
    setTimeout(() => res("timeout"), timeoutMs).unref?.();
  });
  const result = await Promise.race([exitPromise.then(() => "exited" as const), timeoutP]);
  if (result === "timeout") {
    proc.kill("SIGKILL");
    await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    return { code: null, stdout, stderr, timedOut: true };
  }
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { code: proc.exitCode, stdout, stderr, timedOut: false };
}

// Fixture that exits immediately without emitting ##pneuma:ready.
// We build it inline in the workspace to avoid adding yet another fixture dir.
function buildEarlyExitFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "pneuma-cli-early-exit-"));
  const { mkdirSync, writeFileSync, chmodSync } = require("node:fs");
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    name: "early-exit",
    version: "0.0.1",
    displayName: "Early Exit",
    description: "dev.sh exits immediately without ##pneuma:ready",
    backends: { supported: ["claude-code"] },
    runtimeAgent: "none",
    scripts: { dev: "scripts/dev.sh" },
  }));
  writeFileSync(join(root, "scripts/dev.sh"), "#!/bin/sh\necho 'starting but never ready'\nexit 1\n");
  chmodSync(join(root, "scripts/dev.sh"), 0o755);
  return root;
}

// Fixture that emits ready then exits on its own (simulating dev process crash post-ready).
function buildCrashAfterReadyFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "pneuma-cli-crash-after-ready-"));
  const { mkdirSync, writeFileSync, chmodSync } = require("node:fs");
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    name: "crash-after-ready",
    version: "0.0.1",
    displayName: "Crash After Ready",
    description: "dev.sh emits ready then exits on its own",
    backends: { supported: ["claude-code"] },
    runtimeAgent: "none",
    scripts: { dev: "scripts/dev.sh" },
  }));
  writeFileSync(
    join(root, "scripts/dev.sh"),
    `#!/bin/sh
echo "##pneuma:service-ready viewer http://localhost:0"
echo "##pneuma:ready"
sleep 0.3
exit 3
`,
  );
  chmodSync(join(root, "scripts/dev.sh"), 0o755);
  return root;
}

test("cli dev exits if dev.sh dies before emitting ##pneuma:ready (P1a)", async () => {
  const tpl = buildEarlyExitFixture();
  const ws = mkdtempSync(join(tmpdir(), "pneuma-cli-ws-"));
  const r = await runCli(["dev", tpl, "--workspace", ws], 5000);
  expect(r.timedOut).toBe(false);
  // non-zero exit since dev failed
  expect(r.code === 0).toBe(false);
});

test("cli dev exits if dev process dies after ready without SIGINT (P1b)", async () => {
  const tpl = buildCrashAfterReadyFixture();
  const ws = mkdtempSync(join(tmpdir(), "pneuma-cli-ws-"));
  const r = await runCli(["dev", tpl, "--workspace", ws], 5000);
  expect(r.timedOut).toBe(false);
  expect(r.stdout).toContain("[pneuma:ready]");
  // dev.sh exited 3; CLI must propagate non-zero
  expect(r.code === 0).toBe(false);
});
