import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  formatAgentRunTurnPrompt,
  packBuildTurnsForRoleContent,
  type AgentBackend,
  type AgentEvent,
  type BuildThreadStore,
} from "@pneuma-framework/core";
import {
  type HostKitCodeAgentDraftReceipt,
} from "@pneuma-framework/host-kit";
import {
  classifyWorkflowIntent,
  expectedPatchEvidenceForIntent,
  legalReviewWorkflowAppModuleSource,
  materializeWorkflowFromSourceRoot,
  slaWorkflowAppModuleSource,
} from "./generated-app-module.js";
import type { WorkflowAgentLogEntry } from "./store.js";

export interface WorkflowDraftAgentInput {
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
    entry: Omit<WorkflowAgentLogEntry, "at_ms">,
    options?: { readonly merge_with_previous?: boolean },
  ) => void;
}

export interface WorkflowDraftAgentResult {
  readonly source: string;
  readonly draft: string;
  readonly mode: "deterministic" | "opencode" | "codex-app-server";
  readonly receipt?: HostKitCodeAgentDraftReceipt;
}

export interface WorkflowDraftAgent {
  produceDraft(input: WorkflowDraftAgentInput): Promise<WorkflowDraftAgentResult>;
  close?(): Promise<void>;
}

export function createDeterministicWorkflowDraftAgent(): WorkflowDraftAgent {
  return {
    async produceDraft(input) {
      const intent = classifyWorkflowIntent(input.builder_message);
      const appModulePath = join(input.draft_root, "src", "app.ts");
      if (intent === "legal_review") {
        writeFileSync(appModulePath, legalReviewWorkflowAppModuleSource());
      } else if (intent === "sla_tracking") {
        writeFileSync(appModulePath, slaWorkflowAppModuleSource());
      } else {
        writeFileSync(appModulePath, `export const workflowPatch = { purpose_suffix: "Refined by Builder request." };\n`);
      }
      input.append_log?.({
        kind: "host",
        text: `Deterministic draft updated src/app.ts for ${intent}.`,
      });
      return { source: input.source_root, draft: input.draft_root, mode: "deterministic" };
    },
  };
}

