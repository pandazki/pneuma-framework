import { rmSync } from "node:fs";
import type { ScaffoldProjectManifest } from "@pneuma-framework/core";
import { draftRoot, sourceRoot, writeProjectSource } from "./workspace.js";

export function teamNotesScaffoldManifest(): ScaffoldProjectManifest {
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
      forbidden_tasks: ["modify protected files", "change release scripts"],
      system_prompt_fragments: ["Use host-declared tools only."],
      tool_policy: "draft-workspace-only",
    },
    guardrails: {
      pre_proposal: [
        {
          id: "pre-proposal",
          kind: "command",
          command: "bun --version",
          description: "Bun is available before proposal.",
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
          id: "post-apply",
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

export function materializeReviewQueueDraft(workspace: string, appId: string): { source: string; draft: string } {
  const source = sourceRoot(workspace, appId);
  const draft = draftRoot(workspace, appId);
  rmSync(draft, { recursive: true, force: true });
  writeProjectSource(draft, ["title", "body", "owner", "status", "review_status"]);
  return { source, draft };
}
