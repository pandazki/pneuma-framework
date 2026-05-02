#!/usr/bin/env bun

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
  type FrameworkToolHttpProxy,
  type PermissionResponse,
  type PneumaFramework,
  type ToolResult,
} from "@pneuma-framework/core";
import { registerOpencodeBackend } from "@pneuma-framework/backend-opencode";
import {
  callFrameworkTool,
  fetchFrameworkTools,
} from "../../packages/core/bin/framework-mcp-bridge.js";
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
  createAgentExecutionTranscript,
  recordApprovalResponse,
  recordAssistantTextDelta,
  recordCompletion,
  recordFrameworkRestart,
  recordPermissionPrompt,
  recordToolCall,
  recordToolResult,
  writeAgentExecutionTranscript,
  type AgentExecutionTranscript,
} from "./transcript.js";

type BackendChoice = "fake" | "opencode";
type AutoDecision = "allow" | "deny" | "none";

export type M7RunArgs = {
  backend: BackendChoice;
  autoDecision: AutoDecision;
  workspace: string;
  port: number;
  smokeExit: boolean;
};

export type M7RunResult = {
  status: "completed" | "denied" | "failed";
  appUrl: string;
  workspace: string;
  transcriptPath: string;
};

type WaitOptions = {
  timeoutMs?: number;
  intervalMs?: number;
};

type BaseUrlSource = string | (() => string);

const SCRIPTED_AGENT_CAPABILITIES: AgentCapabilities = {
  streaming: true,
  resume: false,
  permissions: true,
  toolProgress: true,
  modelSwitch: false,
};

function usage(): string {
  return [
    "usage: bun run examples/m7-live-agent-approval-protocol/run.ts [--backend fake|opencode] [--auto-decision allow|deny|none] [--workspace <dir>] [--port <port>] [--smoke-exit]",
    "",
    "Starts the M7 Knowledge Inbox live Builder approval demo.",
    "--backend        fake for deterministic CI path, opencode for manual real-backend path. Default: fake.",
    "--auto-decision  allow/deny for deterministic tests, none for live browser approval. Default: none.",
    "--workspace      Reuse or create a specific app workspace directory.",
    "--port           Port hint for the template server. Use 0 for a random port.",
    "--smoke-exit     Exit after completion or denial.",
  ].join("\n");
}

export function parseArgs(argv: string[]): M7RunArgs {
  let backend: BackendChoice = "fake";
  let autoDecision: AutoDecision = "none";
  let workspace: string | undefined;
  let port = 8878;
  let smokeExit = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--backend") {
      const value = argv[i + 1];
      if (value !== "fake" && value !== "opencode") throw new Error("--backend must be fake or opencode");
      backend = value;
      i += 1;
    } else if (arg === "--auto-decision") {
      const value = argv[i + 1];
      if (value !== "allow" && value !== "deny" && value !== "none") {
        throw new Error("--auto-decision must be allow, deny, or none");
      }
      autoDecision = value;
      i += 1;
    } else if (arg === "--workspace") {
      const value = argv[i + 1];
      if (!value) throw new Error("--workspace requires a value");
      workspace = resolve(value);
      i += 1;
    } else if (arg === "--port") {
      const value = argv[i + 1];
      if (!value) throw new Error("--port requires a value");
      if (!/^\d+$/.test(value)) throw new Error("--port must be a number");
      port = Number(value);
      i += 1;
    } else if (arg === "--smoke-exit") {
      smokeExit = true;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  return {
    backend,
    autoDecision,
    workspace: workspace ?? mkdtempSync(join(tmpdir(), "pneuma-m7-live-approval-")),
    port,
    smokeExit,
  };
}

