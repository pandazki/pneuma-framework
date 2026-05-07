# Upgrading Downstream Hosts To pneuma-rc-0.1.3

**Audience:** downstream Creation Host projects currently using `pneuma-rc-0.1.2`  
**Chinese version:** [upgrading-to-rc-0.1.3.zh-CN.md](./upgrading-to-rc-0.1.3.zh-CN.md)

`pneuma-rc-0.1.3` is an additive Code Change Lane patch. It does not replace BuildThread, Scaffold Project, release rollout, or Host-owned agent backends. It gives Hosts a framework helper for turning a draft workspace into proposal evidence, then applying an approved draft with guardrails and receipt evidence.

## 1. Update The Local Framework Path

If your downstream project references the local RC checkout in `package.json`, update every `@pneuma-framework/*` path from:

```json
"file:/Users/pandazki/Codes/pneuma-framework-rc-0.1.2/packages/core"
```

to:

```json
"file:/Users/pandazki/Codes/pneuma-framework-rc-0.1.3/packages/core"
```

Use the matching package directory for each package:

```text
/Users/pandazki/Codes/pneuma-framework-rc-0.1.3/packages/core
/Users/pandazki/Codes/pneuma-framework-rc-0.1.3/packages/core-domain
/Users/pandazki/Codes/pneuma-framework-rc-0.1.3/packages/runtime
/Users/pandazki/Codes/pneuma-framework-rc-0.1.3/packages/cli
/Users/pandazki/Codes/pneuma-framework-rc-0.1.3/packages/viewer-react
```

Then reinstall:

```bash
bun install
```

## 2. Keep Your Draft Workspace Strategy

RC 0.1.3 does not create the draft workspace for you.

Keep your current Host-owned strategy:

```text
source version workspace
  -> copy / fork / checkout
  -> draft workspace
  -> code agent edits draft
```

The new framework helper starts after the draft exists.

## 3. Prepare Proposal Evidence Before Approval

Replace hand-rolled diff/check collection with `prepareCodeChangeProposal`:

```ts
import { prepareCodeChangeProposal } from "@pneuma-framework/core";

const prepared = await prepareCodeChangeProposal({
  manifest: scaffoldManifest,
  source_root: sourceWorkspaceDir,
  draft_root: draftWorkspaceDir,
  thread_store: buildThreadStore,
  thread_id,
  proposal_id,
  summary,
  rationale,
});

if (!prepared.ok) {
  // Do not show an approval prompt. Return failed checks to the agent or Builder.
  return prepared;
}
```

Show these fields to the Builder:

- `prepared.proposal.evidence.changed_files`
- `prepared.proposal.evidence.diff`
- `prepared.proposal.evidence.checks`

## 4. Apply Only After Builder Approval

After approval:

```ts
import { applyCodeChangeProposal } from "@pneuma-framework/core";

const applied = await applyCodeChangeProposal({
  manifest: scaffoldManifest,
  source_root: sourceWorkspaceDir,
  draft_root: draftWorkspaceDir,
  proposal: prepared.proposal,
  decision: "approved",
  thread_store: buildThreadStore,
  thread_id,
});
```

Expected outcomes:

- `ok: true` with `receipt.status === "completed"` after successful apply;
- `ok: false`, `phase: "pre_apply"` when base snapshot or writable-root checks fail before mutation;
- `ok: false`, `phase: "post_apply"`, `receipt.status === "failed_validate_rolled_back"` when post-apply checks fail after mutation and rollback succeeds.

## 5. Wire Host-Specific Framework Checks

Built-in checks cover:

- `diff-computable`
- `protected-paths-unchanged`
- `base-snapshot-unchanged`

If your manifest uses `preview-health`, pass a Host-specific runner:

```ts
await applyCodeChangeProposal({
  manifest,
  source_root,
  draft_root,
  proposal,
  decision: "approved",
  framework_check_runner: async ({ check }) => {
    if (check !== "preview-health") return undefined;
    const ok = await waitForPreviewHealth(previewUrl);
    return { ok, output: ok ? "preview healthy" : "preview failed health check" };
  },
});
```

## 6. Delete Or Shrink Host-Owned Glue

You can usually remove or shrink Host code that:

- computes changed files between source and draft;
- renders a basic text diff;
- blocks protected path changes;
- checks stale source before apply;
- copies changed files from draft to source;
- rolls back source files after failed post-apply checks;
- appends proposal / decision / receipt turns manually.

Keep Host code that:

- creates draft workspaces;
- launches the code agent;
- renders approval UI;
- implements product-specific checks;
- publishes versions and manages release rollout.

## 7. Run Downstream Verification

Recommended minimum:

```bash
bun install
bun run typecheck
bun test
```

Add regression tests for:

- failed `pre_proposal` does not show approval;
- protected path edits are rejected;
- approval applies only files under `writable_roots`;
- stale source fails before mutation;
- draft changes after approval evidence fail before mutation;
- post-apply failure rolls back source;
- BuildThread contains proposal, decision, and receipt turns in order.

## 8. Expected Impact

Expected:

- less Host-owned code-change glue;
- stronger proposal-level approval evidence;
- better rollback evidence for broken generated-app code;
- clearer downstream path for simple Bun + TypeScript + JS apps.

Not expected:

- no opencode launch abstraction yet;
- no automatic draft workspace creation yet;
- no browser approval component;
- no production-grade merge engine.
