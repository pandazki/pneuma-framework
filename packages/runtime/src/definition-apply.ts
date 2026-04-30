// definition-apply.ts — small orchestration core for Phase 3 P2.
//
// This is the runtime-level reference flow for "agent applies a real app
// definition change": boot current app, invoke the framework Operation that
// records the definition row, close, boot again, and return the before/after
// schema diff from the same `/api/config` surface agents consume.
//
// It intentionally does not own process management. The core lifecycle layer
// can later wrap the same contract around runStop/runDev once templates expose
// the apply call through a long-lived dev server.

import {
  buildRootContext,
  type Column,
  type CellType,
  type DefaultPosture,
  type InputSchema,
  type OperationOutput,
  type OperationSurfaceInit,
  type PermissionContext,
  type QueryBody,
  type ViewKind,
  type ViewSource,
} from "@pneuma-framework/core-domain";
import {
  ADD_OPERATION_OP_ID,
  ADD_POLICY_RULE_OP_ID,
  ADD_TABLE_COLUMN_OP_ID,
  ADD_TABLE_OP_ID,
  ADD_VIEW_OP_ID,
  DELETE_POLICY_RULE_OP_ID,
  SET_DEFAULT_POSTURE_OP_ID,
  UPDATE_POLICY_RULE_OP_ID,
} from "./framework-operations.js";
import { handleHttp, type HttpRequestContext } from "./http.js";
import { bootAppRuntime, type AppRuntime } from "./runtime.js";
import type { AppConfig } from "./types.js";

export interface AddTableColumnDefinitionChange {
  readonly kind: "add_table_column";
  readonly table_id: string;
  readonly column_name: string;
  readonly cell_type: CellType;
  readonly nullable?: boolean;
  readonly default_value?: unknown;
}

export interface AddTableDefinitionChange {
  readonly kind: "add_table";
  readonly table_id: string;
  readonly columns?: readonly Column[];
}

export interface AddOperationDefinitionChange {
  readonly kind: "add_operation";
  readonly operation_id: string;
  readonly name?: string;
  readonly description?: string;
  readonly input?: InputSchema;
  readonly output?: OperationOutput;
  readonly handler: QueryBody;
  readonly ui_binding?: unknown;
  readonly agent_tool?: unknown;
  readonly surface?: OperationSurfaceInit;
}

export interface AddViewDefinitionChange {
  readonly kind: "add_view";
  readonly view_id: string;
  readonly name?: string;
  readonly description?: string;
  readonly view_kind: ViewKind;
  readonly source: ViewSource;
  readonly presentation?: Readonly<Record<string, unknown>>;
}

export interface AddPolicyRuleDefinitionChange {
  readonly kind: "add_policy_rule";
  readonly rule_id: string;
  readonly effect?: "allow" | "deny";
  readonly allow: readonly unknown[];
  readonly actions: readonly string[];
  readonly resource: unknown;
  readonly when?: unknown;
}

export interface UpdatePolicyRuleDefinitionChange {
  readonly kind: "update_policy_rule";
  readonly rule_id: string;
  readonly effect?: "allow" | "deny";
  readonly allow?: readonly unknown[];
  readonly actions?: readonly string[];
  readonly resource?: unknown;
  readonly when?: unknown;
}

export interface DeletePolicyRuleDefinitionChange {
  readonly kind: "delete_policy_rule";
  readonly rule_id: string;
}

export interface SetDefaultPostureDefinitionChange {
  readonly kind: "set_default_posture";
  readonly app: "public" | "restricted";
}

export type DefinitionChange =
  | AddTableColumnDefinitionChange
  | AddTableDefinitionChange
  | AddOperationDefinitionChange
  | AddViewDefinitionChange
  | AddPolicyRuleDefinitionChange
  | UpdatePolicyRuleDefinitionChange
  | DeletePolicyRuleDefinitionChange
  | SetDefaultPostureDefinitionChange;

