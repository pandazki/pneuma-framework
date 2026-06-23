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
import { render, cleanup } from "@testing-library/react";
import * as React from "react";
import { GovernanceEvidencePanel } from "../src/index.js";

// Unmount/remove rendered trees between tests. Without this, multiple renders
// accumulate in document.body and ambiguous text (e.g. "Completed") matches more
// than one element — passes locally (bun auto-cleans) but fails under CI's happy-dom.
afterEach(cleanup);

test("GovernanceEvidencePanel renders authority split and token evidence", () => {
  const records = [{
    prompt_id: "prompt-1",
    status: "completed",
    live: false,
    requested_at_ms: 100,
    responded_at_ms: 110,
    completed_at_ms: 120,
    tool: "definition.apply",
    capability: "policy:mutate",
    target: {
      kind: "policy_rule",
      id: "reviewers-can-read-review-queue",
      fingerprint: "policy_rule:reviewers-can-read-review-queue",
    },
    target_fingerprint: "policy_rule:reviewers-can-read-review-queue",
    requested_principal: {
      kind: "build_agent",
      id: "opencode",
      acting_for: { kind: "builder", id: "builder:default" },
    },
    decided_by: { kind: "builder", id: "builder:default" },
    decision: "allow",
    approved_by: { kind: "builder", id: "builder:default" },
    approval_token_hash: "abc123",
    approved_capability: "policy:mutate",
    approval_token_expires_at_ms: 700,
    approval_token_single_use: true,
    execution_principal: { kind: "framework_system", id: "framework" },
    authorization_reason_code: "allowed",
    detail: {},
  }] as const;

  const { getByText, queryByText } = render(React.createElement(GovernanceEvidencePanel, { pending: [], recent: records }));

  expect(getByText("build_agent:opencode")).toBeTruthy();
  expect(getByText("builder:default")).toBeTruthy();
  expect(queryByText("builder:builder:default")).toBeNull();
  expect(getByText("framework_system:framework")).toBeTruthy();
  expect(getByText("policy:mutate")).toBeTruthy();
  expect(getByText("token hash abc123")).toBeTruthy();
});

test("GovernanceEvidencePanel distinguishes live, stale, denied, failed, expired, and completed", () => {
  const records = [
    { prompt_id: "live", status: "pending", live: true, requested_at_ms: 1, tool: "definition.apply", detail: {} },
    { prompt_id: "stale", status: "pending", live: false, requested_at_ms: 2, tool: "definition.apply", detail: {} },
    { prompt_id: "denied", status: "denied", live: false, requested_at_ms: 3, tool: "definition.apply", detail: {} },
    { prompt_id: "failed", status: "failed", live: false, requested_at_ms: 4, tool: "definition.apply", detail: {} },
    { prompt_id: "expired", status: "expired", live: false, requested_at_ms: 5, tool: "definition.apply", detail: {} },
    { prompt_id: "completed", status: "completed", live: false, requested_at_ms: 6, tool: "definition.apply", detail: {} },
  ] as const;

  const { getByText } = render(
    React.createElement(GovernanceEvidencePanel, { pending: records.slice(0, 2), recent: records.slice(2) }),
  );

  expect(getByText("Pending, actionable")).toBeTruthy();
  expect(getByText("Pending, stale")).toBeTruthy();
  expect(getByText("Denied")).toBeTruthy();
  expect(getByText("Failed")).toBeTruthy();
  expect(getByText("Expired")).toBeTruthy();
  expect(getByText("Completed")).toBeTruthy();
});
