# M44 Runtime / Data Governance DDD Design

**Date:** 2026-05-13
**Status:** Draft for owner review
**Chinese version:** [2026-05-13-m44-runtime-data-governance-ddd-design.zh-CN.md](./2026-05-13-m44-runtime-data-governance-ddd-design.zh-CN.md)
**Related anchors:** `docs/architecture/spec/ai-build-assurance-domain-review.md`, `docs/architecture/spec/production-readiness-boundary.md`, `docs/architecture/spec/enterprise-governance-domain-review.md`

## 1. Top-Level Position

M40-M43 close the first enterprise governance loop:

```text
Builder intent
  -> Build Agent proposal
  -> review packet
  -> role-based governance approval
  -> Build Assurance publish gate
```

That is necessary, but not sufficient for the next production-facing claim.

The next gap is not another human approval model. It is the runtime/data outcome side of the same control loop:

```text
Approved change
  -> apply / publish / migrate / restart / rollback
  -> observe what actually happened
  -> reconcile or fail closed
  -> leave evidence the Builder, Reviewer, Owner, and Operator can understand
```

This design keeps the four-layer product model explicit:

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

The framework should provide shared contracts for runtime/data governance. The Creation Host still owns provider implementation, process management, deployment integration, and product UX.

## 2. What This Is Not

This design is not:

- a cloud control plane;
- a data-provider selection;
- a serverless database integration plan;
- a production IAM system;
- zero-downtime migration tooling;
- a hosted audit backend;
- a provider marketplace;
- a replacement for Build Assurance or Enterprise Governance.

Provider deep dives can reveal useful concepts, but provider-specific architecture must not become Pneuma's domain model. Provider integration belongs later under Provider Capability Matrix and Host-owned provider packages.

## 3. Why Revisit DDD Now

After M43, the model can answer:

- who requested a change;
- what the Agent proposed;
- what review packet was shown;
- which governance route applied;
- who approved or denied;
- whether Build Assurance blocks publish.

But the model is still weak at answering:

- which runtime instance was the approved change applied to;
- whether a stale preview or published process participated after restart;
- what data policy applied when a version was published;
- whether migration/carry-forward/restore produced evidence;
- whether observed runtime/provider state matches the desired state;
- what happened when apply/publish/migration partially succeeded;
- which receipt explains the outcome across definition, source, runtime, data, provider, and release lanes.

These are not provider problems. They are AI build assurance problems.

## 4. Current Model Inventory

| Existing primitive | Healthy responsibility | Remaining runtime/data gap |
|---|---|---|
| BuildThread | Semantic transcript for Builder, Agent, proposal, decision, and execution receipt. | Needs stable refs to runtime/data control receipts instead of opaque Host blobs. |
| Build Change Review Packet | Approval-facing scope, risks, checks, and recovery plan. | Can describe migration risk, but not actual data evolution outcome. |
| Build Assurance Case | Readiness and evidence refs for one Build Change. | Needs first-class evidence refs for runtime observation and data evolution receipts. |
| Enterprise Governance Decision | Determines whether required roles approved the change. | Approval says a change may proceed; it does not prove runtime/data outcome. |
| Code Change Lane | Source proposal/apply/rollback with guardrails and receipts. | Source receipts do not identify runtime generation or data boundary. |
| `definition.apply_change_set` | Governed framework definition mutation. | Definition result is one lane, not the whole applied runtime/data outcome. |
| Runtime Diagnostic Surface | Runtime mode, health, and readiness helper vocabulary. | Diagnostics are observations, not a durable desired/observed/reconcile model. |
| Release Rollout | Active/candidate/previous release slots and transition state. | Release slot state does not define version data policy or runtime generation semantics. |
| Credential Broker Utilities | No-secret session/OAuth/credential refs and rebinding evidence. | Credential refs are not yet tied to runtime/provider attachment generation. |
| Provider Capability Matrix | Provider/profile capability declarations and fail-closed behavior. | Persistence/data evolution capabilities are too coarse. |

The missing piece is connective tissue, not a new top-level product.

## 5. Proposed Domain Concept

Working name:

```text
Runtime / Data Governance
```

It is the framework vocabulary for this question:

> After an approved AI-assisted change moves toward preview, publish, migration, restart, or rollback, how does the Host prove what runtime/data state was intended, what was observed, what reconciliation was attempted, and what evidence remains?

The name intentionally avoids provider-specific terms. It also avoids implying that the framework runs infrastructure. The framework owns contracts and validators; Hosts execute them.

## 6. Core Language

### Runtime Intent

A Host-authored statement of desired runtime/data state.

Examples:

- preview version `v3` should be running;
- published version `v2` should be active;
- runtime should be restarted after source apply;
- data should remain isolated per published version;
- data should carry forward from `v1` to `v2` with a migration receipt;
- credential requirement `github-public-read` should be available to the runtime as a no-secret ref;
- semantic index should be rebuilt from source rows before publish readiness.

Runtime Intent is not a shell command. It is the desired state that may cause lifecycle verbs, provider calls, checks, or release transitions.

### Runtime Observation

An append-only statement of what the Host/runtime/provider observed.

