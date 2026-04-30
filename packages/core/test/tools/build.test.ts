import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { buildToolRegistry } from "../../src/tools/registry.js";

test("buildToolRegistry registers all spec §5 tools", () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-tools-build-"));
  const orch = new LifecycleOrchestrator({
    templateDir: join(import.meta.dir, "../fixtures/templates/fixture-min"),
    workspace: ws,
  });
  const reg = buildToolRegistry({ orchestrator: orch });
  const names = reg.list().map((t) => t.name).sort();
  expect(names).toEqual([
    "checkpoint.list",
    "checkpoint.rewind",
    "definition.apply",
    "definition.repair.reset_to_last_good",
    "definition.repair.status",
    "definition.rollback.execute",
    "definition.rollback.prepare",
    "lifecycle.build.run",
    "lifecycle.confirm",
    "lifecycle.deploy.run",
    "lifecycle.dev.restart",
    "lifecycle.dev.start",
    "lifecycle.dev.stop",
    "lifecycle.fork.run",
    "lifecycle.logs",
    "lifecycle.migrate.run",
    "lifecycle.setup.run",
    "lifecycle.state",
    "workspace.tree",
  ]);
});