export interface RuntimeConfigSnapshot {
  readonly app_id: string;
  readonly tables: readonly RuntimeConfigTable[];
  readonly operations: readonly RuntimeConfigOperation[];
  readonly views: readonly RuntimeConfigView[];
  readonly policy_rules: readonly RuntimeConfigPolicyRule[];
  readonly policy_default_posture: DefaultPosture;
}

export interface RuntimeConfigTable {
  readonly id: string;
  readonly source: unknown;
  readonly system_owned: boolean;
  readonly columns: readonly RuntimeConfigColumn[];
  readonly row_schema?: unknown;
}

export interface RuntimeConfigColumn {
  readonly name: string;
  readonly type: unknown;
  readonly nullable: boolean;
  readonly schema?: unknown;
}

export interface RuntimeConfigOperation {
  readonly id: string;
  readonly action: string;
  readonly resource: unknown;
  readonly input: unknown;
  readonly output: unknown;
  readonly affects: unknown;
  readonly handler_kind: string;
  readonly surface?: unknown;
}

export interface RuntimeConfigView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: string;
  readonly source: unknown;
  readonly presentation?: unknown;
}

export interface RuntimeConfigPolicyRule {
  readonly id: string;
  readonly effect?: "allow" | "deny";
  readonly allow: readonly unknown[];
  readonly actions: readonly string[];
  readonly resource: unknown;
  readonly when?: unknown;
}

export interface DefinitionApplyDiff {
  readonly changed_tables: readonly TableDefinitionDiff[];
  readonly added_tables: readonly AddedTableDefinitionDiff[];
  readonly added_operations: readonly AddedOperationDefinitionDiff[];
  readonly added_views: readonly AddedViewDefinitionDiff[];
  readonly added_policy_rules: readonly AddedPolicyRuleDefinitionDiff[];
  readonly updated_policy_rules: readonly UpdatedPolicyRuleDefinitionDiff[];
  readonly deleted_policy_rules: readonly DeletedPolicyRuleDefinitionDiff[];
  readonly updated_policy_settings: readonly UpdatedPolicySettingDefinitionDiff[];
}

export interface TableDefinitionDiff {
  readonly table_id: string;
  readonly before_columns: readonly string[];
  readonly after_columns: readonly string[];
  readonly added_columns: readonly string[];
}

export interface AddedTableDefinitionDiff {
  readonly table_id: string;
  readonly columns: readonly string[];
}

export interface AddedOperationDefinitionDiff {
  readonly operation_id: string;
  readonly action: string;
  readonly handler_kind: string;
}

export interface AddedViewDefinitionDiff {
  readonly view_id: string;
  readonly kind: string;
  readonly source_operation_id: string;
}

export interface AddedPolicyRuleDefinitionDiff {
  readonly rule_id: string;
  readonly actions: readonly string[];
  readonly resource: unknown;
}

export interface UpdatedPolicyRuleDefinitionDiff {
  readonly rule_id: string;
  readonly changed_fields: readonly string[];
}

export interface DeletedPolicyRuleDefinitionDiff {
  readonly rule_id: string;
  readonly actions: readonly string[];
  readonly resource: unknown;
}

export interface UpdatedPolicySettingDefinitionDiff {
  readonly setting_id: "default_posture";
  readonly before: DefaultPosture;
  readonly after: DefaultPosture;
}

export interface DefinitionApplyResult {
  readonly before: RuntimeConfigSnapshot;
  readonly after: RuntimeConfigSnapshot;
  readonly diff: DefinitionApplyDiff;
  readonly operation_output: unknown;
  /**
   * Rebooted runtime with the overlay applied. Caller owns close().
   */
  readonly runtime: AppRuntime;
}

export interface DefinitionApplyOptions {
  /**
   * Attribution context for app_history/audit. Defaults to a build-agent actor.
   */
  readonly ctx?: PermissionContext;
}

