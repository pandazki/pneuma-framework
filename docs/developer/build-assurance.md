# Build Change Assurance

**Audience:** Developers building governed Builder + Agent change loops  
**Chinese version:** [build-assurance.zh-CN.md](./build-assurance.zh-CN.md)

`Build Change Assurance` is the framework language for answering one question:

> Is this Builder-requested Agent change clear, approved, applied, verified, recoverable, and safe enough to publish?

It is not a generic marketplace audit system. It is a small core primitive that lets a Creation Host assemble evidence from existing framework systems into one readable case.

## Where It Fits

```text
Builder intent
  -> BuildThread proposal / decision / receipt
  -> permission ledger or Host approval evidence
  -> Code Change Lane / definition history / Host checks
  -> runtime health and release rollout evidence
  -> BuildChangeAssuranceCase
```

The assurance case stores references to evidence, not copied logs. The source systems remain responsible for the actual transcript, approval record, code-change receipt, runtime health, and rollout state.

## Basic Usage

```ts
import {
  assessBuildChangeReadiness,
  createBuildChangeAssuranceCase,
  validateBuildChangeAssuranceCase,
} from "@pneuma-framework/core";

const assessmentInput = {
  intent_status: "clear",
  proposal_status: "proposed",
  approval_status: "approved",
  execution_status: "applied",
  risks: ["definition_additive"],
  checks: [
    { id: "smoke", phase: "post_apply", status: "passed", message: "Preview works." },
  ],
  evidence_refs: [
    { kind: "permission_ledger_record", request_id: "request-1" },
    { kind: "code_change_receipt", proposal_id: "proposal-1" },
  ],
} as const;

const assessment = assessBuildChangeReadiness(assessmentInput);

const assuranceCase = createBuildChangeAssuranceCase({
  build_change_id: "change-1",
  app_id: "app-1",
  thread_id: "thread-1",
  builder_subject: "user:bob",
  intent_summary: "Add a priority queue.",
  scope_summary: "One additive definition change plus post-apply smoke check.",
  risks: ["definition_additive"],
  evidence_refs: [
    { kind: "permission_ledger_record", request_id: "request-1" },
    { kind: "code_change_receipt", proposal_id: "proposal-1" },
  ],
  assessment: assessmentInput,
  migration_mode: "none",
});

const validation = validateBuildChangeAssuranceCase(assuranceCase);
```

Use the evaluator directly when a Host only needs an immediate gate, for example
"should this approval button become enabled?" or "should publish stay blocked?"
Use the store when the Host needs refresh-safe inspection, history, or a
separate assurance tab.

## Review Packet

M35 adds a `BuildChangeReviewPacket` for the moment before approval. The
assurance case answers "where is this change now?" The review packet answers
"what exactly is the Builder being asked to approve?"

```ts
import {
  createBuildChangeReviewPacket,
  validateBuildChangeReviewPacket,
} from "@pneuma-framework/core";

const reviewPacket = createBuildChangeReviewPacket({
  build_change_id: "team-knowledge-inbox-v1-priority-queue",
  app_id: "team-knowledge-inbox",
  thread_id: "thread-priority",
  builder_subject: "user:builder-alice",
  intent_summary: "Add a Priority Queue for urgent inbox items.",
  scope_boundary: "Additive inbox definition only; no data deletion.",
  proposed_changes: [
    {
      kind: "definition",
      title: "Add priority column",
      summary: "Add priority to inbox_items without deleting existing rows.",
    },
  ],
  risk_classification: ["definition_additive"],
  pre_proposal_checks: [
    {
      id: "proposal-ready",
      phase: "pre_proposal",
      status: "passed",
      message: "Proposal was generated as one governed change-set.",
    },
  ],
  evidence_refs: [
    { kind: "host_check", check_id: "proposal-ready", status: "passed" },
  ],
  recovery_plan: {
    strategy: "discard_unapplied_draft",
    summary: "Before approval, deny the proposal and keep v0 untouched.",
  },
  migration_mode: "none",
});

const packetValidation = validateBuildChangeReviewPacket(reviewPacket);
```

The packet is intentionally approval-facing:

- `intent_summary` is the Builder's business request;
- `scope_boundary` says what is not included;
- `proposed_changes` names the affected lanes (`definition`, `source`,
  `host_artifact`, `runtime_config`, `credential`, `migration`, `release`);
- `pre_proposal_checks` must pass before the Host asks for approval;
- `recovery_plan` tells the Builder what happens if they deny or the change
  later fails;
- `approval_statement` is generated as one business-intent approval, not one
  approval per tool call.

Validation keeps the packet honest:

- failed pre-proposal checks block approval;
- destructive definition risk must disclose a destructive proposed change and a
  non-empty recovery strategy;
- data migration risk must name a non-`none` migration mode.

## Readiness Values

| Readiness | Meaning |
|---|---|
| `needs_clarification` | Builder intent is not clear enough to propose work. |
| `blocked` | A required check, disclosure, decision, or evidence condition failed. |
| `awaiting_approval` | Proposal exists and is waiting for Builder or policy approval. |
| `ready_to_apply` | Approval exists and execution has not started. |
| `verified` | Approved change applied and post-apply checks passed. |
| `ready_to_publish` | Verified change also has passing release checks. |
| `published` | The change has entered the published release state. |
| `failed_recovered` | Execution failed, but rollback or recovery evidence exists. |
| `failed_unrecovered` | Execution failed without sufficient recovery evidence. |
| `rolled_back` | The change was explicitly rolled back. |
| `superseded` | A later change replaces this one as the active decision path. |

