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

test("createPneumaFramework installs authorization kernel and approval token store by default", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-auth-default-"));
  const fw = createPneumaFramework({ templateDir: FIXTURE_TEMPLATE, workspace: ws });

  expect(fw.authorizationKernel).toBeDefined();
  expect(fw.approvalTokens).toBeDefined();

  const result = await fw.toolRegistry.call("definition.apply", {
    kind: "add_table_column",
    table_id: "bookmarks",
    column_name: "tags",
    cell_type: { kind: "primitive", of: "Text" },
  });

  expect(result.ok).toBe(false);
  expect((result.state as { authorization: { reason_code: string } }).authorization.reason_code).toBe("approval_required");
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

test("close() runs stop.sh even if dev.sh has already exited (daemonizer pattern)", async () => {
  const LAUNCHER_EXITS = join(import.meta.dir, "fixtures/templates/fixture-launcher-exits");
  const ws = mkdtempSync(join(tmpdir(), "pneuma-close-daemon-"));
  const fw = createPneumaFramework({ templateDir: LAUNCHER_EXITS, workspace: ws });

  const running = fw.orchestrator.runDev();
  await fw.orchestrator.awaitDevReady();

  // Wait for dev.sh to finish its exit.
  await running;
  // dev.sh exited cleanly → state.dev.state should be "exited", not "running".
  expect(fw.orchestrator.state.dev?.state).toBe("exited");

  // stop.sh must still run on close, because runDev was invoked.
  await fw.close();
  const marker = join(ws, ".pneuma", "stop-marker");
  expect(existsSync(marker)).toBe(true);
});

test("close() is idempotent with prior runStop() (stop.sh runs once)", async () => {
  const LAUNCHER_EXITS = join(import.meta.dir, "fixtures/templates/fixture-launcher-exits");
  const ws = mkdtempSync(join(tmpdir(), "pneuma-close-idempotent-"));
  const fw = createPneumaFramework({ templateDir: LAUNCHER_EXITS, workspace: ws });

  const running = fw.orchestrator.runDev();
  await fw.orchestrator.awaitDevReady();
  await running; // dev.sh exited

  // Explicit runStop — stop.sh should run once here.
  await fw.orchestrator.runStop();
  const marker = join(ws, ".pneuma", "stop-marker");
  expect(existsSync(marker)).toBe(true);

  // Capture timestamp to detect re-writes.
  const { mtimeMs: firstMtime } = (await import("node:fs")).statSync(marker);

  // Give the fs a tick to distinguish mtimes.
  await new Promise((r) => setTimeout(r, 50));

  // close() in finally — must NOT re-run stop.sh.
  await fw.close();

  const { mtimeMs: secondMtime } = (await import("node:fs")).statSync(marker);
  expect(secondMtime).toBe(firstMtime);
});

test("close() runs stop.sh when dev emitted ##pneuma:stopping without an actual runStop call", async () => {
  // Regression: previously close() used state.dev.state === "stopped" as the
  // idempotency signal, but that state is also set by the ##pneuma:stopping
  // marker. In that case close() must NOT skip teardown.
  const EMITS_STOPPING = join(import.meta.dir, "fixtures/templates/fixture-emits-stopping");
  const ws = mkdtempSync(join(tmpdir(), "pneuma-close-emits-stopping-"));
  const fw = createPneumaFramework({ templateDir: EMITS_STOPPING, workspace: ws });

  const running = fw.orchestrator.runDev();
  await fw.orchestrator.awaitDevReady();
  await running;

  // dev.sh's ##pneuma:stopping set state.dev.state to "stopped" (without runStop
  // having been called).
  expect(fw.orchestrator.state.dev?.state).toBe("stopped");
  expect(fw.orchestrator.stopInvoked).toBe(false);

  // close() must still run stop.sh because runStop was never called.
  await fw.close();
  const marker = join(ws, ".pneuma", "stop-marker");
  expect(existsSync(marker)).toBe(true);
  expect(fw.orchestrator.stopInvoked).toBe(true);
});
