import { test, expect } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FilePermissionLedgerStore,
  InMemoryPermissionLedgerStore,
  approvalTokenLedgerHash,
  derivePermissionCenterState,
  permissionLedgerFilePath,
  type PermissionLedgerEvent,
} from "../src/permission-ledger.js";

const app_id = "app:test";
const workspace_id = "workspace:test";

function requested(prompt_id = "prompt-1", at_ms = 100): PermissionLedgerEvent {
  return {
    schema_version: 1,
    event_id: `evt-${prompt_id}`,
    event_type: "permission_requested",
    at_ms,
    prompt_id,
    app_id,
    workspace_id,
    tool: "definition.apply",
    capability: "definition:apply",
    target: { kind: "definition", id: "definition.apply:add_table:tasks", fingerprint: "target-1" },
    target_fingerprint: "target-1",
    requested_principal: {
      kind: "build_agent",
      id: "opencode",
      acting_for: { kind: "builder", id: "builder:default" },
    },
    detail: { change_id: "def-1" },
  };
}

function requestWith(input: {
  readonly prompt_id: string;
  readonly at_ms: number;
  readonly tool?: PermissionLedgerEvent["tool"];
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

test("file ledger appends events and derives a completed request", () => {
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-permission-ledger-"));
  const store = new FilePermissionLedgerStore(workspace);
  store.append(requested());
  store.append({
    schema_version: 1,
    event_id: "evt-response",
    event_type: "permission_responded",
    at_ms: 110,
    prompt_id: "prompt-1",
    app_id,
    workspace_id,
    tool: "definition.apply",
    decision: "allow",
    decided_by: { kind: "builder", id: "builder:default" },
  });
  store.append({
    schema_version: 1,
    event_id: "evt-token",
    event_type: "approval_token_issued",
    at_ms: 111,
    prompt_id: "prompt-1",
    app_id,
    workspace_id,
    tool: "definition.apply",
    capability: "definition:apply",
    approval_token_hash: approvalTokenLedgerHash({ token_id: "approval-secret", app_id, workspace_id }),
    approved_capability: "definition:apply",
    approved_by: { kind: "builder", id: "builder:default" },
    issued_at_ms: 111,
    expires_at_ms: 411,
    single_use: true,
  });
  store.append({
    schema_version: 1,
    event_id: "evt-authorized",
    event_type: "permission_execution_authorized",
    at_ms: 112,
    prompt_id: "prompt-1",
    app_id,
    workspace_id,
    tool: "definition.apply",
    capability: "definition:apply",
    authorization_reason_code: "allowed",
  });
  store.append({
    schema_version: 1,
    event_id: "evt-completed",
    event_type: "permission_execution_completed",
    at_ms: 120,
    prompt_id: "prompt-1",
    app_id,
    workspace_id,
    tool: "definition.apply",
  });

  expect(existsSync(permissionLedgerFilePath(workspace))).toBe(true);
  const records = store.listRequests();
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    prompt_id: "prompt-1",
    status: "completed",
    live: false,
    decision: "allow",
    authorization_reason_code: "allowed",
  });
});

test("file ledger derives pending requests and can mark live prompt ids", () => {
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-permission-ledger-pending-"));
  const store = new FilePermissionLedgerStore(workspace);
  store.append(requested("prompt-live"));

  expect(store.listRequests()[0]).toMatchObject({ status: "pending", live: false });
  expect(store.listRequests({ livePromptIds: new Set(["prompt-live"]) })[0]).toMatchObject({
    status: "pending",
    live: true,
  });
});

test("file ledger skips corrupt jsonl lines", () => {
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-permission-ledger-corrupt-"));
  mkdirSync(join(workspace, ".pneuma"), { recursive: true });
  writeFileSync(permissionLedgerFilePath(workspace), "{broken json}\n" + JSON.stringify(requested()) + "\n", "utf8");
  const store = new FilePermissionLedgerStore(workspace);
  expect(store.list()).toHaveLength(1);
  expect(store.listRequests()[0]?.prompt_id).toBe("prompt-1");
});

