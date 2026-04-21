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
