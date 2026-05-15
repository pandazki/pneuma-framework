import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  createFileBuildThreadStore,
  type AgentBackend,
  type AgentCapabilities,
  type AgentEvent,
  type AgentEventHandler,
  type AgentLaunchOptions,
  type AgentRunTurnOptions,
  type AgentRunTurnResult,
  type AgentSession,
  type PermissionResponse,
} from "@pneuma-framework/core";
import { runHostKitCodeAgentDraft } from "../src/code-agent.js";

describe("runHostKitCodeAgentDraft", () => {
  test("runs a backend code agent against the draft workspace and records evidence", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-host-kit-code-agent-"));
    try {
      const draftRoot = join(workspace, "draft");
      mkdirSync(join(draftRoot, "src"), { recursive: true });
      writeFileSync(join(draftRoot, "src/app.ts"), `export const fields = ["title"];\n`, "utf8");

      const threadStore = createFileBuildThreadStore({ workspace });
      const thread = await threadStore.startThread({
        profile_id: "local-bun",
        app_id: "team-notes",
        builder_user_id: "user:bob",
      });
      const backend = new DraftWritingBackend((cwd) => {
        writeFileSync(join(cwd, "src/app.ts"), `export const fields = ["title", "review_status"];\n`, "utf8");
      });

      const result = await runHostKitCodeAgentDraft({
        app_id: "team-notes",
        proposal_id: "proposal-review-queue",
        backend,
        thread_store: threadStore,
        thread_id: thread.thread_id,
        cwd: draftRoot,
        new_user_message: "Add review_status.",
        system_prompt: "Edit only the draft workspace.",
        verify_draft: async () => {
          const text = readFileSync(join(draftRoot, "src/app.ts"), "utf8");
          return {
            ok: text.includes("review_status"),
            message: "review_status is present",
            changed_paths: ["src/app.ts"],
          };
        },
        timeout_ms: 100,
        poll_interval_ms: 1,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.reason);
      expect(result.receipt.backend_type).toBe("draft-writer");
      expect(result.receipt.status).toBe("completed");
      expect(result.receipt.changed_paths).toEqual(["src/app.ts"]);
      const turns = await threadStore.listTurns(thread.thread_id);
      expect(turns.map((turn) => turn.kind)).toEqual(["user", "host_event"]);
      expect(turns[1]).toMatchObject({ kind: "host_event", label: "code_agent_draft" });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("fails closed when the backend completes but the draft never verifies", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-host-kit-code-agent-fail-"));
    try {
      const draftRoot = join(workspace, "draft");
      mkdirSync(draftRoot, { recursive: true });
      const threadStore = createFileBuildThreadStore({ workspace });
      const thread = await threadStore.startThread({
        profile_id: "local-bun",
        app_id: "team-notes",
        builder_user_id: "user:bob",
      });
      const backend = new DraftWritingBackend(() => undefined);

      const result = await runHostKitCodeAgentDraft({
        app_id: "team-notes",
        proposal_id: "proposal-review-queue",
        backend,
        thread_store: threadStore,
        thread_id: thread.thread_id,
        cwd: draftRoot,
        new_user_message: "Add review_status.",
        system_prompt: "Edit only the draft workspace.",
        verify_draft: async () => ({ ok: false, message: "review_status missing" }),
        timeout_ms: 5,
        poll_interval_ms: 1,
      });

      expect(result.ok).toBe(false);
      expect(result).toMatchObject({ ok: false, reason: "draft_verification_failed" });
      const turns = await threadStore.listTurns(thread.thread_id);
      expect(turns.at(-1)).toMatchObject({
        kind: "host_event",
        label: "code_agent_draft_failed",
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

class DraftWritingBackend implements AgentBackend {
  readonly type = "draft-writer";
  readonly capabilities: AgentCapabilities = {
    streaming: false,
    resume: false,
    permissions: false,
    toolProgress: false,
    modelSwitch: false,
  };
  private readonly handlers = new Set<AgentEventHandler>();

  constructor(private readonly writeDraft: (cwd: string) => void) {}

  async launch(_opts: AgentLaunchOptions): Promise<AgentSession> {
    return { sessionId: "draft-writer-session", state: "ready", startedAt: Date.now() };
  }

  async runTurn(opts: AgentRunTurnOptions): Promise<AgentRunTurnResult> {
    const appended = await opts.thread_store.appendTurn(opts.thread_id, {
      kind: "user",
      text: opts.new_user_message,
    });
    this.writeDraft(opts.cwd);
    const session = await this.launch({ cwd: opts.cwd });
    return {
      thread_id: opts.thread_id,
      session,
      backend_session_cached: false,
      appended_user_turn: appended,
      messages: [],
      message_count: 0,
      prompt: opts.new_user_message,
    };
  }

  async sendUserMessage(_sessionId: string, _text: string): Promise<void> {}
  async respondToPermission(_sessionId: string, _response: PermissionResponse): Promise<void> {}
  onEvent(handler: AgentEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  async stop(_sessionId: string): Promise<void> {}
  async close(): Promise<void> {
    this.handlers.clear();
  }
  simulate(event: AgentEvent): void {
    for (const handler of this.handlers) handler(event);
  }
}
