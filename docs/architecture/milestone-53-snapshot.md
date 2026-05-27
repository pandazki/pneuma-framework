# Milestone 53 Snapshot

**Milestone:** M53, Production Profile Host Integration
**Status:** In progress, deterministic harness verified
**Date:** 2026-05-28
**Chinese version:** [milestone-53-snapshot.zh-CN.md](./milestone-53-snapshot.zh-CN.md)

## Decision

M52 made the production Generated App profile concrete. M53 starts wiring it back into the Creation Host workflow.

The first slice is intentionally a test-first harness instead of a browser surface:

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
bun test --cwd examples/production-profile-host
bun run --cwd examples/production-generated-app-profile verify
```

Result:

```text
production-profile-host: 2 pass, 0 fail
production-generated-app-profile: typecheck passed, 11 tests passed, build passed
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

1. browser-facing Creation Host flow;
2. real Codex/opencode code-agent run over this production profile;
3. preview/publish/rollback controls in the browser;
4. bilingual UI copy;
5. final paperwork after the browser and real-agent evidence pass.