export async function applyDefinitionChange(
  config: AppConfig,
  change: DefinitionChange,
  opts: DefinitionApplyOptions = {},
): Promise<DefinitionApplyResult> {
  ensurePersistentStorage(config);

  const first = await bootAppRuntime(config);
  let before: RuntimeConfigSnapshot;
  let operationOutput: unknown;
  try {
    before = await fetchRuntimeConfig(first);
    const op = first.getOperation(operationIdForChange(change));
    if (!op) {
      throw new Error(`definition.apply: framework Operation '${operationIdForChange(change)}' is not registered`);
    }
    operationOutput = (await first.executor.invoke(
      op,
      inputForChange(change),
      opts.ctx ?? defaultAgentContext(config.app_id),
    )).output;
  } finally {
    await first.close();
  }

  const second = await bootAppRuntime(config);
  try {
    const after = await fetchRuntimeConfig(second);
    return {
      before,
      after,
      diff: diffConfigs(before, after, change),
      operation_output: operationOutput,
      runtime: second,
    };
  } catch (err) {
    await second.close();
    throw err;
  }
}

function ensurePersistentStorage(config: AppConfig): void {
  const sqlitePath = config.storage?.sqlite_path;
  if (!sqlitePath || sqlitePath === ":memory:") {
    throw new Error(
      "definition.apply requires config.storage.sqlite_path to be a persistent SQLite file so the definition row survives restart",
    );
  }
}

function operationIdForChange(change: DefinitionChange): string {
  if (change.kind === "add_table") return ADD_TABLE_OP_ID;
  if (change.kind === "add_table_column") return ADD_TABLE_COLUMN_OP_ID;
  if (change.kind === "add_operation") return ADD_OPERATION_OP_ID;
  if (change.kind === "add_view") return ADD_VIEW_OP_ID;
  if (change.kind === "add_policy_rule") return ADD_POLICY_RULE_OP_ID;
  if (change.kind === "update_policy_rule") return UPDATE_POLICY_RULE_OP_ID;
  if (change.kind === "delete_policy_rule") return DELETE_POLICY_RULE_OP_ID;
  if (change.kind === "set_default_posture") return SET_DEFAULT_POSTURE_OP_ID;
  return "";
}

function inputForChange(change: DefinitionChange): Record<string, unknown> {
  if (change.kind === "add_table") {
    return {
      table_id: change.table_id,
      columns: change.columns ?? [],
    };
  }
  if (change.kind === "add_table_column") {
    return {
      table_id: change.table_id,
      column_name: change.column_name,
      cell_type: change.cell_type,
      nullable: change.nullable,
      default_value: change.default_value,
    };
  }
  if (change.kind === "add_operation") {
    return {
      operation_id: change.operation_id,
      name: change.name,
      description: change.description,
      input: change.input,
      output: change.output,
      handler: change.handler,
      ui_binding: change.ui_binding,
      agent_tool: change.agent_tool,
      surface: change.surface,
    };
  }
  if (change.kind === "add_view") {
    return {
      view_id: change.view_id,
      name: change.name,
      description: change.description,
      view_kind: change.view_kind,
      source: change.source,
      presentation: change.presentation,
    };
  }
  if (change.kind === "add_policy_rule") {
    return {
      rule_id: change.rule_id,
      effect: change.effect,
      allow: change.allow,
      actions: change.actions,
      resource: change.resource,
      when: change.when,
    };
  }
  if (change.kind === "update_policy_rule") {
    return {
      rule_id: change.rule_id,
      effect: change.effect,
      allow: change.allow,
      actions: change.actions,
      resource: change.resource,
      when: change.when,
    };
  }
  if (change.kind === "delete_policy_rule") {
    return {
      rule_id: change.rule_id,
    };
  }
  if (change.kind === "set_default_posture") {
    return { app: change.app };
  }
  return {};
}

