# M2.6 Recoverable Definition Mutation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make governed app-definition mutations visible, serialized, and recoverably blocked when an apply or rollback attempt leaves the app definition in an untrusted state.

**Architecture:** Add a framework-owned definition mutation guard in `packages/core`, persisted under the workspace `.pneuma` state directory. `definition.apply` and `definition.rollback.execute` remain the mutation orchestrators; they create/update/clear the guard around existing runtime Operation calls, restart, and verification. New repair tools expose status and a conservative reset path without introducing cross-store transactions.

**Tech Stack:** Bun test runner, TypeScript, `LifecycleOrchestrator`, `ToolRegistry`, workspace `.pneuma` JSON state, existing definition apply/rollback fixtures.

---

## File Map

- Modify `packages/core/src/types.ts`
  - Add `DefinitionMutationGuard`, guard status/phase types, repair status result types, and a `definitionMutationGuard` field on `LifecycleState`.
- Modify `packages/core/src/lifecycle.ts`
  - Persist/load the guard at `.pneuma/definition-mutation-guard.json`.
  - Serialize active mutation attempts inside one orchestrator.
  - Mark dirty after post-mutation failures.
  - Expose `getDefinitionRepairStatus()` and `resetDefinitionToLastKnownGood()`.
- Modify `packages/core/src/tools/action.ts`
  - Register `definition.repair.status`.
  - Register `definition.repair.reset_to_last_good`.
  - Preserve stable dirty-state failure shapes for agents.
- Modify `packages/core/test/tools/definition-apply.test.ts`
  - Add failure-injection tests for clean status, apply dirty state, durable dirty replay, rollback verification dirty state, blocking, and conservative reset.

## Task 1: Guard Types And Repair Status Tool

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/lifecycle.ts`
- Modify: `packages/core/src/tools/action.ts`
- Test: `packages/core/test/tools/definition-apply.test.ts`

- [ ] **Step 1: Write the failing repair status test**

Add this test after the first successful `definition.apply` test:

```ts
test("definition.repair.status reports clean state before and after successful definition.apply", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-repair-status-clean-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);

    const before = await reg.call("definition.repair.status", {});
    expect(before.ok).toBe(true);
    expect(before.state).toMatchObject({ status: "clean", dirty: false, active: false });

    expect((await reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
    })).ok).toBe(true);

    const after = await reg.call("definition.repair.status", {});
    expect(after.ok).toBe(true);
    expect(after.state).toMatchObject({ status: "clean", dirty: false, active: false });

    await reg.call("lifecycle.dev.stop", {});
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts -t "definition.repair.status reports clean state before and after successful definition.apply"
```

Expected: FAIL because `definition.repair.status` is not registered.

- [ ] **Step 3: Add guard and repair status types**

Add these definitions to `packages/core/src/types.ts` near the definition apply/rollback state types:

```ts
export type DefinitionMutationGuardStatus = "running" | "dirty";

export type DefinitionMutationGuardPhase =
  | "started"
  | "mutating"
  | "stopping"
  | "restarting"
  | "verifying"
  | "rollback_backup"
  | "rollback_mutating";

export interface DefinitionMutationGuard {
  readonly attempt_id: string;
  readonly app_id: string;
  readonly operation_id: "definition.apply" | "definition.rollback.execute" | "definition.repair.reset_to_last_good";
  readonly target: string;
  readonly expected_history_version?: number;
  readonly last_known_good_history_version?: number;
  readonly status: DefinitionMutationGuardStatus;
  readonly phase: DefinitionMutationGuardPhase;
  readonly started_at_ms: number;
  readonly updated_at_ms: number;
  readonly last_known_good_summary?: DefinitionRepairOverlaySummary;
  readonly current_observed_summary?: DefinitionRepairOverlaySummary;
  readonly error?: { readonly code: string; readonly message: string };
}

export interface DefinitionRepairOverlaySummary {
  readonly tables: readonly string[];
  readonly table_columns: readonly string[];
  readonly operations: readonly string[];
  readonly views: readonly string[];
  readonly policy_rules: readonly string[];
  readonly policy_default_posture: "public" | "restricted";
}

