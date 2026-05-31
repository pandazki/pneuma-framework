# Milestone 34 Snapshot — Durable Assurance Cases

**Date:** 2026-05-09  
**Status:** Closed as a post-RC stabilization milestone. This is not a `pneuma-rc-0.1.4` release tag.  
**Input:** M32 created `BuildChangeAssuranceCase`; M33 made it visible in the Reference Creation Host. M34 asks whether that assurance can survive refresh and become inspectable Host state.

## What M34 Proved

M34 adds a narrow `AssuranceCaseStore` shape for Creation Hosts:

```text
Builder intent / publish action
  -> BuildChangeAssuranceCase
  -> <creation-host-workspace>/.pneuma/build-assurance-cases.json
  -> Workbench Assurance card and inspector tab
```

The important shift is not "audit logging." The shift is:

```text
The Host can remember why the Builder was allowed to continue.
```

That matters for the product loop: after a refresh, later inspection, or handoff, the Host can still show the readiness state, risk classification, blocking reasons, and evidence references that justified the next step.

## Product Boundary

M34 keeps the boundary tight:

```text
Core owns the case shape, validation, and local file-backed store.
Host owns when to save, how to present, and which readiness states gate buttons.
Source evidence remains in the existing systems.
```

The store belongs to the Creation Host workspace. It is not the Generated Application runtime database, not a general multi-tenant audit backend, and not a marketplace artifact trust ledger.

## Implementation Surface

New core files:

- `packages/core/src/build-assurance-store.ts`
- `packages/core/test/build-assurance-store.test.ts`

Updated exports:

- `packages/core/src/index.ts`

Updated Reference Host:

- `examples/m16-reference-creation-host/host-server.ts`
- `examples/m16-reference-creation-host/static/app.js`
- `examples/m16-reference-creation-host/run.test.ts`

Updated guide:

- [Build Change Assurance](../developer/build-assurance.md)
- [中文版](../developer/build-assurance.zh-CN.md)

## Store Contract

The v0 file-backed store writes:

```text
<workspace>/.pneuma/build-assurance-cases.json
```

It supports:

- `saveCase(assuranceCase)` — validate and upsert by `build_change_id`;
- `getCase(build_change_id)` — read one case;
- `listCases({ app_id, thread_id, readiness })` — newest-first filtered list;
- missing or corrupted files returning an empty state with a warning.

The Reference Host persists:

- Priority Queue proposal -> `awaiting_approval`;
- Builder approval + post-apply check -> `verified`;
- publish health + rollout evidence -> `ready_to_publish`.

The Host also exposes:

```text
GET /api/host/projects/:appId/assurance
```

## Verification

Targeted commands:

```bash
bun test packages/core/test/build-assurance-store.test.ts
bun test examples/m16-reference-creation-host/run.test.ts
bun run typecheck
bun test
```

Targeted results:

- core store: `4 pass`, `0 fail`, `13 expect() calls`;
- M16 E2E: `1 pass`, `0 fail`, `37 expect() calls`.
- full suite: `1266 pass`, `0 fail`, `4730 expect() calls`.

The tests prove:

- cases survive store reload;
- upsert by `build_change_id` keeps the latest readiness;
- list filters by `app_id`, `thread_id`, and `readiness`;
- invalid cases are rejected before writing;
- corrupted local store files degrade to empty state;
- the Reference Host can list persisted proposal, approval, and publish cases through the assurance endpoint.

## Remaining Boundary

M34 does not add a compliance audit backend, a hosted storage abstraction, or a generic UI component package. A later productization lane can decide whether downstream Hosts need one of those surfaces.

The useful next lane is not more persistence abstraction by default. It is to keep closing real Builder + Build Agent control gaps: proposal diff clarity, recovery evidence, downstream adoption, or Runtime Agent/product pressure.
