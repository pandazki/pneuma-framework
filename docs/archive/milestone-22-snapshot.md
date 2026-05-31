# Milestone 22 Snapshot: Creation Host Authoring Kit

**Status:** Closed after Build Agent Package manifests, provider capability matrices, portable share artifacts, scaffold integration, Host doctor diagnostics, provider parity contracts, and full core/CLI/typecheck verification

**Date:** 2026-05-05

## Why M22 Exists

M21 made it possible for a new Developer to scaffold and diagnose a starter Creation Host.

The next gap came from the Bob / Charlie / Dave story:

```text
Alice builds a product on pneuma-framework.
Bob uses Alice's Creation Host to build dev-board.
Charlie installs Bob's shared app with Bob's default settings.
Dave forks Bob's app, switches provider profile, removes Apple Notes, and deploys elsewhere.
```

That story is not mainly about SQLite, Postgres, Docker, GitHub, or Linear. It exposes a deeper authoring question:

> How does a Developer prepare the Build Agent, provider choices, credential boundary, and share/fork recipe so Builders can create portable apps without the agent leaking provider-specific implementation decisions?

M22 closes the first contract-backed answer. It does not make a full marketplace, credential broker, installer, or production migration engine. It gives Developers a machine-readable Authoring Kit shape that can be scaffolded, tested, diagnosed, and evolved.

## What Changed

### 1. Build Agent Package Manifest

`@pneuma-framework/core` now exports a first contract for a Developer-authored Build Agent Package:

```ts
validateBuildAgentPackageManifest(manifest)
```

The manifest declares:

- package id and version;
- instructions path;
- semantic tool allowlist;
- provider capability matrix id;
- provider-specialization policy;
- credential boundary;
- review checklist;
- verification hooks.

The important M22 invariant is:

```text
Build Agent Package = Developer-authored guardrail package
Build Agent Session = Builder-specific runtime instance created from that package
```

The framework validates the package shape. The Host still owns the product policy, agent instructions, and Builder-facing experience.

### 2. Provider Capability Matrix

`@pneuma-framework/core` now exports:

```ts
validateProviderCapabilityMatrix(matrix)
```

The matrix declares:

- capabilities such as `relational-store`, `github-issues`, `semantic-index`, or `local-notes`;
- provider/profile support;
- unsupported capabilities and fail-closed behavior;
- credential requirements;
- parity contracts across profiles that claim the same capability.

This is the SQLite/PG boundary:

```text
Build Agent works against capability contracts.
Provider implementations are Developer/Host responsibility.
```

If two profiles both claim `relational-store`, M22 requires a parity contract and verification hook. That prevents "SQLite path" or "Postgres branch" from becoming hidden Build Agent behavior.

### 3. Portable Share Artifact Manifest

`@pneuma-framework/core` now exports:

```ts
validateShareArtifactManifest(manifest)
```

The share artifact is explicitly a portable recipe, not a database copy:

```text
includes:
  app_definition
  init_recipe
  provider_requirements

excludes:
  secrets
  private_derived_cache
  source_database
```

Init steps must be idempotent semantic operations. Receiving Builders must re-bind their own credentials.

That means Bob can share `dev-board` without exporting Bob's SQLite volume, GitHub token, Linear token, Apple Notes data, or private derived cache.

### 4. Cross-Contract Validation

`@pneuma-framework/core` now exports:

```ts
validateHostAuthoringKitContracts({
  agent_package,
  provider_capabilities,
  share_artifact,
})
```

This checks the authoring files as one kit:

- the Build Agent Package references the provider matrix;
- provider parity verification hooks exist in the package;
- the share artifact references a known source profile;
- target profiles exist and satisfy required capabilities;
- package id/version match the share artifact;
- no raw source database or secret-like material is embedded.

### 5. Scaffold + Doctor Integration

`pneuma-framework scaffold-host` now emits:

```text
agent-package.json
provider-capabilities.json
share-artifact.example.json
agent-policy.md
```

The scaffolded package doctor script validates these files.

`pneuma-framework doctor-host` now accepts:

```bash
--agent-package ./agent-package.json
--provider-capabilities ./provider-capabilities.json
--share-artifact ./share-artifact.example.json
```

Doctor now reports authoring-kit diagnostics alongside workspace/profile diagnostics.

### 6. Developer Guides

The developer guides now describe the Authoring Kit boundary:

- [Creation Host Contract](../developer/creation-host-contract.md)
- [Creation Host Contract 中文版](../developer/creation-host-contract.zh-CN.md)
- [Getting Started](../developer/getting-started.md)
- [Getting Started 中文版](../developer/getting-started.zh-CN.md)

## What M22 Proves

M22 proves the framework can help a Developer author a Creation Host without taking over the Host product:

```text
Developer declares a Build Agent Package
  -> declares provider capability profiles
  -> declares credential requirements
  -> declares portable share/fork artifact shape
  -> scaffold emits the files
  -> doctor diagnoses them
  -> core validators make the contract testable
```

This is the first concrete bridge between the top-level four-artifact model and the future shared-app / team / org story.

The Build Agent now has a contractually clean context:

```text
Allowed:
  profile_id
  capabilities
  credential_requirements
  semantic tools

Forbidden:
  raw secrets
  copied source databases
  provider-specific implementation branches
```

## What M22 Does Not Prove

M22 does not claim:

- real credential broker implementation;
- OAuth or enterprise identity integration;
- actual SQLite-to-Postgres data migration;
- production installer or marketplace;
- runtime provider switching after publish;
- automatic vector-store rebuild;
- multi-user or organization sharing governance;
- polished Host Authoring Assistant that generates these files for Developers.

Those are intentionally outside this slice. The goal was to pin the contract boundary before moving into team/org sharing.

## Bob / Charlie / Dave Walkthrough After M22

```text
Bob builds dev-board
  profile: local-sqlite-docker
  capabilities: relational-store, github-issues, linear-projects, apple-notes
  credentials: Bob re-binds GitHub/Linear locally

Bob shares dev-board
  artifact includes app definition + semantic init recipe + provider requirements
  artifact excludes secrets + source database + private derived cache

Charlie installs default
  target profile: local-sqlite-docker
  Host verifies required capabilities
  Charlie re-binds credentials
  init recipe replays semantic operations

Dave forks to remote
  target profile: remote-postgres-docker
  Host verifies relational-store parity contract
  unsupported apple-notes fails closed
  Dave removes Apple Notes before publish
  Dave re-binds credentials and deploys with his profile
```

This is still conceptual/runtime-contract work, not a full product installer. But the key ambiguity is gone: the share unit is a recipe, the credentials are re-bound, and the Build Agent works against capabilities rather than provider-specific branches.

## Verification Evidence

Focused Authoring Kit tests:

```text
bun test packages/core/test/host-authoring.test.ts packages/core/test/developer-experience.test.ts packages/cli/test/developer-experience.test.ts
23 pass
0 fail
74 expect() calls
```

Core/domain/CLI regression:

```text
bun test packages/core-domain packages/core packages/cli
812 pass
0 fail
2493 expect() calls
```

Typecheck:

```text
bun run typecheck
exit 0
```

Diff whitespace check:

```text
git diff --check
exit 0
```

## RC Boundary After M22

M22 narrows the next decision:

```text
M22 closes Creation Host Authoring Kit contracts
  -> Developer can scaffold and test authoring files
  -> Build Agent package / provider matrix / share artifact boundary is explicit
  -> next major pressure is team/org sharing governance
```

The project should not keep expanding provider abstraction for its own sake. The useful next question is the second large product question already identified in the DDD review:

> How do multiple Builders / users / organizations safely share, fork, approve, and operate Generated Applications?
