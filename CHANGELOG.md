# Changelog

All notable changes to `pneuma-framework` are recorded here. The project follows
the four-layer model (Framework → Creation Host → Generated Application →
Published Application); entries describe what changed in the **framework** and its
reference packages, not in any particular Host.

Format is loosely based on [Keep a Changelog](https://keepachangelog.com/). Until
1.0 the framework ships TypeScript source consumed by Bun (via `file:`/git), not
built `dist` artifacts on the npm registry.

## [0.5.0] — 2026-06-23

The **public-API freeze** train. 0.5.0 makes the framework's published surface
explicit and auditable so it can carry a real semver contract: every barrel
`export *` star has been enumerated into named re-exports in place. No symbol was
added, removed, or relocated — every name reachable in 0.4.0 stays reachable from
the same import path. This is a non-breaking freeze, deliberately deferring any
structural surface split (see the SQLite/Drizzle note below) to 0.6.0.

### Changed

- **Public API surface is now explicit and frozen.** The wildcard re-exports in
  the package barrels were replaced with explicit `export { … }` / `export { type … }`
  lists:
  - `@pneuma-framework/core-domain` (`src/index.ts`) — 41 `export *` stars
    enumerated.
  - `@pneuma-framework/runtime` (`src/index.ts`) — 5 `export *` stars enumerated.
  - `@pneuma-framework/core` (`src/index.ts`) — the single
    `runtime-data-governance` `export *` star enumerated.

  Package `exports` maps were not touched; the change is purely about writing the
  re-exported names out so the surface is reviewable and controllable.

- **Viewer SDK promise corrected.** The charter previously implied two built-in
  SDKs (React + Vanilla JS); only the React SDK ships. Docs (README, spec, CLAUDE.md,
  AGENTS.md) now state: a React SDK on top of an **open wire protocol**; a vanilla /
  other-stack SDK is bring-your-own, not shipped.

### Added

- **CI gate** (`.github/workflows/ci.yml`) — a required **offline gate**
  (typecheck + package/template test suites + the local-package-consumption gate)
  on every push and pull request; the network-bound example E2E suites are isolated
  to a separate, non-blocking **live gate**.
- **`description` fields** on all 12 published `package.json` files.
- **`Scope & boundaries`** section in the README — explicit declaration that the
  runtime is Bun-only, what the framework owns, and what is explicitly Host-owned
  (multi-tenant identity / IAM, hosted secret vaults, real provider SDKs, cloud
  deployment control planes, compliance/audit retention).
- **`docs/developer/scaffold-to-host-walkthrough.md`** — a linear, copy-pasteable
  bridge from `scaffold-host` to a runnable Creation Host, plus an honest list of
  current scaffold gaps slated for 0.6.x.
- This release was validated by a fresh clean-room downstream project consuming the
  frozen packages via `file:` — the freeze dropped no symbol.

### Fixed

- **`@pneuma-framework/host-kit` no longer ships `workspace:*` dependencies.** It
  was the only package still leaking `workspace:*`, which broke `file:` consumption
  by downstream projects. Converted to `file:`, and host-kit is now exercised by the
  local-package-consumption gate so the regression cannot recur.
- **`scaffold-host` emits installable framework dependency paths when the CLI is
  installed via `file:`.** Resolution now follows the package graph
  (`import.meta.resolve`) instead of an in-monorepo layout assumption, so a
  scaffolded Host's `bun install` succeeds outside the monorepo.

### Semver intent

- 0.5.x treats the enumerated barrels as the committed public surface. Within
  0.5.x, additions are minor/patch; any removal or relocation of a currently
  reachable symbol is a breaking change reserved for a future major-intent train.

### Removed

- **The five legacy build-thread message helpers are removed (breaking vs 0.4.0).**
  They were thin aliases over the provider-neutral role/content surface and are
  no longer exported from `@pneuma-framework/core`:
  - `PackedAgentMessage`, `AnthropicMessage`, `OpencodeMessage` →
    use `BuildTurnRoleContentMessage`.
  - `pneumaTurnsToAnthropicMessages`, `pneumaTurnsToOpencodeMessages` →
    use `packBuildTurnsForRoleContent`.

### Notes

- The `@pneuma-framework/core-domain` SQLite/Drizzle layer (`repositories/bun-sqlite*`,
  `persistence/sqlite/*`, and `repositories/cell-codec`) is intentionally left in
  the main public barrel for 0.5.0 so this freeze stays non-breaking. It is a
  candidate to move behind a dedicated `/sqlite` subpath export in 0.6.0; that
  relocation is breaking and is deliberately deferred.

## [0.4.0] — 2026-05-31

The **implementation-framework / production-host** train. Where 0.1–0.3 pinned
contracts and governance vocabulary, 0.4.0 makes a real, full-stack Creation Host
*consume* the framework instead of re-deriving it — proven end-to-end against a
real code agent, a real database, and a real cloud deploy. Rolls up M45–M53.

### Added

- **`@pneuma-framework/host-kit`** — the Creation Host Implementation Kit (M45).
  Workspace mechanics (`copy` / `list` / `diff` / protected-root checks) and
  `buildGovernedProposal`: a closure-driven, fail-closed governed-change backbone.
  The Host passes `runAgent` / `isAgentTimeout` / `verify` / `observe`; the
  framework owns the sequencing and the gates.
- **Batteries-included reference adapters** (opt-in packages; the framework core
  never depends on them):
  - `@pneuma-framework/backend-codex` — the Codex app-server code-agent lane,
    with completion-signal-set handling and a fail-closed turn timeout.
  - `@pneuma-framework/adapter-vercel` — Vercel REST deploy (content-addressed
    two-phase upload, READY poll, structured receipt).
  - `@pneuma-framework/adapter-neon` — Neon copy-on-write branching for Preview
    Data Rehearsal.
- **Production Generated App scaffold profile** (M52) — a Developer-authored
  Bun + Hono + React + Drizzle + Zod stack with a Neon boundary and Docker/Vercel
  targets. A profile choice, not framework semantics.
- **Production-profile Creation Host integration** (M53) — the full governed loop
  wired end-to-end: create-from-profile → disposable preview → code-agent draft →
  verify gate → proposal → approve/apply (`vNext`) → publish (Neon migrate +
  Vercel REST) → rollback, with both a deterministic lane and a real-Codex lane.
- **Workflow App Studio** reference Host line (M48), the **Agent Debug Loop**
  (M49 / ADR-0049: budgeted pre-proposal repair attempts, fail-closed to
  no-proposal), and the M50/M51 lifecycle-UX and verification hardening.
- **Documentation site** (`site/`, VitePress, bilingual EN / 简体中文,
  GitHub Pages): top-down Architecture, a second-level Concepts deep-dive section
  (verify gate, proposal evidence, apply/versions, publish receipts, rollback,
  preview rehearsal, the two change models, definition-as-data, BuildThread), a
  goal-driven Build-a-Host guide, a coding-agent router, and a root `llms.txt`.
- **Clean-room reproductions** — `examples/clean-room-release-board` (Generated
  App scaffold) and `examples/clean-room-release-host` (Creation Host studio),
  built from the goal alone and exercising the whole loop against live
  Codex / Neon / Vercel.

### Changed

- All framework packages bumped `0.2.0` → `0.4.0`.
- Host Kit's governed-change backbone is now the canonical proposal gate; the
  reference examples consume it rather than hand-rolling the sequence (M46/M47).

### Notes

- Vercel/Neon adapters and the structured deploy receipt remain Host/example-local
  by design; promoting the receipt into a framework package is a deliberate
  post-RC decision, not a gap.

## [0.3.0] — 2026-05-12 (release-candidate train; snapshot accepted)

Minimum **enterprise-governance** train (M40–M43). Adds a framework-owned
role/route/evaluator vocabulary for build-change governance, without becoming an
identity or audit platform.

- Explicit governance roles — `builder`, `reviewer`, `owner`, `operator`,
  `end_user` — *mapped* by the Host, not authenticated by the framework.
- `BuildChangeGovernancePolicy` routes standard changes to a Reviewer and
  high-risk changes to an Owner.
- Fail-closed decisions: Builder self-approval does not satisfy required review;
  denials block; app mismatch fails closed. Governance is wired into Build Change
  Assurance so `ready_to_publish` blocks when review is required and not allowed.
- Identity, team directory, workflow assignment, credential vaulting, and audit
  retention stay Host-owned.

## [0.2.0] — release-candidate train (developer contract + package consumption)

The first versioned roll-up after post-RC stabilization (M26–M38). Packages the
Developer-facing contract so a fresh downstream Host can install the framework
locally and adopt the assurance loop.

- Hardened **Code Change Lane** (proposal/apply/reject over draft workspaces),
  explicit **runtime composition** (mode, health diagnostics, request
  fallthrough, readiness), and the **HostExtension slot** contract.
- `AgentBackend.runTurn` over BuildThread source-of-truth turns; shared
  **credential utilities** (session hashing, OAuth state, no-secret rebinding
  evidence).
- **Build Assurance** lane: review packets, assurance cases, a durable case
  store, and the recovery-drill matrix, with an adoption guide.
- **Package-consumption gate** (`bun run test:package-consumption`): developer
  packages use `file:` internal deps and focused subpath exports, verified by a
  repo-external smoke gate.

## [0.1.3] — Code Change Lane (executable)

Adds the minimal executable bridge from Scaffold Project + BuildThread to governed
source changes (ADR-0034): prepare proposal evidence from a draft workspace, apply
only after approval, fail stale bases before mutation, roll back failed post-apply
checks.

## [0.1.2] — BuildThread

Adds BuildThread (ADR-0032): the framework-owned semantic transcript of Builder
conversation (proposal / decision / execution-receipt turns) as the portable
source of truth, with backend-native sessions demoted to cache/optimization.

## [0.1.1] — developer-contract clarifications

Surfaces conventions exposed by external (DevBoard) downstream pressure: hidden
runtime, AppConfig, rollout, and Authoring Kit conventions; clarifies the
developer contracts a downstream Host actually consumes.

## [0.1.0] — first developer-facing candidate

The first release candidate (M21–M25):

- **Creation Host Authoring Kit** contracts (`BuildAgentPackageManifest`,
  `ProviderCapabilityMatrix`, `ShareArtifactManifest`, provider parity hooks).
- **Sharing Governance** contracts (`SharingGovernanceManifest`,
  `CredentialRebindingEvidence`, share/fork/install rights, fork lineage,
  no-secret credential rebinding).
- RC pressure evidence (Alice/Bob/Charlie/Dave) and Developer-first onboarding
  (`scaffold-host`, `doctor-host`, the profile contract helpers).

[0.4.0]: https://github.com/pandazki/pneuma-framework/releases/tag/v0.4.0
