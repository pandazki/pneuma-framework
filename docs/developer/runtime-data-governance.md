# Runtime / Data Governance

**Audience:** Developers building Creation Hosts that publish, restart, migrate, or roll back Generated Applications
**Chinese version:** [runtime-data-governance.zh-CN.md](./runtime-data-governance.zh-CN.md)

Runtime / Data Governance is the framework contract for explaining what happened after an approved Build Change touches preview, publish, migration, restart, rollback, or provider data.

It is not a provider adapter, deployment platform, cloud control plane, or migration runner.

## Where It Fits

```text
Builder intent
  -> governance approval
  -> Build Assurance
  -> Runtime Intent
  -> Reconcile Attempt
  -> Runtime Observation / Data Evolution Receipt
  -> Runtime Control Receipt
```

Build Assurance answers whether a change is clear, approved, verified, and safe enough to publish. Runtime / Data Governance answers what runtime/data state was intended, what was observed, and what evidence explains the outcome.

## Use It When

Use these contracts when:

- publish requires migration or carry-forward evidence;
- rollback has data limitations;
- runtime restart changes the active service generation;
- provider data is snapshotted, restored, branched, or carried forward;
- Build Assurance needs evidence beyond source diff, definition history, and release health;
- a stale preview or published runtime must be rejected or recorded as stale.

## Core Objects

| Object | Meaning |
|---|---|
| `RuntimeIntent` | Host-authored desired runtime/data state, such as publish, restart, migrate, or rollback. |
| `RuntimeGeneration` | Monotonic identity for one runtime attachment: process, service URL, internal authority, or provider connection. |
| `RuntimeObservation` | Append-only fact about what the Host/runtime/provider observed. Failed observations are still evidence. |
| `ReconcileAttempt` | Bounded attempt to move observed state toward an intent, with steps and recovery status. |
| `DataEvolutionReceipt` | Evidence for isolated data, carry-forward, migration, snapshot, restore, or provider-managed branch behavior. |
| `RuntimeControlReceipt` | Cross-lane envelope tying runtime/data outcome back to BuildThread, governance, assurance, release, and data evidence. |

## Data Evolution Policy

Use `DataEvolutionPolicyKind` to declare version-data behavior without choosing a provider:

| Policy | Meaning |
|---|---|
| `isolated-version-data` | Each published version owns its own data boundary. Rollback returns to that version's data. |
| `carry-forward-with-receipt` | New version starts from previous data and must record a data evolution receipt. |
| `provider-managed-snapshot` | Provider exposes snapshot/restore semantics through capability declarations and receipts. |
| `provider-managed-branch` | Provider exposes branch/fork semantics through capability declarations and receipts. |

`BuildChangeMigrationMode` remains the Build Assurance migration vocabulary. When a Build Change uses `carry_forward_with_receipt`, publish readiness stays blocked until evidence includes a `data_evolution_receipt`.

## Runtime Generation

Runtime Generation is the stale-actor boundary:

```ts
import { assertRuntimeGenerationCanMutate } from "@pneuma-framework/core";

const decision = assertRuntimeGenerationCanMutate(runtimeGeneration);
if (!decision.ok) {
  // Reject internal mutation, record stale observation, or restart current runtime.
}
```

A stale generation may still produce observation evidence, but it must not authorize mutation.

## Provider Capability Matrix

Provider profiles can declare persistence/data behavior without provider-specific Build Agent branches:

```ts
{
  capability_id: "relational-store",
  data_evolution_policies: ["isolated-version-data", "carry-forward-with-receipt"],
  schema_migration: {
    supported: true,
    transactional: "partial",
    requires_downtime_disclosure: true,
  },
  backup_restore: {
    snapshot_supported: true,
    restore_supported: true,
    receipt_required: true,
  },
  branching: {
    supported: false,
    receipt_required: false,
  },
  stale_attachment_behavior: "reject",
  failure_behavior: "fail-closed",
}
```

The Build Agent should see capability contracts and fail-closed behavior. It should not implement "if SQLite do X, if remote Postgres do Y" logic during Builder sessions.

## Host Responsibilities

The Creation Host still owns:

- process management;
- provider SDKs;
- migration scripts;
- backup/restore execution;
- credential storage and refresh;
- data-owner communication;
- product UX for runtime/data evidence.

The framework validates shared shapes and evidence references so different Hosts can explain runtime/data outcomes consistently.
