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
| A Developer building a Creation Host | [Start Here](../developer/start-here.md), then [Getting Started](../developer/getting-started.md), then [Creation Host Contract](../developer/creation-host-contract.md) |
| A teammate with zero Pneuma context | [Team Share Package](./team-share-demo.md) / [中文版](./team-share-demo.zh-CN.md) |
| A downstream Host implementer adopting RC contracts | [RC 0.1.1 upgrade](../developer/upgrading-to-rc-0.1.1.md), [RC 0.1.2 upgrade](../developer/upgrading-to-rc-0.1.2.md), [RC 0.1.3 upgrade](../developer/upgrading-to-rc-0.1.3.md), then the relevant contract guide |
| An architecture reviewer | [Creation Host Model](./spec/creation-host-model.md), [AI Build Assurance DDD Review](./spec/ai-build-assurance-domain-review.md), then ADRs and milestone evidence as needed |

## Current Canonical Entry Points

These are the long-lived docs to keep in sync first:

| Document | Purpose |
|---|---|
| [Developer Start Here](../developer/start-here.md) / [中文](../developer/start-here.zh-CN.md) | Five-image outside-in entry for Developers building Creation Hosts. |
| [Team Share Package](./team-share-demo.md) / [中文](./team-share-demo.zh-CN.md) | Zero-context team explanation from project goal to AI Build Assurance. |
| [Creation Host Model](./spec/creation-host-model.md) / [中文](./spec/creation-host-model.zh-CN.md) | Top-level product/domain boundary: Framework -> Creation Host -> Generated Application -> Published Application. |
| [AI Build Assurance DDD Review](./spec/ai-build-assurance-domain-review.md) / [中文](./spec/ai-build-assurance-domain-review.zh-CN.md) | Current DDD anchor for Builder + Build Agent engineering control. |
| [Release Candidate Snapshot](./release-candidate-snapshot.md) / [中文](./release-candidate-snapshot.zh-CN.md) | Why `pneuma-rc-0.1.0` was accepted. |
| [RC 0.1.1 Snapshot](./release-candidate-0.1.1-snapshot.md) / [中文](./release-candidate-0.1.1-snapshot.zh-CN.md) | Developer-contract polish from external DevBoard pressure. |
| [RC 0.1.3 Snapshot](./release-candidate-0.1.3-snapshot.md) / [中文](./release-candidate-0.1.3-snapshot.zh-CN.md) | Minimal executable Code Change Lane release patch. |

M26-M31 are post-RC stabilization evidence, not a new release tag. They are
valuable when adopting a specific contract, but they should not be treated as
mandatory first-read material.

## Topic Clusters

### Product And Domain Model

- [Creation Host Model](./spec/creation-host-model.md) / [中文](./spec/creation-host-model.zh-CN.md)
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
- [ADR-0032: BuildThread Primitive](./adr/0032-build-thread-primitive.md)
- [ADR-0033: Scaffold Project Contract](./adr/0033-scaffold-project-contract.md)
- [ADR-0034: Code Change Lane Executor](./adr/0034-code-change-lane-executor.md)
- [ADR-0036: AgentBackend runTurn](./adr/0036-agent-backend-run-turn.md)

### Runtime And Release

- [AppConfig Authoring](../developer/app-config-authoring.md) / [中文](../developer/app-config-authoring.zh-CN.md)
- [Runtime Composition](../developer/runtime-composition.md) / [中文](../developer/runtime-composition.zh-CN.md)
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
| **M26-M31** | Post-RC stabilization: Code Change Lane, runtime diagnostics, HostExtension slots, AgentBackend `runTurn`, credential utilities, downstream adoption. Start at [M26](./milestone-26-snapshot.md) and [M31](./milestone-31-snapshot.md). |

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
approval, BuildThread, Code Change Lane, runtime diagnostics, rollout, credential
rebinding, and evidence. If Pneuma were only one hard-coded app, those primitives
would be unnecessary.

## Open Questions

Open questions live in [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md). Do not add new
architecture uncertainty silently; record it there or promote it into an ADR when
a decision is made.
