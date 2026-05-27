# pneuma-framework Architecture Index

> This directory is the architecture, decision, and evidence archive for
> `pneuma-framework`.
>
> If you are a Developer entering the project for the first time, start with
> [Start Here: Build A Creation Host](../developer/start-here.md) /
> [中文版](../developer/start-here.zh-CN.md), not this index.

## Pick Your Route

| I am... | Read first |
|---|---|
| A Developer building a Creation Host | [Start Here](../developer/start-here.md), then [Getting Started](../developer/getting-started.md), [Creation Host Contract](../developer/creation-host-contract.md), [Host Kit](../developer/host-kit.md), and the compact/product reference examples |
| A fresh downstream validator | [Downstream Validation Brief](../developer/downstream-validation-brief.md), then follow its required reading order and gap-log template |
| A teammate with zero Pneuma context | [Team Share Package](./team-share-demo.md) / [中文版](./team-share-demo.zh-CN.md) |
| A downstream Host implementer adopting RC contracts | [RC 0.1.1 upgrade](../developer/upgrading-to-rc-0.1.1.md), [RC 0.1.2 upgrade](../developer/upgrading-to-rc-0.1.2.md), [RC 0.1.3 upgrade](../developer/upgrading-to-rc-0.1.3.md), [RC 0.2.0 upgrade](../developer/upgrading-to-rc-0.2.0.md), then the relevant contract guide. For Builder + Agent change assurance, use [Build Assurance Adoption](../developer/build-assurance-adoption.md). For minimum enterprise review routing, use [Enterprise Governance](../developer/enterprise-governance.md). For post-approval runtime/data outcomes, use [Runtime / Data Governance](../developer/runtime-data-governance.md). |
| An architecture reviewer | [Global Alignment Review 0.4](./spec/global-alignment-review-0.4.md), [Creation Host Model](./spec/creation-host-model.md), [AI Build Assurance DDD Review](./spec/ai-build-assurance-domain-review.md), [Production Readiness Boundary](./spec/production-readiness-boundary.md), [Enterprise Governance Domain Review](./spec/enterprise-governance-domain-review.md), then ADRs and milestone evidence as needed |

## Current Canonical Entry Points

These are the long-lived docs to keep in sync first:

| Document | Purpose |
|---|---|
| [Developer Start Here](../developer/start-here.md) / [中文](../developer/start-here.zh-CN.md) | Five-image outside-in entry for Developers building Creation Hosts. |
| [Downstream Validation Brief](../developer/downstream-validation-brief.md) / [中文](../developer/downstream-validation-brief.zh-CN.md) | Fresh downstream handoff: mission, reading order, deliverables, validation commands, and gap-log template. |
| [Team Share Package](./team-share-demo.md) / [中文](./team-share-demo.zh-CN.md) | Zero-context team explanation from project goal to the 0.3.0 governance baseline and 0.4.0 implementation-framework evidence. |
| [Global Alignment Review 0.4](./spec/global-alignment-review-0.4.md) / [中文](./spec/global-alignment-review-0.4.zh-CN.md) | Current top-level model snapshot after Host Kit, Workflow App Studio, real Codex source changes, Agent Debug Loop, and M51 close-out. |
| [Global Alignment Review 0.3](./spec/global-alignment-review-0.3.md) / [中文](./spec/global-alignment-review-0.3.zh-CN.md) | Top-level model snapshot after the 0.3.0 governance lane and before the 0.4.0 implementation-framework/product pressure. |
| [Creation Host Model](./spec/creation-host-model.md) / [中文](./spec/creation-host-model.zh-CN.md) | Top-level product/domain boundary: Framework -> Creation Host -> Generated Application -> Published Application. |
| [Real Creation Host Example Brief](./spec/real-creation-host-example.md) / [中文](./spec/real-creation-host-example.zh-CN.md) | M48 starting brief: Workflow App Studio, a clean product target after the closed Dev Board pressure sample. |
| [AI Build Assurance DDD Review](./spec/ai-build-assurance-domain-review.md) / [中文](./spec/ai-build-assurance-domain-review.zh-CN.md) | Current DDD anchor for Builder + Build Agent engineering control. |
| [Release Candidate Snapshot](./release-candidate-snapshot.md) / [中文](./release-candidate-snapshot.zh-CN.md) | Why `pneuma-rc-0.1.0` was accepted. |
| [RC 0.1.1 Snapshot](./release-candidate-0.1.1-snapshot.md) / [中文](./release-candidate-0.1.1-snapshot.zh-CN.md) | Developer-contract polish from external DevBoard pressure. |
| [RC 0.1.3 Snapshot](./release-candidate-0.1.3-snapshot.md) / [中文](./release-candidate-0.1.3-snapshot.zh-CN.md) | Minimal executable Code Change Lane release patch. |
| [RC 0.2.0 Snapshot](./release-candidate-0.2.0-snapshot.md) / [中文](./release-candidate-0.2.0-snapshot.zh-CN.md) | Post-assurance developer-contract release train and package-consumption gate. |
| [RC 0.3.0 Snapshot](./release-candidate-0.3.0-snapshot.md) / [中文](./release-candidate-0.3.0-snapshot.zh-CN.md) | Minimum enterprise-governance release train and owner confirmation gate. |
| [M45 Snapshot](./milestone-45-snapshot.md) / [中文](./milestone-45-snapshot.zh-CN.md) | First 0.4.0 implementation-framework slice: Host Kit, Reference Creation Host, real opencode pressure, optional Docker adapter, narrow open-ended pressure, and post-review hardening notes. |
| [M46 Snapshot](./milestone-46-snapshot.md) / [中文](./milestone-46-snapshot.zh-CN.md) | Product-shaped Creation Host pressure: Dev Board Builder, browser E2E, share/fork, published-app use, and real opencode pressure over two different boards. |
| [M47 Snapshot](./milestone-47-snapshot.md) / [中文](./milestone-47-snapshot.zh-CN.md) | Product Host close-out: Alice/Bob/Charlie external view, version lineage, rollback, controlled generated source artifacts, real opencode evidence, and framework-vs-Host boundary review. |
| [M48 Snapshot](./milestone-48-snapshot.md) / [中文](./milestone-48-snapshot.zh-CN.md) | Real Creation Host example: Workflow App Studio, controlled `src/app.ts` source patching, Codex app-server default code-agent E2E, opencode alternate evidence, guardrail/review/approval/apply, preview/publish, and runtime-proven feature changes. |
| [M49 Snapshot](./milestone-49-snapshot.md) / [中文](./milestone-49-snapshot.zh-CN.md) | Agent Debug Loop close-out: budgeted attempts, failed-check feedback, BuildThread debug evidence, fake-Codex repair test, and real Codex browser E2E through publish. |
| [M50 Snapshot](./milestone-50-snapshot.md) / [中文](./milestone-50-snapshot.zh-CN.md) | Workflow App Studio lifecycle UX hardening: clearer Builder/App separation, lifecycle button state, progress/log visibility, preview/publish separation, and bilingual runtime labels. |
| [M51 Snapshot](./milestone-51-snapshot.md) / [中文](./milestone-51-snapshot.zh-CN.md) | Close-out review: typecheck, combined package/example test gate, real Codex browser E2E, paperwork sync, residual risks, and next-lane choices. |
| [M52 Snapshot](./milestone-52-snapshot.md) / [中文](./milestone-52-snapshot.zh-CN.md) | Production Generated App scaffold-first profile: Bun + Hono + React + Drizzle + Zod, Neon boundary, Docker/Vercel targets, small demo slices, and product UI design contract. |
| [Agent Debug Loop](../developer/agent-debug-loop.md) / [中文](../developer/agent-debug-loop.zh-CN.md) | M49 contract: budgeted pre-proposal code-agent attempts, failed-check feedback, BuildThread debug evidence, and no silent post-apply repair. |

