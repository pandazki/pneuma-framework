import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { createToolRegistry } from "../../src/tools/registry.js";
import { registerActionTools } from "../../src/tools/action.js";

const FIXTURE = join(import.meta.dir, "../fixtures/templates/fixture-min");

async function mkRegistry() {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-tools-act-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  const reg = createToolRegistry({ orchestrator: orch });
  registerActionTools(reg);
  return { orch, reg };
}

test("lifecycle.dev.start launches dev and awaits ready", async () => {
  const { orch, reg } = await mkRegistry();
  const p = reg.call("lifecycle.dev.start", {});
  const r = await p;
  expect(r.ok).toBe(true);
  expect(orch.state.dev?.state).toBe("running");
  await reg.call("lifecycle.dev.stop", {});
  expect(orch.state.dev?.state).toBe("stopped");
});

test("lifecycle.dev.start returns an error (not hang) when dev exits before ready", async () => {
  const CRASH_TPL = join(import.meta.dir, "../fixtures/templates/fixture-dev-crashes");
  const ws = mkdtempSync(join(tmpdir(), "pneuma-tools-dev-crash-"));
  const orch = new LifecycleOrchestrator({ templateDir: CRASH_TPL, workspace: ws });
  const reg = createToolRegistry({ orchestrator: orch });
  registerActionTools(reg);
  const r = await reg.call("lifecycle.dev.start", {});
  expect(r.ok).toBe(false);
  expect(r.error).toMatch(/exited before ready/i);
});

test("lifecycle.dev.start rejects a duplicate call while dev is already running", async () => {
  const { orch, reg } = await mkRegistry();
  const first = await reg.call("lifecycle.dev.start", {});
  expect(first.ok).toBe(true);
  const second = await reg.call("lifecycle.dev.start", {});
  expect(second.ok).toBe(false);
  expect(second.error).toMatch(/already running/i);
  await reg.call("lifecycle.dev.stop", {});
  expect(orch.state.dev?.state).toBe("stopped");
});

test("lifecycle.build.run returns manifest path on success", async () => {
  const { reg } = await mkRegistry();
  const r = (await reg.call("lifecycle.build.run", {})) as { ok: boolean; state: { manifestPath?: string } };
  expect(r.ok).toBe(true);
  expect(r.state.manifestPath).toMatch(/build\.manifest\.json$/);
});

test("lifecycle.deploy.run refuses without a prior build", async () => {
  const { reg } = await mkRegistry();
  const r = await reg.call("lifecycle.deploy.run", {});
  expect(r.ok).toBe(false);
  expect(r.error).toMatch(/no build|manifest/i);
});

test("lifecycle.migrate.run and lifecycle.fork.run are stubs returning not-implemented", async () => {
  const { reg } = await mkRegistry();
  const m = await reg.call("lifecycle.migrate.run", {});
  const f = await reg.call("lifecycle.fork.run", { source: "./other" });
  expect(m.ok).toBe(false);
  expect(m.error).toMatch(/not implemented/i);
  expect(f.ok).toBe(false);
  expect(f.error).toMatch(/not implemented/i);
});

test("lifecycle.confirm routes through resolveConfirm", async () => {
  const CONFIRM_TPL = join(import.meta.dir, "../fixtures/templates/fixture-confirm");
  const ws = mkdtempSync(join(tmpdir(), "pneuma-tools-confirm-"));
  const orch = new LifecycleOrchestrator({ templateDir: CONFIRM_TPL, workspace: ws });
  const reg = createToolRegistry({ orchestrator: orch });
  registerActionTools(reg);
  const running = orch.runDev();
  for (let i = 0; i < 40; i++) {
    if (orch.state.dev?.pendingConfirm?.label === "demo") break;
    await new Promise((r) => setTimeout(r, 50));
  }
  const r = await reg.call("lifecycle.confirm", { verb: "dev", label: "demo", decision: "yes" });
  expect(r.ok).toBe(true);
  await orch.awaitDevReady();
  await orch.runStop();
  await running;
});