function defaultAgentContext(app_id: string): PermissionContext {
  return buildRootContext({
    app_id,
    invoked_via: "agent",
    user: { id: "agent:definition-apply", attrs: {}, roles: [] },
  });
}

async function fetchRuntimeConfig(runtime: AppRuntime): Promise<RuntimeConfigSnapshot> {
  const resp = await handleHttp(runtime, configRequest());
  if (resp.status !== 200) {
    throw new Error(`definition.apply: GET /api/config returned HTTP ${resp.status}`);
  }
  const body = resp.body as Partial<RuntimeConfigSnapshot>;
  if (typeof body.app_id !== "string" || !Array.isArray(body.tables) || !Array.isArray(body.operations)) {
    throw new Error("definition.apply: malformed /api/config response");
  }
  return {
    app_id: body.app_id,
    tables: body.tables as readonly RuntimeConfigTable[],
    operations: body.operations as readonly RuntimeConfigOperation[],
    views: Array.isArray(body.views) ? body.views as readonly RuntimeConfigView[] : [],
    policy_rules: Array.isArray(body.policy_rules) ? body.policy_rules as readonly RuntimeConfigPolicyRule[] : [],
    policy_default_posture: defaultPostureFromConfig(body.policy_default_posture),
  };
}

function defaultPostureFromConfig(value: unknown): DefaultPosture {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const app = (value as { app?: unknown }).app;
    if (app === "public" || app === "restricted") return { app };
  }
  return { app: "public" };
}

function configRequest(): HttpRequestContext {
  return {
    method: "GET",
    pathname: "/api/config",
    searchParams: new URLSearchParams(),
    headers: new Headers(),
    readBody: async () => undefined,
  };
}

