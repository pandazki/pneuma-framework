# M15 Generality Pressure App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the Creation Host is not a Knowledge Inbox-specific shell by creating, previewing, and inspecting two generated apps with different domain shapes through the same Host surface.

**Architecture:** Add a focused `examples/m15-generality-pressure-app/` example rather than widening M12/M14 contracts prematurely. The example has a generic profile registry, a generic preview runtime, and a second small template (`team-decision-log`) that exposes a different table, write/read operations, view, and owner-aware policy. The Host proves generality by creating both Knowledge Inbox and Team Decision Log and inspecting both through the same API/UI.

**Tech Stack:** Bun TypeScript, existing `@pneuma-framework/runtime`, existing `@pneuma-framework/core-domain`, SQLite app DB, local Bun processes, browser workbench.

---

## File Structure

- Create `examples/m15-generality-pressure-app/package.json`
  - Declares workspace package metadata and dependencies on core/runtime packages.
- Create `examples/m15-generality-pressure-app/templates/team-decision-log/server/app.ts`
  - Starts the Team Decision Log runtime using the same Bun HTTP pattern as Knowledge Inbox.
- Create `examples/m15-generality-pressure-app/templates/team-decision-log/server/config.ts`
  - Defines the second app domain: `decisions` table, `record_decision`, `list_decisions`, `decision_log` view, and owner-aware policy.
- Create `examples/m15-generality-pressure-app/templates/team-decision-log/viewer/index.html`
  - Minimal end-user UI for manual preview; enough to show this is not Knowledge Inbox.
- Create `examples/m15-generality-pressure-app/profiles.ts`
  - Defines `knowledge-inbox-bun-sqlite` and `team-decision-log-bun-sqlite`.
- Create `examples/m15-generality-pressure-app/types.ts`
  - Local generic Host types with profile id union and inspection data map.
- Create `examples/m15-generality-pressure-app/host-store.ts` and `.test.ts`
  - Adapt M12 Host store to accept both profiles.
- Create `examples/m15-generality-pressure-app/preview-runtime.ts` and `.test.ts`
  - Start either profile, seed profile-specific demo data, inspect schema/operations/views/policies/data generically.
- Create `examples/m15-generality-pressure-app/host-server.ts` and `run.ts` / `run.test.ts`
  - HTTP API and smoke runner for creating and previewing both apps.
- Create `examples/m15-generality-pressure-app/static/*`
  - Browser workbench with two app tiles and shared inspection panels.
- Modify `docs/architecture/roadmap.md`, `docs/architecture/README.md`, `examples/README.md`, `AGENTS.md`
  - Only after implementation and verification, to mark M15 closed.
- Create `docs/archive/milestone-15-snapshot.md` and `.zh-CN.md`
  - Final paper work after E2E.

---

### Task 1: Team Decision Log Template

**Files:**
- Create: `examples/m15-generality-pressure-app/templates/team-decision-log/server/config.ts`
- Create: `examples/m15-generality-pressure-app/templates/team-decision-log/server/app.ts`
- Create: `examples/m15-generality-pressure-app/templates/team-decision-log/viewer/index.html`
- Test: `examples/m15-generality-pressure-app/decision-log-template.test.ts`

- [ ] **Step 1: Write the failing template test**

