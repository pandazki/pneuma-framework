import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../src/lifecycle.js";

const FIXTURE = join(import.meta.dir, "fixtures/templates/fixture-fork");

test("runFork() forwards source + target to fork.sh", async () => {
  const src = mkdtempSync(join(tmpdir(), "pneuma-fork-src-"));
  writeFileSync(join(src, "marker.txt"), "hello\n");
  const tgt = join(tmpdir(), `pneuma-fork-tgt-${Date.now()}`);
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: src });
  const res = await orch.runFork({ sourceWorkspace: src, targetWorkspace: tgt });
  expect(res.exitCode).toBe(0);
  expect(res.targetWorkspace).toBe(tgt);
  expect(readFileSync(join(tgt, "marker.txt"), "utf8")).toBe("hello\n");
});
