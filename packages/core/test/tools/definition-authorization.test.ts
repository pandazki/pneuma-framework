import { test, expect } from "bun:test";
import { AuthorizationKernel } from "@pneuma-framework/core-domain";
import type {
  DefinitionApplyChange,
  DefinitionApplyOptions,
  DefinitionApplyResult,
  DefinitionRollbackExecuteOptions,
  DefinitionRollbackExecuteResult,
  DefinitionRollbackPrepareInput,
  DefinitionRollbackPrepareOptions,
  DefinitionRollbackPrepareResult,
  LifecycleOrchestrator,
} from "../../src/lifecycle.js";
import { createToolRegistry } from "../../src/tools/registry.js";
import { registerActionTools } from "../../src/tools/action.js";
import {
  builderPrincipal,
  defaultToolPrincipal,
  definitionApplyTarget,
  definitionRollbackTarget,
  frameworkSystemPrincipal,
} from "../../src/tools/authorization-context.js";
import { InMemoryApprovalTokenStore } from "../../src/tools/approval-token-store.js";

function createFakeOrchestrator(): LifecycleOrchestrator & {
  definitionApplyCalls: Array<{ change: DefinitionApplyChange; options: DefinitionApplyOptions }>;
  rollbackPrepareCalls: Array<{ input: DefinitionRollbackPrepareInput; options: DefinitionRollbackPrepareOptions }>;
  rollbackExecuteCalls: Array<{ input: DefinitionRollbackPrepareInput; options: DefinitionRollbackExecuteOptions }>;
} {
  const fake = {
    workspace: "workspace-1",
    state: {},
    definitionApplyCalls: [] as Array<{ change: DefinitionApplyChange; options: DefinitionApplyOptions }>,
    rollbackPrepareCalls: [] as Array<{ input: DefinitionRollbackPrepareInput; options: DefinitionRollbackPrepareOptions }>,
    rollbackExecuteCalls: [] as Array<{ input: DefinitionRollbackPrepareInput; options: DefinitionRollbackExecuteOptions }>,
    async runDefinitionApply(
      change: DefinitionApplyChange,
      options: DefinitionApplyOptions,
    ): Promise<DefinitionApplyResult> {
      this.definitionApplyCalls.push({ change, options });
      return {
        change_id: "def-1",
        operation_id: `operation:${change.kind}`,
        mode: options.mode ?? "apply",
        status: options.mode === "validate" ? "validated" : "applied",
        restart_required: options.mode !== "validate",
        before: { tables: [], operations: [], views: [], policy_rules: [] },
        after: { tables: [], operations: [], views: [], policy_rules: [] },
        diff: {
          changed_tables: [],
          added_tables: [],
          added_operations: [],
          added_views: [],
          added_policy_rules: [],
        },
        timeline: [],
        approval: { required: options.requireApproval === true },
      };
    },
    async runDefinitionRollbackPrepare(
      input: DefinitionRollbackPrepareInput,
      options: DefinitionRollbackPrepareOptions,
    ): Promise<DefinitionRollbackPrepareResult> {
      this.rollbackPrepareCalls.push({ input, options });
      return {
        rollback_id: "rollback-1",
        operation_id: "definition.rollback.validate",
        target_history_version: input.target_history_version,
        status: "ready_to_execute",
        validation: { destructive: true, requires_approval: true },
        destructive: true,
        requires_approval: true,
        timeline: [],
        approval: { required: options.requireApproval ?? true },
      };
    },
    async runDefinitionRollbackExecute(
      input: DefinitionRollbackPrepareInput,
      options: DefinitionRollbackExecuteOptions,
    ): Promise<DefinitionRollbackExecuteResult> {
      this.rollbackExecuteCalls.push({ input, options });
      return {
        rollback_id: "rollback-1",
        operation_id: "definition.rollback.execute",
        target_history_version: input.target_history_version,
        status: "rolled_back",
        prepare: {
          rollback_id: "rollback-1",
          operation_id: "definition.rollback.validate",
          target_history_version: input.target_history_version,
          status: "ready_to_execute",
          validation: { destructive: true, requires_approval: true },
          destructive: true,
          requires_approval: true,
          timeline: [],
          approval: { required: true, decision: "allow" },
        },
        before: { tables: [], operations: [], views: [], policy_rules: [] },
        after: { tables: [], operations: [], views: [], policy_rules: [] },
        diff: { removed_tables: [], removed_columns: [], removed_operations: [], removed_views: [] },
        timeline: [],
      };
    },
  };
  return fake as unknown as ReturnType<typeof createFakeOrchestrator>;
}

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
  expect(store.consume(token.token_id)).toEqual(token);
  expect(store.consume(token.token_id)).toBeUndefined();
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

  expect(first.kind).toBe("definition");
  expect(first.fingerprint).toContain("definition.apply:");
  expect(first.fingerprint).not.toBe(second.fingerprint);
});

test("framework system principal is explicit", () => {
  expect(frameworkSystemPrincipal()).toEqual({ kind: "framework_system", id: "framework" });
});