```ts
import { describe, expect, test } from "bun:test";
import { config } from "./templates/team-decision-log/server/config.js";

describe("M15 Team Decision Log template", () => {
  test("declares a distinct app shape with owner-aware policy", () => {
    expect(config.app_id).toBe("team-decision-log");
    expect(config.tables.map((table) => table.id)).toEqual(["decisions"]);
    expect(config.operations.map((operation) => operation.id)).toEqual(["record_decision", "list_decisions"]);
    expect(config.views?.map((view) => view.id)).toEqual(["decision_log"]);
    expect(config.policy.rules.some((rule) => rule.id === "owner-can-read-decisions")).toBe(true);
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `bun test examples/m15-generality-pressure-app/decision-log-template.test.ts`  
Expected: FAIL because the template files do not exist.

- [ ] **Step 3: Implement minimal template**

Use `Table`, `Operation`, `View`, `PolicySet`, `Resources`, `Subjects`, and `Row` from `@pneuma-framework/core-domain`.

The `decisions` table must contain:

```text
title: Text
context: Text
decision: Text
owner_user_id: Text
status: Text
created_at_cell: Date
```

The `record_decision` code handler must save a `decisions` row and return `{ id, title, owner_user_id, status }`.

The `list_decisions` query handler must read `decisions` sorted by `created_at_cell desc`.

The policy must include:

```ts
policy.addRule({
  id: "builder-can-record-decisions",
  allow: [Subjects.role("builder"), Subjects.user("builder-alice")],
  do: ["invoke"],
  on: Resources.operation("record_decision"),
});
policy.addRule({
  id: "owner-can-read-decisions",
  allow: [Subjects.role("builder"), Subjects.user("builder-alice")],
  do: ["invoke"],
  on: Resources.operation("list_decisions"),
});
```

The policy is intentionally small: M15 needs an observable role/user-aware rule, not production IAM.

- [ ] **Step 4: Verify GREEN**

Run: `bun test examples/m15-generality-pressure-app/decision-log-template.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add examples/m15-generality-pressure-app
git commit -m "feat: add m15 decision log template"
```

---

### Task 2: Generic Profile Store

**Files:**
- Create: `examples/m15-generality-pressure-app/package.json`
- Create: `examples/m15-generality-pressure-app/profiles.ts`
- Create: `examples/m15-generality-pressure-app/types.ts`
- Create: `examples/m15-generality-pressure-app/host-store.ts`
- Test: `examples/m15-generality-pressure-app/host-store.test.ts`

- [ ] **Step 1: Write the failing store test**

```ts
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGeneralityHostStore } from "./host-store.js";
import { STACK_PROFILES } from "./profiles.js";

