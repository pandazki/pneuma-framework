# M9 Creation-to-Release Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:test-driven-development before each implementation slice. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that one Builder-approved capability request can execute as one governed product intent, recover or explain failure, and become a verified release candidate when successful.

**Architecture:** Extend `definition.apply_change_set` with an explicit execution/recovery envelope, add a narrow release-candidate protocol, and connect both into one milestone evidence shape. M9 keeps Docker packaging local and deterministic; it does not claim production rollout, cloud deploy, registry push, or full database ACID.

**Tech Stack:** Bun tests, TypeScript, existing `LifecycleOrchestrator`, existing Knowledge Inbox template, M8 Docker release smoke helpers, JSON milestone evidence.

---

## File Structure

- `packages/core/src/lifecycle.ts`  
  Owns `DefinitionChangeSetExecution`, child progress, recovery status, and the failure envelope returned by `definition.apply_change_set`.
- `packages/core/test/tools/definition-apply.test.ts`  
  Adds TDD coverage for successful child progress and partially failed change-set recovery state.
- `packages/core/src/release-candidate.ts`  
  New small framework-neutral release candidate state model.
- `packages/core/test/release-candidate.test.ts`  
  Unit tests for release candidate state transitions and readiness/failure rules.
- `examples/m9-creation-to-release-integrity/`  
  Milestone example for success and failure evidence paths.
- `docs/archive/milestone-9-snapshot.md` and `.zh-CN.md`  
  Zero-context team snapshot after verification.
- `docs/architecture/README.md`, `docs/architecture/roadmap.md`, `examples/README.md`, `AGENTS.md`  
  Navigation updates after M9 closes.

---

### Task 1: Add Change-Set Execution And Recovery Semantics

**Files:**
- Modify: `packages/core/src/lifecycle.ts`
- Modify: `packages/core/test/tools/definition-apply.test.ts`

- [ ] **Step 1: Write failing tests for child progress**

Add tests near the existing `definition.apply_change_set` tests:

- successful change-set returns `execution.before_fingerprint`;
- every child change has `pending -> applying -> applied` represented in final `child_progress`;
- successful result has `recovery.status === "not_required"`.

- [ ] **Step 2: Write failing tests for partial failure**

Add a test fixture mode that lets the first child mutation succeed and a later child mutation fail at runtime. Assert:

- result is `ok: false`;
- `state.status === "failed"`;
- `state.failed_change_index` points at the failing child;
- `state.execution.child_progress` shows applied, failed, and remaining pending children;
- `state.recovery.status` is either `reset_to_last_good_available` or `manual_repair_required`;
- no release candidate is implied by the failed state.

- [ ] **Step 3: Run RED verification**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts
```

Expected: fails because the new execution/recovery envelope does not exist yet.

- [ ] **Step 4: Implement the envelope**

In `packages/core/src/lifecycle.ts`, add:

```ts
export type DefinitionChangeSetChildStatus = "pending" | "applying" | "applied" | "failed";
export type DefinitionChangeSetRecoveryStatus = "not_required" | "reset_to_last_good_available" | "manual_repair_required";
```

Then add structured `execution` and `recovery` fields to `DefinitionChangeSetResult`.

Use a stable fingerprint of the existing app-definition summary before child execution. During `executeDefinitionChangeSet`, update child progress before and after each child call. On failure, fetch the observed definition, return the failed child index, preserve applied child ids, and classify recovery conservatively:

- `not_required` when no mutation landed;
- `manual_repair_required` when partial mutation landed and framework cannot prove automatic reset is safe;
- `reset_to_last_good_available` only if the existing repair guard proves the last-good state is still available and safe to restore.

- [ ] **Step 5: Run GREEN verification**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts
```

Expected: pass.

---

### Task 2: Add Release Candidate Protocol v0

**Files:**
- Create: `packages/core/src/release-candidate.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/release-candidate.test.ts`

- [ ] **Step 1: Write failing unit tests**

Cover:

- candidate creation from source workspace and definition fingerprint;
- `created -> building -> verifying -> ready`;
- failed checks make the candidate `failed`;
- a candidate cannot become `ready` without manifest, image tag, and required checks;
- promotion/deploy is not modeled as ready-state mutation in M9 v0.

- [ ] **Step 2: Run RED verification**

Run:

```bash
bun test packages/core/test/release-candidate.test.ts
```

Expected: fails because the module does not exist.

