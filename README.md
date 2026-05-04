# pneuma-framework

Infrastructure for building **AI-native Creation Hosts**: applications where a Builder creates and evolves Generated Applications by talking to a Build-phase Agent.

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

## Current Status

The project is in **post-M19 pre-RC closure** after closing:

- M16: integrated Reference Creation Host workflow;
- M17: security and architecture acceptance;
- M18: open-ended Personal Focus Site pressure.
- M19: release-candidate review.

M19 found that the repo is technically close, but RC tagging should wait for one final boundary decision: whether open-ended UI/module artifacts are Host-owned with Host approval, or framework-governed through a new definition extension lane.

## Quick Start

Install dependencies:

```bash
bun install
```

Run type checks:

```bash
bun run typecheck
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
- [`docs/architecture/spec/creation-host-model.md`](./docs/architecture/spec/creation-host-model.md) — top-level product/domain model.
- [`docs/architecture/milestone-19-snapshot.md`](./docs/architecture/milestone-19-snapshot.md) — latest review snapshot and RC decision.
- [`docs/architecture/roadmap.md`](./docs/architecture/roadmap.md) — current roadmap.

Chinese readers can use the matching `.zh-CN.md` milestone and model documents under `docs/architecture/`.

## Package Map

| Package | Role |
|---|---|
| `@pneuma-framework/core-domain` | Generated Application primitives: Table, Operation, View, Policy, WhereClause, storage, semantic index, authorization. |
| `@pneuma-framework/runtime` | HTTP runtime, `/api/config`, framework-injected definition operations. |
| `@pneuma-framework/core` | lifecycle, agent backend contracts, tool bridge, permission ledger, release candidate and rollout state, Creation Host contract. |
| `@pneuma-framework/viewer-react` | React viewer/wire protocol helpers and governance UI components. |
| `@pneuma-framework/backend-opencode` | Reference backend-agent adapter for opencode. |
| `@pneuma-framework/cli` | CLI wrapper for lifecycle and backend startup. |
| `@pneuma-framework/adapter-linear` | Private reference integration, not core semantics. |
| `@pneuma-framework/provider-openrouter` | Private reference integration, not core semantics. |

## Important Boundaries

- Operation + definition-as-data is the core creation primitive.
- Lifecycle scripts are a runtime subsystem behind semantic tools.
- SQLite, Bun, Drizzle, Docker, Linear, OpenRouter, and GitHub are implementation/reference choices, not framework semantics.
- Creation Host contracts may live in core when multiple hosts need them; concrete host UX remains host/meta-app concern.

## Current Caveat

This is not a production SaaS release. The current pre-RC task is to close the open-ended definition governance boundary before tagging a **candidate release for developers building Creation Hosts**. Production IAM, hosted deployment, zero-downtime traffic switching, Runtime Agent productization, hot reload, and broad Pneuma 2.x dogfood remain post-RC work.
