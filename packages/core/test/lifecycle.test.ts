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