describe("M15 generality host store", () => {
  test("creates generated apps for both supported profiles", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m15-store-"));
    try {
      const store = createGeneralityHostStore({ workspace, now: () => 123 });
      expect(STACK_PROFILES.map((profile) => profile.id)).toEqual([
        "knowledge-inbox-bun-sqlite",
        "team-decision-log-bun-sqlite",
      ]);

      const inbox = store.createProject({
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
      });
      const decisions = store.createProject({
        app_id: "team-decision-log",
        display_name: "Team Decision Log",
        profile_id: "team-decision-log-bun-sqlite",
      });

      expect(inbox.version.sqlite_path.endsWith("generated-apps/team-knowledge-inbox/versions/v0/workspace/data/app.db")).toBe(true);
      expect(decisions.version.sqlite_path.endsWith("generated-apps/team-decision-log/versions/v0/workspace/data/app.db")).toBe(true);
      expect(store.listProjects().map((project) => project.app_id)).toEqual([
        "team-knowledge-inbox",
        "team-decision-log",
      ]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `bun test examples/m15-generality-pressure-app/host-store.test.ts`  
Expected: FAIL because `host-store.ts` and `profiles.ts` do not exist.

- [ ] **Step 3: Implement profile/store**

Adapt the M12 store without importing its `StackProfileId`; M15 needs a local union:

```ts
export type M15StackProfileId =
  | "knowledge-inbox-bun-sqlite"
  | "team-decision-log-bun-sqlite";
```

`STACK_PROFILES` must point Knowledge Inbox at `../../templates/knowledge-inbox-core-domain` and Decision Log at `./templates/team-decision-log`.

- [ ] **Step 4: Verify GREEN**

Run: `bun test examples/m15-generality-pressure-app/host-store.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add examples/m15-generality-pressure-app
git commit -m "feat: add m15 generic host store"
```

---

### Task 3: Generic Preview Runtime and Inspection

**Files:**
- Create: `examples/m15-generality-pressure-app/preview-runtime.ts`
- Test: `examples/m15-generality-pressure-app/preview-runtime.test.ts`

- [ ] **Step 1: Write the failing runtime test**

```ts
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGeneralityHostStore } from "./host-store.js";
import {
  inspectM15PreviewRuntime,
  startM15PreviewRuntime,
  stopM15PreviewRuntime,
} from "./preview-runtime.js";

describe("M15 preview runtime", () => {
  test("starts and inspects Knowledge Inbox and Team Decision Log through one runtime path", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m15-preview-"));
    const store = createGeneralityHostStore({ workspace });
    const inbox = store.createProject({
      app_id: "team-knowledge-inbox",
      display_name: "Team Knowledge Inbox",
      profile_id: "knowledge-inbox-bun-sqlite",
    });
    const decisions = store.createProject({
      app_id: "team-decision-log",
      display_name: "Team Decision Log",
      profile_id: "team-decision-log-bun-sqlite",
    });
    const runtimes = [
      await startM15PreviewRuntime({ project: inbox.project, version: inbox.version, port: 0 }),
      await startM15PreviewRuntime({ project: decisions.project, version: decisions.version, port: 0 }),
    ];
    try {
      const inboxInspection = await inspectM15PreviewRuntime(runtimes[0]);
      const decisionInspection = await inspectM15PreviewRuntime(runtimes[1]);
      expect(inboxInspection.schema.tables.map((table) => table.id)).toContain("inbox_items");
      expect(inboxInspection.operations.map((operation) => operation.id)).toContain("capture_item");
      expect(decisionInspection.schema.tables.map((table) => table.id)).toContain("decisions");
      expect(decisionInspection.operations.map((operation) => operation.id)).toContain("record_decision");
      expect(decisionInspection.schema.views.map((view) => view.id)).toContain("decision_log");
      expect(decisionInspection.schema.policy_rules.map((rule) => rule.id)).toContain("owner-can-read-decisions");
      expect(decisionInspection.data.decisions).toHaveLength(3);
    } finally {
      await Promise.all(runtimes.map((runtime) => stopM15PreviewRuntime(runtime)));
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});
```

- [ ] **Step 2: Verify RED**

Run: `bun test examples/m15-generality-pressure-app/preview-runtime.test.ts`  
Expected: FAIL because preview runtime does not exist.

- [ ] **Step 3: Implement generic runtime**

Implement:

```ts
startM15PreviewRuntime(input)
stopM15PreviewRuntime(handle)
inspectM15PreviewRuntime(handle)
```

Use profile metadata to start `server/app.ts`. Seed by profile:

- Knowledge Inbox: call existing `seedKnowledgeInboxDemo`.
- Decision Log: POST three rows to `/api/operations/record_decision`.

Inspection must fetch `/api/config` and then call the configured profile read operation:

- Knowledge Inbox -> `/api/operations/list_inbox_items`
- Decision Log -> `/api/operations/list_decisions`

- [ ] **Step 4: Verify GREEN**

Run: `bun test examples/m15-generality-pressure-app/preview-runtime.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add examples/m15-generality-pressure-app
git commit -m "feat: add m15 generic preview runtime"
```

---

### Task 4: Host Server, Smoke Runner, and Workbench

**Files:**
- Create: `examples/m15-generality-pressure-app/host-server.ts`
- Create: `examples/m15-generality-pressure-app/run.ts`
- Create: `examples/m15-generality-pressure-app/run.test.ts`
- Create: `examples/m15-generality-pressure-app/static/index.html`
- Create: `examples/m15-generality-pressure-app/static/app.js`
- Create: `examples/m15-generality-pressure-app/static/styles.css`

- [ ] **Step 1: Write the failing server test**

```ts
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startM15GeneralityHostServer } from "./host-server.js";

describe("M15 generality host server", () => {
  test("creates, previews, and inspects two different generated app profiles", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m15-server-"));
    const server = await startM15GeneralityHostServer({ workspace, port: 0 });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    try {
      const created = await fetchJson<{ projects: Array<{ app_id: string }> }>(
        `${baseUrl}/api/host/demo/create`,
        { method: "POST" },
      );
      expect(created.projects.map((project) => project.app_id)).toEqual([
        "team-knowledge-inbox",
        "team-decision-log",
      ]);

      for (const appId of ["team-knowledge-inbox", "team-decision-log"]) {
        await fetchJson(`${baseUrl}/api/host/projects/${appId}/preview/start`, { method: "POST" });
      }

      const inbox = await fetchJson<{ inspection: { schema: { tables: Array<{ id: string }> }; data: Record<string, unknown[]> } }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/inspect`,
      );
      const decisions = await fetchJson<{ inspection: { schema: { tables: Array<{ id: string }>; views: Array<{ id: string }>; policy_rules: Array<{ id: string }> }; data: Record<string, unknown[]> } }>(
        `${baseUrl}/api/host/projects/team-decision-log/inspect`,
      );

      expect(inbox.inspection.schema.tables.map((table) => table.id)).toContain("inbox_items");
      expect(decisions.inspection.schema.tables.map((table) => table.id)).toContain("decisions");
      expect(decisions.inspection.schema.views.map((view) => view.id)).toContain("decision_log");
      expect(decisions.inspection.schema.policy_rules.map((rule) => rule.id)).toContain("owner-can-read-decisions");
      expect(decisions.inspection.data.decisions).toHaveLength(3);
    } finally {
      await server.stop();
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});
```

- [ ] **Step 2: Verify RED**

Run: `bun test examples/m15-generality-pressure-app/run.test.ts`  
Expected: FAIL because `host-server.ts` does not exist.

- [ ] **Step 3: Implement server and smoke runner**

Server endpoints:

```text
GET  /
GET  /static/*
GET  /api/host/status
GET  /api/host/profiles
GET  /api/host/projects
POST /api/host/demo/create
POST /api/host/projects/:app_id/preview/start
POST /api/host/projects/:app_id/preview/stop
GET  /api/host/projects/:app_id/inspect
```

`run.ts --smoke-exit` must create both projects, start both previews, inspect both, print the two table ids, and exit.

- [ ] **Step 4: Implement browser workbench**

The UI should show:

- two generated app cards;
- a shared "Create both" action;
- "Start preview" and "Inspect" actions per app;
- iframe preview for selected app;
- schema / operations / views / policies / data sections.

Use `data-testid` values:

```text
create-both
preview-team-knowledge-inbox
preview-team-decision-log
inspect-team-knowledge-inbox
inspect-team-decision-log
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
bun test examples/m15-generality-pressure-app/run.test.ts
bun run examples/m15-generality-pressure-app/run.ts --port 0 --smoke-exit
```

Expected: both pass.

- [ ] **Step 6: Browser verification**

Run:

```bash
bun run examples/m15-generality-pressure-app/run.ts --port 8882
```

Open `http://127.0.0.1:8882/` and verify:

```text
Create both -> two app cards active
Preview Knowledge Inbox -> iframe shows Knowledge Inbox
Inspect Knowledge Inbox -> inbox_items / capture_item visible
Preview Decision Log -> iframe shows Team Decision Log
Inspect Decision Log -> decisions / record_decision / decision_log / owner-can-read-decisions visible
Console messages -> none
```

- [ ] **Step 7: Commit**

```bash
git add examples/m15-generality-pressure-app
git commit -m "feat: add m15 generality host workbench"
```

---

### Task 5: M15 Verification and Paper Work

**Files:**
- Create: `docs/archive/milestone-15-snapshot.md`
- Create: `docs/archive/milestone-15-snapshot.zh-CN.md`
- Modify: `docs/architecture/roadmap.md`
- Modify: `docs/architecture/README.md`
- Modify: `examples/README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Run full M15/M14/M13 verification**

```bash
bun test examples/m15-generality-pressure-app
bun test examples/m14-host-publish-rollout
bun test examples/m13-host-agent-evolution
bun run typecheck
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Write bilingual snapshot**

The snapshot must answer:

- Why M15 exists after M14.
- What the two apps are.
- Which primitives differ between Knowledge Inbox and Team Decision Log.
- What is proven.
- What is not proven.
- Why M16 is the release-candidate review gate.

- [ ] **Step 3: Update navigation**

Mark M15 closed in roadmap and add links in README / examples README / AGENTS.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture examples/README.md AGENTS.md
git commit -m "docs: add m15 milestone snapshot"
```

---

## Self-Review

**Spec coverage:** This plan covers the required second app, distinct schema/operations/views/policies, shared Host surfaces, smoke verification, browser verification, and bilingual paper work.

**Placeholder scan:** No `TBD`, `TODO`, or unspecified implementation steps remain. The only deliberate scope limit is production IAM, which is called out as out of scope.

**Type consistency:** M15 owns local `M15StackProfileId` and does not widen M12 types. Preview inspection uses a generic `data: Record<string, readonly Record<string, unknown>[]>` so both `inbox_items` and `decisions` fit without leaking Knowledge Inbox assumptions.
