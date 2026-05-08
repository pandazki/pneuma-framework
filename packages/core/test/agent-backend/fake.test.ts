import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeAgentBackend } from "../../src/agent-backend/fake.js";
import { createFileBuildThreadStore } from "../../src/build-thread.js";
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

test("FakeAgentBackend runTurn appends BuildThread user turns and reuses thread session", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-fake-run-turn-"));
  try {
    const store = createFileBuildThreadStore({ workspace });
    const thread = await store.startThread({
      profile_id: "dev-board",
      app_id: "dev-board",
      builder_user_id: "builder",
    });
    const fb = new FakeAgentBackend();

    const first = await fb.runTurn({
      cwd: workspace,
      thread_store: store,
      thread_id: thread.thread_id,
      new_user_message: "add a widget",
      system_prompt: "You are the build agent.",
    });
    const second = await fb.runTurn({
      cwd: workspace,
      thread_store: store,
      thread_id: thread.thread_id,
      new_user_message: "tighten the spacing",
      system_prompt: "You are the build agent.",
    });

    expect(first.backend_session_cached).toBe(false);
    expect(second.backend_session_cached).toBe(true);
    expect(first.session.sessionId).toBe(second.session.sessionId);
    expect(fb.userMessages).toHaveLength(2);
    expect(fb.userMessages[0]?.text).toContain("add a widget");
    expect(fb.userMessages[1]?.text).toContain("tighten the spacing");
    expect(await store.listTurns(thread.thread_id)).toHaveLength(2);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
