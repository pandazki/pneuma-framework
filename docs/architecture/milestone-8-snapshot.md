# Milestone 8 Snapshot: Release Packaging Hardening

**Date:** 2026-05-02
**Status:** Closed after Docker release smoke verification
**Audience:** teammates with zero Pneuma context
**Scope:** what M8 proves, what it deliberately does not prove, and what should come next.
**Chinese version:** [Milestone 8 Snapshot zh-CN](./milestone-8-snapshot.zh-CN.md)

## Executive Summary

M7 proved that a Builder can approve one coherent capability proposal from a real Build-phase Agent. M8 asks the next practical question:

> After the app has been evolved, can that updated app state become a release artifact?

M8 closes the first version of that release boundary. The evolved Knowledge Inbox workspace now goes through:

```text
governed Priority Queue evolution
  -> SQLite app.db
  -> build.manifest.json
  -> Docker image
  -> mounted /data volume
  -> release container
  -> /api/config rediscovery
  -> list_priority_queue API
  -> docker restart
  -> same capability still visible
```

This is not rolling update yet. It does not shift traffic between old and new versions. It proves the prerequisite: the app state produced by Builder/Agent evolution can be packaged and run as a restartable release container.

## What Changed

M8 adds a new milestone example:

```text
examples/m8-release-packaging-hardening/
  release-packaging-smoke.test.ts
  release-packaging-smoke.sh
  seed-evolved-knowledge-inbox.ts
  assert-build-manifest.ts
  assert-release-capability.ts
  README.md
```

The smoke prepares the same Priority Queue capability used by M5-M7:

| Definition change | Release expectation |
|---|---|
| `inbox_items.priority` column | `/api/config` exposes the column in the release container. |
| `list_priority_queue` Operation | `GET /api/operations/list_priority_queue` works in release. |
| `priority_queue` View | `/api/config.views` includes the released View. |
| View read PolicyRule | `/api/config.policy_rules` includes a read rule for the View. |
| P1/P2/P3 rows | Release API returns the demo priorities before and after restart. |

## Release Contract

M8 makes the Knowledge Inbox `build.manifest.json` part of the proof surface:

```json
{
  "schemaVersion": 1,
  "entrypoint": "server/app.ts",
  "processes": {
    "web": {
      "command": "bun server/app.ts",
      "health": "/healthz"
    }
  },
  "data": {
    "volume": "/data",
    "sqlite": "/data/app.db"
  },
  "migrations": {
    "command": "scripts/migrate.sh",
    "direction": "up"
  },
  "deployHints": {
    "requiresMigration": true,
    "runtimeAgent": "none"
  }
}
```

The important boundary is that app definition remains runtime governed data. The release image does not bake a generated schema migration for the Builder-created Priority Queue. It runs against the mounted SQLite `app.db`, and runtime rediscovery exposes the evolved capability.

## Verification Report

Focused M8 release smoke:

```text
bun test examples/m8-release-packaging-hardening/release-packaging-smoke.test.ts

1 pass, 0 fail
```

What the smoke does:

```text
scripts/migrate.sh
  -> seed evolved Knowledge Inbox through definition.apply_change_set
  -> scripts/build.sh
  -> assert build.manifest.json
  -> docker build templates/knowledge-inbox-core-domain/Dockerfile
  -> docker run with host data mounted at /data
  -> assert /healthz
  -> assert /api/config surfaces Priority Queue
  -> assert list_priority_queue returns P1/P2/P3
  -> docker restart
  -> assert the same surfaces again
```

Other checks before this snapshot:

```text
bun run typecheck -> pass
git diff --check -> pass
```

## What Is Proven

| Claim | Evidence |
|---|---|
| Builder-evolved app state can enter release packaging | M8 seed uses governed `definition.apply_change_set` to create Priority Queue before release. |
| The release manifest is a real contract | `assert-build-manifest.ts` checks process, health, migration, volume, SQLite path, and runtime-agent absence. |
| Docker release can run the evolved app | Smoke builds the Knowledge Inbox Dockerfile and runs it with `/data` mounted. |
| Runtime rediscovery works in release | `/api/config` inside the container exposes Priority Queue schema, Operation, View, and PolicyRule. |
| End-user API works in release | `GET /api/operations/list_priority_queue` returns P1/P2/P3. |
| Restart persistence holds | After `docker restart`, health, config, and API assertions still pass. |

## What Is Not Proven

M8 does not claim:

- rolling traffic shift between old and new app versions
- registry push or cloud deployment
- automated rollback on failed rollout
- online migration compatibility windows
- concurrent multi-runtime writes to the same SQLite volume
- production secret management
- production IAM
- release-mode Runtime Agent
- model planning reliability

Those are deploy-platform and production-operations milestones. M8 only hardens the release artifact boundary.

## Strategic Read

M3 proved a simple Builder-created capability can survive SQLite and Docker restart. M5-M7 then moved the app-evolution loop closer to the real product vision. M8 reconnects those tracks:

```text
M3: primitives can leave the demo room.
M5-M7: the real app can be evolved by Builder/Agent.
M8: the evolved real app can become a release artifact.
```

This is an important confidence point before returning to larger features. The project now has a credible chain from governed creation to release packaging, even though production rollout is still future work.

## Recommended Next Options

1. **Change-set recovery semantics:** decide what happens when one child mutation fails after Builder approval.
2. **Release rollout protocol:** define old/new release, health gate, traffic switch, and rollback semantics.
3. **Semantic index return:** add semantic retrieval as a derived capability, with SQLite rows as source of truth.
4. **Protocol SDK polish:** turn the M7 approval card behavior into reusable SDK helpers.

My recommendation: do change-set recovery semantics before release rollout. M8 proves release artifact confidence; the next correctness risk is still what happens after approval when multi-step app evolution partially fails.