- [ ] **Step 3: Implement release candidate model**

Implement a pure TypeScript state module with no Docker dependency:

```text
created -> building -> verifying -> ready
created/building/verifying -> failed
```

Fields:

- `id`
- `source_workspace`
- `definition_fingerprint`
- `build_manifest_path`
- `image_tag`
- `checks`
- `status`
- `created_at_ms`
- `updated_at_ms`
- `failure`

- [ ] **Step 4: Run GREEN verification**

Run:

```bash
bun test packages/core/test/release-candidate.test.ts
bun run typecheck
```

Expected: pass.

---

### Task 3: Add Unified Evidence Envelope

**Files:**
- Create: `examples/m9-creation-to-release-integrity/evidence.ts`
- Create: `examples/m9-creation-to-release-integrity/evidence.test.ts`
- Create: `examples/m9-creation-to-release-integrity/README.md`

- [ ] **Step 1: Write failing evidence tests**

Cover:

- success evidence contains Builder request, proposal, approval, change-set execution, release candidate, checks, and final status;
- failure evidence contains Builder request, proposal, approval, child progress, recovery status, and no release candidate;
- serialized JSON remains readable and stable enough for docs/snapshot excerpts.

- [ ] **Step 2: Run RED verification**

Run:

```bash
bun test examples/m9-creation-to-release-integrity/evidence.test.ts
```

Expected: fails because the evidence module does not exist.

- [ ] **Step 3: Implement evidence builder**

Add a small JSON builder for:

```text
CreationToReleaseEvidence
  run_id
  builder_request
  proposal
  approval
  execution
  recovery
  release_candidate
  final_status
```

Keep it example-local for M9, but avoid Knowledge Inbox-specific names in the schema so it can graduate to a persistent table later.

- [ ] **Step 4: Run GREEN verification**

Run:

```bash
bun test examples/m9-creation-to-release-integrity/evidence.test.ts
```

Expected: pass.

---

### Task 4: Add M9 Success And Failure Example

**Files:**
- Create: `examples/m9-creation-to-release-integrity/run.ts`
- Create: `examples/m9-creation-to-release-integrity/run.test.ts`
- Modify or reuse: `examples/m8-release-packaging-hardening/*`

- [ ] **Step 1: Write failing milestone test**

The test should run a deterministic M9 script and assert:

- success path produces `release_candidate_ready`;
- failure path produces `failed_repair_required` or `recovered`;
- both paths write JSON evidence files;
- success evidence includes release checks for health/config/API;
- failure evidence includes child progress and recovery explanation.

- [ ] **Step 2: Run RED verification**

Run:

```bash
bun test examples/m9-creation-to-release-integrity/run.test.ts
```

Expected: fails because the runner does not exist.

- [ ] **Step 3: Implement deterministic runner**

Use deterministic framework calls for CI:

- success path applies Priority Queue, creates release candidate, reuses M8-style manifest/image/health/config/API proof where practical;
- failure path injects a child mutation failure after at least one child succeeds and records recovery evidence;
- optional real backend-agent path may stay manual, but CI should not depend on model planning reliability.

- [ ] **Step 4: Run GREEN verification**

Run:

```bash
bun test examples/m9-creation-to-release-integrity/run.test.ts
```

Expected: pass.

---

### Task 5: Full Verification And Snapshot

**Files:**
- Create: `docs/archive/milestone-9-snapshot.md`
- Create: `docs/archive/milestone-9-snapshot.zh-CN.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/roadmap.md`
- Modify: `examples/README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Run milestone verification**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts
bun test packages/core/test/release-candidate.test.ts
bun test examples/m9-creation-to-release-integrity/*.test.ts
bun test examples/m8-release-packaging-hardening/release-packaging-smoke.test.ts
bun run typecheck
git diff --check
```

Expected: all pass. Docker-dependent M8 smoke can be reported separately if Docker is unavailable.

- [ ] **Step 2: Write English snapshot**

Explain M9 for zero-context teammates:

- what changed after M7 and M8;
- why recovery is not “database transaction” but product-intent integrity;
- how release candidate differs from release artifact, rollout, and production deploy;
- what the success and failure evidence prove.

- [ ] **Step 3: Write Chinese snapshot**

Write a full Chinese version, not a partial summary.

- [ ] **Step 4: Update navigation and status**

Mark M9 closed only after verification. Update README/roadmap/example navigation and next-step recommendations.

