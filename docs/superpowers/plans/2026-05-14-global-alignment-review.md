# Global Alignment Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a current M44-aligned top-level model review before moving from contract-first RC work into the next real implementation-framework phase.

**Architecture:** This is a documentation and domain-model alignment pass, not a new runtime primitive. The durable output is one bilingual global alignment snapshot that composes Creation Host, Build Assurance, Enterprise Governance, Runtime / Data Governance, provider boundaries, and next implementation runway. Existing anchor docs are amended only where they are stale or missing M44 context.

**Tech Stack:** Markdown docs, existing architecture/developer documentation structure, `rg`, `git diff --check`, focused markdown link checks by search.

---

### Task 1: Create the Global Alignment Snapshot

**Files:**
- Create: `docs/architecture/spec/global-alignment-review-0.3.md`
- Create: `docs/architecture/spec/global-alignment-review-0.3.zh-CN.md`

- [ ] **Step 1: Draft the English snapshot**

Create `docs/architecture/spec/global-alignment-review-0.3.md` with these sections:

```markdown
# Global Alignment Review 0.3

**Status:** Current top-level model snapshot after M44, before the next real implementation-framework phase.
**Date:** 2026-05-14
**Chinese version:** [global-alignment-review-0.3.zh-CN.md](./global-alignment-review-0.3.zh-CN.md)

## Purpose

This review answers one question:

> After Build Assurance, Enterprise Governance, and Runtime / Data Governance, is Pneuma still aligned with the original goal?

The answer should be explicit enough that the next implementation phase can start without re-litigating the model.

## Current North Star

`pneuma-framework` exists to help Developers build Creation Hosts where Builders can create and evolve Generated Applications with Build-phase Agents, while the framework constrains AI uncertainty through proposal, approval, evidence, verification, governance, publish, runtime/data outcome, and recovery contracts.

## Four-Layer Model

| Layer | Owns | Must not absorb |
|---|---|---|
| Framework | Shared primitives, contracts, validators, semantic tools, evidence vocabularies, local/reference helpers. | Host product UX, provider SDK implementations, hosted identity, deployment control planes. |
| Creation Host | Builder product surface, profiles, real provider wiring, credentials, preview/publish UX, policy choices. | Framework invariants or hidden bypasses around approval/evidence. |
| Generated Application | App definition, source/artifact boundary, data, versions, BuildThread, assurance cases. | Host-wide product preferences or marketplace concerns. |
| Published Application | Active release runtime and End User surface. | Build-time authority or framework-internal mutation privileges. |

## Unified Control Loop

```text
Builder intent
  -> BuildThread
  -> Agent proposal
  -> review packet / impact / checks
  -> Builder or enterprise approval
  -> governed definition/code/host execution lane
  -> Build Assurance case
  -> Runtime Intent / Reconcile Attempt
  -> Runtime Observation / Data Evolution Receipt
  -> Runtime Control Receipt
  -> publish, rollback, corrective proposal, or blocked state
