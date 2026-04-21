import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPneumaFramework, FakeAgentBackend } from "../src/index.js";

const FIXTURE = join(import.meta.dir, "fixtures/templates/fixture-min");

test("createPneumaFramework exposes toolRegistry when no backend", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-create-tools-"));
  const fw = createPneumaFramework({ templateDir: FIXTURE, workspace: ws });
  expect(fw.toolRegistry.has("lifecycle.state")).toBe(true);
  await fw.close();
});

test("createPneumaFramework attaches a provided backend instance", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-create-fake-"));
  const fake = new FakeAgentBackend();
  const fw = createPneumaFramework({ templateDir: FIXTURE, workspace: ws, backend: fake });
  expect(fw.backend).toBe(fake);
  expect(fw.toolRegistry.has("lifecycle.state")).toBe(true);
  await fw.close();
});

test("createPneumaFramework.close() does not close a caller-owned backend", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-create-shared-"));
  const shared = new FakeAgentBackend();
  let closed = 0;
  const origClose = shared.close.bind(shared);
  shared.close = async () => { closed += 1; await origClose(); };
  // First framework wraps the shared backend.
  const fw1 = createPneumaFramework({ templateDir: FIXTURE, workspace: ws, backend: shared });
  await fw1.close();
  // Should NOT have closed the backend — caller owns the lifetime.
  expect(closed).toBe(0);
  // Still usable in another framework instance.
  const fw2 = createPneumaFramework({ templateDir: FIXTURE, workspace: ws, backend: shared });
  await fw2.close();
  expect(closed).toBe(0);
  // Caller explicitly closes when done.
  await shared.close();
  expect(closed).toBe(1);
});
