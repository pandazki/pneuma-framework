import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPneumaFramework, FakeAgentBackend } from "../src/index.js";

const FIXTURE = join(import.meta.dir, "fixtures/templates/fixture-min");

test("agent drives the orchestrator: state -> build -> deploy via the tool registry", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-e2e-agent-"));
  const fake = new FakeAgentBackend();
  const fw = createPneumaFramework({ templateDir: FIXTURE, workspace: ws, backend: fake });

  // Simulate what an agent would do: inspect state, run build, fetch logs, deploy.
  const state1 = await fw.toolRegistry.call("lifecycle.state", {});
  expect(state1.ok).toBe(true);

  const build = (await fw.toolRegistry.call("lifecycle.build.run", {})) as { ok: boolean; state: { manifestPath?: string } };
  expect(build.ok).toBe(true);
  expect(build.state.manifestPath).toMatch(/build\.manifest\.json$/);

  const logs = (await fw.toolRegistry.call("lifecycle.logs", { verb: "build", limit: 100 })) as { ok: boolean; state: { lines: unknown[] } };
  expect(logs.ok).toBe(true);
  expect(logs.state.lines.length).toBeGreaterThan(0);

  const deploy = await fw.toolRegistry.call("lifecycle.deploy.run", {});
  expect(deploy.ok).toBe(true);

  await fw.close();
});

test("agent driving sequence with a launched backend session", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-e2e-session-"));
  const fake = new FakeAgentBackend();
  const fw = createPneumaFramework({ templateDir: FIXTURE, workspace: ws, backend: fake });

  const sess = await fake.launch({ cwd: ws });
  expect(sess.state).toBe("ready");

  // Agent runs a tool, receives back structured result.
  const r = await fw.toolRegistry.call("workspace.tree", { depth: 1 });
  expect(r.ok).toBe(true);

  await fw.close();
  expect(fake.permissionDecisions).toHaveLength(0);
});
