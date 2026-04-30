# M2.7 Permission Center v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first product-shaped Permission Center surface over the existing permission ledger and governance evidence loop.

**Architecture:** Extend the existing permission ledger read model with filter and summary helpers, seed that derived state through the existing `permission-ledger-state` framework event, add a reusable React `PermissionCenterPanel`, and replace the governance demo right-rail card with the new Permission Center v0 surface. No new primitive, no new approval authority, and no new wire envelope.

**Tech Stack:** Bun test runner, TypeScript, React 19, `@testing-library/react`, existing `PermissionLedgerStore`, existing wire-protocol framework events.

---

## File Map

- Modify `packages/core/src/permission-ledger.ts`
  - Add `PermissionLedgerRequestQuery`, `PermissionCenterSummary`, `PermissionCenterState`.
  - Add `filterPermissionLedgerRequests`, `summarizePermissionLedgerRequests`, `derivePermissionCenterState`.
  - Extend `PermissionLedgerRequestListOptions` with query fields.
- Modify `packages/core/src/index.ts`
  - Export the new helpers and types.
  - Export `DefinitionRepairStatus` for viewer props.
- Modify `packages/core/src/wire-protocol/types.ts`
  - Add optional `permission_center` to `PermissionLedgerState`.
- Modify `packages/core/src/wire-protocol/permission-ledger-state.ts`
  - Seed `permission_center` using the same ledger records as `pending` and `recent`.
- Modify `packages/viewer-react/src/PermissionCenter.tsx`
  - New component for summary, filters, record list, record detail, optional actions, dirty-state callout.
- Modify `packages/viewer-react/src/index.ts`
  - Export `PermissionCenterPanel`.
- Modify `packages/viewer-react/test/PermissionCenter.test.tsx`
  - New product-contract tests for the component.
- Modify `examples/p5-viewer-approval-e2e/src/main.tsx`
  - Use `PermissionCenterPanel` in the governance variant right rail.
- Modify `examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts`
  - Assert the demo wire state exposes Permission Center summary and records.

## Task 1: Core Permission Ledger Query And Summary

**Files:**
- Modify: `packages/core/src/permission-ledger.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/permission-ledger.test.ts`

- [ ] **Step 1: Write the failing query and summary tests**

Append these tests near the existing request limit and governance evidence tests in `packages/core/test/permission-ledger.test.ts`:

Update the import from `../src/permission-ledger.js` so it includes `derivePermissionCenterState`:

```ts
import {
  FilePermissionLedgerStore,
  InMemoryPermissionLedgerStore,
  approvalTokenLedgerHash,
  derivePermissionCenterState,
  permissionLedgerFilePath,
  type PermissionLedgerEvent,
} from "../src/permission-ledger.js";
```

