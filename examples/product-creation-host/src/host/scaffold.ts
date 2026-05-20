import type { ScaffoldProjectManifest } from "@pneuma-framework/core";

export function devBoardScaffoldManifest(): ScaffoldProjectManifest {
  return {
    schema_version: 1,
    scaffold_id: "dev-board-scaffold",
    version: "0.1.0",
    display_name: "Dev Board Scaffold",
    materialization: {
      strategy: "copy",
      source_roots: ["src"],
      exclude: ["node_modules", ".pneuma"],
    },
    artifact_boundary: {
      writable_roots: ["src/board.json", "src/runtime.json"],
      protected_paths: ["framework/release.ts", "scripts/publish.sh"],
      generated_roots: ["src/generated"],
      share_include: ["src"],
      share_exclude: ["data", ".pneuma"],
    },
    agent_contract: {
      allowed_tasks: [
        "add_review_queue",
        "add_github_attention",
        "add_priority_lane",
        "add_runtime_item_action",
        "refine_dev_board_modules",
      ],
      forbidden_tasks: [
        "modify protected files",
        "change publish scripts",
        "write outside the draft workspace",
        "remove required base fields",
      ],
      system_prompt_fragments: [
        "Edit only src/board.json and src/runtime.json.",
        "Preserve valid JSON in both files.",
        "Use Host-declared Dev Board modules and runtime item actions only.",
      ],
      tool_policy: "draft-workspace-only",
    },
    guardrails: {
      pre_proposal: [
        {
          id: "json-diff-computable",
          kind: "command",
          command: "bun --version",
          description: "Bun is available before computing a source proposal.",
        },
      ],
      pre_apply: [
        {
          id: "pre-apply-runtime-ready",
          kind: "command",
          command: "bun --version",
          description: "Runtime toolchain is available before apply.",
        },
      ],
      post_apply: [
        {
          id: "post-apply-runtime-ready",
          kind: "command",
          command: "bun --version",
          description: "Runtime toolchain remains available after apply.",
        },
      ],
    },
    lifecycle: {
      preview: { command: "bun run preview" },
      build: { command: "bun run build" },
      test: [{ command: "bun test" }],
      publish: { command: "bun run publish" },
    },
    evidence: {
      diff: true,
      checks: true,
      changed_files: true,
      preview_url: true,
    },
  };
}
