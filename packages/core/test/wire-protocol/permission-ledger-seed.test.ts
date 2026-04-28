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
    decision: "deny",
    decided_by: { kind: "builder", id: "builder:default" },
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
        recent: [{ prompt_id: "prompt-old", status: "denied" }],
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
