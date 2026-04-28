import { test, expect } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FilePermissionLedgerStore,
  InMemoryPermissionLedgerStore,
  approvalTokenLedgerHash,
  permissionLedgerFilePath,
  type PermissionLedgerEvent,
} from "../src/permission-ledger.js";

const app_id = "app:test";
const workspace_id = "workspace:test";

function requested(prompt_id = "prompt-1"): PermissionLedgerEvent {
  return {
    schema_version: 1,
    event_id: `evt-${prompt_id}`,
    event_type: "permission_requested",
    at_ms: 100,
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

test("approval token hash does not expose the raw token id", () => {
  const hash = approvalTokenLedgerHash({ token_id: "approval-secret", app_id, workspace_id });
  expect(hash).not.toContain("approval-secret");
  expect(hash).toHaveLength(64);
});

test("in-memory ledger mirrors file ledger derivation", () => {
  const store = new InMemoryPermissionLedgerStore();
  store.append(requested());
  expect(store.getRequest("prompt-1")).toMatchObject({ prompt_id: "prompt-1", status: "pending" });
  expect(store.getRequest("missing")).toBeUndefined();
  expect(readFileSync).toBeDefined();
});
