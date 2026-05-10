# AI Build Assurance Domain Review

**Status:** Current domain review anchor after M37, not an ADR and not an implementation milestone.
**Date:** 2026-05-10
**Chinese version:** [ai-build-assurance-domain-review.zh-CN.md](./ai-build-assurance-domain-review.zh-CN.md)  
**Purpose:** Keep the post-RC Build Assurance lane aligned with Pneuma's original objective: making Builder + Build Agent creation of business functionality disciplined enough for enterprise production use.

## 1. Why This Review Exists

After M37, the framework has a broad set of working primitives:

- governed app-definition changes through `definition.apply` and `definition.apply_change_set`;
- semantic Builder conversation through BuildThread;
- source-code proposal/apply/rollback evidence through Code Change Lane;
- runtime mode and health diagnostics;
- release rollout state and rollback helpers;
- HostExtension slots for Host-owned open-ended contributions;
- credential rebinding evidence and credential-helper adoption in a real downstream Host;
- Build Change Assurance cases, approval-time review packets, durable local assurance storage, and recovery drill matrices.

That creates a temptation to pick the next missing technical surface and build another primitive. This review remains the anchor that slows that down.

The project goal is not:

```text
Builder publishes an artifact to a marketplace
  -> someone downloads it
  -> framework proves cryptographic origin and third-party tamper resistance
```

That may become a later distribution concern, but it is not the central problem yet.

The project goal is closer to:

```text
Builder asks a Build Agent to create or change business functionality
  -> framework helps constrain scope, disclose risk, verify work,
     preserve decision evidence, recover from failure, and support rollback
  -> enterprise can accept the process as an engineering control plane
```

This is why "audit" should not be framed as passive compliance logging. In Pneuma, audit is part of the build control loop. It helps a non-expert Builder make accountable decisions while the framework limits AI coding uncertainty.

## 2. The Non-Drift Statement

Pneuma should not drift into a generic artifact trust platform.

The current assurance problem is:

> Did this AI-assisted business-function change move through a bounded, reviewable, verified, recoverable process?

Not:

> Can we prove this package was authored by Alice and not modified by a third party on the internet?

Digest, provenance, and signing may still appear later, but only as supporting evidence inside a build/release assurance story. They are not the top-level story.

## 3. Existing Puzzle Pieces

The assurance concern already exists in fragments.

| Existing piece | What it already assures | What it does not yet unify |
|---|---|---|
| `definition.apply` | A single framework definition mutation is governed, authorized, applied, restarted, and verified. | It does not describe the Builder's broader product intent or cross-lane scope. |
| `definition.apply_change_set` | One Builder intent can become one approved app-definition change-set. | It covers framework definition rows, not Host-owned source artifacts or release migration plans. |
| BuildThread | Builder request, agent proposal, Builder decision, and execution receipt are semantic turns. | It records turns, but does not compute readiness or risk posture. |
| Code Change Lane | Draft source changes have diff evidence, guardrails, stale-base checks, apply, rollback, and receipts. | It does not reason about schema migration timing, release readiness, or product-scope drift. |
| Runtime Diagnostic Surface | Preview/published runtime mode and health facts are visible. | It is runtime evidence, not a build-change lifecycle. |
| Release Rollout | Active/candidate/previous releases can be staged, promoted, restarted, and rolled back. | It does not know whether the candidate's build-change evidence is complete. |
| Credential Rebinding Evidence | Share/fork/install credential requirements can be represented without secrets. | It is credential evidence, not general change assurance. |
| `doctor-host` | Host-authored contracts can be checked before a Host is considered coherent. | It does not yet validate an individual AI build change from intent to release. |

M32-M37 did not replace these systems. They defined the lens that composes them.

## 4. Core Assurance Scenarios

These are the practical scenarios the model must cover.

### 4.1 Agent Writes A Bug

The Builder asks for a useful change. The Agent edits source or definition. The change introduces a bug.

Framework responsibility:

- pre-proposal checks should catch obviously invalid drafts before Builder approval;
- pre-apply checks should block stale or unsafe apply;
- post-apply checks should fail the proposal and restore prior source when possible;
- runtime health checks should block release readiness;
- receipt evidence should say exactly where the failure happened.

The failure is not merely a negative outcome. A failed-but-rolled-back change is a successful engineering control.

### 4.2 Agent Deletes A Column Or Capability Unnecessarily

The Builder asks for a feature, but the Agent expands scope and removes a column, table, view, operation, module, or capability.

Framework responsibility:

- proposal evidence must disclose destructive or capability-removing changes separately from additive work;
- destructive changes require stronger impact language and approval;
- removed columns must include data impact and recovery limitations;
- a Host should be able to reject "scope expanded beyond Builder intent" before apply.

This is not just permission control. It is scope control.

### 4.3 Schema Migration Timing

The Builder publishes a version that changes data shape. Online migration is not the primary concern; controlled downtime is acceptable for the current stage.

Framework responsibility:

- migration timing must be explicit: before publish, during publish downtime, after candidate health, or not required;
- release readiness should know whether migration evidence exists;
- rollback semantics must be explicit: app-only rollback, schema rollback, data snapshot restore, or irreversible migration with warning;
- if active data may be changed, snapshot or backup evidence should exist before migration.

The key is not "zero downtime." The key is no unexplained half-success.

### 4.4 Builder Regrets Or Refines The Request

The Builder may not be a developer or product manager. They can ask for a vague change, approve something too broad, or change their mind after seeing the result.

Framework responsibility:

- ambiguous intent should be allowed to become an `agent_clarification` turn, not an immediate proposal;
- unapproved drafts can be discarded;
- approved but unpublished changes can become revert/corrective proposals;
- published changes can roll back to previous versions when data semantics allow;
- irreversible migration limitations must be visible before the decision, not after regret.

Regret is not an exceptional path. It is part of natural-language creation.

### 4.5 Builder Must Be Accountable

The enterprise cannot say "the AI did it" and lose responsibility. The Builder or assigned approver owns the decision, while the framework owns evidence quality.

Framework responsibility:

- record who requested, who proposed, who approved, and what they saw at approval time;
- preserve evidence refs for checks, diffs, migration plans, impact, execution, recovery, and release;
- make denied, failed, rolled-back, and superseded outcomes first-class;
- let a reviewer reconstruct why a release was allowed or blocked.

The Builder is accountable for the decision. The framework makes that accountability reasonable.

## 5. Lifecycle Reframing

The assurance lifecycle is not a new runtime. It is a way to align existing contexts.

```text
Builder Intent
  -> Clarification / Scope Boundary
  -> Agent Proposal
  -> Impact + Risk Classification
  -> Pre-Proposal Checks
  -> Builder Approval / Denial
  -> Apply + Migration
  -> Post-Apply Verification
  -> Release Readiness
  -> Publish / Rollback / Corrective Proposal
```

Mapped to current primitives:

| Lifecycle step | Existing support | Gap |
|---|---|---|
| Builder Intent | BuildThread `user` turn | No explicit scope-quality assessment. |
| Clarification | BuildThread `agent_clarification` | No policy for when unclear intent must clarify before proposing. |
| Agent Proposal | BuildThread `agent_proposal`, Code Change Lane proposal, definition change-set proposal | No unified proposal risk shape across definition, code, migration, and release. |
| Impact + Risk | definition.apply impact, Code Change Lane diff/checks | Destructive/schema/data/migration risks are not normalized. |
| Pre-Proposal Checks | Code Change Lane `pre_proposal`, doctor-host contracts | Not generalized to definition/app/release proposals. |
| Approval / Denial | Permission ledger, BuildThread `user_decision` | Approval evidence exists, but not always bound to a whole business change. |
| Apply + Migration | definition.apply, Code Change Lane apply, release helper | Migration timing and data backup evidence are not first-class. |
| Post-Apply Verification | Code Change Lane `post_apply`, runtime health, release checks | No unified readiness assessment. |
| Publish / Rollback | Release Rollout, definition rollback, Code Change Lane rollback receipts | Rollback limits and corrective proposal semantics need a shared vocabulary. |

