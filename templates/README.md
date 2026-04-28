# Templates — Status Index

**Last updated:** 2026-04-28
**Purpose:** label each template's lifecycle state so new contributors do not mistake a dormant template for a canonical reference path.

Status convention:

- **canonical** — currently load-bearing in the M1 milestone story, actively tested as M1 evidence.
- **reference** — validates a specific ADR / primitive face but not in the M1 demo story; kept as teaching / regression.
- **archived** — historical, preserved but not actively maintained; superseded by a newer template.
- **scratch** — experimental / spike, not for general use.

| Template | Status | Role | Last touched |
|---|---|---|---|
| [`bookmarks-core-domain`](./bookmarks-core-domain/) | **canonical** | M1 demo data model; consumed by `examples/p5-viewer-approval-e2e`. In smoke suite. | 2 hours ago |
| [`weekly-linear-digest`](./weekly-linear-digest/) | **reference** | Validates [ADR-0021](../docs/architecture/adr/0021-admin-delegated-credential.md) (admin_delegated credential) + Linear adapter protocol ([ADR-0004](../docs/architecture/adr/0004-adapter-protocol.md)). In smoke suite. | 2 hours ago |
| [`ai-bookmarks-core-domain`](./ai-bookmarks-core-domain/) | **reference** | Embedding + graph primitive validation (was 主线 A); not in M1 demo story. | 4 days ago |
| [`minimal`](./minimal/) | **reference** | Smallest possible template — exercises the lifecycle script protocol (`dev.sh` + `##pneuma:` markers) end to end. Useful when bringing up a fresh stack. | 7 days ago |
| [`doc`](./doc/) | **reference** | Single-document doc-mode template — partial scaffold only (no `package.json`). Kept for future doc-mode reactivation. | 6 days ago |
| [`ai-bookmarks`](./ai-bookmarks/) | **archived** | Predates the core-domain refactor; superseded by `ai-bookmarks-core-domain`. Not actively maintained. | 6 days ago |

## Notes

- **canonical / reference** templates are workspace members and run under `bun run typecheck`.
- **archived** templates are kept in-tree to preserve git context and to keep older examples runnable, but new work should not target them.
- See [`docs/architecture/roadmap.md`](../docs/architecture/roadmap.md) §"M2 候选 workstream" — second reference app pressure test will likely come from this directory before M2 closes.
