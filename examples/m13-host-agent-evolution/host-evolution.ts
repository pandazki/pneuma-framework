import {
  createPneumaFramework,
  getAgentBackendFactory,
  startFrameworkToolHttpProxy,
  type AgentBackend,
  type AgentCapabilities,
  type AgentEvent,
  type AgentEventHandler,
  type AgentLaunchOptions,
  type AgentSession,
  type FrameworkPromptEnvelope,
  type FrameworkToolHttpProxy,
  type PermissionResponse,
  type PneumaFramework,
  type ToolResult,
} from "@pneuma-framework/core";
import { registerOpencodeBackend } from "@pneuma-framework/backend-opencode";
import type {
  GeneratedAppProject,
  GeneratedAppVersion,
} from "../m12-reference-creation-host/types.js";
import { getStackProfile } from "../m12-reference-creation-host/profiles.js";
import { seedKnowledgeInboxDemo } from "../m4-knowledge-inbox/seed-demo.js";
import {
  m6BuilderRequest,
  priorityCapabilityChanges,
  seedPriorityDemoRows,
} from "../m6-real-agent-evolution/backend-harness.js";
import {
  summarizeM6ConfigSnapshot,
  type M6ConfigSnapshot,
} from "../m6-real-agent-evolution/trace.js";
import {
  callFrameworkTool,
  fetchFrameworkTools,
} from "../../packages/core/bin/framework-mcp-bridge.js";
import {
  createHostAgentTranscript,
  recordAgentMessage,
  recordApprovalPrompt,
  recordApprovalResponse,
  recordCompletion,
  recordFrameworkRestart,
  recordToolCall,
  recordToolResult,
  writeHostAgentTranscript,
  type HostAgentDecision,
  type HostAgentTranscript,
} from "./transcript.js";

export type M13BackendChoice = "fake" | "opencode";
export type M13AutoDecision = "allow" | "deny" | "none";

export interface CreateHostEvolutionRuntimeInput {
  readonly project: GeneratedAppProject;
  readonly version: GeneratedAppVersion;
  readonly backend: M13BackendChoice;
  readonly autoDecision: M13AutoDecision;
  readonly portHint?: number;
}

export interface StartHostEvolutionInput {
  readonly builderUserId: string;
  readonly builderRequest: string;
}

export interface HostEvolutionResult {
  readonly status: "completed" | "denied" | "failed" | "awaiting_approval";
  readonly transcript: HostAgentTranscript;
  readonly transcript_path: string;
  readonly preview_url: string;
}

export interface HostEvolutionRuntime {
  startPreview(): Promise<{ preview_url: string }>;
  startEvolution(input: StartHostEvolutionInput): Promise<HostEvolutionResult>;
  approve(): Promise<HostEvolutionResult>;
  deny(): Promise<HostEvolutionResult>;
  inspect(): Promise<{
    readonly config: unknown;
    readonly rows: readonly Record<string, unknown>[];
    readonly logs: readonly string[];
  }>;
  previewUrl(): string;
  currentTranscript(): HostAgentTranscript | null;
  close(): Promise<void>;
}

type WaitOptions = {
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
};

const SCRIPTED_AGENT_CAPABILITIES: AgentCapabilities = {
  streaming: true,
  resume: false,
  permissions: true,
  toolProgress: true,
  modelSwitch: false,
};

export async function createHostEvolutionRuntime(
  input: CreateHostEvolutionRuntimeInput,
): Promise<HostEvolutionRuntime> {
  return new HostEvolutionRuntimeImpl(input);
}

export function buildM13HostAgentPrompt(input: {
  readonly project: GeneratedAppProject;
  readonly version: GeneratedAppVersion;
  readonly backend: M13BackendChoice;
  readonly before?: M6ConfigSnapshot;
}): string {
  if (input.backend === "opencode") {
    return buildM13OpencodePrompt(input);
  }
  return buildM13ScriptedPrompt(input);
}

