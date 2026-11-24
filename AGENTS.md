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
   - **Axis 1 — Viewer:** bidirectional wire protocol. Builder → Agent carries *focus* (what the Builder is looking at / has selected) + *action* (what they did or said). Agent → Builder carries text streams, viewer execution requests, and permission prompts. A React SDK (`@pneuma-framework/viewer-react`) ships on top; the wire protocol stays open for any stack — a vanilla JS / Vue / other SDK is bring-your-own, not shipped.
   - **Axis 2 — Framework:** semantic lifecycle tool API (see principle 3).

5. **Pluggable agent backend.** `AgentBackend` is abstracted over Claude Code, Codex, and future backends. Creation Hosts / profiles can declare a supported backend set.

6. **Construction hygiene is framework concern.** The change record (`@pneuma-framework/host-kit/change-record`, [ADR-0039](docs/architecture/adr/0039-change-record-floor-and-declared-reversibility.md)) is first-class in the framework — not a per-template reinvention: versions of an app directory, an append-only history that says which guarantees held, and restore. Shadow-git checkpoints (`packages/core/src/shadow-git.ts`) exist but have no production caller and are reachable only from the `core` root entry; nothing takes per-turn snapshots, so the registered `checkpoint.list` / `checkpoint.rewind` tools have nothing to rewind to. Shadow-git may later become another storage backend for the record, under its own ADR.

## Scope

### In scope (framework owns)

1. Lifecycle verb set + script protocol (env vars, stdout markers, exit code convention, artifact-dir convention, `build.manifest.json`)
2. Program-level process management (process groups, log streaming, crash observation, on-demand restart)
3. Semantic tool API surface for Build-phase Agent
4. Framework-state observation endpoint
5. Build-preview loop (focus / action wire protocol + React SDK + extension point for other stacks; a vanilla SDK is bring-your-own)
6. `AgentBackend` abstraction (reused from 2.x)
7. Shadow-git / checkpoint / replay machinery
8. Creation Host / profile contract (manifest schema declaring lifecycle, viewer, assets, runtime-agent config, supported backends, and generated-app capabilities)

### Out of scope (each host / meta-app's concern)

- Launcher / mode marketplace beyond one Creation Host — a **meta-app** built on the framework
- User preferences that span Creation Hosts or Generated Applications
- Artifact sharing product / snapshot push-pull transport / publishing marketplace (M22 pins the portable share artifact contract; M23 pins the sharing governance manifest and credential rebinding evidence contract)
- Specific deployment targets (Vercel / CF Pages / Docker registry / App Store)
- Specific persistence backend implementations (SQLite, Postgres, R2, filesystem)
- UI tech stack selection
- Plugin marketplace

If and when these are needed, they live in a meta-app (e.g. a reborn `pneuma-skills` on top of `pneuma-framework`), not in the framework.

## Status