M26-M38 are post-RC stabilization evidence. M38 prepares the 0.2.0 release train and package-consumption gate. M40-M44 prepare the 0.3.0 minimum enterprise-governance and post-approval runtime/data gate. M45-M51 close the first 0.4.0 implementation-framework/product pressure proof through Host Kit, Workflow App Studio, real Codex code-agent source changes, the pre-proposal debug-loop lane, lifecycle UX hardening, and close-out review. They are
valuable when adopting a specific contract, but they should not be treated as
mandatory first-read material.
M35-M37 complete the current assurance adoption lane by making approval packets,
recovery drills, and downstream adoption guidance explicit. M38 makes that lane
installable from a fresh downstream project without workspace-only assumptions.

## Topic Clusters

### Product And Domain Model

- [Creation Host Model](./spec/creation-host-model.md) / [中文](./spec/creation-host-model.zh-CN.md)
- [Global Alignment Review 0.4](./spec/global-alignment-review-0.4.md) / [中文](./spec/global-alignment-review-0.4.zh-CN.md)
- [Global Alignment Review 0.3](./spec/global-alignment-review-0.3.md) / [中文](./spec/global-alignment-review-0.3.zh-CN.md)
- [Real Creation Host Example Brief](./spec/real-creation-host-example.md) / [中文](./spec/real-creation-host-example.zh-CN.md)
- [Creation Host DDD Review](./spec/creation-host-ddd-review.md) / [中文](./spec/creation-host-ddd-review.zh-CN.md)
- [AI Build Assurance DDD Review](./spec/ai-build-assurance-domain-review.md) / [中文](./spec/ai-build-assurance-domain-review.zh-CN.md)
- [Generated Application Domain Model](./spec/domain-model.md)

### Core Primitives

- [ADR-0002: Storage Typed Cells](./adr/0002-storage-typed-cells.md)
- [ADR-0003: Transform Primitive](./adr/0003-transform-primitive.md)
- [ADR-0018: Operations As Primitive](./adr/0018-operations-as-primitive.md)
- [ADR-0019: WhereClause AST](./adr/0019-where-clause-ast.md)
- [ADR-0023: Operation Surface Contract](./adr/0023-operation-surface-contract.md)
- [ADR-0029: Supersede v0 Design Spec](./adr/0029-supersede-v0-design-spec.md)
- [ADR-0030: Lifecycle Subsystem Contract](./adr/0030-lifecycle-subsystem-contract.md)

### Build, Approval, And Assurance

- [BuildThread Guide](../developer/build-thread.md) / [中文](../developer/build-thread.zh-CN.md)
- [Scaffold Project Contract](../developer/scaffold-project-contract.md) / [中文](../developer/scaffold-project-contract.zh-CN.md)
- [Code Change Lane](../developer/code-change-lane.md) / [中文](../developer/code-change-lane.zh-CN.md)
- [Build Change Assurance](../developer/build-assurance.md) / [中文](../developer/build-assurance.zh-CN.md)
- [Build Assurance Adoption](../developer/build-assurance-adoption.md) / [中文](../developer/build-assurance-adoption.zh-CN.md)
- [Creation Host Implementation Kit](../developer/host-kit.md) / [中文](../developer/host-kit.zh-CN.md)
- [Enterprise Governance](../developer/enterprise-governance.md) / [中文](../developer/enterprise-governance.zh-CN.md)
- [Runtime / Data Governance](../developer/runtime-data-governance.md) / [中文](../developer/runtime-data-governance.zh-CN.md)
- [Production Readiness Boundary](./spec/production-readiness-boundary.md) / [中文](./spec/production-readiness-boundary.zh-CN.md)
- [Enterprise Governance Domain Review](./spec/enterprise-governance-domain-review.md) / [中文](./spec/enterprise-governance-domain-review.zh-CN.md)
- [ADR-0032: BuildThread Primitive](./adr/0032-build-thread-primitive.md)
- [ADR-0033: Scaffold Project Contract](./adr/0033-scaffold-project-contract.md)
- [ADR-0034: Code Change Lane Executor](./adr/0034-code-change-lane-executor.md)
- [ADR-0036: AgentBackend runTurn](./adr/0036-agent-backend-run-turn.md)

### Runtime And Release

