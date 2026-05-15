import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AgentBackend,
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
      const result = await runHostKitCodeAgentDraft({
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
      if (!result.ok) {
        throw new Error(`Code agent draft failed: ${result.reason}: ${result.message}`);
      }
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
