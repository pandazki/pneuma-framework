import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { AgentBackend, AgentEvent, BuildThreadStore } from "@pneuma-framework/core";
import {
  runHostKitCodeAgentDraft,
  type HostKitCodeAgentDraftReceipt,
} from "@pneuma-framework/host-kit";
import {
  evolveDefinitionForIntent,
  hasModule,
  mentionsBlockerTriage,
  mentionsCiHealth,
  mentionsDeliveryTimeline,
  mentionsDependencyMap,
  mentionsGitHubAttention,
  mentionsPriorityLane,
  mentionsReviewQueue,
  parseDevBoardDefinition,
  validateDevBoardDefinition,
  type DevBoardDefinition,
} from "../domain/dev-board.js";
import {
  hasEditableRuntimeField,
  mentionsDirectOwnerEditing,
  parseDevBoardRuntimeExtension,
  validateDevBoardRuntimeExtension,
  withOwnerEditor,
} from "../domain/runtime-extension.js";
import {
  readBoardDefinition,
  readRuntimeExtension,
  resetDraftFromSource,
  writeBoardDefinition,
  writeRuntimeExtension,
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
      if (mentionsDirectOwnerEditing(input.builder_message.toLowerCase())) {
        const currentRuntime = readRuntimeExtension(input.source_root);
        writeRuntimeExtension(input.draft_root, withOwnerEditor(currentRuntime));
        input.append_log?.({
          kind: "host",
          text: "Deterministic draft added runtime action: edit_owner.",
        });
        return { source: input.source_root, draft: input.draft_root, mode: "deterministic" };
      }
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
      agentInput.append_log?.({
        kind: "session",
        text: `Starting real code agent${input.model ? ` with ${input.model}` : ""}.`,
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
          verify_draft: async () => {
            agentInput.append_log?.({
              kind: "host",
              text: "Running draft guardrails against src/board.json and src/runtime.json.",
            });
            return verifyDevBoardDraft(agentInput.source_root, agentInput.draft_root, agentInput.builder_message);
          },
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
    "Edit only these files: src/board.json and src/runtime.json.",
    "Keep src/board.json valid JSON with schema_version=1, modules[], fields[], and theme.",
    "Keep src/runtime.json valid JSON with schema_version=1 and item_actions[].",
    "Use only these module kinds: watchlist, notes, review_queue, github_attention, priority_lane, release_checklist, daily_plan, dependency_map, blocker_triage, ci_health, delivery_timeline.",
    "Use only these field types: text, status, priority, url, date, signal. Do not invent select/enum/number field types.",
    "Capability field ids are exact: review_status for review_queue, url for github_attention, priority for priority_lane, depends_on for dependency_map, blocked_reason for blocker_triage, ci_status for ci_health, due_date and effort for delivery_timeline.",
    "Runtime item actions belong in src/runtime.json. Supported runtime action shape is { id, kind: \"edit_field\", field, label, control, options?, placement? }.",
    "Supported runtime action fields are owner, status, priority, ci_status, blocked_reason. Supported controls are text and select.",
    "If the Builder asks for direct owner/assignee editing, add an edit_field item action for field owner in src/runtime.json. Prefer id edit_owner, label {\"en\":\"Edit owner\",\"zh\":\"编辑负责人\"}, control select, and options [\"Bob\",\"Charlie\",\"Alice\",\"Dave\",\"End User\"].",
    "Do not fake runtime behavior by only changing description text.",
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
    "Current generated app sources are src/board.json and src/runtime.json.",
    "Update one or both files to satisfy the Builder request.",
    "",
    "Acceptance:",
    "- src/board.json remains valid JSON.",
    "- src/runtime.json remains valid JSON.",
    "- It preserves title, owner, and status fields.",
    "- Review requests add review_queue and a field whose id is exactly review_status and type is status.",
    "- GitHub/issue/PR requests add github_attention and a field whose id is exactly url and type is url.",
    "- Priority/focus/triage requests add priority_lane and a field whose id is exactly priority and type is priority.",
    "- Dependency requests add dependency_map and a field whose id is exactly depends_on and type is text.",
    "- Blocker requests add blocker_triage and a field whose id is exactly blocked_reason and type is text.",
    "- CI/build/test signal requests add ci_health and a field whose id is exactly ci_status and type is signal.",
    "- Delivery/timeline/deadline requests add delivery_timeline plus due_date date and effort text fields.",
    "- Direct owner/assignee editing must add an edit_field runtime action for field owner in src/runtime.json.",
  ].join("\n");
}

function verifyDevBoardDraft(sourceRoot: string, draftRoot: string, message: string): {
  readonly ok: boolean;
  readonly message: string;
  readonly changed_paths?: readonly string[];
} {
  try {
    const changedPaths = changedSourcePaths(sourceRoot, draftRoot);
    const disallowed = changedPaths.filter((path) => !allowedDraftFiles.has(path));
    if (disallowed.length > 0) {
      return { ok: false, message: `Draft changed unsupported files: ${disallowed.join(", ")}` };
    }
    const text = readFileSync(join(draftRoot, "src", "board.json"), "utf8");
    const runtimeText = readFileSync(join(draftRoot, "src", "runtime.json"), "utf8");
    const definition = parseDevBoardDefinition(text);
    const runtimeExtension = parseDevBoardRuntimeExtension(runtimeText);
    const validation = validateDevBoardDefinition(definition);
    if (!validation.ok) return { ok: false, message: validation.issues.join("; ") };
    const runtimeValidation = validateDevBoardRuntimeExtension(runtimeExtension);
    if (!runtimeValidation.ok) return { ok: false, message: runtimeValidation.issues.join("; ") };
    const lower = message.toLowerCase();
    if (mentionsDirectOwnerEditing(lower)) {
      if (!hasEditableRuntimeField(runtimeExtension, "owner")) {
        return { ok: false, message: "src/runtime.json must declare an edit_field action for owner." };
      }
    }
    const missing: string[] = [];
    if (mentionsReviewQueue(lower) && !hasModule(definition, "review_queue")) missing.push("review_queue");
    if (mentionsGitHubAttention(lower) && !hasModule(definition, "github_attention")) missing.push("github_attention");
    if (mentionsPriorityLane(lower) && !hasModule(definition, "priority_lane")) missing.push("priority_lane");
    if (mentionsDependencyMap(lower) && !hasModule(definition, "dependency_map")) missing.push("dependency_map");
    if (mentionsBlockerTriage(lower) && !hasModule(definition, "blocker_triage")) missing.push("blocker_triage");
    if (mentionsCiHealth(lower) && !hasModule(definition, "ci_health")) missing.push("ci_health");
    if (mentionsDeliveryTimeline(lower) && !hasModule(definition, "delivery_timeline")) missing.push("delivery_timeline");
    if (missing.length > 0) {
      return { ok: false, message: `Missing requested modules: ${missing.join(", ")}` };
    }
    return {
      ok: true,
      message: "src/board.json and src/runtime.json are valid and satisfy the requested capability.",
      changed_paths: changedPaths.length > 0 ? changedPaths : expectedChangedPaths(lower),
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

function moduleDelta(before: DevBoardDefinition, after: DevBoardDefinition): readonly string[] {
  const existing = new Set(before.modules.map((mod) => mod.kind));
  return after.modules.map((mod) => mod.kind).filter((kind) => !existing.has(kind));
}

function expectedChangedPaths(lowercaseMessage: string): readonly string[] {
  const paths: string[] = [];
  if (
    mentionsReviewQueue(lowercaseMessage)
    || mentionsGitHubAttention(lowercaseMessage)
    || mentionsPriorityLane(lowercaseMessage)
    || mentionsDependencyMap(lowercaseMessage)
    || mentionsBlockerTriage(lowercaseMessage)
    || mentionsCiHealth(lowercaseMessage)
    || mentionsDeliveryTimeline(lowercaseMessage)
  ) {
    paths.push("src/board.json");
  }
  if (mentionsDirectOwnerEditing(lowercaseMessage)) paths.push("src/runtime.json");
  return paths.length > 0 ? paths : ["src/board.json"];
}

function changedSourcePaths(sourceRoot: string, draftRoot: string): readonly string[] {
  const paths = new Set([...listSourceFiles(sourceRoot), ...listSourceFiles(draftRoot)]);
  return [...paths].sort().filter((path) => readOptionalFile(sourceRoot, path) !== readOptionalFile(draftRoot, path));
}

function listSourceFiles(root: string): readonly string[] {
  const srcRoot = join(root, "src");
  if (!existsSync(srcRoot)) return [];
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const absolute = join(dir, entry);
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        visit(absolute);
      } else if (stat.isFile()) {
        files.push(normalizePath(relative(root, absolute)));
      }
    }
  };
  visit(srcRoot);
  return files;
}

function readOptionalFile(root: string, path: string): string | undefined {
  const absolute = join(root, path);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : undefined;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

const allowedDraftFiles = new Set(["src/board.json", "src/runtime.json"]);

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
