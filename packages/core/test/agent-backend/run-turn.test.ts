import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createFileBuildThreadStore,
  runAgentTurnThroughLaunchSend,
  type AgentRunTurnSessionCache,
  type AgentSession,
} from "../../src/index.js";

test("runAgentTurnThroughLaunchSend appends user turn, packs BuildThread context, and reuses backend session", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-run-turn-test-"));
  try {
    const store = createFileBuildThreadStore({ workspace });
    const thread = await store.startThread({
      profile_id: "dev-board",
      app_id: "dev-board",
      builder_user_id: "builder",
    });
    await store.appendTurn(thread.thread_id, {
      kind: "agent_proposal",
      proposal_id: "proposal-1",
      summary: "Add priority widget.",
      rationale: "The dashboard needs a triage surface.",
      tool_calls: [{ name: "add_widget", arguments: { slot_id: "dashboard-widget" } }],
    });
    await store.appendTurn(thread.thread_id, {
      kind: "host_execution_receipt",
      proposal_id: "proposal-1",
      status: "completed",
      evidence: { changed_files: ["src/widget.tsx"] },
    });

    const launched: AgentSession[] = [];
    const sent: Array<{ sessionId: string; text: string }> = [];
    let seq = 0;
    const sessionCache: AgentRunTurnSessionCache = new Map();

    const first = await runAgentTurnThroughLaunchSend({
      transport: {
        async launch(): Promise<AgentSession> {
          seq += 1;
          const session = { sessionId: `session-${seq}`, state: "ready" as const, startedAt: 123 };
          launched.push(session);
          return session;
        },
        async sendUserMessage(sessionId, text): Promise<void> {
          sent.push({ sessionId, text });
        },
      },
      session_cache: sessionCache,
      thread_store: store,
      thread_id: thread.thread_id,
      cwd: workspace,
      new_user_message: "Please add keyboard shortcuts too.",
      system_prompt: "You are the build agent.",
      context_snapshot: { app_id: "dev-board", profile_id: "local-sqlite" },
    });

    expect(first.backend_session_cached).toBe(false);
    expect(first.session.sessionId).toBe("session-1");
    expect(first.appended_user_turn.kind).toBe("user");
    expect(first.message_count).toBe(3);
    expect(sent[0]?.sessionId).toBe("session-1");
    expect(sent[0]?.text).toContain("You are the build agent.");
    expect(sent[0]?.text).toContain('"profile_id": "local-sqlite"');
    expect(sent[0]?.text).toContain("[pneuma:agent_proposal proposal_id=proposal-1]");
    expect(sent[0]?.text).toContain("[pneuma:host_execution_receipt proposal_id=proposal-1 status=completed]");
    expect(sent[0]?.text).toContain("Please add keyboard shortcuts too.");

    const second = await runAgentTurnThroughLaunchSend({
      transport: {
        async launch(): Promise<AgentSession> {
          throw new Error("launch should not run for cached thread session");
        },
        async sendUserMessage(sessionId, text): Promise<void> {
          sent.push({ sessionId, text });
        },
      },
      session_cache: sessionCache,
      thread_store: store,
      thread_id: thread.thread_id,
      cwd: workspace,
      new_user_message: "Use the compact layout.",
      system_prompt: "You are the build agent.",
    });

    expect(second.backend_session_cached).toBe(true);
    expect(second.session.sessionId).toBe("session-1");
    expect(launched).toHaveLength(1);
    expect(sent[1]?.sessionId).toBe("session-1");
    expect(sent[1]?.text).toContain("Use the compact layout.");
    expect(await store.listTurns(thread.thread_id)).toHaveLength(4);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
