# Creation Host Model

**Status:** Top-level domain alignment accepted during M17; amended through M44 and [Global Alignment Review 0.3](./global-alignment-review-0.3.md)
**Last updated:** 2026-05-14
**Audience:** developers and teammates who need to understand what Pneuma is ultimately for before reading aggregate-level details
**Chinese version:** [Creation Host Model zh-CN](./creation-host-model.zh-CN.md)

## 0. Purpose

M1-M25 proved the end-to-end Creation Host model: governed app definitions, enterprise approval evidence, real persistence, reference apps, real backend-agent evolution, release candidates, semantic retrieval, rollout state, integrated Creation Host workflow, open-ended app pressure, authoring/sharing governance contracts, and the Alice/Bob/Charlie/Dave Developer story.

M26-M38 then stabilized the post-RC developer contract: Code Change Lane, Runtime Diagnostic Surface, HostExtension slots, AgentBackend `runTurn` on top of BuildThread, credential utilities, downstream adoption, and Build Assurance.

M40-M44 added the first minimum enterprise-governance and runtime/data outcome boundary: production-readiness scope, role-based governance routing, publish-readiness gating, the M43 enterprise demo, and Runtime / Data Governance. These additions do not change the four-layer model. They extend the governed Builder + Agent control loop beyond approval into publish and runtime/data evidence.

Those milestones also exposed a terminology risk: **"pneuma app" can be misunderstood as a single app that a developer writes directly.** If that were the whole goal, many Pneuma primitives would be unnecessary.

The top-level goal is more specific:

> pneuma-framework supports **Creation Hosts**: product surfaces where a Builder creates, inspects, evolves, previews, publishes, and monitors generated applications through framework primitives and agents.

A reference demo may implement a Creation Host as a Bun TypeScript web app with version directories and local processes. That is an implementation choice, not the domain model.

M17 accepts this model as the top-level project boundary:

- **ADR-0029 is accepted.** Operation + definition-as-data is the framework's core primitive. Lifecycle scripts remain a runtime subsystem, not the primary mental model.
- **The four artifacts are accepted.** Framework, Creation Host, Generated Application, and Published Application are distinct design objects.
- **Creation Host contracts may exist in framework core.** The framework can define minimal shared contracts for profiles, projects, versions, preview sessions, and rollout state. Concrete workbench UX, session registry, marketplace, and product policy remain host/meta-app concerns.
- **Open-ended app pressure is accepted, but scoped.** M18/M20 proved Host-governed open-ended artifacts without promoting arbitrary UI/module artifacts into framework definition rows.
- **Concrete domain integrations are not core semantics.** Linear, OpenRouter, Qdrant, Docker, SQLite, Bun, and similar implementations can exist as reference integrations or profile candidates, but the framework primitive story must not depend on them.

## 1. Zero-Knowledge Visual Primer

This section is the fastest way to build the first mental model. The later sections define the same concepts more precisely.

### 1.1 The whole story in one picture

![Pneuma Creation Stack](./images/creation-host-stack.png)

Read it from left to right:

```text
Developer builds the Creation Host.
Builder uses the Creation Host to create a Generated Application.
End User uses a Published Application version.
```

This is the key correction: **the framework is not the app, and the Creation Host is not the generated app.**

### 1.2 What the Builder actually sees

![Inside the Creation Host](./images/creation-host-workbench.png)

The Builder should not be trapped in blind chat. The Creation Host is the place where conversation, preview, inspection, release, and evidence meet.

### 1.3 What changes when the Builder asks for a feature

![One Feature Request, One Governed Change](./images/creation-host-governed-change.png)

This is why Operation, Policy, approval evidence, rollback, release state, and transcript evidence are not isolated features. They are the control plane for safely creating and evolving applications through an agent.

## 2. Core Vocabulary

```mermaid
flowchart LR
  Developer["Developer"] --> CH["Creation Host"]
  CH --> Builder["Builder"]
  Builder --> GA["Generated Application"]
  GA --> PA["Published Application"]
  User["End User"] --> PA

  subgraph Framework["pneuma-framework"]
    P["Primitives<br/>Table / Row / Operation / View / Policy"]
    T["Semantic tools<br/>definition.apply / release.* / lifecycle.*"]
    W["Wire + Agent loop"]
  end

  Framework --> CH
  Framework --> GA
```

