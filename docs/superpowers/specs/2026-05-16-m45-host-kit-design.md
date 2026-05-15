# M45 Host Kit Design

Status: Draft for owner review
Date: 2026-05-16
Milestone: M45, first 0.4.0 implementation-framework slice

## Purpose

M45 turns the post-0.3.0 contract set into a reusable implementation layer. The goal is not another abstract primitive and not a new product. The goal is to let a Developer build a Creation Host without rewriting the same BuildThread, Code Change Lane, approval, assurance, runtime/data receipt, preview, publish, and rollback glue in every Host.

The milestone proves this through a new long-lived Reference Host that consumes the kit from scratch. It does not migrate or extend the old M16/M18 examples.

## Decision Summary

- Add `@pneuma-framework/host-kit` as the Host-facing package boundary.
- Keep `@pneuma-framework/core` focused on primitives, contracts, validators, stores, and evidence value objects.
- Provide explicit stores, explicit adapters, orchestration functions, and a thin local happy-path facade.
- Build `examples/reference-creation-host/` as the canonical long-lived consumer.
- Use a Team Notes Board fixture app with a schema-changing Review Queue evolution.
- Cover Code Change Lane, Preview Data Rehearsal, local publish/deploy, Runtime/Data Receipt, and rollback.
- Require deterministic backend tests and support an optional real agent smoke.
- Require a minimal but polished three-pane product workbench.
- Produce a pruning candidate list for old examples, but do not delete old examples in M45.

ADR-0038 records the package boundary.

## Terminology

The following terms are canonicalized in `CONTEXT.md`:

- Creation Host Implementation Kit
- Reference Host
- Code Change Lane
- Runtime/Data Receipt
- Data Evolution Handler
- Preview Data Rehearsal
- Corrective Proposal

The short version:

```text
@pneuma-framework/core
  primitives, contracts, validators, stores, evidence value objects

@pneuma-framework/host-kit
  reusable Creation Host assembly helpers

examples/reference-creation-host
  canonical consumer and living conformance example
```

## Scope

### In Scope

1. `@pneuma-framework/host-kit`
   - orchestration functions;
   - explicit adapter interfaces;
   - local process runtime adapter;
   - preview data rehearsal orchestration;
   - publish/rollback orchestration over existing rollout and runtime/data governance contracts;
   - thin local facade for the Reference Host happy path.

2. Reference Host
   - new `examples/reference-creation-host/`;
   - three-pane workbench;
   - headless e2e runner;
   - Team Notes Board fixture;
   - deterministic backend path;
   - optional real agent smoke;
   - optional Docker deploy smoke if Docker is available.

3. Test-first boundaries
   - host-kit unit tests before UI convenience code;
   - headless e2e;
   - browser e2e for workbench states;
   - optional pressure smokes separated from required verification.

4. Documentation at close
   - developer guide for `host-kit`;
   - developer guide for Reference Host;
   - M45 snapshot, English and Chinese;
   - one core diagram, English and Chinese;
   - start-here / roadmap / architecture navigation updates.

### Out Of Scope

- production IAM;
- production credential vault;
- cloud deployment provider;
- Docker as a required default;
- zero-downtime traffic switching;
- marketplace artifact signing;
- framework-owned migration engine;
- provider SDK implementation;
- full open-ended UI generation;
- rewriting or deleting old milestone examples during M45.

## Product And Domain Boundaries

`host-kit` helps assemble the governed loop, but the Host still owns:

- product UX;
- user and role mapping;
- provider SDKs;
- credential storage;
- source layout;
- guardrail commands;
- Data Evolution Handler implementation;
- deployment target choices;
- business domain model.

The framework owns:

- call order semantics;
- contract validation;
- fail-closed conditions;
- evidence vocabulary;
- adapter interfaces;
- portable stores where already established;
- orchestration that prevents hidden bypasses.

This keeps M45 aligned with the four-layer model:

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

## Host Kit Shape

M45 should prefer explicit composition over a black-box engine.

### Required Primitive Interfaces

The exact TypeScript names may change during implementation, but the boundaries should remain:

```ts
interface HostRuntimeAdapter {
  startPreview(input: StartPreviewInput): Promise<RuntimeHandle>;
  stopPreview(input: StopPreviewInput): Promise<void>;
  startPublished(input: StartPublishedInput): Promise<RuntimeHandle>;
  stopPublished(input: StopPublishedInput): Promise<void>;
  waitUntilReady(input: RuntimeReadyInput): Promise<RuntimeReadyResult>;
}

interface DataEvolutionAdapter {
  cloneForPreview(input: ClonePreviewDataInput): Promise<PreviewDataTarget>;
  rehearse(input: RehearseDataEvolutionInput): Promise<RuntimeDataReceipt>;
  applyForPublish(input: ApplyDataEvolutionInput): Promise<RuntimeDataReceipt>;
}

interface ApprovalAdapter {
  createReviewPacket(input: CreateReviewPacketInput): Promise<BuildChangeReviewPacket>;
  evaluate(input: EvaluateApprovalInput): Promise<ApprovalEvaluationResult>;
  recordDecision(input: RecordApprovalDecisionInput): Promise<void>;
}
```

These adapters are Host-provided or local-reference provided. They are not provider SDKs and not hosted workflow engines.

### Required Orchestration Functions

M45 should include small orchestration functions such as:

- `runGovernedBuildTurn`
- `prepareCodeChangeReview`
- `applyApprovedCodeChange`
- `runPreviewDataRehearsal`
- `publishVerifiedVersion`
- `rollbackPublishedVersion`

Each function receives explicit stores and adapters. No function should infer framework/system authority from user input.

### Thin Local Facade

M45 may provide a local convenience facade for the Reference Host:

```ts
const host = createLocalReferenceHostKit(...)
```

This facade is allowed to reduce boilerplate for local examples, but it must be a wrapper over explicit stores/adapters. It must not become the primary API or hide Host-owned choices.

## Reference Host

Path:

```text
examples/reference-creation-host/
```

It is the current canonical consumer. Old milestone examples remain historical evidence.

### App Fixture: Team Notes Board

The generated app starts as:

```text
v0:
  list notes
  create note
  update note status
```

Data shape:

```text
note:
  id
  title
  body
  owner
  status
```

Builder request:

```text
Add a review queue so notes can be marked needs_review and approved.
```

The governed evolution produces:

```text
v1:
  review_status field
  review queue view/route
  approve review action
```

Data evolution:

```text
existing notes:
  review_status = "not_required"
```

Receipt:

```text
policy: carry-forward-with-default
source version: v0
target version: v1
rows touched: N
default assigned: review_status = "not_required"
status: completed
```

## Governed Flow

Required successful path:

```text
Builder message
  -> BuildThread turn
  -> deterministic backend proposes constrained code-change tool
  -> Host generates source patch proposal
  -> review packet includes diff, risk, checks, and data evolution declaration
  -> Builder self-approval is insufficient
  -> Reviewer approval satisfies route
  -> Code Change Lane applies patch
  -> post-apply checks pass
  -> Preview Data Rehearsal clones representative data and runs data evolution
  -> preview runtime starts
  -> assurance case becomes verified / ready to publish
  -> local publish activates Published Application
  -> publish Runtime/Data Receipt is recorded
  -> rollback returns to previous active version
```

Required failure path:

```text
Preview Data Rehearsal fails
  -> attempt fails
  -> failure receipt is recorded
  -> BuildThread receives structured failure context
  -> preview and publish do not continue
```

The kit must not auto-retry, auto-repair, or ask the Agent to patch in a hidden loop. A later Corrective Proposal is just a new Build-phase Agent proposal after seeing failure feedback.

## Code Change Lane Policy

M45 defaults to a constrained Host-declared tool:

```text
add_review_queue_feature()
```

The tool produces a known patch over the Team Notes Board scaffold. This keeps required tests deterministic.

The underlying `host-kit` design must still preserve a raw patch proposal seam for future real coding agents. Raw patch proposal support requires:

- scaffold source boundary;
- writable root checks;
- protected path checks;
- pre-apply checks;
- post-apply checks;
- rollback or failed recovery evidence.

## Agent Backends

M45 supports two paths:

1. Deterministic backend
   - required;
   - no API key;
   - no network;
   - used for unit and e2e conformance.

2. Real agent backend
   - optional pressure;
   - enabled only with explicit environment configuration;
   - exercises the same `AgentBackend.runTurn` seam;
   - not required for default test pass.

The deterministic backend must not use a private code path that the real backend cannot use.

## Deploy And Runtime

M45 requires a local deploy seam:

```text
local process adapter
  + version directory publish
  + active runtime health
  + rollback to previous version
  + runtime/data receipt
```

M45 may include an optional Docker adapter smoke:

```text
Docker adapter smoke
  + image/tag artifact
  + mounted data volume
  + restart evidence
```

