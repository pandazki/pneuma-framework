# M11 Rollout Adapter v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first release rollout primitive: stage a release candidate, promote it to active, report release status, and rollback to the previous active release.

**Architecture:** Introduce a core release-slot state machine and a file-backed rollout store first, then expose framework semantic tools on top. A local Docker example becomes the first adapter proof; it verifies active/candidate/previous release behavior without claiming production traffic switching.

**Tech Stack:** Bun tests, TypeScript, JSON file persistence under `.pneuma`, Docker smoke scripts, Knowledge Inbox release image and SQLite volumes.

---

## File Structure

- `packages/core/src/release-rollout.ts`  
  Owns release slot types, immutable transition helpers, check recording, promotion, rollback, and summary helpers.
- `packages/core/src/release-rollout-store.ts`  
  Owns `FileReleaseRolloutStore`, default `.pneuma/release-rollout.json` path, and atomic JSON persistence.
- `packages/core/src/tools/release.ts`  
  Owns `release.status`, `release.stage`, `release.promote`, and `release.rollback` semantic tools.
- `packages/core/src/tools/registry.ts`  
  Registers release tools in the default framework tool registry.
- `packages/core/src/index.ts`  
  Exports rollout model, store, and release tool registration.
- `packages/core/test/release-rollout.test.ts`  
  Tests stage, failed promotion, successful promotion, rollback, and timeline evidence.
- `packages/core/test/release-rollout-store.test.ts`  
  Tests file-backed persistence and reload.
- `packages/core/test/tools/release-tools.test.ts`  
  Tests the semantic tool contract without Docker.
- `examples/m11-local-rollout-adapter/`  
  Milestone runner, package metadata, README, Docker smoke script, and tests.
- `docs/architecture/milestone-11-snapshot.md` and `.zh-CN.md`  
  Team-facing M11 snapshot after full verification.

---

### Task 1: Core Release Rollout State Machine

**Files:**
- Create: `packages/core/src/release-rollout.ts`
- Create: `packages/core/test/release-rollout.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for immutable rollout transitions**

Create `packages/core/test/release-rollout.test.ts` with tests covering:

```ts
import { expect, test } from "bun:test";
import {
  createReleaseRolloutState,
  createReleaseInstance,
  markReleaseInstanceHealthy,
  promoteReleaseCandidate,
  rollbackActiveRelease,
  stageReleaseCandidate,
  summarizeReleaseRollout,
} from "../src/release-rollout.js";

test("rollout stages a candidate and refuses to promote it before health checks pass", () => {
  const initial = createReleaseRolloutState({ created_at_ms: 1 });
  const candidate = createReleaseInstance({
    candidate_id: "rc-semantic-search",
    image_tag: "pneuma-knowledge-inbox:m11-candidate",
    url: "http://127.0.0.1:4101",
    created_at_ms: 2,
  });

  const staged = stageReleaseCandidate(initial, candidate, { at_ms: 3 });
  expect(staged.candidate?.candidate_id).toBe("rc-semantic-search");
  expect(staged.timeline.map((event) => event.type)).toEqual(["candidate_staged"]);
  expect(initial.candidate).toBeUndefined();

  const attempted = promoteReleaseCandidate(staged, { at_ms: 4 });
  expect(attempted.ok).toBe(false);
  expect(attempted.error).toContain("candidate must be healthy");
  expect(attempted.state.active).toBeUndefined();
  expect(attempted.state.candidate?.candidate_id).toBe("rc-semantic-search");
});