export interface DefinitionRepairStatus {
  readonly status: "clean" | "running" | "dirty";
  readonly dirty: boolean;
  readonly active: boolean;
  readonly guard?: DefinitionMutationGuard;
}
```

Add this field to `LifecycleState`:

```ts
readonly definitionMutationGuard?: DefinitionMutationGuard;
```

- [ ] **Step 4: Implement status accessors**

In `packages/core/src/lifecycle.ts`, import JSON file helpers:

```ts
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
```

Add guard types to the existing import from `./types.js`:

```ts
DefinitionMutationGuard,
DefinitionRepairOverlaySummary,
DefinitionRepairStatus,
```

Add these methods inside `LifecycleOrchestrator`:

```ts
getDefinitionRepairStatus(): DefinitionRepairStatus {
  const guard = this.state.definitionMutationGuard;
  if (!guard) return { status: "clean", dirty: false, active: false };
  return {
    status: guard.status,
    dirty: guard.status === "dirty",
    active: guard.status === "running",
    guard,
  };
}

private definitionMutationGuardPath(): string {
  return join(stateDir(this.workspace), "definition-mutation-guard.json");
}

private loadDefinitionMutationGuard(): void {
  const path = this.definitionMutationGuardPath();
  if (!existsSync(path)) return;
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as DefinitionMutationGuard;
    if (parsed && typeof parsed === "object" && (parsed.status === "running" || parsed.status === "dirty")) {
      this.state.definitionMutationGuard = parsed.status === "running"
        ? {
            ...parsed,
            status: "dirty",
            error: parsed.error ?? {
              code: "process_restarted_during_definition_mutation",
              message: "A previous definition mutation was running when the framework process restarted.",
            },
            updated_at_ms: Date.now(),
          }
        : parsed;
      this.persistDefinitionMutationGuard(this.state.definitionMutationGuard);
    }
  } catch {
    const now = Date.now();
    this.state.definitionMutationGuard = {
      attempt_id: `guard-corrupt-${randomUUID()}`,
      app_id: "unknown",
      operation_id: "definition.apply",
      target: "unknown",
      status: "dirty",
      phase: "started",
      started_at_ms: now,
      updated_at_ms: now,
      error: {
        code: "corrupt_definition_mutation_guard",
        message: "The framework could not parse the durable definition mutation guard.",
      },
    };
    this.persistDefinitionMutationGuard(this.state.definitionMutationGuard);
  }
}

private persistDefinitionMutationGuard(guard: DefinitionMutationGuard): void {
  mkdirSync(stateDir(this.workspace), { recursive: true });
  writeFileSync(this.definitionMutationGuardPath(), JSON.stringify(guard, null, 2) + "\n", "utf8");
}

