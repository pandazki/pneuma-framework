import { test, expect } from "bun:test";
import { FakeAgentBackend } from "../../src/agent-backend/fake.js";
import type { AgentEvent } from "../../src/agent-backend/types.js";

test("FakeAgentBackend lifecycle: launch -> ready -> events -> stop", async () => {
  const fb = new FakeAgentBackend();
  const events: AgentEvent[] = [];
  fb.onEvent((e) => events.push(e));
  const sess = await fb.launch({ cwd: "/tmp/ws" });
  expect(sess.state).toBe("ready");
  expect(events[0]?.type).toBe("session-ready");

  await fb.sendUserMessage(sess.sessionId, "hello");
  fb.simulate({ type: "text", sessionId: sess.sessionId, payload: { text: "hi back" } });
  expect(events.at(-1)?.type).toBe("text");

  await fb.stop(sess.sessionId);
  expect(events.at(-1)?.type).toBe("session-exited");
  await fb.close();
});

test("FakeAgentBackend does not re-emit session-exited on stop+close", async () => {
  const fb = new FakeAgentBackend();
  const exited: string[] = [];
  fb.onEvent((e) => { if (e.type === "session-exited") exited.push(e.sessionId); });
  const sess = await fb.launch({ cwd: "/tmp/ws" });
  await fb.stop(sess.sessionId);
  await fb.close(); // should not re-stop the already-exited session
  expect(exited).toEqual([sess.sessionId]);
});

test("FakeAgentBackend supports permission flow", async () => {
  const fb = new FakeAgentBackend();
  const events: AgentEvent[] = [];
  fb.onEvent((e) => events.push(e));
  const sess = await fb.launch({ cwd: "/tmp/ws" });
  fb.simulate({
    type: "permission-request",
    sessionId: sess.sessionId,
    payload: { requestId: "p1", toolName: "shell", input: { cmd: "ls" } },
  });
  const preCount = events.length;
  await fb.respondToPermission(sess.sessionId, { requestId: "p1", decision: "allow" });
  expect(fb.permissionDecisions).toEqual([{ requestId: "p1", decision: "allow" }]);
  expect(events.length).toBe(preCount); // respondToPermission doesn't emit
});