export function buildM7LiveAgentPrompt(): string {
  const governedChangeSet = {
    intent: "Review inbox items by priority",
    summary: "Add Priority Queue capability",
    require_approval: true,
    changes: priorityCapabilityChanges,
    acceptance_checks: [
      "The app definition has a priority column on inbox_items.",
      "The app exposes list_priority_queue as a public read Operation.",
      "The app exposes a Priority Queue View backed by list_priority_queue.",
      "End users can read the Priority Queue View through an explicit policy rule.",
    ],
  };
  return [
    "You are the Build-phase Agent for a running Pneuma Knowledge Inbox app.",
    "",
    "Builder request:",
    m6BuilderRequest,
    "",
    "This is an execution acceptance task, not a design consultation.",
    "Use the framework semantic tool `definition.apply_change_set` from `pneuma_framework`.",
    "Do not edit files. Do not bypass framework governance. Do not stop after analysis.",
    "Submit the whole capability as one change-set proposal and wait for one Builder approval response.",
    "",
    "Apply this exact JSON input:",
    JSON.stringify(governedChangeSet, null, 2),
    "",
    "After `definition.apply_change_set` succeeds, report that the Priority Queue capability is ready.",
    "If the Builder denies the approval prompt, stop and report that the app was left unchanged.",
  ].join("\n");
}

class ScriptedM7LiveApprovalAgentBackend implements AgentBackend {
  readonly type = "scripted-m7-live-approval-agent" as const;
  readonly capabilities = SCRIPTED_AGENT_CAPABILITIES;
  readonly userMessages: Array<{ sessionId: string; text: string }> = [];
  readonly results: Array<{ callId: string; tool: string; result: ToolResult }> = [];
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
      sessionId: `scripted-m7-${this.seq}`,
      backendSessionId: `scripted-m7-${this.seq}`,
      state: "ready",
      startedAt: Date.now(),
    };
    this.sessions.set(session.sessionId, session);
    this.emit({ type: "session-ready", sessionId: session.sessionId, payload: {} });
    return session;
  }

  async sendUserMessage(sessionId: string, text: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`unknown session: ${sessionId}`);
    this.userMessages.push({ sessionId, text });
    this.emitText(sessionId, "I will evolve Knowledge Inbox through one governed definition.apply_change_set proposal.");

    const frameworkToolUrl = this.launchOptions?.frameworkToolUrl;
    if (!frameworkToolUrl) throw new Error("scripted M7 agent requires frameworkToolUrl");

    const frameworkTools = await fetchFrameworkTools(frameworkToolUrl);
    this.seenFrameworkTools.splice(0, this.seenFrameworkTools.length, ...frameworkTools.map((tool) => tool.name));
    if (!this.seenFrameworkTools.includes("definition.apply_change_set")) {
      throw new Error("scripted M7 agent could not see definition.apply_change_set");
    }
    this.emitText(sessionId, "I found definition.apply_change_set and will wait for one Builder approval.");

    this.callSeq += 1;
    const callId = `scripted-m7-call-${this.callSeq}`;
    const input = {
      intent: "Review inbox items by priority",
      summary: "Add Priority Queue capability",
      require_approval: true,
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
      this.emitText(sessionId, "The Builder denied the governed capability proposal; I stopped without applying the capability.");
      return;
    }

    this.emitText(sessionId, "Priority Queue is ready after one approved change set and governed restart rediscovery.");
  }

  async respondToPermission(_sessionId: string, response: PermissionResponse): Promise<void> {
    this.emit({ type: "permission-request", sessionId: _sessionId, payload: response });
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

async function readRuntimeConfig(baseUrl: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl}/api/config`);
  if (!response.ok) {
    throw new Error(`GET /api/config failed with HTTP ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

async function readPriorityQueue(baseUrl: string): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(`${baseUrl}/api/operations/list_priority_queue`);
  if (!response.ok) {
    throw new Error(`list_priority_queue failed with HTTP ${response.status}: ${await response.text()}`);
  }
  const body = (await response.json()) as { rows?: Array<Record<string, unknown>> };
  return body.rows ?? [];
}

