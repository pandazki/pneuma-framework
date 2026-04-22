import { test, expect } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../src/lifecycle.js";

const FIXTURE = join(import.meta.dir, "fixtures/templates/fixture-setup");

test("runSetup spawns setup.sh and reports exit code", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-setup-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  const res = await orch.runSetup();
  expect(res.exitCode).toBe(0);
  expect(existsSync(join(ws, ".setup-ran"))).toBe(true);
});

test("runSetup throws if the template doesn't declare a setup script", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-setup-missing-"));
  const NO_SETUP = join(import.meta.dir, "fixtures/templates/fixture-min");
  const orch = new LifecycleOrchestrator({ templateDir: NO_SETUP, workspace: ws });
  await expect(orch.runSetup()).rejects.toThrow(/scripts\.setup/);
});