Examples:

- health endpoint responded for a specific runtime generation;
- config fingerprint matched expected app version;
- process id and service URL belonged to the current generation;
- published version served an End User route;
- data migration receipt existed;
- credential binding ref was available without exposing the secret;
- provider check failed or timed out.

Observation is evidence input. It does not grant authority.

### Runtime Generation

A monotonic identity for a concrete runtime attachment.

It answers:

```text
Is this runtime process / service URL / internal token / credential attachment / provider connection still current?
```

Existing scoped tokens solve parts of this problem. Runtime Generation makes stale actor detection a shared domain concept.

### Reconcile Attempt

A bounded attempt to move observed state toward intent.

Examples:

- start preview runtime;
- restart active published runtime;
- promote candidate after checks;
- roll back active release;
- run migration during publish downtime;
- rebuild derived index;
- re-check provider credential availability;
- fail closed because required data evidence is missing.

A Reconcile Attempt has status, steps, observations, recovery classification, and a receipt.

### Data Evolution Policy

A declaration of how app data behaves across versions.

Initial policy vocabulary:

| Policy | Meaning |
|---|---|
| `isolated-version-data` | Each published version owns its own data boundary. Rollback returns to that version's data. |
| `carry-forward-with-receipt` | New version starts from previous data and must record migration/carry-forward evidence. |
| `provider-managed-snapshot` | Provider exposes snapshot/restore semantics through capability declarations and receipts. |
| `provider-managed-branch` | Provider exposes branch/fork semantics through capability declarations and receipts. |

The framework should validate the declaration and receipt shape. The Host/provider package implements the actual storage behavior.

### Data Evolution Receipt

Evidence that a data boundary moved, copied, migrated, snapshotted, restored, or intentionally stayed isolated.

It should include:

- source app/version/data boundary;
- target app/version/data boundary;
- policy;
- migration/check ids;
- provider profile id;
- opaque provider receipt refs when applicable;
- status and recovery classification;
- no secrets and no raw database dump by default.

### Runtime Control Receipt

The common envelope that ties one runtime/data attempt back to the AI build loop.

It should reference:

- BuildThread id;
- build change id;
- proposal or review packet id;
- governance decision id when applicable;
- assurance case id;
- app id / version id / profile id;
- runtime generation id;
- runtime intent id;
- observations;
- data evolution receipt ids;
- release rollout refs;
- recovery drill refs when applicable.

This does not replace specialized evidence. It makes specialized evidence navigable.

## 7. Aggregate Candidates

### ApplicationRuntimeTarget

Identity:

```text
app_id + version_id + mode
```

Mode starts as:

```text
preview | published
```

Owns:

- profile id;
- expected definition/source fingerprint;
- data evolution policy;
- current runtime generation id;
- latest observation summary.

Invariants:

- published target must reference an immutable app version;
- preview target may reference mutable working state;
- current generation changes when process identity, service URL, internal token, or provider attachment changes.

### RuntimeGeneration

Identity:

```text
runtime_generation_id
```

Owns:

- target ref;
- created/stopped timestamps;
- current/stale status;
- service URL ref;
- internal authority scope metadata, never raw tokens;
- provider attachment refs.

Invariants:

- stale generation cannot authorize mutation;
- stale generation can still produce observation evidence;
- generation id must appear in start/restart/promote/rollback receipts.

### RuntimeObservation

Identity:

```text
observation_id
```

Owns:

- target ref;
- runtime generation id;
- check results;
- observed fingerprints;
- provider/data evidence refs;
- timestamp.

Invariants:

- append-only;
- failed observation is valid evidence;
- observation cannot satisfy governance approval by itself.

### ReconcileAttempt

Identity:

```text
reconcile_attempt_id
```

Owns:

- runtime intent ref;
- before observations;
- executed steps;
- after observations;
- status;
- recovery classification;
- runtime control receipt.

Invariants:

- one attempt belongs to one intent;
- partial success must be visible;
- if a Host lane and framework lane are both touched, both must be named in the receipt.

### DataEvolutionReceipt

Identity:

```text
data_evolution_receipt_id
```

Owns:

- source and target data refs;
- selected Data Evolution Policy;
- provider profile id;
- migration/backup/restore/check refs;
- status;
- recovery classification.

Invariants:

- no raw secrets;
- no raw data dump by default;
- `carry-forward-with-receipt` cannot be considered publish-ready without a receipt;
- provider-managed snapshot/branch still returns framework-shaped evidence.

## 8. Bounded Context Placement

| Concept | Framework owns | Creation Host owns |
|---|---|---|
| Runtime Intent | type, validator, status vocabulary | creating intents from product actions |
| Runtime Observation | type, validator, evidence vocabulary | collecting health/provider/process facts |
| Runtime Generation | identity/status contract and stale semantics | generating ids, binding process/provider attachments |
| Reconcile Attempt | receipt shape and recovery vocabulary | execution, retries, stop/start/migrate/rollback implementation |
| Data Evolution Policy | allowed policy values and receipt contract | choosing policy per profile/version |
| Provider Capability Matrix extension | provider-neutral capability fields | real SDKs, credentials, rate limits, storage behavior |
| Runtime Control Receipt | cross-lane evidence envelope | storing and rendering in Host UX |