## 6. Current Domain Object: Build Change Assurance

The accepted missing concept is not "artifact provenance." It is **Build Change Assurance** around one Builder-owned change attempt.

Working definition:

> A Build Change is one Builder-owned business-function change attempt, from intent through proposal, decision, execution, verification, release readiness, and recovery.

It is not necessarily one framework Operation. It may span:

- app-definition rows;
- Host-owned source code;
- HostExtension bundles;
- runtime config;
- schema/data migration;
- release rollout state;
- credential binding prerequisites.

Common identity fields:

```text
build_change_id
app_id
version_id or candidate_version_id
thread_id
builder_subject
```

Current readiness vocabulary:

```text
clarifying
proposed
blocked_before_approval
awaiting_approval
denied
applying
failed_recovered
failed_unrecovered
verified
ready_for_publish
published
rolled_back
superseded
```

The state machine should remain small at first. The important thing is to avoid flattening all failures into "error" or all reversals into "rollback."

## 7. Current Evidence Ref Model

The framework should avoid copying every log into one giant record. Evidence should be referenced.

```ts
type EvidenceRef =
  | { kind: "build_thread_turn"; thread_id: string; turn_id: string }
  | { kind: "permission_ledger_record"; request_id: string }
  | { kind: "code_change_receipt"; proposal_id: string }
  | { kind: "definition_history"; app_id: string; version: number }
  | { kind: "runtime_health"; runtime_id: string; checked_at_ms: number }
  | { kind: "release_rollout"; app_id: string; rollout_id: string }
  | { kind: "host_check"; check_id: string; status: "passed" | "failed" | "skipped" };
```

Current assessment inputs:

```ts
type BuildChangeReadiness =
  | "needs_clarification"
  | "blocked"
  | "awaiting_approval"
  | "ready_to_apply"
  | "verified"
  | "ready_to_publish"
  | "published"
  | "failed_recovered"
  | "failed_unrecovered"
  | "rolled_back"
  | "superseded";
```

Current assurance case:

```ts
interface BuildChangeAssuranceCase {
  build_change_id: string;
  app_id: string;
  thread_id: string;
  builder_subject: string;
  intent_summary: string;
  scope_summary: string;
  risk_classification: BuildChangeRisk[];
  readiness: BuildChangeReadiness;
  evidence_refs: EvidenceRef[];
  blocking_reasons: string[];
  rollback_notes?: string[];
  migration_notes?: string[];
}
```

This is the accepted v0 helper shape in `@pneuma-framework/core`. The important design direction remains: **assurance composes evidence refs and readiness reasons; it does not replace the underlying systems.**

## 8. Risk Classification Vocabulary

A minimal vocabulary is more useful than a vague "risk score."

| Risk | Meaning | Required evidence direction |
|---|---|---|
| `additive_ui` | Adds or edits UI without changing stored data shape. | Diff/preview evidence. |
| `source_code_change` | Changes Host-owned source artifact. | Code Change Lane proposal, diff, guardrails, receipt. |
| `definition_additive` | Adds table/column/operation/view/policy without removing existing capability. | definition.apply impact and history. |
| `policy_change` | Changes access, visibility, or approval semantics. | policy impact and approver evidence. |
| `destructive_definition` | Deletes table/column/view/operation/policy or removes a capability. | explicit destructive impact, backup/recovery evidence. |
| `data_migration` | Changes stored data shape or semantics. | migration timing, backup, verification, rollback limitation. |
| `credential_boundary` | Adds or changes credential requirements. | no-secret requirement/evidence and rebinding plan. |
| `release_change` | Changes active/candidate/previous published state. | rollout checks and release transition evidence. |