Docker must not become a required default, and Docker-specific behavior must not leak into core Host Kit semantics.

## UI Workbench

The Reference Host needs a minimal browser workbench. It should use a three-pane product layout:

```text
Left: BuildThread conversation
Center: Generated Application preview
Right: Governance / Assurance / Runtime evidence inspector
```

The UI should be simple but polished:

- product UI, not marketing page;
- restrained palette;
- system or Inter-like typography;
- clear information density;
- no card soup;
- no decorative gradients, orbs, or AI-slop dashboard clichés;
- standard controls and states;
- responsive enough for desktop and narrow tablet widths.

Required visible states:

- awaiting proposal;
- awaiting reviewer approval;
- denied or blocked;
- applying;
- preview rehearsal failed;
- ready to preview;
- published;
- rolled back.

The UI is not expected to be a full product shell. It exists to let a team and downstream Developer understand the governed implementation loop.

## Tests

M45 is test-first.

### Required Unit Tests

`@pneuma-framework/host-kit` tests must cover:

- build turn orchestration;
- approval/governance injection;
- Builder self-approval fails required Reviewer route;
- code-change apply requires approval;
- schema/data-affecting change declares data evolution policy;
- missing Runtime/Data Receipt blocks publish readiness;
- failed Preview Data Rehearsal terminates the attempt;
- local runtime adapter state transitions;
- rollback receipt creation.

### Required Headless E2E

The Reference Host headless e2e must prove:

- create project;
- start BuildThread;
- propose Review Queue change;
- block self approval;
- accept Reviewer approval;
- apply code patch;
- run Preview Data Rehearsal;
- start preview;
- publish active runtime;
- carry forward existing notes with default `review_status`;
- roll back active runtime.

### Required Browser E2E

Browser e2e must open the three-pane workbench and verify:

- the app preview is visible;
- the proposal and diff are visible;
- the approval state changes;
- the evidence inspector shows assurance and runtime/data receipt;
- publish and rollback states are visible.

### Optional Smokes

- real agent smoke when configured;
- Docker adapter smoke when Docker is available.

Optional smokes must not be required for default CI/local verification.

## Acceptance Criteria

M45 is complete when:

1. `@pneuma-framework/host-kit` exists and is consumed by the Reference Host.
2. Required unit tests pass.
3. Required headless e2e passes without network, API keys, or Docker.
4. Required browser e2e passes and produces screenshot evidence.
5. Publish readiness fails closed without a required Runtime/Data Receipt.
6. A failed Preview Data Rehearsal records failure feedback and does not auto-retry.
7. Optional real agent and Docker smokes are documented and skipped safely when unavailable.
8. `examples/reference-creation-host/` is documented as the current canonical consumer.
9. Old milestone examples remain untouched, but the snapshot includes a pruning candidate list.
10. Developer docs and the M45 snapshot are updated in English and Chinese.

## Example Pruning Output

M45 should not delete old examples, but the closing snapshot should include a table like:

| Old example | Replacement coverage | Recommendation |
|---|---|---|
| `examples/m16-reference-creation-host/` | Covered by `examples/reference-creation-host/` if M45 passes | Delete or archive after owner review |
| `examples/m18-open-ended-personal-focus-site/` | Not covered by Team Notes Board | Keep until open-ended pressure v2 |
| `examples/m43-enterprise-governance-demo/` | Partially covered by Reviewer route | Keep until governance UX is fully covered in Reference Host |

## Risks

1. `host-kit` becomes a hidden Creation Host product.
   - Mitigation: explicit adapters, explicit stores, no Host UX/provider SDK ownership.

2. Reference Host becomes another one-off milestone demo.
   - Mitigation: long-lived `examples/reference-creation-host/` path and docs pointing to it as canonical consumer.

3. Docker or local process details leak into semantics.
   - Mitigation: adapter seam and optional Docker smoke only.

4. Data evolution drifts into framework migration engine.
   - Mitigation: Host-owned Data Evolution Handler and framework-owned receipt/gate semantics.

5. UI becomes sloppy and weakens the project story.
   - Mitigation: product-register design brief, three-pane layout, browser e2e, and impeccable polish before milestone close.

## Non-Goals

M45 does not claim production-ready deployment or enterprise SaaS. It proves that the now-stable contracts can be assembled into a usable implementation framework slice.

The next likely milestones after M45 are:

- harden the Reference Host against a real agent path;
- expand Docker/provider pressure;
- revisit open-ended app pressure on top of Host Kit;
- prune historical examples after replacement coverage is demonstrated.
