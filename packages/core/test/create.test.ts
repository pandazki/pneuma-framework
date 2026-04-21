import { test, expect } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPneumaFramework } from "../src/index.js";

const FIXTURE_TEMPLATE = join(import.meta.dir, "fixtures/templates/fixture-min");

test("createPneumaFramework returns an orchestrator and close()", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-pub-"));
  const fw = createPneumaFramework({ templateDir: FIXTURE_TEMPLATE, workspace: ws });
  expect(fw.orchestrator).toBeDefined();
  expect(fw.state).toBe(fw.orchestrator.state);
  await fw.close();
});

test("close() terminates the dev process even when stop.sh refuses to exit", async () => {
  // Regression for P1: a stop.sh that never exits must not hide dev-process liveness.
  const BROKEN_STOP = join(import.meta.dir, "fixtures/templates/fixture-broken-stop");
  const ws = mkdtempSync(join(tmpdir(), "pneuma-close-broken-"));
  const fw = createPneumaFramework({
    templateDir: BROKEN_STOP,
    workspace: ws,
    stopScriptTimeoutMs: 300, // short so the test is fast
    stopSigtermTimeoutMs: 1000,
  });
  const running = fw.orchestrator.runDev();
  await fw.orchestrator.awaitDevReady();
  expect(fw.orchestrator.state.dev?.state).toBe("running");
  const start = Date.now();
  await fw.close();
  const elapsed = Date.now() - start;
  await running;
  expect(fw.orchestrator.state.dev?.state).toBe("stopped");
  // Must finish within bounded time — not hang on stop.sh forever.
  expect(elapsed).toBeLessThan(4000);
});

test("close() does not run stop.sh when no dev session was started", async () => {
  // Regression for P2: build-only lifecycle must not invoke stop.sh on close.
  const TRACE_STOP = join(import.meta.dir, "fixtures/templates/fixture-trace-stop");
  const ws = mkdtempSync(join(tmpdir(), "pneuma-close-nostop-"));
  const fw = createPneumaFramework({ templateDir: TRACE_STOP, workspace: ws });
  await fw.orchestrator.runBuild();
  await fw.close();
  const marker = join(ws, ".pneuma", "stop-marker");
  expect(existsSync(marker)).toBe(false);
});
