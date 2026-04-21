import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { createToolRegistry } from "../../src/tools/registry.js";
import { registerObservationTools } from "../../src/tools/observation.js";

const FIXTURE = join(import.meta.dir, "../fixtures/templates/fixture-min");

async function mkRegistry(): Promise<{ orch: LifecycleOrchestrator; call: (n: string, p?: Record<string, unknown>) => Promise<unknown> }> {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-tools-obs-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  const reg = createToolRegistry({ orchestrator: orch });
  registerObservationTools(reg);
  return { orch, call: (n, p) => reg.call(n, p ?? {}) };
}

test("lifecycle.state returns the current state object", async () => {
  const { call } = await mkRegistry();
  const r = (await call("lifecycle.state")) as { ok: boolean; state: { workspace: { root: string } } };
  expect(r.ok).toBe(true);
  expect(r.state.workspace.root).toMatch(/pneuma-tools-obs-/);
});

test("lifecycle.logs returns logged lines after a build", async () => {
  const { orch, call } = await mkRegistry();
  await orch.runBuild();
  const r = (await call("lifecycle.logs", { verb: "build", limit: 10 })) as { ok: boolean; state: { lines: unknown[] } };
  expect(r.ok).toBe(true);
  expect(Array.isArray(r.state.lines)).toBe(true);
  expect(r.state.lines.length).toBeGreaterThan(0);
});

test("workspace.tree returns a shallow directory listing", async () => {
  const { orch, call } = await mkRegistry();
  mkdirSync(join(orch.workspace, "src"), { recursive: true });
  writeFileSync(join(orch.workspace, "src/a.txt"), "hi");
  writeFileSync(join(orch.workspace, "readme.md"), "r");
  const r = (await call("workspace.tree", { depth: 1 })) as { ok: boolean; state: { entries: Array<{ name: string; type: string }> } };
  const names = r.state.entries.map((e) => e.name).sort();
  expect(names).toContain("readme.md");
  expect(names).toContain("src");
});

test("workspace.tree does not recurse into symlinked directories", async () => {
  const { orch, call } = await mkRegistry();
  // Create an external directory that a workspace symlink could leak.
  const outside = mkdtempSync(join(tmpdir(), "pneuma-outside-"));
  writeFileSync(join(outside, "secret.txt"), "should not appear");
  symlinkSync(outside, join(orch.workspace, "linked"));
  const r = (await call("workspace.tree", { depth: 3 })) as {
    ok: boolean;
    state: { entries: Array<{ name: string; type: string; children?: unknown[] }> };
  };
  const linked = r.state.entries.find((e) => e.name === "linked");
  expect(linked).toBeDefined();
  expect(linked?.type).toBe("file"); // symlink surfaced as file, no children
  expect(linked?.children).toBeUndefined();
});
