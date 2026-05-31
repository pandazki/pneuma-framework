# M14 Host Publish Monitor Rollback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the Creation Host can publish Generated Application versions as locally running Published Applications, monitor them, restart active release, and rollback to the previous version.

**Architecture:** Add `examples/m14-host-publish-rollout/` as a host-level example built on M12 host storage, M13 governed evolution, and M11 release rollout state. M14 creates two concrete version workspaces (`v0` baseline and `v1` evolved), starts Published Application processes from those version directories, persists rollout state per generated app, and exposes a workbench for publish/restart/rollback.

**Tech Stack:** Bun TypeScript, Bun tests, `@pneuma-framework/core` release rollout primitives, M12 host store/types, M13 host evolution runtime, Knowledge Inbox template, static HTML/CSS/JS.

---

## Boundary

M14 proves:

```text
Generated Application v0
  -> publish v0 as active Published Application
  -> fork v1 and evolve it with governed M13 Priority Queue
  -> publish v1 as new active, keeping v0 as previous
  -> End User opens active Published Application
  -> Host reads health/config/log evidence
  -> Host restarts active process
  -> Host rolls back active to previous v0
```

M14 does not claim cloud deploy, Docker, zero-downtime traffic switching, automatic rollback daemon, schema compatibility windows, production IAM, or multi-tenant release isolation.

## Files

- Create `examples/m14-host-publish-rollout/package.json`
- Create `examples/m14-host-publish-rollout/version-store.ts`
- Create `examples/m14-host-publish-rollout/version-store.test.ts`
- Create `examples/m14-host-publish-rollout/published-runtime.ts`
- Create `examples/m14-host-publish-rollout/published-runtime.test.ts`
- Create `examples/m14-host-publish-rollout/publish-rollout.ts`
- Create `examples/m14-host-publish-rollout/publish-rollout.test.ts`
- Create `examples/m14-host-publish-rollout/host-server.ts`
- Create `examples/m14-host-publish-rollout/run.ts`
- Create `examples/m14-host-publish-rollout/run.test.ts`
- Create `examples/m14-host-publish-rollout/static/index.html`
- Create `examples/m14-host-publish-rollout/static/app.js`
- Create `examples/m14-host-publish-rollout/static/styles.css`
- Create `examples/m14-host-publish-rollout/README.md`
- Create `docs/archive/milestone-14-snapshot.md`
- Create `docs/archive/milestone-14-snapshot.zh-CN.md`
- Modify `docs/architecture/roadmap.md`

## Task 1: Version Store

- [ ] Write `version-store.test.ts` first.
  - Create a M12 HostStore in a temp workspace.
  - Create `team-knowledge-inbox@v0`.
  - Write a sentinel file into `v0/workspace/data`.
  - Call `forkGeneratedAppVersion({ store, appId, fromVersionId: "v0", toVersionId: "v1" })`.
  - Assert `v1` exists in host state, `project.current_version_id === "v1"`, and sentinel file exists in `v1`.
- [ ] Run `bun test examples/m14-host-publish-rollout/version-store.test.ts` and confirm it fails on missing module.
- [ ] Implement `version-store.ts`.
  - Reuse `createHostStore` for project creation.
  - Add `forkGeneratedAppVersion` using `cpSync`, `readFileSync`, `writeFileSync`, `renameSync`.
  - Keep the implementation example-local; do not change M12 store.
- [ ] Re-run the test and commit `feat: add m14 version store`.

## Task 2: Published Runtime

- [ ] Write `published-runtime.test.ts` first.
  - Create a generated app version.
  - Start a Published Application process from the version workspace.
  - Assert `/healthz` returns `ok: true`.
  - Assert `/api/config` includes `inbox_items`.
  - Stop the process and assert the handle is closed.
- [ ] Run the test and confirm it fails on missing module.
- [ ] Implement `published-runtime.ts`.
  - Spawn `bun run <template>/server/app.ts` with `PNEUMA_WORKSPACE`, `PNEUMA_DATA_DIR`, `PNEUMA_SQLITE_PATH`, `PNEUMA_PORT_HINT=0`.
  - Wait for `##pneuma:service-ready api <url>`.
  - Expose `healthCheckPublishedRuntime`, `stopPublishedRuntime`.
- [ ] Re-run the test and commit `feat: add m14 published runtime`.

## Task 3: Publish Rollout Manager

- [ ] Write `publish-rollout.test.ts` first.
  - Create v0 and v1 version workspaces.
  - Evolve v1 through `createHostEvolutionRuntime({ backend: "fake", autoDecision: "allow" })`.
  - Publish v0 and assert rollout active is `team-knowledge-inbox-v0`.
  - Publish v1 and assert active is v1, previous is v0.
  - Restart active and assert active URL changes but remains healthy.
  - Rollback and assert active is v0.
- [ ] Run the test and confirm it fails on missing manager.
- [ ] Implement `publish-rollout.ts`.
  - Use `FileReleaseRolloutStore` rooted at generated-app directory.
  - `publishVersion` starts runtime, checks health/config, stages and promotes candidate.
  - `restartActive` stops and restarts active version process, then updates active release instance evidence.
  - `rollback` uses `rollbackActiveRelease`; if previous process is not alive, start it.
- [ ] Re-run the test and commit `feat: add m14 publish rollout manager`.

## Task 4: Host Server And CLI

- [ ] Write `run.test.ts` first.
  - Start server on port 0.
  - `POST /api/host/demo/create` creates v0/v1.
  - `POST /api/host/projects/team-knowledge-inbox/publish` with `version_id=v0`.
  - `POST /publish` with `version_id=v1`.
  - `POST /restart-active`.
  - `POST /rollback`.
  - Assert status and active URLs after each step.
- [ ] Run the test and confirm it fails on missing server.
- [ ] Implement `host-server.ts` and `run.ts`.
  - Provide `--workspace`, `--port`, `--smoke-exit`.
  - Smoke path prints create, publish v0, publish v1, restart, rollback results.
- [ ] Re-run the test and commit `feat: add m14 host publish server`.

## Task 5: Browser Workbench

- [ ] Create static workbench.
  - Left side: End User Published Application iframe.
  - Right side: Builder publish controls, active/previous/candidate state, health/logs/timeline.
  - Buttons: Create demo, Publish v0, Publish v1, Restart active, Rollback.
- [ ] Manual browser acceptance:
  - Open M14 host.
  - Create demo.
  - Publish v0 and see baseline app.
  - Publish v1 and see Priority Queue app.
  - Restart active and see healthy state.
  - Rollback and see active version return to v0.
  - Console errors none.
- [ ] Commit `feat: add m14 host publish workbench`.

## Task 6: Verification And Snapshot

- [ ] Run:

```bash
bun test examples/m14-host-publish-rollout
bun test examples/m13-host-agent-evolution
bun run typecheck
git diff --check
```

- [ ] Write `README.md`.
- [ ] Write English and Chinese M14 snapshots.
- [ ] Update roadmap M14 to closed with snapshot links.
- [ ] Commit `docs: add m14 milestone snapshot`.

## Self-Review Checklist

- [ ] M14 has actual v0 and v1 version workspaces.
- [ ] Published Application is a separate runtime from preview.
- [ ] Host can health-check active release.
- [ ] Restart active stops and starts a process.
- [ ] Rollback switches active release to previous v0.
- [ ] No Docker dependency is introduced.
- [ ] M14 does not claim production deploy semantics.
