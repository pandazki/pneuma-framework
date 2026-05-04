# pneuma-framework

## What this project is

`pneuma-framework` is infrastructure for building **AI-native creation tools** — Creation Hosts where a Builder creates, inspects, evolves, previews, publishes, and monitors Generated Applications by **talking to an agent** rather than (only) clicking and coding.

The framework is a library / runtime that a **Developer** uses to construct a **Creation Host**. The Creation Host is the Builder-facing product surface. Through it, a **Builder** creates one or more **Generated Applications** whose behavior, UI, data model, versions, and published releases are co-created in-session through dialogue with a **Build-phase Agent**.

Analogy: **pneuma-framework : React :: Creation Host : app-builder product :: Generated Application : app produced by that builder**. The framework is the primitive; Creation Hosts and their generated apps are the products.

This repo was brainstormed out of [`pneuma-skills`](file:///Users/pandazki/Codes/pneuma-skills) (Pneuma 2.x). That project ships 10 domain modes (webcraft, gridboard, doc, slide, …) built into one monolithic runtime. In Pneuma 3.0, `pneuma-skills` is expected to become a **reference Creation Host** on top of `pneuma-framework`; each existing mode can become a host profile, template, or generated-app capability. If that rebuilding is clean, the framework's design is validated.

## Vision in one sentence

> Let anyone — from a solo individual building a personal pomodoro, to a SaaS team offering dashboard self-service to their users — ship an application where **the user creates the application by talking**, without that team having to reinvent the agent-loop, workspace, checkpoint, preview, and deploy plumbing.

## Non-negotiable top-level boundary

Keep this model explicit in every plan, implementation, and review:

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

This is the first-page mental model:

- **pneuma-framework** provides primitives, semantic tools, governance, and the agent loop.
- **Creation Host** is the Builder-facing product surface: conversation, preview, inspection, publish controls.
- **Generated Application** owns definition, data, versions, and build transcript.
- **Published Application** is the active release opened by End Users.

Role boundary:

```text
Developer builds or configures the Creation Host.
Builder uses the Creation Host to create and evolve Generated Applications.
End User uses a Published Application version.
```

Do not collapse this back into "Developer writes a pneuma app" or "pneuma app equals the framework." If a task uses the phrase "pneuma app", clarify whether it means Creation Host, Generated Application, or Published Application before designing the work.

## Terminology

### Three populations (can collapse into one person)

| Role | Description |
|---|---|
| **Developer** | The person building on `pneuma-framework`. Builds or configures a **Creation Host**, decides which stack profiles and domain constraints the host exposes, and injects domain knowledge. |
| **Builder** | The person using a Creation Host to **create and evolve a Generated Application** by chatting with the Build-phase Agent, previewing, inspecting schema/data, and publishing versions. Could be a cloud-platform customer, an enterprise user, or the developer themselves. |
| **End User** | The person consuming the Published Application. May or may not be the same as the Builder. May or may not see any agent at all. |

In solo scenarios (e.g. an individual developer making their own tomato-clock) all three collapse into one person. In enterprise SaaS scenarios they're often three different constituencies.

### Two agents (orthogonal lifetimes)

| Agent | Role |
|---|---|
| **Build-phase Agent** | Present during construction. Talks to the Builder inside a Creation Host to shape a Generated Application. The framework always provides this. |
| **Runtime Agent** | Optional. Whether the Published Application embeds its own agent for End Users is decided by the Creation Host / profile / Builder. |

### Four artifacts

| Artifact | What it is |
|---|---|
| **pneuma-framework** | This repo. The library/runtime. |
| **Creation Host** | The Builder-facing product built with the framework. It owns project creation, stack profile selection, preview, inspection, publish, monitor, and rollback surfaces. |
| **Generated Application** | The app created through a Creation Host. It owns app definition, data, runtime surface, application versions, and release history. |
| **Published Application** | A published version of a Generated Application that End Users can open and use. |

### Two modes

- **Creation / Preview mode** — construction-in-progress inside a Creation Host. Build-phase Agent attached. Preview, schema/data inspection, and debug surfaces active.
- **Published / Release mode** — a selected Generated Application version exposed to End Users. Whether a Runtime Agent ships inside is a Creation Host / profile decision.

## Core design principles

1. **Host/profile self-containment.** The Creation Host owns which stack profiles it exposes (frontend framework, backend presence, persistence choice, deployment target, semantic index option, injection mechanism for UI / API / skill / hooks). Framework does not prescribe every implementation.

2. **Lifecycle contract.** The framework defines standardized lifecycle **verbs** (`setup` / `dev` / `stop` / `build` / `deploy` / `migrate` / `fork`). Existing templates implement these with `.sh` scripts; future Creation Hosts may wrap them with Bun process management or other host-owned adapters. The framework invokes semantic lifecycle tools, streams, observes exit, and reports.

3. **Agent operates on framework state via semantic tools — never on scripts directly.** The framework exposes a semantic tool API (`lifecycle.dev.start`, `lifecycle.state`, `release.promote`, `definition.apply`, …). Scripts and local process details are implementation details. This means Creation Hosts can swap lifecycle implementations without breaking Build-phase Agent skills.

4. **Two-axis Agent interop.**
   - **Axis 1 — Viewer:** bidirectional wire protocol. Builder → Agent carries *focus* (what the Builder is looking at / has selected) + *action* (what they did or said). Agent → Builder carries text streams, viewer execution requests, and permission prompts. Two built-in SDKs (React, Vanilla JS) sit on top; the wire protocol stays open for any stack.
   - **Axis 2 — Framework:** semantic lifecycle tool API (see principle 3).

5. **Pluggable agent backend.** `AgentBackend` is abstracted over Claude Code, Codex, and future backends. Creation Hosts / profiles can declare a supported backend set.

6. **Construction hygiene is framework concern.** Shadow-git checkpoints, per-turn snapshots, and time-travel replay are first-class in the framework — not per-template reinventions.

## Scope

### In scope (framework owns)

1. Lifecycle verb set + script protocol (env vars, stdout markers, exit code convention, artifact-dir convention, `build.manifest.json`)
2. Program-level process management (process groups, log streaming, crash observation, on-demand restart)
3. Semantic tool API surface for Build-phase Agent
4. Framework-state observation endpoint
5. Build-preview loop (focus / action wire protocol + React / Vanilla SDKs + extension point for others)
6. `AgentBackend` abstraction (reused from 2.x)
7. Shadow-git / checkpoint / replay machinery
8. Creation Host / profile contract (manifest schema declaring lifecycle, viewer, assets, runtime-agent config, supported backends, and generated-app capabilities)

### Out of scope (each host / meta-app's concern)

- Launcher / mode marketplace beyond one Creation Host — a **meta-app** built on the framework
- User preferences that span Creation Hosts or Generated Applications
- Artifact sharing / snapshot push-pull / publishing
- Specific deployment targets (Vercel / CF Pages / Docker registry / App Store)
- Specific persistence backends (SQLite, Postgres, R2, filesystem)
- UI tech stack selection
- Plugin marketplace

If and when these are needed, they live in a meta-app (e.g. a reborn `pneuma-skills` on top of `pneuma-framework`), not in the framework.

## Status

- **Phase:** Post-M16 integration gate — Reference Creation Host create/preview/inspect/evolve/approve/publish/restart/rollback is closed; next is M17 release-candidate review.
- **Origin:** brainstormed out of `pneuma-skills` (Pneuma 2.x).
- **Next step:** perform release-candidate review: full test sweep, fresh clone / getting-started check, docs navigation check, example health check, and decide whether to tag a candidate release.

> Note: the original v0 design spec (lifecycle-script-centric framework view) has been superseded — see [ADR-0029](docs/architecture/adr/0029-supersede-v0-design-spec.md). The shell lifecycle contract still exists as a runtime **subsystem**, but the framework's core primitive is now the Operation + definition-as-data model proved in M1.

## Starting a new session here

If you are Codex opening this repo for the first time in a session, read in this order, then stop and wait for user instruction:

1. **This file (`AGENTS.md`)** — you're reading it. Gives the conceptual model.
2. **`AGENTS.local.md`** — local-only pointer to the reference project (`/Users/pandazki/Codes/pneuma-skills`, aka Pneuma 2.x). Consult it when the user's request needs concrete examples of existing contracts, protocol shapes, or lifecycle touchpoints.
3. **`docs/architecture/milestone-16-snapshot.md`** — current closed milestone: one integrated Reference Creation Host workbench carrying create/preview/inspect/evolve/approve/publish/restart/rollback.
4. **`docs/architecture/milestone-15-snapshot.md`** — previous milestone: same Host creating and inspecting two app shapes.
5. **`docs/architecture/milestone-14-snapshot.md`** — earlier milestone: Creation Host publish / monitor / restart / rollback.
6. **`docs/architecture/milestone-13-snapshot.md`** — earlier milestone: Host-level governed Builder/Agent evolution.
7. **`docs/architecture/milestone-12-snapshot.md`** — earlier milestone: Reference Creation Host substrate.
8. **`docs/architecture/README.md`** — navigation into the ADR set, domain model, OPEN-QUESTIONS, roadmap.
9. **`docs/architecture/spec/creation-host-model.md`** — top-level product/domain boundary: Framework → Creation Host → Generated Application → Published Application.
10. **`docs/superpowers/specs/2026-05-04-m16-reference-creation-host-integration-design.md`** and **`docs/superpowers/plans/2026-05-04-m16-reference-creation-host-integration.md`** — process inputs for M16, useful when inspecting the integration-gate boundary.

### Canonical first action

Unless the user says otherwise, the first productive step is to **wait for the user's intent**. M16 is closed; the likely next work is M17 release-candidate review. Do not fall back to treating "pneuma app" as a direct app template; keep the four-layer model explicit.

If the user explicitly asks for an implementation plan against a workstream, invoke `superpowers:writing-plans`.

### What's already decided (don't redebate without explicit signal)

- Architecture candidate **C** (core library + CLI + separate SDK packages + MCP bridge always on).
- Shell-based lifecycle is a **runtime subsystem**, not the framework's primary primitive (see [ADR-0029](docs/architecture/adr/0029-supersede-v0-design-spec.md)). Agent never touches scripts directly — only semantic tools.
- Operation is a first-class primitive; UI binding and Agent tool-call derive from one declaration ([ADR-0018](docs/architecture/adr/0018-operations-as-primitive.md)).
- App definition is data, not code: `pneuma_tables / pneuma_table_columns / pneuma_operations / pneuma_views / pneuma_policy_rules` are system-owned Tables; `definition.apply` mutates them through the same primitive pipeline as data mutation.
- Dev-mode crashes do **not** auto-restart; relaunch is the Build-phase Agent's decision.
- Deploy and migrate actions require framework-level Builder confirmation unless `unattendedDeploy: true`.
- Bun workspaces for the monorepo (revisit for v1 only if a concrete need emerges).
- M2 (governance hardening), M3 (deployable app substrate), M4 (Knowledge Inbox reference app), M5 (Builder evolution), M6 (backend-agent evolution), M7 (capability change-set approval), M8 (release packaging hardening), M9 (creation-to-release integrity), M10 (derived semantic index), M11 (rollout adapter v0), M12 (Reference Creation Host substrate), M13 (Host-level governed evolution), M14 (Host publish / monitor / rollback), M15 (generality pressure app), and M16 (Reference Creation Host integration gate) are closed.
- M5 proved Knowledge Inbox can gain a Priority Queue through governed `definition.apply`, approval, restart rediscovery, public API, and live browser demo evidence.
- M6 proved a backend-agent session can discover framework semantic tools through `pneuma_framework`, call `definition.apply`, preserve approval / `framework_system` execution, and show the Priority Queue through the M6 runner/viewer.
- M7 proved `definition.apply_change_set` can turn one Builder intent into one approval prompt, defer live approval for a real opencode backend agent, execute child `definition.apply` mutations after approval, deny before mutation, and preserve durable transcript evidence.
- M8 proved the Builder/Agent-evolved Knowledge Inbox can be packaged as a Docker release artifact with a mounted SQLite volume, manifest verification, runtime rediscovery, and restart persistence.
- M9 proved an approved creation request can either reach release-candidate readiness with health/config/API evidence or fail with child-level recovery evidence.
- M10 proved Knowledge Inbox can gain semantic retrieval through a derived `semantic_index_entries` index while `inbox_items` remains the source of truth, including Docker release restart verification.
- M11 proved release candidate readiness can enter explicit framework rollout state: `release.stage`, `release.promote`, `release.status`, and `release.rollback`, backed by `.pneuma/release-rollout.json` and local Docker baseline/candidate evidence.
- M12 proved a Reference Creation Host can create `team-knowledge-inbox@v0`, start preview, and expose schema/data/operation/log inspection to the Builder.
- M13 proved the Creation Host can coordinate one Builder intent through one governed `definition.apply_change_set` approval, with allow/deny and transcript evidence.
- M14 proved the Creation Host can publish v0/v1 generated-app versions as active Published Applications, restart active runtime with health evidence, and roll back to the previous version.
- M15 proved the same Creation Host can create, preview, and inspect two different app shapes: Knowledge Inbox and Team Decision Log, including distinct schema/operations/views/policies.
- M16 proved one canonical Reference Creation Host workbench can create, preview, inspect, evolve, approve, publish, restart, roll back, and profile-switch through shared Creation Host profile/project/version/store contracts. It is an integration gate, not an automatic release candidate.
- SQLite, Bun, Drizzle, and Docker are first implementations, not framework semantics. App definition remains runtime governed data, not database migrations.
- Top-level product model is **Framework → Creation Host → Generated Application → Published Application**. Reference host choices such as Bun TypeScript, local processes, role/user_id demo inputs, and version directories are implementation choices, not domain-model primitives.

Open questions live in `docs/architecture/OPEN-QUESTIONS.md`; do not invent new ones silently.