export async function readPriorityQueueRows(baseUrl: string): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(`${baseUrl}/api/operations/list_priority_queue`);
  if (!response.ok) {
    throw new Error(`list_priority_queue failed with HTTP ${response.status}: ${await response.text()}`);
  }
  const body = (await response.json()) as { rows?: Array<Record<string, unknown>> };
  return (body.rows ?? []).filter((row) => typeof row.priority === "string" && row.priority.length > 0);
}

class HostEvolutionRuntimeImpl implements HostEvolutionRuntime {
  private readonly framework: PneumaFramework;
  private readonly backend: AgentBackend;
  private readonly model: string;
  private readonly logs: string[] = [];
  private frameworkToolProxy: FrameworkToolHttpProxy | undefined;
  private session: AgentSession | undefined;
  private unsubscribeAgentEvents: (() => void) | undefined;
  private transcript: HostAgentTranscript | null = null;
  private pendingPromptId: string | undefined;
  private agentRun: Promise<void> | undefined;
  private closed = false;

  constructor(private readonly input: CreateHostEvolutionRuntimeInput) {
    const profile = getStackProfile(input.version.profile_id);
    const backend = createBackend(input.backend);
    this.backend = backend.backend;
    this.model = backend.model;
    this.framework = createPneumaFramework({
      templateDir: profile.template_dir,
      workspace: input.version.app_workspace_dir,
      portHint: input.portHint ?? 0,
      backend: this.backend,
      wire: { enabled: true },
      authorization: {
        appId: "knowledge-inbox-core-domain",
        workspaceId: input.version.app_workspace_dir,
      },
    });
    this.installTranscriptBridge();
    this.unsubscribeAgentEvents = this.attachTranscriptAgentEvents();
  }

  async startPreview(): Promise<{ preview_url: string }> {
    const existing = this.framework.state.dev?.services?.[0]?.url;
    if (existing) return { preview_url: new URL(existing).origin };

    const start = await this.framework.toolRegistry.call("lifecycle.dev.start", {});
    if (!start.ok) throw new Error(`lifecycle.dev.start failed: ${JSON.stringify(start)}`);
    const baseUrl = this.previewUrl();
    const seedResult = await seedKnowledgeInboxDemo({ baseUrl });
    this.logs.push(
      `seeded demo data: captured=${seedResult.captured} updated=${seedResult.updated} existing=${seedResult.existing}`,
    );
    return { preview_url: baseUrl };
  }

  async startEvolution(input: StartHostEvolutionInput): Promise<HostEvolutionResult> {
    await this.startPreview();
    const before = summarizeM6ConfigSnapshot(await readRuntimeConfig(this.previewUrl()));
    this.transcript = createHostAgentTranscript({
      runId: `m13-${Date.now().toString(36)}`,
      appId: this.input.project.app_id,
      versionId: this.input.version.version_id,
      builderUserId: input.builderUserId,
      builderRequest: input.builderRequest,
      before,
    });
    this.persistTranscript();
    this.frameworkToolProxy ??= startFrameworkToolHttpProxy(this.framework.toolRegistry, { port: 0 });
    this.session = await this.backend.launch({
      cwd: this.input.version.app_workspace_dir,
      appUrl: this.previewUrl(),
      frameworkToolUrl: this.frameworkToolProxy.url,
      model: this.model === "scripted-m13" ? undefined : this.model,
    });
    this.framework.annotateBackendSession(this.session.backendSessionId ?? this.session.sessionId);

    const prompt = buildM13HostAgentPrompt({
      project: this.input.project,
      version: this.input.version,
      backend: this.input.backend,
      before,
    });
    this.agentRun = this.backend.sendUserMessage(this.session.sessionId, prompt).catch((err) => {
      const transcript = this.requireTranscript();
      recordCompletion(transcript, {
        status: "failed",
        summary: err instanceof Error ? err.message : String(err),
      });
      this.persistTranscript();
      throw err;
    });

    if (this.input.autoDecision === "none") {
      await this.agentRun;
      if (this.requireTranscript().status === "awaiting_approval") return this.result("awaiting_approval");
    } else {
      await this.agentRun;
      this.respondToPendingPrompt(this.input.autoDecision);
      const decision = await this.waitForApprovalDecision();
      if (decision === "deny") return await this.finalizeDenied();
      return await this.finalizeSuccessful();
    }

    const status = this.requireTranscript().status;
    if (status === "completed" || status === "denied" || status === "failed") return this.result(status);
    return this.result("awaiting_approval");
  }