- **Phase:** **`v0.5.0` is tagged** (2026-06-23; `package.json` says 0.5.0) — the public-API freeze. **Milestone 54 is closed** (2026-11-24): an out-of-the-box governed loop on PneumaSpace (`examples/space-all-in-one`, the change record of ADR-0039, PneumaSpace ephemeral and managed apps). Its changes sit in `CHANGELOG.md` under `[Unreleased]`; no release has been cut for them, and whether to cut one is the owner's decision. See the [M54 snapshot](docs/archive/milestone-54-snapshot.md) and [CHANGELOG.md](CHANGELOG.md). Before that, `v0.4.0` (2026-05-31) was the implementation-framework version: a real Creation Host consumes Host Kit + reference adapters and the governed loop is proven end-to-end against live Codex/Neon/Vercel ([release-0.4.0-notes](docs/architecture/release-0.4.0-notes.md)). Prior RC history: `pneuma-rc-0.1.0` is the first developer-facing candidate release; `pneuma-rc-0.1.1` surfaced hidden runtime, AppConfig, rollout, and Authoring Kit conventions; `pneuma-rc-0.1.2` adds the BuildThread semantic transcript; `pneuma-rc-0.1.3` adds the minimal executable Code Change Lane; `pneuma-rc-0.2.0` is prepared as the post-assurance developer-contract release train with package-consumption gating; `pneuma-rc-0.3.0` is prepared as the minimum enterprise-governance release train; M45 closes the first 0.4.0 implementation-framework slice with `@pneuma-framework/host-kit`; M46/M47 prove Host Kit inside a product-shaped Creation Host; M48 starts Workflow App Studio with Codex app-server as the default real code-agent lane; M49 closes Agent Debug Loop before proposal creation; M50/M51 close the Workflow App Studio UX and verification/paperwork line; M52 stabilizes a production Generated App scaffold profile before wiring the next full Host workflow; M53 wires that profile back into a Creation Host harness with deterministic and real-Codex code-agent lanes, disposable preview, Neon-backed published data, and Vercel REST publish/rollback.
- **Origin:** brainstormed out of `pneuma-skills` (Pneuma 2.x).
- **Next step:** not chosen; it is the owner's call. The M54 snapshot recommends making layer 3 real: a pre-assembled Host a product can import, with reversibility on by default. Candidate workstreams: release-and-settle and preview move into host-kit so the example Host shrinks to wiring; PneumaSpace reports what serves and takes a snapshot at the release quiescent point for files plus SQLite; one preset that spans build time and run time; close the local front door (pandazki/pneuma-space#43) and decide the owner's identity on one machine; positioning and the entry project (deferred by the owner on 2026-11-23). Until release-and-settle lives in host-kit, add no new product surface inside the example. See [roadmap](docs/architecture/roadmap.md) and [OPEN-QUESTIONS](docs/architecture/OPEN-QUESTIONS.md).
  - Note: examples use local dependency-linking (no committed `node_modules`); run `bun install` at the repo root before `bun test`/`verify` on any example, or harnesses fail closed with "dependencies are missing".

> Note: the original v0 design spec (lifecycle-script-centric framework view) has been superseded — see [ADR-0029](docs/architecture/adr/0029-supersede-v0-design-spec.md). The shell lifecycle contract still exists as a runtime **subsystem** pinned by [ADR-0030](docs/architecture/adr/0030-lifecycle-subsystem-contract.md), but the framework's core primitive is now the Operation + definition-as-data model proved in M1.

## Starting a new session here

If you are Codex opening this repo for the first time in a session, read in this order, then stop and wait for user instruction:

1. **This file (`AGENTS.md`)** — you're reading it. Gives the conceptual model.
2. **`AGENTS.local.md` if present** — local-only pointer to the reference project (`/Users/pandazki/Codes/pneuma-skills`, aka Pneuma 2.x). It is intentionally git-ignored; skip this step if the file is absent.
3. **`docs/archive/milestone-54-snapshot.md`** — the current state: what M54 proved, what it did not prove, the recommended next phase, and the team decision gate. First read for where the project stands.
4. **`examples/space-all-in-one/README.md`** — the runnable entry: one `docker compose up` starts a headless Creation Host on PneumaSpace that a coding agent (Claude Code, Codex) uses through the governed loop; its Status table records the live runs.
5. **`docs/developer/start-here.md`** — compressed Developer-first entry with five visual anchors.
6. **`docs/architecture/team-share-demo.md`** — zero-context team-share package.
7. **`docs/architecture/README.md`** — route into Developer, teammate, downstream implementer, and architecture-review paths.
8. **`docs/architecture/spec/creation-host-model.md`** — durable four-artifact product/domain boundary.
9. **`docs/architecture/spec/global-alignment-review-0.4.md`** — top-level review after Host Kit, Workflow App Studio, and Agent Debug Loop.
10. **`docs/architecture/spec/ai-build-assurance-domain-review.md`** — current top-level review anchor for Builder + Build Agent engineering control.
11. **`docs/developer/creation-host-contract.md`** — minimum Creation Host contract and authoring kit boundary.
12. **`docs/developer/host-kit.md`** and **`docs/developer/change-record.md`** — the Creation Host Implementation Kit guide (M45-M51) and the change record under it (M54, ADR-0039).
12a. **`docs/developer/scaffold-to-host-walkthrough.md`** — bridges the gap between the thin `scaffold-host` output and the runnable Reference Host; first read for a newcomer who has scaffolded but has no running Host yet.
13. **`examples/reference-creation-host/README.md`** — compact canonical M45 consumer and runnable Team Notes Board workbench.
14. **`examples/product-creation-host/README.md`** — M46/M47 product-shaped Dev Board Builder with browser E2E, share/fork, rollback, published-app use, and boundary review.
15. **`examples/workflow-app-studio/README.md`** — M48-M51 real Creation Host line with Codex app-server source changes, Agent Debug Loop, and lifecycle UX hardening.
16. **`docs/developer/production-generated-app-profile.md`** and **`examples/production-generated-app-profile/README.md`** — M52 Developer-authored Bun/Hono/React/Drizzle/Zod/Neon scaffold-first profile.
17. **`docs/developer/production-profile-host.md`** and **`examples/production-profile-host/README.md`** — M53 Creation Host harness that wires the M52 profile into the full create → preview/publish → code-agent evolution → proposal → approve/apply → publish (Neon/Vercel) → rollback flow; see **`docs/archive/milestone-53-snapshot.md`**.
18. **`docs/developer/build-thread.md`**, **`docs/developer/scaffold-project-contract.md`**, **`docs/developer/agent-debug-loop.md`**, **`docs/developer/code-change-lane.md`**, **`docs/developer/build-assurance.md`**, and **`docs/developer/build-assurance-adoption.md`** — governed creation/source-change/assurance lane.
19. **`docs/developer/runtime-composition.md`**, **`docs/developer/release-rollout-authoring.md`**, and **`docs/developer/credential-broker.md`** — runtime, release, and credential utility contracts.
20. **`docs/archive/release-candidate-snapshot.md`** and tagged patch snapshots, including **`docs/archive/release-candidate-0.2.0-snapshot.md`** and **`docs/archive/release-candidate-0.3.0-snapshot.md`** — release evidence when needed.
21. **milestone snapshots and ADRs via `docs/architecture/README.md`** — historical evidence archive, not first-read material.

### Canonical first action

Unless the user says otherwise, the first productive step is to **wait for the user's intent**. Milestone 54 has just closed (see the [M54 snapshot](docs/archive/milestone-54-snapshot.md)); whether to cut a release for it and which milestone comes next are the owner's decisions. Do not invent another milestone automatically. Do not fall back to treating "pneuma app" as a direct app template; keep the four-layer model explicit.

If the user explicitly asks for an implementation plan against a workstream, invoke `superpowers:writing-plans`.

### What's already decided (don't redebate without explicit signal)