test("rollout promotes a healthy candidate and keeps previous active release for rollback", () => {
  const previousActive = markReleaseInstanceHealthy(createReleaseInstance({
    candidate_id: "rc-baseline",
    image_tag: "pneuma-knowledge-inbox:m10-active",
    url: "http://127.0.0.1:4100",
    created_at_ms: 1,
  }), {
    at_ms: 2,
    checks: [{ name: "health", status: "passed", message: "GET /healthz passed", at_ms: 2 }],
  });
  const candidate = markReleaseInstanceHealthy(createReleaseInstance({
    candidate_id: "rc-semantic-search",
    image_tag: "pneuma-knowledge-inbox:m11-candidate",
    url: "http://127.0.0.1:4101",
    created_at_ms: 3,
  }), {
    at_ms: 4,
    checks: [
      { name: "health", status: "passed", message: "GET /healthz passed", at_ms: 4 },
      { name: "semantic_search", status: "passed", message: "semantic index ready", at_ms: 5 },
    ],
  });

  const staged = stageReleaseCandidate(createReleaseRolloutState({
    active: previousActive,
    created_at_ms: 1,
  }), candidate, { at_ms: 6 });
  const promoted = promoteReleaseCandidate(staged, { at_ms: 7 });

  expect(promoted.ok).toBe(true);
  if (!promoted.ok) throw new Error(promoted.error);
  expect(promoted.state.active?.candidate_id).toBe("rc-semantic-search");
  expect(promoted.state.previous?.candidate_id).toBe("rc-baseline");
  expect(promoted.state.candidate).toBeUndefined();
  expect(summarizeReleaseRollout(promoted.state)).toEqual({
    active_candidate_id: "rc-semantic-search",
    candidate_candidate_id: undefined,
    previous_candidate_id: "rc-baseline",
    active_url: "http://127.0.0.1:4101",
    status: "active",
  });
});

test("rollout rollback swaps previous release back into active", () => {
  const baseline = markReleaseInstanceHealthy(createReleaseInstance({
    candidate_id: "rc-baseline",
    image_tag: "pneuma-knowledge-inbox:m10-active",
    url: "http://127.0.0.1:4100",
  }), { checks: [{ name: "health", status: "passed", at_ms: 1 }], at_ms: 1 });
  const candidate = markReleaseInstanceHealthy(createReleaseInstance({
    candidate_id: "rc-semantic-search",
    image_tag: "pneuma-knowledge-inbox:m11-candidate",
    url: "http://127.0.0.1:4101",
  }), { checks: [{ name: "health", status: "passed", at_ms: 2 }], at_ms: 2 });
  const promoted = promoteReleaseCandidate(stageReleaseCandidate(createReleaseRolloutState({
    active: baseline,
  }), candidate, { at_ms: 3 }), { at_ms: 4 });
  if (!promoted.ok) throw new Error(promoted.error);

  const rolledBack = rollbackActiveRelease(promoted.state, { at_ms: 5, reason: "post-promote capability regression" });

  expect(rolledBack.ok).toBe(true);
  if (!rolledBack.ok) throw new Error(rolledBack.error);
  expect(rolledBack.state.active?.candidate_id).toBe("rc-baseline");
  expect(rolledBack.state.previous?.candidate_id).toBe("rc-semantic-search");
  expect(rolledBack.state.timeline.map((event) => event.type)).toEqual([
    "candidate_staged",
    "candidate_promoted",
    "rollback_completed",
  ]);
});
```

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
bun test packages/core/test/release-rollout.test.ts
```

Expected: fail because `packages/core/src/release-rollout.ts` does not exist.

- [ ] **Step 3: Implement the minimal rollout model**

Create `packages/core/src/release-rollout.ts` with:

- literal slot/status/check types;
- `createReleaseRolloutState`;
- `createReleaseInstance`;
- `markReleaseInstanceHealthy`;
- `stageReleaseCandidate`;
- `promoteReleaseCandidate`;
- `rollbackActiveRelease`;
- `summarizeReleaseRollout`.

Keep transitions immutable and return `{ ok: false, error, state }` for invalid promote/rollback instead of throwing.

- [ ] **Step 4: Export the rollout model**

Modify `packages/core/src/index.ts` to export the new functions and types.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
bun test packages/core/test/release-rollout.test.ts
```

Expected: pass.

Commit:

```bash
git add packages/core/src/release-rollout.ts packages/core/src/index.ts packages/core/test/release-rollout.test.ts
git commit -m "feat: add release rollout state model"
```

---

### Task 2: File-Backed Rollout Store

**Files:**
- Create: `packages/core/src/release-rollout-store.ts`
- Create: `packages/core/test/release-rollout-store.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing persistence tests**

