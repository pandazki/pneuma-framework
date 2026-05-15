import type { ScaffoldProjectManifest } from "@pneuma-framework/core";

export function openEndedScaffoldManifest(): ScaffoldProjectManifest {
  return {
    schema_version: 1,
    scaffold_id: "open-ended-focus-site-scaffold",
    version: "0.1.0",
    display_name: "Open-ended Focus Site Scaffold",
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
      allowed_tasks: ["modify focus site sections", "update style tokens"],
      forbidden_tasks: ["modify protected files", "change release scripts"],
      system_prompt_fragments: ["Use host-domain UI artifact tools only."],
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
