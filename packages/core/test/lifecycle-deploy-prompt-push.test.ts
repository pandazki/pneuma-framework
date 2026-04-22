import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator, type DeployPromptEnvelope } from "../src/lifecycle.js";

const GATED = join(import.meta.dir, "fixtures/templates/fixture-gated");

test("runDeploy with push hook set emits a2v permission-prompt when gated", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-deploy-push-"));
  const orch = new LifecycleOrchestrator({ templateDir: GATED, workspace: ws });
  await orch.runBuild();

  const pushed: DeployPromptEnvelope[] = [];
  orch.setDeployPushHook((env) => pushed.push(env));

  const deployPromise = orch.runDeploy();

  // Give the microtask a chance to run awaitDeployConfirm's side effects.
  for (let i = 0; i < 40; i++) {
    if (pushed.length > 0) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  expect(pushed.length).toBe(1);
  const env = pushed[0]!;
  expect(env.dir).toBe("a2v");
  expect(env.kind).toBe("permission-prompt");
  expect(env.prompt.tool).toBe("deploy");
  expect(env.prompt.id.startsWith("pneuma:deploy:")).toBe(true);

  // Viewer's Allow click round-trips through handleDeployPermissionResponse.
  const handled = orch.handleDeployPermissionResponse(env.prompt.id, "allow");
  expect(handled).toBe(true);

  const res = await deployPromise;
  expect(res.exitCode).toBe(0);
});

test("handleDeployPermissionResponse rejects unknown ids (forwards to backend)", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-deploy-push-foreign-"));
  const orch = new LifecycleOrchestrator({ templateDir: GATED, workspace: ws });
  // No active deploy yet → any id is foreign.
  expect(orch.handleDeployPermissionResponse("some-agent-tool-id", "allow")).toBe(false);
});

test("Deny routes to resolveConfirm('no') and deploy exits with code 3", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-deploy-push-deny-"));
  const orch = new LifecycleOrchestrator({ templateDir: GATED, workspace: ws });
  await orch.runBuild();

  const pushed: DeployPromptEnvelope[] = [];
  orch.setDeployPushHook((env) => pushed.push(env));

  const deployPromise = orch.runDeploy();
  for (let i = 0; i < 40; i++) {
    if (pushed.length > 0) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  expect(pushed.length).toBe(1);

  expect(orch.handleDeployPermissionResponse(pushed[0]!.prompt.id, "deny")).toBe(true);
  const res = await deployPromise;
  expect(res.exitCode).toBe(3);
});