Create `packages/core/test/release-rollout-store.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileReleaseRolloutStore,
  releaseRolloutFilePath,
} from "../src/release-rollout-store.js";
import {
  createReleaseInstance,
  createReleaseRolloutState,
  markReleaseInstanceHealthy,
  promoteReleaseCandidate,
  stageReleaseCandidate,
} from "../src/release-rollout.js";

test("FileReleaseRolloutStore persists and reloads rollout state", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-rollout-store-"));
  try {
    const store = new FileReleaseRolloutStore({ workspace });
    const candidate = markReleaseInstanceHealthy(createReleaseInstance({
      candidate_id: "rc-semantic-search",
      image_tag: "pneuma-knowledge-inbox:m11-candidate",
      url: "http://127.0.0.1:4101",
    }), {
      checks: [{ name: "health", status: "passed", at_ms: 1 }],
      at_ms: 1,
    });
    const staged = stageReleaseCandidate(createReleaseRolloutState(), candidate, { at_ms: 2 });
    const promoted = promoteReleaseCandidate(staged, { at_ms: 3 });
    if (!promoted.ok) throw new Error(promoted.error);

    await store.save(promoted.state);
    expect(releaseRolloutFilePath(workspace)).toContain(".pneuma/release-rollout.json");

    const reloaded = await new FileReleaseRolloutStore({ workspace }).load();
    expect(reloaded.active?.candidate_id).toBe("rc-semantic-search");
    expect(reloaded.timeline.map((event) => event.type)).toEqual(["candidate_staged", "candidate_promoted"]);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
bun test packages/core/test/release-rollout-store.test.ts
```

Expected: fail because `release-rollout-store.ts` does not exist.

- [ ] **Step 3: Implement JSON persistence**

Create `packages/core/src/release-rollout-store.ts` with:

- `releaseRolloutFilePath(workspace)`;
- `ReleaseRolloutStore` interface;
- `FileReleaseRolloutStore.load()`;
- `FileReleaseRolloutStore.save(state)`;
- directory creation for `.pneuma`;
- atomic write via `writeFileSync(tmp)` then `renameSync(tmp, final)`;
- empty state when the file is missing.

- [ ] **Step 4: Export store APIs**

Modify `packages/core/src/index.ts` to export the store and path helper.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
bun test packages/core/test/release-rollout-store.test.ts packages/core/test/release-rollout.test.ts
```

Expected: pass.

Commit:

```bash
git add packages/core/src/release-rollout-store.ts packages/core/src/index.ts packages/core/test/release-rollout-store.test.ts
git commit -m "feat: persist release rollout state"
```

---

### Task 3: Framework Release Semantic Tools

**Files:**
- Create: `packages/core/src/tools/release.ts`
- Create: `packages/core/test/tools/release-tools.test.ts`
- Modify: `packages/core/src/tools/registry.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tool tests**