test("file ledger skips structurally invalid jsonl events", () => {
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-permission-ledger-invalid-"));
  mkdirSync(join(workspace, ".pneuma"), { recursive: true });
  const invalidRequest = { ...requested("prompt-invalid"), detail: undefined };
  const invalidResponse = {
    schema_version: 1,
    event_id: "evt-invalid-response",
    event_type: "permission_responded",
    at_ms: 110,
    prompt_id: "prompt-invalid-response",
    app_id,
    workspace_id,
    tool: "definition.apply",
    decided_by: { kind: "builder", id: "builder:default" },
  };
  writeFileSync(
    permissionLedgerFilePath(workspace),
    [
      JSON.stringify(invalidRequest),
      JSON.stringify(invalidResponse),
      JSON.stringify(requested("prompt-valid")),
      "",
    ].join("\n"),
    "utf8",
  );
  const store = new FilePermissionLedgerStore(workspace);

  expect(store.list().map((event) => event.prompt_id)).toEqual(["prompt-valid"]);
  expect(store.listRequests().map((record) => record.prompt_id)).toEqual(["prompt-valid"]);
});

test("request limit preserves newest-first records", () => {
  const store = new InMemoryPermissionLedgerStore();
  store.append(requested("prompt-old", 100));
  store.append(requested("prompt-new", 200));

  expect(store.listRequests().map((record) => record.prompt_id)).toEqual(["prompt-new", "prompt-old"]);
  expect(store.listRequests({ limit: 1 }).map((record) => record.prompt_id)).toEqual(["prompt-new"]);
});

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
  expect(store.listRequests({ tool: "definition.apply", text: "review" }).map((record) => record.prompt_id)).toEqual(["prompt-view", "prompt-policy"]);
  expect(store.listRequests({ text: "dirty_definition_state" }).map((record) => record.prompt_id)).toEqual(["prompt-failed"]);
  expect(store.listRequests({ limit: 2 }).map((record) => record.prompt_id)).toEqual(["prompt-view", "prompt-policy"]);
});

test("zero limits return empty lists consistently", () => {
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-permission-ledger-limit-zero-"));
  const fileStore = new FilePermissionLedgerStore(workspace);
  const memoryStore = new InMemoryPermissionLedgerStore();
  for (const event of [requested("prompt-1", 100), requested("prompt-2", 200)]) {
    fileStore.append(event);
    memoryStore.append(event);
  }

  expect(fileStore.list({ limit: 0 })).toEqual([]);
  expect(fileStore.listRequests({ limit: 0 })).toEqual([]);
  expect(memoryStore.list({ limit: 0 })).toEqual([]);
  expect(memoryStore.listRequests({ limit: 0 })).toEqual([]);
});

test("terminal request statuses dominate later non-terminal events", () => {
  const completedStore = new InMemoryPermissionLedgerStore();
  completedStore.append(requested("prompt-completed", 100));
  completedStore.append({
    schema_version: 1,
    event_id: "evt-completed",
    event_type: "permission_execution_completed",
    at_ms: 110,
    prompt_id: "prompt-completed",
    app_id,
    workspace_id,
    tool: "definition.apply",
  });
  completedStore.append({
    schema_version: 1,
    event_id: "evt-late-response",
    event_type: "permission_responded",
    at_ms: 120,
    prompt_id: "prompt-completed",
    app_id,
    workspace_id,
    tool: "definition.apply",
    decision: "allow",
    decided_by: { kind: "builder", id: "builder:default" },
  });

  const failedStore = new InMemoryPermissionLedgerStore();
  failedStore.append(requested("prompt-failed", 100));
  failedStore.append({
    schema_version: 1,
    event_id: "evt-failed",
    event_type: "permission_execution_failed",
    at_ms: 110,
    prompt_id: "prompt-failed",
    app_id,
    workspace_id,
    tool: "definition.apply",
    message: "Execution failed",
  });
  failedStore.append({
    schema_version: 1,
    event_id: "evt-late-authorized",
    event_type: "permission_execution_authorized",
    at_ms: 120,
    prompt_id: "prompt-failed",
    app_id,
    workspace_id,
    tool: "definition.apply",
    authorization_reason_code: "allowed",
  });

  const expiredStore = new InMemoryPermissionLedgerStore();
  expiredStore.append(requested("prompt-expired", 100));
  expiredStore.append({
    schema_version: 1,
    event_id: "evt-expired",
    event_type: "permission_expired",
    at_ms: 110,
    prompt_id: "prompt-expired",
    app_id,
    workspace_id,
    tool: "definition.apply",
  });
  expiredStore.append({
    schema_version: 1,
    event_id: "evt-late-denied",
    event_type: "permission_execution_denied",
    at_ms: 120,
    prompt_id: "prompt-expired",
    app_id,
    workspace_id,
    tool: "definition.apply",
    authorization_reason_code: "approval_expired",
    message: "Approval expired",
  });

  expect(completedStore.getRequest("prompt-completed")).toMatchObject({ status: "completed" });
  expect(failedStore.getRequest("prompt-failed")).toMatchObject({ status: "failed" });
  expect(expiredStore.getRequest("prompt-expired")).toMatchObject({ status: "expired" });
});

