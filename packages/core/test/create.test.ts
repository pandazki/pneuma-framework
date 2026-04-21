import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPneumaFramework } from "../src/index.js";

const FIXTURE_TEMPLATE = join(import.meta.dir, "fixtures/templates/fixture-min");

test("createPneumaFramework returns an orchestrator and close()", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-pub-"));
  const fw = createPneumaFramework({ templateDir: FIXTURE_TEMPLATE, workspace: ws });
  expect(fw.orchestrator).toBeDefined();
  expect(fw.state).toBe(fw.orchestrator.state);
  await fw.close();
});