This vocabulary should be understandable to a Builder and useful to a Developer. It is not a security taxonomy.

## 9. Migration And Release Position

Schema/data migration is part of the build-change assurance story, not an independent deployment platform.

Current project stance:

- downtime is acceptable at this stage;
- online migration is not a default requirement;
- the framework should prefer explicit migration mode and evidence over hidden cleverness;
- "reset and retry" may be acceptable for low-frequency build-time changes;
- half-success and half-rollback are the conditions to avoid.

Current migration modes:

| Mode | Meaning |
|---|---|
| `none` | Change does not affect stored data shape. |
| `before_publish` | Migration runs before candidate is marked publish-ready. |
| `publish_downtime` | Active runtime is intentionally stopped, migration runs, then candidate starts. |
| `carry_forward_with_receipt` | New version starts from prior data plus explicit migration receipt. |
| `irreversible_with_backup` | Migration cannot be cleanly rolled back; backup/snapshot and warning are required. |

For now, this is probably a framework contract and Host implementation boundary:

- framework defines the vocabulary and evidence requirements;
- Host supplies actual migration commands and backup strategy;
- release readiness consumes the result.

## 10. Responsibility Boundary

| Concern | Framework should own | Host / Developer should own |
|---|---|---|
| Business-change lifecycle vocabulary | Yes | Host may add domain labels. |
| Evidence ref shape | Yes | Host provides concrete evidence producers. |
| Risk classification base vocabulary | Yes | Host may map domain tools to risks. |
| Guardrail command content | No | Yes. |
| Preview and product checks | No | Yes, via framework check hooks. |
| Migration strategy implementation | No | Yes. |
| Migration mode vocabulary | Likely yes | Host chooses mode per profile/change. |
| Approval UI | No | Yes. |
| Approval evidence contract | Yes | Host renders it. |
| Production incident response | No | Host/meta-app product. |
| Marketplace artifact signing | Not now | Later distribution lane, if needed. |

This boundary keeps the framework focused on the AI-build control plane while preserving the four-layer model.

## 11. What M32-M37 Settled

The first assurance lane is now accepted as a `@pneuma-framework/core` value-object/helper surface, not a runtime database or compliance backend.

Settled:

1. The first aggregate is `BuildChangeAssuranceCase`.
2. It lives in `@pneuma-framework/core` as evaluator, validator, local/reference store, and Host-facing helper.
3. Evidence is referenced through `BuildChangeEvidenceRef`; source systems remain authoritative.
4. Approval-time disclosure is represented by `BuildChangeReviewPacket`.
5. Expected negative paths are tested with `BuildChangeRecoveryDrillScenario`.
6. Downstream adoption is documented in `docs/developer/build-assurance-adoption.md`.

This keeps the assurance lane in the Creation Host control loop:

```text
Review Packet before approval
  -> Assurance Case after state transition
  -> Durable Host store
  -> Recovery Drill Matrix in Host tests
```

## 12. Remaining Open Pressure After M37

The next work should be chosen from concrete downstream pressure, not abstract expansion.

Open pressure points:

1. How much migration evidence should become framework-required versus Host-declared?
2. When should assurance cases be promoted from local/reference storage to a production retention adapter?
3. How should enterprise approval assignment, reviewer routing, and retention policy compose with Permission Center?
4. How should corrective proposals and superseded decisions be displayed in a real Host UI?
5. Which downstream Host should validate the adoption guide from zero context?

Do not restart the lane from UI, marketplace signing, production IAM, or online migration unless a concrete downstream scenario demands it.

## 13. Final Alignment

The assurance lane should be judged by one question:

> Can a non-expert Builder and an enterprise reviewer understand what the Agent intended to change, what risks were disclosed, what checks ran, what was approved, what happened, and how recovery works?

If yes, it advances Pneuma's original purpose.

If it becomes mainly about external artifact authenticity, it has drifted.
