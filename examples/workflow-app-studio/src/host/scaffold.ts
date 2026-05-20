import type { ScaffoldProjectManifest } from "@pneuma-framework/core";

export function workflowAppScaffoldManifest(): ScaffoldProjectManifest {
  return {
    schema_version: 1,
    scaffold_id: "workflow-app-scaffold",
    version: "0.1.0",
    display_name: "Workflow App Scaffold",
    materialization: {
      strategy: "copy",
      source_roots: ["src"],
      exclude: ["node_modules", ".pneuma", "data"],
    },
    artifact_boundary: {
      writable_roots: ["src/workflow.json", "src/runtime.json", "src/theme.json"],
      protected_paths: ["framework/release.ts", "scripts/publish.sh", "src/host"],
      generated_roots: ["src/generated"],
      share_include: ["src"],
      share_exclude: ["data", ".pneuma", ".env"],
    },
    agent_contract: {
      allowed_tasks: [
        "add_workflow_stage",
        "add_workflow_field",
        "add_workflow_action",
        "add_workflow_view",
        "refine_runtime_controls",
        "refine_theme_tokens",
      ],
      forbidden_tasks: [
        "modify Host code",
        "modify protected files",
        "change publish scripts",
        "write outside the draft workspace",
        "remove existing record data without migration evidence",
      ],
      system_prompt_fragments: [
        "Edit only src/workflow.json, src/runtime.json, and src/theme.json.",
        "Preserve valid JSON in every edited source file.",
        "Keep workflow stages, actions, fields, and views internally consistent.",
        "Never special-case a persistence provider; target the Host workflow contracts.",
      ],
      tool_policy: "draft-workspace-only",
    },
    guardrails: {
      pre_proposal: [
        {
          id: "workflow-json-parseable",
          kind: "command",
          command: "bun --version",
          description: "Runtime toolchain is available before computing workflow source diffs.",
        },
      ],
      pre_apply: [
        {
          id: "workflow-domain-valid",
          kind: "command",
          command: "bun test workflow-app.test.ts",
          description: "Workflow domain contract remains valid before applying generated source.",
        },
      ],
      post_apply: [
        {
          id: "workflow-domain-still-valid",
          kind: "command",
          command: "bun test workflow-app.test.ts",
          description: "Workflow domain contract remains valid after applying generated source.",
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