  async approve(): Promise<HostEvolutionResult> {
    if (this.requireTranscript().status === "completed") return this.result("completed");
    await this.agentRun?.catch(() => undefined);
    this.respondToPendingPrompt("allow");
    await this.agentRun?.catch(() => undefined);
    return await this.finalizeSuccessful();
  }

  async deny(): Promise<HostEvolutionResult> {
    if (this.requireTranscript().status === "denied") return this.result("denied");
    await this.agentRun?.catch(() => undefined);
    this.respondToPendingPrompt("deny");
    await this.agentRun?.catch(() => undefined);
    return await this.finalizeDenied();
  }

  async inspect(): Promise<{
    readonly config: unknown;
    readonly rows: readonly Record<string, unknown>[];
    readonly logs: readonly string[];
  }> {
    await this.startPreview();
    return {
      config: await readRuntimeConfig(this.previewUrl()),
      rows: await readInboxRows(this.previewUrl()),
      logs: [...this.logs],
    };
  }

  previewUrl(): string {
    return currentBaseUrl(this.framework);
  }

  currentTranscript(): HostAgentTranscript | null {
    return this.transcript;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribeAgentEvents?.();
    this.frameworkToolProxy?.close();
    await this.backend.close();
    await this.framework.close();
  }

  private installTranscriptBridge(): void {
    this.framework.orchestrator.setPermissionPromptPushHook((env) => {
      const transcript = this.transcript;
      if (!transcript) return;
      if (!transcript.events.some((event) => event.kind === "tool_call" && event.tool === env.prompt.tool)) {
        recordToolCall(transcript, {
          callId: env.prompt.id,
          tool: env.prompt.tool,
          input: env.prompt.detail,
        });
      }
      this.pendingPromptId = env.prompt.id;
      recordApprovalPrompt(transcript, {
        promptId: env.prompt.id,
        tool: env.prompt.tool,
        summary: promptSummary(env),
        detail: env.prompt.detail,
      });
      this.persistTranscript();

    });

    this.framework.orchestrator.setPermissionResponseHook((event) => {
      const transcript = this.transcript;
      if (!transcript) return;
      recordApprovalResponse(transcript, {
        promptId: event.id,
        tool: event.tool,
        decision: event.decision,
      });
      this.persistTranscript();
    });
  }

  private attachTranscriptAgentEvents(): () => void {
    return this.backend.onEvent((event) => {
      const transcript = this.transcript;
      if (!transcript) return;
      if (event.type === "text") {
        const text = agentText(event);
        if (!text) return;
        this.logs.push(text);
        recordAgentMessage(transcript, text);
        this.persistTranscript();
        return;
      }
      if (event.type === "tool-call") {
        const payload = event.payload as { callId?: unknown; toolName?: unknown; input?: unknown };
        if (typeof payload.toolName !== "string") return;
        recordToolCall(transcript, {
          callId: typeof payload.callId === "string" ? payload.callId : `${payload.toolName}-${Date.now()}`,
          tool: payload.toolName,
          input: payload.input,
        });
        this.persistTranscript();
        return;
      }
      if (event.type === "error") {
        recordAgentMessage(transcript, `Agent error: ${JSON.stringify(event.payload)}`);
        this.persistTranscript();
      }
    });
  }

