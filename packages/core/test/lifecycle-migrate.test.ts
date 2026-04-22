import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../src/lifecycle.js";

const FIXTURE = join(import.meta.dir, "fixtures/templates/fixture-migrate");

test("runMigrate() defaults to direction=up", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-migrate-up-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  const res = await orch.runMigrate();
  expect(res.exitCode).toBe(0);
  expect(res.direction).toBe("up");
  expect(readFileSync(join(ws, ".migrate-direction"), "utf8").trim()).toBe("up");
});

test("runMigrate({ direction: 'down' }) forwards the env var", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-migrate-down-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  const res = await orch.runMigrate({ direction: "down" });
  expect(res.direction).toBe("down");
  expect(readFileSync(join(ws, ".migrate-direction"), "utf8").trim()).toBe("down");
});