test("definition.apply apply mode rejects build_agent without approval token", async () => {
  const orchestrator = createFakeOrchestrator();
  const reg = createToolRegistry({
    orchestrator,
    authorizationKernel: new AuthorizationKernel(),
    principal: defaultToolPrincipal(),
    appId: "ai-bookmarks",
    workspaceId: "workspace-1",
  });
  registerActionTools(reg);

  const result = await reg.call("definition.apply", {
    kind: "add_table_column",
    table_id: "bookmarks",
    column_name: "tags",
    cell_type: { kind: "string" },
  });

  expect(result.ok).toBe(false);
  expect((result.state as { authorization: { reason_code: string } }).authorization.reason_code).toBe("approval_required");
  expect(orchestrator.definitionApplyCalls).toHaveLength(0);
});

test("definition.apply apply mode executes as framework_system after builder approval", async () => {
  const orchestrator = createFakeOrchestrator();
  const approvalTokens = new InMemoryApprovalTokenStore();
  const change = {
    kind: "add_table_column",
    table_id: "bookmarks",
    column_name: "tags",
    cell_type: { kind: "string" },
  };
  const token = approvalTokens.mint({
    app_id: "ai-bookmarks",
    workspace_id: "workspace-1",
    capability: "definition:apply",
    target: definitionApplyTarget(change),
    approved_by: builderPrincipal(),
  });
  const reg = createToolRegistry({
    orchestrator,
    authorizationKernel: new AuthorizationKernel(),
    approvalTokens,
    principal: frameworkSystemPrincipal(),
    appId: "ai-bookmarks",
    workspaceId: "workspace-1",
  });
  registerActionTools(reg);

  const result = await reg.call("definition.apply", {
    ...change,
    approval_token_id: token.token_id,
  });

  expect(result.ok).toBe(true);
  expect(orchestrator.definitionApplyCalls).toHaveLength(1);
  expect(approvalTokens.consume(token.token_id)).toBeUndefined();
});

test("definition.apply add_policy_rule requires policy mutate approval", async () => {
  const orchestrator = createFakeOrchestrator();
  const reg = createToolRegistry({
    orchestrator,
    authorizationKernel: new AuthorizationKernel(),
    principal: defaultToolPrincipal(),
    appId: "ai-bookmarks",
    workspaceId: "workspace-1",
  });
  registerActionTools(reg);

  const result = await reg.call("definition.apply", {
    kind: "add_policy_rule",
    rule_id: "reviewers-only",
    allow: ["role:reviewer"],
    actions: ["view.read"],
    resource: { table: "bookmarks" },
  });

  const authorization = (result.state as { authorization: { capability: string; reason_code: string } }).authorization;
  expect(result.ok).toBe(false);
  expect(authorization.capability).toBe("policy:mutate");
  expect(authorization.reason_code).toBe("approval_required");
  expect(orchestrator.definitionApplyCalls).toHaveLength(0);
});

test("definition.rollback.prepare can be proposed by build_agent", async () => {
  const orchestrator = createFakeOrchestrator();
  const reg = createToolRegistry({
    orchestrator,
    authorizationKernel: new AuthorizationKernel(),
    principal: defaultToolPrincipal(),
    appId: "ai-bookmarks",
    workspaceId: "workspace-1",
  });
  registerActionTools(reg);

  const result = await reg.call("definition.rollback.prepare", { target_history_version: 1 });

  expect(result.ok).toBe(true);
  expect(orchestrator.rollbackPrepareCalls).toHaveLength(1);
});

test("definition.rollback.execute requires approved destructive rollback token", async () => {
  const orchestrator = createFakeOrchestrator();
  const reg = createToolRegistry({
    orchestrator,
    authorizationKernel: new AuthorizationKernel(),
    principal: defaultToolPrincipal(),
    appId: "ai-bookmarks",
    workspaceId: "workspace-1",
  });
  registerActionTools(reg);

  const result = await reg.call("definition.rollback.execute", { target_history_version: 1 });

  expect(result.ok).toBe(false);
  expect((result.state as { authorization: { reason_code: string } }).authorization.reason_code).toBe("approval_required");
  expect(orchestrator.rollbackExecuteCalls).toHaveLength(0);
});

test("denied framework operation returns authorization reason code to agent", async () => {
  const orchestrator = createFakeOrchestrator();
  const approvalTokens = new InMemoryApprovalTokenStore();
  const token = approvalTokens.mint({
    app_id: "ai-bookmarks",
    workspace_id: "workspace-1",
    capability: "definition:rollback:execute",
    target: definitionRollbackTarget(2),
    approved_by: builderPrincipal(),
  });
  const reg = createToolRegistry({
    orchestrator,
    authorizationKernel: new AuthorizationKernel(),
    approvalTokens,
    principal: frameworkSystemPrincipal(),
    appId: "ai-bookmarks",
    workspaceId: "workspace-1",
  });
  registerActionTools(reg);

  const result = await reg.call("definition.rollback.execute", {
    target_history_version: 1,
    approval_token_id: token.token_id,
  });

  const authorization = (result.state as { authorization: { reason_code: string; message: string } }).authorization;
  expect(result.ok).toBe(false);
  expect(authorization.reason_code).toBe("approval_target_mismatch");
  expect(authorization.message).toContain("different target");
  expect(orchestrator.rollbackExecuteCalls).toHaveLength(0);
});