| Term | Meaning |
|---|---|
| **pneuma-framework** | The library/runtime providing primitives, semantic tools, wire protocol, agent backend abstraction, process supervision, and governance machinery. |
| **Creation Host** | A product surface built with the framework. It lets a Builder create and evolve Generated Applications. It may be a personal app builder, SaaS self-service builder, enterprise internal builder, or Pneuma 3.0 itself. |
| **Generated Application** | The app created through a Creation Host. It has an app definition, data, runtime surface, and versions. |
| **Application Version** | A restorable, previewable, and publishable version of a Generated Application. A reference host may store versions as `v0/v1/v2` directories, but the version-directory layout is not the domain model. |
| **Published Application** | A particular Application Version currently exposed to End Users. |
| **Stack Profile** | A Creation Host-declared capability/implementation choice set: persistence, semantic index backend, runtime, viewer SDK, rollout adapter, and agent backend. Profiles are selected at development time or creation time, not freely migrated at runtime by default. |
| **Creation Session** | The Builder-facing session where natural language, approval prompts, preview state, schema/data inspection, and agent activity come together. |
| **BuildThread** | Framework-owned semantic transcript for Builder request, agent proposal, Builder decision, host/framework execution receipt, and resulting app changes. Backend-native sessions are cache/optimization, not source of truth. |

## 3. Role Map

The same person may occupy multiple roles in a solo scenario, but the model stays separate:

| Role | Uses | Creates / Changes | Main Concern |
|---|---|---|---|
| **Developer** | pneuma-framework | Creation Host | Defines the builder product, allowed profiles, domain constraints, runtime choices, and host UX. |
| **Builder** | Creation Host | Generated Application versions | Shapes app behavior and UI through natural language, preview, inspection, approval, and publish actions. |
| **End User** | Published Application | App data through normal app operations | Uses the generated app. May never see the Build-phase Agent. |

The important correction:

```text
Developer does not merely "write a pneuma app".
Developer builds or configures a Creation Host.
Builder uses that host to create Generated Applications.
End User uses a Published Application.
```

## 4. Bounded Context Map

```mermaid
flowchart TB
  subgraph Core["Framework Core Context"]
    CorePrims["Primitives<br/>Table / Row / Operation / View / Policy / Event"]
    CoreTools["Semantic Tools<br/>definition.* / lifecycle.* / release.*"]
    CoreAgent["Agent Backend + Wire Protocol"]
  end

  subgraph Host["Creation Host Context"]
    Project["Generated App Identity"]
    Profile["Stack Profile"]
    Session["Creation Session"]
    Preview["Preview Session"]
    Inspect["Inspection Surfaces<br/>schema / data / logs / config"]
    Publish["Publish + Monitor Controls"]
  end

  subgraph App["Generated Application Context"]
    Definition["App Definition<br/>system-owned definition tables"]
    Data["Application Data<br/>business tables and rows"]
    Derived["Derived Infrastructure<br/>semantic index / caches"]
    Versions["Application Versions"]
  end

  subgraph Runtime["Published Runtime Context"]
    Active["Active Release Pointer"]
    Process["Runtime Process"]
    UserSurface["End-user App Surface"]
  end

  Core --> Host
  Core --> App
  Host --> App
  Host --> Runtime
  App --> Runtime
```

### Generated Application Bounded Context

The aggregate-level domain model in [domain-model.md](./domain-model.md) primarily describes this context:

```text
Table / Row / Operation / Transform / Adapter / PolicySet / EventStream / IdentityRegistry
```

Those primitives belong to the Generated Application's definition and runtime behavior.

### Creation Host Context

A Creation Host usually manages:

- generated app identity;
- stack profile selection;
- creation sessions and BuildThreads;
- preview process/session state;
- schema/data/log/config inspection;
- application versions;
- publish, monitor, restart, and rollback controls.

These concepts do not automatically become `core-domain` aggregate roots. They become framework core contracts only when multiple Creation Hosts need the same semantics.

### Published Runtime Context

Published runtime is the End User-facing process/surface for a selected Application Version. M11 proved the first rollout state primitive (`active`, `candidate`, `previous`) but not production traffic switching.

## 5. Creation Flow

```mermaid
sequenceDiagram
  participant Dev as Developer
  participant Host as Creation Host
  participant Builder as Builder
  participant Agent as Build-phase Agent
  participant App as Generated Application
  participant User as End User

  Dev->>Host: configure profiles and host capabilities
  Builder->>Host: create app project
  Host->>Builder: present stack/profile choices
  Builder->>Agent: describe desired app
  Agent->>Host: call framework semantic tools
  Host->>App: apply governed definition changes
  Builder->>Host: preview / inspect schema / inspect data
  Builder->>Host: publish version
  Host->>App: mark published release
  User->>App: use published app
  Builder->>Host: monitor / restart / rollback when needed
```

The Builder should not be forced into blind chat. A useful Creation Host gives the Builder at least four surfaces:

| Surface | Purpose |
|---|---|
| **Conversation** | Builder intent, agent proposal, approval prompts, execution feedback. |
| **Preview** | Running app behavior as the End User would experience it. |
| **Inspection** | Schema, data, operations, views, policy, logs, framework events. |
| **Release Controls** | Publish, health, restart, rollback, and release history. |

## 6. Where Existing Primitives Fit

