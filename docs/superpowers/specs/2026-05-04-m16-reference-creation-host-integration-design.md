# M16 Reference Creation Host Integration Design

**Status:** Approved for implementation  
**Date:** 2026-05-04  
**Audience:** Pneuma contributors reviewing whether M16 can become the release-candidate gate  

## Purpose

M12-M15 proved the Creation Host path in slices, but the proof is split:

- M13 proves governed Host evolution.
- M14 proves publish / restart / rollback.
- M15 proves the Host can carry more than one app shape.

M16 is not a candidate release by default. It is an integration gate that must prove one canonical Reference Creation Host can carry the full product story:

```text
choose profile
  -> create Generated Application
  -> preview
  -> inspect
  -> evolve through one visible approval
  -> publish
  -> restart
  -> rollback
```

If that integrated path still exposes abstraction gaps, M16 should close with a clear "not RC yet" snapshot.

## Design

### 1. Shared Host/Profile Contract

Add a small `@pneuma-framework/core` Creation Host contract:

- `CreationHostProfile`
- `CreationHostProject`
- `CreationHostVersion`
- `CreationHostState`
- `createCreationHostStore`

The store remains intentionally local JSON + version-directory based. The important change is that profiles/projects/versions are no longer redefined separately by every example. This is a framework-facing contract for reference hosts, not a production multi-tenant database.

### 2. Canonical M16 Host Example

Create `examples/m16-reference-creation-host/` as the canonical integration example.

It will use:

- Knowledge Inbox profile from `templates/knowledge-inbox-core-domain`
- Team Decision Log profile from `examples/m15-generality-pressure-app/templates/team-decision-log`
- M13 governed evolution runtime for Knowledge Inbox Priority Queue
- M14 published runtime / rollout manager for publish, restart, rollback

The Host exposes generic profile creation APIs, not only `demo/create`.

### 3. M16 Flow

The canonical smoke path:

```text
POST /api/host/projects { profile_id: knowledge-inbox-bun-sqlite }
POST /preview/start
GET  /inspect
POST /publish v0
POST /evolution/start
POST /evolution/approve
POST /publish v1
POST /restart-active
POST /rollback
POST /api/host/projects { profile_id: team-decision-log-bun-sqlite }
POST /preview/start
GET  /inspect
```

Knowledge Inbox carries the complete create/evolve/publish/rollback path. Team Decision Log remains the second-app generality pressure path.

### 4. Workbench UI

The M16 browser workbench should make the unified story visible:

- left: selected Generated/Published Application iframe
- right: Creation Host console
- profile cards
- create / preview / inspect controls
- one approval panel for evolution
- publish / restart / rollback controls
- inspector tabs for schema / operations / views / policies / data / transcript / rollout

### 5. Boundaries

M16 still does not claim:

- arbitrary app generation;
- production IAM;
- cloud deploy;
- zero-downtime rollout;
- stable active hostname;
- real model planning reliability at production scale;
- Runtime Agent in published apps.

M16 only claims an integrated reference Creation Host path.

## Success Criteria

- Shared Host/Profile contract has unit tests.
- M16 Host creates projects through generic profile API.
- M16 Host runs Knowledge Inbox through preview, inspect, visible approval, publish, restart, rollback.
- M16 Host creates and inspects Team Decision Log through the same profile/store/runtime path.
- M16 smoke runner passes.
- Browser workbench demonstrates the same integrated story.
- M16 snapshot states whether RC is justified after evidence.