```

## Domain Map

| Domain | Primary question | Framework owns | Host owns |
|---|---|---|---|
| Creation | What is being built, through which Host/profile/session? | Creation Host contracts and diagnostics. | Product surface, project creation, profile choices. |
| Agent Loop | What did the Builder ask and what did the Agent propose? | BuildThread and AgentBackend turn contract. | Prompting, domain tools, conversation UX. |
| App Definition | What app capability changed? | Operation, definition-as-data, policy/view/table contracts. | Domain-specific app model and generated UI/API shape. |
| Code / Artifact | What source or open-ended artifact changed? | Scaffold Project, Code Change Lane, HostExtension slots. | Source layout, guardrail commands, generated-app implementation. |
| Assurance | Is the change understandable, bounded, verified, and recoverable? | Build Change Assurance, review packets, recovery drills. | Evidence producers and product checks. |
| Enterprise Governance | Which human role must approve before publish readiness? | Role vocabulary, route evaluator, decision evidence. | Real identity, org mapping, notification/workflow UX. |
| Runtime / Data | What happened after approval to runtime and provider data? | Runtime/Data evidence contracts and data policy vocabulary. | Provider SDKs, migrations, backups, restore, process management. |
| Sharing / Forking | Can this artifact move without secrets and be safely rebound? | Share artifact, sharing governance, credential rebinding evidence. | Distribution product, access UX, real credential lifecycle. |

## Key Invariants

1. Agents operate through semantic tools or Host-declared domain tools, not hidden provider-specific branches.
2. One Builder business intent should become one reviewable proposal or an explicit clarification, not scattered unowned mutations.
3. Approval must bind to the whole proposal evidence the human saw.
4. Framework-internal authority cannot be derived from user-controlled HTTP headers or normal End User runtime context.
5. Provider capabilities are declared as contracts; provider implementations stay Host-owned.
6. Data evolution that changes active or carried-forward data requires evidence, especially receipts for carry-forward, snapshot, restore, branch, or irreversible migration.
7. Failure is first-class: denied, blocked, failed-recovered, failed-unrecovered, rolled-back, stale, and superseded states must remain distinguishable.
8. Documentation and examples may use Bun, SQLite, Docker, GitHub, Linear, OpenRouter, or local version directories; none of those are framework semantics.

## What Has Become Clearer

The model is more concrete than it was at M1:

- the framework is not "an app generator"; it is a control plane for Creation Hosts;
- application/code governance and data governance are two cooperating evidence lanes;
- enterprise governance is review routing around AI-assisted business changes, not a generic admin product;
- provider abstraction is a capability and evidence boundary, not a license for the Build Agent to special-case providers;
- the next implementation phase should build real Host/runtime usability on top of these contracts, not add endless abstract provider options.

## What Would Be Drift

Avoid these directions unless a later explicit product decision promotes them:

- treating Pneuma as a hosted IAM or workflow engine;
- turning provider integrations into framework primitives;
- optimizing for marketplace artifact signing before Builder/Agent build safety;
- claiming production readiness without real Host-owned identity, credentials, migration, and monitoring;
- expanding adapters endlessly before the reference implementation proves a coherent Developer workflow.

## Next Implementation Runway

The next phase should start building the real implementation framework around the now-stable contracts:

1. Reference Creation Host runtime that consumes BuildThread, Code Change Lane, Assurance, Enterprise Governance, and Runtime/Data Governance as one visible loop.
2. Real provider-backed profile pressure, with provider capability declarations and fail-closed evidence, but no provider-special-case Agent behavior.
3. Published runtime/data lifecycle implementation, including migration/carry-forward receipt production and stale-generation rejection.
4. Developer-facing authoring experience that makes scaffold, profiles, agent package, provider matrix, and governance policies easy to create and verify.
5. A downstream validation pass from zero context after the implementation framework is usable.

## Decision

The project remains aligned with its original goal. The vocabulary has expanded, but the center has not moved:

```text
Make AI-assisted app creation governable enough that a Developer can build a real Creation Host and an organization can trust the Builder + Build Agent change process.
```
```

- [ ] **Step 2: Draft the Chinese snapshot**

Create `docs/architecture/spec/global-alignment-review-0.3.zh-CN.md` as a faithful Chinese counterpart. Keep the same section structure and links.

- [ ] **Step 3: Search for accidental drift language**

Run:

```bash
rg -n "hosted IAM|workflow engine|provider adapter|marketplace artifact|pneuma app" docs/architecture/spec/global-alignment-review-0.3*.md
```

Expected: Matches only appear in anti-drift or clarification sections.

### Task 2: Refresh Stale Top-Level Anchors

**Files:**
- Modify: `docs/architecture/spec/creation-host-model.md`
- Modify: `docs/architecture/spec/creation-host-model.zh-CN.md`
- Modify: `docs/architecture/spec/ai-build-assurance-domain-review.md`
- Modify: `docs/architecture/spec/ai-build-assurance-domain-review.zh-CN.md`
- Modify: `docs/architecture/spec/creation-host-ddd-review.md`
- Modify: `docs/architecture/spec/creation-host-ddd-review.zh-CN.md`

- [ ] **Step 1: Update Creation Host Model status**

In both Creation Host Model files, update the status from post-RC M29 to post-M44 global alignment and add a short paragraph explaining that M40-M44 added Enterprise Governance and Runtime / Data Governance without changing the four-layer model.