  private async finalizeSuccessful(): Promise<HostEvolutionResult> {
    const transcript = this.requireTranscript();
    if (transcript.status === "completed") return this.result("completed");
    await this.waitForApprovalDecision();
    await waitForPriorityQueueCapabilityReady(() => this.previewUrl(), {
      timeoutMs: Number(process.env["M13_COMPLETION_TIMEOUT_MS"] ?? 300_000),
      intervalMs: 1_000,
    });
    const seededBaseUrl = await seedPriorityDemoRows(this.framework, this.input.version.app_workspace_dir, this.previewUrl());
    const rows = await readPriorityQueueRows(seededBaseUrl);
    if (rows.length !== 3) throw new Error(`expected 3 priority queue rows, got ${rows.length}`);
    recordFrameworkRestart(transcript, {
      summary: "Framework restarted the generated app and rediscovered the evolved definition.",
    });
    this.recordBackendToolResults();
    recordCompletion(transcript, {
      status: "completed",
      after: summarizeM6ConfigSnapshot(await readRuntimeConfig(this.previewUrl())),
      summary: "Priority Queue is live inside the Host preview after Builder approval.",
      detail: { rows },
    });
    this.persistTranscript();
    return this.result("completed");
  }

  private async finalizeDenied(): Promise<HostEvolutionResult> {
    const transcript = this.requireTranscript();
    if (transcript.status !== "denied") {
      await this.waitForApprovalDecision();
    }
    this.recordBackendToolResults();
    recordCompletion(transcript, {
      status: "denied",
      after: summarizeM6ConfigSnapshot(await readRuntimeConfig(this.previewUrl())),
      summary: "Builder denied definition.apply_change_set; generated app stayed unchanged.",
    });
    this.persistTranscript();
    return this.result("denied");
  }

  private recordBackendToolResults(): void {
    const transcript = this.requireTranscript();
    if (!(this.backend instanceof ScriptedM13HostAgentBackend)) return;
    for (const entry of this.backend.results) {
      const alreadyRecorded = transcript.events.some((event) =>
        event.kind === "tool_result" && event.call_id === entry.callId
      );
      if (alreadyRecorded) continue;
      recordToolResult(transcript, {
        callId: entry.callId,
        tool: entry.tool,
        ok: entry.result.ok,
        result: entry.result,
      });
    }
  }

  private async waitForTranscriptStatus(
    statuses: readonly HostAgentTranscript["status"][],
    options: WaitOptions = {},
  ): Promise<void> {
    const timeoutMs = options.timeoutMs ?? Number(process.env["M13_APPROVAL_TIMEOUT_MS"] ?? 300_000);
    const intervalMs = options.intervalMs ?? 250;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = this.transcript?.status;
      if (status && statuses.includes(status)) return;
      await wait(intervalMs);
    }
    throw new Error(`timed out waiting for transcript status: ${statuses.join(", ")}`);
  }

  private async waitForApprovalDecision(options: WaitOptions = {}): Promise<HostAgentDecision> {
    const timeoutMs = options.timeoutMs ?? Number(process.env["M13_APPROVAL_TIMEOUT_MS"] ?? 300_000);
    const intervalMs = options.intervalMs ?? 250;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const decision = latestApprovalDecision(this.requireTranscript());
      if (decision) return decision;
      await wait(intervalMs);
    }
    throw new Error("timed out waiting for Builder approval response");
  }

  private result(status: HostEvolutionResult["status"]): HostEvolutionResult {
    const transcript = this.requireTranscript();
    return {
      status,
      transcript,
      transcript_path: this.persistTranscript(),
      preview_url: this.previewUrl(),
    };
  }

  private persistTranscript(): string {
    return writeHostAgentTranscript(this.input.version.app_workspace_dir, this.requireTranscript());
  }

  private requireTranscript(): HostAgentTranscript {
    if (!this.transcript) throw new Error("host evolution transcript has not started");
    return this.transcript;
  }

  private requirePendingPromptId(): string {
    if (!this.pendingPromptId) throw new Error("no pending Host approval prompt");
    return this.pendingPromptId;
  }

  private respondToPendingPrompt(decision: Exclude<M13AutoDecision, "none">): void {
    const promptId = this.requirePendingPromptId();
    this.framework.orchestrator.handleFrameworkPermissionResponse(promptId, decision);
  }
}

