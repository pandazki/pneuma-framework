# M44 Runtime / Data Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add contract-first runtime/data governance primitives so Build Assurance can reason about intended runtime/data state, observed runtime/data state, stale generations, data evolution receipts, and provider-neutral persistence capabilities.

**Architecture:** Add a focused `runtime-data-governance` core module with pure types, validators, and small helper functions. Extend existing Build Assurance evidence refs/readiness rules and Provider Capability Matrix validation without implementing real provider adapters or a durable controller. Keep Creation Host process management, provider SDKs, and UX Host-owned.

**Tech Stack:** Bun test runner, TypeScript, existing `@pneuma-framework/core` package patterns, docs in `docs/developer` and `docs/superpowers/specs`.

---

## File Structure

- Create `packages/core/src/runtime-data-governance.ts`
  - Defines `RuntimeIntent`, `RuntimeObservation`, `RuntimeGeneration`, `ReconcileAttempt`, `DataEvolutionPolicy`, `DataEvolutionReceipt`, `RuntimeControlReceipt`.
  - Exports validators:
    - `validateRuntimeIntent`
    - `validateRuntimeGeneration`
    - `validateRuntimeObservation`
    - `validateDataEvolutionReceipt`
    - `validateReconcileAttempt`
    - `validateRuntimeControlReceipt`
  - Exports helpers:
    - `runtimeDataGovernanceIssues`
    - `isCurrentRuntimeGeneration`
    - `assertRuntimeGenerationCanMutate`
    - `dataEvolutionReceiptRequiredForPolicy`
- Create `packages/core/test/runtime-data-governance.test.ts`
  - Pure contract tests for valid objects, invalid refs, stale generation rejection, failed observation evidence, carry-forward receipt requirements, and receipt correlation.
- Modify `packages/core/src/build-assurance.ts`
  - Extend `BuildChangeEvidenceRef` with runtime/data governance refs.
  - Add data receipt publish-readiness blocking for `carry_forward_with_receipt`.
- Modify `packages/core/test/build-assurance.test.ts`
  - Add tests for publish blocked when migration mode requires data receipt and passes when receipt exists.
- Modify `packages/core/src/build-assurance-recovery.ts`
  - No behavior change expected; the evidence kind union should pick up new evidence kinds from `BuildChangeEvidenceRef`.
- Modify `packages/core/test/build-assurance-recovery-drill.test.ts`
  - Add one recovery drill requiring `runtime_control_receipt` and `data_evolution_receipt`.
- Modify `packages/core/src/host-authoring.ts`
  - Add provider-neutral persistence/data-evolution capability declarations to Provider Capability Matrix.
  - Validate policy values, receipt requirements, stale attachment behavior, and failure behavior.
- Modify `packages/core/test/host-authoring.test.ts`
  - Add positive and negative matrix tests for persistence/data-evolution capability declarations.
- Modify `packages/core/src/index.ts`
  - Export the new runtime/data governance module.
- Create `docs/developer/runtime-data-governance.md`
- Create `docs/developer/runtime-data-governance.zh-CN.md`
- Modify `docs/developer/build-assurance.md` and `.zh-CN.md`
  - Mention new evidence refs and data receipt publish gate.
- Modify `docs/developer/creation-host-contract.md` and `.zh-CN.md`
  - Link runtime/data governance from the Creation Host authoring surface.
- Modify `docs/architecture/team-share-demo.md` and `.zh-CN.md`
  - Add a short post-M43/M44 note without bloating the team-share path.

---

### Task 1: Runtime / Data Governance Core Contract

**Files:**
- Create: `packages/core/src/runtime-data-governance.ts`
- Create: `packages/core/test/runtime-data-governance.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing runtime/data governance tests**

Add `packages/core/test/runtime-data-governance.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  assertRuntimeGenerationCanMutate,
  dataEvolutionReceiptRequiredForPolicy,
  isCurrentRuntimeGeneration,
  validateDataEvolutionReceipt,
  validateReconcileAttempt,
  validateRuntimeControlReceipt,
  validateRuntimeGeneration,
  validateRuntimeIntent,
  validateRuntimeObservation,
  type DataEvolutionReceipt,
  type ReconcileAttempt,
  type RuntimeControlReceipt,
  type RuntimeGeneration,
  type RuntimeIntent,
  type RuntimeObservation,
} from "../src/runtime-data-governance.js";

