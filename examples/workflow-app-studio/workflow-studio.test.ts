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
import { createFileBuildThreadStore, runAgentTurnThroughLaunchSend } from "@pneuma-framework/core";
import { transitionWorkflowRecord } from "./src/domain/workflow-app.js";
import { createCodexAppServerWorkflowDraftAgent } from "./src/host/codex-app-server-workflow-agent.js";
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

  test("emits live progress logs while the build agent prepares a proposal", async () => {
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
      const progress: string[] = [];
      await host.requestEvolution({
        app_id: project.app_id,
        builder_subject: "user:bob",
        message: "Add a legal review stage before approval.",
        on_progress(event) {
          progress.push(event.entry.text);
        },
      });

      expect(progress.join("\n")).toContain("Draft workspace prepared");
      expect(progress.join("\n")).toContain("Building governed code-change review packet");
      expect(progress.join("\n")).toContain("Proposal is ready for Builder approval");
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

  test("codex app-server draft agent path edits src/app.ts before governed approval", async () => {
    const scriptRoot = workspace();
    const fakeAppServer = join(scriptRoot, "fake-codex-app-server.ts");
    writeFileSync(fakeAppServer, fakeCodexAppServerScript(slaWorkflowAppModuleSource()));
    const host = createWorkflowAppStudio({
      workspace: workspace(),
      base_url: "http://127.0.0.1:0",
      draft_agent: createCodexAppServerWorkflowDraftAgent({
        command: process.execPath,
        args: ["run", fakeAppServer],
        model: "fake-codex",
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
      expect(pending?.agent_mode).toBe("codex-app-server");
      expect(pending?.changed_files).toEqual(["src/app.ts"]);
      expect(pending?.agent_logs.map((entry) => entry.text).join("\n")).toContain("Codex thread started");
      expect(pending?.agent_logs.map((entry) => entry.text).join("\n")).toContain("fake codex edited src/app.ts");

      const approved = await host.approveEvolution({ app_id: project.app_id, subject: "user:bob" });
      expect(approved.status).toBe("ready_to_preview");
      const version = host.snapshot().projects[0]?.current_version;
      expect(version?.source.workflow.fields.map((field) => field.id)).toContain("due_date");
      expect(version?.source.workflow.views.map((view) => view.id)).toContain("sla_watch");
      expect(version?.source.app_code).toContain("sla_watch");
    } finally {
      await host.close();
    }
  });

  test("codex app-server debug loop repairs a failed draft before proposal", async () => {
    const scriptRoot = workspace();
    const fakeAppServer = join(scriptRoot, "fake-codex-repairing-app-server.ts");
    writeFileSync(
      fakeAppServer,
      fakeRepairingCodexAppServerScript(
        `export const workflowPatch = { purpose_suffix: "SLA requested but not implemented yet." };\n`,
        slaWorkflowAppModuleSource(),
      ),
    );
    const root = workspace();
    const host = createWorkflowAppStudio({
      workspace: root,
      base_url: "http://127.0.0.1:0",
      draft_agent: createCodexAppServerWorkflowDraftAgent({
        command: process.execPath,
        args: ["run", fakeAppServer],
        model: "fake-codex",
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
      const logText = pending?.agent_logs.map((entry) => entry.text).join("\n") ?? "";
      expect(logText).toContain("Codex debug attempt 1/2 started");
      expect(logText).toContain("Debug attempt 1 failed");
      expect(logText).toContain("Codex debug attempt 2/2 started");
      expect(pending?.changed_files).toEqual(["src/app.ts"]);
      expect(pending?.agent_mode).toBe("codex-app-server");
      expect(pending?.summary).toBe("Add SLA tracking to the workflow.");

      const threadStore = createFileBuildThreadStore({ workspace: root });
      const turns = await threadStore.listTurns(pending?.thread_id ?? "");
      expect(turns.filter((turn) => turn.kind === "host_event").map((turn) =>
        turn.kind === "host_event" ? turn.label : ""
      )).toContain("agent_debug_session");
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

function fakeCodexAppServerScript(appSource: string): string {
  return `
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const appSource = ${JSON.stringify(appSource)};
const decoder = new TextDecoder();
const reader = Bun.stdin.stream().getReader();
let buffer = "";
let cwd = process.cwd();
const threadId = "thr_fake_codex";
const turnId = "turn_fake_codex";

function send(payload) {
  console.log(JSON.stringify(payload));
}

function handle(message) {
  if (message.method === "initialize") {
    send({ id: message.id, result: { protocolVersion: 1, auth: { mode: "test" }, features: {}, modelInfo: {} } });
    return;
  }
  if (message.method === "initialized") return;
  if (message.method === "thread/start") {
    cwd = message.params?.cwd || cwd;
    send({ id: message.id, result: { thread: { id: threadId, sessionId: threadId, ephemeral: true } } });
    send({ method: "thread/started", params: { thread: { id: threadId } } });
    return;
  }
  if (message.method === "turn/start") {
    cwd = message.params?.cwd || cwd;
    writeFileSync(join(cwd, "src", "app.ts"), appSource);
    send({ id: message.id, result: { turn: { id: turnId, items: [], status: "inProgress", error: null } } });
    send({ method: "turn/started", params: { threadId, turn: { id: turnId, items: [], status: "inProgress", error: null } } });
    send({ method: "item/agentMessage/delta", params: { threadId, turnId, itemId: "msg_1", delta: "fake codex edited src/app.ts" } });
    send({ method: "item/completed", params: { threadId, turnId, item: { type: "fileChange", id: "file_1", changes: [{ path: "src/app.ts" }], status: "completed" } } });
    send({ method: "turn/completed", params: { threadId, turn: { id: turnId, items: [], status: "completed", error: null } } });
  }
}

while (true) {
  const read = await reader.read();
  if (read.done) break;
  buffer += decoder.decode(read.value, { stream: true });
  while (true) {
    const newline = buffer.indexOf("\\n");
    if (newline === -1) break;
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    handle(JSON.parse(line));
  }
}
`;
}

function fakeRepairingCodexAppServerScript(invalidSource: string, repairedSource: string): string {
  return `
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const invalidSource = ${JSON.stringify(invalidSource)};
const repairedSource = ${JSON.stringify(repairedSource)};
const decoder = new TextDecoder();
const reader = Bun.stdin.stream().getReader();
let buffer = "";
let cwd = process.cwd();
const threadId = "thr_fake_codex";
const turnId = "turn_fake_codex";

function send(payload) {
  console.log(JSON.stringify(payload));
}

function handle(message) {
  if (message.method === "initialize") {
    send({ id: message.id, result: { protocolVersion: 1, auth: { mode: "test" }, features: {}, modelInfo: {} } });
    return;
  }
  if (message.method === "initialized") return;
  if (message.method === "thread/start") {
    cwd = message.params?.cwd || cwd;
    send({ id: message.id, result: { thread: { id: threadId, sessionId: threadId, ephemeral: true } } });
    send({ method: "thread/started", params: { thread: { id: threadId } } });
    return;
  }
  if (message.method === "turn/start") {
    cwd = message.params?.cwd || cwd;
    const text = message.params?.input?.[0]?.text || "";
    const repaired = text.includes("previous_debug_failure") || text.includes("Generated app code is missing requested ids");
    writeFileSync(join(cwd, "src", "app.ts"), repaired ? repairedSource : invalidSource);
    send({ id: message.id, result: { turn: { id: turnId, items: [], status: "inProgress", error: null } } });
    send({ method: "turn/started", params: { threadId, turn: { id: turnId, items: [], status: "inProgress", error: null } } });
    send({ method: "item/agentMessage/delta", params: { threadId, turnId, itemId: "msg_1", delta: repaired ? "fake codex repaired src/app.ts" : "fake codex wrote incomplete src/app.ts" } });
    send({ method: "item/completed", params: { threadId, turnId, item: { type: "fileChange", id: "file_1", changes: [{ path: "src/app.ts" }], status: "completed" } } });
    send({ method: "turn/completed", params: { threadId, turn: { id: turnId, items: [], status: "completed", error: null } } });
  }
}

while (true) {
  const read = await reader.read();
  if (read.done) break;
  buffer += decoder.decode(read.value, { stream: true });
  while (true) {
    const newline = buffer.indexOf("\\n");
    if (newline === -1) break;
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    handle(JSON.parse(line));
  }
}
`;
}

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
