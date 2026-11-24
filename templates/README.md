# Templates — Status Index

**Last updated:** 2026-11-24
**Purpose:** label each template's lifecycle state so new contributors do not mistake a dormant template for a canonical reference path.

Status convention:

- **canonical** — currently load-bearing in a milestone story, actively tested as milestone evidence.
- **reference** — validates a specific ADR / primitive face but is not the active milestone demo path; kept as teaching / regression.
- **archived** — historical, preserved but not actively maintained; superseded by a newer template.
- **scratch** — experimental / spike, not for general use.

| Template | Status | Role | Last touched |
|---|---|---|---|
| [`bookmarks-core-domain`](./bookmarks-core-domain/) | **canonical** | M1 demo data model; consumed by `examples/p5-viewer-approval-e2e`. In smoke suite. | 2026-05-04 |
| [`knowledge-inbox-core-domain`](./knowledge-inbox-core-domain/) | **canonical** | M4-M8 reference app on the M3 deployable substrate; captures, triages, evolves through `definition.apply_change_set`, hosts live Builder approval evidence, and now ships through release packaging smoke. In smoke suite. | 2026-05-04 |
| [`weekly-linear-digest`](./weekly-linear-digest/) | **reference** | Validates [ADR-0021](../docs/architecture/adr/0021-admin-delegated-credential.md) (admin_delegated credential) + Linear adapter protocol ([ADR-0004](../docs/architecture/adr/0004-adapter-protocol.md)). In smoke suite. | 2026-05-04 |
| [`ai-bookmarks-core-domain`](./ai-bookmarks-core-domain/) | **reference** | Embedding + graph primitive validation (was 主线 A); not in M1 demo story. | 2026-05-04 |
| [`minimal`](./minimal/) | **reference** | Smallest possible template — exercises the lifecycle script protocol (`dev.sh` + `##pneuma:` markers) end to end. Useful when bringing up a fresh stack. | 2026-04-21 |
| [`doc`](./doc/) | **reference** | Single-document doc-mode template — partial scaffold only (no `package.json`). Kept for future doc-mode reactivation. | 2026-04-22 |
| [`ai-bookmarks`](./ai-bookmarks/) | **archived** | Predates the core-domain refactor; superseded by `ai-bookmarks-core-domain`. Not actively maintained. | 2026-04-22 |

## Notes

- **canonical / reference** templates are workspace members and run under `bun run typecheck`.
- **archived** templates are kept in-tree to preserve git context and to keep older examples runnable, but new work should not target them.
- `weekly-linear-digest` depends on package-level `reference-integration`s (`adapter-linear`, `provider-openrouter`). Those packages validate external integration SPI; they are not part of the framework core primitive story.
- See [`docs/architecture/roadmap.md`](../docs/architecture/roadmap.md) for current milestone sequencing. The M4-M8 pressure-test line now lives in `knowledge-inbox-core-domain`.
- No template here is part of the M45-M54 stories. `examples/space-all-in-one` (M54) creates apps from PneumaSpace's own `templates/app`, and the M52/M53 production profile and its clean-room rebuild live under `examples/`. The two **canonical** templates are canonical for the M1 and M4-M16 lines, whose examples [`examples/README.md`](../examples/README.md) still lists as canonical.
