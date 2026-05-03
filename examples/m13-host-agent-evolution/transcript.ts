import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type HostAgentEvolutionStatus = "running" | "awaiting_approval" | "completed" | "denied" | "failed";

export type HostAgentEventKind =
  | "builder_message"
  | "agent_message"
  | "tool_call"
  | "approval_prompt"
  | "approval_response"
  | "tool_result"
  | "framework_restart"
  | "completion";

export type HostAgentActor = "builder" | "agent" | "framework";
export type HostAgentDecision = "allow" | "deny" | "allow-always";

export interface HostAgentTranscriptEvent {
  readonly id: string;
  readonly at: string;
  readonly actor: HostAgentActor;
  readonly kind: HostAgentEventKind;
  summary: string;
  readonly tool?: string;
  readonly prompt_id?: string;
  readonly call_id?: string;
  readonly decision?: HostAgentDecision;
  readonly ok?: boolean;
  readonly detail?: unknown;
}

export interface HostAgentTranscript {
  readonly schema_version: 1;
  readonly run_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly builder_user_id: string;
  readonly created_at: string;
  status: HostAgentEvolutionStatus;
  readonly builder_request: string;
  readonly before: unknown;
  after: unknown | null;
  readonly events: HostAgentTranscriptEvent[];
}

type EventInput =
  & Omit<HostAgentTranscriptEvent, "id" | "at">
  & Partial<Pick<HostAgentTranscriptEvent, "id" | "at">>;

export function createHostAgentTranscript(input: {
  readonly runId: string;
  readonly appId: string;
  readonly versionId: string;
  readonly builderUserId: string;
  readonly builderRequest: string;
  readonly before: unknown;
}): HostAgentTranscript {
  const transcript: HostAgentTranscript = {
    schema_version: 1,
    run_id: input.runId,
    app_id: input.appId,
    version_id: input.versionId,
    builder_user_id: input.builderUserId,
    created_at: new Date().toISOString(),
    status: "running",
    builder_request: input.builderRequest,
    before: input.before,
    after: null,
    events: [],
  };

  appendEvent(transcript, {
    actor: "builder",
    kind: "builder_message",
    summary: input.builderRequest,
    detail: {
      request: input.builderRequest,
      builder_user_id: input.builderUserId,
    },
  });

  return transcript;
}

export function recordAgentMessage(transcript: HostAgentTranscript, text: string): void {
  if (!text) return;
  const previous = transcript.events.at(-1);
  if (
    previous
    && previous.actor === "agent"
    && previous.kind === "agent_message"
    && previous.tool === undefined
    && previous.prompt_id === undefined
    && previous.call_id === undefined
  ) {
    previous.summary = `${previous.summary}\n${text}`;
    return;
  }

  appendEvent(transcript, {
    actor: "agent",
    kind: "agent_message",
    summary: text,
    detail: { text },
  });
}

export function recordToolCall(
  transcript: HostAgentTranscript,
  input: {
    readonly callId: string;
    readonly tool: string;
    readonly input: unknown;
  },
): void {
  appendEvent(transcript, {
    actor: "agent",
    kind: "tool_call",
    call_id: input.callId,
    tool: input.tool,
    summary: `Call ${input.tool}`,
    detail: input.input,
  });
}

export function recordApprovalPrompt(
  transcript: HostAgentTranscript,
  input: {
    readonly promptId: string;
    readonly tool: string;
    readonly summary: string;
    readonly detail: unknown;
  },
): void {
  transcript.status = "awaiting_approval";
  appendEvent(transcript, {
    actor: "framework",
    kind: "approval_prompt",
    prompt_id: input.promptId,
    tool: input.tool,
    summary: input.summary,
    detail: input.detail,
  });
}

export function recordApprovalResponse(
  transcript: HostAgentTranscript,
  input: {
    readonly promptId: string;
    readonly tool: string;
    readonly decision: HostAgentDecision;
  },
): void {
  transcript.status = input.decision === "deny" ? "denied" : "running";
  const label = input.decision === "deny"
    ? "Denied"
    : input.decision === "allow-always"
      ? "Approved always"
      : "Approved";
  appendEvent(transcript, {
    actor: "builder",
    kind: "approval_response",
    prompt_id: input.promptId,
    tool: input.tool,
    decision: input.decision,
    summary: `${label} ${input.tool}`,
  });
}

export function recordToolResult(
  transcript: HostAgentTranscript,
  input: {
    readonly callId: string;
    readonly tool: string;
    readonly ok: boolean;
    readonly result: unknown;
  },
): void {
  appendEvent(transcript, {
    actor: "framework",
    kind: "tool_result",
    call_id: input.callId,
    tool: input.tool,
    ok: input.ok,
    summary: `${input.tool} returned ok=${input.ok}`,
    detail: input.result,
  });
}

export function recordFrameworkRestart(
  transcript: HostAgentTranscript,
  input: {
    readonly summary: string;
    readonly detail?: unknown;
  },
): void {
  appendEvent(transcript, {
    actor: "framework",
    kind: "framework_restart",
    summary: input.summary,
    detail: input.detail,
  });
}

export function recordCompletion(
  transcript: HostAgentTranscript,
  input: {
    readonly status: Exclude<HostAgentEvolutionStatus, "running" | "awaiting_approval">;
    readonly after?: unknown;
    readonly summary: string;
    readonly detail?: unknown;
  },
): void {
  transcript.status = input.status;
  if (input.after !== undefined) transcript.after = input.after;
  appendEvent(transcript, {
    actor: "framework",
    kind: "completion",
    summary: input.summary,
    detail: input.detail,
  });
}

export function transcriptPath(versionWorkspace: string, runId: string): string {
  return join(versionWorkspace, ".pneuma-host", "agent-transcripts", `${runId}.json`);
}

export function writeHostAgentTranscript(versionWorkspace: string, transcript: HostAgentTranscript): string {
  const path = transcriptPath(versionWorkspace, transcript.run_id);
  mkdirSync(join(versionWorkspace, ".pneuma-host", "agent-transcripts"), { recursive: true });
  writeFileSync(path, `${JSON.stringify(transcript, null, 2)}\n`);
  return path;
}

function appendEvent(transcript: HostAgentTranscript, input: EventInput): HostAgentTranscriptEvent {
  const event: HostAgentTranscriptEvent = {
    id: input.id ?? randomUUID(),
    at: input.at ?? new Date().toISOString(),
    actor: input.actor,
    kind: input.kind,
    summary: input.summary,
    ...(input.tool !== undefined ? { tool: input.tool } : {}),
    ...(input.prompt_id !== undefined ? { prompt_id: input.prompt_id } : {}),
    ...(input.call_id !== undefined ? { call_id: input.call_id } : {}),
    ...(input.decision !== undefined ? { decision: input.decision } : {}),
    ...(input.ok !== undefined ? { ok: input.ok } : {}),
    ...(input.detail !== undefined ? { detail: input.detail } : {}),
  };
  transcript.events.push(event);
  return event;
}