- [AppConfig Authoring](../developer/app-config-authoring.md) / [中文](../developer/app-config-authoring.zh-CN.md)
- [Runtime Composition](../developer/runtime-composition.md) / [中文](../developer/runtime-composition.zh-CN.md)
- [Runtime / Data Governance](../developer/runtime-data-governance.md) / [中文](../developer/runtime-data-governance.zh-CN.md)
- [Release Rollout Authoring](../developer/release-rollout-authoring.md) / [中文](../developer/release-rollout-authoring.zh-CN.md)
- [ADR-0016: Dev/Prod Data Isolation](./adr/0016-dev-prod-data-isolation.md)
- [ADR-0017: Rollback Data Semantics](./adr/0017-rollback-data-semantics.md)

### Sharing, Forking, Extensions, And Credentials

- [Creation Host Contract](../developer/creation-host-contract.md) / [中文](../developer/creation-host-contract.zh-CN.md)
- [HostExtension Slots](../developer/host-extension-slots.md) / [中文](../developer/host-extension-slots.zh-CN.md)
- [Host Credential Broker Utilities](../developer/credential-broker.md) / [中文](../developer/credential-broker.zh-CN.md)
- [ADR-0031: Open-Ended Definition Artifact Boundary](./adr/0031-open-ended-definition-artifact-boundary.md)
- [ADR-0035: HostExtension Slot Contract](./adr/0035-host-extension-slot-contract.md)
- [ADR-0037: Host Credential Broker Utilities](./adr/0037-host-credential-broker-utilities.md)
- [M22 Snapshot](./milestone-22-snapshot.md) / [中文](./milestone-22-snapshot.zh-CN.md)
- [M23 Snapshot](./milestone-23-snapshot.md) / [中文](./milestone-23-snapshot.zh-CN.md)
- [M24 Snapshot](./milestone-24-snapshot.md) / [中文](./milestone-24-snapshot.zh-CN.md)

## Evidence Archive

Milestone snapshots are kept as evidence, not as the main reading path. Use them
when you need to verify how a claim was proven.

