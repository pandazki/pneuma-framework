import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentBackend, AgentEvent, BuildThreadStore } from "@pneuma-framework/core";
import {
  runHostKitCodeAgentDraft,
  type HostKitCodeAgentDraftReceipt,
} from "@pneuma-framework/host-kit";
import {
  evolveDefinitionForIntent,
  hasModule,
  mentionsGitHubAttention,
  parseDevBoardDefinition,
  validateDevBoardDefinition,
  type DevBoardDefinition,
} from "../domain/dev-board.js";
import {
  readBoardDefinition,
  resetDraftFromSource,
  writeBoardDefinition,
  type ProductAgentLogKind,
} from "./store.js";

export interface DevBoardDraftAgentInput {
  readonly app_id: string;
  readonly thread_id: string;
  readonly builder_subject: string;
  readonly builder_message: string;
  readonly proposal_id: string;
  readonly build_change_id: string;
  readonly source_root: string;
  readonly draft_root: string;
  readonly thread_store: BuildThreadStore;
  readonly context_snapshot: unknown;
  readonly append_log?: (
    entry: { readonly kind: ProductAgentLogKind; readonly text: string },
    options?: { readonly merge_with_previous?: boolean },
  ) => void;
}

export interface DevBoardDraftAgentResult {
  readonly source: string;
  readonly draft: string;
  readonly mode: "deterministic" | "backend";
  readonly receipt?: HostKitCodeAgentDraftReceipt;
}

export interface DevBoardDraftAgent {
  produceDraft(input: DevBoardDraftAgentInput): Promise<DevBoardDraftAgentResult>;
  close?(): Promise<void>;
}

export function createDeterministicDevBoardDraftAgent(): DevBoardDraftAgent {
  return {
    async produceDraft(input) {
      resetDraftFromSource(input.source_root, input.draft_root);
      const current = readBoardDefinition(input.source_root);
      const evolved = evolveDefinitionForIntent(current, input.builder_message);
      writeBoardDefinition(input.draft_root, evolved);
      input.append_log?.({
        kind: "host",
        text: `Deterministic draft added modules: ${moduleDelta(current, evolved).join(", ") || "none"}.`,
      });
      return { source: input.source_root, draft: input.draft_root, mode: "deterministic" };
    },
  };
}

export function createBackendDevBoardDraftAgent(input: {
  readonly backend: AgentBackend;
  readonly model?: string;
  readonly timeout_ms?: number;
}): DevBoardDraftAgent {
  return {
    async produceDraft(agentInput) {
      resetDraftFromSource(agentInput.source_root, agentInput.draft_root);
      agentInput.append_log?.({
        kind: "host",
        text: `Draft workspace prepared: ${agentInput.draft_root}`,
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
          cwd: agentInput.draft_root,
          new_user_message: buildCodeAgentUserMessage(agentInput),
          system_prompt: codeAgentSystemPrompt(),
          context_snapshot: agentInput.context_snapshot,
          launch: input.model ? { model: input.model } : undefined,
          timeout_ms: input.timeout_ms ?? 210_000,
          poll_interval_ms: 1_000,
          verify_draft: async () => verifyDevBoardDraft(agentInput.draft_root, agentInput.builder_message),
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
        source: agentInput.source_root,
        draft: agentInput.draft_root,
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
    "You are the build-phase code agent inside Dev Board Builder, a Pneuma Creation Host.",
    "You are editing a draft workspace only. Do not edit parent directories.",
    "Edit exactly one file: src/board.json.",
    "Keep src/board.json valid JSON with schema_version=1, modules[], fields[], and theme.",
    "Use only these module kinds: watchlist, notes, review_queue, github_attention, priority_lane, release_checklist, daily_plan.",
    "Preserve base fields title, owner, status.",
    "Do not publish, migrate data, or approve anything. The Host will review, rehearse, and publish later.",
  ].join("\n");
}

function buildCodeAgentUserMessage(input: DevBoardDraftAgentInput): string {
  return [
    `Builder subject: ${input.builder_subject}`,
    `Builder request: ${input.builder_message}`,
    `Proposal id: ${input.proposal_id}`,
    `Build change id: ${input.build_change_id}`,
    "",
    "Current board source is src/board.json.",
    "Update it to satisfy the Builder request.",
    "",
    "Acceptance:",
    "- src/board.json remains valid JSON.",
    "- It preserves title, owner, and status fields.",
    "- Review requests add review_queue and review_status.",
    "- GitHub/issue/PR requests add github_attention and a url field.",
    "- Priority/focus/triage requests add priority_lane and a priority field.",
  ].join("\n");
}

function verifyDevBoardDraft(draftRoot: string, message: string): {
  readonly ok: boolean;
  readonly message: string;
  readonly changed_paths?: readonly string[];
} {
  try {
    const text = readFileSync(join(draftRoot, "src", "board.json"), "utf8");
    const definition = parseDevBoardDefinition(text);
    const validation = validateDevBoardDefinition(definition);
    if (!validation.ok) return { ok: false, message: validation.issues.join("; ") };
    const lower = message.toLowerCase();
    const missing: string[] = [];
    if (lower.includes("review") && !hasModule(definition, "review_queue")) missing.push("review_queue");
    if (mentionsGitHubAttention(lower) && !hasModule(definition, "github_attention")) missing.push("github_attention");
    if ((lower.includes("priority") || lower.includes("focus") || lower.includes("triage")) && !hasModule(definition, "priority_lane")) missing.push("priority_lane");
    if (missing.length > 0) {
      return { ok: false, message: `Missing requested modules: ${missing.join(", ")}` };
    }
    return {
      ok: true,
      message: "src/board.json is valid and satisfies the requested capability.",
      changed_paths: ["src/board.json"],
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

function moduleDelta(before: DevBoardDefinition, after: DevBoardDefinition): readonly string[] {
  const existing = new Set(before.modules.map((mod) => mod.kind));
  return after.modules.map((mod) => mod.kind).filter((kind) => !existing.has(kind));
}

function logEntryForAgentEvent(event: AgentEvent):
  | {
      readonly entry: { readonly kind: ProductAgentLogKind; readonly text: string };
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
  const state = part.state as { status?: unknown; input?: unknown; output?: unknown; error?: unknown } | undefined;
  const status = typeof state?.status === "string" ? state.status : "updated";
  const filePath = extractFilePath(state?.input);
  const suffixes = [
    filePath,
    state?.error ? `error=${stableSnippet(state.error)}` : undefined,
    status === "completed" && state?.output ? `output=${stableSnippet(state.output)}` : undefined,
  ].filter(Boolean);
  return suffixes.length > 0 ? `${name} ${status}: ${suffixes.join(" | ")}` : `${name} ${status}`;
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
    return text.length > 420 ? `${text.slice(0, 417)}...` : text;
  } catch {
    return String(value);
  }
}
