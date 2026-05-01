# pneuma-framework

## What this project is

`pneuma-framework` is infrastructure for building **AI-native creation tools** — applications where the end-user builds their app's behavior and UI by **talking to an agent** rather than (only) clicking and coding.

The framework is a library / runtime that a **Developer** uses to construct a **pneuma-app**. Each pneuma-app is a full deployable unit (front-end + optional back-end + optional persistence) whose content is **co-created in-session** by a **Builder** (the end-user) through dialogue with a **Build-phase Agent**.

Analogy: **pneuma-framework : React :: pneuma-app : Next.js app**. The framework is the primitive; shipped apps are the product.

This repo was brainstormed out of [`pneuma-skills`](file:///Users/pandazki/Codes/pneuma-skills) (Pneuma 2.x). That project ships 10 domain modes (webcraft, gridboard, doc, slide, …) built into one monolithic runtime. In Pneuma 3.0, `pneuma-skills` is expected to become one of `pneuma-framework`'s **reference applications** — each existing mode becoming a pneuma-app-template. If that re-building is clean, the framework's design is validated.

## Vision in one sentence

> Let anyone — from a solo individual building a personal pomodoro, to a SaaS team offering dashboard self-service to their users — ship an application where **the user creates the application by talking**, without that team having to reinvent the agent-loop, workspace, checkpoint, preview, and deploy plumbing.

## Terminology

### Three populations (can collapse into one person)

| Role | Description |
|---|---|
| **Developer** | The person building on `pneuma-framework`. Writes / customizes a **pneuma-app-template**, decides tech stack, backend, persistence, injects domain knowledge. |
| **Builder** | The person using a pneuma-app to **create a pneuma-app instance** by chatting with the Build-phase Agent. Could be a cloud-platform customer, an enterprise user, or the developer themselves. |
| **End User** | The person consuming the finished pneuma-app. May or may not be the same as the Builder. May or may not see any agent at all. |

In solo scenarios (e.g. an individual developer making their own tomato-clock) all three collapse into one person. In enterprise SaaS scenarios they're often three different constituencies.

### Two agents (orthogonal lifetimes)

| Agent | Role |
|---|---|
| **Build-phase Agent** | Present during construction. Talks to the Builder to shape the pneuma-app. The framework always provides this. |
| **Runtime Agent** | Optional. Whether the finished pneuma-app embeds its own agent for End Users is decided by the template / Builder. |

### Three artifacts

| Artifact | What it is |
|---|---|
| **pneuma-framework** | This repo. The library/runtime. |
| **pneuma-app-template** | A starting template a Developer authors. Contains the lifecycle scripts, skill, viewer, assets, agent config, and any domain knowledge that constrains or guides the Build-phase Agent. |
| **pneuma-app** | An instance of a template. A full deployable front-end + back-end + persistence unit, in whatever tech stack the template chose. Has a Dev mode (hot-reload + agent attached) and a Release mode (frozen, packaged). |

### Two modes

- **Dev mode** — construction-in-progress. Hot-reload active. Build-phase Agent attached. Services running locally.
- **Release mode** — packaged output produced by `build.sh`; deployable by `deploy.sh`. Whether a Runtime Agent ships inside is a template decision.

## Core design principles

1. **Template self-containment.** The template owns all tech stack decisions (frontend framework, backend presence, persistence choice, deployment target, injection mechanism for UI / API / skill / hooks). Framework does not prescribe.

2. **Shell-based lifecycle contract.** The framework defines standardized lifecycle **verbs** (`setup.sh` / `dev.sh` / `stop.sh` / `build.sh` / `deploy.sh` / `migrate.sh` / `fork.sh`). Each template ships one shell script per relevant verb. The framework invokes, streams, observes exit, and reports. Scripts are sovereign — their contents are pure template concern. `.sh` only; Windows is out of scope.

3. **Agent operates on framework state via semantic tools — never on scripts directly.** The framework exposes a semantic tool API (`lifecycle.dev.start`, `lifecycle.state`, `build.run`, …). Scripts are the framework's implementation detail. This means template authors can swap script implementations without breaking Build-phase Agent skills, and skills can be reused across templates.

4. **Two-axis Agent interop.**
   - **Axis 1 — Viewer:** bidirectional wire protocol. Builder → Agent carries *focus* (what the Builder is looking at / has selected) + *action* (what they did or said). Agent → Builder carries text streams, viewer execution requests, and permission prompts. Two built-in SDKs (React, Vanilla JS) sit on top; the wire protocol stays open for any stack.
   - **Axis 2 — Framework:** semantic lifecycle tool API (see principle 3).

5. **Pluggable agent backend.** `AgentBackend` is abstracted over Claude Code, Codex, and future backends. Templates can declare a supported backend set.

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
8. Template contract (manifest schema declaring scripts, skill, viewer, assets, runtime-agent config, supported backends)

### Out of scope (each host / meta-app's concern)

- Launcher / session registry / mode marketplace — a **meta-app** built on the framework
- User preferences that span pneuma-apps
- Artifact sharing / snapshot push-pull / publishing
- Specific deployment targets (Vercel / CF Pages / Docker registry / App Store)
- Specific persistence backends (SQLite, Postgres, R2, filesystem)
- UI tech stack selection
- Plugin marketplace

If and when these are needed, they live in a meta-app (e.g. a reborn `pneuma-skills` on top of `pneuma-framework`), not in the framework.

## Status

- **Phase:** M6-A active — real backend-agent app evolution.
- **Origin:** brainstormed out of `pneuma-skills` (Pneuma 2.x).
- **Next step:** replace M5's deterministic Agent proposal with a real Build-phase Agent backend path. See `docs/superpowers/plans/2026-05-01-m6-a-real-backend-agent-evolution.md`.

> Note: the original v0 design spec (lifecycle-script-centric framework view) has been superseded — see [ADR-0029](docs/architecture/adr/0029-supersede-v0-design-spec.md). The shell lifecycle contract still exists as a runtime **subsystem**, but the framework's core primitive is now the Operation + definition-as-data model proved in M1.

## Starting a new session here

If you are Codex opening this repo for the first time in a session, read in this order, then stop and wait for user instruction:

1. **This file (`AGENTS.md`)** — you're reading it. Gives the conceptual model.
2. **`AGENTS.local.md`** — local-only pointer to the reference project (`/Users/pandazki/Codes/pneuma-skills`, aka Pneuma 2.x). Consult it when the user's request needs concrete examples of existing contracts, protocol shapes, or lifecycle touchpoints.
3. **`docs/architecture/milestone-5-snapshot.md`** — current closed milestone: Builder-evolved app capability, verification, and next gate.
4. **`docs/superpowers/specs/2026-05-01-m6-a-real-backend-agent-evolution-design.md`** — active M6-A design input.
5. **`docs/superpowers/plans/2026-05-01-m6-a-real-backend-agent-evolution.md`** — active M6-A implementation plan.
6. **`docs/architecture/README.md`** — navigation into the ADR set, domain model, OPEN-QUESTIONS, roadmap.

### Canonical first action

Unless the user says otherwise, the first productive step is to **wait for the user's intent**. M6-A is active; plausible next moves include implementing the backend-agent tool surface, reviewing the M6-A plan, running the M5 demo as baseline, or pressure-testing opencode wiring. Do not assume which one.

If the user explicitly asks for an implementation plan against a workstream, invoke `superpowers:writing-plans`.

### What's already decided (don't redebate without explicit signal)

- Architecture candidate **C** (core library + CLI + separate SDK packages + MCP bridge always on).
- Shell-based lifecycle is a **runtime subsystem**, not the framework's primary primitive (see [ADR-0029](docs/architecture/adr/0029-supersede-v0-design-spec.md)). Agent never touches scripts directly — only semantic tools.
- Operation is a first-class primitive; UI binding and Agent tool-call derive from one declaration ([ADR-0018](docs/architecture/adr/0018-operations-as-primitive.md)).
- App definition is data, not code: `pneuma_tables / pneuma_table_columns / pneuma_operations / pneuma_views / pneuma_policy_rules` are system-owned Tables; `definition.apply` mutates them through the same primitive pipeline as data mutation.
- Dev-mode crashes do **not** auto-restart; relaunch is the Build-phase Agent's decision.
- Deploy and migrate actions require framework-level Builder confirmation unless `unattendedDeploy: true`.
- Bun workspaces for the monorepo (revisit for v1 only if a concrete need emerges).
- M2 (governance hardening), M3 (deployable app substrate), M4 (Knowledge Inbox reference app), and M5 (Builder evolution) are closed.
- M5 proved Knowledge Inbox can gain a Priority Queue through governed `definition.apply`, approval, restart rediscovery, public API, and live browser demo evidence.
- M6-A is the active slice: real backend-agent app evolution. M6-B derived semantic index is intentionally deferred.
- SQLite, Bun, Drizzle, and Docker are first implementations, not framework semantics. App definition remains runtime governed data, not database migrations.

Open questions live in `docs/architecture/OPEN-QUESTIONS.md`; do not invent new ones silently.
