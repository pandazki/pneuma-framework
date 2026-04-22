import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { FakeAgentBackend } from "../../src/agent-backend/fake.js";
import { createSessionRegistry } from "../../src/wire-protocol/session-registry.js";
import { attachBackendBridge } from "../../src/wire-protocol/bridge.js";
import type { WireEnvelope } from "../../src/wire-protocol/types.js";

const FIXTURE = join(import.meta.dir, "../fixtures/templates/fixture-min");

test("backend text events become a2v text envelopes with per-part deltas", async () => {
  const registry = createSessionRegistry();
  const orch = new LifecycleOrchestrator({
    templateDir: FIXTURE,
    workspace: mkdtempSync(join(tmpdir(), "pneuma-b2w-")),
  });
  const backend = new FakeAgentBackend();
  const session = registry.createSession("s1", { orchestrator: orch, backend });

  const sent: WireEnvelope[] = [];
  attachBackendBridge(session, backend, {
    broadcast: (sid, env) => { if (sid === "s1") sent.push(env); },
    autoAcceptPermissions: false,
  });

  const sess = await backend.launch({ cwd: "/tmp" });
  // Cumulative text growing across three ticks on the same partId.
  backend.simulate({
    type: "text", sessionId: sess.sessionId,
    payload: { part: { id: "p1", type: "text", text: "Hello" }, messageID: "m1" },
  });
  backend.simulate({
    type: "text", sessionId: sess.sessionId,
    payload: { part: { id: "p1", type: "text", text: "Hello, world" }, messageID: "m1" },
  });
  backend.simulate({
    type: "text", sessionId: sess.sessionId,
    payload: { part: { id: "p1", type: "text", text: "Hello, world!" }, messageID: "m1" },
  });

  const texts = sent.filter((e) => e.kind === "text");
  expect(texts.length).toBe(3);
  expect(texts.map((e) => e.kind === "text" && e.delta)).toEqual(["Hello", ", world", "!"]);
});

test("permission-request becomes a2v permission-prompt (no auto-accept)", async () => {
  const registry = createSessionRegistry();
  const orch = new LifecycleOrchestrator({
    templateDir: FIXTURE,
    workspace: mkdtempSync(join(tmpdir(), "pneuma-perm-")),
  });
  const backend = new FakeAgentBackend();
  const session = registry.createSession("s2", { orchestrator: orch, backend });

  const sent: WireEnvelope[] = [];
  attachBackendBridge(session, backend, {
    broadcast: (sid, env) => { if (sid === "s2") sent.push(env); },
    autoAcceptPermissions: false,
  });

  const sess = await backend.launch({ cwd: "/tmp" });
  backend.simulate({
    type: "permission-request", sessionId: sess.sessionId,
    payload: { requestId: "p42", toolName: "write", input: { path: "doc.md" } },
  });
  const prompt = sent.find((e) => e.kind === "permission-prompt");
  expect(prompt?.kind === "permission-prompt" && prompt.prompt.id).toBe("p42");
});

test("autoAcceptPermissions short-circuits: respondToPermission called immediately, no viewer envelope emitted", async () => {
  const registry = createSessionRegistry();
  const orch = new LifecycleOrchestrator({
    templateDir: FIXTURE,
    workspace: mkdtempSync(join(tmpdir(), "pneuma-auto-")),
  });
  const backend = new FakeAgentBackend();
  const session = registry.createSession("s3", { orchestrator: orch, backend });

  const sent: WireEnvelope[] = [];
  attachBackendBridge(session, backend, {
    broadcast: (sid, env) => { if (sid === "s3") sent.push(env); },
    autoAcceptPermissions: true,
  });

  const sess = await backend.launch({ cwd: "/tmp" });
  backend.simulate({
    type: "permission-request", sessionId: sess.sessionId,
    payload: { requestId: "p7", toolName: "write" },
  });
  await new Promise((r) => setTimeout(r, 10));
  expect(sent.find((e) => e.kind === "permission-prompt")).toBeUndefined();
  expect(backend.permissionDecisions).toEqual([{ requestId: "p7", decision: "allow" }]);
});
