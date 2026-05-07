# Release Candidate Patch Snapshot: pneuma-rc-0.1.3

**Status:** accepted patch release  
**Chinese version:** [release-candidate-0.1.3-snapshot.zh-CN.md](./release-candidate-0.1.3-snapshot.zh-CN.md)  
**Previous RC:** [pneuma-rc-0.1.2 BuildThread upgrade guide](../developer/upgrading-to-rc-0.1.2.md)

`pneuma-rc-0.1.3` is an additive Code Change Lane patch over `pneuma-rc-0.1.2`.

It does not change the four-layer model, Operation-first definition primitive, BuildThread transcript primitive, or Scaffold Project contract. It makes the Scaffold Project contract executable enough for a simple Bun + TypeScript + JS Generated Application where the Host already creates a draft workspace.

## Decision

Ship RC 0.1.3 as a **code-change lane patch**:

- add `prepareCodeChangeProposal`;
- add `applyCodeChangeProposal`;
- compute changed files, text diff, check evidence, and base snapshots;
- fail `pre_proposal` before approval;
- enforce `writable_roots` before mutation;
- fail stale source before mutation;
- fail draft changes made after proposal evidence before mutation;
- roll back source files when `post_apply` checks fail;
- append BuildThread proposal / decision / receipt turns when a store and thread are supplied.

## Accepted In This Patch

| Need | RC 0.1.3 action |
|---|---|
| Downstream Host wants framework help after a code agent edits a draft workspace | Added Code Change Lane executor functions in `@pneuma-framework/core`. |
| Approval must be proposal-level, not one prompt per file/tool | `prepareCodeChangeProposal` returns one evidence bundle for one proposal. |
| Broken drafts should not ask for approval | Failed `pre_proposal` returns `ok: false` before Builder approval. |
| Source may change after proposal evidence is produced | `base-snapshot-unchanged` fails before mutation. |
| Draft may change after proposal evidence is approved | Draft snapshot comparison fails before mutation. |
| Agent must not mutate framework/release files | `protected-paths-unchanged` and apply-time writable-root enforcement block unsafe files. |
| Post-apply checks can fail after files are copied | Executor restores backups and records `failed_validate_rolled_back`. |
| Conversation/evidence should stay portable | Executor can append `agent_proposal`, `user_decision`, and `host_execution_receipt` turns to BuildThread. |

## Still Host-Owned

- draft workspace creation;
- code agent launch / opencode integration;
- approval UI;
- preview process and preview health endpoint;
- product-specific static analyzers;
- publish/release rollout.

This is deliberate. The framework owns lane semantics and evidence; the Creation Host owns product-specific execution surfaces.

## Developer Guidance Added

- [Code Change Lane](../developer/code-change-lane.md)
- [Downstream Upgrade Guide](../developer/upgrading-to-rc-0.1.3.md)
- [ADR-0034](./adr/0034-code-change-lane-executor.md)

## Verification

Verified on 2026-05-07:

```bash
bun test ./packages/core/test/code-change-lane.test.ts
bun run typecheck
bun test
```

Results:

- Code Change Lane targeted tests: 6 pass.
- Typecheck: pass.
- Full suite: 1217 pass, 0 fail, 4527 expect calls across 184 files.
