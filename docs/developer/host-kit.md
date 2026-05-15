# Creation Host Implementation Kit

**Audience:** Developers who already understand the four-layer model and want to assemble a real Creation Host.
**Chinese version:** [host-kit.zh-CN.md](./host-kit.zh-CN.md)

`@pneuma-framework/host-kit` is the first 0.4.0 implementation-framework layer. It does not replace `@pneuma-framework/core`; it composes existing core contracts into the Builder-facing loop a Host has to run.

```text
core
  primitives, contracts, validators, evidence

host-kit
  explicit Host adapters + orchestration helpers

reference-creation-host
  canonical consumer and living conformance example
```

## What It Is

Host Kit helps a Creation Host run one governed Builder intent through:

1. BuildThread context.
2. Code Change Lane proposal evidence.
3. enterprise approval route.
4. guarded code apply.
5. Preview Data Rehearsal.
6. publish readiness gate.
7. local publish / rollback state.
8. Runtime/Data Receipt evidence.

The package exists because every Host was otherwise forced to rewrite the same glue between BuildThread, Code Change Lane, Build Assurance, Enterprise Governance, Runtime / Data Governance, and Release Rollout.

## What It Does Not Own

Host Kit deliberately does not own:

- product UX;
- user identity or role mapping;
- provider SDKs;
- credential storage;
- migration engine implementation;
- source layout;
- deployment target;
- generated application domain model.

The Developer still provides these through explicit adapters. Host Kit owns call order, validation, fail-closed gates, and evidence vocabulary.

## Minimal Host Wiring

```ts
import {
  evaluateHostKitApproval,
  prepareHostKitCodeChangeReview,
  applyApprovedHostKitCodeChange,
  runPreviewDataRehearsal,
  publishVerifiedVersion,
  rollbackPublishedVersion,
} from "@pneuma-framework/host-kit";
```

The current public surface is intentionally small. A Host supplies:

- `ScaffoldProjectManifest`;
- source and draft roots;
- command runner for guardrails;
- governance policy and decisions;
- `DataEvolutionAdapter`;
- `HostRuntimeAdapter`;
- `ReleaseRolloutStore`.

## Approval Route

`evaluateHostKitApproval()` is a Host-facing wrapper around Enterprise Governance.

The important M45 invariant:

```text
Builder self-approval does not satisfy a required Reviewer route.
```

This is what lets a Creation Host model "Bob requested the change, Alice reviewed the risk" instead of treating one click as both request and review.

## Code Change Lane

`prepareHostKitCodeChangeReview()` calls the core Code Change Lane and then creates a Build Assurance review packet.

It returns:

- prepared code-change proposal;
- changed files and diff;
- guardrail checks;
- proposed change list;
- risk classification;
- migration mode;
- recovery plan.

`applyApprovedHostKitCodeChange()` refuses to apply when the approval decision is not allowed. It does not bypass Scaffold Project guardrails.

## Preview Data Rehearsal

`runPreviewDataRehearsal()` is the kit-level semantic wrapper around the Host-owned migration implementation.

The Host owns the actual migration engine. For example, a Bun/TypeScript Host may use Drizzle for SQLite/Postgres migration work. Host Kit only requires this sequence:

```text
clone representative data
  -> run data evolution on the clone
  -> validate DataEvolutionReceipt
  -> continue only when receipt.status = completed
```

If rehearsal fails, the attempt terminates. Host Kit does not auto-retry or auto-repair. A later Corrective Proposal is a new Build-phase Agent turn.

## Publish And Rollback

`publishVerifiedVersion()` fails closed when a required data receipt is missing. When the receipt is valid, it starts the published runtime through `HostRuntimeAdapter`, waits for ready checks, stages a release candidate, promotes it, and returns a `RuntimeControlReceipt`.

`rollbackPublishedVersion()` uses the existing Release Rollout state machine. It does not invent a second release model.

## Reference Host

The canonical consumer is:

```text
examples/reference-creation-host/
```

It proves the M45 loop with a Team Notes Board:

```text
v0:
  notes list

Builder intent:
  Add a review queue.

v1:
  review_status field
  review queue surface
  carry-forward data receipt
```

Run it:

```bash
bun test packages/host-kit/test/*.test.ts
bun test examples/reference-creation-host/reference-host.test.ts examples/reference-creation-host/ui-state.test.ts
PORT=8893 bun run --cwd examples/reference-creation-host serve
```

The workbench has three panes:

- BuildThread conversation;
- Generated App Preview;
- Governance & Evidence.