const intent: RuntimeIntent = {
  intent_id: "intent-publish-v2",
  build_change_id: "change-priority",
  app_id: "dev-board",
  version_id: "v2",
  profile_id: "local-sqlite",
  mode: "published",
  action: "publish",
  desired_state: "Publish v2 with carried-forward data.",
  data_evolution_policy: "carry-forward-with-receipt",
  evidence_refs: [{ kind: "build_thread_turn", thread_id: "thread-1", turn_id: "proposal-1" }],
};

const generation: RuntimeGeneration = {
  runtime_generation_id: "runtime-generation-v2-1",
  app_id: "dev-board",
  version_id: "v2",
  profile_id: "local-sqlite",
  mode: "published",
  status: "current",
  service_url: "http://127.0.0.1:9001",
  created_at_ms: 1,
};

const observation: RuntimeObservation = {
  observation_id: "observation-v2-health",
  runtime_generation_id: "runtime-generation-v2-1",
  app_id: "dev-board",
  version_id: "v2",
  profile_id: "local-sqlite",
  mode: "published",
  status: "passed",
  observed_at_ms: 2,
  checks: [
    {
      id: "health",
      kind: "runtime_health",
      status: "passed",
      message: "Published runtime is healthy.",
    },
  ],
  evidence_refs: [{ kind: "runtime_health", runtime_id: "runtime-generation-v2-1", checked_at_ms: 2 }],
};

const dataReceipt: DataEvolutionReceipt = {
  receipt_id: "data-v1-to-v2",
  app_id: "dev-board",
  source_version_id: "v1",
  target_version_id: "v2",
  provider_profile_id: "local-sqlite",
  policy: "carry-forward-with-receipt",
  status: "completed",
  created_at_ms: 3,
  steps: [
    {
      id: "copy-data",
      status: "passed",
      message: "Copied v1 data into v2 data boundary.",
    },
  ],
  evidence_refs: [{ kind: "host_check", check_id: "copy-data", status: "passed" }],
};

