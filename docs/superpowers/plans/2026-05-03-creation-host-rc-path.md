# Creation Host Release Candidate Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive pneuma-framework from the post-M11 primitive set to a release-candidate-quality reference Creation Host workflow.

**Architecture:** Build a reference Creation Host as the next pressure line. The host is a Builder-facing product surface that creates, previews, inspects, evolves, publishes, monitors, and rolls back Generated Applications through existing framework primitives. Keep Bun/TypeScript, local processes, SQLite, and version directories as reference implementation choices, not framework semantics.

**Tech Stack:** Bun tests, TypeScript, existing `@pneuma-framework/core` and `@pneuma-framework/runtime`, Knowledge Inbox substrate, local process management, SQLite volumes, opencode backend path, browser E2E through the existing in-app browser workflow.

---

## Release Candidate Definition

This RC path is not a production launch. It is the point where a Developer can credibly use pneuma-framework to build a Creation Host and run the full creation workflow end to end.

The RC demo must prove:

```text
Developer configures a Creation Host
  -> Builder creates a Generated Application
  -> Builder previews and inspects it
  -> Builder evolves it through a real backend agent
  -> Builder approves one proposal for one intent
  -> Builder publishes a version
  -> End User uses the Published Application
  -> Builder monitors, restarts, and rolls back
```

Non-goals before RC:

- production IAM;
- production traffic switching;
- zero-downtime deploy;
- arbitrary database/runtime migration;
- Qdrant/Postgres/Python adapters unless they become necessary to expose an abstraction gap;
- hot reload for every definition change;
- full multi-tenant SaaS control plane.

## Milestone Sequence

| Milestone | Theme | Outcome |
|---|---|---|
| **M12** | Reference Creation Host substrate | A host can create a Generated Application project, start preview, inspect schema/data/logs, and show the app as an app rather than as a primitive demo. |
| **M13** | Host-level governed agent evolution | A real backend-agent session evolves the generated app from inside the host with one intent-level approval and durable transcript evidence. |
| **M14** | Publish / monitor / rollback inside the host | The host publishes a selected app version to an End User surface, reports health, restarts it, and rolls back to a previous version. |
| **M15** | Generality pressure with a second generated app | The same host creates and evolves a second app with a different domain shape, proving the host is not hardcoded to Knowledge Inbox. |
| **M16** | Release candidate snapshot | Full end-to-end verification, demo runbook, bilingual snapshot, screenshots/images, and tag. |

## File Structure

Expected new or modified areas across the path:

- `docs/architecture/roadmap.md`  
  Holds the canonical milestone sequence and keeps Stage 7/8/9 below the RC path.
- `docs/superpowers/plans/2026-05-03-creation-host-rc-path.md`  
  This master plan.
- `docs/superpowers/plans/2026-05-03-m12-reference-creation-host.md`  
  Detailed implementation plan for M12 before code begins.
- `examples/m12-reference-creation-host/`  
  First host-level example. Owns the Builder-facing surface, project/version store, preview process, inspection views, and deterministic tests.
- `examples/m13-host-agent-evolution/`  
  Host-level real backend-agent evolution path, built on M12.
- `examples/m14-host-publish-rollout/`  
  Host local-process publish / monitor / rollback path, built on M12/M13.
- `examples/m15-host-generality-pressure/`  
  Second generated-app domain pressure test.
- `packages/core/src/creation-host.ts` and `packages/core/test/creation-host.test.ts`  
  Add only if M12 shows host concepts are shared framework contracts rather than example-local concerns.
- `docs/archive/milestone-12-snapshot.md` through `docs/archive/milestone-16-snapshot.md`, plus `.zh-CN.md` versions  
  Bilingual milestone snapshots when each milestone closes.

Do not create `packages/core/src/creation-host.ts` by default. Start host concepts inside the reference example. Promote them into core only when the same semantics are required by more than one host/example.

---

### Task 1: Update Canonical Roadmap Around The RC Path

**Files:**
- Modify: `docs/architecture/roadmap.md`
- Modify: `docs/superpowers/plans/2026-05-03-creation-host-rc-path.md`

- [x] **Step 1: Add M12-M16 to the roadmap overview**

Insert M12-M16 after M11 and before Stage 7:

```text
M12       Reference Creation Host substrate ⏳
M13       Host-level governed agent evolution ⏳
M14       Host publish / monitor / rollback ⏳
M15       Generality pressure app            ⏳
M16       Release candidate snapshot         ⏳
Stage 7   Hot reload + custom code           ⏳
Stage 8   Multi-tenant + Runtime Agent       ⏳
Stage 9   Pneuma 3.0 dogfood (modes)         ⏳
```

