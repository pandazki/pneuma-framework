# pneuma-framework

Infrastructure for building **AI-native Creation Hosts**: applications where a Builder creates and evolves Generated Applications by talking to a Build-phase Agent.

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

## Current Status

The project is in **post-M21 pre-RC closure** after closing:

- M16: integrated Reference Creation Host workflow;
- M17: security and architecture acceptance;
- M18: open-ended Personal Focus Site pressure.
- M19: release-candidate review;
- M20: open-ended definition artifact boundary.
- M21: developer onboarding path.

M20 accepted the pre-RC boundary: open-ended UI/module artifacts are Host-owned artifacts with Host-level approval in v0. They can use Host approval, transcript, inspection, release, and rollback evidence, but Pneuma does not claim they are framework-governed definition rows or `definition.apply_change_set` artifacts yet.

M21 added the developer-facing entry: scaffold a starter Creation Host, validate profile contracts, run Host diagnostics, and follow the M16/M18 examples as the golden path.

## Quick Start

Install dependencies:

```bash
bun install
```

Run type checks:

```bash
bun run typecheck
```

Scaffold a starter Creation Host:

```bash
bun packages/cli/src/index.ts scaffold-host /tmp/my-pneuma-host --name "My Pneuma Host"
```

Run diagnostics on the scaffold:

```bash
bun packages/cli/src/index.ts doctor-host \
  --workspace /tmp/my-pneuma-host/.pneuma-workspace \
  --profiles /tmp/my-pneuma-host/profiles.json
```

Run the current open-ended pressure example:

```bash
bun run examples/m18-open-ended-personal-focus-site/run.ts --port 8879
```

Then open:

```text
http://127.0.0.1:8879/
```

For an automated smoke:

```bash
bun run examples/m18-open-ended-personal-focus-site/run.ts --port 0 --smoke-exit
```

## Where To Read

Start here:

- [`AGENTS.md`](./AGENTS.md) — session orientation and non-negotiable model boundary.
- [`docs/architecture/README.md`](./docs/architecture/README.md) — architecture docs index.
- [`docs/architecture/team-share-demo.md`](./docs/architecture/team-share-demo.md) — zero-prep team-share package from top-level goal to current demo and RC decision.
- [`docs/developer/getting-started.md`](./docs/developer/getting-started.md) — developer golden path from scaffold to reference Host loops.
- [`docs/developer/creation-host-contract.md`](./docs/developer/creation-host-contract.md) — minimum Creation Host contract, schema-driven/open-ended boundary, and diagnostics.
- [`docs/architecture/spec/creation-host-model.md`](./docs/architecture/spec/creation-host-model.md) — top-level product/domain model.
- [`docs/architecture/milestone-19-snapshot.md`](./docs/architecture/milestone-19-snapshot.md) — latest review snapshot and RC decision.
- [`docs/architecture/milestone-20-snapshot.md`](./docs/architecture/milestone-20-snapshot.md) — latest boundary snapshot before final RC decision.
- [`docs/architecture/milestone-21-snapshot.md`](./docs/architecture/milestone-21-snapshot.md) — latest developer-onboarding snapshot before final RC decision.
- [`docs/architecture/adr/0031-open-ended-definition-artifact-boundary.md`](./docs/architecture/adr/0031-open-ended-definition-artifact-boundary.md) — accepted M20 open-ended artifact boundary.
- [`docs/architecture/roadmap.md`](./docs/architecture/roadmap.md) — current roadmap.

Chinese readers can use the matching `.zh-CN.md` milestone and model documents under `docs/architecture/`.

## Package Map

| Package | Role |
|---|---|
| `@pneuma-framework/core-domain` | Generated Application primitives: Table, Operation, View, Policy, WhereClause, storage, semantic index, authorization. |
| `@pneuma-framework/runtime` | HTTP runtime, `/api/config`, framework-injected definition operations. |
| `@pneuma-framework/core` | lifecycle, agent backend contracts, tool bridge, permission ledger, release candidate and rollout state, Creation Host contract, profile validation, and workspace diagnostics. |
| `@pneuma-framework/viewer-react` | React viewer/wire protocol helpers and governance UI components. |
| `@pneuma-framework/backend-opencode` | Reference backend-agent adapter for opencode. |
| `@pneuma-framework/cli` | CLI wrapper for lifecycle/backend startup plus developer onboarding commands (`scaffold-host`, `doctor-host`). |
| `@pneuma-framework/adapter-linear` | Private reference integration, not core semantics. |
| `@pneuma-framework/provider-openrouter` | Private reference integration, not core semantics. |

## Important Boundaries

- Operation + definition-as-data is the core creation primitive.
- Lifecycle scripts are a runtime subsystem behind semantic tools.
- Host-owned open-ended UI/module artifacts are allowed in v0, but they are not framework definition rows unless a later extension-lane ADR promotes that shape.
- SQLite, Bun, Drizzle, Docker, Linear, OpenRouter, and GitHub are implementation/reference choices, not framework semantics.
- Creation Host contracts may live in core when multiple hosts need them; concrete host UX remains host/meta-app concern.

## Current Caveat

This is not a production SaaS release. The next pre-RC task is a final release-candidate decision after M21 developer-onboarding verification. Production IAM, hosted deployment, zero-downtime traffic switching, Runtime Agent productization, hot reload, and broad Pneuma 2.x dogfood remain post-RC work.