class ScriptedM13HostAgentBackend implements AgentBackend {
  readonly type = "scripted-m13-host-agent" as const;
  readonly capabilities = SCRIPTED_AGENT_CAPABILITIES;
  readonly results: Array<{ readonly callId: string; readonly tool: string; readonly result: ToolResult }> = [];
  readonly seenFrameworkTools: string[] = [];
  launchOptions?: AgentLaunchOptions;

  private readonly handlers = new Set<AgentEventHandler>();
  private readonly sessions = new Map<string, AgentSession>();
  private seq = 0;
  private callSeq = 0;

  async launch(opts: AgentLaunchOptions): Promise<AgentSession> {
    this.launchOptions = opts;
    this.seq += 1;
    const session: AgentSession = {
      sessionId: `scripted-m13-${this.seq}`,
      backendSessionId: `scripted-m13-${this.seq}`,
      state: "ready",
      startedAt: Date.now(),
    };
    this.sessions.set(session.sessionId, session);
    this.emit({ type: "session-ready", sessionId: session.sessionId, payload: {} });
    return session;
  }

  async sendUserMessage(sessionId: string, text: string): Promise<void> {
    if (!this.sessions.has(sessionId)) throw new Error(`unknown session: ${sessionId}`);
    this.emitText(sessionId, "I am operating inside the Creation Host for this generated app version.");

    const frameworkToolUrl = this.launchOptions?.frameworkToolUrl;
    if (!frameworkToolUrl) throw new Error("scripted M13 agent requires frameworkToolUrl");

    const frameworkTools = await fetchFrameworkTools(frameworkToolUrl);
    this.seenFrameworkTools.splice(0, this.seenFrameworkTools.length, ...frameworkTools.map((tool) => tool.name));
    if (!this.seenFrameworkTools.includes("definition.apply_change_set")) {
      throw new Error("scripted M13 agent could not see definition.apply_change_set");
    }
    if (!text.includes("definition.apply_change_set")) {
      throw new Error("scripted M13 prompt must instruct the backend agent to use definition.apply_change_set");
    }
    this.emitText(sessionId, "I found definition.apply_change_set and will submit one capability proposal.");

    this.callSeq += 1;
    const callId = `scripted-m13-call-${this.callSeq}`;
    const input = {
      intent: "Review inbox items by priority",
      summary: "Add Priority Queue capability",
      require_approval: true,
      approval_mode: "defer",
      changes: priorityCapabilityChanges,
      acceptance_checks: [
        "The app definition has a priority column on inbox_items.",
        "The app exposes list_priority_queue as a public read Operation.",
        "The app exposes a Priority Queue View backed by list_priority_queue.",
        "End users can read the Priority Queue View through an explicit policy rule.",
      ],
    };
    this.emit({
      type: "tool-call",
      sessionId,
      payload: { callId, toolName: "definition.apply_change_set", input },
    });
    const result = await callFrameworkTool(frameworkToolUrl, "definition.apply_change_set", input) as ToolResult;
    this.results.push({ callId, tool: "definition.apply_change_set", result });
    if (!result.ok) {
      this.emitText(sessionId, "The Builder denied or validation rejected the governed proposal; I stopped.");
      return;
    }
    this.emitText(sessionId, "The proposal is now waiting on one Builder approval in the Creation Host.");
  }