This keeps framework scope narrow: shared semantics, not infrastructure ownership.

## 9. Integration With Existing Assurance / Governance

### Build Assurance

Add runtime/data refs as evidence kinds:

```text
runtime_observation
runtime_control_receipt
data_evolution_receipt
runtime_generation
```

Build Assurance can then block publish for missing runtime/data evidence without knowing provider internals.

### Enterprise Governance

Governance still answers:

```text
Is the required human route satisfied?
```

Runtime/Data Governance answers:

```text
After that route is satisfied, what actually happened?
```

High-risk routes such as `data_migration`, `credential_boundary`, and `release_change` can require runtime/data receipts before publish readiness.

### Release Rollout

ReleaseRolloutState remains the release slot model. Runtime/Data Governance surrounds it:

- stage/promote/rollback create Runtime Intents;
- health/config/provider checks create Observations;
- URL/process changes advance Runtime Generation;
- rollback failures produce Reconcile Attempt receipts.

### Provider Capability Matrix

Provider Capability Matrix should gain persistence/data-evolution declarations without provider-specific branches.

Candidate capability shape:

```ts
interface PersistenceCapability {
  capability_id: string;
  data_evolution_policies: readonly DataEvolutionPolicyKind[];
  schema_migration: {
    supported: boolean;
    transactional: "yes" | "no" | "partial" | "unknown";
    requires_downtime_disclosure: boolean;
  };
  backup_restore: {
    snapshot_supported: boolean;
    restore_supported: boolean;
    receipt_required: boolean;
  };
  branching: {
    supported: boolean;
    receipt_required: boolean;
  };
  stale_attachment_behavior: "reject" | "warn" | "host-defined";
  failure_behavior: "fail-closed" | "host-defined";
}
```

The Build Agent should see the capability contract, not provider-specific instructions.

## 10. Design Options

### Option A — Document-Only Alignment

Update docs to explain runtime/data outcome governance and leave all shapes Host-owned.

Pros:

- fastest;
- no API surface;
- no risk of overbuilding.

Cons:

- downstream Hosts will keep inventing incompatible receipt/generation/data-policy shapes;
- Build Assurance cannot reliably consume runtime/data evidence;
- provider pressure will produce repeated gaps.

### Option B — Contract-First Runtime/Data Governance

Add core value objects, validators, and evidence ref extensions. Do not build a provider adapter or durable controller yet.

Pros:

- matches the existing style of BuildThread, Sharing Governance, Credential Broker, and Build Assurance;
- gives Hosts a shared language;
- preserves provider/UX/process ownership in Host;
- testable without production infra;
- directly supports the 0.3.x enterprise-readiness path.

Cons:

- adds a new contract surface;
- docs must be precise so Developers do not mistake it for a deployment platform.

### Option C — Full Runtime Controller

Build a persistent controller store and reconciler.

Pros:

- stronger product demo;
- less Host boilerplate for local process examples.

Cons:

- likely collapses Creation Host responsibilities into framework;
- too early before data/provider capability semantics stabilize;
- increases risk of framework becoming a specific Host SDK.

**Recommendation:** Option B.

## 11. Proposed M44 Scope

M44 should be a contract-first slice:

1. Add `runtime-data-governance` core module with types and validators:
   - `RuntimeIntent`;
   - `RuntimeObservation`;
   - `RuntimeGeneration`;
   - `ReconcileAttempt`;
   - `DataEvolutionPolicy`;
   - `DataEvolutionReceipt`;
   - `RuntimeControlReceipt`.
2. Extend Build Assurance evidence refs to include runtime/data evidence kinds.
3. Extend Provider Capability Matrix with provider-neutral persistence/data-evolution capability declarations.
4. Add tests for:
   - stale generation cannot authorize mutation;
   - failed observation remains evidence;
   - carry-forward policy requires data receipt before publish readiness;
   - provider-managed snapshot/branch can be declared without provider-specific logic;
   - runtime control receipt correlates BuildThread, governance, assurance, release, and data evidence refs.
5. Update developer docs and team-share narrative.

M44 should not integrate a real remote persistence provider. That should be a later provider lane after the contract is stable.

## 12. Acceptance Criteria

M44 is complete when the framework can answer these questions with test-backed contracts:

1. What runtime/data state was intended?
2. What runtime/data state was observed?
3. Which runtime generation was current?
4. Was a stale actor rejected or recorded as stale?
5. What data evolution policy applied to this version movement?
6. Was required migration/backup/restore/carry-forward evidence present?
7. Which reconcile attempt moved, failed, or recovered the state?
8. Which BuildThread / governance / assurance / release evidence does the receipt connect?

## 13. Follow-Up Lanes After M44

Potential later lanes:

- real persistence provider adapter pressure;
- executable provider parity runner;
- data migration dry-run helper;
- Host UI for runtime/data receipts;
- runtime generation binding for credential broker calls;
- downstream validation from a fresh Creation Host project.

These should remain separate from M44 unless the contract itself cannot be validated without them.