private clearDefinitionMutationGuard(): void {
  this.state.definitionMutationGuard = undefined;
  rmSync(this.definitionMutationGuardPath(), { force: true });
}
```

Call `this.loadDefinitionMutationGuard();` at the end of the constructor after `this.state` is initialized.

- [ ] **Step 5: Register `definition.repair.status`**

Add this tool to `registerActionTools` before lifecycle tools:

```ts
reg.register(
  {
    name: "definition.repair.status",
    description: "Report whether app-definition mutation is clean, running, or dirty and whether repair is required.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  async (ctx): Promise<ToolResult> => ({ ok: true, state: ctx.orchestrator.getDefinitionRepairStatus() }),
);
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts -t "definition.repair.status reports clean state before and after successful definition.apply"
```

Expected: PASS.

## Task 2: Apply Dirty Guard And Blocking

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/lifecycle.ts`
- Test: `packages/core/test/tools/definition-apply.test.ts`

- [ ] **Step 1: Write the failing dirty apply test**

Add this test near the existing `diff_mismatch` test:

```ts
test("definition.apply diff mismatch marks dirty and blocks the next mutation before runtime POST", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-dirty-block-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);

    const first = await reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
    });
    expect(first.ok).toBe(false);
    expect((first.state as { failure: { category: string } }).failure.category).toBe("diff_mismatch");

    const status = await reg.call("definition.repair.status", {});
    expect(status.ok).toBe(true);
    expect(status.state).toMatchObject({
      status: "dirty",
      dirty: true,
      active: false,
      guard: {
        operation_id: "definition.apply",
        target: "add_table_column:bookmarks.tags",
        status: "dirty",
        error: { code: "diff_mismatch" },
      },
    });

    const postCountAfterDirty = stats.postCount;
    const second = await reg.call("definition.apply", {
      kind: "add_table",
      table_id: "notes",
      columns: [{ name: "title", type: { kind: "primitive", of: "Text" } }],
    });
    expect(second.ok).toBe(false);
    expect((second.state as { failure: { category: string } }).failure.category).toBe("dirty_definition_state");
    expect(second.error).toContain("definition mutation blocked");
    expect(stats.postCount).toBe(postCountAfterDirty);

    await reg.call("lifecycle.dev.stop", {});
  }, "no-schema-change");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts -t "definition.apply diff mismatch marks dirty and blocks the next mutation before runtime POST"
```

Expected: FAIL because `diff_mismatch` does not create a dirty guard and later mutation is not blocked.

- [ ] **Step 3: Add dirty failure category**

Add `"dirty_definition_state"` to `DefinitionApplyFailureCategory` in `packages/core/src/types.ts`.

- [ ] **Step 4: Implement guard start/update/dirty helpers**

Add helpers to `LifecycleOrchestrator`:

```ts
private ensureNoDefinitionMutationGuard(operationId: string): void {
  const guard = this.state.definitionMutationGuard;
  if (!guard) return;
  const status = guard.status === "dirty" ? "dirty" : "running";
  throw new Error(
    `definition mutation blocked: app definition is ${status}; call definition.repair.status before starting ${operationId}`,
  );
}

private startDefinitionMutationGuard(input: {
  readonly attempt_id: string;
  readonly operation_id: DefinitionMutationGuard["operation_id"];
  readonly target: string;
  readonly expected_history_version?: number;
  readonly last_known_good_history_version?: number;
  readonly last_known_good_summary?: DefinitionRepairOverlaySummary;
}): DefinitionMutationGuard {
  const now = Date.now();
  const guard: DefinitionMutationGuard = {
    attempt_id: input.attempt_id,
    app_id: "definition-apply-test",
    operation_id: input.operation_id,
    target: input.target,
    expected_history_version: input.expected_history_version,
    last_known_good_history_version: input.last_known_good_history_version,
    last_known_good_summary: input.last_known_good_summary,
    status: "running",
    phase: "started",
    started_at_ms: now,
    updated_at_ms: now,
  };
  this.state.definitionMutationGuard = guard;
  this.persistDefinitionMutationGuard(guard);
  return guard;
}

private updateDefinitionMutationGuard(
  phase: DefinitionMutationGuard["phase"],
  patch: Partial<Pick<DefinitionMutationGuard, "current_observed_summary">> = {},
): void {
  const current = this.state.definitionMutationGuard;
  if (!current) return;
  const next: DefinitionMutationGuard = {
    ...current,
    ...patch,
    phase,
    updated_at_ms: Date.now(),
  };
  this.state.definitionMutationGuard = next;
  this.persistDefinitionMutationGuard(next);
}

private markDefinitionMutationDirty(code: string, message: string, patch: Partial<DefinitionMutationGuard> = {}): void {
  const current = this.state.definitionMutationGuard;
  if (!current) return;
  const next: DefinitionMutationGuard = {
    ...current,
    ...patch,
    status: "dirty",
    updated_at_ms: Date.now(),
    error: { code, message },
  };
  this.state.definitionMutationGuard = next;
  this.persistDefinitionMutationGuard(next);
}
```

Also add summary and target helpers:

```ts
private definitionRepairOverlaySummary(config: RuntimeConfigDiscovery): DefinitionRepairOverlaySummary {
  return {
    tables: config.tables.map((table) => table.id).sort(),
    table_columns: config.tables
      .flatMap((table) => table.columns.map((column) => `${table.id}.${column.name}`))
      .sort(),
    operations: config.operations.map((operation) => operation.id).sort(),
    views: config.views.map((view) => view.id).sort(),
    policy_rules: config.policy_rules.map((rule) => rule.id).sort(),
    policy_default_posture: config.policy_default_posture.app,
  };
}

private definitionApplyGuardTarget(change: DefinitionApplyChange): string {
  if (change.kind === "add_table") return `add_table:${change.table_id}`;
  if (change.kind === "add_table_column") return `add_table_column:${change.table_id}.${change.column_name}`;
  if (change.kind === "add_operation") return `add_operation:${change.operation_id}`;
  if (change.kind === "add_view") return `add_view:${change.view_id}`;
  if (change.kind === "add_policy_rule") return `add_policy_rule:${change.rule_id}`;
  if (change.kind === "update_policy_rule") return `update_policy_rule:${change.rule_id}`;
  if (change.kind === "delete_policy_rule") return `delete_policy_rule:${change.rule_id}`;
  return `set_default_posture:${change.app}`;
}
```

- [ ] **Step 5: Wrap `runDefinitionApply`**

Inside `runDefinitionApply`, after `mode` is computed and before runtime mutation, block dirty/running state only for apply mode:

```ts
if (mode !== "validate") {
  try {
    this.ensureNoDefinitionMutationGuard("definition.apply");
  } catch (err) {
    mark("failed", "failed", {
      category: "dirty_definition_state",
      message: (err as Error).message,
    });
    this.recordDefinitionApplyFailure(changeId, "dirty_definition_state", (err as Error).message, timeline);
    throw new DefinitionApplyError("dirty_definition_state", (err as Error).message, {
      change_id: changeId,
      timeline: [...timeline],
      cause: err,
    });
  }
}
```

After validation and approval have succeeded, immediately before `mark("applying-definition")`, create the guard:

```ts
this.startDefinitionMutationGuard({
  attempt_id: changeId,
  operation_id: "definition.apply",
  target: this.definitionApplyGuardTarget(change),
  last_known_good_summary: this.definitionRepairOverlaySummary(before),
});
```

Update phases around the existing lifecycle:

```ts
this.updateDefinitionMutationGuard("mutating");
mark("applying-definition");
const opResult = await this.callDefinitionOperation(serviceUrl, change).catch((err) => {
  this.clearDefinitionMutationGuard();
  return fail("operation_failed", (err as Error).message, err);
});

this.updateDefinitionMutationGuard("stopping");
mark("stopping-for-definition-apply");

this.updateDefinitionMutationGuard("restarting");
mark("starting-after-definition-apply");

this.updateDefinitionMutationGuard("verifying");
mark("refreshing-definition");
```

For failures after successful mutation call, call `markDefinitionMutationDirty(category, message, { current_observed_summary })` before throwing. On success, call `this.clearDefinitionMutationGuard()` immediately before returning.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts -t "definition.apply diff mismatch marks dirty and blocks the next mutation before runtime POST"
```

Expected: PASS.

## Task 3: Durable Dirty Replay

**Files:**
- Modify: `packages/core/src/lifecycle.ts`
- Test: `packages/core/test/tools/definition-apply.test.ts`

- [ ] **Step 1: Write the failing durable replay test**

Add this test after the dirty apply test:

```ts
test("definition mutation guard persists dirty state across orchestrator instances", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-dirty-persist-"));
    const firstOrch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const firstReg = createToolRegistry({ orchestrator: firstOrch });
    registerActionTools(firstReg);

    expect((await firstReg.call("lifecycle.dev.start", {})).ok).toBe(true);
    expect((await firstReg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
    })).ok).toBe(false);
    await firstReg.call("lifecycle.dev.stop", {});

    const secondOrch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const secondReg = createToolRegistry({ orchestrator: secondOrch });
    registerActionTools(secondReg);

    expect((await secondReg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const status = await secondReg.call("definition.repair.status", {});
    expect(status.state).toMatchObject({ status: "dirty", dirty: true });

    const postCountBeforeBlocked = stats.postCount;
    const blocked = await secondReg.call("definition.apply", {
      kind: "add_table",
      table_id: "notes",
      columns: [{ name: "title", type: { kind: "primitive", of: "Text" } }],
    });
    expect(blocked.ok).toBe(false);
    expect((blocked.state as { failure: { category: string } }).failure.category).toBe("dirty_definition_state");
    expect(stats.postCount).toBe(postCountBeforeBlocked);

    await secondReg.call("lifecycle.dev.stop", {});
  }, "no-schema-change");
});
```

- [ ] **Step 2: Run the focused test and verify RED/GREEN**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts -t "definition mutation guard persists dirty state across orchestrator instances"
```

