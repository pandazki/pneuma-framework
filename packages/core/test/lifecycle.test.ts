import { test, expect } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../src/lifecycle.js";

const FIXTURE_TEMPLATE = join(import.meta.dir, "fixtures/templates/fixture-min");

test("runDev reaches ready state and can be stopped", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-lc-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE_TEMPLATE, workspace: ws });
  const ready = orch.runDev();
  await orch.awaitDevReady();
  expect(orch.state.dev?.state).toBe("running");
  expect(orch.state.dev?.services.length).toBeGreaterThan(0);
  await orch.runStop();
  await ready;
  expect(orch.state.dev?.state).toBe("stopped");
});

test("runBuild produces a build manifest", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-lc-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE_TEMPLATE, workspace: ws });
  const res = await orch.runBuild();
  expect(res.exitCode).toBe(0);
  expect(res.manifestPath).toBeDefined();
  expect(existsSync(res.manifestPath!)).toBe(true);
});

test("runDeploy uses the most recent build manifest by default", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-lc-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE_TEMPLATE, workspace: ws });
  await orch.runBuild();
  const res = await orch.runDeploy();
  expect(res.exitCode).toBe(0);
});

test("runDeploy without a prior build fails with exit code 2", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-lc-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE_TEMPLATE, workspace: ws });
  const res = await orch.runDeploy();
  expect(res.exitCode).toBe(2);
});

test("runDev still resolves awaitDevReady when ready marker arrives early", async () => {
  // This reproduces the race where ##pneuma:ready fires before devReadyPromise is created.
  // In the pre-fix implementation this test hangs; we use a short fixture that emits ready
  // on the first tick and verify awaitDevReady resolves within a bounded time.
  const ws = mkdtempSync(join(tmpdir(), "pneuma-lc-race-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE_TEMPLATE, workspace: ws });
  const ready = orch.runDev();
  const start = Date.now();
  await orch.awaitDevReady();
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(3000);
  await orch.runStop();
  await ready;
});

test("runStop kills dev process when stop.sh times out", async () => {
  // Use a shorter stop-script timeout so the test finishes quickly. We'll test the
  // real-world behavior: stop.sh hangs, but dev process must still be killed.
  const SLOW_STOP_TEMPLATE = join(import.meta.dir, "fixtures/templates/fixture-slow-stop");
  const ws = mkdtempSync(join(tmpdir(), "pneuma-lc-slowstop-"));
  const orch = new LifecycleOrchestrator({
    templateDir: SLOW_STOP_TEMPLATE,
    workspace: ws,
    // Configure short stop-script timeout so the test doesn't block for 10s.
    stopScriptTimeoutMs: 500,
    stopSigtermTimeoutMs: 2000,
  });
  const running = orch.runDev();
  await orch.awaitDevReady();
  expect(orch.state.dev?.state).toBe("running");
  const start = Date.now();
  await orch.runStop();
  const elapsed = Date.now() - start;
  await running;
  expect(orch.state.dev?.state).toBe("stopped");
  // Must not wait for the full 60s stop.sh sleep.
  expect(elapsed).toBeLessThan(5000);
});

test("runBuild treats zero-exit without a manifest as a failed build", async () => {
  const BROKEN_TEMPLATE = join(import.meta.dir, "fixtures/templates/fixture-broken-build");
  const ws = mkdtempSync(join(tmpdir(), "pneuma-lc-brokenbuild-"));
  const orch = new LifecycleOrchestrator({ templateDir: BROKEN_TEMPLATE, workspace: ws });
  const res = await orch.runBuild();
  // No manifest means the build must not be considered successful. Either non-zero exit,
  // or at minimum an undefined manifestPath that downstream deploy refuses.
  expect(res.manifestPath).toBeUndefined();
  // And deploy must refuse (no prior successful build).
  const d = await orch.runDeploy();
  expect(d.exitCode).toBe(2);
});

test("runBuild followed by a broken build does not let deploy pick the stale manifest", async () => {
  // Reproduce the stale-deploy hazard: first a successful build writes manifest,
  // then a broken build fails to write. Deploy should refuse, not deploy the old one.
  const GOOD_TEMPLATE = FIXTURE_TEMPLATE;
  const BROKEN_TEMPLATE = join(import.meta.dir, "fixtures/templates/fixture-broken-build");
  const ws = mkdtempSync(join(tmpdir(), "pneuma-lc-stalestop-"));
  // Good build first (so a manifest is on disk).
  const orchGood = new LifecycleOrchestrator({ templateDir: GOOD_TEMPLATE, workspace: ws });
  const good = await orchGood.runBuild();
  expect(good.manifestPath).toBeDefined();
  // Broken build in the same workspace.
  const orchBroken = new LifecycleOrchestrator({ templateDir: BROKEN_TEMPLATE, workspace: ws });
  const broken = await orchBroken.runBuild();
  expect(broken.manifestPath).toBeUndefined();
  // Deploy after broken build. Must NOT pick the stale good manifest.
  // The orchestrator should know "last build failed" and refuse.
  const d = await orchBroken.runDeploy();
  expect(d.exitCode).toBe(2);
});

test("OrchestratorOptions.portHint is honored by runDev()", async () => {
  // Use a short-lived echo-the-env fixture via fixture-min, which already emits PNEUMA_WORKSPACE.
  // Construct with portHint; after ready, check the service URL contains that port.
  const ws = mkdtempSync(join(tmpdir(), "pneuma-lc-porthint-"));
  const orch = new LifecycleOrchestrator({
    templateDir: FIXTURE_TEMPLATE,
    workspace: ws,
    portHint: 38765,
  });
  const running = orch.runDev();
  await orch.awaitDevReady();
  const svc = orch.state.dev?.services[0];
  expect(svc?.url).toContain("38765");
  await orch.runStop();
  await running;
});

test("runDev resets stopInvoked so reused orchestrator can run a second dev cycle", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-lc-reuse-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE_TEMPLATE, workspace: ws });

  // First dev cycle: runDev → runStop → verify stopInvoked=true.
  const running1 = orch.runDev();
  await orch.awaitDevReady();
  await orch.runStop();
  await running1;
  expect(orch.stopInvoked).toBe(true);

  // Second dev cycle: runDev should reset the flag.
  const running2 = orch.runDev();
  expect(orch.stopInvoked).toBe(false);
  await orch.awaitDevReady();
  expect(orch.state.dev?.state).toBe("running");

  // Second runStop must actually execute, not short-circuit.
  await orch.runStop();
  await running2;
  expect(orch.stopInvoked).toBe(true);
  expect(orch.state.dev?.state).toBe("stopped");
});
