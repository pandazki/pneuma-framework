# Scaffold Project Contract

**Audience:** Developers building Creation Hosts that let a Build-phase Agent modify Generated Application source artifacts.  
**Chinese version:** [scaffold-project-contract.zh-CN.md](./scaffold-project-contract.zh-CN.md)  
**Related ADR:** [ADR-0033](../architecture/adr/0033-scaffold-project-contract.md)

## Why This Exists

Schema-driven changes can use framework definition rows and `definition.apply_change_set`. Open-ended generated apps also need code, routes, styles, modules, and lifecycle scripts. Those artifacts are Host-owned in RC v0, but every real Creation Host still needs the same code-change discipline:

```text
Builder intent
  -> Build Agent drafts code in a bounded workspace
  -> Host runs checks before approval
  -> Builder approves one coherent proposal
  -> Host applies, verifies, and records evidence
```

`pneuma.scaffold.json` is the Developer-authored contract that lets the framework and Host agree on the draft/code boundary.

It does not make the framework own your app template. It tells the framework how to validate and reason about the scaffold you own.

## Minimal Shape

```ts
import {
  validateScaffoldProjectManifest,
  type ScaffoldProjectManifest,
} from "@pneuma-framework/core";

const scaffold: ScaffoldProjectManifest = {
  schema_version: 1,
  scaffold_id: "dev-board-scaffold",
  version: "0.1.0",
  display_name: "Dev Board Scaffold",
  materialization: {
    strategy: "copy",
    source_roots: ["./scaffold"],
    exclude: ["node_modules", ".env", ".pneuma"],
  },
  artifact_boundary: {
    writable_roots: ["src/app", "src/generated"],
    protected_paths: ["scripts/publish.sh", "src/framework", "pneuma.scaffold.json"],
    generated_roots: ["src/generated"],
    share_include: ["src/app", "src/generated", "package.json"],
    share_exclude: [".env", "data", "node_modules", ".pneuma"],
  },
  agent_contract: {
    allowed_tasks: ["Modify Generated Application source files inside writable roots."],
    forbidden_tasks: ["Modify framework integration files.", "Modify publish scripts."],
    system_prompt_fragments: ["Only edit files under writable_roots."],
    tool_policy: "draft-workspace-only",
  },
  guardrails: {
    pre_proposal: [
      {
        id: "typecheck",
        kind: "command",
        command: "bun run typecheck",
        description: "Typecheck the draft before asking for approval.",
      },
    ],
    pre_apply: [
      {
        id: "base-snapshot",
        kind: "framework",
        framework_check: "base-snapshot-unchanged",
        description: "Ensure the approved draft still applies to the same base.",
      },
    ],
    post_apply: [
      {
        id: "preview-health",
        kind: "framework",
        framework_check: "preview-health",
        description: "Ensure the applied version can still start preview.",
      },
    ],
  },
  lifecycle: {
    preview: { command: "bun run dev" },
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

const check = validateScaffoldProjectManifest(scaffold);
if (!check.ok) throw new Error(JSON.stringify(check.issues, null, 2));
```

## The Approval Rule

The key rule is:

> Do not ask the Builder to approve a code-change proposal until `pre_proposal` guardrails pass.

If typecheck fails, protected files changed, or a diff cannot be computed, the Host should keep the work in draft state and return the failure to the Build-phase Agent or Builder. Approval is for a coherent change with evidence, not for debugging a broken draft.

## What Doctor Checks

`doctor-host` accepts the scaffold contract:

```bash
pneuma-framework doctor-host \
  --workspace ./.pneuma-workspace \
  --profiles ./profiles.json \
  --scaffold-project ./pneuma.scaffold.json \
  --agent-package ./agent-package.json \
  --provider-capabilities ./provider-capabilities.json \
  --share-artifact ./share-artifact.example.json \
  --sharing-governance ./sharing-governance.example.json \
  --credential-rebinding ./credential-rebinding.example.json
```

It verifies:

- scaffold id, version, display name;
- relative source roots with no path escape; `source_roots: ["."]` is allowed when the scaffold root is the source root;
- non-empty excluded files;
- writable roots and protected paths;
- protected directories do not overlap writable roots;
- file-level protected carve-outs under a writable root are allowed, for example `src/generated-modules/registry.ts` inside `src/generated-modules`;
- `.env` is automatically normalized into `share_exclude` when the array exists, so share/fork artifacts do not carry local credentials;
- Build Agent allowed/forbidden tasks and prompt fragments;
- `tool_policy: "draft-workspace-only"`;
- pre-proposal, pre-apply, and post-apply guardrails;
- preview/build/test lifecycle commands;
- diff, check, and changed-file evidence requirements;
- no raw secret material in the manifest.

Known framework guardrail check ids are:

| Check | Purpose |
|---|---|
| `diff-computable` | Require a concrete code diff before approval. |
| `protected-paths-unchanged` | Reject changed files that overlap protected paths. |
| `base-snapshot-unchanged` | Reject apply when source files changed after proposal evidence was prepared. |
| `preview-health` | Delegate preview health to a Host-provided `framework_check_runner`. |

Validator diagnostics include this list when an unknown `framework_check` is used.

## Writable Roots And Protected Carve-Outs

The contract remains fail-closed for protected directories:

```ts
artifact_boundary: {
  writable_roots: ["src"],
  protected_paths: ["src/framework"], // rejected
}
```

M26 relaxes a narrower and common Host pattern: a writable extension directory
can contain a few protected host-authored files, as long as those protected paths
look like files rather than directories.

```ts
artifact_boundary: {
  writable_roots: ["src/generated-modules"],
  protected_paths: [
    "src/generated-modules/registry.ts",
    "src/generated-modules/types.ts",
  ],
}
```

This lets a Host keep agent-authored extension files and host-authored registry
or type-contract files near each other without making the entire runtime
directory protected.

## Relationship To Other Contracts

`BuildAgentPackageManifest` tells the framework which semantic tools, instructions, provider policy, credential boundary, and verification hooks the Build Agent package uses.

`ScaffoldProjectManifest` tells the framework where code may be drafted, which files are protected, and which checks gate approval/apply.

`BuildThread` records the semantic conversation: Builder intent, Agent proposal, Builder decision, and Host execution receipt.

Together they create the minimum shape for the governed code-change executor introduced in RC 0.1.3:

```text
Build Agent Package
  + Scaffold Project
  + BuildThread
  -> governed code-change lane
```

Use [Code Change Lane](./code-change-lane.md) when a Host wants the framework to prepare proposal evidence from a draft workspace, run guardrails, apply an approved draft, verify it, roll back failed post-apply checks, and append BuildThread receipts.