  async respondToPermission(sessionId: string, response: PermissionResponse): Promise<void> {
    this.emit({ type: "permission-request", sessionId, payload: response });
  }

  onEvent(handler: AgentEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async stop(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.state === "exited") return;
    session.state = "exited";
    session.exitedAt = Date.now();
    this.emit({ type: "session-exited", sessionId, payload: {} });
  }

  async close(): Promise<void> {
    for (const sessionId of [...this.sessions.keys()]) {
      await this.stop(sessionId);
    }
    this.handlers.clear();
  }

  private emitText(sessionId: string, text: string): void {
    this.emit({ type: "text", sessionId, payload: { text } });
  }

  private emit(event: AgentEvent): void {
    for (const handler of this.handlers) handler(event);
  }
}

function buildM13ScriptedPrompt(input: {
  readonly project: GeneratedAppProject;
  readonly version: GeneratedAppVersion;
}): string {
  return [
    "You are the Build-phase Agent inside a Pneuma Creation Host.",
    `Generated app: ${input.project.app_id}@${input.version.version_id}`,
    "",
    "Builder request:",
    m6BuilderRequest,
    "",
    "Use exactly one framework semantic tool call: definition.apply_change_set.",
    "Do not edit files. Do not call child definition.apply operations separately.",
    "Submit the whole Priority Queue capability as one change-set proposal.",
    "Set require_approval=true and approval_mode=defer so the Host can show one Builder approval prompt.",
  ].join("\n");
}

function buildM13OpencodePrompt(input: {
  readonly project: GeneratedAppProject;
  readonly version: GeneratedAppVersion;
  readonly before?: M6ConfigSnapshot;
}): string {
  const snapshot = input.before
    ? JSON.stringify(input.before, null, 2)
    : "Current app-definition snapshot is unavailable; inspect /api/config if needed.";
  return [
    "You are the real Build-phase Agent inside a Pneuma Creation Host.",
    `Generated app: ${input.project.app_id}@${input.version.version_id}`,
    "",
    "Builder request:",
    m6BuilderRequest,
    "",
    "This is an execution acceptance task, not a design consultation.",
    "Use exactly one framework semantic tool call: `definition.apply_change_set` from `pneuma_framework`.",
    "Do not edit files. Do not call low-level `definition.apply` for child mutations.",
    "Set `require_approval` to true and `approval_mode` to `defer` so the Host can show one Builder approval prompt.",
    "",
    "Current app-definition snapshot:",
    snapshot,
    "",
    "Capability semantics to satisfy:",
    "- Add a nullable `priority` Text column to `inbox_items`.",
    "- Add `list_priority_queue` as a query-backed read Operation on `inbox_items`.",
    "- Add a `priority_queue` View backed by `list_priority_queue`.",
    "- Add a read PolicyRule for anyone/anonymous on the `priority_queue` View.",
    "",
    "Use stable ids: `priority`, `list_priority_queue`, `priority_queue`, `anyone-read-priority-queue`.",
    "For output use `{ \"kind\": \"row-list\", \"row_type\": \"inbox_items\" }`.",
    "After the tool returns approval_pending, report that the Host is waiting for Builder approval.",
  ].join("\n");
}

function createBackend(choice: M13BackendChoice): { readonly backend: AgentBackend; readonly model: string } {
  if (choice === "fake") return { backend: new ScriptedM13HostAgentBackend(), model: "scripted-m13" };

  registerOpencodeBackend();
  const factory = getAgentBackendFactory("opencode");
  if (!factory) throw new Error("opencode backend failed to register");
  const model = process.env["OPENCODE_MODEL"] ?? "openrouter/anthropic/claude-opus-4.7";
  const configuredPort = process.env["OPENCODE_SERVER_PORT"] ?? process.env["OPENCODE_PORT"];
  const serverPort = configuredPort === undefined ? 0 : Number(configuredPort);
  if (!Number.isInteger(serverPort) || serverPort < 0) {
    throw new Error("OPENCODE_SERVER_PORT must be a non-negative integer when set");
  }
  const configuredTimeout = process.env["OPENCODE_SERVER_START_TIMEOUT_MS"];
  const serverStartTimeoutMs = configuredTimeout === undefined ? 20_000 : Number(configuredTimeout);
  if (!Number.isInteger(serverStartTimeoutMs) || serverStartTimeoutMs <= 0) {
    throw new Error("OPENCODE_SERVER_START_TIMEOUT_MS must be a positive integer when set");
  }
  return {
    backend: factory({
      defaultModel: model,
      serverPort,
      serverStartTimeoutMs,
    }),
    model,
  };
}

