# Milestone 53 Snapshot

**Milestone:** M53, Production Profile Host Integration
**Status:** Closed, deterministic browser workbench and real Codex lane verified
**Date:** 2026-05-28
**Chinese version:** [milestone-53-snapshot.zh-CN.md](./milestone-53-snapshot.zh-CN.md)

## Decision

M52 made the production Generated App profile concrete. M53 starts wiring it back into the Creation Host workflow.

The first slice started as a test-first harness and now has a small browser workbench:

```text
Builder selects production profile
  -> Host copies scaffold into project workspace
  -> complete v0 can be previewed or published immediately
  -> Host prepares a draft workspace
  -> deterministic or real Codex code agent modifies generated source
  -> scaffold verify runs before proposal
  -> passing draft becomes proposal
  -> Builder approval applies v1
  -> Host starts published runtime from v1
```

This keeps the next browser workbench honest: if the harness fails, UI polish is irrelevant.

M53 also corrects the product semantics: a profile instantiation produces a complete `v0` Generated Application. The Builder can preview or publish that v0 without asking the agent to do anything. Agent work is optional evolution into a checked vNext proposal.

## What Was Added

New example:

```text
examples/production-profile-host/
```

Key files:

- `src/host.ts`: small Creation Host harness over the M52 scaffold.
- `production-profile-host.test.ts`: end-to-end test for copy -> draft -> verify -> proposal -> apply -> published runtime.
- `src/server.ts`: browser/API server for create, agent draft, preview, approve, publish, and rollback.
- `src/production-codex-agent.ts`: Codex app-server lane for real generated-source edits.
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

The real Codex app-server lane completed the same request with a broader product-source patch:

- shared Zod contract and types;
- demo data and scaffold demo stories;
- Drizzle schema and SQL migration;
- memory/Drizzle repository mapping;
- React UI and styling;
- tests and profile evidence.

The Host verifies:

- protected deployment/profile files did not change;
- the generated app's own `verify` command passes;
- `/api/items` exposes `environment` in runtime data;
- the applied v1 can start as a published runtime.
- published runtimes can opt into Neon by passing `PNEUMA_PRODUCTION_PROFILE_DATABASE_URL`; preview remains memory-backed so sandbox actions do not write production data.

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
POST /api/preview
POST /api/publish
POST /api/agent/draft
POST /api/preview
POST /api/approve
POST /api/publish
GET  published_url/api/items
POST /api/rollback
```

Observed result:

```text
v0 preview and v0 publish work before agent evolution
published runtime started
/api/items exposes environment: production / staging
rollback returns active_version_id to v0
```

Real Codex app-server smoke:

```bash
PORT=8900 PNEUMA_PRODUCTION_PROFILE_AGENT=codex-app-server \
  bun run --cwd examples/production-profile-host serve
```

Then:

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
Codex app-server edited the draft workspace.
Codex ran bun run verify successfully.
Host buildProposal accepted the draft.
Published runtime exposed environment values: production / staging / development.
Rollback returned the project to v0.
```

One real-agent run exposed a useful scaffold-authoring lesson: Vite can print a Node-version warning while still exiting 0. The code-agent prompt now explicitly treats that as non-blocking environment noise, so the agent does not drift into local runtime repair when the product verification has already passed.

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

## Closure

M53 is closed as the production-profile scaffold integration slice.

The next slice should use this stable profile to assemble the broader product Creation Host flow. M53 intentionally does not make Bun/Hono/React/Drizzle/Zod/Neon a framework default; it proves that a Developer can prepare such a profile, validate it with small demos, and then let a real code agent evolve it behind the same pre-proposal verification gate.
