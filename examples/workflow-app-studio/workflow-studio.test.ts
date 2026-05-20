import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
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
import { runAgentTurnThroughLaunchSend } from "@pneuma-framework/core";
import { transitionWorkflowRecord } from "./src/domain/workflow-app.js";
import { slaWorkflowAppModuleSource } from "./src/host/generated-app-module.js";
import { createBackendWorkflowDraftAgent, verifyWorkflowDraft } from "./src/host/workflow-code-agent.js";
import { createWorkflowAppStudio, createWorkflowRecord } from "./src/host/workflow-studio.js";

function workspace(): string {
  return mkdtempSync(join(tmpdir(), "pneuma-workflow-studio-test-"));
}

describe("workflow app studio host flow", () => {
  test("creates, evolves, approves, previews, publishes, shares, forks, and rolls back a workflow app", async () => {
    const host = createWorkflowAppStudio({
      workspace: workspace(),
      base_url: "http://127.0.0.1:0",
    });
    try {
      const bob = await host.createProject({
        name: "Vendor Intake Portal",
        goal: "Collect vendor requests, review risk, and approve onboarding.",
        template_id: "vendor_intake",
        builder_subject: "user:bob",
      });
      expect(bob.app_id).toBe("vendor-intake-portal");
      expect(host.snapshot().projects[0]?.current_version?.source.workflow.views.map((view) => view.kind)).toEqual(["form", "queue", "detail"]);

      await host.startPreview({ app_id: bob.app_id, preview_id: "preview-v0" });
      const v0Publish = await host.publish({ app_id: bob.app_id });
      expect(v0Publish.version_id).toBe("v0");

      await host.requestEvolution({
        app_id: bob.app_id,
        builder_subject: "user:bob",
        message: "Add a legal review stage before approval and require contract value for high-risk vendors.",
      });
      let project = host.snapshot().projects.find((item) => item.app_id === bob.app_id);
      expect(project?.pending_evolution?.summary).toBe("Add legal review to the workflow before approval.");
      expect(project?.pending_evolution?.changed_files).toEqual(["src/app.ts"]);
      expect(project?.pending_evolution?.highlights.join(" ")).toContain("Legal review");
      expect(project?.pending_evolution?.agent_mode).toBe("deterministic");
      expect(project?.pending_evolution?.review_packet.proposed_changes.map((change) => change.kind)).toContain("source");

      const approved = await host.approveEvolution({ app_id: bob.app_id, subject: "user:bob" });
      expect(approved.status).toBe("ready_to_preview");
      if (approved.status === "ready_to_preview") expect(approved.migrated_records).toBe(2);

      const preview = await host.startPreview({ app_id: bob.app_id, preview_id: "preview-v1" });
      expect(preview.url).toContain(`/preview/${bob.app_id}`);
      const published = await host.publish({ app_id: bob.app_id });
      expect(published.version_id).toBe("v1");
      project = host.snapshot().projects.find((item) => item.app_id === bob.app_id);
      expect(project?.current_version?.source.workflow.stages.map((stage) => stage.id)).toContain("legal_review");
      expect(project?.current_version?.source.app_code).toContain("legal_review");
      expect(project?.current_version?.records[0]?.values.contract_value).toBeDefined();

      const share = await host.share({ app_id: bob.app_id });
      expect(share.manifest.source_snapshot.workflow.stages.map((stage) => stage.id)).toContain("legal_review");
      const charlie = await host.fork({
        artifact_id: share.artifact_id,
        name: "Partner Intake Portal",
        builder_subject: "user:charlie",
      });
      expect(charlie.source_app_id).toBe(bob.app_id);
      expect(host.snapshot().projects.find((item) => item.app_id === charlie.app_id)?.current_version?.source.workflow.title).toBe("Partner Intake Portal");

      const rollback = await host.rollback({ app_id: bob.app_id });
      expect(rollback.active_version_id).toBe("v0");
    } finally {
      await host.close();
    }
  });

  test("generated runtime records can be created and transitioned through workflow rules", async () => {
    const host = createWorkflowAppStudio({
      workspace: workspace(),
      base_url: "http://127.0.0.1:0",
    });
    try {
      const project = await host.createProject({
        name: "Vendor Intake Portal",
        goal: "Collect vendor requests.",
        template_id: "vendor_intake",
        builder_subject: "user:bob",
      });
      const version = host.store.currentVersion(project.app_id);
      const record = createWorkflowRecord(version.source, {
        title: "New analytics vendor",
        owner: "Dana",
        values: { vendor_name: "Amplitude", requestor: "Dana", category: "software", risk_level: "medium" },
      });
      const transitioned = transitionWorkflowRecord(version.source.workflow, record, {
        action_id: "submit_for_business_review",
        actor_role: "operations",
        actor_subject: "user:bob",
      });

      expect(record.stage).toBe("submitted");
      expect(transitioned.stage).toBe("business_review");
      expect(transitioned.history).toHaveLength(1);
    } finally {
      await host.close();
    }
  });

  test("demo reset clears projects, pending proposals, shares, and BuildThread state", async () => {
    const root = workspace();
    const host = createWorkflowAppStudio({
      workspace: root,
      base_url: "http://127.0.0.1:0",
    });
    try {
      const project = await host.createProject({
        name: "Vendor Intake Portal",
        goal: "Collect vendor requests.",
        template_id: "vendor_intake",
        builder_subject: "user:bob",
      });
      await host.requestEvolution({
        app_id: project.app_id,
        builder_subject: "user:bob",
        message: "Add a legal review stage before approval.",
      });

      expect(host.snapshot().projects).toHaveLength(1);
      expect(host.snapshot().projects[0]?.pending_evolution?.thread_id).toBeTruthy();
      expect(existsSync(host.store.projectDir(project.app_id))).toBe(true);
      expect(existsSync(join(root, ".pneuma"))).toBe(true);

      await host.resetForDemo();

      expect(host.snapshot().projects).toHaveLength(0);
      expect(host.snapshot().shares).toHaveLength(0);
      expect(existsSync(host.store.projectDir(project.app_id))).toBe(false);
      expect(existsSync(join(root, ".pneuma"))).toBe(false);
    } finally {
      await host.close();
    }
  });

  test("backend draft agent path edits src/app.ts before governed approval", async () => {
    const backend = new FileEditingBackend(() => slaWorkflowAppModuleSource());
    const host = createWorkflowAppStudio({
      workspace: workspace(),
      base_url: "http://127.0.0.1:0",
      draft_agent: createBackendWorkflowDraftAgent({
        backend,
        model: "fake/provider",
        timeout_ms: 5_000,
      }),
    });
    try {
      const project = await host.createProject({
        name: "Vendor Intake Portal",
        goal: "Collect vendor requests.",
        template_id: "vendor_intake",
        builder_subject: "user:bob",
      });

      await host.requestEvolution({
        app_id: project.app_id,
        builder_subject: "user:bob",
        message: "Add SLA tracking with due dates and overdue status.",
      });

      const pending = host.snapshot().projects[0]?.pending_evolution;
      expect(pending?.agent_mode).toBe("opencode");
      expect(pending?.changed_files).toEqual(["src/app.ts"]);
      expect(pending?.agent_logs.map((entry) => entry.kind)).toContain("session");
      expect(backend.userMessages.at(-1)?.text).toContain("Only src/app.ts changes");

      const approved = await host.approveEvolution({ app_id: project.app_id, subject: "user:bob" });
      expect(approved.status).toBe("ready_to_preview");
      const version = host.snapshot().projects[0]?.current_version;
      expect(version?.source.workflow.fields.map((field) => field.id)).toContain("due_date");
      expect(version?.source.workflow.fields.map((field) => field.id)).toContain("sla_status");
      expect(version?.source.app_code).toContain("sla_watch");
    } finally {
      await host.close();
    }
  });

  test("draft verification fails closed when agent edits generated definition files directly", async () => {
    const host = createWorkflowAppStudio({
      workspace: workspace(),
      base_url: "http://127.0.0.1:0",
    });
    try {
      const project = await host.createProject({
        name: "Vendor Intake Portal",
        goal: "Collect vendor requests.",
        template_id: "vendor_intake",
        builder_subject: "user:bob",
      });
      host.store.resetDraftFromSource(project.app_id);
      writeFileSync(join(host.store.draftRoot(project.app_id), "src", "workflow.json"), "{}\n");
      const result = await verifyWorkflowDraft(
        host.store.sourceRoot(project.app_id),
        host.store.draftRoot(project.app_id),
        "Add SLA tracking.",
      );
      expect(result.ok).toBe(false);
      expect(result.message).toContain("unsupported files");
    } finally {
      await host.close();
    }
  });
});