async function waitForPriorityQueueOperationReady(
  baseUrlSource: BaseUrlSource,
  options: WaitOptions = {},
): Promise<Array<Record<string, unknown>>> {
  const timeoutMs = options.timeoutMs ?? 300_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;
  let lastError = "not checked";

  while (Date.now() <= deadline) {
    const baseUrl = typeof baseUrlSource === "function" ? baseUrlSource() : baseUrlSource;
    try {
      return await readPriorityQueue(baseUrl);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(`priority queue operation did not become ready within ${timeoutMs}ms; last error: ${lastError}`);
}

function currentBaseUrl(framework: PneumaFramework): string {
  const service = framework.state.dev?.services?.[0]?.url;
  if (!service) throw new Error("M7 runner expected a running Knowledge Inbox service");
  return new URL(service).origin;
}

function writeTranscript(workspace: string, transcript: AgentExecutionTranscript): string {
  return writeAgentExecutionTranscript(workspace, transcript);
}

function maybeRecordSyntheticToolCall(transcript: AgentExecutionTranscript, tool: string, promptId: string, detail: unknown): void {
  const previous = transcript.events.at(-1);
  if (previous?.kind === "tool_call" && previous.tool === tool) return;
  const promptDetail = detail as { change?: unknown } | undefined;
  recordToolCall(transcript, {
    callId: promptId,
    tool,
    input: promptDetail?.change ?? detail,
  });
}

function installTranscriptBridge(input: {
  framework: PneumaFramework;
  workspace: string;
  transcript: AgentExecutionTranscript;
  autoDecision: AutoDecision;
}): void {
  const { framework, workspace, transcript, autoDecision } = input;
  framework.orchestrator.setPermissionPromptPushHook((env) => {
    maybeRecordSyntheticToolCall(transcript, env.prompt.tool, env.prompt.id, env.prompt.detail);
    recordPermissionPrompt(transcript, {
      promptId: env.prompt.id,
      tool: env.prompt.tool,
      detail: env.prompt.detail,
    });
    writeTranscript(workspace, transcript);
    if (framework.wireServer && framework.sessionId) {
      framework.wireServer.broadcast(framework.sessionId, env);
    }

    if (autoDecision !== "none") {
      process.stdout.write(`[approval] auto-${autoDecision} ${env.prompt.tool} ${env.prompt.id}\n`);
      queueMicrotask(() => {
        framework.orchestrator.handleFrameworkPermissionResponse(env.prompt.id, autoDecision);
      });
    } else {
      process.stdout.write(`[approval] waiting for Builder response to ${env.prompt.tool} ${env.prompt.id}\n`);
    }
  });

  framework.orchestrator.setPermissionResponseHook((event) => {
    recordApprovalResponse(transcript, {
      promptId: event.id,
      tool: event.tool,
      decision: event.decision,
    });
    writeTranscript(workspace, transcript);
  });
}

function attachTranscriptAgentEvents(input: {
  backend: AgentBackend;
  workspace: string;
  transcript: AgentExecutionTranscript;
}): () => void {
  const { backend, workspace, transcript } = input;
  return backend.onEvent((event) => {
    if (event.type === "text") {
      const payload = event.payload as {
        delta?: unknown;
        text?: unknown;
        part?: { text?: unknown; time?: { start?: unknown } };
      };
      if (typeof payload.delta === "string") {
        process.stdout.write(payload.delta);
        recordAssistantTextDelta(transcript, payload.delta);
        writeTranscript(workspace, transcript);
      } else if (typeof payload.text === "string") {
        process.stdout.write(`${payload.text}\n`);
        recordAssistantTextDelta(transcript, payload.text);
        writeTranscript(workspace, transcript);
      } else if (payload.part?.time?.start && typeof payload.part.text === "string") {
        process.stdout.write(`${payload.part.text}\n`);
        recordAssistantTextDelta(transcript, payload.part.text);
        writeTranscript(workspace, transcript);
      }
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
      writeTranscript(workspace, transcript);
      return;
    }

    if (event.type === "error") {
      recordAssistantTextDelta(transcript, `Agent error: ${JSON.stringify(event.payload)}`);
      writeTranscript(workspace, transcript);
    }
  });
}

function createBackend(choice: BackendChoice): { backend: AgentBackend; model: string } {
  if (choice === "fake") {
    return { backend: new ScriptedM7LiveApprovalAgentBackend(), model: "scripted-m7" };
  }

  registerOpencodeBackend();
  const factory = getAgentBackendFactory("opencode");
  if (!factory) throw new Error("opencode backend failed to register");
  const model = process.env["OPENCODE_MODEL"] ?? "openrouter/anthropic/claude-opus-4.7";
  return { backend: factory({ defaultModel: model }), model };
}

async function finalizeSuccessfulRun(input: {
  framework: PneumaFramework;
  backend: AgentBackend;
  workspace: string;
  transcript: AgentExecutionTranscript;
}): Promise<Array<Record<string, unknown>>> {
  const { framework, backend, workspace, transcript } = input;
  recordFrameworkRestart(transcript, {
    summary: "Framework restarted the app and rediscovered the evolved definition.",
  });

  for (const entry of backend instanceof ScriptedM7LiveApprovalAgentBackend ? backend.results : []) {
    recordToolResult(transcript, {
      callId: entry.callId,
      tool: entry.tool,
      ok: entry.result.ok,
      result: entry.result,
    });
  }

  await waitForPriorityQueueOperationReady(() => currentBaseUrl(framework), {
    timeoutMs: Number(process.env["M7_COMPLETION_TIMEOUT_MS"] ?? 300_000),
    intervalMs: 1_000,
  });
  const seededBaseUrl = await seedPriorityDemoRows(framework, workspace, currentBaseUrl(framework));
  const rows = await readPriorityQueue(seededBaseUrl);
  if (rows.length !== 3) {
    throw new Error(`expected 3 priority queue rows, got ${rows.length}`);
  }
  recordCompletion(transcript, {
    status: "completed",
    after: summarizeM6ConfigSnapshot(await readRuntimeConfig(currentBaseUrl(framework))),
    summary: "Priority Queue is live after Builder approval.",
    detail: { rows },
  });
  writeTranscript(workspace, transcript);
  return rows;
}

async function finalizeDeniedRun(input: {
  framework: PneumaFramework;
  backend: AgentBackend;
  workspace: string;
  transcript: AgentExecutionTranscript;
}): Promise<void> {
  const { framework, backend, workspace, transcript } = input;
  for (const entry of backend instanceof ScriptedM7LiveApprovalAgentBackend ? backend.results : []) {
    recordToolResult(transcript, {
      callId: entry.callId,
      tool: entry.tool,
      ok: entry.result.ok,
      result: entry.result,
    });
  }
  recordCompletion(transcript, {
    status: "denied",
    after: summarizeM6ConfigSnapshot(await readRuntimeConfig(currentBaseUrl(framework))),
    summary: "Builder denied definition.apply_change_set; Knowledge Inbox stayed unchanged.",
  });
  writeTranscript(workspace, transcript);
}

async function waitForShutdown(close: () => Promise<void>): Promise<void> {
  let closing = false;
  const shutdown = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    await close();
  };
  process.on("SIGINT", () => {
    void shutdown().then(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void shutdown().then(() => process.exit(0));
  });
  await new Promise(() => undefined);
}

export async function runM7LiveApproval(args: M7RunArgs): Promise<M7RunResult> {
  const { backend, model } = createBackend(args.backend);
  const framework = createPneumaFramework({
    templateDir: resolve(import.meta.dir, "../../templates/knowledge-inbox-core-domain"),
    workspace: args.workspace,
    portHint: args.port,
    backend,
    wire: { enabled: true },
    authorization: {
      appId: "knowledge-inbox-core-domain",
      workspaceId: args.workspace,
    },
  });
  let frameworkToolProxy: FrameworkToolHttpProxy | undefined;
  let unsubscribeAgentEvents: (() => void) | undefined;

  const close = async (): Promise<void> => {
    unsubscribeAgentEvents?.();
    frameworkToolProxy?.close();
    await backend.close();
    await framework.close();
  };

  try {
    const start = await framework.toolRegistry.call("lifecycle.dev.start", {});
    if (!start.ok) throw new Error(`lifecycle.dev.start failed: ${JSON.stringify(start)}`);
    const appUrl = currentBaseUrl(framework);
    const before: M6ConfigSnapshot = summarizeM6ConfigSnapshot(await readRuntimeConfig(appUrl));
    const transcript = createAgentExecutionTranscript({
      runId: `m7-${Date.now().toString(36)}`,
      builderRequest: m6BuilderRequest,
      before,
    });
    const initialTranscriptPath = writeTranscript(args.workspace, transcript);

    installTranscriptBridge({
      framework,
      workspace: args.workspace,
      transcript,
      autoDecision: args.autoDecision,
    });
    unsubscribeAgentEvents = attachTranscriptAgentEvents({ backend, workspace: args.workspace, transcript });

    frameworkToolProxy = startFrameworkToolHttpProxy(framework.toolRegistry, { port: 0 });
    const session = await backend.launch({
      cwd: args.workspace,
      appUrl,
      frameworkToolUrl: frameworkToolProxy.url,
    });
    framework.annotateBackendSession(session.backendSessionId ?? session.sessionId);

    process.stdout.write(`M7 Live Agent Approval ready: ${appUrl}\n`);
    process.stdout.write(`scenario: ${appUrl}/?scenario=live-approval\n`);
    process.stdout.write(`workspace: ${args.workspace}\n`);
    process.stdout.write(`backend: ${args.backend}\n`);
    process.stdout.write(`model: ${model}\n`);
    process.stdout.write(`auto-decision: ${args.autoDecision}\n`);
    process.stdout.write(`framework wire: ${framework.wireServer?.url ?? "unavailable"} session ${framework.sessionId ?? "unavailable"}\n`);
    process.stdout.write(`framework tools: ${frameworkToolProxy.url}\n`);
    process.stdout.write(`transcript: ${initialTranscriptPath}\n`);

    const agentRun = backend.sendUserMessage(session.sessionId, buildM7LiveAgentPrompt());

    if (args.autoDecision === "none" && !args.smokeExit) {
      void agentRun.then(async () => {
        const denied = transcript.events.some((event) =>
          event.kind === "approval_response" && event.decision === "deny"
        );
        if (denied) {
          await finalizeDeniedRun({ framework, backend, workspace: args.workspace, transcript });
          process.stdout.write("live approval completion: denied\n");
        } else {
          const rows = await finalizeSuccessfulRun({ framework, backend, workspace: args.workspace, transcript });
          process.stdout.write(`priority queue smoke: ${rows.length} rows\n`);
          process.stdout.write("live approval completion: completed\n");
        }
      }).catch((err) => {
        recordCompletion(transcript, {
          status: "failed",
          summary: err instanceof Error ? err.message : String(err),
        });
        writeTranscript(args.workspace, transcript);
        process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
      });
      process.stdout.write("Waiting for live Builder approval in the browser.\n");
      await waitForShutdown(close);
      return {
        status: transcript.status === "completed" ? "completed" : transcript.status === "denied" ? "denied" : "failed",
        appUrl,
        workspace: args.workspace,
        transcriptPath: writeTranscript(args.workspace, transcript),
      };
    }

    await agentRun;
    const denied = transcript.events.some((event) =>
      event.kind === "approval_response" && event.decision === "deny"
    );
    if (denied) {
      await finalizeDeniedRun({ framework, backend, workspace: args.workspace, transcript });
      process.stdout.write("live approval completion: denied\n");
      const transcriptPath = writeTranscript(args.workspace, transcript);
      if (args.smokeExit) await close();
      return { status: "denied", appUrl, workspace: args.workspace, transcriptPath };
    }

    const rows = await finalizeSuccessfulRun({ framework, backend, workspace: args.workspace, transcript });
    process.stdout.write(`priority queue smoke: ${rows.length} rows\n`);
    process.stdout.write("live approval completion: completed\n");
    const transcriptPath = writeTranscript(args.workspace, transcript);
    if (args.smokeExit) await close();
    return { status: "completed", appUrl, workspace: args.workspace, transcriptPath };
  } catch (err) {
    await close();
    throw err;
  }
}

async function main(): Promise<number> {
  const result = await runM7LiveApproval(parseArgs(process.argv.slice(2)));
  if (result.status !== "completed" && result.status !== "denied") return 1;
  if (!process.argv.includes("--smoke-exit")) {
    process.stdout.write("Press Ctrl+C to stop the demo server.\n");
    await waitForShutdown(async () => undefined);
  }
  return 0;
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}
