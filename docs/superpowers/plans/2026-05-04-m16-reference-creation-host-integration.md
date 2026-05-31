# M16 Reference Creation Host Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one canonical Reference Creation Host that integrates M13 governed evolution, M14 publish/rollback, and M15 profile generality.

**Architecture:** Add a minimal shared Host/Profile contract in `packages/core`, then build `examples/m16-reference-creation-host` on top of it. The M16 example reuses proven M13/M14 runtime pieces but presents them through one Host API and workbench.

**Tech Stack:** Bun, TypeScript, existing `@pneuma-framework/core`, existing Knowledge Inbox template, existing Team Decision Log template, local JSON host state, SQLite app workspaces.

---

### Task 1: Shared Host/Profile Contract

**Files:**
- Create: `packages/core/src/creation-host.ts`
- Create: `packages/core/test/creation-host.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] Write tests for profile registration, generic project creation, version directory layout, and version fork.
- [ ] Implement `CreationHostProfile`, project/version/state types, and `createCreationHostStore`.
- [ ] Export the contract from `packages/core/src/index.ts`.
- [ ] Run `bun test packages/core/test/creation-host.test.ts`.
- [ ] Commit: `feat: add creation host profile contract`.

### Task 2: M16 Backend Integration

**Files:**
- Create: `examples/m16-reference-creation-host/package.json`
- Create: `examples/m16-reference-creation-host/profiles.ts`
- Create: `examples/m16-reference-creation-host/preview-runtime.ts`
- Create: `examples/m16-reference-creation-host/host-server.ts`
- Create: `examples/m16-reference-creation-host/run.ts`
- Create: `examples/m16-reference-creation-host/run.test.ts`

- [ ] Write a failing smoke test that creates Knowledge Inbox and Team Decision Log through generic profile APIs.
- [ ] Implement profile registry and generic preview/inspection.
- [ ] Integrate M13 evolution runtime with visible approval for Knowledge Inbox.
- [ ] Integrate M14 rollout manager for publish / restart / rollback.
- [ ] Implement `--smoke-exit` runner covering create / preview / inspect / publish v0 / evolve approve / publish v1 / restart / rollback / second app inspect.
- [ ] Run `bun test examples/m16-reference-creation-host`.
- [ ] Commit: `feat: add m16 integrated reference host`.

### Task 3: M16 Workbench UI

**Files:**
- Create: `examples/m16-reference-creation-host/static/index.html`
- Create: `examples/m16-reference-creation-host/static/app.js`
- Create: `examples/m16-reference-creation-host/static/styles.css`
- Modify: `examples/m16-reference-creation-host/host-server.ts`

- [ ] Write server test assertions that the page exposes create, approve, publish, rollback, and profile controls.
- [ ] Implement static serving.
- [ ] Build the split Host workbench.
- [ ] Run `bun test examples/m16-reference-creation-host`.
- [ ] Commit: `feat: add m16 reference host workbench`.

### Task 4: M16 Snapshot And Verification

**Files:**
- Create: `docs/archive/milestone-16-snapshot.md`
- Create: `docs/archive/milestone-16-snapshot.zh-CN.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/roadmap.md`
- Modify: `examples/README.md`
- Modify: `AGENTS.md`

- [ ] Run focused M16 smoke and tests.
- [ ] Run `bun test`.
- [ ] Run `bun run typecheck`.
- [ ] Run `git diff --check`.
- [ ] Write bilingual M16 snapshot with evidence and RC recommendation.
- [ ] Update roadmap / README / AGENTS pointers.
- [ ] Commit: `docs: add m16 integration gate snapshot`.
