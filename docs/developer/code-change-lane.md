# Code Change Lane

**Audience:** Developers building Creation Hosts where a Build-phase Agent drafts Generated Application source code.  
**Chinese version:** [code-change-lane.zh-CN.md](./code-change-lane.zh-CN.md)  
**Introduced:** `pneuma-rc-0.1.3`
**M26 hardening:** line-based unified diffs, explicit rejected receipts, proposal-turn opt-out, and rejection helper.

Code Change Lane is the first executable bridge between three framework contracts:

```text
Scaffold Project Manifest
  + BuildThread
  + Builder approval
  -> governed source-code change
```

It does not make the framework own your app template or your agent backend. It gives the Host a small executor for a common pattern:

1. the Build-phase Agent edits a **draft workspace**;
2. the Host calls `prepareCodeChangeProposal`;
3. the framework computes changed files, diff, checks, base snapshot, and draft snapshot;
4. the Builder approves one coherent proposal;
5. the Host calls `applyCodeChangeProposal`;
6. the framework checks stale base / writable roots, applies files, runs post-apply checks, rolls back failed validation, and records a BuildThread receipt.

## Minimal Usage

```ts
import {
  applyCodeChangeProposal,
  prepareCodeChangeProposal,
  rejectCodeChangeProposal,
  createFileBuildThreadStore,
  type ScaffoldProjectManifest,
} from "@pneuma-framework/core";

const threadStore = createFileBuildThreadStore({ workspace: hostWorkspaceDir });
const thread = await threadStore.startThread({
  profile_id: "simple-bun-ts",
  app_id: "app-123",
  builder_user_id: "bob",
});

const prepared = await prepareCodeChangeProposal({
  manifest: scaffoldManifest,
  source_root: "/path/to/generated-app/source",
  draft_root: "/path/to/generated-app/draft",
  thread_store: threadStore,
  thread_id: thread.thread_id,
  proposal_id: "proposal-1",
  summary: "Update the home screen",
  rationale: "Builder asked for a clearer first-run experience.",
  // Optional. Set false if your Host already records the real domain tool call
  // as an agent_proposal turn and you do not want a synthesized code_change.apply turn.
  record_agent_proposal_turn: true,
});

if (!prepared.ok) {
  // Do not ask for Builder approval. Return failed checks to the agent or Builder.
  return prepared;
}

// Show prepared.proposal.evidence.diff, changed_files, and checks to the Builder.
// After the Builder approves:

const applied = await applyCodeChangeProposal({
  manifest: scaffoldManifest,
  source_root: "/path/to/generated-app/source",
  draft_root: "/path/to/generated-app/draft",
  proposal: prepared.proposal,
  decision: "approved",
  thread_store: threadStore,
  thread_id: thread.thread_id,
});
```

If the Builder rejects a proposal, either call `applyCodeChangeProposal` with
`decision: "rejected"` or use the smaller helper:

```ts
const rejected = await rejectCodeChangeProposal({
  proposal: prepared.proposal,
  reason: "The visual change is not what I asked for.",
  thread_store: threadStore,
  thread_id: thread.thread_id,
});
```

## What The Executor Guarantees

- **No approval for broken drafts.** Failed `pre_proposal` checks return `ok: false`; the Host should not ask the Builder to approve.
- **Proposal evidence is concrete.** The prepared proposal includes `changed_files`, a line-based unified diff, guardrail check evidence, a base snapshot, and a draft snapshot.
- **Rejected proposals are first-class receipts.** Builder rejection records `status: "rejected"` instead of overloading framework-failure status.
- **Stale bases fail before mutation.** `base-snapshot-unchanged` detects source files changed after proposal evidence was produced.
- **Unapproved draft edits fail before mutation.** The apply path rejects draft files that changed after the Builder saw proposal evidence.
- **Writable roots are enforced at apply time.** Files outside `artifact_boundary.writable_roots` are rejected before mutation.
- **Post-apply validation can roll back.** If `post_apply` checks fail after files are copied, the executor restores the previous file contents and records `failed_validate_rolled_back`.
- **BuildThread receipt is automatic when supplied.** The executor appends `agent_proposal`, `user_decision`, and `host_execution_receipt` turns when a `thread_store` and `thread_id` are provided.

The default `agent_proposal` append is intentionally synthesized as a generic
`code_change.apply` turn. Hosts with richer domain tools can set
`record_agent_proposal_turn: false` during prepare, then record their own
domain-specific `agent_proposal` turn to avoid duplicate proposal entries.

## Guardrail Semantics

Command guardrails run through `/bin/sh -lc`:

- `pre_proposal` commands run in `draft_root`;
- `pre_apply` and `post_apply` commands run in `source_root`.

Built-in framework checks:

| Check | Meaning |
|---|---|
| `diff-computable` | The draft has at least one changed file and a diff can be produced. |
| `protected-paths-unchanged` | No changed file overlaps `artifact_boundary.protected_paths`. |
| `base-snapshot-unchanged` | Source files are still the same as when proposal evidence was prepared. |
| `preview-health` | Requires a Host-supplied `framework_check_runner`; the framework cannot know your preview health endpoint. |

Use `framework_check_runner` when a Host has richer checks such as preview server health, visual smoke checks, or product-specific static analyzers.

## Where It Fits

For schema/definition rows, use governed Operations such as `definition.apply_change_set`.

For Host-owned open-ended source artifacts, use Code Change Lane:

```text
Agent drafts files in draft_root
  -> prepareCodeChangeProposal()
  -> Builder approval
  -> applyCodeChangeProposal()
  -> BuildThread receipt
```

This keeps the core RC boundary intact: the framework governs the lane and evidence; the Host still owns the template, source tree, preview process, and product-specific checks.

## Diff Shape

The `proposal.evidence.diff` field is a string for wire compatibility, but it is
rendered as a line-based unified diff:

```diff
--- a/src/app/page.ts
+++ b/src/app/page.ts
@@ -1,3 +1,3 @@
 export const stable = 'same';
-export const title = 'before';
+export const title = 'after';
 export const footer = 'same';
```

This is intentionally not a semantic merge algorithm. It exists so a Builder can
review modify-existing proposals without seeing the whole file as deleted and
re-added.

## Current Limits

- It does not create draft workspaces yet. The Host still chooses how to clone/copy/source-control drafts.
- It does not launch opencode or another code agent. It assumes the Host already produced a draft workspace.
- It does not manage multi-file semantic merge conflicts beyond stale base detection.
- It does not publish a browser approval UI. Hosts render `proposal.evidence`.
- It does not replace release rollout, preview lifecycle, or share/fork artifacts.
- It does not package agent-generated code into portable share/install/fork artifacts. That is the later HostExtension/distribution lane.

Those are deliberate limits. RC 0.1.3 makes the lane executable without collapsing Creation Host product concerns into the framework.