- [ ] **Step 2: Add Runtime / Data Governance to primitive fit table**

In `creation-host-model.md` and `.zh-CN.md`, add a row to "Where Existing Primitives Fit":

```markdown
| **Runtime / Data Governance** | Makes runtime/data intent, generation, observation, data evolution receipt, and control receipt explainable after approval. |
```

- [ ] **Step 3: Update AI Build Assurance Domain Review status**

In both AI Build Assurance files, update status/date language from "after M37" to "after M44", and add Enterprise Governance and Runtime / Data Governance to the list of working primitives.

- [ ] **Step 4: Replace "Remaining Open Pressure After M37"**

Rename the section to "Remaining Open Pressure After M44" and include:

```markdown
1. Which runtime/data receipt producers should the reference Host implement first?
2. How should real provider-backed evidence be shown without provider-specific Agent branches?
3. How much of enterprise review routing should become UI helper versus stay as evaluator contract?
4. When should assurance/runtime evidence move from local/reference storage to production retention adapters?
5. Which fresh downstream project should validate the implementation framework from zero context?
```

- [ ] **Step 5: Update Creation Host DDD Review current boundary**

In both Creation Host DDD Review files, replace the M37 / Production Readiness phrasing with M44 language: Creation Host authoring, sharing/forking, code-change, credential, assurance, enterprise governance, and runtime/data outcome contracts are now the first framework-level boundary set.

### Task 3: Add Navigation To The New Anchor

**Files:**
- Modify: `docs/architecture/README.md`
- Modify: `docs/developer/start-here.md`
- Modify: `docs/developer/start-here.zh-CN.md`
- Modify: `docs/architecture/team-share-demo.md`
- Modify: `docs/architecture/team-share-demo.zh-CN.md`

- [ ] **Step 1: Add Global Alignment to architecture index**

Add `Global Alignment Review 0.3` to "Current Canonical Entry Points" and "Product And Domain Model".

- [ ] **Step 2: Add Global Alignment to Start Here Read Next**

In both Start Here docs, add the Global Alignment Review link to the "Review enterprise boundary" lane.

- [ ] **Step 3: Add team-share transition note**

In both team-share docs, add a short "After M44" note saying the team should use Global Alignment Review 0.3 as the bridge from milestone evidence to the next implementation-framework phase.

### Task 4: Verify And Commit

**Files:**
- All touched docs.

- [ ] **Step 1: Run doc hygiene**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 2: Confirm current anchors find the new doc**

Run:

```bash
rg -n "Global Alignment Review|global-alignment-review-0.3|Runtime / Data Governance|M44" docs/architecture/README.md docs/developer/start-here*.md docs/architecture/spec/*.md docs/architecture/team-share-demo*.md
```

Expected: English and Chinese entrypoints reference the new global alignment doc and M44 runtime/data model.

- [ ] **Step 3: Commit**

Run:

```bash
git add docs/architecture/spec/global-alignment-review-0.3.md docs/architecture/spec/global-alignment-review-0.3.zh-CN.md docs/architecture/spec/creation-host-model.md docs/architecture/spec/creation-host-model.zh-CN.md docs/architecture/spec/ai-build-assurance-domain-review.md docs/architecture/spec/ai-build-assurance-domain-review.zh-CN.md docs/architecture/spec/creation-host-ddd-review.md docs/architecture/spec/creation-host-ddd-review.zh-CN.md docs/architecture/README.md docs/developer/start-here.md docs/developer/start-here.zh-CN.md docs/architecture/team-share-demo.md docs/architecture/team-share-demo.zh-CN.md
git commit -m "docs: align top-level model after m44"
```

Expected: commit succeeds with only documentation changes.

## Self-Review

- Spec coverage: The plan covers the requested global review, top-level model alignment, stale anchor cleanup, and transition into the next implementation-framework phase.
- Placeholder scan: No TBD/TODO placeholders are present.
- Type consistency: This is docs-only; term usage matches existing docs: Framework, Creation Host, Generated Application, Published Application, BuildThread, Build Assurance, Enterprise Governance, Runtime / Data Governance.
