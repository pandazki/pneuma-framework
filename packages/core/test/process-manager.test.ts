import { test, expect } from "bun:test";
import { join } from "node:path";
import { spawnScript } from "../src/process-manager.js";

const FIXTURES = join(import.meta.dir, "fixtures/scripts");

test("spawnScript captures stdout and stderr with stream tags", async () => {
  const proc = spawnScript({
    scriptPath: join(FIXTURES, "echo-exit.sh"),
    cwd: FIXTURES,
    env: {},
  });
  const lines: Array<{ stream: string; line: string }> = [];
  proc.onLine((ev) => lines.push(ev));
  const result = await proc.exit;
  expect(result.code).toBe(0);
  expect(lines.some((l) => l.stream === "stdout" && l.line === "hello from echo-exit")).toBe(true);
  expect(lines.some((l) => l.stream === "stderr" && l.line === "and a stderr line")).toBe(true);
});

test("spawnScript surfaces non-zero exit code", async () => {
  const proc = spawnScript({
    scriptPath: join(FIXTURES, "fail.sh"),
    cwd: FIXTURES,
    env: {},
  });
  const result = await proc.exit;
  expect(result.code).toBe(7);
});

test("spawnScript can kill a long-running script via process group", async () => {
  const proc = spawnScript({
    scriptPath: join(FIXTURES, "long-running.sh"),
    cwd: FIXTURES,
    env: {},
  });
  // Wait until we see "##pneuma:ready"
  await new Promise<void>((resolve) => {
    proc.onLine((ev) => {
      if (ev.stream === "stdout" && ev.line === "##pneuma:ready") resolve();
    });
  });
  await proc.kill("SIGTERM");
  const result = await proc.exit;
  // SIGTERM handler exits 0 in fixture; other platforms may differ
  expect(result.code === 0 || result.signal === "SIGTERM").toBe(true);
});

test("spawnScript buffers lines emitted before onLine() subscribes", async () => {
  const proc = spawnScript({
    scriptPath: join(FIXTURES, "echo-exit.sh"),
    cwd: FIXTURES,
    env: {},
  });
  // Intentionally wait for process to finish BEFORE subscribing.
  const result = await proc.exit;
  const lines: Array<{ stream: string; line: string }> = [];
  proc.onLine((ev) => lines.push(ev));
  // Give the event loop a tick for replay.
  await new Promise((r) => setTimeout(r, 10));
  expect(result.code).toBe(0);
  expect(lines.some((l) => l.stream === "stdout" && l.line === "hello from echo-exit")).toBe(true);
  expect(lines.some((l) => l.stream === "stderr" && l.line === "and a stderr line")).toBe(true);
});

test("spawnScript exit promise resolves after stdio drain", async () => {
  const proc = spawnScript({
    scriptPath: join(FIXTURES, "echo-exit.sh"),
    cwd: FIXTURES,
    env: {},
  });
  const lines: Array<{ stream: string; line: string }> = [];
  proc.onLine((ev) => lines.push(ev));
  await proc.exit;
  // After exit resolves, stdio must already be drained — no extra wait.
  expect(lines.some((l) => l.line === "hello from echo-exit")).toBe(true);
  expect(lines.some((l) => l.line === "and a stderr line")).toBe(true);
});

test("spawnScript exit resolves even when a backgrounded helper inherits stdio", async () => {
  // Script that backgrounds a long sleep (inherits stdout/stderr), then exits.
  // On the old 'close' behavior this would hang. With the fallback it should resolve within ~500-700ms.
  const proc = spawnScript({
    scriptPath: join(FIXTURES, "bg-leak.sh"),
    cwd: FIXTURES,
    env: { PATH: "/usr/bin:/bin" },
  });
  const start = Date.now();
  const result = await proc.exit;
  const elapsed = Date.now() - start;
  expect(result.code).toBe(0);
  // Must resolve within the grace window, not wait for the backgrounded sleep.
  expect(elapsed).toBeLessThan(2000);
  // Kill the leaked helper so it doesn't outlive the test.
  try { process.kill(-proc.pid, "SIGKILL"); } catch { /* already gone */ }
});

test("spawnScript caps history buffer length", async () => {
  // Script that emits many lines to force history cap behavior.
  const proc = spawnScript({
    scriptPath: join(FIXTURES, "many-lines.sh"),
    cwd: FIXTURES,
    env: { PATH: "/usr/bin:/bin" },
  });
  await proc.exit;
  const lines: Array<{ stream: string; line: string }> = [];
  proc.onLine((ev) => lines.push(ev));
  // History is capped; exact number is implementation-specific but must be < total emitted.
  // The fixture emits 5000 lines; cap should keep history <= 2000.
  expect(lines.length).toBeLessThanOrEqual(2000);
  expect(lines.length).toBeGreaterThan(0);
});