export function createBackendWorkflowDraftAgent(input: {
  readonly backend: AgentBackend;
  readonly model?: string;
  readonly timeout_ms?: number;
}): WorkflowDraftAgent {
  return {
    async produceDraft(agentInput) {
      agentInput.append_log?.({
        kind: "host",
        text: `Draft workspace prepared: ${agentInput.draft_root}`,
      });
      agentInput.append_log?.({
        kind: "session",
        text: `Starting real opencode code agent${input.model ? ` with ${input.model}` : ""}.`,
      });
      const unsubscribe = input.backend.onEvent((event) => {
        const mapped = logEntryForAgentEvent(event);
        if (mapped) agentInput.append_log?.(mapped.entry, mapped.options);
        if (event.type === "permission-request") {
          const requestId = extractPermissionRequestId(event.payload);
          if (requestId) {
            void input.backend.respondToPermission(event.sessionId, {
              requestId,
              decision: "allow",
            }).catch((err) => {
              agentInput.append_log?.({
                kind: "error",
                text: `Failed to answer opencode permission request ${requestId}: ${err instanceof Error ? err.message : String(err)}`,
              });
            });
          }
        }
      });
      let result;
      try {
        result = await runDetachedWorkflowCodeAgentDraft({
          app_id: agentInput.app_id,
          proposal_id: agentInput.proposal_id,
          backend: input.backend,
          thread_store: agentInput.thread_store,
          thread_id: agentInput.thread_id,
          cwd: agentInput.draft_root,
          new_user_message: buildCodeAgentUserMessage(agentInput),
          system_prompt: codeAgentSystemPrompt(),
          context_snapshot: agentInput.context_snapshot,
          model: input.model,
          timeout_ms: input.timeout_ms ?? 600_000,
          poll_interval_ms: 1_000,
          verify_draft: async () => {
            agentInput.append_log?.({
              kind: "host",
              text: "Running draft guardrails against src/app.ts.",
            });
            return verifyWorkflowDraft(agentInput.source_root, agentInput.draft_root, agentInput.builder_message);
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
        mode: "opencode",
        receipt: result.receipt,
      };
    },
    async close() {
      await input.backend.close();
    },
  };
}

async function runDetachedWorkflowCodeAgentDraft(input: {
  readonly app_id: string;
  readonly proposal_id: string;
  readonly backend: AgentBackend;
  readonly thread_store: BuildThreadStore;
  readonly thread_id: string;
  readonly cwd: string;
  readonly new_user_message: string;
  readonly system_prompt: string;
  readonly context_snapshot?: unknown;
  readonly model?: string;
  readonly timeout_ms: number;
  readonly poll_interval_ms: number;
  readonly verify_draft: () => Promise<{ readonly ok: boolean; readonly message: string; readonly changed_paths?: readonly string[] }>;
}): Promise<
  | { readonly ok: true; readonly receipt: HostKitCodeAgentDraftReceipt }
  | { readonly ok: false; readonly reason: "agent_launch_failed" | "draft_verification_failed"; readonly message: string }
> {
  let sessionId: string;
  try {
    const turns = await input.thread_store.listTurns(input.thread_id);
    const prompt = formatAgentRunTurnPrompt({
      system_prompt: input.system_prompt,
      context_snapshot: input.context_snapshot,
      messages: [
        ...packBuildTurnsForRoleContent(turns),
        {
          role: "user",
          content: input.new_user_message,
        },
      ],
    });
    const session = await input.backend.launch({
      cwd: input.cwd,
      ...(input.model ? { model: input.model } : {}),
      permissionMode: "accept",
    });
    sessionId = session.sessionId;
    void input.backend.sendUserMessage(session.sessionId, prompt).catch((err) => {
      void input.thread_store.appendTurn(input.thread_id, {
        kind: "host_event",
        label: "code_agent_send_failed",
        payload: {
          message: err instanceof Error ? err.message : String(err),
        },
      }).catch(() => {});
    });
  } catch (err) {
    return {
      ok: false,
      reason: "agent_launch_failed",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const verification = await waitForDraftVerification({
    verify: input.verify_draft,
    timeout_ms: input.timeout_ms,
    poll_interval_ms: input.poll_interval_ms,
  });
  if (!verification.ok) {
    await input.thread_store.appendTurn(input.thread_id, {
      kind: "host_event",
      label: "code_agent_draft_failed",
      payload: {
        reason: "draft_verification_failed",
        message: verification.message,
        backend_type: input.backend.type,
        session_id: sessionId,
      },
    });
    return {
      ok: false,
      reason: "draft_verification_failed",
      message: verification.message,
    };
  }

  const receipt: HostKitCodeAgentDraftReceipt = {
    receipt_id: `code-agent-draft-${input.proposal_id}`,
    app_id: input.app_id,
    proposal_id: input.proposal_id,
    thread_id: input.thread_id,
    backend_type: input.backend.type,
    status: "completed",
    changed_paths: verification.changed_paths ?? [],
    created_at_ms: Date.now(),
    evidence_refs: [{ kind: "host_check", check_id: "draft-verification", status: "passed" }],
  };
  await input.thread_store.appendTurn(input.thread_id, {
    kind: "host_event",
    label: "code_agent_draft",
    payload: receipt,
  });
  return { ok: true, receipt };
}

async function waitForDraftVerification(input: {
  readonly verify: () => Promise<{ readonly ok: boolean; readonly message: string; readonly changed_paths?: readonly string[] }>;
  readonly timeout_ms: number;
  readonly poll_interval_ms: number;
}): Promise<{ readonly ok: boolean; readonly message: string; readonly changed_paths?: readonly string[] }> {
  const started = Date.now();
  let latest: { readonly ok: boolean; readonly message: string; readonly changed_paths?: readonly string[] } = {
    ok: false,
    message: "verification not started",
  };
  while (Date.now() - started <= input.timeout_ms) {
    latest = await input.verify();
    if (latest.ok) return latest;
    await sleep(input.poll_interval_ms);
  }
  return latest;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function verifyWorkflowDraft(
  sourceRoot: string,
  draftRoot: string,
  message: string,
): Promise<{ readonly ok: boolean; readonly message: string; readonly changed_paths?: readonly string[] }> {
  try {
    const changedPaths = changedSourcePaths(sourceRoot, draftRoot);
    const disallowed = changedPaths.filter((path) => path !== "src/app.ts");
    if (disallowed.length > 0) {
      return { ok: false, message: `Draft changed unsupported files: ${disallowed.join(", ")}` };
    }
    if (!changedPaths.includes("src/app.ts")) {
      return { ok: false, message: "Draft must modify src/app.ts." };
    }

    const materialized = await materializeWorkflowFromSourceRoot(draftRoot);
    const required = expectedPatchEvidenceForIntent(message).required_ids;
    const allIds = new Set([
      ...materialized.fields.map((field) => field.id),
      ...materialized.stages.map((stage) => stage.id),
      ...materialized.actions.map((action) => action.id),
      ...materialized.views.map((view) => view.id),
    ]);
    const missing = required.filter((id) => !allIds.has(id));
    if (missing.length > 0) {
      return { ok: false, message: `Generated app code is missing requested ids: ${missing.join(", ")}` };
    }
    return {
      ok: true,
      message: "src/app.ts materializes a valid workflow and satisfies the Builder request.",
      changed_paths: changedPaths,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export function codeAgentSystemPrompt(): string {
  return [
    "You are the build-phase code agent inside Workflow App Studio, a Pneuma Creation Host.",
    "You are editing a draft workspace only. Do not edit parent directories.",
    "Edit only src/app.ts. Do not edit src/workflow.json, src/runtime.json, src/theme.json, framework/, scripts/, or host files.",
    "src/app.ts must export const workflowPatch = { fields, stages, actions, views, purpose_suffix? }.",
    "The Host imports src/app.ts, applies workflowPatch to src/workflow.json, validates the workflow, builds a proposal, asks the Builder for approval, and only then applies the code change.",
    "Do not publish, approve, migrate, delete records, or modify release scripts.",
    "Use this schema:",
    "- fields: { id, label, type, required?, options?, helper_text? }[]; type is text, long_text, number, date, select, user, or url.",
    "- stages: { id, label, description?, terminal? }[].",
    "- actions: { id, label, from_stage, to_stage, required_role, requires_comment? }[].",
    "- views: { id, label, kind, fields, stage_filter? }[]; kind is form, queue, or detail.",
    "For legal/contract review requests, add contract_value, legal_review, send_to_legal_review, legal_approve, and legal_queue.",
    "For SLA/deadline/overdue requests, add due_date, sla_status, and sla_watch.",
    "Make a real functional change, not just a description change.",
  ].join("\n");
}

export function buildCodeAgentUserMessage(input: WorkflowDraftAgentInput): string {
  return [
    `Builder subject: ${input.builder_subject}`,
    `Builder request: ${input.builder_message}`,
    `Proposal id: ${input.proposal_id}`,
    `Build change id: ${input.build_change_id}`,
    "",
    "Current generated app sources:",
    "- src/workflow.json: base workflow definition.",
    "- src/runtime.json and src/theme.json: runtime settings.",
    "- src/app.ts: generated app source module; this is the only file you may edit.",
    "",
    "Acceptance:",
    "- Only src/app.ts changes.",
    "- src/app.ts exports workflowPatch.",
    "- The workflowPatch materializes into a valid workflow.",
    "- Legal/contract review requests add contract_value, legal_review, send_to_legal_review, legal_approve, and legal_queue.",
    "- SLA/deadline/overdue requests add due_date, sla_status, and sla_watch.",
    "- The change creates visible runtime behavior in the generated app after preview/publish.",
  ].join("\n");
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

function logEntryForAgentEvent(event: AgentEvent):
  | {
      readonly entry: Omit<WorkflowAgentLogEntry, "at_ms">;
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

function extractPermissionRequestId(payload: Record<string, unknown>): string | undefined {
  const direct = payload.id ?? payload.requestId ?? payload.permissionId ?? payload.permissionID;
  if (typeof direct === "string") return direct;
  const nested = payload.permission;
  if (nested && typeof nested === "object") {
    const id = (nested as { id?: unknown; permissionID?: unknown; permissionId?: unknown }).id
      ?? (nested as { id?: unknown; permissionID?: unknown; permissionId?: unknown }).permissionID
      ?? (nested as { id?: unknown; permissionID?: unknown; permissionId?: unknown }).permissionId;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

function stableSnippet(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    return text.length > 500 ? `${text.slice(0, 497)}...` : text;
  } catch {
    return String(value);
  }
}