- Architecture candidate **C** (core library + CLI + separate SDK packages + MCP bridge always on).
- Shell-based lifecycle is a **runtime subsystem**, not the framework's primary primitive (see [ADR-0029](docs/architecture/adr/0029-supersede-v0-design-spec.md) and [ADR-0030](docs/architecture/adr/0030-lifecycle-subsystem-contract.md)). Agent never touches scripts directly — only semantic tools.
- Operation is a first-class primitive; UI binding and Agent tool-call derive from one declaration ([ADR-0018](docs/architecture/adr/0018-operations-as-primitive.md)).
- App definition is data, not code: `pneuma_tables / pneuma_table_columns / pneuma_operations / pneuma_views / pneuma_policy_rules` are system-owned Tables; `definition.apply` mutates them through the same primitive pipeline as data mutation.
- Dev-mode crashes do **not** auto-restart; relaunch is the Build-phase Agent's decision.
- Deploy and migrate actions require framework-level Builder confirmation unless `unattendedDeploy: true`. A record-only mode that the owner sets on the Host, such as `record` in `examples/space-all-in-one`, is that explicit authorisation under another name ([ADR-0039](docs/architecture/adr/0039-change-record-floor-and-declared-reversibility.md)): the agent cannot change it, every entry it writes says `guarantees: []`, and going back past a one-way change still needs the owner's confirmation.
- Bun workspaces for the monorepo (revisit for v1 only if a concrete need emerges).
- M2 (governance hardening), M3 (deployable app substrate), M4 (Knowledge Inbox reference app), M5 (Builder evolution), M6 (backend-agent evolution), M7 (capability change-set approval), M8 (release packaging hardening), M9 (creation-to-release integrity), M10 (derived semantic index), M11 (rollout adapter v0), M12 (Reference Creation Host substrate), M13 (Host-level governed evolution), M14 (Host publish / monitor / rollback), M15 (generality pressure app), M16 (Reference Creation Host integration gate), M17 (security + architecture acceptance gate), M18 (open-ended app pressure), M19 (release-candidate review), M20 (open-ended definition artifact boundary), M21 (developer onboarding), M22 (Creation Host Authoring Kit), M23 (Sharing Governance contract), M24 (Creation Host RC pressure), M25 (Alice Creation Host prototype), M26 (Code Change Lane hardening), M27 (Runtime Diagnostic Surface), M28 (HostExtension Slot Contract), M29 (AgentBackend runTurn Contract), M30 (Host Credential Broker Utilities), M31 (Downstream Credential Adoption Pressure), M32 (Build Change Assurance v0), M33 (Reference Host Assurance Card), M34 (Durable Assurance Cases), M35 (Build Change Review Packet), M36 (Recovery Drill Matrix), M37 (Build Assurance Downstream Readiness), M38 (Package Consumption + 0.2.0 Gate), M40-M43 (minimum enterprise governance), M45-M51 (implementation-framework/product pressure), M52 (production Generated App scaffold profile), M53 (production profile Creation Host integration), and M54 (out-of-the-box governed loop on PneumaSpace) are closed.
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
- M17 proved reserved framework HTTP identity is no longer user-header spoofable, internal lifecycle calls use `PNEUMA_INTERNAL_HTTP_TOKEN`, query/View source invocation fails closed by default, rollback failures write recovery evidence, ADR-0029/four-artifact model and ADR-0030 lifecycle subsystem are accepted, and Linear/OpenRouter are reference integrations rather than core semantics.
- M18 proved the Creation Host workflow can create, preview, inspect, evolve, approve, publish, restart, and roll back a non-table-first Personal Focus Site with routes, sections, style tokens, dynamic GitHub attention, and one Host-governed UI/module evolution approval.
- M19 proved the full suite is green and the package/docs boundary is close, but deferred RC tagging until the open-ended definition governance boundary is explicitly pinned.
- M20 accepted ADR-0031: open-ended UI/module artifacts are Host-owned artifacts with Host-level approval in v0. They can expose Host approval, transcript, inspection, release, and rollback evidence, but they are not framework definition rows or `definition.apply_change_set` artifacts until a later extension-lane ADR promotes that shape.
- ADR-0032 accepted BuildThread as the framework-owned semantic transcript for Builder conversation. Backend-native sessions remain useful cache/optimization, but the portable source of truth for proposal / decision / execution receipt lives in the Creation Host workspace, not Generated Application runtime SQLite.
- ADR-0033 accepted Scaffold Project as the Developer-authored generated-app source boundary for governed code-change lanes: writable roots, protected paths, pre-proposal/pre-apply/post-apply guardrails, lifecycle commands, and proposal evidence are validated by `doctor-host`.
- ADR-0034 accepted Code Change Lane as the minimal executable bridge from Scaffold Project + BuildThread to governed source changes: prepare proposal evidence from a draft workspace, apply only after approval, fail stale bases before mutation, and roll back failed post-apply checks.
- ADR-0036 accepted AgentBackend `runTurn` as the standard backend entry for one Builder follow-up turn: BuildThread remains source of truth, backend-native sessions remain cache/optimization, and legacy launch/send transports can implement the contract through a shared helper.
- ADR-0037 accepted Host Credential Broker utilities as a local Host utility boundary for session cookie hashing, OAuth state, callback binding, credential refs, no-secret rebinding evidence, and provider-shaped test fixtures.
- M21 proved a new Developer has a concrete onboarding lane: `scaffold-host`, `doctor-host`, profile contract helpers, workspace diagnostics, and developer guides that connect the scaffold to the M16/M18 reference loops.
- M22 proved a Developer can scaffold and test the first Creation Host Authoring Kit contracts: `BuildAgentPackageManifest`, `ProviderCapabilityMatrix`, `ShareArtifactManifest`, provider parity hooks, portable no-secret share/fork recipes, and Host doctor diagnostics. Build Agents should work against capability contracts, not provider-specific implementation branches.
- M23 proved a Creation Host can scaffold and test the first Sharing Governance contracts: `SharingGovernanceManifest`, `CredentialRebindingEvidence`, share/fork/install rights, owner/maintainer/operator subjects, fork lineage, revocation, no-secret credential rebinding, and Host doctor diagnostics.
- M24 proved the post-M23 contracts can carry the Alice/Bob/Charlie/Dave RC pressure story: capability-contract-only Build Agent Package, local SQLite/Docker and remote Postgres/Docker profiles, provider parity hooks, portable no-secret share artifacts, version-bound credential rebinding, and fail-closed install/fork decisions.
- M25 proved the RC sharing/demo story can start from Alice's Developer cognition path: product-layer confusion, four-layer boundary, Host profiles, Build Agent Package, provider contracts, Bob's Builder session, Charlie install, Dave fork, and explicit productization gaps.
- M26 proved the Code Change Lane can absorb downstream implementation feedback without expanding framework scope: readable line-based unified diffs, explicit `rejected` receipts, a `rejectCodeChangeProposal` helper, proposal-turn opt-out, workspace-root `source_roots`, `.env` share-exclude normalization, file-level protected carve-outs, and clearer `framework_check` diagnostics.
- M27 proved runtime composition can become inspectable without making the framework a deployment platform: `RuntimeMode`, explicit boot options, `/api/health` diagnostics, `tryHandleBunRuntimeRequest`, and `waitForRuntimeReady` are framework-owned helpers; process management and deployment remain Host-owned.
- M28 proved Host-owned open-ended artifacts can gain a portable distribution contract without becoming framework definition rows: `HostExtensionSlotRegistry`, `HostExtensionManifest`, and `validateHostExtensionBundle` validate slot compatibility, no-secret portability, and fail-closed approval governance.
- M29 proved BuildThread can drive backend turns through `AgentBackend.runTurn`: the framework appends Builder turns, packs semantic context, reuses backend sessions by `thread_id`, and records decision+receipt turns through `recordBuildThreadExecutionOutcome`.
- M30 proved downstream Hosts can use shared credential/session/OAuth utilities without turning the framework into hosted identity: session cookies are hashed, OAuth state is scoped and single-use, credential bindings expose refs, and rebinding evidence stays no-secret.
- M31 proved those credential utilities can be adopted by the external DevBoard Studio Host: downstream OAuth routes, cookie handling, session hashing, mock provider tests, and rebinding evidence now consume framework helpers, while Host-owned encrypted storage remains outside the framework.
- M32 proved Build Change Assurance can be expressed as a small framework value object: risk classification, readiness, blocking reasons, migration/rollback notes, and evidence refs over BuildThread, permission ledger, Code Change Lane, definition history, runtime health, rollout, and Host checks.
- M33 proved the M32 primitive can improve Builder-facing product understanding: the M16 Reference Creation Host now shows an Assurance card beside approval/publish controls and returns `awaiting_approval`, `verified`, and `ready_to_publish` cases through the live flow.
- M34 proved Build Change Assurance can become refresh-safe Host state without turning into a compliance backend: `AssuranceCaseStore` persists validated cases in the Creation Host workspace, and the M16 Reference Host lists proposal, approval, and publish cases through `/api/host/projects/:appId/assurance`.
- M35 proved approval-time disclosure can be explicit and single-intent: `BuildChangeReviewPacket` describes scope boundary, proposed lanes, risk, pre-proposal checks, recovery plan, and one generated approval statement before the Builder clicks Allow.
- M36 proved expected failure paths can be checked as recovery drills: `BuildChangeRecoveryDrillScenario` evaluates readiness and required evidence kinds without copying logs or becoming incident response.
- M37 proved the assurance lane is downstream-readable: the Build Assurance Adoption Guide lets a new Developer adopt review packets, assurance cases, durable Host state, and recovery drills without reading M32-M36 chronologically.
- M38 proves the current post-assurance developer contract can be consumed by a fresh downstream Bun/TypeScript project through `file:` dependencies, without `workspace:*` leaking into developer-facing packages.
- M40 proved the project can state a production-readiness boundary without drifting into hosted enterprise platform claims.
- M41 proved minimum enterprise governance can be expressed as framework roles, route policy, and deterministic decisions while real identity remains Host-owned.
- M42 proved Build Assurance can fail closed when required enterprise governance approval is missing.
- M43 proved the minimum enterprise governance loop through a reference demo: Builder proposes, self-approval is denied, Reviewer approves, publish succeeds, End User consumes, Owner rolls back, with GitHub public-read and mock Linear provider pressure.
- SQLite, Bun, Drizzle, and Docker are first implementations, not framework semantics. App definition remains runtime governed data, not database migrations.
- Top-level product model is **Framework → Creation Host → Generated Application → Published Application**. Reference host choices such as Bun TypeScript, local processes, role/user_id demo inputs, and version directories are implementation choices, not domain-model primitives.
- M48 proved Workflow App Studio can act as the cleaner real Creation Host example line: Bob creates a workflow app, Codex app-server is the default real code-agent lane for controlled `src/app.ts` edits, opencode remains alternate evidence, and preview/publish prove legal-review plus SLA-tracking runtime behavior.
- M49 proved Agent Debug Loop belongs before proposal creation. It gives Developers budgeted attempts, failed-check feedback, BuildThread debug evidence, and fail-closed no-proposal behavior; post-apply repair remains a new proposal, not silent code changes.
- M50 proved Workflow App Studio can teach the product model through UX rather than explanation: Builder/App split, stateful lifecycle controls, progress/log visibility, preview/publish separation, and bilingual runtime labels.
- M51 proved the M49/M50 line is verified and documentable: typecheck, combined core/host-kit/example tests, real Codex browser E2E, and current architecture/developer navigation are synchronized.
- M52 proves Alice can prepare a production Generated App scaffold profile first: Bun + Hono + React + Drizzle + Zod, Neon boundary, Docker/Vercel targets, small demo slices, and a product UI design contract. This is a Developer-owned profile, not framework semantics.
- M53 proves that M52 profile wires back into a Creation Host harness: create-from-profile yields a complete `v0`, preview is a disposable in-memory sandbox, publish runs migration then serves locally or deploys through a Host-owned Vercel REST adapter, published data lives in Neon, and deterministic + real-Codex code-agent lanes evolve declared roots behind the scaffold's own `verify` as the pre-proposal gate, with approve/apply/rollback proven. Vercel/Neon and the structured deploy receipt remain Host/example-local (not yet promoted into framework packages).
- M54 proved one governed loop runs out of the box on PneumaSpace through `examples/space-all-in-one`: a coding agent with no context can create, change and hand over an app, and the person who owns it can see, decide and go back on a page written for a non-programmer. It is proven for an individual with a coding agent (agent-driven) and for a product that starts the agent itself (host-driven), over one app directory and one history. It does not prove an importable Host for integrators (an integrator copies the example), multi-user or hosted operation, or data that comes back on undo by default. See the [M54 snapshot](docs/archive/milestone-54-snapshot.md).
- The change record is the floor under every mode ([ADR-0039](docs/architecture/adr/0039-change-record-floor-and-declared-reversibility.md)): `@pneuma-framework/host-kit/change-record` records every version of an app directory, and each entry names the guarantees that held (`verified`, `previewed`, `approved`, `sealed`); an empty list means recorded only. `pneuma-framework record` gives the same floor to a coding agent with no Host.
- Reversibility is declared by the Host, not promised by the framework (ADR-0039): undo puts code back; stored data comes back only when the Host declares a `DataSnapshotCapability`; a change that undo cannot reverse is recorded as one-way, and going back past it needs the owner's confirmation. This supersedes ADR-0017's destructive rollback with data flowing back (never implemented) and ADR-0016's line that rollback is destructive.
- One loop with one knob: the modes `record` (everything recorded, nothing checked), `personal` (checks and a preview always; a standing policy approves ordinary changes; the owner decides risky ones) and `review-all`. The knob belongs to the Host, not to a framework enum. In the governed modes there is no change without an approval record.
- Risk rules are a preset file the Host is started with (`policy/*.json` in the example), not code.
- PneumaSpace is the default runtime of the out-of-the-box Host: previews are its ephemeral apps and releases its managed apps (PneumaSpace ADR 0038, 0039). The framework still does not own deployment targets.
- RC accepted direction: Creation Host Authoring Kit, Sharing Governance, RC pressure, and Developer-first prototype evidence are pinned enough for `pneuma-rc-0.1.0`; `pneuma-rc-0.1.1` clarifies developer contracts surfaced by external DevBoard pressure; `pneuma-rc-0.1.2` adds BuildThread as framework-owned semantic transcript; `pneuma-rc-0.1.3` adds Code Change Lane as the first executable scaffold/source-change helper; M26-M37 stabilize code-change, runtime-composition, HostExtension distribution, backend-turn, credential-helper, downstream-adoption, and assurance lanes; M38 prepares `pneuma-rc-0.2.0` as the package-consumable roll-up; M40-M43 prepare `pneuma-rc-0.3.0` as the minimum enterprise-governance roll-up; M45 starts 0.4.0 by adding Host Kit, the long-lived Reference Creation Host, real opencode code-agent draft pressure, optional Docker runtime adapter, and narrow open-ended Host Kit pressure; M46/M47 prove Host Kit can support a product-shaped Creation Host; M48 starts the cleaner Workflow App Studio line; M49 adds the proposal-before-approval coding debug loop; M50/M51 close the UX and verification/paperwork line; M52 adds a production Generated App scaffold profile before the next full Host workflow.
- Release-candidate tagging is no longer blocked by the open-ended definition governance boundary, missing developer onboarding, missing authoring-kit contracts, missing sharing-governance contract, missing Alice/Bob/Charlie/Dave RC pressure evidence, or missing Developer-cognition demo material. Future work should be explicitly chosen from post-RC productization or pressure lanes, not inferred as pre-RC blockers.

Open questions live in `docs/architecture/OPEN-QUESTIONS.md`; do not invent new ones silently.

## Agent skills

### Issue tracker

Issues are GitHub issues in `pandazki/pneuma-framework` (`gh issue list -R pandazki/pneuma-framework`); PneumaSpace issues are in `pandazki/pneuma-space`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo. Use the existing canonical product/domain docs plus `docs/architecture/adr/` for architectural decisions. See `docs/agents/domain.md`.
