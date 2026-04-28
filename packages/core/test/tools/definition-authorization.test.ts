import { test, expect } from "bun:test";
import {
  defaultToolPrincipal,
  definitionApplyTarget,
  frameworkSystemPrincipal,
} from "../../src/tools/authorization-context.js";
import { InMemoryApprovalTokenStore } from "../../src/tools/approval-token-store.js";

test("definition.apply validate mode is allowed as build_agent proposal", () => {
  const principal = defaultToolPrincipal();

  expect(principal).toMatchObject({
    kind: "build_agent",
    id: "opencode",
    acting_for: { kind: "builder", id: "builder:default" },
  });
});

test("in-memory approval token store consumes a token once", () => {
  const store = new InMemoryApprovalTokenStore();
  const target = definitionApplyTarget({
    kind: "add_table_column",
    table_id: "bookmarks",
    column_name: "tags",
    cell_type: { kind: "string" },
  });
  const token = store.mint({
    app_id: "ai-bookmarks",
    workspace_id: "workspace-1",
    capability: "definition:apply",
    target,
    approved_by: { kind: "builder", id: "builder:default" },
    now_ms: 10,
  });

  expect(token.approved_by).toEqual({ kind: "builder", id: "builder:default" });
  expect(store.consume(token.id)).toEqual(token);
  expect(store.consume(token.id)).toBeUndefined();
});

test("target fingerprint changes when definition change changes", () => {
  const first = definitionApplyTarget({
    kind: "add_table_column",
    table_id: "bookmarks",
    column_name: "tags",
    cell_type: { kind: "string" },
  });
  const second = definitionApplyTarget({
    kind: "add_table_column",
    table_id: "bookmarks",
    column_name: "priority",
    cell_type: { kind: "string" },
  });

  expect(first.kind).toBe("app_definition");
  expect(first.fingerprint).toContain("definition.apply:");
  expect(first.fingerprint).not.toBe(second.fingerprint);
});

test("framework system principal is explicit", () => {
  expect(frameworkSystemPrincipal()).toEqual({ kind: "framework_system", id: "framework" });
});
