import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { createCheckpoint } from "../../src/shadow-git.js";
import { createToolRegistry } from "../../src/tools/registry.js";
import { registerCheckpointTools } from "../../src/tools/checkpoint.js";

const FIXTURE = join(import.meta.dir, "../fixtures/templates/fixture-min");

async function mk() {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-tools-cp-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  // Give shadow-git init a beat (constructor kicks it off async).
  await new Promise((r) => setTimeout(r, 100));
  const reg = createToolRegistry({ orchestrator: orch });
  registerCheckpointTools(reg);
  return { orch, reg };
}

test("checkpoint.list returns recorded checkpoints", async () => {
  const { orch, reg } = await mk();
  writeFileSync(join(orch.workspace, "a.txt"), "one");
  await createCheckpoint(orch.workspace, "t1");
  writeFileSync(join(orch.workspace, "a.txt"), "two");
  await createCheckpoint(orch.workspace, "t2");
  const r = (await reg.call("checkpoint.list", {})) as { ok: boolean; state: { checkpoints: Array<{ label: string }> } };
  expect(r.ok).toBe(true);
  expect(r.state.checkpoints.map((c) => c.label)).toEqual(["t1", "t2"]);
});

test("checkpoint.rewind resets workspace to the given hash", async () => {
  const { orch, reg } = await mk();
  writeFileSync(join(orch.workspace, "a.txt"), "one");
  const h1 = await createCheckpoint(orch.workspace, "t1");
  writeFileSync(join(orch.workspace, "a.txt"), "two");
  await createCheckpoint(orch.workspace, "t2");
  const r = await reg.call("checkpoint.rewind", { hash: h1 });
  expect(r.ok).toBe(true);
  expect(readFileSync(join(orch.workspace, "a.txt"), "utf8")).toBe("one");
});
