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
  type InputSchema,
  type OperationOutput,
  type PermissionContext,
  type QueryBody,
} from "@pneuma-framework/core-domain";
import { ADD_OPERATION_OP_ID, ADD_TABLE_COLUMN_OP_ID, ADD_TABLE_OP_ID } from "./framework-operations.js";
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
}

export type DefinitionChange =
  | AddTableColumnDefinitionChange
  | AddTableDefinitionChange
  | AddOperationDefinitionChange;

export interface RuntimeConfigSnapshot {
  readonly app_id: string;
  readonly tables: readonly RuntimeConfigTable[];
  readonly operations: readonly RuntimeConfigOperation[];
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
}

export interface DefinitionApplyDiff {
  readonly changed_tables: readonly TableDefinitionDiff[];
  readonly added_tables: readonly AddedTableDefinitionDiff[];
  readonly added_operations: readonly AddedOperationDefinitionDiff[];
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
    };
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
  return body as RuntimeConfigSnapshot;
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
      added_operations: beforeOperation || !afterOperation
        ? []
        : [{
            operation_id: afterOperation.id,
            action: afterOperation.action,
            handler_kind: afterOperation.handler_kind,
          }],
    };
  }
  return { changed_tables: [], added_tables: [], added_operations: [] };
}
