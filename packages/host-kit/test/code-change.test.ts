import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import {
  applyApprovedHostKitCodeChange,
  prepareHostKitCodeChangeReview,
} from "../src/index.js";
import type { ScaffoldProjectManifest } from "@pneuma-framework/core";

function workspace(): string {
  return mkdtempSync(join(tmpdir(), "pneuma-host-kit-code-"));
}

function manifest(): ScaffoldProjectManifest {
  return {
    schema_version: 1,
    scaffold_id: "team-notes-scaffold",
    version: "0.1.0",
    display_name: "Team Notes Scaffold",
    materialization: {
      strategy: "copy",
      source_roots: ["src"],
      exclude: ["node_modules"],
    },
    artifact_boundary: {
      writable_roots: ["src"],
      protected_paths: ["framework/release.ts"],
      generated_roots: ["src/generated"],
      share_include: ["src"],
      share_exclude: ["data"],
    },
    agent_contract: {
      allowed_tasks: ["add_review_queue_feature"],
      forbidden_tasks: ["modify protected files"],
      system_prompt_fragments: ["Use host-declared tools only."],
      tool_policy: "draft-workspace-only",
    },
    guardrails: {
      pre_proposal: [
        {
          id: "pre",
          kind: "command",
          command: "bun --version",
          description: "Bun is available.",
        },
      ],
      pre_apply: [
        {
          id: "pre-apply",
          kind: "command",
          command: "bun --version",
          description: "Bun is available before apply.",
        },
      ],
      post_apply: [
        {
          id: "post",
          kind: "command",
          command: "bun --version",
          description: "Bun remains available after apply.",
        },
      ],
    },
    lifecycle: {
      preview: { command: "bun run preview" },
      build: { command: "bun run build" },
      test: [{ command: "bun test" }],
    },
    evidence: {
      diff: true,
      checks: true,
      changed_files: true,
      preview_url: true,
    },
  };
}

function writeSourceAndDraft(root: string): { source: string; draft: string } {
  const source = join(root, "source");
  const draft = join(root, "draft");
  mkdirSync(join(source, "src"), { recursive: true });
  mkdirSync(join(draft, "src"), { recursive: true });
  writeFileSync(join(source, "src/app.ts"), "export const fields = ['title'];\n");
  writeFileSync(join(draft, "src/app.ts"), "export const fields = ['title', 'review_status'];\n");
  return { source, draft };
}

describe("host-kit code change orchestration", () => {
  test("creates a review packet with diff and source/data risks", async () => {
    const root = workspace();
    const { source, draft } = writeSourceAndDraft(root);

    const result = await prepareHostKitCodeChangeReview({
      manifest: manifest(),
      source_root: source,
      draft_root: draft,
      proposal_id: "proposal-review-queue",
      build_change_id: "change-review-queue",
      app_id: "team-notes",
      thread_id: "thread-1",
      builder_subject: "user:bob",
      summary: "Add review queue.",
      rationale: "Notes need explicit review.",
      migration_mode: "carry_forward_with_receipt",
      risks: ["source_code_change", "data_migration"],
      command_runner: async () => ({ ok: true, output: "ok" }),
    });

    rmSync(root, { recursive: true, force: true });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected review packet");
    expect(result.review_packet.risk_classification).toEqual(["source_code_change", "data_migration"]);
    expect(result.review_packet.proposed_changes.map((change) => change.kind)).toEqual(["source", "migration"]);
    expect(result.proposal.evidence.diff).toContain("review_status");
  });

  test("does not apply without approval", async () => {
    const root = workspace();
    const { source, draft } = writeSourceAndDraft(root);

    const prepared = await prepareHostKitCodeChangeReview({
      manifest: manifest(),
      source_root: source,
      draft_root: draft,
      proposal_id: "proposal-review-queue",
      build_change_id: "change-review-queue",
      app_id: "team-notes",
      thread_id: "thread-1",
      builder_subject: "user:bob",
      summary: "Add review queue.",
      rationale: "Notes need explicit review.",
      migration_mode: "carry_forward_with_receipt",
      risks: ["source_code_change", "data_migration"],
      command_runner: async () => ({ ok: true, output: "ok" }),
    });
    if (!prepared.ok) throw new Error("expected prepared proposal");

    const denied = await applyApprovedHostKitCodeChange({
      manifest: manifest(),
      source_root: source,
      draft_root: draft,
      proposal: prepared.proposal,
      approval: { allowed: false, reason_code: "missing-required-approval" },
      command_runner: async () => ({ ok: true, output: "ok" }),
    });

    expect(denied.ok).toBe(false);
    expect(readFileSync(join(source, "src/app.ts"), "utf8")).not.toContain("review_status");
    rmSync(root, { recursive: true, force: true });
  });
});
