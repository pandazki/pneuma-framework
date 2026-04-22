import { test, expect } from "bun:test";
import { mkdtempSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { createToolRegistry } from "../../src/tools/registry.js";
import { registerActionTools } from "../../src/tools/action.js";

const SETUP = join(import.meta.dir, "../fixtures/templates/fixture-setup");
const MIGRATE = join(import.meta.dir, "../fixtures/templates/fixture-migrate");
const FORK = join(import.meta.dir, "../fixtures/templates/fixture-fork");

test("lifecycle.setup.run routes to runSetup", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-tool-setup-"));
  const orch = new LifecycleOrchestrator({ templateDir: SETUP, workspace: ws });
  const reg = createToolRegistry({ orchestrator: orch });
  registerActionTools(reg);
  const r = await reg.call("lifecycle.setup.run", {});
  expect(r.ok).toBe(true);
  expect(existsSync(join(ws, ".setup-ran"))).toBe(true);
});

test("lifecycle.migrate.run routes to runMigrate with direction", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-tool-migrate-"));
  const orch = new LifecycleOrchestrator({ templateDir: MIGRATE, workspace: ws });
  const reg = createToolRegistry({ orchestrator: orch });
  registerActionTools(reg);
  const r = await reg.call("lifecycle.migrate.run", { direction: "up" });
  expect(r.ok).toBe(true);
  expect(readFileSync(join(ws, ".migrate-direction"), "utf8").trim()).toBe("up");
});

test("lifecycle.fork.run routes to runFork", async () => {
  const src = mkdtempSync(join(tmpdir(), "pneuma-tool-fork-src-"));
  writeFileSync(join(src, "marker.txt"), "hi\n");
  const tgt = join(tmpdir(), `pneuma-tool-fork-tgt-${Date.now()}`);
  const orch = new LifecycleOrchestrator({ templateDir: FORK, workspace: src });
  const reg = createToolRegistry({ orchestrator: orch });
  registerActionTools(reg);
  const r = (await reg.call("lifecycle.fork.run", { source: src, target: tgt })) as {
    ok: boolean; state: { targetWorkspace: string };
  };
  expect(r.ok).toBe(true);
  expect(r.state.targetWorkspace).toBe(tgt);
  expect(readFileSync(join(tgt, "marker.txt"), "utf8")).toBe("hi\n");
});
