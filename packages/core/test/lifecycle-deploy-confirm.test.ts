import { test, expect } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../src/lifecycle.js";

const GATED = join(import.meta.dir, "fixtures/templates/fixture-gated");
const UNGATED = join(import.meta.dir, "fixtures/templates/fixture-min");

test("runDeploy with unattendedDeploy:false blocks until resolveConfirm('deploy','deploy','yes')", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-deploy-gated-"));
  const orch = new LifecycleOrchestrator({ templateDir: GATED, workspace: ws });
  await orch.runBuild();

  const deployPromise = orch.runDeploy();

  for (let i = 0; i < 40; i++) {
    if (orch.state.lastDeploy?.pendingConfirm?.label === "deploy") break;
    await new Promise((r) => setTimeout(r, 25));
  }
  expect(orch.state.lastDeploy?.pendingConfirm?.label).toBe("deploy");
  expect(existsSync(join(ws, ".deploy-ran"))).toBe(false);

  await orch.resolveConfirm("deploy", "deploy", "yes");
  const res = await deployPromise;
  expect(res.exitCode).toBe(0);
  expect(existsSync(join(ws, ".deploy-ran"))).toBe(true);
});

test("runDeploy with unattendedDeploy:false + resolveConfirm('no') short-circuits with exit 3", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-deploy-no-"));
  const orch = new LifecycleOrchestrator({ templateDir: GATED, workspace: ws });
  await orch.runBuild();
  const deployPromise = orch.runDeploy();
  for (let i = 0; i < 40; i++) {
    if (orch.state.lastDeploy?.pendingConfirm?.label === "deploy") break;
    await new Promise((r) => setTimeout(r, 25));
  }
  await orch.resolveConfirm("deploy", "deploy", "no");
  const res = await deployPromise;
  expect(res.exitCode).toBe(3);
  expect(existsSync(join(ws, ".deploy-ran"))).toBe(false);
});

test("runDeploy with unattendedDeploy NOT set in manifest runs directly (backward compat)", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-deploy-ungated-"));
  const orch = new LifecycleOrchestrator({ templateDir: UNGATED, workspace: ws });
  await orch.runBuild();
  const res = await orch.runDeploy();
  expect(res.exitCode).toBe(0);
});
