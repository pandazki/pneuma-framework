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
- Artifact sharing product / snapshot push-pull transport / publishing marketplace (M22 pins the portable share artifact contract; M23 pins the sharing governance manifest and credential rebinding evidence contract)
- Specific deployment targets (Vercel / CF Pages / Docker registry / App Store)
- Specific persistence backend implementations (SQLite, Postgres, R2, filesystem)
- UI tech stack selection
- Plugin marketplace

If and when these are needed, they live in a meta-app (e.g. a reborn `pneuma-skills` on top of `pneuma-framework`), not in the framework.

## Status

- **Phase:** RC accepted — `pneuma-rc-0.1.0` is the first developer-facing candidate release; `pneuma-rc-0.1.1` surfaced hidden runtime, AppConfig, rollout, and Authoring Kit conventions; `pneuma-rc-0.1.2` adds the BuildThread semantic transcript; `pneuma-rc-0.1.3` adds the minimal executable Code Change Lane; M26 hardens that lane; M27 adds the runtime diagnostic composition surface; M28 adds the HostExtension slot distribution contract; M29 adds the AgentBackend `runTurn` contract; M30 adds Host Credential Broker utilities; M31 proves downstream credential-helper adoption without a new release tag.
- **Origin:** brainstormed out of `pneuma-skills` (Pneuma 2.x).
- **Next step:** continue the chosen post-RC stabilization sequence when requested. Do not infer a `0.1.4` tag until the user asks for a release.

> Note: the original v0 design spec (lifecycle-script-centric framework view) has been superseded — see [ADR-0029](docs/architecture/adr/0029-supersede-v0-design-spec.md). The shell lifecycle contract still exists as a runtime **subsystem** pinned by [ADR-0030](docs/architecture/adr/0030-lifecycle-subsystem-contract.md), but the framework's core primitive is now the Operation + definition-as-data model proved in M1.

## Starting a new session here

If you are Claude opening this repo for the first time in a session, read in this order, then stop and wait for user instruction:

1. **This file (`CLAUDE.md`)** — you're reading it. Gives the conceptual model.
2. **`CLAUDE.local.md` if present** — local-only pointer to the reference project (`/Users/pandazki/Codes/pneuma-skills`, aka Pneuma 2.x). It is intentionally git-ignored; skip this step if the file is absent.
3. **`docs/developer/start-here.md`** — current Developer-first entry with five visual anchors for the four-layer product model.
4. **`docs/architecture/release-candidate-snapshot.md`** — RC 0.1.0 acceptance snapshot: decision, acceptance matrix, verification evidence, demo route, and post-RC lanes.
5. **`docs/architecture/release-candidate-0.1.1-snapshot.md`** — RC 0.1.1 patch snapshot: accepted DevBoard feedback, deferred lanes, and developer-contract polish.
6. **`docs/architecture/release-candidate-0.1.3-snapshot.md`** — RC 0.1.3 patch snapshot: minimal executable Code Change Lane.
7. **`docs/architecture/milestone-31-snapshot.md`** — downstream credential adoption snapshot: DevBoard Studio replacing Host-owned session/OAuth/cookie/evidence helpers with framework utilities.
8. **`docs/architecture/milestone-30-snapshot.md`** — post-RC Host Credential Broker snapshot: sessions, OAuth state, credential refs, no-secret evidence, and test fixture.
9. **`docs/architecture/milestone-29-snapshot.md`** — post-RC AgentBackend runTurn snapshot: BuildThread-backed backend turn, session cache, and receipt helper.
10. **`docs/architecture/milestone-28-snapshot.md`** — post-RC HostExtension slot snapshot: portable contribution manifests, slot compatibility, no-secret bundle validation, and approval governance.
11. **`docs/architecture/milestone-27-snapshot.md`** — post-RC runtime diagnostic surface snapshot: runtime mode, boot options, health diagnostics, fallback routing, and readiness helper.
12. **`docs/architecture/milestone-26-snapshot.md`** — post-RC Code Change Lane hardening snapshot: readable diffs, rejected receipts, proposal-turn opt-out, and scaffold diagnostics.
13. **`docs/architecture/milestone-25-snapshot.md`** — closed Developer-first prototype snapshot: Alice's cognitive path from framework boundary to RC judgment.
14. **`docs/architecture/milestone-24-snapshot.md`** — RC pressure snapshot: Alice/Bob/Charlie/Dave story, provider parity, credential rebinding, and fail-closed fork/install decisions.
15. **`docs/architecture/milestone-23-snapshot.md`** — sharing governance snapshot: owner/maintainer/operator subjects, rights, revocation, and credential rebinding evidence.
16. **`docs/architecture/milestone-22-snapshot.md`** — Creation Host Authoring Kit snapshot: Build Agent Package, provider matrix, and portable share/fork artifact boundary.
17. **`docs/developer/creation-host-contract.md`** — minimum Creation Host contract, diagnostics boundary, Scaffold Project contract, Authoring Kit contract, Sharing Governance contract, and authoring shape notes.
18. **`docs/developer/app-config-authoring.md`** — AppConfig invariant cheatsheet for real Host runtimes.
19. **`docs/developer/runtime-composition.md`** — runtime composition guide: mode, boot options, internal tokens, markers, route fallback, readiness, and published data modes.
20. **`docs/developer/release-rollout-authoring.md`** — rollout helper shapes for Host publish/restart/rollback.
21. **`docs/developer/build-thread.md`** — BuildThread semantic transcript primitive for Builder conversation.
22. **`docs/developer/credential-broker.md`** — Host credential utilities for sessions, OAuth callback binding, credential refs, and no-secret rebinding evidence.
23. **`docs/architecture/adr/0032-build-thread-primitive.md`** — accepted BuildThread ADR: framework transcript as source of truth, backend-native sessions as cache.
24. **`docs/architecture/adr/0036-agent-backend-run-turn.md`** — accepted AgentBackend runTurn ADR: BuildThread replay, backend session cache, decision+receipt helper.
25. **`docs/architecture/adr/0037-host-credential-broker-utilities.md`** — accepted Host Credential Broker ADR: local Host utility boundary for session/cookie/OAuth/credential-ref helpers.
26. **`docs/developer/scaffold-project-contract.md`** — Scaffold Project source-boundary and code-change guardrail contract.
27. **`docs/developer/code-change-lane.md`** — executable Code Change Lane for draft source evidence, approved apply, rollback, rejection, and BuildThread receipt.
28. **`docs/developer/host-extension-slots.md`** — HostExtension Slot contract for portable Host-owned widgets/hooks/tools and slot compatibility validation.
29. **`docs/architecture/adr/0033-scaffold-project-contract.md`** — accepted Scaffold Project ADR: Developer-authored scaffold boundary and guardrails for governed code-change lanes.
30. **`docs/architecture/adr/0034-code-change-lane-executor.md`** — accepted Code Change Lane ADR: Scaffold Project + BuildThread become a minimal executable source-change lane.
31. **`docs/architecture/adr/0035-host-extension-slot-contract.md`** — accepted HostExtension Slot ADR: Host-owned portable contribution manifests and Developer-declared slot compatibility.
32. **`docs/developer/getting-started.md`** — developer golden path from scaffold to reference Host loops.
33. **`docs/architecture/milestone-21-snapshot.md`** — developer-onboarding snapshot.
34. **`docs/architecture/milestone-20-snapshot.md`** — boundary snapshot: Host-owned open-ended artifacts with Host-level approval.
35. **`docs/architecture/adr/0031-open-ended-definition-artifact-boundary.md`** — accepted M20 boundary.
36. **`docs/architecture/README.md`** — navigation into the ADR set, domain model, OPEN-QUESTIONS, roadmap.
37. **`docs/architecture/spec/creation-host-model.md`** — top-level product/domain boundary: Framework → Creation Host → Generated Application → Published Application.
38. **`docs/architecture/spec/creation-host-ddd-review.md`** — post-M21 DDD anchor for Creation Host Authoring, Build Agent Package/Session, sharing/forking, provider profiles, and enterprise governance.
39. **`examples/m25-alice-creation-host-prototype/README.md`** — runnable RC sharing/demo prototype for Alice's Developer cognition path.

