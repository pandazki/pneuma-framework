# Milestone 45 Snapshot

**Milestone:** M45, Creation Host Implementation Kit v0
**Status:** Closed
**Date:** 2026-05-16
**Chinese version:** [milestone-45-snapshot.zh-CN.md](./milestone-45-snapshot.zh-CN.md)

## Decision

M45 starts the 0.4.0 implementation-framework lane.

The accepted direction is:

```text
@pneuma-framework/core
  primitives, contracts, validators, evidence

@pneuma-framework/host-kit
  reusable Creation Host assembly helpers

examples/reference-creation-host
  canonical consumer and living conformance example
```

This keeps the top-level model intact:

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

Host Kit is not a hidden Creation Host product. It is an explicit-adapter orchestration layer for Developers building Creation Hosts.

## What Shipped

### `@pneuma-framework/host-kit`

New package:

```text
packages/host-kit/
```

It currently provides:

- `evaluateHostKitApproval`
- `prepareHostKitCodeChangeReview`
- `applyApprovedHostKitCodeChange`
- `runPreviewDataRehearsal`
- `dataEvolutionReceiptAllowsPublish`
- `publishVerifiedVersion`
- `rollbackPublishedVersion`
- `HostRuntimeAdapter`
- `DataEvolutionAdapter`

### Approval Boundary

Host Kit wraps Enterprise Governance and preserves the key invariant:

```text
Builder self-approval does not satisfy required Reviewer approval.
```

This is the minimum enterprise governance shape needed for the Reference Host.

### Code Change Lane

Host Kit prepares a Build Assurance review packet from a core Code Change Lane proposal. It carries:

- changed files and diff;
- guardrail checks;
- source and migration proposed changes;
- risk classification;
- migration mode;
- recovery plan.

`applyApprovedHostKitCodeChange` refuses to apply when approval is not allowed.

### Preview Data Rehearsal

Host Kit defines the semantic gate:

```text
clone representative data
  -> run Host-owned data evolution
  -> validate DataEvolutionReceipt
  -> continue only when receipt.status = completed
```

The migration engine remains Host-owned. Host Kit owns the call order and fail-closed gate.

### Publish And Rollback

`publishVerifiedVersion` fails closed when a required data receipt is missing, then starts the published runtime, waits for ready evidence, stages/promotes rollout state, and returns a `RuntimeControlReceipt`.

`rollbackPublishedVersion` reuses the existing Release Rollout state machine.

### Reference Host

New canonical consumer:

```text
examples/reference-creation-host/
```

It implements Team Notes Board:

```text
v0:
  notes list

Builder intent:
  Add a review queue.

v1:
  review_status field
  review queue preview
  carry-forward data receipt
```

Bob is the Builder. Alice is the Reviewer.

## Workbench

![M45 Reference Host Workbench](./images/m45-reference-host-workbench.png)

The workbench has three panes:

- BuildThread conversation;
- Generated App Preview;
- Governance & Evidence.

It is intentionally local and small, but it is a product workbench rather than a wireframe.

## Verification

Required verification passed:

```bash
bun test packages/host-kit/test/*.test.ts
bun test examples/reference-creation-host/reference-host.test.ts examples/reference-creation-host/ui-state.test.ts
bun run typecheck
git diff --check
```

Browser evidence:

```text
create v0
ask agent
Bob approval blocked
Alice approval succeeds
preview starts
publish succeeds
rollback succeeds
```

Screenshot:

```text
docs/architecture/images/m45-reference-host-workbench.png
```

## Demo Route

Run:

```bash
PORT=8893 bun run --cwd examples/reference-creation-host serve
```

Open:

```text
http://127.0.0.1:8893/
```

Click in this order:

```text
Create v0
Ask Agent
Bob approve
Alice approve
Preview
Publish
Rollback
```

The important moment is not that a note table gains a field. The important moment is that one Builder intent crosses BuildThread, proposal, reviewer route, code-change guardrails, data rehearsal, publish receipt, and rollback evidence.

## Pruning Candidates

M45 does not delete historical examples. It does identify replacement coverage.

| Old example | Replacement coverage | Recommendation |
|---|---|---|
| `examples/m16-reference-creation-host/` | Creation, preview, inspect/evolve/approve/publish/rollback is now better represented by `examples/reference-creation-host/`. | Delete or archive after owner review. |
| `examples/m18-open-ended-personal-focus-site/` | Not covered by Team Notes Board. M45 is schema/data/code-change pressure, not open-ended UI/module pressure. | Keep until open-ended pressure v2 is rebuilt on Host Kit. |
| `examples/m43-enterprise-governance-demo/` | Reviewer route is covered, but M43 still explains the enterprise governance narrative directly. | Keep until governance UX is fully folded into Reference Host. |

## Remaining Risks

1. The deterministic agent path proves the orchestration seam, not real code-agent quality.
2. The local runtime adapter is still a reference adapter, not a cloud deployment provider.
3. The data evolution handler is intentionally simple; real Hosts still need provider-specific migration implementations.
4. Open-ended UI/module artifacts are not yet rebuilt on top of Host Kit.
5. Historical examples remain until replacement coverage is reviewed.

## Next Lanes

The next valuable lanes are:

1. add a real-agent pressure path to the Reference Host through the same seam;
2. add optional Docker adapter smoke without making Docker the default;
3. rebuild open-ended app pressure on top of Host Kit;
4. prune historical examples after replacement coverage is accepted.