```ts
function requestWith(input: {
  readonly prompt_id: string;
  readonly at_ms: number;
  readonly tool?: string;
  readonly capability?: PermissionLedgerEvent["capability"];
  readonly target?: PermissionLedgerEvent["target"];
  readonly requested_principal?: Extract<PermissionLedgerEvent, { event_type: "permission_requested" }>["requested_principal"];
  readonly detail?: Record<string, unknown>;
}): PermissionLedgerEvent {
  return {
    ...requested(input.prompt_id, input.at_ms),
    tool: input.tool ?? "definition.apply",
    capability: input.capability ?? "definition:apply",
    target: input.target ?? { kind: "definition", id: `definition:${input.prompt_id}`, fingerprint: input.prompt_id },
    target_fingerprint: input.target?.fingerprint ?? input.prompt_id,
    requested_principal: input.requested_principal ?? {
      kind: "build_agent",
      id: "opencode",
      acting_for: { kind: "builder", id: "builder:default" },
    },
    detail: input.detail ?? { change_id: input.prompt_id },
  };
}

function respond(prompt_id: string, decision: "allow" | "deny", at_ms: number): PermissionLedgerEvent {
  return {
    schema_version: 1,
    event_id: `evt-${prompt_id}-response`,
    event_type: "permission_responded",
    at_ms,
    prompt_id,
    app_id,
    workspace_id,
    tool: "definition.apply",
    decision,
    decided_by: { kind: "builder", id: "builder:default" },
  };
}

function complete(prompt_id: string, at_ms: number): PermissionLedgerEvent {
  return {
    schema_version: 1,
    event_id: `evt-${prompt_id}-completed`,
    event_type: "permission_execution_completed",
    at_ms,
    prompt_id,
    app_id,
    workspace_id,
    tool: "definition.apply",
  };
}

function fail(prompt_id: string, at_ms: number, message: string): PermissionLedgerEvent {
  return {
    schema_version: 1,
    event_id: `evt-${prompt_id}-failed`,
    event_type: "permission_execution_failed",
    at_ms,
    prompt_id,
    app_id,
    workspace_id,
    tool: "definition.apply",
    message,
  };
}

test("permission ledger request query filters by governance dimensions and preserves newest-first order", () => {
  const store = new InMemoryPermissionLedgerStore();
  store.append(requestWith({
    prompt_id: "prompt-view",
    at_ms: 300,
    capability: "view:mount",
    target: { kind: "view", id: "review_queue", fingerprint: "view:review_queue" },
  }));
  store.append(respond("prompt-view", "allow", 310));
  store.append(complete("prompt-view", 320));
  store.append(requestWith({
    prompt_id: "prompt-policy",
    at_ms: 200,
    capability: "policy:mutate",
    target: { kind: "policy_rule", id: "reviewers-can-read-review-queue", fingerprint: "policy:reviewers" },
    requested_principal: { kind: "builder", id: "builder:default" },
  }));
  store.append(respond("prompt-policy", "deny", 210));
  store.append(requestWith({
    prompt_id: "prompt-failed",
    at_ms: 100,
    capability: "definition:apply",
    target: { kind: "definition", id: "definition.apply:add_table_column:tags", fingerprint: "definition:tags" },
  }));
  store.append(fail("prompt-failed", 120, "dirty_definition_state blocked later mutation"));

  expect(store.listRequests({ status: "completed" }).map((record) => record.prompt_id)).toEqual(["prompt-view"]);
  expect(store.listRequests({ status: ["denied", "failed"] }).map((record) => record.prompt_id)).toEqual(["prompt-policy", "prompt-failed"]);
  expect(store.listRequests({ capability: "policy:mutate" }).map((record) => record.prompt_id)).toEqual(["prompt-policy"]);
  expect(store.listRequests({ target_kind: "policy_rule" }).map((record) => record.prompt_id)).toEqual(["prompt-policy"]);
  expect(store.listRequests({ requested_principal_kind: "builder" }).map((record) => record.prompt_id)).toEqual(["prompt-policy"]);
  expect(store.listRequests({ tool: "definition.apply", text: "review_queue" }).map((record) => record.prompt_id)).toEqual(["prompt-view", "prompt-policy"]);
  expect(store.listRequests({ text: "dirty_definition_state" }).map((record) => record.prompt_id)).toEqual(["prompt-failed"]);
  expect(store.listRequests({ limit: 2 }).map((record) => record.prompt_id)).toEqual(["prompt-view", "prompt-policy"]);
});

test("derivePermissionCenterState summarizes filtered records without exposing raw token ids", () => {
  const store = new InMemoryPermissionLedgerStore();
  const tokenHash = approvalTokenLedgerHash({ token_id: "approval-secret", app_id, workspace_id });
  store.append(requestWith({ prompt_id: "prompt-pending", at_ms: 400 }));
  store.append(requestWith({ prompt_id: "prompt-completed", at_ms: 300, capability: "definition:apply" }));
  store.append({
    schema_version: 1,
    event_id: "evt-token",
    event_type: "approval_token_issued",
    at_ms: 305,
    prompt_id: "prompt-completed",
    app_id,
    workspace_id,
    tool: "definition.apply",
    capability: "definition:apply",
    approval_token_hash: tokenHash,
    approved_capability: "definition:apply",
    approved_by: { kind: "builder", id: "builder:default" },
    issued_at_ms: 305,
    expires_at_ms: 605,
    single_use: true,
  });
  store.append(complete("prompt-completed", 320));
  store.append(requestWith({ prompt_id: "prompt-denied", at_ms: 200, capability: "policy:mutate" }));
  store.append(respond("prompt-denied", "deny", 210));
  store.append(requestWith({ prompt_id: "prompt-failed", at_ms: 100 }));
  store.append(fail("prompt-failed", 120, "Execution failed"));

  const state = derivePermissionCenterState(store.listRequests(), {
    dirtyDefinitionState: true,
    query: { status: ["pending", "completed", "denied", "failed"] },
  });

  expect(state.summary).toEqual({
    pending: 1,
    completed: 1,
    denied: 1,
    failed: 1,
    expired: 0,
    dirty_definition_state: true,
  });
  expect(state.records.map((record) => record.prompt_id)).toEqual([
    "prompt-pending",
    "prompt-completed",
    "prompt-denied",
    "prompt-failed",
  ]);
  expect(JSON.stringify(state)).toContain(tokenHash);
  expect(JSON.stringify(state)).not.toContain("approval-secret");
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
bun test packages/core/test/permission-ledger.test.ts -t "permission ledger request query filters|derivePermissionCenterState summarizes"
```

Expected: FAIL because `derivePermissionCenterState` is not imported/exported and query fields are not implemented.

- [ ] **Step 3: Add query and Permission Center types**

Modify `packages/core/src/permission-ledger.ts`:

```ts
export interface PermissionLedgerRequestQuery {
  readonly status?: PermissionLedgerRequestStatus | readonly PermissionLedgerRequestStatus[];
  readonly tool?: string | readonly string[];
  readonly capability?: Capability | readonly Capability[];
  readonly target_kind?: AuthorizationTarget["kind"] | readonly AuthorizationTarget["kind"][];
  readonly requested_principal_kind?: Principal["kind"] | readonly Principal["kind"][];
  readonly execution_principal_kind?: Principal["kind"] | readonly Principal["kind"][];
  readonly text?: string;
  readonly limit?: number;
}

export interface PermissionCenterSummary {
  readonly pending: number;
  readonly completed: number;
  readonly denied: number;
  readonly failed: number;
  readonly expired: number;
  readonly dirty_definition_state?: boolean;
}

export interface PermissionCenterState {
  readonly summary: PermissionCenterSummary;
  readonly records: readonly PermissionLedgerRequestRecord[];
  readonly query: PermissionLedgerRequestQuery;
}

export interface PermissionCenterStateOptions {
  readonly query?: PermissionLedgerRequestQuery;
  readonly dirtyDefinitionState?: boolean;
}
```

Change `PermissionLedgerRequestListOptions` to extend the query shape:

```ts
export interface PermissionLedgerRequestListOptions extends PermissionLedgerRequestQuery {
  readonly livePromptIds?: ReadonlySet<string>;
}
```

- [ ] **Step 4: Implement filters and summary**

Add helpers in `packages/core/src/permission-ledger.ts` below `derivePermissionLedgerRequests`:

```ts
export function filterPermissionLedgerRequests(
  records: readonly PermissionLedgerRequestRecord[],
  query: PermissionLedgerRequestQuery = {},
): readonly PermissionLedgerRequestRecord[] {
  return records.filter((record) => matchesRequestQuery(record, query));
}

export function summarizePermissionLedgerRequests(
  records: readonly PermissionLedgerRequestRecord[],
  dirtyDefinitionState = false,
): PermissionCenterSummary {
  const summary: PermissionCenterSummary = {
    pending: records.filter((record) => record.status === "pending").length,
    completed: records.filter((record) => record.status === "completed").length,
    denied: records.filter((record) => record.status === "denied").length,
    failed: records.filter((record) => record.status === "failed").length,
    expired: records.filter((record) => record.status === "expired").length,
    ...(dirtyDefinitionState ? { dirty_definition_state: true } : {}),
  };
  return summary;
}

export function derivePermissionCenterState(
  records: readonly PermissionLedgerRequestRecord[],
  options: PermissionCenterStateOptions = {},
): PermissionCenterState {
  const query = options.query ?? {};
  const filtered = filterPermissionLedgerRequests(records, { ...query, limit: undefined });
  return {
    summary: summarizePermissionLedgerRequests(filtered, options.dirtyDefinitionState ?? false),
    records: applyNewestFirstLimit(filtered, query.limit),
    query,
  };
}
```

Add `matchesRequestQuery`, `matchesOneOrMany`, and `recordSearchText`:

```ts
function matchesRequestQuery(record: PermissionLedgerRequestRecord, query: PermissionLedgerRequestQuery): boolean {
  if (!matchesOneOrMany(record.status, query.status)) return false;
  if (!matchesOneOrMany(record.tool, query.tool)) return false;
  if (!matchesOneOrMany(record.capability, query.capability)) return false;
  if (!matchesOneOrMany(record.target?.kind, query.target_kind)) return false;
  if (!matchesOneOrMany(record.requested_principal?.kind, query.requested_principal_kind)) return false;
  if (!matchesOneOrMany(record.execution_principal?.kind, query.execution_principal_kind)) return false;
  if (query.text && !recordSearchText(record).includes(query.text.toLowerCase())) return false;
  return true;
}

function matchesOneOrMany<T extends string>(value: T | undefined, allowed: T | readonly T[] | undefined): boolean {
  if (allowed === undefined) return true;
  if (value === undefined) return false;
  return Array.isArray(allowed) ? allowed.includes(value) : value === allowed;
}

function recordSearchText(record: PermissionLedgerRequestRecord): string {
  return [
    record.prompt_id,
    record.tool,
    record.capability,
    record.target?.id,
    record.target?.fingerprint,
    record.target_fingerprint,
    record.requested_principal?.id,
    record.execution_principal?.id,
    record.authorization_reason_code,
    record.message,
  ].filter((value): value is string => typeof value === "string").join(" ").toLowerCase();
}
```

Update `derivePermissionLedgerRequests` so filters run before `limit`:

```ts
  const records = [...byPrompt.values()]
    .map((bucket) => deriveOne(bucket, options.livePromptIds ?? new Set()))
    .filter((record): record is PermissionLedgerRequestRecord => record !== undefined)
    .sort((a, b) => b.requested_at_ms - a.requested_at_ms);
  return applyNewestFirstLimit(filterPermissionLedgerRequests(records, { ...options, limit: undefined }), options.limit);
```

- [ ] **Step 5: Export helpers and types**

Modify `packages/core/src/index.ts`:

```ts
export {
  FilePermissionLedgerStore,
  InMemoryPermissionLedgerStore,
  approvalTokenLedgerHash,
  derivePermissionCenterState,
  derivePermissionLedgerRequests,
  filterPermissionLedgerRequests,
  permissionLedgerEventId,
  permissionLedgerFilePath,
  summarizePermissionLedgerRequests,
} from "./permission-ledger.js";
export type {
  PermissionCenterState,
  PermissionCenterStateOptions,
  PermissionCenterSummary,
  PermissionLedgerBaseEvent,
  PermissionLedgerDecision,
  PermissionLedgerEvent,
  PermissionLedgerListOptions,
  PermissionLedgerRequestListOptions,
  PermissionLedgerRequestQuery,
  PermissionLedgerRequestRecord,
  PermissionLedgerRequestStatus,
  PermissionLedgerStore,
} from "./permission-ledger.js";
```

Also add `DefinitionRepairStatus` to the type export from `./types.js`.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
bun test packages/core/test/permission-ledger.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/permission-ledger.ts packages/core/src/index.ts packages/core/test/permission-ledger.test.ts
git commit -m "feat: add permission center ledger query"
```

## Task 2: Seed Permission Center State Through The Existing Wire Event

**Files:**
- Modify: `packages/core/src/wire-protocol/types.ts`
- Modify: `packages/core/src/wire-protocol/permission-ledger-state.ts`
- Test: `packages/core/test/wire-protocol/permission-ledger-seed.test.ts`

- [ ] **Step 1: Write the failing wire-state test**

Append this test to `packages/core/test/wire-protocol/permission-ledger-seed.test.ts`:

```ts
test("seedPermissionLedgerState includes backward-compatible permission center summary and records", () => {
  const ledger = new InMemoryPermissionLedgerStore();
  ledger.append({
    schema_version: 1,
    event_id: "evt-pending",
    event_type: "permission_requested",
    at_ms: 200,
    prompt_id: "prompt-pending",
    app_id: "app:test",
    workspace_id: "workspace:test",
    tool: "definition.apply",
    capability: "definition:apply",
    detail: { change_id: "def-pending" },
  });
  ledger.append({
    schema_version: 1,
    event_id: "evt-completed-request",
    event_type: "permission_requested",
    at_ms: 100,
    prompt_id: "prompt-completed",
    app_id: "app:test",
    workspace_id: "workspace:test",
    tool: "definition.apply",
    capability: "definition:apply",
    detail: { change_id: "def-completed" },
  });
  ledger.append({
    schema_version: 1,
    event_id: "evt-completed",
    event_type: "permission_execution_completed",
    at_ms: 110,
    prompt_id: "prompt-completed",
    app_id: "app:test",
    workspace_id: "workspace:test",
    tool: "definition.apply",
  });

  const envelopes = seedPermissionLedgerState({
    ledger,
    livePromptIds: new Set(["prompt-pending"]),
    livePromptEnvelopes: [],
  });

  expect(envelopes[0]).toMatchObject({
    kind: "framework-event",
    event: {
      type: "permission-ledger-state",
      state: {
        pending: [{ prompt_id: "prompt-pending", live: true }],
        recent: [{ prompt_id: "prompt-completed", status: "completed" }],
        permission_center: {
          summary: { pending: 1, completed: 1, denied: 0, failed: 0, expired: 0 },
          records: [
            { prompt_id: "prompt-pending" },
            { prompt_id: "prompt-completed" },
          ],
          query: { limit: 20 },
        },
      },
    },
  });
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
bun test packages/core/test/wire-protocol/permission-ledger-seed.test.ts -t "permission center summary"
```

Expected: FAIL because `permission_center` is absent.

- [ ] **Step 3: Add `permission_center` to wire state type**

Modify `packages/core/src/wire-protocol/types.ts`:

```ts
import type { PermissionCenterState, PermissionLedgerRequestRecord } from "../permission-ledger.js";

export interface PermissionLedgerState {
  readonly pending: readonly PermissionLedgerRequestRecord[];
  readonly recent: readonly PermissionLedgerRequestRecord[];
  readonly permission_center?: PermissionCenterState;
}
```

- [ ] **Step 4: Seed Permission Center state**

Modify `packages/core/src/wire-protocol/permission-ledger-state.ts`:

```ts
import { derivePermissionCenterState, type PermissionLedgerRequestQuery, type PermissionLedgerStore } from "../permission-ledger.js";

export function seedPermissionLedgerState(input: {
  readonly ledger?: PermissionLedgerStore;
  readonly livePromptIds: ReadonlySet<string>;
  readonly livePromptEnvelopes: readonly PermissionPromptEnvelope[];
  readonly recentLimit?: number;
  readonly permissionCenterQuery?: PermissionLedgerRequestQuery;
}): WireEnvelope[] {
  // existing async guard stays unchanged
  const records = input.ledger.listRequests({ livePromptIds: input.livePromptIds });
  // existing Promise handling stays unchanged
  const permissionCenterQuery = input.permissionCenterQuery ?? { limit: input.recentLimit ?? 20 };
  // pending/recent derivation stays unchanged
  return [{
    dir: "a2v",
    kind: "framework-event",
    event: {
      type: "permission-ledger-state",
      state: {
        pending,
        recent,
        permission_center: derivePermissionCenterState(records, { query: permissionCenterQuery }),
      },
    },
  }, ...livePromptEnvelopes];
}
```

Keep the existing Promise rejection drain behavior exactly as it is.

- [ ] **Step 5: Run wire tests and verify GREEN**

Run:

```bash
bun test packages/core/test/wire-protocol/permission-ledger-seed.test.ts packages/core/test/wire-protocol/seed-on-open.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/wire-protocol/types.ts packages/core/src/wire-protocol/permission-ledger-state.ts packages/core/test/wire-protocol/permission-ledger-seed.test.ts
git commit -m "feat: seed permission center state"
```

## Task 3: Add React Permission Center Panel

**Files:**
- Create: `packages/viewer-react/src/PermissionCenter.tsx`
- Modify: `packages/viewer-react/src/index.ts`
- Test: `packages/viewer-react/test/PermissionCenter.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `packages/viewer-react/test/PermissionCenter.test.tsx`:

```tsx
import { GlobalRegistrator } from "@happy-dom/global-registrator";
const PRESERVED_GLOBALS = [
  "fetch", "Request", "Response", "Headers", "WebSocket", "FormData",
  "Blob", "File", "URL", "AbortController", "AbortSignal",
  "Event", "EventTarget", "queueMicrotask",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval",
] as const;
const nativeGlobals: Record<string, unknown> = {};
for (const k of PRESERVED_GLOBALS) nativeGlobals[k] = (globalThis as unknown as Record<string, unknown>)[k];
if (!("window" in globalThis)) GlobalRegistrator.register();
for (const k of PRESERVED_GLOBALS) (globalThis as unknown as Record<string, unknown>)[k] = nativeGlobals[k];

import { test, expect } from "bun:test";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";
import { PermissionCenterPanel } from "../src/index.js";

const completed = {
  prompt_id: "prompt-completed",
  status: "completed",
  live: false,
  requested_at_ms: 100,
  completed_at_ms: 120,
  tool: "definition.apply",
  capability: "definition:apply",
  target: { kind: "definition", id: "definition.apply:add_operation:export_saved_urls", fingerprint: "target-export" },
  target_fingerprint: "target-export",
  requested_principal: { kind: "build_agent", id: "opencode", acting_for: { kind: "builder", id: "builder:default" } },
  decided_by: { kind: "builder", id: "builder:default" },
  decision: "allow",
  approved_by: { kind: "builder", id: "builder:default" },
  approval_token_hash: "token-hash-123",
  approved_capability: "definition:apply",
  approval_token_expires_at_ms: 900,
  approval_token_single_use: true,
  execution_principal: { kind: "framework_system", id: "framework" },
  authorization_reason_code: "allowed",
  detail: {},
} as const;

const pending = {
  prompt_id: "prompt-pending",
  status: "pending",
  live: true,
  requested_at_ms: 200,
  tool: "definition.apply",
  capability: "policy:mutate",
  target: { kind: "policy_rule", id: "reviewers-can-read-review-queue", fingerprint: "target-policy" },
  target_fingerprint: "target-policy",
  requested_principal: { kind: "build_agent", id: "opencode", acting_for: { kind: "builder", id: "builder:default" } },
  detail: {},
} as const;

test("PermissionCenterPanel renders summary counters and authority proof", () => {
  const { getByText } = render(React.createElement(PermissionCenterPanel, { pending: [pending], recent: [completed] }));

  expect(getByText("Permission Center")).toBeTruthy();
  expect(getByText("1 pending")).toBeTruthy();
  expect(getByText("1 completed")).toBeTruthy();
  expect(getByText("definition.apply:add_operation:export_saved_urls")).toBeTruthy();
  expect(getByText("build_agent:opencode")).toBeTruthy();
  expect(getByText("framework_system:framework")).toBeTruthy();
  expect(getByText("token hash token-hash-123")).toBeTruthy();
});

test("PermissionCenterPanel filters visible records by status, capability, principal kind, tool, and text", () => {
  const { getByLabelText, getByText, queryByText } = render(
    React.createElement(PermissionCenterPanel, { pending: [pending], recent: [completed] }),
  );

  fireEvent.change(getByLabelText("Search permission records"), { target: { value: "review_queue" } });
  expect(getByText("policy:mutate")).toBeTruthy();
  expect(queryByText("definition:apply")).toBeNull();

  fireEvent.change(getByLabelText("Search permission records"), { target: { value: "" } });
  fireEvent.change(getByLabelText("Status filter"), { target: { value: "completed" } });
  expect(queryByText("policy:mutate")).toBeNull();
  expect(getByText("definition:apply")).toBeTruthy();

  fireEvent.change(getByLabelText("Status filter"), { target: { value: "all" } });
  fireEvent.change(getByLabelText("Capability filter"), { target: { value: "policy:mutate" } });
  expect(getByText("policy:mutate")).toBeTruthy();
  expect(queryByText("definition:apply")).toBeNull();

  fireEvent.change(getByLabelText("Capability filter"), { target: { value: "all" } });
  fireEvent.change(getByLabelText("Principal filter"), { target: { value: "build_agent" } });
  expect(getByText("policy:mutate")).toBeTruthy();
  expect(getByText("definition:apply")).toBeTruthy();

  fireEvent.change(getByLabelText("Tool filter"), { target: { value: "definition.apply" } });
  expect(getByText("policy:mutate")).toBeTruthy();
});

test("PermissionCenterPanel only renders approval actions when onRespond is provided", () => {
  const readonly = render(React.createElement(PermissionCenterPanel, { pending: [pending], recent: [] }));
  expect(readonly.queryByText("Allow")).toBeNull();
  readonly.unmount();

  const responses: Array<{ id: string; decision: "allow" | "deny" | "allow-always" }> = [];
  const actionable = render(React.createElement(PermissionCenterPanel, {
    pending: [pending],
    recent: [],
    onRespond: (response) => responses.push(response),
  }));
  fireEvent.click(actionable.getByText("Allow"));
  expect(responses).toEqual([{ id: "prompt-pending", decision: "allow" }]);
});

test("PermissionCenterPanel renders dirty definition repair state", () => {
  const { getByText } = render(React.createElement(PermissionCenterPanel, {
    pending: [],
    recent: [],
    repairStatus: {
      status: "dirty",
      dirty: true,
      active: false,
      guard: {
        attempt_id: "attempt-1",
        app_id: "fixture-min",
        operation_id: "definition.apply",
        target: "definition.apply:add_table_column:tags",
        status: "dirty",
        phase: "verifying",
        started_at_ms: 100,
        updated_at_ms: 120,
        error: { code: "diff_mismatch", message: "Expected tags column was not observed." },
      },
    },
  }));

  expect(getByText("Definition repair required")).toBeTruthy();
  expect(getByText("diff_mismatch")).toBeTruthy();
});
```

- [ ] **Step 2: Run focused component tests and verify RED**

Run:

```bash
bun test packages/viewer-react/test/PermissionCenter.test.tsx
```

Expected: FAIL because `PermissionCenterPanel` is not exported.

- [ ] **Step 3: Implement `PermissionCenterPanel`**

Create `packages/viewer-react/src/PermissionCenter.tsx` with:

```tsx
import * as React from "react";
import type { CSSProperties } from "react";
import {
  derivePermissionCenterState,
  filterPermissionLedgerRequests,
  type DefinitionRepairStatus,
  type PermissionLedgerRequestQuery,
  type PermissionLedgerRequestRecord,
  type PermissionLedgerRequestStatus,
  type WirePermissionResponse,
} from "@pneuma-framework/core";
import { formatPermissionStatus, formatPrincipal, formatTarget } from "./GovernanceEvidence.js";

export interface PermissionCenterPanelProps {
  readonly pending: readonly PermissionLedgerRequestRecord[];
  readonly recent: readonly PermissionLedgerRequestRecord[];
  readonly repairStatus?: DefinitionRepairStatus;
  readonly initialQuery?: PermissionLedgerRequestQuery;
  readonly onQueryChange?: (query: PermissionLedgerRequestQuery) => void;
  readonly onRespond?: (response: WirePermissionResponse) => void;
}

export function PermissionCenterPanel({
  pending,
  recent,
  repairStatus,
  initialQuery = {},
  onQueryChange,
  onRespond,
}: PermissionCenterPanelProps) {
  const [status, setStatus] = React.useState<"all" | PermissionLedgerRequestStatus>(
    typeof initialQuery.status === "string" ? initialQuery.status : "all",
  );
  const [capability, setCapability] = React.useState(
    typeof initialQuery.capability === "string" ? initialQuery.capability : "all",
  );
  const [principalKind, setPrincipalKind] = React.useState(
    typeof initialQuery.requested_principal_kind === "string" ? initialQuery.requested_principal_kind : "all",
  );
  const [tool, setTool] = React.useState(
    typeof initialQuery.tool === "string" ? initialQuery.tool : "all",
  );
  const [text, setText] = React.useState(initialQuery.text ?? "");
  const baseRecords = React.useMemo(() => [...pending, ...recent], [pending, recent]);
  const capabilities = React.useMemo(() => uniqueStrings(baseRecords.map((record) => record.capability)), [baseRecords]);
  const principalKinds = React.useMemo(() => uniqueStrings(baseRecords.map((record) => record.requested_principal?.kind)), [baseRecords]);
  const tools = React.useMemo(() => uniqueStrings(baseRecords.map((record) => record.tool)), [baseRecords]);
  const query = React.useMemo<PermissionLedgerRequestQuery>(() => ({
    ...initialQuery,
    status: status === "all" ? undefined : status,
    capability: capability === "all" ? undefined : capability,
    requested_principal_kind: principalKind === "all" ? undefined : principalKind,
    tool: tool === "all" ? undefined : tool,
    text: text.trim() || undefined,
  }), [capability, initialQuery, principalKind, status, text, tool]);
  const records = React.useMemo(() => filterPermissionLedgerRequests(baseRecords, query), [baseRecords, query]);
  const center = React.useMemo(
    () => derivePermissionCenterState(baseRecords, {
      query,
      dirtyDefinitionState: repairStatus?.status === "dirty",
    }),
    [baseRecords, query, repairStatus?.status],
  );
  React.useEffect(() => { onQueryChange?.(query); }, [onQueryChange, query]);

  return (
    <section aria-label="Permission Center" style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>Permission Center</div>
          <h2 style={titleStyle}>Human control for AI-created changes</h2>
        </div>
      </div>
      <div style={summaryStyle}>
        <SummaryItem label="pending" value={center.summary.pending} />
        <SummaryItem label="completed" value={center.summary.completed} />
        <SummaryItem label="denied" value={center.summary.denied} />
        <SummaryItem label="failed" value={center.summary.failed} />
      </div>
      {repairStatus?.status === "dirty" && (
        <div style={dirtyStyle}>
          <strong>Definition repair required</strong>
          <span>{repairStatus.guard?.error?.code ?? "dirty_definition_state"}</span>
        </div>
      )}
      <div style={filterBarStyle}>
        <label style={filterLabelStyle}>
          <span>Status filter</span>
          <select
            aria-label="Status filter"
            value={status}
            onChange={(event) => setStatus(event.currentTarget.value as "all" | PermissionLedgerRequestStatus)}
            style={controlStyle}
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="denied">Denied</option>
            <option value="failed">Failed</option>
            <option value="expired">Expired</option>
          </select>
        </label>
        <label style={filterLabelStyle}>
          <span>Capability filter</span>
          <select
            aria-label="Capability filter"
            value={capability}
            onChange={(event) => setCapability(event.currentTarget.value)}
            style={controlStyle}
          >
            <option value="all">All capabilities</option>
            {capabilities.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label style={filterLabelStyle}>
          <span>Principal filter</span>
          <select
            aria-label="Principal filter"
            value={principalKind}
            onChange={(event) => setPrincipalKind(event.currentTarget.value)}
            style={controlStyle}
          >
            <option value="all">All principals</option>
            {principalKinds.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label style={filterLabelStyle}>
          <span>Tool filter</span>
          <select
            aria-label="Tool filter"
            value={tool}
            onChange={(event) => setTool(event.currentTarget.value)}
            style={controlStyle}
          >
            <option value="all">All tools</option>
            {tools.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label style={filterLabelStyle}>
          <span>Search permission records</span>
          <input
            aria-label="Search permission records"
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
            style={controlStyle}
          />
        </label>
      </div>
      <div style={listStyle}>
        {records.length === 0 ? (
          <div style={emptyStyle}>No permission records match this view.</div>
        ) : records.map((record) => (
          <PermissionRecordRow key={record.prompt_id} record={record} onRespond={onRespond} />
        ))}
      </div>
    </section>
  );
}
```

Add the small row, summary, and style helpers in the same file. Keep styles local and use existing `GovernanceEvidence` formatters:

```tsx
function PermissionRecordRow({
  record,
  onRespond,
}: {
  readonly record: PermissionLedgerRequestRecord;
  readonly onRespond?: (response: WirePermissionResponse) => void;
}) {
  const actionable = record.status === "pending" && record.live && onRespond;
  return (
    <article style={rowStyle}>
      <div style={rowTopStyle}>
        <strong>{record.capability ?? "capability:unknown"}</strong>
        <span>{formatPermissionStatus(record)}</span>
      </div>
      <div style={targetStyle}>{formatTarget(record.target, record.target_fingerprint)}</div>
      <dl style={proofGridStyle}>
        <Pair label="Proposed by" value={formatPrincipal(record.requested_principal)} />
        <Pair label="Approved by" value={record.approved_by ? `${record.approved_by.kind}:${record.approved_by.id}` : "not approved"} />
        <Pair label="Executed by" value={formatPrincipal(record.execution_principal)} />
        <Pair label="Authorization" value={record.authorization_reason_code ?? "not executed"} />
        <Pair label="Token" value={record.approval_token_hash ? `token hash ${record.approval_token_hash}` : "no token issued"} />
      </dl>
      {record.message && <div style={messageStyle}>{record.message}</div>}
      {actionable && (
        <div style={actionStyle}>
          <button type="button" onClick={() => onRespond({ id: record.prompt_id, decision: "allow" })}>Allow</button>
          <button type="button" onClick={() => onRespond({ id: record.prompt_id, decision: "deny" })}>Deny</button>
        </div>
      )}
    </article>
  );
}
```

Add this utility in the same file:

```ts
function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string"))].sort();
}
```

Use simple 8px-radius panels and dense spacing; do not create a landing-page treatment.

- [ ] **Step 4: Export the component**

Modify `packages/viewer-react/src/index.ts`:

```ts
export { PermissionCenterPanel } from "./PermissionCenter.js";
export type { PermissionCenterPanelProps } from "./PermissionCenter.js";
```

- [ ] **Step 5: Run component tests and verify GREEN**

Run:

```bash
bun test packages/viewer-react/test/PermissionCenter.test.tsx packages/viewer-react/test/GovernanceEvidence.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer-react/src/PermissionCenter.tsx packages/viewer-react/src/index.ts packages/viewer-react/test/PermissionCenter.test.tsx
git commit -m "feat: add permission center panel"
```

## Task 4: Integrate Permission Center Into The Capability Lifecycle Demo

**Files:**
- Modify: `examples/p5-viewer-approval-e2e/src/main.tsx`
- Modify: `examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts`

- [ ] **Step 1: Write failing demo state assertions**

Update the governance evidence test in `examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts`:

```ts
const pending = await waitForPermissionLedgerState(messages, (state) =>
  state.permission_center?.summary?.pending === 1 &&
  state.permission_center.records.some((record) =>
    record.prompt_id === "pneuma:capability-lifecycle:add-operation" && record.live === true
  ),
);
expect(pending.permission_center).toMatchObject({
  summary: { pending: 1 },
  records: [{ prompt_id: "pneuma:capability-lifecycle:add-operation" }],
});
```

After the completed state assertion, add:

```ts
expect(completed.permission_center).toMatchObject({
  summary: { completed: 1 },
});
expect(completed.permission_center.records.some((record) =>
  record.prompt_id === "pneuma:capability-lifecycle:add-operation" &&
  record.status === "completed" &&
  record.approval_token_single_use === true &&
  record.execution_principal?.kind === "framework_system"
)).toBe(true);
```

Widen the helper state type:

```ts
predicate: (state: {
  pending: Array<Record<string, unknown>>;
  recent: Array<Record<string, unknown>>;
  permission_center?: {
    summary?: Record<string, unknown>;
    records: Array<Record<string, unknown>>;
  };
}) => boolean,
```

- [ ] **Step 2: Run demo test and verify RED**

Run:

```bash
bun test examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts -t "governance evidence"
```

Expected: FAIL before Task 2 is implemented; after Task 2, this may already pass at wire level but the UI still uses the old panel.

- [ ] **Step 3: Replace the demo right-rail evidence widget**

Modify `examples/p5-viewer-approval-e2e/src/main.tsx` import:

```ts
import {
  PermissionCenterPanel,
  PneumaViewRenderer,
  PermissionPrompt,
  PneumaViewer,
  normalizeViewPresentationForRender,
  useAction,
  usePermissionResponder,
  usePneumaState,
  type ViewRendererView,
} from "@pneuma-framework/viewer-react";
```

Replace the `GovernanceEvidencePanel` block:

```tsx
{showGovernanceEvidence && (
  <PermissionCenterPanel
    pending={permissionLedger.pending}
    recent={permissionLedger.recent}
  />
)}
```

Keep `StudioApprovalCard` as the approval execution UI for now. Permission Center v0 is the product-shaped evidence surface; it does not need to own approval response in the demo.

- [ ] **Step 4: Run demo tests and verify GREEN**

Run:

```bash
bun test examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add examples/p5-viewer-approval-e2e/src/main.tsx examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts
git commit -m "feat: show permission center in lifecycle demo"
```

## Task 5: Final Verification And Documentation Touch

**Files:**
- Modify if needed: `docs/architecture/milestone-2-snapshot.md`
- Modify if needed: `docs/architecture/OPEN-QUESTIONS.md`

- [ ] **Step 1: Run focused verification**

Run:

```bash
bun test packages/core/test/permission-ledger.test.ts packages/core/test/wire-protocol/permission-ledger-seed.test.ts packages/core/test/wire-protocol/seed-on-open.test.ts packages/viewer-react/test/PermissionCenter.test.tsx packages/viewer-react/test/GovernanceEvidence.test.tsx examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full verification**

Run:

```bash
bun test
bun run typecheck
git diff --check
```

Expected: PASS.

- [ ] **Step 3: Update M2 snapshot if implementation changed the claim**

If Tasks 1-4 shipped as designed, update `docs/architecture/milestone-2-snapshot.md` with one sentence under "What Is Proven So Far":

```md
| Permission Center v0 | Ledger query, summary counts, and viewer panel make pending/recent AI-created software changes inspectable as a product-shaped governance surface. |
```

Do not expand the milestone doc into another process report.

- [ ] **Step 4: Commit documentation touch if any**

```bash
git add docs/architecture/milestone-2-snapshot.md docs/architecture/OPEN-QUESTIONS.md
git commit -m "docs: record permission center milestone"
```

Skip this commit if no docs changed.
