import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AgentBackend,
  AgentEvent,
  BuildThreadStore,
  BuildTurnRoleContentMessage,
} from "@pneuma-framework/core";
import {
  runHostKitCodeAgentDraft,
  type HostKitCodeAgentDraftReceipt,
} from "@pneuma-framework/host-kit";
import { materializeReviewQueueDraft, prepareReviewQueueDraftWorkspace } from "./review-queue-tool.js";

export interface ReviewQueueDraftAgentInput {
  readonly workspace: string;
  readonly app_id: string;
  readonly thread_id: string;
  readonly builder_subject: string;
  readonly builder_message: string;
  readonly proposal_id: string;
  readonly build_change_id: string;
  readonly thread_store: BuildThreadStore;
  readonly context_snapshot: unknown;
  readonly append_log?: (
    entry: { readonly kind: "host" | "session" | "assistant" | "tool" | "permission" | "error"; readonly text: string },
    options?: { readonly merge_with_previous?: boolean },
  ) => void;
}

export interface ReviewQueueDraftAgentResult {
  readonly source: string;
  readonly draft: string;
  readonly mode: "deterministic" | "backend";
  readonly receipt?: HostKitCodeAgentDraftReceipt;
}

export interface ReviewQueueDraftAgent {
  produceDraft(input: ReviewQueueDraftAgentInput): Promise<ReviewQueueDraftAgentResult>;
  close?(): Promise<void>;
}

export function createDeterministicReviewQueueDraftAgent(): ReviewQueueDraftAgent {
  return {
    async produceDraft(input) {
      input.append_log?.({
        kind: "host",
        text: "Deterministic draft agent materialized src/app.ts without launching a backend.",
      });
      return {
        ...materializeReviewQueueDraft(input.workspace, input.app_id),
        mode: "deterministic",
      };
    },
  };
}

export function createBackendReviewQueueDraftAgent(input: {
  readonly backend: AgentBackend;
  readonly model?: string;
  readonly timeout_ms?: number;
}): ReviewQueueDraftAgent {
  return {
    async produceDraft(agentInput) {
      const { source, draft } = prepareReviewQueueDraftWorkspace(agentInput.workspace, agentInput.app_id);
      agentInput.append_log?.({
        kind: "host",
        text: `Draft workspace prepared: ${draft}`,
      });
      const unsubscribe = input.backend.onEvent((event) => {
        const mapped = logEntryForAgentEvent(event);
        if (!mapped) return;
        agentInput.append_log?.(mapped.entry, mapped.options);
      });
      let result;
      try {
        result = await runHostKitCodeAgentDraft({
          app_id: agentInput.app_id,
          proposal_id: agentInput.proposal_id,
          backend: input.backend,
          thread_store: agentInput.thread_store,
          thread_id: agentInput.thread_id,
          cwd: draft,
          new_user_message: buildCodeAgentUserMessage(agentInput),
          system_prompt: codeAgentSystemPrompt(),
          context_snapshot: agentInput.context_snapshot,
          launch: input.model ? { model: input.model } : undefined,
          timeout_ms: input.timeout_ms ?? 180_000,
          poll_interval_ms: 1_000,
          verify_draft: async () => verifyReviewQueueDraft(draft),
        });
      } finally {
        unsubscribe();
      }
      if (!result.ok) {
        agentInput.append_log?.({
          kind: "error",
          text: `Code agent draft failed: ${result.reason}: ${result.message}`,
        });
        throw new Error(`Code agent draft failed: ${result.reason}: ${result.message}`);
      }
      agentInput.append_log?.({
        kind: "host",
        text: `Draft verification passed. Changed paths: ${result.receipt.changed_paths.join(", ") || "none"}.`,
      });
      return {
        source,
        draft,
        mode: "backend",
        receipt: result.receipt,
      };
    },
    async close() {
      await input.backend.close();
    },
  };
}

function codeAgentSystemPrompt(): string {
  return [
    "You are the build-phase code agent for a Pneuma Reference Creation Host.",
    "You are editing a draft workspace only. Do not edit parent directories.",
    "Complete the requested source change directly; do not ask clarification questions.",
    "The Host will review your diff, run guardrails, require reviewer approval, rehearse data, and publish later.",
    "For this task, edit src/app.ts so the exported teamNotesFields array includes review_status.",
    "Keep the file small and valid TypeScript.",
  ].join("\n");
}