- [x] **Step 2: Add a short roadmap section for each M12-M16 milestone**

Each section must include:

- theme;
- proof path;
- non-goals;
- why it comes before Stage 7/8/9.

- [x] **Step 3: Run documentation checks**

Run:

```bash
git diff --check
rg -n "M12|M13|M14|M15|M16|Creation Host release-candidate" docs/architecture/roadmap.md docs/superpowers/plans/2026-05-03-creation-host-rc-path.md
```

Expected:

- `git diff --check` exits 0.
- `rg` shows the new milestone entries in both files.

- [x] **Step 4: Commit**

```bash
git add docs/architecture/roadmap.md docs/superpowers/plans/2026-05-03-creation-host-rc-path.md
git commit -m "docs: plan creation host release candidate path"
```

---

### Task 2: M12 Reference Creation Host Substrate

**Files:**
- Create: `docs/superpowers/plans/2026-05-03-m12-reference-creation-host.md`
- Create: `examples/m12-reference-creation-host/README.md`
- Create: `examples/m12-reference-creation-host/package.json`
- Create: `examples/m12-reference-creation-host/run.ts`
- Create: `examples/m12-reference-creation-host/run.test.ts`
- Create: `examples/m12-reference-creation-host/host-store.ts`
- Create: `examples/m12-reference-creation-host/host-store.test.ts`
- Create: `examples/m12-reference-creation-host/static/index.html`
- Create: `examples/m12-reference-creation-host/static/app.js`
- Create: `examples/m12-reference-creation-host/static/styles.css`

- [ ] **Step 1: Write the M12 detailed plan before implementation**

The M12 plan must lock:

- project identity model;
- stack profile choices;
- version directory layout;
- preview process lifecycle;
- schema/data/log inspection API;
- browser scenario URL;
- exact test commands.

Save it to:

```text
docs/superpowers/plans/2026-05-03-m12-reference-creation-host.md
```

- [ ] **Step 2: Write failing host store tests**

Create `host-store.test.ts` covering:

- create generated app project with `app_id`, `display_name`, and `profile_id`;
- create `v0` version directory;
- record creation session;
- persist and reload from workspace;
- reject duplicate `app_id`.

Run:

```bash
bun test examples/m12-reference-creation-host/host-store.test.ts
```

Expected: fail because the host store does not exist.

- [ ] **Step 3: Implement the example-local host store**

Keep the store local to `examples/m12-reference-creation-host/host-store.ts`.

Do not promote types into `packages/core` unless the implementation clearly repeats existing core semantics.

- [ ] **Step 4: Write failing host runner tests**

Create `run.test.ts` covering:

- start host in model mode;
- create a Generated Application project from a declared profile;
- start preview process;
- fetch preview `/api/config`;
- fetch host inspection endpoint for schema/data/logs;
- stop preview process without leaked child processes.

Run:

```bash
bun test examples/m12-reference-creation-host/run.test.ts
```

Expected: fail before the runner exists.

- [ ] **Step 5: Implement the host runner and browser surface**

The first UI must show:

- left: generated app preview;
- right: builder workspace with conversation placeholder, schema/data inspection, logs, publish placeholder;
- clear project/version labels.

This milestone can use deterministic app creation. It does not need a real LLM agent yet.

- [ ] **Step 6: Verify M12**

Run:

```bash
bun test examples/m12-reference-creation-host
bun run typecheck
```

Then start the host and test in the in-app browser.

Expected:

- tests pass;
- typecheck passes;
- browser can create a Generated Application, preview it, inspect schema/data/logs, and stop cleanly.

- [ ] **Step 7: Snapshot and commit**

Create:

```text
docs/archive/milestone-12-snapshot.md
docs/archive/milestone-12-snapshot.zh-CN.md
```

Commit:

```bash
git add examples/m12-reference-creation-host docs/archive/milestone-12-snapshot.md docs/archive/milestone-12-snapshot.zh-CN.md docs/superpowers/plans/2026-05-03-m12-reference-creation-host.md
git commit -m "feat: add reference creation host substrate"
```

---

### Task 3: M13 Host-Level Governed Agent Evolution