Create `packages/core/test/tools/release-tools.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { buildToolRegistry } from "../../src/tools/registry.js";

function orchestrator(workspace: string): LifecycleOrchestrator {
  return new LifecycleOrchestrator({
    templateDir: join(process.cwd(), "templates/knowledge-inbox-core-domain"),
    workspace,
  });
}

test("release tools stage, promote, report, and rollback rollout state", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-release-tools-"));
  try {
    const reg = buildToolRegistry({ orchestrator: orchestrator(workspace), workspaceId: "workspace-release-tools" });
    expect(reg.has("release.status")).toBe(true);
    expect(reg.has("release.stage")).toBe(true);
    expect(reg.has("release.promote")).toBe(true);
    expect(reg.has("release.rollback")).toBe(true);

    const initialActive = await reg.call("release.stage", {
      candidate_id: "rc-baseline",
      image_tag: "pneuma-knowledge-inbox:m10-active",
      url: "http://127.0.0.1:4100",
      status: "healthy",
      checks: [{ name: "health", status: "passed", message: "baseline healthy" }],
    });
    expect(initialActive.ok).toBe(true);
    const promotedInitial = await reg.call("release.promote", {});
    expect(promotedInitial.ok).toBe(true);

    const staged = await reg.call("release.stage", {
      candidate_id: "rc-semantic-search",
      image_tag: "pneuma-knowledge-inbox:m11-candidate",
      url: "http://127.0.0.1:4101",
      status: "healthy",
      checks: [{ name: "health", status: "passed", message: "candidate healthy" }],
    });
    expect(staged.ok).toBe(true);

    const promoted = await reg.call("release.promote", {});
    expect(promoted.ok).toBe(true);
    const status = await reg.call("release.status", {});
    expect(status.ok).toBe(true);
    expect((status.state as { summary: { active_candidate_id?: string } }).summary.active_candidate_id)
      .toBe("rc-semantic-search");

    const rolledBack = await reg.call("release.rollback", { reason: "demo rollback" });
    expect(rolledBack.ok).toBe(true);
    const afterRollback = await reg.call("release.status", {});
    expect((afterRollback.state as { summary: { active_candidate_id?: string } }).summary.active_candidate_id)
      .toBe("rc-baseline");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```bash
bun test packages/core/test/tools/release-tools.test.ts
```

Expected: fail because release tools are not registered.

- [ ] **Step 3: Implement `registerReleaseTools`**

Create `packages/core/src/tools/release.ts`:

- load state from `FileReleaseRolloutStore` using `ctx.orchestrator.workspace`;
- `release.status` returns `{ state, summary }`;
- `release.stage` validates `candidate_id`, `image_tag`, optional `url`, `data_dir`, `container_name`, `status`, and `checks`;
- `release.stage` records a candidate release instance, marking it healthy when `status: "healthy"`;
- `release.promote` promotes only healthy candidates and persists state;
- `release.rollback` swaps previous back into active and persists state.

- [ ] **Step 4: Register and export release tools**

Modify:

- `packages/core/src/tools/registry.ts` to call `registerReleaseTools(reg)`;
- `packages/core/src/index.ts` to export `registerReleaseTools`.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
bun test packages/core/test/tools/release-tools.test.ts packages/core/test/release-rollout-store.test.ts packages/core/test/release-rollout.test.ts
```

Expected: pass.

Commit:

```bash
git add packages/core/src/tools/release.ts packages/core/src/tools/registry.ts packages/core/src/index.ts packages/core/test/tools/release-tools.test.ts
git commit -m "feat: add release semantic tools"
```

---

### Task 4: Local Docker Rollout Example

**Files:**
- Create: `examples/m11-local-rollout-adapter/package.json`
- Create: `examples/m11-local-rollout-adapter/README.md`
- Create: `examples/m11-local-rollout-adapter/run.ts`
- Create: `examples/m11-local-rollout-adapter/run.test.ts`
- Create: `examples/m11-local-rollout-adapter/release-rollout-smoke.sh`
- Create: `examples/m11-local-rollout-adapter/release-rollout-smoke.test.ts`

- [ ] **Step 1: Write failing deterministic runner test**

Create `examples/m11-local-rollout-adapter/run.test.ts`:

```ts
import { expect, test } from "bun:test";
import { runM11RolloutDemo } from "./run.js";

test("M11 rollout demo records baseline active, candidate promotion, and rollback", async () => {
  const result = await runM11RolloutDemo({ mode: "model" });
  expect(result.summary.before.active_candidate_id).toBe("rc-baseline");
  expect(result.summary.after_promote.active_candidate_id).toBe("rc-semantic-search");
  expect(result.summary.after_rollback.active_candidate_id).toBe("rc-baseline");
  expect(result.timeline.map((event) => event.type)).toEqual([
    "candidate_staged",
    "candidate_promoted",
    "candidate_staged",
    "candidate_promoted",
    "rollback_completed",
  ]);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
bun test examples/m11-local-rollout-adapter/run.test.ts
```

Expected: fail because the example does not exist.