Expected before constructor loading is wired: FAIL. After Task 1 constructor loading and Task 2 dirty persistence are complete: PASS.

## Task 4: Rollback Dirty Guard And Blocking

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/lifecycle.ts`
- Test: `packages/core/test/tools/definition-apply.test.ts`

- [ ] **Step 1: Write the failing rollback verification test**

Extend the test fixture mode union:

```ts
| "rollback-no-schema-change";
```

Change the rollback executor fixture condition:

```ts
if (mode === "rollback-no-schema-change") {
  // Simulate a handler that returns success but leaves the observed definition unchanged.
} else if (mode === "rollback-operation") {
  operations = [];
} else if (mode === "rollback-column") {
  tables = tables.map((table) =>
    table.id === "bookmarks"
      ? { ...table, columns: table.columns.filter((column) => column.name !== "tags") }
      : table,
  );
} else {
  tables = tables.filter((table) => table.id !== "notes");
}
```

Add this test near rollback execute tests:

```ts
test("definition.rollback.execute verification failure marks dirty and blocks later definition.apply", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-dirty-block-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    expect((await reg.call("definition.apply", {
      kind: "add_table",
      table_id: "notes",
      columns: [{ name: "title", type: { kind: "primitive", of: "Text" } }],
    })).ok).toBe(true);

    const rollback = await reg.call("definition.rollback.execute", {
      target_history_version: 0,
      require_approval: false,
    });
    expect(rollback.ok).toBe(false);
    expect((rollback.state as { failure: { category: string } }).failure.category).toBe("verification_failed");

    const status = await reg.call("definition.repair.status", {});
    expect(status.state).toMatchObject({
      status: "dirty",
      guard: {
        operation_id: "definition.rollback.execute",
        target: "history:0",
        status: "dirty",
        error: { code: "verification_failed" },
      },
    });

    const postCountAfterDirty = stats.postCount;
    const blocked = await reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
    });
    expect(blocked.ok).toBe(false);
    expect((blocked.state as { failure: { category: string } }).failure.category).toBe("dirty_definition_state");
    expect(stats.postCount).toBe(postCountAfterDirty);

    await reg.call("lifecycle.dev.stop", {});
  }, "rollback-no-schema-change");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts -t "definition.rollback.execute verification failure marks dirty and blocks later definition.apply"
