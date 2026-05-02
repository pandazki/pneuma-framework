# M8 Design: Release Packaging Hardening

**Date:** 2026-05-02
**Status:** Approved design direction
**Scope:** package a Builder-evolved Knowledge Inbox app into a durable release artifact.

## Context

M7 proves that a real Build-phase Agent can submit one governed capability proposal and wait for one Builder approval. The approved result is still a dev-mode app: the running Knowledge Inbox gains a Priority Queue capability through app-definition data, restart rediscovery, and visible transcript evidence.

M8 moves the next boundary from "the app evolved" to "the evolved app can be released." It should not try to solve production rollout orchestration. It should prove that the post-evolution app state can be packaged, started as a release container, restarted, and rediscovered through the same primitive surfaces.

## Claim

M8 proves:

> A Builder/Agent-evolved Knowledge Inbox can become a release artifact whose Docker runtime uses a mounted SQLite volume, exposes the evolved app definition through `/api/config`, serves the Priority Queue operation, and preserves that capability after container restart.

## Release Input

The release input is a local Knowledge Inbox workspace after the Priority Queue capability exists. M8 may create that state deterministically in test setup by applying the same governed app-definition changes that M5-M7 use. This keeps release packaging deterministic and avoids coupling the release smoke to opencode planning reliability.

The capability must include:

- `inbox_items.priority` column
- `list_priority_queue` query-backed read Operation
- `priority_queue` View
- read PolicyRule for the new View
- three demo rows with priorities `P1`, `P2`, and `P3`

## Artifact Contract

The Knowledge Inbox `build.sh` release manifest must be treated as a real contract. M8 should verify:

- `schemaVersion: 1`
- web process command runs `server/app.ts`
- health endpoint is `/healthz`
- release data volume is `/data`
- SQLite path is `/data/app.db`
- migration command exists and points at `scripts/migrate.sh`
- `deployHints.requiresMigration` is true
- runtime agent is explicitly absent for this slice

## Runtime Contract

The release container must:

- run from `templates/knowledge-inbox-core-domain/Dockerfile`
- mount the evolved workspace data directory to `/data`
- start with `PNEUMA_WORKSPACE=/data`, `PNEUMA_DATA_DIR=/data`, `PNEUMA_SQLITE_PATH=/data/app.db`
- pass `/healthz`
- expose the evolved definition through `/api/config`
- serve `GET /api/operations/list_priority_queue`
- keep the same capability after `docker restart`

## Boundaries

M8 does not claim:

- rolling traffic shift between old and new app versions
- registry push or cloud deployment
- automatic rollback on failed rollout
- concurrent multi-runtime SQLite writes
- production secret management
- production IAM
- runtime agent in release mode
- model planning reliability

Those remain later release/deploy concerns. M8's job is to harden the release artifact boundary.

## Test Strategy

Use TDD around one high-signal smoke:

1. Prepare an evolved Knowledge Inbox workspace.
2. Run `scripts/migrate.sh`.
3. Run `scripts/build.sh` and inspect `build.manifest.json`.
4. Build the Docker image.
5. Run the container with the prepared data directory mounted at `/data`.
6. Verify `/healthz`, `/api/config`, and `list_priority_queue`.
7. Restart the container and verify the same surfaces again.

The test should live under `examples/m8-release-packaging-hardening/` so M8 is a clear milestone artifact rather than a hidden template regression.

## Demo Story

The team-share narrative should be:

```text
M7: the Builder approved one capability proposal.
M8: that updated app state became a release container.

Dev workspace -> SQLite app.db -> build manifest -> Docker image -> mounted /data -> restart -> rediscovered Priority Queue.
```