function buildCodeAgentUserMessage(input: ReviewQueueDraftAgentInput): string {
  return [
    `Builder subject: ${input.builder_subject}`,
    `Builder request: ${input.builder_message}`,
    `Proposal id: ${input.proposal_id}`,
    `Build change id: ${input.build_change_id}`,
    "",
    "Make exactly this product change:",
    "- Add a review queue field named review_status to the Team Notes Board source.",
    "- Preserve the existing fields: title, body, owner, status.",
    "- Only edit src/app.ts.",
    "",
    "Acceptance:",
    "- src/app.ts contains review_status.",
    "- src/app.ts remains valid TypeScript.",
  ].join("\n");
}

function verifyReviewQueueDraft(draftRoot: string): {
  readonly ok: boolean;
  readonly message: string;
  readonly changed_paths?: readonly string[];
} {
  try {
    const text = readFileSync(join(draftRoot, "src/app.ts"), "utf8");
    const hasReviewStatus = text.includes("review_status");
    const hasExistingFields = ["title", "body", "owner", "status"].every((field) => text.includes(field));
    return {
      ok: hasReviewStatus && hasExistingFields,
      message: hasReviewStatus && hasExistingFields
        ? "src/app.ts contains review_status and preserves existing fields."
        : "src/app.ts does not yet contain the expected field set.",
      changed_paths: ["src/app.ts"],
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export function summarizeBackendMessages(messages: readonly BuildTurnRoleContentMessage[]): string {
  return messages.map((message) => `${message.role}: ${message.content}`).join("\n");
}

function logEntryForAgentEvent(event: AgentEvent):
  | {
      readonly entry: {
        readonly kind: "host" | "session" | "assistant" | "tool" | "permission" | "error";
        readonly text: string;
      };
      readonly options?: { readonly merge_with_previous?: boolean };
    }
  | undefined {
  if (event.type === "session-ready") {
    return { entry: { kind: "session", text: `opencode session ready: ${event.sessionId}` } };
  }
  if (event.type === "session-exited") {
    return { entry: { kind: "session", text: `opencode session exited: ${event.sessionId}` } };
  }
  if (event.type === "error") {
    return { entry: { kind: "error", text: stableSnippet(event.payload) } };
  }
  if (event.type === "permission-request") {
    return { entry: { kind: "permission", text: stableSnippet(event.payload) } };
  }
  if (event.type !== "text") return undefined;

  const delta = event.payload.delta;
  if (typeof delta === "string" && delta.length > 0) {
    return {
      entry: { kind: "assistant", text: delta },
      options: { merge_with_previous: true },
    };
  }

  const part = event.payload.part as { type?: unknown; tool?: unknown; name?: unknown; state?: unknown } | undefined;
  if (part?.type === "tool") {
    return { entry: { kind: "tool", text: formatToolPart(part) } };
  }

  return undefined;
}

function formatToolPart(part: { type?: unknown; tool?: unknown; name?: unknown; state?: unknown }): string {
  const name = typeof part.tool === "string"
    ? part.tool
    : typeof part.name === "string"
      ? part.name
      : "tool";
  const state = part.state as {
    status?: unknown;
    input?: unknown;
    output?: unknown;
    error?: unknown;
  } | undefined;
  const status = typeof state?.status === "string" ? state.status : "updated";
  const filePath = extractFilePath(state?.input);
  const suffixes = [
    filePath,
    state?.error ? `error=${stableSnippet(state.error)}` : undefined,
    status === "completed" && state?.output ? `output=${stableSnippet(state.output)}` : undefined,
  ].filter(Boolean);
  return suffixes.length > 0
    ? `${name} ${status}: ${suffixes.join(" | ")}`
    : `${name} ${status}`;
}

function extractFilePath(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const path = (input as { filePath?: unknown; path?: unknown }).filePath
    ?? (input as { filePath?: unknown; path?: unknown }).path;
  return typeof path === "string" ? path : undefined;
}

function stableSnippet(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    return text.length > 360 ? `${text.slice(0, 357)}...` : text;
  } catch {
    return String(value);
  }
}
