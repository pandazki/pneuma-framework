# Packages — Status Index

**Last updated:** 2026-11-24
**Purpose:** label each package's lifecycle state so new contributors can tell which packages carry the current milestone and which are kept as reference.

Status convention:

- **canonical** — currently load-bearing in the milestone story, actively tested as milestone evidence.
- **reference** — validates a specific ADR / primitive face but is not in the milestone demo; kept as teaching / regression.
- **archived** — historical, preserved but not actively maintained; superseded by a newer package.
- **scratch** — experimental / spike, not for general use.

Every package ships TypeScript source consumed by Bun; the entry is `src/index.ts` unless the row names subpaths.

| Package | Status | Role | Last touched |
|---|---|---|---|
| [`host-kit`](./host-kit/) | **canonical** | `@pneuma-framework/host-kit`, the Creation Host Implementation Kit ([ADR-0038](../docs/architecture/adr/0038-creation-host-implementation-kit.md)): governed code-change review/apply, code-agent debug loop, approval, local runtime adapters. Subpaths `./change-record` (the change record floor under every mode, [ADR-0039](../docs/architecture/adr/0039-change-record-floor-and-declared-reversibility.md)), `./governed-change` (`buildGovernedProposal`) and `./workspace`. `examples/space-all-in-one` uses all three subpaths. | 2026-11-24 |
| [`core`](./core/) | **canonical** | `@pneuma-framework/core`: Operation pipeline, lifecycle orchestration, permission ledger, BuildThread, Code Change Lane, build assurance, agent-backend registry, MCP bridge, viewer wire protocol; about twenty subpaths. `examples/space-all-in-one` uses `./enterprise-governance`, `./release-rollout`, `./release-rollout-store`, `./build-thread` and `./build-assurance`. | 2026-11-23 |
| [`core-domain`](./core-domain/) | **canonical** | `@pneuma-framework/core-domain`: pure domain primitives (value objects; Table/Row/Operation/View/Policy aggregates; services; definition-as-data lifecycle tables), in-memory and local-fs only. `core` and `runtime` build on it. | 2026-06-23 |
| [`cli`](./cli/) | **canonical** | `@pneuma-framework/cli`, binary `pneuma-framework` (`src/index.ts`): `scaffold-host` and `doctor-host` for Creation Hosts, and `record` (`init`, `save`, `history`, `status`, `restore`), the change record for a coding agent with no Host. | 2026-11-24 |
| [`backend-codex`](./backend-codex/) | **canonical** | `@pneuma-framework/backend-codex`: Codex app-server code-agent lane for governed code-change turns. Opt-in; the core never depends on it. The host-driven Codex lane of `examples/space-all-in-one` runs on it. | 2026-11-23 |
| [`backend-claude-code`](./backend-claude-code/) | **canonical** | `@pneuma-framework/backend-claude-code`: Claude Code code-agent lane through `claude -p` with stream-json output. Opt-in; the core never depends on it. The host-driven Claude Code lane of `examples/space-all-in-one` runs on it. | 2026-11-23 |
| [`runtime`](./runtime/) | **reference** | `@pneuma-framework/runtime`: HTTP runtime that turns a core-domain app definition into a live HTTP application; subpaths `./constants`, `./http`, `./runtime`, `./runtime-ready`. Used by the definition-as-data templates and the M4-M15 and P-series examples; `host-kit` lists it as a dependency. Not used by the M54 example. | 2026-11-23 |
| [`viewer-react`](./viewer-react/) | **reference** | `@pneuma-framework/viewer-react`: React SDK for the viewer wire protocol. Used by `examples/p5-viewer-approval-e2e` and the archived `templates/ai-bookmarks`. | 2026-06-23 |
| [`backend-opencode`](./backend-opencode/) | **reference** | `@pneuma-framework/backend-opencode`: opencode AgentBackend. Used by the M6, M7 and M13 examples, the Reference, Product and Workflow App Studio Hosts (M45-M48), and `cli`. | 2026-06-23 |
| [`adapter-vercel`](./adapter-vercel/) | **reference** | `@pneuma-framework/adapter-vercel`: deploy and receipt Generated Application releases through the Vercel REST API. Opt-in reference adapter, used by `examples/clean-room-release-host`. | 2026-06-23 |
| [`adapter-neon`](./adapter-neon/) | **reference** | `@pneuma-framework/adapter-neon`: provision and bind Neon Postgres branches for published Generated Applications. Opt-in reference adapter, used by `examples/clean-room-release-host`. | 2026-06-23 |
| [`adapter-linear`](./adapter-linear/) | **reference** | `@pneuma-framework/adapter-linear` (private): reference Linear integration — GraphQL client, Adapter aggregate, AdapterImpl mapping. Used by `templates/weekly-linear-digest`; not framework core. | 2026-06-23 |
| [`provider-openrouter`](./provider-openrouter/) | **reference** | `@pneuma-framework/provider-openrouter` (private): reference OpenRouter LLMProvider. Used by `templates/weekly-linear-digest`; not framework core. | 2026-06-23 |

## Notes

- Every package here is a workspace member, runs under `bun run typecheck`, and its tests run in the blocking CI job (`bun run test:packages`).
- "Reference adapter" in a package's own README describes its role (opt-in, the core never depends on it); the status column describes its place in the current milestone story. `backend-codex` and `backend-claude-code` are both.
- No package is archived or scratch today. See [`docs/architecture/roadmap.md`](../docs/architecture/roadmap.md) for milestone sequencing and [`examples/README.md`](../examples/README.md) / [`templates/README.md`](../templates/README.md) for the other two indexes.
