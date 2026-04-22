import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { FakeAgentBackend } from "../../src/agent-backend/fake.js";
import { createSessionRegistry } from "../../src/wire-protocol/session-registry.js";
import { handleViewerEnvelope } from "../../src/wire-protocol/bridge.js";

const FIXTURE = join(import.meta.dir, "../fixtures/templates/fixture-min");

async function mkSession() {
  const registry = createSessionRegistry();
  const orch = new LifecycleOrchestrator({
    templateDir: FIXTURE,
    workspace: mkdtempSync(join(tmpdir(), "pneuma-v2b-")),
  });
  const backend = new FakeAgentBackend();
  const session = registry.createSession("s", { orchestrator: orch, backend });
  const sess = await backend.launch({ cwd: "/tmp" });
  session.backendSessionId = sess.sessionId;
  return { session, backend, backendSess: sess };
}

test("focus envelope stores on session.currentFocus", async () => {
  const { session } = await mkSession();
  handleViewerEnvelope(session, {
    dir: "v2a", kind: "focus",
    focus: { file: "doc.md", element: { kind: "heading", index: 0, text: "Intro", level: 2 } },
  });
  expect(session.currentFocus?.file).toBe("doc.md");
  expect(session.currentFocus?.element?.kind).toBe("heading");
});

test("user-message action sends to backend, prefixed with focus context when present", async () => {
  const { session, backend, backendSess } = await mkSession();
  handleViewerEnvelope(session, {
    dir: "v2a", kind: "focus",
    focus: { file: "doc.md", element: { kind: "heading", index: 1, text: "API", level: 2 } },
  });
  handleViewerEnvelope(session, {
    dir: "v2a", kind: "action",
    action: { kind: "user-message", text: "rename this section" },
  });
  await new Promise((r) => setTimeout(r, 10));
  const msg = backend.userMessages.at(-1);
  expect(msg?.sessionId).toBe(backendSess.sessionId);
  expect(msg?.text).toContain("rename this section");
  expect(msg?.text).toMatch(/\[Context: file "doc\.md"\]/);
  expect(msg?.text).toMatch(/\[User selected: heading \(level 2\) "API"\]/);
});

test("user-message without focus sends the text as-is (no bracket prefix)", async () => {
  const { session, backend } = await mkSession();
  handleViewerEnvelope(session, {
    dir: "v2a", kind: "action",
    action: { kind: "user-message", text: "hello" },
  });
  await new Promise((r) => setTimeout(r, 10));
  const msg = backend.userMessages.at(-1);
  expect(msg?.text).toBe("hello");
});

test("permission-response is routed to backend.respondToPermission", async () => {
  const { session, backend } = await mkSession();
  handleViewerEnvelope(session, {
    dir: "v2a", kind: "permission-response",
    response: { id: "p9", decision: "deny" },
  });
  await new Promise((r) => setTimeout(r, 10));
  expect(backend.permissionDecisions).toEqual([{ requestId: "p9", decision: "deny" }]);
});

test("handleViewerEnvelope ignores click actions (v0 behavior)", async () => {
  const { session, backend } = await mkSession();
  handleViewerEnvelope(session, {
    dir: "v2a", kind: "action",
    action: { kind: "click", target: "save" },
  });
  await new Promise((r) => setTimeout(r, 10));
  expect(backend.userMessages.length).toBe(0);
});

test("handleViewerEnvelope drops v2a envelopes when no backend is attached", async () => {
  const registry = createSessionRegistry();
  const orch = new LifecycleOrchestrator({
    templateDir: FIXTURE,
    workspace: mkdtempSync(join(tmpdir(), "pneuma-v2b-nb-")),
  });
  // Session with NO backend.
  const session = registry.createSession("s-nb", { orchestrator: orch });
  // Should not throw, just silently ignore.
  expect(() =>
    handleViewerEnvelope(session, {
      dir: "v2a", kind: "action",
      action: { kind: "user-message", text: "hi" },
    }),
  ).not.toThrow();
});