const FAKE_CAPS: AgentCapabilities = {
  streaming: true,
  resume: false,
  permissions: true,
  toolProgress: true,
  modelSwitch: true,
};

class FileEditingBackend implements AgentBackend {
  readonly type = "opencode";
  readonly capabilities = FAKE_CAPS;
  readonly userMessages: Array<{ sessionId: string; text: string }> = [];
  #sessions = new Map<string, AgentSession>();
  #cwdBySession = new Map<string, string>();
  #seq = 0;

  constructor(private readonly sourceForTurn: () => string) {}

  async launch(opts: AgentLaunchOptions): Promise<AgentSession> {
    this.#seq += 1;
    const session: AgentSession = {
      sessionId: `file-editing-${this.#seq}`,
      state: "ready",
      startedAt: Date.now(),
    };
    this.#sessions.set(session.sessionId, session);
    this.#cwdBySession.set(session.sessionId, opts.cwd);
    return session;
  }

  async runTurn(opts: AgentRunTurnOptions): Promise<AgentRunTurnResult> {
    return runAgentTurnThroughLaunchSend({
      ...opts,
      transport: this,
      session_cache: new Map(),
    });
  }

  async sendUserMessage(sessionId: string, text: string): Promise<void> {
    this.userMessages.push({ sessionId, text });
    const cwd = this.#cwdBySession.get(sessionId);
    if (!cwd) throw new Error(`unknown fake session ${sessionId}`);
    writeFileSync(join(cwd, "src", "app.ts"), this.sourceForTurn());
  }

  async respondToPermission(_sessionId: string, _response: PermissionResponse): Promise<void> {}
  onEvent(_handler: AgentEventHandler): () => void {
    return () => {};
  }
  async stop(sessionId: string): Promise<void> {
    const session = this.#sessions.get(sessionId);
    if (session) session.state = "exited";
  }
  async close(): Promise<void> {}
}