| Range | Evidence |
|---|---|
| **M1-M2** | Governed app-definition primitive and enterprise governance hardening. Start at [M1](./milestone-1-snapshot.md) / [M2](./milestone-2-snapshot.md). |
| **M3-M11** | Deployable substrate, Knowledge Inbox, Builder/Agent evolution, packaging, integrity, semantic index, and rollout. Start at [M3](./milestone-3-snapshot.md) and [M11](./milestone-11-snapshot.md). |
| **M12-M20** | Reference Creation Host, publish/rollback, generality pressure, security gate, open-ended boundary. Start at [M12](./milestone-12-snapshot.md), [M18](./milestone-18-snapshot.md), and [M20](./milestone-20-snapshot.md). |
| **M21-M25** | Developer onboarding, Authoring Kit, Sharing Governance, RC pressure, Alice prototype. Start at [M21](./milestone-21-snapshot.md) and [M25](./milestone-25-snapshot.md). |
| **M26-M38** | Post-RC stabilization: Code Change Lane, runtime diagnostics, HostExtension slots, AgentBackend `runTurn`, credential utilities, downstream adoption, Build Change Assurance, visible/durable assurance cases, approval-time review packets, recovery drill matrices, assurance adoption readiness, and package-consumption gating. Start at [M26](./milestone-26-snapshot.md), [M31](./milestone-31-snapshot.md), [M32](./milestone-32-snapshot.md), [M34](./milestone-34-snapshot.md), [M35](./milestone-35-snapshot.md), [M36](./milestone-36-snapshot.md), [M37](./milestone-37-snapshot.md), and [RC 0.2.0](./release-candidate-0.2.0-snapshot.md). |
| **M40-M44** | Minimum enterprise governance and runtime/data outcomes: production-readiness boundary, role/route evaluator, Build Assurance publish gate, reference enterprise demo, and post-approval runtime/data evidence. Start at [M40](./milestone-40-snapshot.md), [M41](./milestone-41-snapshot.md), [M42](./milestone-42-snapshot.md), [M43](./milestone-43-snapshot.md), [Runtime / Data Governance](../developer/runtime-data-governance.md), and [RC 0.3.0](./release-candidate-0.3.0-snapshot.md). |
| **M45** | First 0.4.0 implementation-framework slice: Host Kit, Reference Creation Host, Team Notes Board evolution, real opencode draft generation, optional Docker adapter, narrow open-ended artifact pressure, Preview Data Rehearsal, publish, rollback, post-review hardening, and three-pane workbench. Start at [M45](./milestone-45-snapshot.md) and [Host Kit](../developer/host-kit.md). |
| **M46** | Product Creation Host pressure: Dev Board Builder lets Bob create/publish/share, Charlie fork/evolve/publish, and End User write to the Published Application; real opencode builds two different boards. Start at [M46](./milestone-46-snapshot.md) and [Product Creation Host](../../examples/product-creation-host/README.md). |
| **M47** | Product Host close-out: Dev Board Builder surfaces Alice's Host boundary, Bob/Charlie lineage, version cards, rollback, controlled `src/board.json` / `src/runtime.json` source changes, owner-edit runtime behavior, and what should move framework-ward versus stay Host-owned. Start at [M47](./milestone-47-snapshot.md). |
| **M48** | Real Creation Host example: Workflow App Studio starts a cleaner product line with business workflow fields/stages/actions, controlled `src/app.ts` source changes, Codex app-server as the default real code-agent lane, opencode as alternate pressure evidence, Builder approval, preview/publish, share/fork, and runtime-proven legal-review / SLA-tracking changes. Start at [M48](./milestone-48-snapshot.md) and [Workflow App Studio](../../examples/workflow-app-studio/README.md). |
| **M49** | Agent Debug Loop turns one-shot code-agent drafts into budgeted pre-proposal attempts: failed checks feed the next attempt, proposal appears only after checks pass, and post-apply repair remains a new proposal. Start at [M49](./milestone-49-snapshot.md) and [Agent Debug Loop](../developer/agent-debug-loop.md). |
| **M50** | Workflow App Studio UX/lifecycle hardening makes the example teach the product model through interaction: Builder/App split, stateful lifecycle controls, progress/log inspection, preview/publish separation, and bilingual runtime labels. Start at [M50](./milestone-50-snapshot.md). |
| **M51** | Close-out review verifies the M49/M50 line with typecheck, combined tests, real Codex browser E2E, docs sync, and explicit residual risks / next-lane choices. Start at [M51](./milestone-51-snapshot.md). |
| **M52** | Production Generated App Profile stabilizes Alice's scaffold-first Bun/Hono/React/Drizzle/Zod/Neon product stack before the next Host workflow uses it. Start at [M52](./milestone-52-snapshot.md) and [Production Generated App Profile](../developer/production-generated-app-profile.md). |

All milestone snapshots follow the file pattern:

```text
docs/architecture/milestone-N-snapshot.md
docs/architecture/milestone-N-snapshot.zh-CN.md
```

## Process Archive Policy

Process plans and working notes under `docs/superpowers/plans/` are not
canonical architecture. They are useful for reconstructing implementation flow,
but first-read docs should link to them only when they are the only surviving
source of a still-current decision.

Durable conclusions should live in one of:

- an ADR;
- a domain/spec document;
- a release candidate snapshot;
- a milestone snapshot;
- a developer guide.

## Three-Minute Version

Pneuma is infrastructure for building **AI-native Creation Hosts**.

```text
Developer builds a Creation Host.
Builder uses the Host to create and evolve Generated Applications by talking to a Build-phase Agent.
End Users use the Published Application.
```

The current project claim is not "an agent can edit files." The claim is:

```text
App evolution can become a governed software primitive.
```

That is why the framework invests in Operation, definition-as-data, policy,
approval, BuildThread, Code Change Lane, Build Change Assurance, Enterprise Governance, Runtime / Data Governance, Host Kit, runtime diagnostics, rollout, credential
rebinding, and evidence. If Pneuma were only one hard-coded app, those primitives
would be unnecessary.

## Open Questions

Open questions live in [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md). Do not add new
architecture uncertainty silently; record it there or promote it into an ADR when
a decision is made.