```

Expected: FAIL because rollback failures do not create a dirty guard.

- [ ] **Step 3: Add rollback blocked category**

Add `"dirty_definition_state"` to `DefinitionRollbackExecuteFailureCategory` in `packages/core/src/types.ts`.

- [ ] **Step 4: Wrap `runDefinitionRollbackExecute`**

At the start of `runDefinitionRollbackExecute`, after `mark("preparing")`, block existing guards:

```ts
try {
  this.ensureNoDefinitionMutationGuard("definition.rollback.execute");
} catch (err) {
  mark("failed", "failed", {
    category: "dirty_definition_state",
    message: (err as Error).message,
  });
  this.recordDefinitionRollbackExecuteFailure(
    rollbackId,
    targetHistoryVersion,
    "dirty_definition_state",
    (err as Error).message,
    timeline,
  );
  throw new DefinitionRollbackExecuteError("dirty_definition_state", (err as Error).message, {
    rollback_id: rollbackId,
    target_history_version: targetHistoryVersion,
    timeline: [...timeline],
    cause: err,
  });
}
```

After prepare succeeds and before the destructive runtime call, create the guard:

```ts
this.startDefinitionMutationGuard({
  attempt_id: rollbackId,
  operation_id: "definition.rollback.execute",
  target: `history:${targetHistoryVersion}`,
  expected_history_version: targetHistoryVersion,
  last_known_good_summary: this.definitionRepairOverlaySummary(before),
});
this.updateDefinitionMutationGuard("rollback_mutating");
```

Mark guard phases for stop/restart/verify. If the runtime call returns HTTP failure, restart fails, config refresh fails, or verification fails after the guard is running, mark the guard dirty before throwing. On success, clear it.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts -t "definition.rollback.execute verification failure marks dirty and blocks later definition.apply"
```

Expected: PASS.

## Task 5: Conservative Reset To Last Known Good

**Files:**
- Modify: `packages/core/src/lifecycle.ts`
- Modify: `packages/core/src/tools/action.ts`
- Test: `packages/core/test/tools/definition-apply.test.ts`

- [ ] **Step 1: Write the failing reset test**

Add this test near repair status tests:

```ts
test("definition.repair.reset_to_last_good clears dirty guard when observed definition still matches last known good", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-repair-reset-clean-observed-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    expect((await reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
    })).ok).toBe(false);
    expect((await reg.call("definition.repair.status", {})).state).toMatchObject({ status: "dirty" });

    const reset = await reg.call("definition.repair.reset_to_last_good", {});
    expect(reset.ok).toBe(true);
    expect(reset.state).toMatchObject({
      status: "clean",
      reset: "cleared_dirty_guard",
    });

    const status = await reg.call("definition.repair.status", {});
    expect(status.state).toMatchObject({ status: "clean", dirty: false });

    const apply = await reg.call("definition.apply", {
      kind: "add_table",
      table_id: "notes",
      columns: [{ name: "title", type: { kind: "primitive", of: "Text" } }],
    });
    expect(apply.ok).toBe(true);

    await reg.call("lifecycle.dev.stop", {});
  }, "no-schema-change");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts -t "definition.repair.reset_to_last_good clears dirty guard when observed definition still matches last known good"
```

