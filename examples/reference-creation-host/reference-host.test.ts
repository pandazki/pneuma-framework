import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { FileReleaseRolloutStore } from "@pneuma-framework/core";
import type {
  AgentBackend,
  AgentCapabilities,
  AgentEventHandler,
  AgentLaunchOptions,
  AgentRunTurnOptions,
  AgentRunTurnResult,
  AgentSession,
  PermissionResponse,
} from "@pneuma-framework/core";
import { createBackendReviewQueueDraftAgent } from "./src/host/code-agent.js";
import { createReferenceHost } from "./src/host/reference-host.js";

describe("reference creation host", () => {
  test("creates, evolves, rehearses, publishes, and rolls back Team Notes Board", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-reference-host-"));
    const host = createReferenceHost({ workspace });

    const project = await host.createProject({
      app_id: "team-notes",
      builder_user_id: "user:bob",
    });
    expect(project.version_id).toBe("v0");
    expect(project.notes.map((note) => note.title)).toEqual(["Design review", "Release checklist"]);

    const proposal = await host.requestReviewQueueEvolution({
      app_id: "team-notes",
      builder_subject: "user:bob",
      message: "Add a review queue so notes can be marked needs_review and approved.",
    });
    expect(proposal.status).toBe("awaiting_reviewer_approval");
    expect(proposal.review_packet.risk_classification).toContain("data_migration");

    const blocked = await host.approveEvolution({
      app_id: "team-notes",
      proposal_id: proposal.proposal_id,
      subject: "user:bob",
    });
    expect(blocked.status).toBe("blocked");
    expect(blocked.reason).toBe("missing-required-approval");

    const approved = await host.approveEvolution({
      app_id: "team-notes",
      proposal_id: proposal.proposal_id,
      subject: "user:alice",
    });
    expect(approved.status).toBe("ready_to_preview");
    expect(approved.data_receipt?.status).toBe("completed");

    const preview = await host.startPreview({ app_id: "team-notes" });
    expect(preview.url).toContain("http://127.0.0.1:");

    const published = await host.publish({ app_id: "team-notes" });
    expect(published.status).toBe("published");
    expect(published.notes.every((note) => "review_status" in note)).toBe(true);

    const rolledBack = await host.rollback({ app_id: "team-notes" });
    expect(rolledBack.status).toBe("rolled_back");
    expect(rolledBack.active_version_id).toBe("v0");
    rmSync(workspace, { recursive: true, force: true });
  });

  test("can use a backend code agent to create the draft before governance review", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-reference-host-backend-agent-"));
    const backend = new TestCodeAgentBackend();
    const host = createReferenceHost({
      workspace,
      draft_agent: createBackendReviewQueueDraftAgent({ backend, timeout_ms: 100 }),
    });
    try {
      await host.createProject({
        app_id: "team-notes",
        builder_user_id: "user:bob",
      });
      const proposal = await host.requestReviewQueueEvolution({
        app_id: "team-notes",
        builder_subject: "user:bob",
        message: "Add a review queue so notes can be marked needs_review and approved.",
      });

      expect(proposal.status).toBe("awaiting_reviewer_approval");
      expect(host.state()?.pending_evolution?.code_agent_receipt).toMatchObject({
        backend_type: "test-code-agent",
        status: "completed",
      });
      expect(backend.lastCwd).toContain("draft");
    } finally {
      await host.close();
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("keeps rollout state isolated per generated application", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-reference-host-rollout-isolation-"));
    const host = createReferenceHost({ workspace });
    try {
      await host.createProject({
        app_id: "team-notes-a",
        builder_user_id: "user:bob",
      });
      await host.createProject({
        app_id: "team-notes-b",
        builder_user_id: "user:charlie",
      });

      const aRollout = await new FileReleaseRolloutStore({
        workspace: join(workspace, "rollout", "team-notes-a"),
      }).load();
      const bRollout = await new FileReleaseRolloutStore({
        workspace: join(workspace, "rollout", "team-notes-b"),
      }).load();

      expect(aRollout.active?.candidate_id).toBe("v0");
      expect(bRollout.active?.candidate_id).toBe("v0");
      expect(aRollout.timeline).toHaveLength(2);
      expect(bRollout.timeline).toHaveLength(2);
    } finally {
      await host.close();
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});

class TestCodeAgentBackend implements AgentBackend {
  readonly type = "test-code-agent";
  readonly capabilities: AgentCapabilities = {
    streaming: false,
    resume: false,
    permissions: false,
    toolProgress: false,
    modelSwitch: false,
  };
  lastCwd = "";

  async launch(_opts: AgentLaunchOptions): Promise<AgentSession> {
    return { sessionId: "test-code-agent-session", state: "ready", startedAt: Date.now() };
  }

  async runTurn(opts: AgentRunTurnOptions): Promise<AgentRunTurnResult> {
    this.lastCwd = opts.cwd;
    const appended = await opts.thread_store.appendTurn(opts.thread_id, {
      kind: "user",
      text: opts.new_user_message,
    });
    writeFileSync(
      join(opts.cwd, "src/app.ts"),
      `export const teamNotesFields = ["title", "body", "owner", "status", "review_status"];\n`,
      "utf8",
    );
    return {
      thread_id: opts.thread_id,
      session: await this.launch({ cwd: opts.cwd }),
      backend_session_cached: false,
      appended_user_turn: appended,
      messages: [],
      message_count: 0,
      prompt: opts.new_user_message,
    };
  }

  async sendUserMessage(_sessionId: string, _text: string): Promise<void> {}
  async respondToPermission(_sessionId: string, _response: PermissionResponse): Promise<void> {}
  onEvent(_handler: AgentEventHandler): () => void {
    return () => undefined;
  }
  async stop(_sessionId: string): Promise<void> {}
  async close(): Promise<void> {}
}
