import { test, expect } from "bun:test";
import {
  InMemoryPermissionLedgerStore,
  type PermissionLedgerStore,
} from "../../src/permission-ledger.js";
import { seedPermissionLedgerState } from "../../src/wire-protocol/permission-ledger-state.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("seedPermissionLedgerState emits pending/recent ledger state and live prompts", () => {
  const ledger = new InMemoryPermissionLedgerStore();
  ledger.append({
    schema_version: 1,
    event_id: "evt-request",
    event_type: "permission_requested",
    at_ms: 100,
    prompt_id: "prompt-live",
    app_id: "app:test",
    workspace_id: "workspace:test",
    tool: "definition.apply",
    detail: { change_id: "def-1" },
  });
  ledger.append({
    schema_version: 1,
    event_id: "evt-old-request",
    event_type: "permission_requested",
    at_ms: 50,
    prompt_id: "prompt-old",
    app_id: "app:test",
    workspace_id: "workspace:test",
    tool: "definition.apply",
    detail: { change_id: "def-old" },
  });
  ledger.append({
    schema_version: 1,
    event_id: "evt-old-response",
    event_type: "permission_responded",
    at_ms: 60,
    prompt_id: "prompt-old",
    app_id: "app:test",
    workspace_id: "workspace:test",
    tool: "definition.apply",
    decision: "allow",
    decided_by: { kind: "builder", id: "builder:default" },
  });
  ledger.append({
    schema_version: 1,
    event_id: "evt-old-token",
    event_type: "approval_token_issued",
    at_ms: 61,
    prompt_id: "prompt-old",
    app_id: "app:test",
    workspace_id: "workspace:test",
    tool: "definition.apply",
    capability: "definition:apply",
    approval_token_hash: "token-hash",
    approved_capability: "definition:apply",
    approved_by: { kind: "builder", id: "builder:default" },
    issued_at_ms: 61,
    expires_at_ms: 361,
    single_use: true,
  });
  ledger.append({
    schema_version: 1,
    event_id: "evt-old-authorized",
    event_type: "permission_execution_authorized",
    at_ms: 62,
    prompt_id: "prompt-old",
    app_id: "app:test",
    workspace_id: "workspace:test",
    tool: "definition.apply",
    authorization_reason_code: "allowed",
    execution_principal: { kind: "framework_system", id: "framework" },
  });
  ledger.append({
    schema_version: 1,
    event_id: "evt-old-completed",
    event_type: "permission_execution_completed",
    at_ms: 70,
    prompt_id: "prompt-old",
    app_id: "app:test",
    workspace_id: "workspace:test",
    tool: "definition.apply",
  });

  const envelopes = seedPermissionLedgerState({
    ledger,
    livePromptIds: new Set(["prompt-live"]),
    livePromptEnvelopes: [{
      dir: "a2v",
      kind: "permission-prompt",
      prompt: { id: "prompt-live", tool: "definition.apply", detail: { change_id: "def-1" } },
    }],
  });

  expect(envelopes[0]).toMatchObject({
    kind: "framework-event",
    event: {
      type: "permission-ledger-state",
      state: {
        pending: [{ prompt_id: "prompt-live", live: true }],
        recent: [{
          prompt_id: "prompt-old",
          status: "completed",
          approval_token_hash: "token-hash",
          approval_token_single_use: true,
          execution_principal: { kind: "framework_system", id: "framework" },
        }],
      },
    },
  });
  expect(envelopes[1]).toMatchObject({ kind: "permission-prompt", prompt: { id: "prompt-live" } });
});

test("seedPermissionLedgerState returns no envelopes without a ledger", () => {
  expect(seedPermissionLedgerState({
    livePromptIds: new Set(),
    livePromptEnvelopes: [],
  })).toEqual([]);
});

test("seedPermissionLedgerState keeps stale pending records but does not replay stale prompt envelopes", () => {
  const ledger = new InMemoryPermissionLedgerStore();
  ledger.append({
    schema_version: 1,
    event_id: "evt-stale-request",
    event_type: "permission_requested",
    at_ms: 100,
    prompt_id: "prompt-stale",
    app_id: "app:test",
    workspace_id: "workspace:test",
    tool: "definition.apply",
    detail: { change_id: "def-stale" },
  });

  const envelopes = seedPermissionLedgerState({
    ledger,
    livePromptIds: new Set(),
    livePromptEnvelopes: [{
      dir: "a2v",
      kind: "permission-prompt",
      prompt: { id: "prompt-stale", tool: "definition.apply", detail: { change_id: "def-stale" } },
    }],
  });

  expect(envelopes).toHaveLength(1);
  expect(envelopes[0]).toMatchObject({
    kind: "framework-event",
    event: {
      type: "permission-ledger-state",
      state: {
        pending: [{ prompt_id: "prompt-stale", live: false }],
        recent: [],
      },
    },
  });
});

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

test("seedPermissionLedgerState drains rejected async ledger reads before throwing", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  process.on("unhandledRejection", onUnhandled);
  const ledger: PermissionLedgerStore = {
    append: () => undefined,
    list: () => [],
    listRequests: async () => {
      throw new Error("boom");
    },
    getRequest: () => undefined,
  };

  try {
    expect(() => seedPermissionLedgerState({
      ledger,
      livePromptIds: new Set(),
      livePromptEnvelopes: [],
    })).toThrow("seedPermissionLedgerState requires a synchronous PermissionLedgerStore");
    await delay(0);
    expect(unhandled).toEqual([]);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});
