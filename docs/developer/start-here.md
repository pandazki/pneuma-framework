# Start Here: Build A Creation Host

**Audience:** Developers evaluating or building on `pneuma-framework`
**Status:** RC accepted. Latest enterprise-governance release train is prepared as `pneuma-rc-0.3.0`; M45 closes the first 0.4.0 implementation-framework slice with `@pneuma-framework/host-kit`; M46 proves Host Kit can support a product-shaped Creation Host; M47 expands that Host with visible Alice/Bob/Charlie boundaries, version lineage, rollback, and richer Published Application interactions.
**Chinese version:** [start-here.zh-CN.md](./start-here.zh-CN.md)

This is the first document to read if you are approaching Pneuma from the outside.

The shortest accurate description is:

> `pneuma-framework` is infrastructure for building **AI-native Creation Hosts**. A Creation Host lets a Builder create, inspect, evolve, publish, and operate Generated Applications by talking to a Build-phase Agent.

This means you are not just building one app. You are building the product surface where other apps can be created.

## 1. What Product Layer Am I Building?

![Four-layer product model](./assets/start-here-01-product-model.png)

Keep this model explicit:

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

The framework is the primitive layer. The Creation Host is your Builder-facing product. A Generated Application is the app produced inside that Host. A Published Application is the active version opened by End Users.

Most design mistakes come from compressing these four things into "the app." When a document says "pneuma app," clarify whether it means the Host, the generated app, or the published release.

## 2. What Does A Creation Host Own?

![Developer responsibility map](./assets/start-here-02-developer-responsibility.png)

As a Developer, your main job is to construct a Creation Host with clear boundaries:

- which profiles and stacks Builders can choose;
- which Build-phase Agent package and semantic tools the Host provides;
- which source boundaries and guardrails the Agent must respect;
- how preview, inspection, publish, restart, and rollback work;
- which provider capabilities are supported and how parity is proven;
- how credentials, sharing, forking, and rebinding are governed.

The framework validates shared contracts, but it should not absorb your product-specific Host UX, provider implementation, deployment choice, or domain template logic.

## 3. How Does One Builder Intent Become A Governed Change?

![Governed Builder intent loop](./assets/start-here-03-builder-loop.png)

A Builder works inside your Creation Host:

```text
Builder intent
  -> BuildThread turn
  -> Agent proposal
  -> impact / diff / evidence disclosure
  -> Builder approval or rejection
  -> framework or Host execution lane
  -> execution receipt
  -> preview, publish, restart, rollback, and inspection evidence
```

The important primitive is not "Agent edits files." The important primitive is that user intent, agent proposal, approval, execution, evidence, and recovery can be traced through one governed path.

That is the difference between an AI coding demo and an AI-native creation framework.

## 4. Which Contracts Keep The Loop Safe?

![Framework contract stack](./assets/start-here-04-contract-stack.png)

Pneuma is intentionally opinionated about contracts that many Creation Hosts need:

- **Operation + definition-as-data** for governed app evolution.
- **Authorization Kernel, approval tokens, permission ledger, and app history** for authority separation.
- **BuildThread** for semantic Builder conversation, proposal, decision, and execution receipt turns.
- **Scaffold Project + Code Change Lane** for governed draft source changes.
- **Build Change Assurance** for risk classification, readiness, blocking reasons, evidence references, and durable Host-side cases.
- **Enterprise Governance** for role-based review routing before publish readiness.
- **Runtime Diagnostic Surface** for predictable Host/runtime composition.
- **Runtime / Data Governance** for post-approval runtime/data intent, observation, generation, control receipts, and data evolution evidence.
- **Creation Host Implementation Kit** for reusable Host assembly across approval, code-change, preview data rehearsal, publish, and rollback.
- **Release Rollout State** for candidate, active, previous, restart, and rollback evidence.
- **HostExtension Slots** for portable Host-owned open-ended contributions.
- **Host Credential Broker utilities** for session cookies, OAuth state, callback binding, credential refs, and no-secret rebinding evidence.
- **Build Agent Package, provider matrix, share artifact, sharing governance, and credential rebinding contracts** for portable sharing and fork/install governance.

The goal is not maximum abstraction. The goal is that a Developer can build a real Host without reinventing the agent loop, governance path, preview/publish loop, and portability checks.

## 5. What Is Proved, And What Comes Next?

![Post-RC evidence and assurance map](./assets/start-here-05-assurance-map.png)

The current evidence chain is easier to read as bands, not as a milestone list:

| Band | What it proved |
|---|---|
| **M1-M11** | Core primitives can govern app definition, permissions, approval, recovery, deployment substrate, semantic index, and rollout state. |
| **M12-M20** | A Creation Host can create, preview, inspect, evolve, approve, publish, restart, roll back, and carry a non-table-first open-ended app without collapsing framework boundaries. |
| **M21-M25** | Developer onboarding, Authoring Kit, Sharing Governance, RC pressure, and Alice/Bob/Charlie/Dave made the RC story explainable and testable. |
| **M26-M38** | Code Change Lane, runtime diagnostics, HostExtension slots, AgentBackend `runTurn`, credential utilities, downstream adoption, visible/durable Build Change Assurance, approval-time review packets, recovery drill matrices, downstream adoption guidance, and package-consumption gating stabilized the post-RC developer contract. |
| **M40-M44** | Production-readiness boundary, enterprise governance roles/routes, Build Assurance publish gating, the M43 enterprise demo, and Runtime / Data Governance made the minimum enterprise governance loop extend through post-approval runtime/data outcomes. |
| **M45** | Host Kit and the new Reference Creation Host turn the stabilized contracts into a reusable implementation layer and a runnable three-pane workbench; M45.1 adds real opencode draft generation, optional Docker adapter smoke, and narrow open-ended artifact pressure. |
| **M46-M47** | Product Creation Host turns Host Kit into Dev Board Builder: Bob creates/publishes/shares/rolls back a board, Charlie forks/evolves/publishes a second board, End User writes to the Published Application, and the UI makes Alice's Host boundary and version lineage visible. |

The current post-RC assurance primitive is **Build Change Assurance**:

```text
When a Builder asks an Agent to change an app,
what was proposed,
what evidence was shown,
who approved it,
what changed,
what failed,
and how can the Host recover?
```

This keeps the project anchored on enterprise-grade engineering control for Builder + Build Agent workflows, not generic marketplace artifact trust.

The current 0.3.0 governance primitive is **Enterprise Governance**:

```text
When an AI-assisted business change is ready to publish,
which human role must review it,
who actually approved or denied,
and did Build Assurance fail closed until that decision was satisfied?
```

The current runtime/data extension is **Runtime / Data Governance**:

```text
After an approved change touches runtime or provider data,
what state was intended,
what generation was current,
what was observed,
which control action ran,
and which data evolution receipt proves migration, carry-forward, snapshot, or restore?
```

## Read Next

Pick the lane that matches what you are doing.

| Lane | Read |
|---|---|
| **Build a Host** | [Getting Started](./getting-started.md), [Creation Host Contract](./creation-host-contract.md), [Creation Host Implementation Kit](./host-kit.md), then compare the compact [Reference Host](../../examples/reference-creation-host/README.md) with the product-shaped [Product Creation Host](../../examples/product-creation-host/README.md). |
| **Validate from scratch** | [Downstream Validation Brief](./downstream-validation-brief.md), then follow its required reading order and gap-log template. |
| **Add governed creation** | [BuildThread](./build-thread.md), [Scaffold Project Contract](./scaffold-project-contract.md), [Code Change Lane](./code-change-lane.md), [Build Change Assurance](./build-assurance.md), [Build Assurance Adoption](./build-assurance-adoption.md), then [Enterprise Governance](./enterprise-governance.md). |
| **Compose runtime and release** | [AppConfig Authoring](./app-config-authoring.md), [Runtime Composition](./runtime-composition.md), [Runtime / Data Governance](./runtime-data-governance.md), [Release Rollout Authoring](./release-rollout-authoring.md), and [Host Kit](./host-kit.md). |
| **Adopt post-RC utilities** | [HostExtension Slots](./host-extension-slots.md), [Host Credential Broker Utilities](./credential-broker.md), and the upgrade guides: [0.1.1](./upgrading-to-rc-0.1.1.md), [0.1.2](./upgrading-to-rc-0.1.2.md), [0.1.3](./upgrading-to-rc-0.1.3.md), [0.2.0](./upgrading-to-rc-0.2.0.md). |
| **Review enterprise boundary** | [Global Alignment Review 0.3](../architecture/spec/global-alignment-review-0.3.md), [Production Readiness Boundary](../architecture/spec/production-readiness-boundary.md), [Enterprise Governance Domain Review](../architecture/spec/enterprise-governance-domain-review.md), [Runtime / Data Governance](./runtime-data-governance.md), [M43 Demo](../../examples/m43-enterprise-governance-demo/README.md), and [RC 0.3.0 Snapshot](../architecture/release-candidate-0.3.0-snapshot.md). |

When you need deeper reasoning, use the [Architecture Index](../architecture/README.md). Milestone snapshots and ADRs are preserved there as evidence and decision history; they are not the first reading path.

## What This RC Does Not Claim

This RC is not a production SaaS platform. It does not include hosted identity, production credential storage, marketplace transport, broad cloud deployment adapters, a Runtime Agent product surface, hot reload, or a full Pneuma 2.x rebuild. M30/M31 add and validate local/reference Host credential utilities; M32-M37 add and package Build Assurance for downstream adoption; M38 adds package-consumption gating for a fresh downstream project; M40-M43 add the minimum enterprise governance vocabulary and demo; M44 adds the first post-approval runtime/data evidence contract; M45 adds the first implementation-framework Host Kit; M46/M47 prove and expand Host Kit in a product-shaped Creation Host. None of these lanes turns the framework into a hosted credential service, workflow engine, provider adapter, or compliance backend.

It does claim that the core model is coherent enough for Developers to build Creation Hosts and pressure-test real product shapes against framework contracts.