- [ ] **Step 3: Implement model-mode runner**

Create `examples/m11-local-rollout-adapter/run.ts` with `runM11RolloutDemo({ mode: "model" })` using the core release tools only. It should stage/promote a baseline release, stage/promote a semantic-search candidate, rollback, and return summaries.

- [ ] **Step 4: Add Docker smoke test wrapper**

Create `examples/m11-local-rollout-adapter/release-rollout-smoke.test.ts` that runs `release-rollout-smoke.sh` when Docker is available and skips cleanly when Docker is missing.

- [ ] **Step 5: Implement Docker smoke script**

Create `examples/m11-local-rollout-adapter/release-rollout-smoke.sh` that:

1. builds the Knowledge Inbox Docker image;
2. creates two temporary data directories;
3. starts a baseline active container;
4. verifies baseline health and missing semantic index evidence;
5. prepares candidate data by running M10 semantic rebuild;
6. starts a candidate container;
7. verifies candidate health and ready semantic search;
8. records promote and rollback through the M11 runner/tool path;
9. verifies rollback points active back to baseline evidence;
10. cleans up containers and temp directories.

- [ ] **Step 6: Add README and package metadata**

Document the story, commands, and non-goals. The README must say v0 has no stable traffic switch.

- [ ] **Step 7: Run tests and commit**

Run:

```bash
bun test examples/m11-local-rollout-adapter/run.test.ts examples/m11-local-rollout-adapter/release-rollout-smoke.test.ts
```

Expected: pass or Docker smoke skip cleanly when Docker is unavailable.

Commit:

```bash
git add examples/m11-local-rollout-adapter
git commit -m "test: add M11 local rollout adapter demo"
```

---

### Task 5: Full Verification and Milestone Snapshot

**Files:**
- Create: `docs/architecture/milestone-11-snapshot.md`
- Create: `docs/architecture/milestone-11-snapshot.zh-CN.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/roadmap.md` if present and it references milestone status

- [ ] **Step 1: Run full targeted verification**

Run:

```bash
bun test packages/core/test/release-rollout.test.ts packages/core/test/release-rollout-store.test.ts packages/core/test/tools/release-tools.test.ts examples/m11-local-rollout-adapter/run.test.ts examples/m11-local-rollout-adapter/release-rollout-smoke.test.ts examples/m10-derived-semantic-index/release-smoke.test.ts
bun run typecheck
git diff --check
```

Expected: all pass, with Docker smoke either passing or explicitly skipping only when Docker is unavailable.

- [ ] **Step 2: Collect evidence**

Record:

- command outputs;
- Docker smoke behavior;
- active/candidate/previous timeline;
- before/promote/rollback capability boundary.

- [ ] **Step 3: Write English and Chinese snapshots**

Create:

- `docs/architecture/milestone-11-snapshot.md`;
- `docs/architecture/milestone-11-snapshot.zh-CN.md`.

Each snapshot must include:

- what M11 proves;
- what M11 deliberately does not prove;
- architecture diagram;
- rollout timeline;
- verification report;
- next recommended pressure lines.

- [ ] **Step 4: Update architecture index**

Modify `docs/architecture/README.md` to include M11 in the milestone list and recommended reading path.

- [ ] **Step 5: Commit docs**

Commit:

```bash
git add docs/architecture/milestone-11-snapshot.md docs/architecture/milestone-11-snapshot.zh-CN.md docs/architecture/README.md docs/architecture/roadmap.md
git commit -m "docs: close M11 rollout adapter"
```

---

## Self-Review

- Spec coverage: Task 1 covers release slots and immutable transitions; Task 2 covers durable state; Task 3 covers semantic tools; Task 4 covers local Docker adapter evidence; Task 5 covers bilingual milestone snapshot.
- Scope guard: M11 v0 does not introduce a reverse proxy or cloud deployment. Active release is a framework state pointer with a verified URL.
- Test posture: every production behavior starts with a failing Bun test; Docker-specific behavior is verified by smoke script with clean skip semantics if Docker is unavailable.