describe("runtime/data governance contracts", () => {
  test("validates runtime intent, generation, observation, data receipt, reconcile attempt, and control receipt", () => {
    expect(validateRuntimeIntent(intent)).toEqual({ ok: true, issues: [] });
    expect(validateRuntimeGeneration(generation)).toEqual({ ok: true, issues: [] });
    expect(validateRuntimeObservation(observation)).toEqual({ ok: true, issues: [] });
    expect(validateDataEvolutionReceipt(dataReceipt)).toEqual({ ok: true, issues: [] });

    const attempt: ReconcileAttempt = {
      attempt_id: "attempt-publish-v2",
      runtime_intent_id: intent.intent_id,
      app_id: "dev-board",
      version_id: "v2",
      status: "completed",
      started_at_ms: 4,
      completed_at_ms: 5,
      steps: [
        { id: "promote", status: "passed", message: "Release candidate promoted." },
      ],
      observation_ids: [observation.observation_id],
      data_evolution_receipt_ids: [dataReceipt.receipt_id],
      recovery: { status: "not_required" },
    };
    expect(validateReconcileAttempt(attempt)).toEqual({ ok: true, issues: [] });

    const receipt: RuntimeControlReceipt = {
      receipt_id: "runtime-control-v2",
      app_id: "dev-board",
      build_change_id: "change-priority",
      runtime_intent_id: intent.intent_id,
      runtime_generation_id: generation.runtime_generation_id,
      reconcile_attempt_id: attempt.attempt_id,
      status: "completed",
      evidence_refs: [
        { kind: "build_thread_turn", thread_id: "thread-1", turn_id: "proposal-1" },
        { kind: "runtime_observation", observation_id: observation.observation_id },
        { kind: "data_evolution_receipt", receipt_id: dataReceipt.receipt_id },
      ],
    };
    expect(validateRuntimeControlReceipt(receipt)).toEqual({ ok: true, issues: [] });
  });

  test("rejects malformed identifiers and missing runtime generation refs", () => {
    expect(validateRuntimeIntent({ ...intent, intent_id: "" }).issues).toContainEqual({
      path: "intent_id",
      message: "intent_id is required.",
    });
    expect(validateRuntimeObservation({ ...observation, runtime_generation_id: "" }).issues).toContainEqual({
      path: "runtime_generation_id",
      message: "runtime_generation_id is required.",
    });
  });

  test("stale runtime generation cannot authorize mutation", () => {
    const stale: RuntimeGeneration = { ...generation, status: "stale" };
    expect(isCurrentRuntimeGeneration(stale)).toBe(false);
    expect(assertRuntimeGenerationCanMutate(stale)).toEqual({
      ok: false,
      reason: "runtime_generation_stale",
    });
  });

  test("failed observation remains valid evidence", () => {
    const failed = validateRuntimeObservation({
      ...observation,
      status: "failed",
      checks: [{ id: "health", kind: "runtime_health", status: "failed", message: "Health check failed." }],
    });
    expect(failed.ok).toBe(true);
  });

  test("knows which data policies require a receipt", () => {
    expect(dataEvolutionReceiptRequiredForPolicy("isolated-version-data")).toBe(false);
    expect(dataEvolutionReceiptRequiredForPolicy("carry-forward-with-receipt")).toBe(true);
    expect(dataEvolutionReceiptRequiredForPolicy("provider-managed-snapshot")).toBe(true);
    expect(dataEvolutionReceiptRequiredForPolicy("provider-managed-branch")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
bun test packages/core/test/runtime-data-governance.test.ts
```

Expected: fail because `packages/core/src/runtime-data-governance.ts` does not exist.

- [ ] **Step 3: Implement the minimal core module**

Create `packages/core/src/runtime-data-governance.ts` with the types, constants, validators, and helpers used by the test.

- [ ] **Step 4: Export the module**

Add to `packages/core/src/index.ts`:

```ts
export * from "./runtime-data-governance.js";
```

- [ ] **Step 5: Run Task 1 tests**

Run:

```bash
bun test packages/core/test/runtime-data-governance.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add packages/core/src/runtime-data-governance.ts packages/core/src/index.ts packages/core/test/runtime-data-governance.test.ts
git commit -m "feat(core): add runtime data governance contract"
```

---

### Task 2: Build Assurance Runtime/Data Evidence Integration

**Files:**
- Modify: `packages/core/src/build-assurance.ts`
- Modify: `packages/core/test/build-assurance.test.ts`
- Modify: `packages/core/test/build-assurance-recovery-drill.test.ts`

- [ ] **Step 1: Add failing Build Assurance tests**

Add tests to `packages/core/test/build-assurance.test.ts`:

```ts
test("blocks publish readiness when carry-forward migration lacks data receipt evidence", () => {
  const assessment = assessBuildChangeReadiness({
    intent_status: "clear",
    proposal_status: "proposed",
    approval_status: "approved",
    execution_status: "applied",
    risks: ["data_migration"],
    checks: [{ id: "post-apply", phase: "post_apply", status: "passed", message: "Preview passed." }],
    release_checks: [{ name: "health", status: "passed", at_ms: 1 }],
    migration_mode: "carry_forward_with_receipt",
    evidence_refs: [
      { kind: "runtime_observation", observation_id: "observation-1" },
    ],
  });

  expect(assessment.readiness).toBe("blocked");
  expect(assessment.blocking_reasons).toContain("data_evolution_receipt_missing");
});

test("allows publish readiness when carry-forward migration has data receipt evidence", () => {
  const assessment = assessBuildChangeReadiness({
    intent_status: "clear",
    proposal_status: "proposed",
    approval_status: "approved",
    execution_status: "applied",
    risks: ["data_migration"],
    checks: [{ id: "post-apply", phase: "post_apply", status: "passed", message: "Preview passed." }],
    release_checks: [{ name: "health", status: "passed", at_ms: 1 }],
    migration_mode: "carry_forward_with_receipt",
    evidence_refs: [
      { kind: "runtime_observation", observation_id: "observation-1" },
      { kind: "data_evolution_receipt", receipt_id: "data-v1-to-v2" },
    ],
  });

  expect(assessment.readiness).toBe("ready_to_publish");
  expect(assessment.blocking_reasons).not.toContain("data_evolution_receipt_missing");
});
```

Add a test to `packages/core/test/build-assurance-recovery-drill.test.ts`:

```ts
test("recovery drill can require runtime/data governance evidence", () => {
  const matrix = evaluateBuildChangeRecoveryDrillMatrix(
    [
      {
        id: "runtime-data-failure",
        title: "Runtime/data receipt is present after failed publish recovery",
        build_change_id: "change-runtime-data",
        failure_stage: "release",
        simulated_failure: "publish health failed after data carry-forward",
        expected_readiness: "failed_recovered",
        required_evidence_kinds: ["runtime_control_receipt", "data_evolution_receipt"],
      },
    ],
    [
      {
        build_change_id: "change-runtime-data",
        app_id: "dev-board",
        thread_id: "thread-1",
        builder_subject: "user:bob",
        intent_summary: "Publish v2.",
        scope_summary: "Runtime/data publish attempt.",
        risk_classification: ["data_migration", "release_change"],
        readiness: "failed_recovered",
        blocking_reasons: [],
        evidence_refs: [
          { kind: "runtime_control_receipt", receipt_id: "runtime-control-v2" },
          { kind: "data_evolution_receipt", receipt_id: "data-v1-to-v2" },
        ],
      },
    ],
  );

  expect(matrix.summary).toEqual({ total: 1, passed: 1, failed: 0 });
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
bun test packages/core/test/build-assurance.test.ts packages/core/test/build-assurance-recovery-drill.test.ts
```

Expected: fail because `BuildChangeEvidenceRef` does not include the new evidence kinds and publish readiness does not require data receipt.

- [ ] **Step 3: Extend `BuildChangeEvidenceRef`**

Add variants:

```ts
| { readonly kind: "runtime_generation"; readonly runtime_generation_id: string }
| { readonly kind: "runtime_observation"; readonly observation_id: string }
| { readonly kind: "runtime_control_receipt"; readonly receipt_id: string }
| { readonly kind: "data_evolution_receipt"; readonly receipt_id: string }
```

- [ ] **Step 4: Add data receipt readiness blocker**

In `assessBuildChangeReadiness`, before returning `ready_to_publish`, add blocking reason `data_evolution_receipt_missing` when `migration_mode === "carry_forward_with_receipt"` and evidence refs do not include `data_evolution_receipt`.

- [ ] **Step 5: Run Task 2 tests**

Run:

```bash
bun test packages/core/test/build-assurance.test.ts packages/core/test/build-assurance-recovery-drill.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add packages/core/src/build-assurance.ts packages/core/test/build-assurance.test.ts packages/core/test/build-assurance-recovery-drill.test.ts
git commit -m "feat(core): gate assurance on runtime data evidence"
```

---

### Task 3: Provider Capability Matrix Persistence/Data Declarations

**Files:**
- Modify: `packages/core/src/host-authoring.ts`
- Modify: `packages/core/test/host-authoring.test.ts`

- [ ] **Step 1: Add failing provider matrix tests**

Add to `packages/core/test/host-authoring.test.ts`:

```ts
test("validates persistence capability declarations for data evolution", () => {
  const matrix: ProviderCapabilityMatrix = {
    schema_version: 1,
    matrix_id: "runtime-data-providers",
    capabilities: [
      {
        id: "relational-store",
        kind: "storage",
        description: "Relational app data.",
        default_fail_closed_behavior: "Reject publish when relational storage evidence is missing.",
      },
    ],
    profiles: [
      {
        profile_id: "local-sqlite",
        storage_profile: "sqlite",
        supported_capabilities: ["relational-store"],
        unsupported_capabilities: [],
        credential_requirements: [],
        persistence_capabilities: [
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
          },
        ],
      },
    ],
    parity_contracts: [],
  };

  expect(validateProviderCapabilityMatrix(matrix)).toMatchObject({ ok: true, issues: [] });
});

test("rejects malformed persistence capability declarations", () => {
  const result = validateProviderCapabilityMatrix({
    schema_version: 1,
    matrix_id: "bad-runtime-data-providers",
    capabilities: [
      {
        id: "relational-store",
        kind: "storage",
        description: "Relational app data.",
        default_fail_closed_behavior: "Reject publish when relational storage evidence is missing.",
      },
    ],
    profiles: [
      {
        profile_id: "remote-postgres",
        supported_capabilities: ["relational-store"],
        unsupported_capabilities: [],
        credential_requirements: [],
        persistence_capabilities: [
          {
            capability_id: "missing-capability",
            data_evolution_policies: ["provider-specific-secret-mode"],
            schema_migration: {
              supported: true,
              transactional: "always",
              requires_downtime_disclosure: false,
            },
            backup_restore: {
              snapshot_supported: true,
              restore_supported: true,
              receipt_required: false,
            },
            branching: {
              supported: true,
              receipt_required: false,
            },
            stale_attachment_behavior: "ignore",
            failure_behavior: "best-effort",
          },
        ],
      },
    ],
    parity_contracts: [],
  } as unknown as ProviderCapabilityMatrix);

  expect(result.ok).toBe(false);
  expect(result.issues.map((issue) => issue.code)).toEqual([
    "provider_capability_matrix.profile.persistence_capability.unknown",
    "provider_capability_matrix.profile.persistence_capability.data_policy.invalid",
    "provider_capability_matrix.profile.persistence_capability.schema_migration.transactional.invalid",
    "provider_capability_matrix.profile.persistence_capability.stale_attachment_behavior.invalid",
    "provider_capability_matrix.profile.persistence_capability.failure_behavior.invalid",
  ]);
});
```

- [ ] **Step 2: Run failing host-authoring tests**

Run:

```bash
bun test packages/core/test/host-authoring.test.ts
```

Expected: fail because `persistence_capabilities` is not typed or validated.

- [ ] **Step 3: Extend host authoring types**

In `packages/core/src/host-authoring.ts`, add:

```ts
export type PersistenceCapabilityTransactionalDdl = "yes" | "no" | "partial" | "unknown";
export type PersistenceCapabilityStaleAttachmentBehavior = "reject" | "warn" | "host-defined";
export type PersistenceCapabilityFailureBehavior = "fail-closed" | "host-defined";

export interface PersistenceProviderCapabilityDeclaration {
  readonly capability_id: string;
  readonly data_evolution_policies: readonly DataEvolutionPolicyKind[];
  readonly schema_migration: {
    readonly supported: boolean;
    readonly transactional: PersistenceCapabilityTransactionalDdl;
    readonly requires_downtime_disclosure: boolean;
  };
  readonly backup_restore: {
    readonly snapshot_supported: boolean;
    readonly restore_supported: boolean;
    readonly receipt_required: boolean;
  };
  readonly branching: {
    readonly supported: boolean;
    readonly receipt_required: boolean;
  };
  readonly stale_attachment_behavior: PersistenceCapabilityStaleAttachmentBehavior;
  readonly failure_behavior: PersistenceCapabilityFailureBehavior;
}
```

Import `DataEvolutionPolicyKind` from `./runtime-data-governance.js`, and add optional:

```ts
readonly persistence_capabilities?: readonly PersistenceProviderCapabilityDeclaration[];
```

to `ProviderCapabilityMatrixProfile`.

- [ ] **Step 4: Add provider matrix validation**

In `validateProviderCapabilityMatrix`, validate each persistence declaration:

- `capability_id` exists in matrix capabilities;
- every data policy is valid;
- `transactional` is one of `yes | no | partial | unknown`;
- `stale_attachment_behavior` is one of `reject | warn | host-defined`;
- `failure_behavior` is one of `fail-closed | host-defined`.

- [ ] **Step 5: Run Task 3 tests**

Run:

```bash
bun test packages/core/test/host-authoring.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit Task 3**

```bash
git add packages/core/src/host-authoring.ts packages/core/test/host-authoring.test.ts
git commit -m "feat(core): declare persistence data capabilities"
```

---

### Task 4: Developer Documentation And Navigation

**Files:**
- Create: `docs/developer/runtime-data-governance.md`
- Create: `docs/developer/runtime-data-governance.zh-CN.md`
- Modify: `docs/developer/build-assurance.md`
- Modify: `docs/developer/build-assurance.zh-CN.md`
- Modify: `docs/developer/creation-host-contract.md`
- Modify: `docs/developer/creation-host-contract.zh-CN.md`
- Modify: `docs/architecture/team-share-demo.md`
- Modify: `docs/architecture/team-share-demo.zh-CN.md`

- [ ] **Step 1: Write the developer guide**

Create `docs/developer/runtime-data-governance.md` with:

```md
# Runtime / Data Governance

Runtime / Data Governance is the framework contract for explaining what happened after an approved Build Change touches preview, publish, migration, restart, rollback, or provider data.

It is not a provider adapter, deployment platform, or cloud control plane.

## Where It Fits

Builder intent -> governance approval -> Build Assurance -> Runtime Intent -> Reconcile Attempt -> Runtime Observation / Data Evolution Receipt -> Runtime Control Receipt

## Use It When

- publish requires migration evidence;
- rollback has data limitations;
- runtime restart changes the active service generation;
- provider data is snapshotted, restored, branched, or carried forward;
- Build Assurance needs evidence beyond source diff and definition history.

## Host Responsibilities

The Creation Host still owns process management, provider SDKs, migration scripts, credential storage, and UX. The framework validates shared shapes and evidence refs.
```

Create the Chinese version with the same structure and Chinese explanations.

- [ ] **Step 2: Update Build Assurance docs**

Add a short section:

```md
## Runtime / Data Evidence

Use `runtime_observation`, `runtime_control_receipt`, `runtime_generation`, and `data_evolution_receipt` evidence refs when a Build Change affects publish, restart, migration, provider data, or rollback. `carry_forward_with_receipt` migration mode stays blocked until a `data_evolution_receipt` is present.
```

- [ ] **Step 3: Update Creation Host contract docs**

Add Runtime/Data Governance to the Host contract list as a post-approval outcome contract, not as infrastructure ownership.

- [ ] **Step 4: Update team-share demo docs**

Add a concise note after the M40-M43 enterprise governance summary:

```md
M44 extends the same story to runtime/data outcomes: after approval, the Host can show desired runtime/data state, observed state, generation, reconcile attempt, and data receipt evidence.
```

- [ ] **Step 5: Run docs grep checks**

Run:

```bash
rg -n "Runtime / Data Governance|runtime_control_receipt|data_evolution_receipt" docs/developer docs/architecture/team-share-demo*.md
```

Expected: relevant English and Chinese docs contain the new terms.

- [ ] **Step 6: Commit Task 4**

```bash
git add docs/developer/runtime-data-governance.md docs/developer/runtime-data-governance.zh-CN.md docs/developer/build-assurance.md docs/developer/build-assurance.zh-CN.md docs/developer/creation-host-contract.md docs/developer/creation-host-contract.zh-CN.md docs/architecture/team-share-demo.md docs/architecture/team-share-demo.zh-CN.md
git commit -m "docs: explain runtime data governance"
```

---

### Task 5: Full Verification And Snapshot Decision

**Files:**
- Modify only if verification reveals doc index drift:
  - `docs/developer/start-here.md`
  - `docs/developer/start-here.zh-CN.md`
  - `docs/architecture/README.md`
  - `docs/architecture/README.zh-CN.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
bun test packages/core/test/runtime-data-governance.test.ts packages/core/test/build-assurance.test.ts packages/core/test/build-assurance-recovery-drill.test.ts packages/core/test/host-authoring.test.ts
```

Expected: pass.

- [ ] **Step 2: Run package tests if focused tests pass**

Run:

```bash
bun test packages/core/test
```

Expected: pass. If unrelated pre-existing failures appear, capture exact failures and do not claim full pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: pass.

- [ ] **Step 4: Run diff hygiene**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 5: Review docs navigation**

Run:

```bash
rg -n "runtime-data-governance|Runtime / Data Governance|M44" docs/developer docs/architecture
```

Expected: new guide is discoverable from relevant developer and architecture entry points, or update those entry points.

- [ ] **Step 6: Commit any final docs-index changes**

If Step 5 requires updates:

```bash
git add docs/developer/start-here.md docs/developer/start-here.zh-CN.md docs/architecture/README.md docs/architecture/README.zh-CN.md
git commit -m "docs: surface runtime data governance path"
```

- [ ] **Step 7: Report verification**

Summarize:

- tests run;
- pass/fail status;
- known gaps;
- whether this is ready to become an M44 snapshot or should wait for a reference demo.

---

## Self-Review Checklist

- Spec coverage:
  - Runtime Intent, Observation, Generation, Reconcile Attempt, Data Evolution Policy, Data Evolution Receipt, and Runtime Control Receipt are covered by Task 1.
  - Build Assurance evidence and publish blockers are covered by Task 2.
  - Provider Capability Matrix extension is covered by Task 3.
  - Developer docs and team-share navigation are covered by Task 4.
  - Verification and snapshot decision are covered by Task 5.
- Scope:
  - No real remote provider integration.
  - No durable controller implementation.
  - No process manager or deploy target abstraction.
  - No IAM/audit backend.
- Risk:
  - Main risk is over-expanding Build Assurance; Task 2 only adds evidence kinds and one data receipt blocker.
  - Main API risk is naming churn. Keep names aligned with the M44 DDD design before implementing.
