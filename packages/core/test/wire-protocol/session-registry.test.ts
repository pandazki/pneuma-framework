import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { createSessionRegistry } from "../../src/wire-protocol/session-registry.js";

const FIXTURE = join(import.meta.dir, "../fixtures/templates/fixture-min");

function mkOrch() {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-sr-"));
  return new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
}

test("createSession stores + returns a live Session", () => {
  const reg = createSessionRegistry();
  const s = reg.createSession("sid-1", { orchestrator: mkOrch() });
  expect(s.sid).toBe("sid-1");
  expect(s.viewerSockets.size).toBe(0);
  expect(s.textDeltaState.size).toBe(0);
  expect(reg.getSession("sid-1")).toBe(s);
});

test("removeSession drops the entry and runs disposers", () => {
  const reg = createSessionRegistry();
  const s = reg.createSession("sid-2", { orchestrator: mkOrch() });
  let disposed = 0;
  s.disposers.push(() => { disposed += 1; });
  reg.removeSession("sid-2");
  expect(reg.getSession("sid-2")).toBeUndefined();
  expect(disposed).toBe(1);
});

test("listSessions returns all live sessions", () => {
  const reg = createSessionRegistry();
  reg.createSession("a", { orchestrator: mkOrch() });
  reg.createSession("b", { orchestrator: mkOrch() });
  expect(reg.listSessions().map((s) => s.sid).sort()).toEqual(["a", "b"]);
});

test("createSession rejects duplicate sid", () => {
  const reg = createSessionRegistry();
  reg.createSession("dup", { orchestrator: mkOrch() });
  expect(() => reg.createSession("dup", { orchestrator: mkOrch() })).toThrow(/already/i);
});