test("approval token hash does not expose the raw token id", () => {
  const hash = approvalTokenLedgerHash({ token_id: "approval-secret", app_id, workspace_id });
  expect(hash).not.toContain("approval-secret");
  expect(hash).toHaveLength(64);
});

test("request record exposes full governance evidence without raw token ids", () => {
  const store = new InMemoryPermissionLedgerStore();
  const tokenHash = approvalTokenLedgerHash({ token_id: "approval-secret", app_id, workspace_id });
  store.append(requested("prompt-evidence", 100));
  store.append({
    schema_version: 1,
    event_id: "evt-evidence-response",
    event_type: "permission_responded",
    at_ms: 110,
    prompt_id: "prompt-evidence",
    app_id,
    workspace_id,
    tool: "definition.apply",
    decision: "allow",
    decided_by: { kind: "builder", id: "builder:default" },
  });
  store.append({
    schema_version: 1,
    event_id: "evt-evidence-token",
    event_type: "approval_token_issued",
    at_ms: 111,
    prompt_id: "prompt-evidence",
    app_id,
    workspace_id,
    tool: "definition.apply",
    capability: "definition:apply",
    target: { kind: "definition", id: "definition.apply:add_table:tasks", fingerprint: "target-1" },
    target_fingerprint: "target-1",
    approval_token_hash: tokenHash,
    approved_capability: "definition:apply",
    approved_by: { kind: "builder", id: "builder:default" },
    issued_at_ms: 111,
    expires_at_ms: 411,
    single_use: true,
  });
  store.append({
    schema_version: 1,
    event_id: "evt-evidence-authorized",
    event_type: "permission_execution_authorized",
    at_ms: 112,
    prompt_id: "prompt-evidence",
    app_id,
    workspace_id,
    tool: "definition.apply",
    capability: "definition:apply",
    authorization_reason_code: "allowed",
    execution_principal: { kind: "framework_system", id: "framework" },
  });
  store.append({
    schema_version: 1,
    event_id: "evt-evidence-completed",
    event_type: "permission_execution_completed",
    at_ms: 120,
    prompt_id: "prompt-evidence",
    app_id,
    workspace_id,
    tool: "definition.apply",
  });

  const record = store.getRequest("prompt-evidence")!;
  expect(record).toMatchObject({
    status: "completed",
    approval_token_hash: tokenHash,
    approved_capability: "definition:apply",
    approved_by: { kind: "builder", id: "builder:default" },
    approval_token_expires_at_ms: 411,
    approval_token_single_use: true,
    execution_principal: { kind: "framework_system", id: "framework" },
    authorization_reason_code: "allowed",
  });
  expect(JSON.stringify(record)).not.toContain("approval-secret");
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

test("in-memory ledger mirrors file ledger derivation", () => {
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-permission-ledger-mirror-"));
  const fileStore = new FilePermissionLedgerStore(workspace);
  const memoryStore = new InMemoryPermissionLedgerStore();
  const events: PermissionLedgerEvent[] = [
    requested("prompt-1", 100),
    {
      schema_version: 1,
      event_id: "evt-response",
      event_type: "permission_responded",
      at_ms: 110,
      prompt_id: "prompt-1",
      app_id,
      workspace_id,
      tool: "definition.apply",
      decision: "allow",
      decided_by: { kind: "builder", id: "builder:default" },
    },
    requested("prompt-2", 120),
  ];
  for (const event of events) {
    fileStore.append(event);
    memoryStore.append(event);
  }

  expect(memoryStore.listRequests()).toEqual(fileStore.listRequests());
  expect(memoryStore.listRequests({ limit: 1 })).toEqual(fileStore.listRequests({ limit: 1 }));
  expect(memoryStore.getRequest("prompt-1")).toEqual(fileStore.getRequest("prompt-1"));
  expect(memoryStore.getRequest("missing")).toEqual(fileStore.getRequest("missing"));
});
