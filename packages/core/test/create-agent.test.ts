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
