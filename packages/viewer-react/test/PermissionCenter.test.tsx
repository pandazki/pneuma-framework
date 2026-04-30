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

import { test, expect, afterEach } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import * as React from "react";
import { PermissionCenterPanel } from "../src/index.js";

afterEach(() => {
  cleanup();
});

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
  const { getAllByText, getByText, queryByText } = render(React.createElement(PermissionCenterPanel, { pending: [pending], recent: [completed] }));

  expect(getByText("Permission Center")).toBeTruthy();
  expect(getByText("1 pending")).toBeTruthy();
  expect(getByText("1 completed")).toBeTruthy();
  expect(getByText("definition.apply:add_operation:export_saved_urls")).toBeTruthy();
  expect(getAllByText("build_agent:opencode").length).toBeGreaterThan(0);
  expect(getByText("builder:default")).toBeTruthy();
  expect(queryByText("builder:builder:default")).toBeNull();
  expect(getByText("framework_system:framework")).toBeTruthy();
  expect(getByText("token hash token-hash-123")).toBeTruthy();
});

test("PermissionCenterPanel filters visible records by status, capability, principal kind, tool, and text", () => {
  const { getByLabelText, getByText, queryByText } = render(
    React.createElement(PermissionCenterPanel, { pending: [pending], recent: [completed] }),
  );

  const search = getByLabelText("Search permission records") as HTMLInputElement;
  fireEvent.input(search, { target: { value: "reviewers" } });
  expect(getByText("reviewers-can-read-review-queue")).toBeTruthy();
  expect(queryByText("definition.apply:add_operation:export_saved_urls")).toBeNull();

  fireEvent.input(search, { target: { value: "" } });
  const statusFilter = getByLabelText("Status filter") as HTMLSelectElement;
  fireEvent.input(statusFilter, { target: { value: "completed" } });
  expect(queryByText("reviewers-can-read-review-queue")).toBeNull();
  expect(getByText("definition.apply:add_operation:export_saved_urls")).toBeTruthy();

  fireEvent.input(statusFilter, { target: { value: "all" } });
  const capabilityFilter = getByLabelText("Capability filter") as HTMLSelectElement;
  fireEvent.input(capabilityFilter, { target: { value: "policy:mutate" } });
  expect(getByText("reviewers-can-read-review-queue")).toBeTruthy();
  expect(queryByText("definition.apply:add_operation:export_saved_urls")).toBeNull();

  fireEvent.input(capabilityFilter, { target: { value: "all" } });
  const principalFilter = getByLabelText("Principal filter") as HTMLSelectElement;
  fireEvent.input(principalFilter, { target: { value: "build_agent" } });
  expect(getByText("reviewers-can-read-review-queue")).toBeTruthy();
  expect(getByText("definition.apply:add_operation:export_saved_urls")).toBeTruthy();

  const toolFilter = getByLabelText("Tool filter") as HTMLSelectElement;
  fireEvent.input(toolFilter, { target: { value: "definition.apply" } });
  expect(getByText("reviewers-can-read-review-queue")).toBeTruthy();
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