**Files:**
- Create: `docs/superpowers/plans/2026-05-04-m13-host-agent-evolution.md`
- Create: `examples/m13-host-agent-evolution/README.md`
- Create: `examples/m13-host-agent-evolution/package.json`
- Create: `examples/m13-host-agent-evolution/run.ts`
- Create: `examples/m13-host-agent-evolution/run.test.ts`
- Create: `examples/m13-host-agent-evolution/transcript.ts`
- Create: `examples/m13-host-agent-evolution/transcript.test.ts`
- Modify or copy forward from: `examples/m12-reference-creation-host/`

- [ ] **Step 1: Write the M13 detailed plan**

The M13 plan must specify how the host:

- passes current app context to the backend agent;
- exposes framework semantic tools;
- renders one change-set approval card;
- records before/work/after transcript;
- shows tool calls and framework events without cluttering the main UI.

- [ ] **Step 2: Write failing transcript tests**

Tests must prove:

- Builder request is recorded;
- agent proposal is recorded;
- approval response is recorded once;
- framework child operations are recorded;
- before/after app definition diff is recorded.

- [ ] **Step 3: Write failing allow/deny tests**

Tests must prove:

- allow path mutates the Generated Application definition and preview rediscovers the capability;
- deny path leaves definition/data unchanged;
- one Builder intent produces one approval prompt, not one prompt per child mutation.

- [ ] **Step 4: Implement by reusing M7/M9 semantics**

Reuse the existing `definition.apply_change_set` contract and M9 recovery envelope semantics. Do not invent a second approval model.

- [ ] **Step 5: Verify M13**

Run:

```bash
bun test examples/m13-host-agent-evolution
bun test examples/m7-live-agent-approval-protocol
bun test examples/m9-creation-to-release-integrity
bun run typecheck
```

Expected:

- M13 tests pass;
- M7/M9 regressions still pass;
- browser demo shows before state, agent transcript, approval, and after state.

- [ ] **Step 6: Snapshot and commit**

Create bilingual M13 snapshots and commit:

```bash
git add examples/m13-host-agent-evolution docs/archive/milestone-13-snapshot.md docs/archive/milestone-13-snapshot.zh-CN.md docs/superpowers/plans/2026-05-04-m13-host-agent-evolution.md
git commit -m "feat: add host-level governed agent evolution"
```

---

### Task 4: M14 Host Publish / Monitor / Rollback

**Files:**
- Create: `docs/superpowers/plans/2026-05-04-m14-host-publish-rollout.md`
- Create: `examples/m14-host-publish-rollout/README.md`
- Create: `examples/m14-host-publish-rollout/package.json`
- Create: `examples/m14-host-publish-rollout/run.ts`
- Create: `examples/m14-host-publish-rollout/run.test.ts`
- Create: `examples/m14-host-publish-rollout/local-process-rollout.ts`
- Create: `examples/m14-host-publish-rollout/local-process-rollout.test.ts`
- Modify or reuse: `packages/core/src/release-rollout.ts`
- Modify or reuse: `packages/core/src/tools/release.ts`

- [ ] **Step 1: Write the M14 detailed plan**

The plan must define:

- active published version;
- candidate version;
- previous version;
- stable End User URL behavior;
- health check contract;
- restart behavior;
- rollback behavior;
- why this local-process adapter does not claim production traffic switching.

- [ ] **Step 2: Write failing local-process rollout tests**

Tests must prove:

- stage candidate;
- promote candidate to active;
- preserve previous active;
- restart active process;
- rollback to previous;
- report health and logs in the host.

- [ ] **Step 3: Implement local-process publish controls**

The host UI must expose:

- publish current version;
- active release status;
- health;
- restart;
- rollback;
- release history.

Use local processes and version directories. Do not require Docker for this reference host path.

- [ ] **Step 4: Verify M14**

Run:

```bash
bun test examples/m14-host-publish-rollout
bun test packages/core/test/release-rollout.test.ts packages/core/test/tools/release-tools.test.ts
bun run typecheck
```

Expected:

- local-process publish tests pass;
- existing release rollout tests still pass;
- browser demo can publish, open End User view, restart, and rollback.

- [ ] **Step 5: Snapshot and commit**

Create bilingual M14 snapshots and commit:

```bash
git add examples/m14-host-publish-rollout docs/archive/milestone-14-snapshot.md docs/archive/milestone-14-snapshot.zh-CN.md docs/superpowers/plans/2026-05-04-m14-host-publish-rollout.md
git commit -m "feat: add host publish monitor rollback path"
```

---

### Task 5: M15 Generality Pressure App