The first v0 rules are deliberately narrow:

- unclear intent -> `needs_clarification`;
- failed `pre_proposal` or `pre_apply` checks -> `blocked`;
- destructive definition change without explicit impact disclosure -> `blocked`;
- approved + applied + passing `post_apply` check -> `verified`;
- verified + passing release checks -> `ready_to_publish`;
- failed post-apply with rollback evidence -> `failed_recovered`.

## Risk Vocabulary

| Risk | Use when |
|---|---|
| `additive_ui` | UI-only addition with no source or data risk. |
| `source_code_change` | Host-owned source changes are proposed. |
| `definition_additive` | Framework definition rows are added without removing existing shape. |
| `policy_change` | Permissions, visibility, or governance policy changes. |
| `destructive_definition` | Tables, columns, operations, views, or policy shape may be removed or narrowed. |
| `data_migration` | Existing data needs migration or carry-forward. |
| `credential_boundary` | Credential requirements, rebinding, or provider boundaries change. |
| `release_change` | Publish, restart, rollback, or release-state movement is involved. |

## Evidence References

Use evidence references to point at existing framework records:

```ts
type BuildChangeEvidenceRef =
  | { kind: "build_thread_turn"; thread_id: string; turn_id: string }
  | { kind: "permission_ledger_record"; request_id: string }
  | { kind: "code_change_receipt"; proposal_id: string }
  | { kind: "definition_history"; app_id: string; version: number }
  | { kind: "runtime_health"; runtime_id: string; checked_at_ms: number }
  | { kind: "release_rollout"; app_id: string; rollout_id: string }
  | { kind: "host_check"; check_id: string; status: "passed" | "failed" | "skipped" };
```

Keep evidence references stable and inspectable. Do not paste large logs into the assurance case.

## Migration Modes

`migration_mode` is optional, but useful when the Host needs publish-time data discipline:

| Mode | Meaning |
|---|---|
| `none` | No data migration is involved. |
| `before_publish` | Migration is expected before release promotion. |
| `publish_downtime` | Publish may stop the app while migration happens. |
| `carry_forward_with_receipt` | Data is carried forward with a migration receipt. |
| `irreversible_with_backup` | The Host must provide backup evidence before the irreversible step. |

## Durable Case Store

M34 adds a narrow file-backed store for Hosts that want assurance cases to
survive page refresh and process restart:

```ts
import {
  createFileBuildChangeAssuranceCaseStore,
} from "@pneuma-framework/core";

const assuranceCases = createFileBuildChangeAssuranceCaseStore({
  workspace: "/path/to/creation-host-workspace",
});

await assuranceCases.saveCase(assuranceCase);

const latestForApp = await assuranceCases.listCases({
  app_id: "team-knowledge-inbox",
});

const verifiedCases = await assuranceCases.listCases({
  app_id: "team-knowledge-inbox",
  readiness: "verified",
});
```

The v0 store writes to:

```text
<workspace>/.pneuma/build-assurance-cases.json
```

Save semantics are intentionally simple:

- cases are validated with `validateBuildChangeAssuranceCase` before writing;
- `saveCase` upserts by `build_change_id`;
- `listCases` returns most recently saved cases first;
- filters support `app_id`, `thread_id`, and `readiness`;
- missing or corrupted files return an empty list with a warning instead of
  killing the Host.

This store belongs to the Creation Host workspace. It is not the Generated
Application runtime database, and it is not a production audit-log backend.
The durable source evidence still lives in BuildThread, permission ledger,
Code Change Lane receipts, app history, runtime diagnostics, and rollout state.

## Reference Host Demo

M34 wires this primitive into the M16 Reference Creation Host:

```bash
bun examples/m16-reference-creation-host/run.ts --port 8883
```

In that demo, the Assurance card changes as the Builder moves through the loop:

| Step | Assurance readiness |
|---|---|
| Priority Queue proposed | `awaiting_approval` |
| Builder approves and post-apply preview check passes | `verified` |
| Publish health checks pass | `ready_to_publish` |

The governed-evolution panel also shows the review packet approval statement
before the Builder clicks Allow. For the Priority Queue demo, the packet lists
five additive definition changes: priority column, read operation, view, public
read policy, and public invoke policy.

The card is intentionally placed next to approval and publish controls. It is not just an inspector tab. The Builder should be able to see why a button is available, disabled, or unsafe before moving forward.

The Host also persists those cases and exposes them through:

```text
GET /api/host/projects/:appId/assurance
```

The Assurance inspector tab reads recent cases from the store, so a refreshed
Workbench can still explain why the Builder can continue.

## Current Limits

- v0 is a value object, evaluator, validator, and local file-backed case store.
- It does not replace BuildThread, permission ledger, Code Change Lane, app history, runtime diagnostics, or rollout state.
- It does not decide product policy on its own. Hosts decide which readiness states allow apply, publish, or rollback buttons.
- It does not implement online schema migration. Migration modes are vocabulary for Host policy and evidence, not migration runners.
- The file store is a reference/local Host persistence layer, not a multi-tenant compliance audit backend.
