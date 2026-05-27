# Milestone 53 Snapshot

**Milestone:** M53, Production Profile Host Integration
**Status:** In progress, deterministic browser workbench verified
**Date:** 2026-05-28
**Chinese version:** [milestone-53-snapshot.zh-CN.md](./milestone-53-snapshot.zh-CN.md)

## Decision

M52 made the production Generated App profile concrete. M53 starts wiring it back into the Creation Host workflow.

The first slice started as a test-first harness and now has a small browser workbench:

```text
Builder selects production profile
  -> Host copies scaffold into project workspace
  -> Host prepares a draft workspace
  -> agent modifies generated source
  -> scaffold verify runs before proposal
  -> passing draft becomes proposal
  -> Builder approval applies v1
  -> Host starts published runtime from v1
```

This keeps the next browser workbench honest: if the harness fails, UI polish is irrelevant.

## What Was Added

New example:

```text
examples/production-profile-host/
```

Key files:

- `src/host.ts`: small Creation Host harness over the M52 scaffold.
- `production-profile-host.test.ts`: end-to-end test for copy -> draft -> verify -> proposal -> apply -> published runtime.
- `src/server.ts`: browser/API server for create, agent draft, preview, approve, publish, and rollback.
- `src/ui/*`: bilingual light product UI for the profile workflow.
- `playwright.config.ts` and `e2e/browser-flow.pw.ts`: click-level browser E2E for the profile lifecycle.
- `README.md`: explains why this is a harness, not the final browser product.

The deterministic agent currently adds release environment tracking across:

- `src/shared/contracts.ts`
- `src/shared/demo-data.ts`
- `src/db/schema.ts`
- `drizzle/0000_initial_release_operations.sql`
- `src/server/repository.ts`
- `src/client/App.tsx`

The Host verifies:

- protected deployment/profile files did not change;
- the generated app's own `verify` command passes;
- `/api/items` exposes `environment` in runtime data;
- the applied v1 can start as a published runtime.

## Verification

```bash
bun run --cwd examples/production-profile-host build
bun test --cwd examples/production-profile-host
bun run --cwd examples/production-profile-host e2e
bun run --cwd examples/production-generated-app-profile verify
```

Result:

```text
production-profile-host: 2 pass, 0 fail
production-profile-host e2e: 1 browser test passed
production-generated-app-profile: typecheck passed, 14 tests passed, build passed
```

Browser/API smoke:

```text
POST /api/reset
POST /api/projects
POST /api/agent/draft
POST /api/preview
POST /api/approve
POST /api/publish
GET  published_url/api/items
POST /api/rollback
```

Observed result:

```text
published runtime started
/api/items exposes environment: production / staging
rollback returns active_version_id to v0
```

Screenshot:

```text
/tmp/pneuma-m53-production-profile-host-e2e.png
```

## Boundary

Framework should learn:

- production profiles need Host harnesses before browser workflows;
- scaffold `verify` can be the pre-proposal gate;
- protected deployment files need fail-closed checks;
- published runtime smoke should be part of the profile integration proof.

Framework should not absorb:

- the release-operations domain;
- Bun/Hono/React/Drizzle/Zod/Neon as required choices;
- local dependency-linking used by this harness to avoid committing `node_modules`;
- the deterministic environment-lane patch as product semantics.

## Remaining Work

M53 is not closed yet. Still needed:

1. real Codex/opencode code-agent run over this production profile;
2. real-agent evidence that uses the same scaffold checks and proposal gate;
3. final paperwork after the real-agent evidence passes.