Expected: FAIL because the reset tool is not registered.

- [ ] **Step 3: Implement conservative reset**

Add this method to `LifecycleOrchestrator`:

```ts
async resetDefinitionToLastKnownGood(): Promise<{
  readonly status: "clean" | "dirty";
  readonly reset: "noop_clean" | "cleared_dirty_guard" | "manual_repair_required";
  readonly guard?: DefinitionMutationGuard;
  readonly current_observed_summary?: DefinitionRepairOverlaySummary;
  readonly last_known_good_summary?: DefinitionRepairOverlaySummary;
  readonly manual_repair_instructions?: readonly string[];
}> {
  const guard = this.state.definitionMutationGuard;
  if (!guard) return { status: "clean", reset: "noop_clean" };
  if (guard.status === "running") {
    return {
      status: "dirty",
      reset: "manual_repair_required",
      guard,
      manual_repair_instructions: ["A definition mutation is still running; wait for it to finish before repair."],
    };
  }
  const serviceUrl = this.currentDevServiceUrl();
  if (!serviceUrl) {
    return {
      status: "dirty",
      reset: "manual_repair_required",
      guard,
      manual_repair_instructions: ["Start dev mode, then run definition.repair.reset_to_last_good again."],
    };
  }
  const current = await this.fetchRuntimeConfig(serviceUrl);
  const currentSummary = this.definitionRepairOverlaySummary(current);
  if (
    guard.last_known_good_summary
    && JSON.stringify(currentSummary) === JSON.stringify(guard.last_known_good_summary)
  ) {
    this.clearDefinitionMutationGuard();
    return {
      status: "clean",
      reset: "cleared_dirty_guard",
      current_observed_summary: currentSummary,
      last_known_good_summary: guard.last_known_good_summary,
    };
  }
  this.markDefinitionMutationDirty("manual_repair_required", "Current definition does not match the last known good summary.", {
    current_observed_summary: currentSummary,
  });
  return {
    status: "dirty",
    reset: "manual_repair_required",
    guard: this.state.definitionMutationGuard,
    current_observed_summary: currentSummary,
    last_known_good_summary: guard.last_known_good_summary,
    manual_repair_instructions: [
      "The current observed app definition differs from the last known good summary.",
      "Use app history or a workspace snapshot to restore the definition overlay before clearing this guard.",
    ],
  };
}
```

Register the tool:

```ts
reg.register(
  {
    name: "definition.repair.reset_to_last_good",
    description: "Attempt a conservative repair by clearing dirty state only when the observed app definition matches the last known good summary.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  async (ctx): Promise<ToolResult> => {
    const state = await ctx.orchestrator.resetDefinitionToLastKnownGood();
    return state.status === "clean" ? { ok: true, state } : { ok: false, error: "manual repair required", state };
  },
);
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts -t "definition.repair.reset_to_last_good clears dirty guard when observed definition still matches last known good"
```

Expected: PASS.

## Task 6: Full Verification And Commit

**Files:**
- All modified files from previous tasks.

- [ ] **Step 1: Run focused definition tests**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts
```

Expected: all tests in the file pass.

- [ ] **Step 2: Run full test suite**

Run:

```bash
bun test
```

Expected: all tests pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: typecheck passes.

- [ ] **Step 4: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 5: Commit M2.6 implementation**

Run:

```bash
git add packages/core/src/types.ts packages/core/src/lifecycle.ts packages/core/src/tools/action.ts packages/core/test/tools/definition-apply.test.ts docs/superpowers/plans/2026-04-30-m2-6-recoverable-definition-mutation.md
git commit -m "feat: add recoverable definition mutation guard"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage:
  - Single in-process writer: implemented by `ensureNoDefinitionMutationGuard`.
  - Durable mutation guard: persisted to `.pneuma/definition-mutation-guard.json`.
  - Post-mutation verification: existing apply/rollback verification now marks dirty on failure.
  - Dirty-state gate: future `definition.apply` and `definition.rollback.execute` are blocked.
  - Repair surface: `definition.repair.status` and conservative `definition.repair.reset_to_last_good`.
- Intentional limitation:
  - `reset_to_last_good` only clears dirty state when the observed runtime definition still matches the stored last-known-good summary. If real partial mutation changed the overlay, it keeps dirty state and returns manual repair instructions instead of pretending a fine-grained restore exists.
- Placeholder scan:
  - No `TBD`, `TODO`, or unspecified test commands remain in this plan.
- Type consistency:
  - Guard type names match helper names and tool result states used by tests.