### Canonical first action

Unless the user says otherwise, the first productive step is to **wait for the user's intent**. The RC decision is accepted; do not invent another milestone automatically. Do not fall back to treating "pneuma app" as a direct app template; keep the four-layer model explicit.

If the user explicitly asks for an implementation plan against a workstream, invoke `superpowers:writing-plans`.

### What's already decided (don't redebate without explicit signal)

- Architecture candidate **C** (core library + CLI + separate SDK packages + MCP bridge always on).
- Shell-based lifecycle is a **runtime subsystem**, not the framework's primary primitive (see [ADR-0029](docs/architecture/adr/0029-supersede-v0-design-spec.md) and [ADR-0030](docs/architecture/adr/0030-lifecycle-subsystem-contract.md)). Agent never touches scripts directly — only semantic tools.
- Operation is a first-class primitive; UI binding and Agent tool-call derive from one declaration ([ADR-0018](docs/architecture/adr/0018-operations-as-primitive.md)).
- App definition is data, not code: `pneuma_tables / pneuma_table_columns / pneuma_operations / pneuma_views / pneuma_policy_rules` are system-owned Tables; `definition.apply` mutates them through the same primitive pipeline as data mutation.
- Dev-mode crashes do **not** auto-restart; relaunch is the Build-phase Agent's decision.
- Deploy and migrate actions require framework-level Builder confirmation unless `unattendedDeploy: true`.
- Bun workspaces for the monorepo (revisit for v1 only if a concrete need emerges).
- M2 (governance hardening), M3 (deployable app substrate), M4 (Knowledge Inbox reference app), M5 (Builder evolution), M6 (backend-agent evolution), M7 (capability change-set approval), M8 (release packaging hardening), M9 (creation-to-release integrity), M10 (derived semantic index), M11 (rollout adapter v0), M12 (Reference Creation Host substrate), M13 (Host-level governed evolution), M14 (Host publish / monitor / rollback), M15 (generality pressure app), M16 (Reference Creation Host integration gate), M17 (security + architecture acceptance gate), M18 (open-ended app pressure), M19 (release-candidate review), M20 (open-ended definition artifact boundary), M21 (developer onboarding), M22 (Creation Host Authoring Kit), M23 (Sharing Governance contract), M24 (Creation Host RC pressure), M25 (Alice Creation Host prototype), M26 (Code Change Lane hardening), M27 (Runtime Diagnostic Surface), M28 (HostExtension Slot Contract), M29 (AgentBackend runTurn Contract), M30 (Host Credential Broker Utilities), and M31 (Downstream Credential Adoption Pressure) are closed.
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
- SQLite, Bun, Drizzle, and Docker are first implementations, not framework semantics. App definition remains runtime governed data, not database migrations.
- Top-level product model is **Framework → Creation Host → Generated Application → Published Application**. Reference host choices such as Bun TypeScript, local processes, role/user_id demo inputs, and version directories are implementation choices, not domain-model primitives.
- RC accepted direction: Creation Host Authoring Kit, Sharing Governance, RC pressure, and Developer-first prototype evidence are pinned enough for `pneuma-rc-0.1.0`; `pneuma-rc-0.1.1` clarifies developer contracts surfaced by external DevBoard pressure; `pneuma-rc-0.1.2` adds BuildThread as framework-owned semantic transcript; `pneuma-rc-0.1.3` adds Code Change Lane as the first executable scaffold/source-change helper; M26/M27/M28/M29/M30/M31 stabilize code-change, runtime-composition, HostExtension distribution, backend-turn, credential-helper, and downstream-adoption lanes without a release tag.
- Release-candidate tagging is no longer blocked by the open-ended definition governance boundary, missing developer onboarding, missing authoring-kit contracts, missing sharing-governance contract, missing Alice/Bob/Charlie/Dave RC pressure evidence, or missing Developer-cognition demo material. Future work should be explicitly chosen from post-RC productization or pressure lanes, not inferred as pre-RC blockers.

Open questions live in `docs/architecture/OPEN-QUESTIONS.md`; do not invent new ones silently.
