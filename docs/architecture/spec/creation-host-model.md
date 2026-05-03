# Creation Host Model

**Status:** Top-level domain alignment after M11  
**Last updated:** 2026-05-03  
**Audience:** developers and teammates who need to understand what Pneuma is ultimately for before reading aggregate-level details  
**Chinese version:** [Creation Host Model zh-CN](./creation-host-model.zh-CN.md)

## 0. Purpose

M1-M11 proved many app-domain primitives: governed app definitions, enterprise approval evidence, real persistence, a reference app, real backend-agent evolution, release candidates, semantic retrieval, and rollout state.

Those milestones also exposed a terminology risk: **"pneuma app" can be misunderstood as a single app that a developer writes directly.** If that were the whole goal, many Pneuma primitives would be unnecessary.

The top-level goal is more specific:

> pneuma-framework supports **Creation Hosts**: product surfaces where a Builder creates, inspects, evolves, previews, publishes, and monitors generated applications through framework primitives and agents.

A reference demo may implement a Creation Host as a Bun TypeScript web app with version directories and local processes. That is an implementation choice, not the domain model.

## 1. Core Vocabulary

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
| **Build Transcript** | Durable evidence of the Builder request, agent proposal, approval, tool calls, framework events, and resulting app changes. |

## 2. Role Map

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

## 3. Bounded Context Map

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
- creation sessions and build transcripts;
- preview process/session state;
- schema/data/log/config inspection;
- application versions;
- publish, monitor, restart, and rollback controls.

These concepts do not automatically become `core-domain` aggregate roots. They become framework core contracts only when multiple Creation Hosts need the same semantics.

### Published Runtime Context

Published runtime is the End User-facing process/surface for a selected Application Version. M11 proved the first rollout state primitive (`active`, `candidate`, `previous`) but not production traffic switching.

## 4. Creation Flow

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

## 5. Where Existing Primitives Fit

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

## 6. Stack Profiles Are Choice Boundaries

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

## 7. Reference Implementation vs Domain Model

The next reference Creation Host may use:

```text
Bun TypeScript
local process management
role/user_id demo inputs
version directories v0/v1/v2
no Docker dependency
no real authentication
```

Those are useful constraints for a demo and RC pressure test. They are not top-level domain requirements.

The domain model should only require:

- the host can create a generated app;
- the host can track app versions;
- the host can run preview sessions;
- the host can expose inspection surfaces;
- the host can publish a version;
- the host can monitor, restart, and rollback a published version;
- the generated app still uses framework primitives for data, operations, policy, and governance.

## 8. Implications For RC Planning

The next milestone path should target a **reference Creation Host**, not just another app template.

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

This path tests whether Pneuma's abstractions are complete enough for real app creation. It avoids two failure modes:

- building a generic app framework that does not need Pneuma's domain model;
- endlessly generalizing adapters, databases, deployment targets, and vector stores before a Creation Host can be used.