```mermaid
flowchart LR
  subgraph Host["Creation Host"]
    NL["Natural language build loop"]
    Preview["Preview / Inspect / Publish"]
    Profile["Stack Profile"]
  end

  subgraph Definition["Generated App Definition"]
    Tables["pneuma_tables"]
    Columns["pneuma_table_columns"]
    Ops["pneuma_operations"]
    Views["pneuma_views"]
    Policies["pneuma_policy_rules"]
  end

  subgraph Runtime["Generated App Runtime"]
    Data["Business rows"]
    API["Operation API"]
    UI["Viewer surface"]
    Release["Release rollout state"]
  end

  NL --> Ops
  Profile --> Definition
  Preview --> UI
  Definition --> Runtime
  API --> Data
  Release --> Runtime
```

Existing primitives remain valuable precisely because the Creation Host must safely generate and evolve applications:

| Primitive / Subsystem | Creation Host relevance |
|---|---|
| **Operation** | The shared action contract for UI, Agent, and public API. |
| **Definition-as-data** | Lets Builder/Agent evolve app structure through governed changes, not file edits. |
| **PolicySet / PermissionContext** | Lets generated apps express role/user-aware behavior, even in simple demos with typed `role` and `user_id`. |
| **View** | Lets the host and generated app expose app state without custom UI every time. |
| **Semantic tools** | Keep agents operating on framework state rather than scripts or Docker commands. |
| **ReleaseRolloutState** | Lets the Creation Host reason about active/candidate/previous published versions. |
| **SemanticIndexStore** | An optional generated-app derived capability selected by profile, not a universal runtime migration target. |
| **BuildThread** | Makes Builder conversation, proposal, decision, and receipt inspectable and portable across backend adapters. |
| **Code Change Lane** | Lets a Host turn draft source changes into proposal evidence, approval, guarded apply, rollback, and BuildThread receipt. |
| **Runtime Diagnostic Surface** | Makes runtime mode, boot options, route fallback, readiness, and health evidence predictable for Hosts. |
| **Runtime / Data Governance** | Makes runtime/data intent, generation, observation, data evolution receipt, and control receipt explainable after approval. |
| **HostExtension Slot Contract** | Gives Host-owned open-ended contribution bundles a portable distribution boundary without making them framework definition rows. |
| **AgentBackend.runTurn** | Gives backend adapters a BuildThread-backed turn contract while keeping backend-native sessions as cache. |

## 7. Stack Profiles Are Choice Boundaries

Stack Profiles prevent infinite generalization.

They should express candidate choices such as:

```text
persistence: sqlite | postgres
semantic_index: none | sqlite-local | qdrant
runtime: bun-ts | python
viewer: react | vanilla
rollout: local-process | local-docker | cloud
agent_backend: opencode | codex | claude
```

But an early Creation Host does not need to implement every candidate. It needs to make the choice boundary explicit.

Default leaning:

```text
Profile choice is fixed at development time or generated-app creation time.
Runtime migration between profiles is not supported unless a future host explicitly owns that migration.
```

This means Qdrant, Postgres, Python, or cloud deployment are future profile candidates. They are not required before the framework can reach a credible release candidate.

## 8. Reference Implementation vs Domain Model

Reference Creation Hosts so far may use:

```text
Bun TypeScript
local process management
role/user_id demo inputs
version directories v0/v1/v2
no Docker dependency
no real authentication
```

Those are useful constraints for demos and RC pressure tests. They are not top-level domain requirements.

The domain model should only require:

- the host can create a generated app;
- the host can track app versions;
- the host can run preview sessions;
- the host can expose inspection surfaces;
- the host can publish a version;
- the host can monitor, restart, and rollback a published version;
- the generated app still uses framework primitives for data, operations, policy, and governance.

## 9. Implications For The Next Implementation Phase

The RC path targeted a **reference Creation Host**, not just another app template. After M44, the next phase should become a real implementation-framework phase: fewer isolated contracts, more end-to-end Host/runtime loops using the contracts together.

Healthy RC pressure:

```text
Developer configures a Creation Host
  -> Builder creates a Generated Application
  -> Builder previews and inspects it
  -> Builder evolves it through an agent
  -> Builder publishes it
  -> End User uses the Published Application
  -> Builder can monitor, restart, and rollback
```

This path tests whether Pneuma's abstractions remain complete enough for real app creation. It avoids two failure modes:

- building a generic app framework that does not need Pneuma's domain model;
- endlessly generalizing adapters, databases, deployment targets, and vector stores before a Creation Host can be used.

Future implementation work should keep asking:

```text
Does this help a Developer build a better Creation Host?
Does it preserve the Framework -> Host -> Generated App -> Published App boundary?
Does it have enough cross-Host evidence to belong in framework core?
```

The strongest next validation is no longer "can we name the missing contract?" It is:

```text
Can a Developer use the framework to build a real Creation Host where provider-backed data,
runtime operations, enterprise review, Build Assurance, and Builder-facing UX work as one system?
```
