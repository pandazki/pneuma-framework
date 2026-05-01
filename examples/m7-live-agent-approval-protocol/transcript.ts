import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type AgentExecutionStatus = "running" | "completed" | "denied" | "failed";

export type AgentExecutionEventKind =
  | "builder_message"
  | "assistant_message"
  | "tool_call"
  | "permission_prompt"
  | "approval_response"
  | "tool_result"
  | "framework_restart"
  | "completion";

export type AgentExecutionActor = "builder" | "agent" | "framework";

export type AgentExecutionDecision = "allow" | "deny" | "allow-always";

export interface AgentExecutionEvent {
  id: string;
  at: string;
  actor: AgentExecutionActor;
  kind: AgentExecutionEventKind;
  summary: string;
  tool?: string;
  prompt_id?: string;
  call_id?: string;
  decision?: AgentExecutionDecision;
  ok?: boolean;
  detail?: unknown;
}

export interface AgentExecutionTranscript {
  schema_version: 1;
  run_id: string;
  created_at: string;
  status: AgentExecutionStatus;
  builder_request: string;
  before: unknown;
  after: unknown | null;
  events: AgentExecutionEvent[];
}

export function createAgentExecutionTranscript(input: {
  runId: string;
  builderRequest: string;
  before: unknown;
}): AgentExecutionTranscript {
  const transcript: AgentExecutionTranscript = {
    schema_version: 1,
    run_id: input.runId,
    created_at: new Date().toISOString(),
    status: "running",
    builder_request: input.builderRequest,
    before: input.before,
    after: null,
    events: [],
  };

  appendTranscriptEvent(transcript, {
    actor: "builder",
    kind: "builder_message",
    summary: input.builderRequest,
    detail: { request: input.builderRequest },
  });

  return transcript;
}

export function appendTranscriptEvent(
  transcript: AgentExecutionTranscript,
  input: Omit<AgentExecutionEvent, "id" | "at"> & Partial<Pick<AgentExecutionEvent, "id" | "at">>,
): AgentExecutionEvent {
  const event: AgentExecutionEvent = {
    id: input.id ?? randomUUID(),
    at: input.at ?? new Date().toISOString(),
    actor: input.actor,
    kind: input.kind,
    summary: input.summary,
  };

  if (input.tool !== undefined) event.tool = input.tool;
  if (input.prompt_id !== undefined) event.prompt_id = input.prompt_id;
  if (input.call_id !== undefined) event.call_id = input.call_id;
  if (input.decision !== undefined) event.decision = input.decision;
  if (input.ok !== undefined) event.ok = input.ok;
  if (input.detail !== undefined) event.detail = input.detail;

  transcript.events.push(event);
  return event;
}

export function recordAssistantTextDelta(transcript: AgentExecutionTranscript, text: string): void {
  if (!text) return;

  const previous = transcript.events.at(-1);
  if (
    previous
    && previous.kind === "assistant_message"
    && previous.actor === "agent"
    && previous.tool === undefined
    && previous.prompt_id === undefined
    && previous.call_id === undefined
  ) {
    previous.summary = `${previous.summary}${text}`;
    previous.detail = { text: previous.summary };
    return;
  }

  appendTranscriptEvent(transcript, {
    actor: "agent",
    kind: "assistant_message",
    summary: text,
    detail: { text },
  });
}

export function recordToolCall(
  transcript: AgentExecutionTranscript,
  input: {
    callId: string;
    tool: string;
    input: unknown;
  },
): void {
  appendTranscriptEvent(transcript, {
    actor: "agent",
    kind: "tool_call",
    tool: input.tool,
    call_id: input.callId,
    summary: `Call ${input.tool}`,
    detail: input.input,
  });
}

export function recordPermissionPrompt(
  transcript: AgentExecutionTranscript,
  input: {
    promptId: string;
    tool: string;
    detail: unknown;
  },
): void {
  appendTranscriptEvent(transcript, {
    actor: "framework",
    kind: "permission_prompt",
    tool: input.tool,
    prompt_id: input.promptId,
    summary: `Approval requested for ${input.tool}`,
    detail: input.detail,
  });
}

export function recordApprovalResponse(
  transcript: AgentExecutionTranscript,
  input: {
    promptId: string;
    tool: string;
    decision: AgentExecutionDecision;
  },
): void {
  const label = input.decision === "deny"
    ? "Denied"
    : input.decision === "allow-always"
      ? "Approved always"
      : "Approved";
  appendTranscriptEvent(transcript, {
    actor: "builder",
    kind: "approval_response",
    tool: input.tool,
    prompt_id: input.promptId,
    decision: input.decision,
    summary: `${label} ${input.tool}`,
  });
}

export function recordToolResult(
  transcript: AgentExecutionTranscript,
  input: {
    callId: string;
    tool: string;
    ok: boolean;
    result: unknown;
  },
): void {
  appendTranscriptEvent(transcript, {
    actor: "framework",
    kind: "tool_result",
    tool: input.tool,
    call_id: input.callId,
    ok: input.ok,
    summary: `${input.tool} returned ok=${input.ok}`,
    detail: input.result,
  });
}

export function recordFrameworkRestart(
  transcript: AgentExecutionTranscript,
  input: {
    summary: string;
    detail?: unknown;
  },
): void {
  appendTranscriptEvent(transcript, {
    actor: "framework",
    kind: "framework_restart",
    summary: input.summary,
    detail: input.detail,
  });
}

export function recordCompletion(
  transcript: AgentExecutionTranscript,
  input: {
    status: Exclude<AgentExecutionStatus, "running">;
    after?: unknown;
    summary: string;
    detail?: unknown;
  },
): void {
  transcript.status = input.status;
  if (input.after !== undefined) transcript.after = input.after;
  appendTranscriptEvent(transcript, {
    actor: "framework",
    kind: "completion",
    summary: input.summary,
    detail: input.detail,
  });
}

export function transcriptPath(workspace: string): string {
  return join(workspace, "data", "m7-agent-execution-transcript.json");
}

export function writeAgentExecutionTranscript(workspace: string, transcript: AgentExecutionTranscript): string {
  const path = transcriptPath(workspace);
  mkdirSync(join(workspace, "data"), { recursive: true });
  writeFileSync(path, `${JSON.stringify(transcript, null, 2)}\n`);
  return path;
}

export async function readAgentExecutionTranscript(workspace: string): Promise<AgentExecutionTranscript | null> {
  const path = transcriptPath(workspace);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as AgentExecutionTranscript;
}