async function readRuntimeConfig(baseUrl: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl}/api/config`);
  if (!response.ok) {
    throw new Error(`GET /api/config failed with HTTP ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

async function readInboxRows(baseUrl: string): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(`${baseUrl}/api/operations/list_inbox_items`);
  if (!response.ok) {
    throw new Error(`list_inbox_items failed with HTTP ${response.status}: ${await response.text()}`);
  }
  const body = (await response.json()) as { rows?: Array<Record<string, unknown>> };
  return body.rows ?? [];
}

async function waitForPriorityQueueCapabilityReady(
  baseUrlSource: string | (() => string),
  options: WaitOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 300_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;
  let lastError = "not checked";

  while (Date.now() <= deadline) {
    try {
      const baseUrl = typeof baseUrlSource === "function" ? baseUrlSource() : baseUrlSource;
      const config = await readRuntimeConfig(baseUrl) as {
        tables?: Array<{ id?: string; columns?: Array<{ name?: string }> }>;
        operations?: Array<{ id?: string }>;
        views?: Array<{ id?: string }>;
        policy_rules?: Array<{ id?: string; actions?: string[]; resource?: unknown }>;
      };
      const snapshot = summarizeM6ConfigSnapshot(config);
      if (!snapshot.hasPriorityColumn) throw new Error("priority column is not visible in /api/config");
      if (!snapshot.hasPriorityOperation) throw new Error("list_priority_queue is not visible in /api/config");
      if (!snapshot.hasPriorityView) throw new Error("priority_queue view is not visible in /api/config");
      if (!snapshot.hasPriorityReadPolicy) throw new Error("priority_queue read policy is not visible in /api/config");
      await readPriorityQueueRows(baseUrl);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await wait(intervalMs);
    }
  }

  throw new Error(`priority queue capability did not become ready within ${timeoutMs}ms; last error: ${lastError}`);
}

function currentBaseUrl(framework: PneumaFramework): string {
  const service = framework.state.dev?.services?.[0]?.url;
  if (!service) throw new Error("M13 host runtime expected a running generated app preview service");
  return new URL(service).origin;
}

function promptSummary(env: FrameworkPromptEnvelope): string {
  const detail = env.prompt.detail as { summary?: unknown; intent?: unknown } | undefined;
  return typeof detail?.summary === "string"
    ? detail.summary
    : typeof detail?.intent === "string"
      ? detail.intent
      : `Approval requested for ${env.prompt.tool}`;
}

function latestApprovalDecision(transcript: HostAgentTranscript): HostAgentDecision | undefined {
  return transcript.events.findLast((event) =>
    event.kind === "approval_response"
    && (event.decision === "allow" || event.decision === "deny" || event.decision === "allow-always")
  )?.decision;
}

function agentText(event: AgentEvent): string {
  const payload = event.payload as {
    readonly delta?: unknown;
    readonly text?: unknown;
    readonly part?: { readonly text?: unknown; readonly time?: { readonly start?: unknown } };
  };
  if (typeof payload.delta === "string") return payload.delta;
  if (typeof payload.text === "string") return payload.text;
  if (payload.part?.time?.start && typeof payload.part.text === "string") return payload.part.text;
  return "";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
