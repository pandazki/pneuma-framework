# Milestone 45 Snapshot

**Milestone:** M45, Creation Host Implementation Kit v0
**Status:** Closed; optional M45.1 pressure lanes implemented
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
- `runHostKitCodeAgentDraft`
- `prepareHostKitCodeChangeReview`
- `applyApprovedHostKitCodeChange`
- `createDockerRuntimeAdapter`
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

### Real Code Agent Draft

M45.1 adds `runHostKitCodeAgentDraft`.

The helper runs a real or fake `AgentBackend` against the draft workspace and then verifies the draft before Code Change Lane review starts:

```text
opencode / other backend
  -> edits draft workspace
  -> Host verifies expected source shape
  -> Code Change Lane prepares review packet
  -> Reviewer approval
  -> guarded apply
```

The live Reference Host path was verified with:

```text
opencode + openrouter/anthropic/claude-opus-4.7
```

The important boundary is that the real code agent only creates the draft. It does not publish, migrate, or bypass reviewer approval.

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

### Optional Docker Runtime Adapter

M45.1 adds `createDockerRuntimeAdapter` as an optional `HostRuntimeAdapter` implementation for smoke tests.

Docker remains a concrete adapter, not a framework semantic. `publishVerifiedVersion` still accepts any adapter that implements the Host runtime interface.

### Open-ended Host-owned Artifact Pressure

M45.1 adds an open-ended pressure test under the Reference Host:

```text
focus-site source artifact
  -> add github_attention section
  -> reviewer approval
  -> guarded source apply
```

This proves Host Kit is not only for schema/data-shaped apps. It can also carry Host-owned UI/module artifacts through the same review/apply lane.

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
bun test examples/reference-creation-host/reference-host.test.ts examples/reference-creation-host/open-ended-host-kit.test.ts examples/reference-creation-host/ui-state.test.ts
bun run typecheck
git diff --check
```

Real code-agent verification passed:

```bash
PNEUMA_KEEP_REFERENCE_HOST_WORKSPACE=1 bun run --cwd examples/reference-creation-host real-agent
```

Observed result:

```text
model: openrouter/anthropic/claude-opus-4.7
code_agent_receipt.status: completed
code_agent_receipt.backend_type: opencode
changed_paths: src/app.ts
Bob approval: blocked
Alice approval: ready_to_preview
publish: completed
rollback: v0 active
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
| `examples/m18-open-ended-personal-focus-site/` | M45.1 now covers a smaller open-ended Host-owned UI artifact through Host Kit, but not the full Personal Focus Site story. | Keep until owner accepts that the smaller Host Kit pressure is enough, or rebuild the full focus-site story on Host Kit. |
| `examples/m43-enterprise-governance-demo/` | Reviewer route is covered, but M43 still explains the enterprise governance narrative directly. | Keep until governance UX is fully folded into Reference Host. |

## Remaining Risks

1. The real opencode path proves one small source edit, not broad code-agent product quality.
2. The local and Docker runtime adapters are reference adapters, not cloud deployment providers.
3. The data evolution handler is intentionally simple; real Hosts still need provider-specific migration implementations.
4. Open-ended UI/module coverage is now present but narrow.
5. Historical examples remain until replacement coverage is reviewed.

## Next Lanes

The next valuable lanes after M45.1 are:

1. broaden the real-agent path beyond one bounded edit;
2. decide whether the smaller open-ended pressure replaces M18 or whether M18 should be rebuilt on Host Kit;
3. add a cloud/runtime adapter pressure test only if it advances the product boundary;
4. prune historical examples after replacement coverage is accepted.