**Files:**
- Create: `docs/superpowers/plans/2026-05-05-m15-host-generality-pressure.md`
- Create: `examples/m15-host-generality-pressure/README.md`
- Create: `examples/m15-host-generality-pressure/package.json`
- Create: `examples/m15-host-generality-pressure/run.ts`
- Create: `examples/m15-host-generality-pressure/run.test.ts`
- Create or reuse profile files under the M12/M13 host examples.

- [ ] **Step 1: Choose a second app domain**

Default candidate:

```text
Team Decision Log
```

Required difference from Knowledge Inbox:

- different primary table shape;
- different write Operation;
- different read View;
- at least one user/role-aware policy;
- no dependency on semantic index.

- [ ] **Step 2: Write failing generality tests**

Tests must prove the host can create both:

- Knowledge Inbox style generated app;
- Team Decision Log style generated app.

The assertions must compare app definitions and verify they are not the same schema with renamed labels.

- [ ] **Step 3: Implement the second app profile**

Keep it small. The goal is framework generality pressure, not product richness.

- [ ] **Step 4: Verify M15**

Run:

```bash
bun test examples/m15-host-generality-pressure
bun test examples/m12-reference-creation-host examples/m13-host-agent-evolution examples/m14-host-publish-rollout
bun run typecheck
```

Expected:

- two app domains pass through create/preview/inspect/evolve/publish at the appropriate depth;
- no Knowledge Inbox-specific assumptions leak into host-level model.

- [ ] **Step 5: Snapshot and commit**

Create bilingual M15 snapshots and commit:

```bash
git add examples/m15-host-generality-pressure docs/archive/milestone-15-snapshot.md docs/archive/milestone-15-snapshot.zh-CN.md docs/superpowers/plans/2026-05-05-m15-host-generality-pressure.md
git commit -m "feat: add second generated app pressure test"
```

---

### Task 6: M16 Release Candidate Snapshot

**Files:**
- Create: `docs/superpowers/plans/2026-05-05-m16-release-candidate-snapshot.md`
- Create: `docs/archive/milestone-16-snapshot.md`
- Create: `docs/archive/milestone-16-snapshot.zh-CN.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/roadmap.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write the M16 closeout plan**

The closeout plan must include:

- full command matrix;
- browser E2E checklist;
- demo talk track;
- evidence screenshots/images;
- known non-goals;
- release tag name.

- [ ] **Step 2: Run full regression**

Run:

```bash
bun test
bun run typecheck
```

Then run each milestone-specific smoke command documented in M12-M15 snapshots.

- [ ] **Step 3: Browser E2E**

In the in-app browser, verify:

- Builder creates a Generated Application;
- Builder previews it;
- Builder inspects schema/data/logs;
- Builder asks agent to evolve it;
- Builder approves once;
- host shows transcript before/work/after;
- Builder publishes;
- End User opens the published app;
- Builder restarts and rolls back.

- [ ] **Step 4: Create RC snapshot**

The snapshot must explain from a zero-knowledge perspective:

- what the RC proves;
- why the four-layer model matters;
- what is still not production-ready;
- how a Developer should start from the RC;
- which abstractions were validated or challenged.

- [ ] **Step 5: Update canonical docs and agent instructions**

Update:

- `docs/architecture/README.md`;
- `docs/architecture/roadmap.md`;
- `AGENTS.md`;
- `CLAUDE.md`.

- [ ] **Step 6: Tag**

After review and verification:

```bash
git tag pneuma-rc-creation-host-v0
```

Commit and tag only after the user agrees that M16 is closed.

---

## Decision Gates

Do not advance to the next milestone if the current one fails its gate:

| Gate | Blocks |
|---|---|
| M12 cannot create/preview/inspect from the host | Do not start agent evolution. |
| M13 cannot show one approval for one intent | Do not build publish flow on top of it. |
| M14 cannot publish and rollback locally | Do not call the host workflow end to end. |
| M15 reveals Knowledge Inbox hardcoding | Fix host/profile boundaries before RC. |
| M16 full regression fails | No RC tag. |

## Planning Notes

- Use local processes and version directories for the reference host unless they fail to expose a necessary abstraction.
- Keep SQLite/Bun/Drizzle as first implementation choices.
- Avoid Qdrant/Postgres/Python until the host path proves why those adapters matter.
- Preserve the top-level boundary: framework, Creation Host, Generated Application, Published Application.
- Each milestone should end with a bilingual snapshot and a committed verification report.