function diffConfigs(
  before: RuntimeConfigSnapshot,
  after: RuntimeConfigSnapshot,
  change: DefinitionChange,
): DefinitionApplyDiff {
  if (change.kind === "add_table") {
    const beforeTable = before.tables.find((t) => t.id === change.table_id);
    const afterTable = after.tables.find((t) => t.id === change.table_id);
    return {
      changed_tables: [],
      added_operations: [],
      added_views: [],
      added_policy_rules: [],
      updated_policy_rules: [],
      deleted_policy_rules: [],
      updated_policy_settings: [],
      added_tables: beforeTable || !afterTable
        ? []
        : [{
            table_id: afterTable.id,
            columns: afterTable.columns.map((c) => c.name),
          }],
    };
  }
  if (change.kind === "add_table_column") {
    const beforeTable = before.tables.find((t) => t.id === change.table_id);
    const afterTable = after.tables.find((t) => t.id === change.table_id);
    const beforeColumns = beforeTable?.columns.map((c) => c.name) ?? [];
    const afterColumns = afterTable?.columns.map((c) => c.name) ?? [];
    const beforeSet = new Set(beforeColumns);
    return {
      added_tables: [],
      added_operations: [],
      added_views: [],
      added_policy_rules: [],
      updated_policy_rules: [],
      deleted_policy_rules: [],
      updated_policy_settings: [],
      changed_tables: [{
        table_id: change.table_id,
        before_columns: beforeColumns,
        after_columns: afterColumns,
        added_columns: afterColumns.filter((name) => !beforeSet.has(name)),
      }],
    };
  }
  if (change.kind === "add_operation") {
    const beforeOperation = before.operations.find((op) => op.id === change.operation_id);
    const afterOperation = after.operations.find((op) => op.id === change.operation_id);
    return {
      changed_tables: [],
      added_tables: [],
      added_views: [],
      added_policy_rules: [],
      updated_policy_rules: [],
      deleted_policy_rules: [],
      updated_policy_settings: [],
      added_operations: beforeOperation || !afterOperation
        ? []
        : [{
            operation_id: afterOperation.id,
            action: afterOperation.action,
            handler_kind: afterOperation.handler_kind,
          }],
    };
  }
  if (change.kind === "add_view") {
    const beforeView = before.views.find((view) => view.id === change.view_id);
    const afterView = after.views.find((view) => view.id === change.view_id);
    const source = afterView?.source as { operation_id?: unknown } | undefined;
    return {
      changed_tables: [],
      added_tables: [],
      added_operations: [],
      added_policy_rules: [],
      updated_policy_rules: [],
      deleted_policy_rules: [],
      updated_policy_settings: [],
      added_views: beforeView || !afterView
        ? []
        : [{
            view_id: afterView.id,
            kind: afterView.kind,
            source_operation_id: typeof source?.operation_id === "string" ? source.operation_id : "",
          }],
    };
  }
  if (change.kind === "add_policy_rule") {
    const beforeRule = before.policy_rules.find((rule) => rule.id === change.rule_id);
    const afterRule = after.policy_rules.find((rule) => rule.id === change.rule_id);
    return {
      changed_tables: [],
      added_tables: [],
      added_operations: [],
      added_views: [],
      updated_policy_rules: [],
      deleted_policy_rules: [],
      updated_policy_settings: [],
      added_policy_rules: beforeRule || !afterRule
        ? []
        : [{
            rule_id: afterRule.id,
            actions: afterRule.actions,
            resource: afterRule.resource,
          }],
    };
  }
  if (change.kind === "update_policy_rule") {
    const beforeRule = before.policy_rules.find((rule) => rule.id === change.rule_id);
    const afterRule = after.policy_rules.find((rule) => rule.id === change.rule_id);
    return {
      changed_tables: [],
      added_tables: [],
      added_operations: [],
      added_views: [],
      added_policy_rules: [],
      deleted_policy_rules: [],
      updated_policy_settings: [],
      updated_policy_rules: !beforeRule || !afterRule
        ? []
        : [{
            rule_id: afterRule.id,
            changed_fields: changedPolicyRuleFields(beforeRule, afterRule),
          }],
    };
  }
  if (change.kind === "delete_policy_rule") {
    const beforeRule = before.policy_rules.find((rule) => rule.id === change.rule_id);
    const afterRule = after.policy_rules.find((rule) => rule.id === change.rule_id);
    return {
      changed_tables: [],
      added_tables: [],
      added_operations: [],
      added_views: [],
      added_policy_rules: [],
      updated_policy_rules: [],
      updated_policy_settings: [],
      deleted_policy_rules: !beforeRule || afterRule
        ? []
        : [{
            rule_id: beforeRule.id,
            actions: beforeRule.actions,
            resource: beforeRule.resource,
          }],
    };
  }
  if (change.kind === "set_default_posture") {
    return {
      changed_tables: [],
      added_tables: [],
      added_operations: [],
      added_views: [],
      added_policy_rules: [],
      updated_policy_rules: [],
      deleted_policy_rules: [],
      updated_policy_settings: before.policy_default_posture.app === after.policy_default_posture.app
        ? []
        : [{
            setting_id: "default_posture",
            before: before.policy_default_posture,
            after: after.policy_default_posture,
          }],
    };
  }
  return {
    changed_tables: [],
    added_tables: [],
    added_operations: [],
    added_views: [],
    added_policy_rules: [],
    updated_policy_rules: [],
    deleted_policy_rules: [],
    updated_policy_settings: [],
  };
}

function changedPolicyRuleFields(
  before: RuntimeConfigPolicyRule,
  after: RuntimeConfigPolicyRule,
): string[] {
  const changed: string[] = [];
  if ((before.effect ?? "allow") !== (after.effect ?? "allow")) changed.push("effect");
  if (!jsonEqual(before.allow, after.allow)) changed.push("allow");
  if (!jsonEqual(before.actions, after.actions)) changed.push("actions");
  if (!jsonEqual(before.resource, after.resource)) changed.push("resource");
  if (!jsonEqual(before.when ?? null, after.when ?? null)) changed.push("when");
  return changed;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
