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
      writable_roots: ["src/app.ts"],
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
        "Edit only src/app.ts.",
        "src/app.ts must export workflowPatch with fields, stages, actions, views, and optional purpose_suffix.",
        "Keep workflow stages, actions, fields, and views internally consistent through the Host contract.",
        "Never special-case a persistence provider; target the Host workflow contracts.",
      ],
      tool_policy: "draft-workspace-only",
    },
    guardrails: {
      pre_proposal: [
        {
          id: "draft-diff-computable",
          kind: "framework",
          framework_check: "diff-computable",
          description: "The code agent produced a concrete source diff.",
        },
        {
          id: "protected-paths-unchanged",
          kind: "framework",
          framework_check: "protected-paths-unchanged",
          description: "The code agent did not modify Host or release internals.",
        },
        {
          id: "workflow-app-module-importable",
          kind: "command",
          command: "bun -e \"const m = await import('./src/app.ts'); if (!m.workflowPatch) throw new Error('missing workflowPatch')\"",
          description: "Generated app code exports a workflowPatch before proposal creation.",
        },
      ],
      pre_apply: [
        {
          id: "base-source-unchanged",
          kind: "framework",
          framework_check: "base-snapshot-unchanged",
          description: "Source did not change after proposal evidence was produced.",
        },
        {
          id: "current-workflow-app-module-importable",
          kind: "command",
          command: "bun -e \"const m = await import('./src/app.ts'); if (!m.workflowPatch) throw new Error('missing workflowPatch')\"",
          description: "Current generated app code is importable before apply.",
        },
      ],
      post_apply: [
        {
          id: "applied-workflow-app-module-importable",
          kind: "command",
          command: "bun -e \"const m = await import('./src/app.ts'); if (!m.workflowPatch) throw new Error('missing workflowPatch')\"",
          description: "Applied generated app code is importable after apply.",
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
