// framework-operations.ts — Operations injected into every AppConfig by the runtime.
// First members: add_table + add_table_column (Phase 3).
//
// Framework Operations share the Operation pipeline with template Operations
// (same PolicyEvaluator gate, audit events, /api/config exposure, MCP bridge
// visibility). The only difference is ownership: they're declared here, not
// in the template's config.ts.

import type {
  AppHistoryEntry,
  HandlerFn,
  ImpactComputeFn,
  Operation,
  AppHistoryStore,
  ActorKind,
  CellType,
  Column,
  PermissionContext,
  PneumaTableEntry,
  PneumaTableColumnEntry,
  PneumaOperationEntry,
  PneumaViewEntry,
  PneumaPolicyRuleEntry,
  OperationHandlerStorage,
  AgentToolConfig,
  InputSchema,
  OperationOutput,
  OperationSurfaceInit,
  QueryBody,
  UIBinding,
  ViewKind,
  ViewSource,
  PolicyRule,
} from "@pneuma-framework/core-domain";
import {
  Operation as OperationClass,
  PNEUMA_TABLES_TABLE_ID,
  PNEUMA_TABLE_COLUMNS_TABLE_ID,
  PNEUMA_OPERATIONS_TABLE_ID,
  PNEUMA_VIEWS_TABLE_ID,
  PNEUMA_POLICY_RULES_TABLE_ID,
  RESERVED_COLUMN_NAMES,
  Row,
  Table,
  isCellType,
  isColumn,
  isTableSource,
  isViewKind,
  isViewSource,
  isWhereClause,
  pneumaTableEntryToRow,
  rowToPneumaTableEntry,
  pneumaTableColumnEntryToRow,
  rowToPneumaTableColumnEntry,
  createPneumaOperationsTable,
  operationFromPneumaOperationEntry,
  pneumaOperationEntryToRow,
  rowToPneumaOperationEntry,
  createPneumaViewsTable,
  pneumaViewEntryToRow,
  rowToPneumaViewEntry,
  viewFromPneumaViewEntry,
  createPneumaPolicyRulesTable,
  pneumaPolicyRuleEntryToRow,
  rowToPneumaPolicyRuleEntry,
  policyRuleFromPneumaPolicyRuleEntry,
  PolicySet,
  Subjects,
  Resources,
  createPneumaTablesTable,
  createPneumaTableColumnsTable,
  normalizeOperationSurface,
  normalizeViewPresentation,
  operationCanBackView,
} from "@pneuma-framework/core-domain";
import type { AppConfig } from "./types.js";

export const ADD_TABLE_OP_ID = "add_table";
export const ADD_TABLE_HANDLER_REF = "framework://add_table";
export const ADD_TABLE_COLUMN_OP_ID = "add_table_column";
export const ADD_TABLE_COLUMN_HANDLER_REF = "framework://add_table_column";
export const ADD_OPERATION_OP_ID = "add_operation";
export const ADD_OPERATION_HANDLER_REF = "framework://add_operation";
export const ADD_VIEW_OP_ID = "add_view";
export const ADD_VIEW_HANDLER_REF = "framework://add_view";
export const ADD_POLICY_RULE_OP_ID = "add_policy_rule";
export const ADD_POLICY_RULE_HANDLER_REF = "framework://add_policy_rule";
export const DEFINITION_ROLLBACK_VALIDATE_OP_ID = "definition.rollback.validate";
export const DEFINITION_ROLLBACK_VALIDATE_HANDLER_REF = "framework://definition.rollback.validate";
export const DEFINITION_ROLLBACK_EXECUTE_OP_ID = "definition.rollback.execute";
export const DEFINITION_ROLLBACK_EXECUTE_HANDLER_REF = "framework://definition.rollback.execute";
export const DEFINITION_ROLLBACK_EXECUTE_IMPACT_REF = "framework://definition.rollback.execute.impact";

const FRAMEWORK_OPERATION_IDS = new Set([
  ADD_TABLE_OP_ID,
  ADD_TABLE_COLUMN_OP_ID,
  ADD_OPERATION_OP_ID,
  ADD_VIEW_OP_ID,
  ADD_POLICY_RULE_OP_ID,
  DEFINITION_ROLLBACK_VALIDATE_OP_ID,
  DEFINITION_ROLLBACK_EXECUTE_OP_ID,
]);

export function isFrameworkOperationId(operation_id: string): boolean {
  return FRAMEWORK_OPERATION_IDS.has(operation_id);
}

const FRAMEWORK_INTERNAL_SURFACE = {
  agent_callable: true,
  public_surface: false,
  view_mountable: false,
  framework_internal: true,
} as const;

// Brand marking framework-owned handler functions. Used by applyFrameworkInjections
// to distinguish a re-injection (idempotent — we overwrite our own function) from
// a template-side collision on a reserved key (fail loud).
const FRAMEWORK_HANDLER_BRAND: unique symbol = Symbol.for("pneuma.framework.handler");

/**
 * Build the `add_table` Operation for a concrete app_id.
 *
 * Input:
 *   - table_id      (Text, required) : id of the stored Table to declare
 *   - columns       (json, optional) : serialized Column[]
 *
 * Output: { entry_id, definition_version }
 */
export function createAddTableOp(app_id: string): Operation {
  const TEXT = { kind: "primitive", of: "Text" } as const;
  const JSON_T = { kind: "json" } as const;

  return new OperationClass({
    id: ADD_TABLE_OP_ID,
    app_id,
    name: "Add stored Table",
    description:
      "Framework-injected Operation. Declares a new stored Table by writing a row to pneuma_tables. The new Table becomes effective on the next bootAppRuntime — this call does NOT restart.",
    input: {
      type: "record",
      fields: {
        table_id: { type: TEXT, required: true },
        columns: { type: JSON_T },
      },
    },
    output: {
      kind: "object",
      schema: {
        type: "object",
        properties: {
          entry_id: { type: "string" },
          definition_version: { type: "number" },
        },
        required: ["entry_id", "definition_version"],
      },
    },
    affects: {
      mutations: [PNEUMA_TABLES_TABLE_ID],
      adapter_writes: [],
      reads_only: false,
      destructive: false,
    },
    handler: { kind: "code", ref: ADD_TABLE_HANDLER_REF },
    surface: FRAMEWORK_INTERNAL_SURFACE,
  });
}

export function createAddTableHandler(): HandlerFn {
  const fn: HandlerFn = async ({ ctx, input, storage, services }) => {
    const history = (services?.history ?? undefined) as AppHistoryStore | undefined;
    if (!history) {
      throw new Error(
        "add_table: AppHistoryStore must be provided via services.history (framework runtime wires this)",
      );
    }
    const i = input as {
      table_id?: unknown;
      columns?: unknown;
      system_owned?: unknown;
      source?: unknown;
    };

    if (typeof i.table_id !== "string" || i.table_id.length === 0) {
      throw new Error(`add_table: input.table_id must be a non-empty string`);
    }
    if (
      i.table_id === PNEUMA_TABLES_TABLE_ID
      || i.table_id === PNEUMA_TABLE_COLUMNS_TABLE_ID
      || i.table_id === PNEUMA_OPERATIONS_TABLE_ID
      || i.table_id === PNEUMA_VIEWS_TABLE_ID
      || i.table_id === PNEUMA_POLICY_RULES_TABLE_ID
    ) {
      throw new Error(`add_table: table_id "${i.table_id}" is reserved by the framework`);
    }
    const columns = i.columns === undefined ? [] : i.columns;
    if (!Array.isArray(columns) || !columns.every(isColumn)) {
      throw new Error(`add_table: input.columns must be an array of valid Column declarations`);
    }
    const source = i.source === undefined ? { kind: "stored" } : i.source;
    if (!isTableSource(source) || source.kind !== "stored") {
      throw new Error(`add_table: MVP only supports source.kind='stored'`);
    }
    if (i.system_owned === true) {
      throw new Error(`add_table: cannot create system_owned tables through Builder definition.apply`);
    }

    const existingTable = await storage.getTable(i.table_id);
    if (existingTable) {
      throw new Error(`add_table: table "${i.table_id}" already exists`);
    }
    const normalizedColumns = validateTableDeclaration(ctx.app_id, i.table_id, columns);

    const existing = await storage.listRowsByTable(PNEUMA_TABLES_TABLE_ID);
    const existingEntries = existing.map(rowToPneumaTableEntry);
    for (const e of existingEntries) {
      if (e.table_id === i.table_id) {
        throw new Error(
          `add_table: table "${i.table_id}" already present in pneuma_tables (entry ${e.id})`,
        );
      }
    }
    const versions = existingEntries.map((e) => e.definition_version);
    const nextVersion = versions.length > 0 ? Math.max(...versions) + 1 : 1;

    const actor_id = ctx.user?.id ?? "anonymous";
    const actor_kind = actorKindFromInvokedVia(ctx.invoked_via);
    const entryId = newTableEntryId();
    const entry: PneumaTableEntry = {
      id: entryId,
      app_id: ctx.app_id,
      table_id: i.table_id,
      source,
      columns: normalizedColumns,
      system_owned: false,
      created_by: actor_id,
      created_by_kind: actor_kind,
      definition_version: nextVersion,
    };

    const existingColumnEntries = (await storage.listRowsByTable(PNEUMA_TABLE_COLUMNS_TABLE_ID))
      .map(rowToPneumaTableColumnEntry);
    const existingOperationEntries = (await storage.listRowsByTable(PNEUMA_OPERATIONS_TABLE_ID))
      .map(rowToPneumaOperationEntry);
    const existingViewEntries = (await storage.listRowsByTable(PNEUMA_VIEWS_TABLE_ID))
      .map(rowToPneumaViewEntry);
    const existingPolicyRuleEntries = (await storage.listRowsByTable(PNEUMA_POLICY_RULES_TABLE_ID))
      .map(rowToPneumaPolicyRuleEntry);
    const allEntriesAfter = [...existingEntries, entry];
    await history.append({
      app_id: ctx.app_id,
      history_type: "snapshot",
      payload: createDefinitionOverlaySnapshot(
        allEntriesAfter,
        existingColumnEntries,
        existingOperationEntries,
        existingViewEntries,
        existingPolicyRuleEntries,
      ),
      is_ai_generated: actor_kind === "agent",
      actor_id,
      actor_kind,
      description: `Added table '${i.table_id}'`,
      operation_scope: [`table:${i.table_id}`, "operation:add_table"],
    });

    await storage.saveRow(pneumaTableEntryToRow(entry));

    return { entry_id: entryId, definition_version: nextVersion };
  };
  (fn as { [FRAMEWORK_HANDLER_BRAND]?: true })[FRAMEWORK_HANDLER_BRAND] = true;
  return fn;
}

/**
 * Build the `add_table_column` Operation for a concrete app_id.
 *
 * Input:
 *   - table_id       (Text, required)  : id of the existing stored Table to extend
 *   - column_name    (Text, required)  : name of the new column
 *   - cell_type      (json, required)  : serialized CellType (discriminated union)
 *   - nullable       (Bool, optional)  : default false
 *   - default_value  (json, optional)
 *
 * Output: { entry_id, definition_version }
 */
export function createAddTableColumnOp(app_id: string): Operation {
  const TEXT = { kind: "primitive", of: "Text" } as const;
  const BOOL = { kind: "primitive", of: "Bool" } as const;
  const JSON_T = { kind: "json" } as const;

  return new OperationClass({
    id: ADD_TABLE_COLUMN_OP_ID,
    app_id,
    name: "Add column to a stored Table",
    description:
      "Framework-injected Operation. Declares a new column on an existing stored Table by writing a row to pneuma_table_columns. The new column becomes effective on the next bootAppRuntime — this call does NOT restart.",
    input: {
      type: "record",
      fields: {
        table_id: { type: TEXT, required: true },
        column_name: { type: TEXT, required: true },
        cell_type: { type: JSON_T, required: true },
        nullable: { type: BOOL },
        default_value: { type: JSON_T },
      },
    },
    output: {
      kind: "object",
      schema: {
        type: "object",
        properties: {
          entry_id: { type: "string" },
          definition_version: { type: "number" },
        },
        required: ["entry_id", "definition_version"],
      },
    },
    affects: {
      mutations: [PNEUMA_TABLE_COLUMNS_TABLE_ID],
      adapter_writes: [],
      reads_only: false,
      destructive: false,
    },
    handler: { kind: "code", ref: ADD_TABLE_COLUMN_HANDLER_REF },
    surface: FRAMEWORK_INTERNAL_SURFACE,
  });
}

/**
 * Handler for `add_table_column`.
 *
 * Writes a new row into the system-owned `pneuma_table_columns` Table and
 * appends a snapshot entry to `app_history`. Does NOT mutate the in-memory
 * `Table` aggregate — the declared column becomes effective only on the next
 * `bootAppRuntime` (P2 will layer restart orchestration on top of this).
 */
export function createAddTableColumnHandler(): HandlerFn {
  const fn: HandlerFn = async ({ ctx, input, storage, services }) => {
    const history = (services?.history ?? undefined) as AppHistoryStore | undefined;
    if (!history) {
      throw new Error(
        "add_table_column: AppHistoryStore must be provided via services.history (framework runtime wires this)",
      );
    }
    const i = input as {
      table_id?: unknown;
      column_name?: unknown;
      cell_type?: unknown;
      nullable?: unknown;
      default_value?: unknown;
    };

    // 1. Shape validation
    if (typeof i.table_id !== "string" || i.table_id.length === 0) {
      throw new Error(`add_table_column: input.table_id must be a non-empty string`);
    }
    if (typeof i.column_name !== "string" || i.column_name.length === 0) {
      throw new Error(`add_table_column: input.column_name must be a non-empty string`);
    }
    if (!isCellType(i.cell_type)) {
      // Error wording intentionally carries both "invalid" and "valid CellType"
      // tokens to remain searchable across either phrasing convention.
      throw new Error(
        `add_table_column: invalid cell_type — input.cell_type is not a valid CellType (got ${JSON.stringify(i.cell_type).slice(0, 120)})`,
      );
    }
    const cell_type = i.cell_type as CellType;
    const nullable = i.nullable === true;

    // 2. Target table existence + kind check
    const target = await storage.getTable(i.table_id);
    if (!target) {
      throw new Error(`add_table_column: target table "${i.table_id}" not found`);
    }
    if (target.source.kind !== "stored") {
      throw new Error(
        `add_table_column: target table "${i.table_id}" is not stored (source=${target.source.kind})`,
      );
    }

    // 3. Reserved + duplicate-name checks (mirror Table.addColumn invariants — do NOT mutate the in-memory Table here)
    if (RESERVED_COLUMN_NAMES.has(i.column_name)) {
      throw new Error(
        `add_table_column: column name "${i.column_name}" is reserved for stored tables`,
      );
    }
    if (target.hasColumn(i.column_name)) {
      throw new Error(
        `add_table_column: column "${i.column_name}" already exists on "${i.table_id}"`,
      );
    }

    // 4. Load current pneuma_table_columns rows (for duplicate-against-overlay + snapshot + version)
    const existing = await storage.listRowsByTable(PNEUMA_TABLE_COLUMNS_TABLE_ID);
    const existingEntries = existing.map(rowToPneumaTableColumnEntry);
    for (const e of existingEntries) {
      if (e.table_id === i.table_id && e.column_name === i.column_name) {
        throw new Error(
          `add_table_column: column "${i.column_name}" already present on "${i.table_id}" in pneuma_table_columns (entry ${e.id})`,
        );
      }
    }
    const versionsForTarget = existingEntries
      .filter((e) => e.table_id === i.table_id)
      .map((e) => e.definition_version);
    const nextVersion = versionsForTarget.length > 0 ? Math.max(...versionsForTarget) + 1 : 1;

    // 5. Build the entry (persisted below, after the history append)
    const actor_id = ctx.user?.id ?? "anonymous";
    const actor_kind = actorKindFromInvokedVia(ctx.invoked_via);
    const entryId = newEntryId();
    const entry: PneumaTableColumnEntry = {
      id: entryId,
      app_id: ctx.app_id,
      table_id: i.table_id,
      column_name: i.column_name,
      cell_type,
      nullable,
      default_value: i.default_value,
      created_by: actor_id,
      created_by_kind: actor_kind,
      definition_version: nextVersion,
    };
    // 6. Append app_history snapshot FIRST (P1: snapshot-only, no delta yet).
    // ADR-0017: if the process crashes between the two writes, an orphan
    // history entry describing a not-yet-written state is harmless (restore
    // won't find the row); an orphan row without audit is the worse failure
    // mode — so history.append runs before storage.saveRow. The snapshot
    // payload describes the POST-WRITE state regardless of write order.
    const existingTableEntries = (await storage.listRowsByTable(PNEUMA_TABLES_TABLE_ID))
      .map(rowToPneumaTableEntry);
    const existingOperationEntries = (await storage.listRowsByTable(PNEUMA_OPERATIONS_TABLE_ID))
      .map(rowToPneumaOperationEntry);
    const existingViewEntries = (await storage.listRowsByTable(PNEUMA_VIEWS_TABLE_ID))
      .map(rowToPneumaViewEntry);
    const existingPolicyRuleEntries = (await storage.listRowsByTable(PNEUMA_POLICY_RULES_TABLE_ID))
      .map(rowToPneumaPolicyRuleEntry);
    const allEntriesAfter = [...existingEntries, entry];
    await history.append({
      app_id: ctx.app_id,
      history_type: "snapshot",
      payload: createDefinitionOverlaySnapshot(
        existingTableEntries,
        allEntriesAfter,
        existingOperationEntries,
        existingViewEntries,
        existingPolicyRuleEntries,
      ),
      is_ai_generated: actor_kind === "agent",
      actor_id,
      actor_kind,
      description: `Added column '${i.column_name}' to table '${i.table_id}'`,
      operation_scope: [`table:${i.table_id}`, "operation:add_table_column"],
    });

    // 7. Persist the entry
    await storage.saveRow(pneumaTableColumnEntryToRow(entry));

    return { entry_id: entryId, definition_version: nextVersion };
  };
  (fn as { [FRAMEWORK_HANDLER_BRAND]?: true })[FRAMEWORK_HANDLER_BRAND] = true;
  return fn;
}

/**
 * Build the `add_operation` Operation for a concrete app_id.
 *
 * P12 MVP accepts query-backed read Operations only. The framework records a
 * declarative Operation row in `pneuma_operations`; on restart the loader turns
 * that row into a normal Operation visible through /api/config and GET
 * /api/operations/:id.
 */
export function createAddOperationOp(app_id: string): Operation {
  const TEXT = { kind: "primitive", of: "Text" } as const;
  const JSON_T = { kind: "json" } as const;

  return new OperationClass({
    id: ADD_OPERATION_OP_ID,
    app_id,
    name: "Add query Operation",
    description:
      "Framework-injected Operation. Declares a new query-backed read Operation by writing a row to pneuma_operations. The Operation becomes effective on the next bootAppRuntime — this call does NOT restart.",
    input: {
      type: "record",
      fields: {
        operation_id: { type: TEXT, required: true },
        name: { type: TEXT },
        description: { type: TEXT },
        input: { type: JSON_T },
        output: { type: JSON_T },
        handler: { type: JSON_T, required: true },
        ui_binding: { type: JSON_T },
        agent_tool: { type: JSON_T },
        surface: { type: JSON_T },
      },
    },
    output: {
      kind: "object",
      schema: {
        type: "object",
        properties: {
          entry_id: { type: "string" },
          definition_version: { type: "number" },
          operation_id: { type: "string" },
        },
        required: ["entry_id", "definition_version", "operation_id"],
      },
    },
    affects: {
      mutations: [PNEUMA_OPERATIONS_TABLE_ID],
      adapter_writes: [],
      reads_only: false,
      destructive: false,
    },
    handler: { kind: "code", ref: ADD_OPERATION_HANDLER_REF },
    surface: FRAMEWORK_INTERNAL_SURFACE,
  });
}

export function createAddOperationHandler(): HandlerFn {
  const fn: HandlerFn = async ({ ctx, input, storage, services }) => {
    const history = (services?.history ?? undefined) as AppHistoryStore | undefined;
    if (!history) {
      throw new Error(
        "add_operation: AppHistoryStore must be provided via services.history (framework runtime wires this)",
      );
    }
    const i = input as {
      operation_id?: unknown;
      name?: unknown;
      description?: unknown;
      input?: unknown;
      output?: unknown;
      handler?: unknown;
      ui_binding?: unknown;
      agent_tool?: unknown;
      surface?: unknown;
    };

    if (typeof i.operation_id !== "string" || i.operation_id.length === 0) {
      throw new Error("add_operation: input.operation_id must be a non-empty string");
    }
    if (FRAMEWORK_OPERATION_IDS.has(i.operation_id)) {
      throw new Error(`add_operation: operation_id "${i.operation_id}" is reserved by the framework`);
    }

    const handler = normalizeQueryHandler(i.handler);
    const targetTable = await storage.getTable(handler.on);
    if (!targetTable) {
      throw new Error(`add_operation: query target table "${handler.on}" not found`);
    }

    const inputSchema = normalizeInputSchema(i.input);
    const output = normalizeOperationOutput(i.output, handler.on);
    const name = typeof i.name === "string" && i.name.length > 0 ? i.name : i.operation_id;
    const description = typeof i.description === "string" ? i.description : "";
    const affects = {
      mutations: [],
      adapter_writes: [],
      reads_only: true,
      destructive: false,
    };
    const surface = normalizeOperationSurface(
      i.surface === undefined ? undefined : i.surface as OperationSurfaceInit,
      affects,
    );

    const existing = await storage.listRowsByTable(PNEUMA_OPERATIONS_TABLE_ID);
    const existingEntries = existing.map(rowToPneumaOperationEntry);
    for (const entry of existingEntries) {
      if (entry.operation_id === i.operation_id) {
        throw new Error(
          `add_operation: operation "${i.operation_id}" already present in pneuma_operations (entry ${entry.id})`,
        );
      }
    }

    const versions = existingEntries.map((entry) => entry.definition_version);
    const nextVersion = versions.length > 0 ? Math.max(...versions) + 1 : 1;
    const actor_id = ctx.user?.id ?? "anonymous";
    const actor_kind = actorKindFromInvokedVia(ctx.invoked_via);
    const entryId = newOperationEntryId();
    const entry: PneumaOperationEntry = {
      id: entryId,
      app_id: ctx.app_id,
      operation_id: i.operation_id,
      name,
      description,
      input: inputSchema,
      output,
      affects,
      handler,
      ui_binding: i.ui_binding === undefined ? undefined : i.ui_binding as UIBinding,
      agent_tool: i.agent_tool === undefined ? undefined : i.agent_tool as AgentToolConfig,
      surface,
      created_by: actor_id,
      created_by_kind: actor_kind,
      definition_version: nextVersion,
    };

    // Construct once before persistence so Operation aggregate invariants guard
    // what will later be loaded by applyDefinitionOverlay().
    operationFromPneumaOperationEntry(entry);

    const current = await readCurrentDefinitionOverlay(storage);
    await history.append({
      app_id: ctx.app_id,
      history_type: "snapshot",
      payload: createDefinitionOverlaySnapshot(
        current.pneuma_tables,
        current.pneuma_table_columns,
        [...current.pneuma_operations, entry],
        current.pneuma_views,
        current.pneuma_policy_rules,
      ),
      is_ai_generated: actor_kind === "agent",
      actor_id,
      actor_kind,
      description: `Added operation '${i.operation_id}'`,
      operation_scope: [`operation:${i.operation_id}`, `table:${handler.on}`, "operation:add_operation"],
    });

    await storage.saveRow(pneumaOperationEntryToRow(entry));

    return { entry_id: entryId, definition_version: nextVersion, operation_id: i.operation_id };
  };
  (fn as { [FRAMEWORK_HANDLER_BRAND]?: true })[FRAMEWORK_HANDLER_BRAND] = true;
  return fn;
}

/**
 * Build the `add_view` Operation for a concrete app_id.
 *
 * P16 MVP accepts declarative Operation-backed Views only. The framework
 * records a View row in `pneuma_views`; on restart the loader exposes it
 * through runtime.listViews() and `/api/config.views`.
 */
export function createAddViewOp(app_id: string): Operation {
  const TEXT = { kind: "primitive", of: "Text" } as const;
  const JSON_T = { kind: "json" } as const;

  return new OperationClass({
    id: ADD_VIEW_OP_ID,
    app_id,
    name: "Add application View",
    description:
      "Framework-injected Operation. Declares a new Operation-backed View by writing a row to pneuma_views. The View becomes effective on the next bootAppRuntime — this call does NOT restart.",
    input: {
      type: "record",
      fields: {
        view_id: { type: TEXT, required: true },
        name: { type: TEXT },
        description: { type: TEXT },
        view_kind: { type: TEXT, required: true },
        source: { type: JSON_T, required: true },
        presentation: { type: JSON_T },
      },
    },
    output: {
      kind: "object",
      schema: {
        type: "object",
        properties: {
          entry_id: { type: "string" },
          definition_version: { type: "number" },
          view_id: { type: "string" },
        },
        required: ["entry_id", "definition_version", "view_id"],
      },
    },
    affects: {
      mutations: [PNEUMA_VIEWS_TABLE_ID],
      adapter_writes: [],
      reads_only: false,
      destructive: false,
    },
    handler: { kind: "code", ref: ADD_VIEW_HANDLER_REF },
    surface: FRAMEWORK_INTERNAL_SURFACE,
  });
}

export function createAddViewHandler(): HandlerFn {
  const fn: HandlerFn = async ({ ctx, input, storage, services }) => {
    const history = (services?.history ?? undefined) as AppHistoryStore | undefined;
    if (!history) {
      throw new Error(
        "add_view: AppHistoryStore must be provided via services.history (framework runtime wires this)",
      );
    }
    const i = input as {
      view_id?: unknown;
      name?: unknown;
      description?: unknown;
      view_kind?: unknown;
      source?: unknown;
      presentation?: unknown;
    };

    if (typeof i.view_id !== "string" || i.view_id.length === 0) {
      throw new Error("add_view: input.view_id must be a non-empty string");
    }
    if (!isViewKind(i.view_kind)) {
      throw new Error("add_view: input.view_kind must be one of table, list, detail, custom");
    }
    if (!isViewSource(i.source)) {
      throw new Error("add_view: input.source must be an Operation-backed ViewSource");
    }
    const presentation = normalizeAddViewPresentation(i.presentation);
    if (services?.views?.get(i.view_id)) {
      throw new Error(`add_view: view "${i.view_id}" already exists`);
    }

    const sourceOperation = services?.operations?.get(i.source.operation_id);
    if (!sourceOperation) {
      throw new Error(`add_view: source operation "${i.source.operation_id}" not found`);
    }
    if (!sourceOperation.affects.reads_only) {
      throw new Error(`add_view: source operation "${i.source.operation_id}" must be reads_only`);
    }
    if (sourceOperation.surface.framework_internal) {
      throw new Error(`add_view: source operation "${i.source.operation_id}" is framework-internal and cannot be mounted as a View`);
    }
    if (!sourceOperation.surface.public_surface) {
      throw new Error(`add_view: source operation "${i.source.operation_id}" is not part of the public app surface`);
    }
    if (!sourceOperation.surface.view_mountable || !operationCanBackView(sourceOperation)) {
      throw new Error(`add_view: source operation "${i.source.operation_id}" is not view_mountable`);
    }

    const existing = await storage.listRowsByTable(PNEUMA_VIEWS_TABLE_ID);
    const existingEntries = existing.map(rowToPneumaViewEntry);
    for (const entry of existingEntries) {
      if (entry.view_id === i.view_id) {
        throw new Error(
          `add_view: view "${i.view_id}" already present in pneuma_views (entry ${entry.id})`,
        );
      }
    }

    const versions = existingEntries.map((entry) => entry.definition_version);
    const nextVersion = versions.length > 0 ? Math.max(...versions) + 1 : 1;
    const actor_id = ctx.user?.id ?? "anonymous";
    const actor_kind = actorKindFromInvokedVia(ctx.invoked_via);
    const entryId = newViewEntryId();
    const entry: PneumaViewEntry = {
      id: entryId,
      app_id: ctx.app_id,
      view_id: i.view_id,
      name: typeof i.name === "string" && i.name.length > 0 ? i.name : i.view_id,
      description: typeof i.description === "string" ? i.description : "",
      kind: i.view_kind,
      source: i.source as ViewSource,
      presentation,
      created_by: actor_id,
      created_by_kind: actor_kind,
      definition_version: nextVersion,
    };

    // Construct once before persistence so View aggregate invariants guard
    // what will later be loaded by applyDefinitionOverlay().
    viewFromPneumaViewEntry(entry);

    const current = await readCurrentDefinitionOverlay(storage);
    await history.append({
      app_id: ctx.app_id,
      history_type: "snapshot",
      payload: createDefinitionOverlaySnapshot(
        current.pneuma_tables,
        current.pneuma_table_columns,
        current.pneuma_operations,
        [...current.pneuma_views, entry],
        current.pneuma_policy_rules,
      ),
      is_ai_generated: actor_kind === "agent",
      actor_id,
      actor_kind,
      description: `Added view '${i.view_id}'`,
      operation_scope: [`view:${i.view_id}`, `operation:${i.source.operation_id}`, "operation:add_view"],
    });

    await storage.saveRow(pneumaViewEntryToRow(entry));

    return { entry_id: entryId, definition_version: nextVersion, view_id: i.view_id };
  };
  (fn as { [FRAMEWORK_HANDLER_BRAND]?: true })[FRAMEWORK_HANDLER_BRAND] = true;
  return fn;
}

function normalizeAddViewPresentation(value: unknown): ReturnType<typeof normalizeViewPresentation> {
  if (value === undefined) return undefined;
  if (!isPlainRecord(value)) {
    throw new Error("add_view: input.presentation must be an object when provided");
  }
  try {
    return normalizeViewPresentation(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`add_view: invalid presentation: ${message}`);
  }
}

/**
 * Build the `add_policy_rule` Operation for a concrete app_id.
 *
 * P21 MVP records additive allow rules only. The framework writes a row to
 * `pneuma_policy_rules`; on restart the loader composes it into the same
 * PolicyEvaluator used by Operations, Views, and /api/config visibility.
 */
export function createAddPolicyRuleOp(app_id: string): Operation {
  const TEXT = { kind: "primitive", of: "Text" } as const;
  const JSON_T = { kind: "json" } as const;

  return new OperationClass({
    id: ADD_POLICY_RULE_OP_ID,
    app_id,
    name: "Add policy rule",
    description:
      "Framework-injected Operation. Declares a new additive PolicyRule by writing a row to pneuma_policy_rules. The PolicyRule becomes effective on the next bootAppRuntime — this call does NOT restart.",
    input: {
      type: "record",
      fields: {
        rule_id: { type: TEXT, required: true },
        allow: { type: JSON_T, required: true },
        actions: { type: JSON_T, required: true },
        resource: { type: JSON_T, required: true },
        when: { type: JSON_T },
      },
    },
    output: {
      kind: "object",
      schema: {
        type: "object",
        properties: {
          entry_id: { type: "string" },
          definition_version: { type: "number" },
          rule_id: { type: "string" },
        },
        required: ["entry_id", "definition_version", "rule_id"],
      },
    },
    affects: {
      mutations: [PNEUMA_POLICY_RULES_TABLE_ID],
      adapter_writes: [],
      reads_only: false,
      destructive: false,
    },
    handler: { kind: "code", ref: ADD_POLICY_RULE_HANDLER_REF },
    surface: FRAMEWORK_INTERNAL_SURFACE,
  });
}

export function createAddPolicyRuleHandler(): HandlerFn {
  const fn: HandlerFn = async ({ ctx, input, storage, services }) => {
    const history = (services?.history ?? undefined) as AppHistoryStore | undefined;
    if (!history) {
      throw new Error(
        "add_policy_rule: AppHistoryStore must be provided via services.history (framework runtime wires this)",
      );
    }
    const i = input as {
      rule_id?: unknown;
      allow?: unknown;
      actions?: unknown;
      resource?: unknown;
      when?: unknown;
    };

    const rule = policyRuleFromInput(ctx.app_id, i);
    const existing = await storage.listRowsByTable(PNEUMA_POLICY_RULES_TABLE_ID);
    const existingEntries = existing.map(rowToPneumaPolicyRuleEntry);
    for (const entry of existingEntries) {
      if (entry.rule_id === rule.id) {
        throw new Error(
          `add_policy_rule: rule "${rule.id}" already present in pneuma_policy_rules (entry ${entry.id})`,
        );
      }
    }

    const versions = existingEntries.map((entry) => entry.definition_version);
    const nextVersion = versions.length > 0 ? Math.max(...versions) + 1 : 1;
    const actor_id = ctx.user?.id ?? "anonymous";
    const actor_kind = actorKindFromInvokedVia(ctx.invoked_via);
    const entryId = newPolicyRuleEntryId();
    const entry: PneumaPolicyRuleEntry = {
      id: entryId,
      app_id: ctx.app_id,
      rule_id: rule.id,
      allow: rule.allow,
      do: rule.do,
      on: rule.on,
      when: rule.when,
      created_by: actor_id,
      created_by_kind: actor_kind,
      definition_version: nextVersion,
    };

    // Construct once before persistence so PolicySet invariants guard what
    // will later be loaded by applyDefinitionOverlay().
    policyRuleFromPneumaPolicyRuleEntry(entry);
    new PolicySet({ app_id: ctx.app_id, rules: [rule] });

    const current = await readCurrentDefinitionOverlay(storage);
    await history.append({
      app_id: ctx.app_id,
      history_type: "snapshot",
      payload: createDefinitionOverlaySnapshot(
        current.pneuma_tables,
        current.pneuma_table_columns,
        current.pneuma_operations,
        current.pneuma_views,
        [...current.pneuma_policy_rules, entry],
      ),
      is_ai_generated: actor_kind === "agent",
      actor_id,
      actor_kind,
      description: `Added policy rule '${rule.id}'`,
      operation_scope: [`policy_rule:${rule.id}`, "operation:add_policy_rule"],
    });

    await storage.saveRow(pneumaPolicyRuleEntryToRow(entry));

    return { entry_id: entryId, definition_version: nextVersion, rule_id: rule.id };
  };
  (fn as { [FRAMEWORK_HANDLER_BRAND]?: true })[FRAMEWORK_HANDLER_BRAND] = true;
  return fn;
}

/**
 * Build the non-destructive rollback validator Operation.
 *
 * It computes the exact overlay/data impact of restoring system-owned
 * definition rows to a target app_history version, but does not mutate rows,
 * history, or runtime state.
 */
export function createDefinitionRollbackValidateOp(app_id: string): Operation {
  const NUMBER = { kind: "primitive", of: "Number" } as const;

  return new OperationClass({
    id: DEFINITION_ROLLBACK_VALIDATE_OP_ID,
    app_id,
    name: "Validate definition rollback",
    description:
      "Framework-injected Operation. Computes the schema/data impact of rolling the app definition overlay back to a target app_history version. Non-destructive: no rows, definition entries, or history are changed.",
    input: {
      type: "record",
      fields: {
        target_history_version: { type: NUMBER, required: true },
      },
    },
    output: {
      kind: "object",
      schema: {
        type: "object",
        properties: {
          target_history_version: { type: "number" },
          current_history_version: { type: "number" },
          destructive: { type: "boolean" },
          requires_approval: { type: "boolean" },
          impact: { type: "object" },
          current_overlay: { type: "object" },
          target_overlay: { type: "object" },
          warnings: { type: "array", items: { type: "string" } },
        },
        required: [
          "target_history_version",
          "current_history_version",
          "destructive",
          "requires_approval",
          "impact",
          "current_overlay",
          "target_overlay",
          "warnings",
        ],
      },
    },
    affects: {
      mutations: [],
      adapter_writes: [],
      reads_only: true,
      destructive: false,
    },
    handler: { kind: "code", ref: DEFINITION_ROLLBACK_VALIDATE_HANDLER_REF },
    surface: FRAMEWORK_INTERNAL_SURFACE,
  });
}

export function createDefinitionRollbackValidateHandler(): HandlerFn {
  const fn: HandlerFn = async ({ ctx, input, storage, services }) => {
    return computeRollbackValidation(ctx, input, storage, services);
  };
  (fn as { [FRAMEWORK_HANDLER_BRAND]?: true })[FRAMEWORK_HANDLER_BRAND] = true;
  return fn;
}

/**
 * Build the destructive definition rollback executor.
 *
 * Supports rollback of removed overlay Tables, overlay columns, query-backed
 * overlay Operations, Operation-backed Views, and PolicyRules. It writes a
 * pre-rollback backup entry into app_history, deletes rows in removed Tables,
 * clears removed-column cells on retained Tables, deletes the corresponding
 * system-owned definition rows, and appends a post-rollback definition overlay
 * snapshot.
 *
 * Restore/forward cases are still rejected before mutation.
 */
export function createDefinitionRollbackExecuteOp(app_id: string): Operation {
  const NUMBER = { kind: "primitive", of: "Number" } as const;

  return new OperationClass({
    id: DEFINITION_ROLLBACK_EXECUTE_OP_ID,
    app_id,
    name: "Execute definition rollback",
    description:
      "Framework-injected Operation. Executes the destructive definition rollback slice after approval. Supports removed Tables, removed columns, removed query-backed Operations, removed Operation-backed Views, and removed PolicyRules; restored definitions are rejected before mutation.",
    input: {
      type: "record",
      fields: {
        target_history_version: { type: NUMBER, required: true },
      },
    },
    output: {
      kind: "object",
      schema: {
        type: "object",
        properties: {
          status: { type: "string" },
          target_history_version: { type: "number" },
          previous_history_version: { type: "number" },
          backup_history_version: { type: "number" },
          rollback_history_version: { type: "number" },
          deleted_rows: { type: "array" },
          cleaned_columns: { type: "array" },
          deleted_definition_rows: { type: "object" },
          impact: { type: "object" },
          restart_required: { type: "boolean" },
        },
        required: [
          "status",
          "target_history_version",
          "previous_history_version",
          "backup_history_version",
          "rollback_history_version",
          "deleted_rows",
          "cleaned_columns",
          "deleted_definition_rows",
          "impact",
          "restart_required",
        ],
      },
    },
    affects: {
      mutations: [
        PNEUMA_TABLES_TABLE_ID,
        PNEUMA_TABLE_COLUMNS_TABLE_ID,
        PNEUMA_OPERATIONS_TABLE_ID,
        PNEUMA_VIEWS_TABLE_ID,
        PNEUMA_POLICY_RULES_TABLE_ID,
      ],
      adapter_writes: [],
      reads_only: false,
      destructive: true,
    },
    handler: { kind: "code", ref: DEFINITION_ROLLBACK_EXECUTE_HANDLER_REF },
    surface: FRAMEWORK_INTERNAL_SURFACE,
    impact: {
      compute: { kind: "code", ref: DEFINITION_ROLLBACK_EXECUTE_IMPACT_REF },
      disclosure_template: "Definition rollback will delete app data. Review the impact before confirming.",
    },
  });
}

export function createDefinitionRollbackExecuteImpact(): ImpactComputeFn {
  const fn: ImpactComputeFn = async ({ ctx, input, storage, services }) => {
    const validation = await computeRollbackValidation(ctx, input, storage, services);
    const impact = validation.impact;
    const tableCount = impact.removed_tables.length;
    const rowCount = impact.removed_tables.reduce((sum, table) => sum + table.row_count, 0);
    const columnCount = impact.removed_columns.length;
    const cellCount = impact.removed_columns.reduce((sum, column) => sum + column.affected_row_count, 0);
    const operationCount = impact.removed_operations.length;
    const viewCount = impact.removed_views.length;
    const policyRuleCount = impact.removed_policy_rules.length;
    const unsupported = unsupportedRollbackReason(impact);
    return {
      disclosure:
        unsupported
          ? `Rollback target is not executable by the current executor: ${unsupported}`
          : `Rollback to history version ${validation.target_history_version} will remove ${tableCount} Table(s), ${rowCount} row(s), ${columnCount} column(s), ${cellCount} cell value(s), ${operationCount} Operation(s), ${viewCount} View(s), and ${policyRuleCount} PolicyRule(s).`,
      details: validation as unknown as Record<string, unknown>,
    };
  };
  (fn as { [FRAMEWORK_HANDLER_BRAND]?: true })[FRAMEWORK_HANDLER_BRAND] = true;
  return fn;
}

export function createDefinitionRollbackExecuteHandler(): HandlerFn {
  const fn: HandlerFn = async ({ ctx, input, storage, services }) => {
    const history = (services?.history ?? undefined) as AppHistoryStore | undefined;
    if (!history) {
      throw new Error(
        "definition.rollback.execute: AppHistoryStore must be provided via services.history (framework runtime wires this)",
      );
    }

    const validation = await computeRollbackValidation(ctx, input, storage, services);
    const unsupported = unsupportedRollbackReason(validation.impact);
    if (unsupported) {
      throw new Error(`definition.rollback.execute: ${unsupported}`);
    }

    const current = await readCurrentDefinitionOverlay(storage);
    const targetOverlay = await reconstructDefinitionOverlayAt(
      history,
      ctx.app_id,
      validation.target_history_version,
    );
    const removedTableIds = validation.impact.removed_tables.map((table) => table.table_id);
    const removedOperationIds = validation.impact.removed_operations.map((operation) => operation.operation_id);
    const removedViewIds = validation.impact.removed_views.map((view) => view.view_id);
    const removedPolicyRuleIds = validation.impact.removed_policy_rules.map((rule) => rule.rule_id);
    await assertNoCascadeIntoRemovedTables(storage, removedTableIds);

    const rowsByTable: Array<{ table_id: string; rows: Row[] }> = [];
    for (const table_id of removedTableIds) {
      rowsByTable.push({ table_id, rows: await storage.listRowsByTable(table_id) });
    }
    const rowsByRemovedColumn = await rowsAffectedByRemovedColumns(storage, validation.impact.removed_columns);

    const backup = await history.append({
      app_id: ctx.app_id,
      history_type: "snapshot",
      payload: {
        kind: "definition_rollback_backup",
        target_history_version: validation.target_history_version,
        previous_history_version: validation.current_history_version,
        impact: validation.impact,
        pre_rollback_overlay: createDefinitionOverlaySnapshot(
          current.pneuma_tables,
          current.pneuma_table_columns,
          current.pneuma_operations,
          current.pneuma_views,
          current.pneuma_policy_rules,
        ),
        target_overlay: createDefinitionOverlaySnapshot(
          targetOverlay.pneuma_tables,
          targetOverlay.pneuma_table_columns,
          targetOverlay.pneuma_operations,
          targetOverlay.pneuma_views,
          targetOverlay.pneuma_policy_rules,
        ),
        affected_rows: rowsByTable.map(({ table_id, rows }) => ({
          table_id,
          rows: rows.map(serializeRowForBackup),
        })),
        affected_column_rows: rowsByRemovedColumn.map(({ table_id, column_name, rows }) => ({
          table_id,
          column_name,
          rows: rows.map(serializeRowForBackup),
        })),
      },
      is_ai_generated: ctx.invoked_via === "agent",
      actor_id: ctx.user?.id ?? "anonymous",
      actor_kind: actorKindFromInvokedVia(ctx.invoked_via),
      description: `pre-rollback backup before restoring definition overlay to history version ${validation.target_history_version}`,
      operation_scope: operationScopeForRollbackImpact(validation.impact),
    });

    const deletedRows: Array<{ table_id: string; row_ids: string[] }> = [];
    for (const { table_id, rows } of rowsByTable) {
      const row_ids: string[] = [];
      for (const row of rows) {
        const result = await storage.deleteRow(row.id);
        row_ids.push(...result.deleted);
      }
      deletedRows.push({ table_id, row_ids });
    }

    const cleanedColumns: Array<{ table_id: string; column_name: string; row_ids: string[] }> = [];
    for (const { table_id, column_name, rows } of rowsByRemovedColumn) {
      const row_ids: string[] = [];
      for (const row of rows) {
        if (!row.unsetCell(column_name)) continue;
        await storage.saveRowUnchecked(row);
        row_ids.push(row.id);
      }
      cleanedColumns.push({ table_id, column_name, row_ids });
    }

    const deletedTableDefinitionRows: string[] = [];
    for (const entry of current.pneuma_tables) {
      if (!removedTableIds.includes(entry.table_id)) continue;
      await storage.deleteRow(entry.id);
      deletedTableDefinitionRows.push(entry.id);
    }

    const deletedColumnDefinitionRows: string[] = [];
    const removedColumnKeys = new Set(validation.impact.removed_columns.map(columnKey));
    for (const entry of current.pneuma_table_columns) {
      if (!removedTableIds.includes(entry.table_id) && !removedColumnKeys.has(columnKey(entry))) continue;
      await storage.deleteRow(entry.id);
      deletedColumnDefinitionRows.push(entry.id);
    }

    const deletedOperationDefinitionRows: string[] = [];
    for (const entry of current.pneuma_operations) {
      if (!removedOperationIds.includes(entry.operation_id)) continue;
      await storage.deleteRow(entry.id);
      deletedOperationDefinitionRows.push(entry.id);
    }

    const deletedViewDefinitionRows: string[] = [];
    for (const entry of current.pneuma_views) {
      if (!removedViewIds.includes(entry.view_id)) continue;
      await storage.deleteRow(entry.id);
      deletedViewDefinitionRows.push(entry.id);
    }

    const deletedPolicyRuleDefinitionRows: string[] = [];
    for (const entry of current.pneuma_policy_rules) {
      if (!removedPolicyRuleIds.includes(entry.rule_id)) continue;
      await storage.deleteRow(entry.id);
      deletedPolicyRuleDefinitionRows.push(entry.id);
    }

    const rollback = await history.append({
      app_id: ctx.app_id,
      history_type: "snapshot",
      payload: createDefinitionOverlaySnapshot(
        targetOverlay.pneuma_tables,
        targetOverlay.pneuma_table_columns,
        targetOverlay.pneuma_operations,
        targetOverlay.pneuma_views,
        targetOverlay.pneuma_policy_rules,
      ),
      is_ai_generated: ctx.invoked_via === "agent",
      actor_id: ctx.user?.id ?? "anonymous",
      actor_kind: actorKindFromInvokedVia(ctx.invoked_via),
      description: `rolled back definition overlay to history version ${validation.target_history_version}`,
      operation_scope: operationScopeForRollbackImpact(validation.impact),
    });

    return {
      status:
        removedTableIds.length === 0
          && validation.impact.removed_columns.length === 0
          && removedOperationIds.length === 0
          && removedViewIds.length === 0
          && removedPolicyRuleIds.length === 0
          ? "noop"
          : "rolled_back",
      target_history_version: validation.target_history_version,
      previous_history_version: validation.current_history_version,
      backup_history_version: backup.version,
      rollback_history_version: rollback.version,
      deleted_rows: deletedRows,
      cleaned_columns: cleanedColumns,
      deleted_definition_rows: {
        pneuma_tables: deletedTableDefinitionRows,
        pneuma_table_columns: deletedColumnDefinitionRows,
        pneuma_operations: deletedOperationDefinitionRows,
        pneuma_views: deletedViewDefinitionRows,
        pneuma_policy_rules: deletedPolicyRuleDefinitionRows,
      },
      impact: validation.impact,
      restart_required: true,
    };
  };
  (fn as { [FRAMEWORK_HANDLER_BRAND]?: true })[FRAMEWORK_HANDLER_BRAND] = true;
  return fn;
}

function isFrameworkHandler(fn: HandlerFn): boolean {
  return (fn as { [FRAMEWORK_HANDLER_BRAND]?: true })[FRAMEWORK_HANDLER_BRAND] === true;
}

function isFrameworkImpact(fn: ImpactComputeFn): boolean {
  return (fn as { [FRAMEWORK_HANDLER_BRAND]?: true })[FRAMEWORK_HANDLER_BRAND] === true;
}

function actorKindFromInvokedVia(invoked_via: PermissionContext["invoked_via"]): ActorKind {
  // Map PermissionContext.invoked_via (five values) down to the three ActorKinds used by app_history.
  if (invoked_via === "agent") return "agent";
  if (invoked_via === "system") return "framework";
  // ui / cli / webhook / (default) → builder
  return "builder";
}

interface DefinitionOverlayState {
  readonly pneuma_tables: readonly PneumaTableEntry[];
  readonly pneuma_table_columns: readonly PneumaTableColumnEntry[];
  readonly pneuma_operations: readonly PneumaOperationEntry[];
  readonly pneuma_views: readonly PneumaViewEntry[];
  readonly pneuma_policy_rules: readonly PneumaPolicyRuleEntry[];
}

interface DefinitionOverlaySnapshotPayload {
  readonly kind: "definition_overlay_snapshot";
  readonly pneuma_tables: readonly unknown[];
  readonly pneuma_table_columns: readonly unknown[];
  readonly pneuma_operations: readonly unknown[];
  readonly pneuma_views: readonly unknown[];
  readonly pneuma_policy_rules: readonly unknown[];
}

interface RollbackImpact {
  readonly removed_tables: readonly RemovedTableImpact[];
  readonly removed_columns: readonly RemovedColumnImpact[];
  readonly removed_operations: readonly RemovedOperationImpact[];
  readonly removed_views: readonly RemovedViewImpact[];
  readonly removed_policy_rules: readonly RemovedPolicyRuleImpact[];
  readonly restored_tables: readonly RestoredTableImpact[];
  readonly restored_columns: readonly RestoredColumnImpact[];
  readonly restored_operations: readonly RestoredOperationImpact[];
  readonly restored_views: readonly RestoredViewImpact[];
  readonly restored_policy_rules: readonly RestoredPolicyRuleImpact[];
}

interface RollbackValidation {
  readonly target_history_version: number;
  readonly current_history_version: number;
  readonly destructive: boolean;
  readonly requires_approval: boolean;
  readonly impact: RollbackImpact;
  readonly current_overlay: ReturnType<typeof summarizeOverlay>;
  readonly target_overlay: ReturnType<typeof summarizeOverlay>;
  readonly warnings: readonly string[];
}

interface RemovedTableImpact {
  readonly table_id: string;
  readonly row_count: number;
  readonly columns: readonly string[];
}

interface RemovedColumnImpact {
  readonly table_id: string;
  readonly column_name: string;
  readonly affected_row_count: number;
}

interface RestoredTableImpact {
  readonly table_id: string;
  readonly columns: readonly string[];
}

interface RestoredColumnImpact {
  readonly table_id: string;
  readonly column_name: string;
}

interface RemovedOperationImpact {
  readonly operation_id: string;
  readonly handler_kind: string;
}

interface RestoredOperationImpact {
  readonly operation_id: string;
  readonly handler_kind: string;
}

interface RemovedViewImpact {
  readonly view_id: string;
  readonly source_operation_id: string;
}

interface RestoredViewImpact {
  readonly view_id: string;
  readonly source_operation_id: string;
}

interface RemovedPolicyRuleImpact {
  readonly rule_id: string;
  readonly resource: unknown;
}

interface RestoredPolicyRuleImpact {
  readonly rule_id: string;
  readonly resource: unknown;
}

function createDefinitionOverlaySnapshot(
  pneuma_tables: readonly PneumaTableEntry[],
  pneuma_table_columns: readonly PneumaTableColumnEntry[],
  pneuma_operations: readonly PneumaOperationEntry[] = [],
  pneuma_views: readonly PneumaViewEntry[] = [],
  pneuma_policy_rules: readonly PneumaPolicyRuleEntry[] = [],
): DefinitionOverlaySnapshotPayload {
  return {
    kind: "definition_overlay_snapshot",
    pneuma_tables: pneuma_tables.map(serializeEntryForSnapshot),
    pneuma_table_columns: pneuma_table_columns.map(serializeEntryForSnapshot),
    pneuma_operations: pneuma_operations.map(serializeEntryForSnapshot),
    pneuma_views: pneuma_views.map(serializeEntryForSnapshot),
    pneuma_policy_rules: pneuma_policy_rules.map(serializeEntryForSnapshot),
  };
}

async function readCurrentDefinitionOverlay(storage: OperationHandlerStorage): Promise<DefinitionOverlayState> {
  const [tableRows, columnRows, operationRows, viewRows, policyRuleRows] = await Promise.all([
    storage.listRowsByTable(PNEUMA_TABLES_TABLE_ID),
    storage.listRowsByTable(PNEUMA_TABLE_COLUMNS_TABLE_ID),
    storage.listRowsByTable(PNEUMA_OPERATIONS_TABLE_ID),
    storage.listRowsByTable(PNEUMA_VIEWS_TABLE_ID),
    storage.listRowsByTable(PNEUMA_POLICY_RULES_TABLE_ID),
  ]);
  return {
    pneuma_tables: tableRows.map(rowToPneumaTableEntry),
    pneuma_table_columns: columnRows.map(rowToPneumaTableColumnEntry),
    pneuma_operations: operationRows.map(rowToPneumaOperationEntry),
    pneuma_views: viewRows.map(rowToPneumaViewEntry),
    pneuma_policy_rules: policyRuleRows.map(rowToPneumaPolicyRuleEntry),
  };
}

async function computeRollbackValidation(
  ctx: PermissionContext,
  input: unknown,
  storage: OperationHandlerStorage,
  services: { history?: unknown } | undefined,
): Promise<RollbackValidation> {
  const history = (services?.history ?? undefined) as AppHistoryStore | undefined;
  if (!history) {
    throw new Error(
      "definition.rollback.validate: AppHistoryStore must be provided via services.history (framework runtime wires this)",
    );
  }
  const target = targetHistoryVersion(input);
  const currentVersion = (await history.latestVersion(ctx.app_id)) ?? 0;
  if (target > currentVersion) {
    throw new Error(
      `definition.rollback.validate: target_history_version ${target} is newer than current history version ${currentVersion}`,
    );
  }
  if (target > 0 && !(await history.getByVersion(ctx.app_id, target))) {
    throw new Error(
      `definition.rollback.validate: target_history_version ${target} does not exist in app_history`,
    );
  }

  const current = await readCurrentDefinitionOverlay(storage);
  const targetOverlay = await reconstructDefinitionOverlayAt(history, ctx.app_id, target);
  const impact = await computeRollbackImpact(storage, current, targetOverlay);
  const destructive = impact.removed_tables.length > 0 || impact.removed_columns.length > 0;
  const operationChanges = impact.removed_operations.length > 0 || impact.restored_operations.length > 0;
  const viewChanges = impact.removed_views.length > 0 || impact.restored_views.length > 0;
  const policyChanges = impact.removed_policy_rules.length > 0 || impact.restored_policy_rules.length > 0;
  const warnings: string[] = [];
  if (target === 0) {
    warnings.push("target_history_version=0 means the baseline before any definition overlay history entry");
  }

  return {
    target_history_version: target,
    current_history_version: currentVersion,
    destructive,
    requires_approval: destructive || operationChanges || viewChanges || policyChanges,
    impact,
    current_overlay: summarizeOverlay(current),
    target_overlay: summarizeOverlay(targetOverlay),
    warnings,
  };
}

async function reconstructDefinitionOverlayAt(
  history: AppHistoryStore,
  app_id: string,
  target_history_version: number,
): Promise<DefinitionOverlayState> {
  if (target_history_version === 0) {
    return { pneuma_tables: [], pneuma_table_columns: [], pneuma_operations: [], pneuma_views: [], pneuma_policy_rules: [] };
  }

  let pneuma_tables: readonly PneumaTableEntry[] = [];
  let pneuma_table_columns: readonly PneumaTableColumnEntry[] = [];
  let pneuma_operations: readonly PneumaOperationEntry[] = [];
  let pneuma_views: readonly PneumaViewEntry[] = [];
  let pneuma_policy_rules: readonly PneumaPolicyRuleEntry[] = [];
  const entries = (await history.listEntries(app_id, { direction: "asc" }))
    .filter((entry) => entry.version <= target_history_version);

  for (const entry of entries) {
    if (entry.history_type !== "snapshot") {
      throw new Error(
        `definition.rollback.validate: app_history delta entries are not supported yet (version ${entry.version})`,
      );
    }
    const payload = historyPayloadObject(entry);
    if (payload.kind === "definition_overlay_snapshot") {
      pneuma_tables = readPneumaTablesPayload(payload.pneuma_tables, entry);
      pneuma_table_columns = readPneumaTableColumnsPayload(payload.pneuma_table_columns, entry);
      pneuma_operations = Array.isArray(payload.pneuma_operations)
        ? readPneumaOperationsPayload(payload.pneuma_operations, entry)
        : [];
      pneuma_views = Array.isArray(payload.pneuma_views)
        ? readPneumaViewsPayload(payload.pneuma_views, entry)
        : [];
      pneuma_policy_rules = Array.isArray(payload.pneuma_policy_rules)
        ? readPneumaPolicyRulesPayload(payload.pneuma_policy_rules, entry)
        : [];
      continue;
    }
    // Back-compat for P1-P4 legacy snapshots. Each source advances
    // independently; missing source snapshots imply an empty overlay.
    if (payload.kind === "pneuma_tables_snapshot") {
      pneuma_tables = readPneumaTablesPayload(payload.rows, entry);
      continue;
    }
    if (payload.kind === "pneuma_table_columns_snapshot") {
      pneuma_table_columns = readPneumaTableColumnsPayload(payload.rows, entry);
    }
  }

  return { pneuma_tables, pneuma_table_columns, pneuma_operations, pneuma_views, pneuma_policy_rules };
}

async function computeRollbackImpact(
  storage: OperationHandlerStorage,
  current: DefinitionOverlayState,
  target: DefinitionOverlayState,
): Promise<RollbackImpact> {
  const currentTables = new Map(current.pneuma_tables.map((entry) => [entry.table_id, entry]));
  const targetTables = new Map(target.pneuma_tables.map((entry) => [entry.table_id, entry]));
  const removedTableIds = [...currentTables.keys()].filter((table_id) => !targetTables.has(table_id));
  const removedTableIdSet = new Set(removedTableIds);
  const removed_tables: RemovedTableImpact[] = [];
  for (const table_id of removedTableIds) {
    const entry = currentTables.get(table_id)!;
    const rows = await storage.listRowsByTable(table_id);
    removed_tables.push({
      table_id,
      row_count: rows.length,
      columns: entry.columns.map((c) => c.name),
    });
  }

  const currentColumns = new Map(current.pneuma_table_columns.map((entry) => [columnKey(entry), entry]));
  const targetColumns = new Map(target.pneuma_table_columns.map((entry) => [columnKey(entry), entry]));
  const removed_columns: RemovedColumnImpact[] = [];
  for (const [key, entry] of currentColumns) {
    if (targetColumns.has(key)) continue;
    if (removedTableIdSet.has(entry.table_id)) continue;
    const rows = await storage.listRowsByTable(entry.table_id);
    removed_columns.push({
      table_id: entry.table_id,
      column_name: entry.column_name,
      affected_row_count: rows.filter((row) => row.hasCell(entry.column_name)).length,
    });
  }

  const restored_tables: RestoredTableImpact[] = [];
  for (const [table_id, entry] of targetTables) {
    if (currentTables.has(table_id)) continue;
    restored_tables.push({
      table_id,
      columns: entry.columns.map((c) => c.name),
    });
  }

  const restored_columns: RestoredColumnImpact[] = [];
  for (const [key, entry] of targetColumns) {
    if (currentColumns.has(key)) continue;
    restored_columns.push({
      table_id: entry.table_id,
      column_name: entry.column_name,
    });
  }

  const currentOperations = new Map(current.pneuma_operations.map((entry) => [entry.operation_id, entry]));
  const targetOperations = new Map(target.pneuma_operations.map((entry) => [entry.operation_id, entry]));
  const removed_operations: RemovedOperationImpact[] = [];
  for (const [operation_id, entry] of currentOperations) {
    if (targetOperations.has(operation_id)) continue;
    removed_operations.push({ operation_id, handler_kind: entry.handler.kind });
  }
  const restored_operations: RestoredOperationImpact[] = [];
  for (const [operation_id, entry] of targetOperations) {
    if (currentOperations.has(operation_id)) continue;
    restored_operations.push({ operation_id, handler_kind: entry.handler.kind });
  }

  const currentViews = new Map(current.pneuma_views.map((entry) => [entry.view_id, entry]));
  const targetViews = new Map(target.pneuma_views.map((entry) => [entry.view_id, entry]));
  const removed_views: RemovedViewImpact[] = [];
  for (const [view_id, entry] of currentViews) {
    if (targetViews.has(view_id)) continue;
    removed_views.push({
      view_id,
      source_operation_id: entry.source.operation_id,
    });
  }
  const restored_views: RestoredViewImpact[] = [];
  for (const [view_id, entry] of targetViews) {
    if (currentViews.has(view_id)) continue;
    restored_views.push({
      view_id,
      source_operation_id: entry.source.operation_id,
    });
  }

  const currentPolicyRules = new Map(current.pneuma_policy_rules.map((entry) => [entry.rule_id, entry]));
  const targetPolicyRules = new Map(target.pneuma_policy_rules.map((entry) => [entry.rule_id, entry]));
  const removed_policy_rules: RemovedPolicyRuleImpact[] = [];
  for (const [rule_id, entry] of currentPolicyRules) {
    if (targetPolicyRules.has(rule_id)) continue;
    removed_policy_rules.push({ rule_id, resource: entry.on });
  }
  const restored_policy_rules: RestoredPolicyRuleImpact[] = [];
  for (const [rule_id, entry] of targetPolicyRules) {
    if (currentPolicyRules.has(rule_id)) continue;
    restored_policy_rules.push({ rule_id, resource: entry.on });
  }

  return {
    removed_tables,
    removed_columns,
    removed_operations,
    removed_views,
    removed_policy_rules,
    restored_tables,
    restored_columns,
    restored_operations,
    restored_views,
    restored_policy_rules,
  };
}

function unsupportedRollbackReason(impact: RollbackImpact): string | undefined {
  if (impact.removed_operations.some((operation) => operation.handler_kind !== "query")) {
    return "removed non-query operation rollback is not supported by the current executor";
  }
  if (impact.restored_tables.length > 0) {
    return "restored table rollback is not supported by the current executor";
  }
  if (impact.restored_columns.length > 0) {
    return "restored column rollback is not supported by the current executor";
  }
  if (impact.restored_operations.length > 0) {
    return "restored operation rollback is not supported by the current executor";
  }
  if (impact.restored_views.length > 0) {
    return "restored view rollback is not supported by the current executor";
  }
  if (impact.restored_policy_rules.length > 0) {
    return "restored policy rule rollback is not supported by the current executor";
  }
  return undefined;
}

async function rowsAffectedByRemovedColumns(
  storage: OperationHandlerStorage,
  removedColumns: readonly RemovedColumnImpact[],
): Promise<Array<{ table_id: string; column_name: string; rows: Row[] }>> {
  const out: Array<{ table_id: string; column_name: string; rows: Row[] }> = [];
  for (const column of removedColumns) {
    const rows = (await storage.listRowsByTable(column.table_id))
      .filter((row) => row.hasCell(column.column_name));
    out.push({
      table_id: column.table_id,
      column_name: column.column_name,
      rows,
    });
  }
  return out;
}

async function assertNoCascadeIntoRemovedTables(
  storage: OperationHandlerStorage,
  removedTableIds: readonly string[],
): Promise<void> {
  if (removedTableIds.length === 0) return;
  const removed = new Set(removedTableIds);
  const tables = await storage.listTables();
  for (const table of tables) {
    for (const column of table.columns) {
      if (!column.cascade_on_target_delete) continue;
      if (column.type.kind !== "ref-row" && column.type.kind !== "ref-row-list") continue;
      if (!removed.has(column.type.table)) continue;
      throw new Error(
        `definition.rollback.execute: table '${table.id}' has cascade column '${column.name}' targeting removed table '${column.type.table}', which is not disclosed by the P10 executor`,
      );
    }
  }
}

function serializeRowForBackup(row: Row): Record<string, unknown> {
  return {
    id: row.id,
    table_id: row.table_id,
    app_id: row.app_id,
    cells: Object.fromEntries(row.cells),
    created_at: row.created_at,
    updated_at: row.updated_at,
    owner_id: row.owner_id,
  };
}

function operationScopeForRollbackImpact(impact: RollbackImpact): string[] {
  return [
    `operation:${DEFINITION_ROLLBACK_EXECUTE_OP_ID}`,
    ...impact.removed_tables.map((table) => `table:${table.table_id}`),
    ...impact.removed_columns.map((column) => `column:${column.table_id}.${column.column_name}`),
    ...impact.removed_operations.map((operation) => `operation:${operation.operation_id}`),
    ...impact.removed_views.map((view) => `view:${view.view_id}`),
    ...impact.removed_policy_rules.map((rule) => `policy_rule:${rule.rule_id}`),
    ...impact.restored_tables.map((table) => `table:${table.table_id}`),
    ...impact.restored_columns.map((column) => `column:${column.table_id}.${column.column_name}`),
    ...impact.restored_operations.map((operation) => `operation:${operation.operation_id}`),
    ...impact.restored_views.map((view) => `view:${view.view_id}`),
    ...impact.restored_policy_rules.map((rule) => `policy_rule:${rule.rule_id}`),
  ];
}

function summarizeOverlay(state: DefinitionOverlayState): Record<string, unknown> {
  return {
    pneuma_tables_count: state.pneuma_tables.length,
    pneuma_table_columns_count: state.pneuma_table_columns.length,
    pneuma_operations_count: state.pneuma_operations.length,
    pneuma_views_count: state.pneuma_views.length,
    pneuma_policy_rules_count: state.pneuma_policy_rules.length,
    pneuma_tables: state.pneuma_tables.map((entry) => ({
      table_id: entry.table_id,
      columns: entry.columns.map((c) => c.name),
      definition_version: entry.definition_version,
    })),
    pneuma_table_columns: state.pneuma_table_columns.map((entry) => ({
      table_id: entry.table_id,
      column_name: entry.column_name,
      definition_version: entry.definition_version,
    })),
    pneuma_operations: state.pneuma_operations.map((entry) => ({
      operation_id: entry.operation_id,
      handler_kind: entry.handler.kind,
      definition_version: entry.definition_version,
    })),
    pneuma_views: state.pneuma_views.map((entry) => ({
      view_id: entry.view_id,
      kind: entry.kind,
      source_operation_id: entry.source.operation_id,
      definition_version: entry.definition_version,
    })),
    pneuma_policy_rules: state.pneuma_policy_rules.map((entry) => ({
      rule_id: entry.rule_id,
      resource: entry.on,
      actions: entry.do,
      definition_version: entry.definition_version,
    })),
  };
}

function targetHistoryVersion(input: unknown): number {
  const i = asObject(input, "definition.rollback.validate input");
  const raw = i.target_history_version;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
    throw new Error(
      "definition.rollback.validate: input.target_history_version must be a non-negative integer",
    );
  }
  return raw;
}

function historyPayloadObject(entry: AppHistoryEntry): Record<string, unknown> {
  return asObject(entry.payload, `app_history payload at version ${entry.version}`);
}

function readPneumaTablesPayload(raw: unknown, entry: AppHistoryEntry): PneumaTableEntry[] {
  if (!Array.isArray(raw)) {
    throw new Error(`definition.rollback.validate: pneuma_tables payload at version ${entry.version} must be an array`);
  }
  return raw.map((value, index) => pneumaTableEntryFromSnapshot(value, entry, index));
}

function readPneumaTableColumnsPayload(raw: unknown, entry: AppHistoryEntry): PneumaTableColumnEntry[] {
  if (!Array.isArray(raw)) {
    throw new Error(`definition.rollback.validate: pneuma_table_columns payload at version ${entry.version} must be an array`);
  }
  return raw.map((value, index) => pneumaTableColumnEntryFromSnapshot(value, entry, index));
}

function readPneumaOperationsPayload(raw: unknown, entry: AppHistoryEntry): PneumaOperationEntry[] {
  if (!Array.isArray(raw)) {
    throw new Error(`definition.rollback.validate: pneuma_operations payload at version ${entry.version} must be an array`);
  }
  return raw.map((value, index) => pneumaOperationEntryFromSnapshot(value, entry, index));
}

function readPneumaViewsPayload(raw: unknown, entry: AppHistoryEntry): PneumaViewEntry[] {
  if (!Array.isArray(raw)) {
    throw new Error(`definition.rollback.validate: pneuma_views payload at version ${entry.version} must be an array`);
  }
  return raw.map((value, index) => pneumaViewEntryFromSnapshot(value, entry, index));
}

function readPneumaPolicyRulesPayload(raw: unknown, entry: AppHistoryEntry): PneumaPolicyRuleEntry[] {
  if (!Array.isArray(raw)) {
    throw new Error(`definition.rollback.validate: pneuma_policy_rules payload at version ${entry.version} must be an array`);
  }
  return raw.map((value, index) => pneumaPolicyRuleEntryFromSnapshot(value, entry, index));
}

function pneumaTableEntryFromSnapshot(
  raw: unknown,
  historyEntry: AppHistoryEntry,
  index: number,
): PneumaTableEntry {
  const entry = asObject(raw, `pneuma_tables[${index}] at history version ${historyEntry.version}`);
  const id = requiredString(entry.id, "id");
  const app_id = requiredString(entry.app_id, "app_id");
  const table_id = requiredString(entry.table_id, "table_id");
  if (!isTableSource(entry.source)) {
    throw new Error(`definition.rollback.validate: invalid source for pneuma_tables[${index}]`);
  }
  if (!Array.isArray(entry.columns) || !entry.columns.every(isColumn)) {
    throw new Error(`definition.rollback.validate: invalid columns for pneuma_tables[${index}]`);
  }
  if (typeof entry.system_owned !== "boolean") {
    throw new Error(`definition.rollback.validate: invalid system_owned for pneuma_tables[${index}]`);
  }
  const created_by = requiredString(entry.created_by, "created_by");
  const created_by_kind = actorKind(entry.created_by_kind, `pneuma_tables[${index}].created_by_kind`);
  const definition_version = requiredNumber(entry.definition_version, "definition_version");
  return {
    id,
    app_id,
    table_id,
    source: entry.source,
    columns: entry.columns,
    system_owned: entry.system_owned,
    created_by,
    created_by_kind,
    definition_version,
  };
}

function pneumaTableColumnEntryFromSnapshot(
  raw: unknown,
  historyEntry: AppHistoryEntry,
  index: number,
): PneumaTableColumnEntry {
  const entry = asObject(raw, `pneuma_table_columns[${index}] at history version ${historyEntry.version}`);
  const id = requiredString(entry.id, "id");
  const app_id = requiredString(entry.app_id, "app_id");
  const table_id = requiredString(entry.table_id, "table_id");
  const column_name = requiredString(entry.column_name, "column_name");
  if (!isCellType(entry.cell_type)) {
    throw new Error(`definition.rollback.validate: invalid cell_type for pneuma_table_columns[${index}]`);
  }
  if (typeof entry.nullable !== "boolean") {
    throw new Error(`definition.rollback.validate: invalid nullable for pneuma_table_columns[${index}]`);
  }
  const created_by = requiredString(entry.created_by, "created_by");
  const created_by_kind = actorKind(entry.created_by_kind, `pneuma_table_columns[${index}].created_by_kind`);
  const definition_version = requiredNumber(entry.definition_version, "definition_version");
  return {
    id,
    app_id,
    table_id,
    column_name,
    cell_type: entry.cell_type,
    nullable: entry.nullable,
    default_value: entry.default_value,
    created_by,
    created_by_kind,
    definition_version,
  };
}

function pneumaOperationEntryFromSnapshot(
  raw: unknown,
  historyEntry: AppHistoryEntry,
  index: number,
): PneumaOperationEntry {
  const entry = asObject(raw, `pneuma_operations[${index}] at history version ${historyEntry.version}`);
  const id = requiredString(entry.id, "id");
  const app_id = requiredString(entry.app_id, "app_id");
  const operation_id = requiredString(entry.operation_id, "operation_id");
  const name = requiredString(entry.name, "name");
  const description = typeof entry.description === "string" ? entry.description : "";
  const input = normalizeInputSchema(entry.input);
  const handler = normalizeQueryHandler(entry.handler);
  const output = normalizeOperationOutput(entry.output, handler.on);
  const affects = normalizeReadOnlyAffects(entry.affects);
  const surface = normalizeOperationSurface(
    entry.surface === undefined ? undefined : entry.surface as OperationSurfaceInit,
    affects,
  );
  const created_by = requiredString(entry.created_by, "created_by");
  const created_by_kind = actorKind(entry.created_by_kind, `pneuma_operations[${index}].created_by_kind`);
  const definition_version = requiredNumber(entry.definition_version, "definition_version");
  return {
    id,
    app_id,
    operation_id,
    name,
    description,
    input,
    output,
    affects,
    handler,
    ui_binding: entry.ui_binding === undefined ? undefined : entry.ui_binding as UIBinding,
    agent_tool: entry.agent_tool === undefined ? undefined : entry.agent_tool as AgentToolConfig,
    surface,
    created_by,
    created_by_kind,
    definition_version,
  };
}

function pneumaViewEntryFromSnapshot(
  raw: unknown,
  historyEntry: AppHistoryEntry,
  index: number,
): PneumaViewEntry {
  const entry = asObject(raw, `pneuma_views[${index}] at history version ${historyEntry.version}`);
  const id = requiredString(entry.id, "id");
  const app_id = requiredString(entry.app_id, "app_id");
  const view_id = requiredString(entry.view_id, "view_id");
  const name = requiredString(entry.name, "name");
  const description = typeof entry.description === "string" ? entry.description : "";
  if (!isViewKind(entry.kind)) {
    throw new Error(`definition.rollback.validate: invalid kind for pneuma_views[${index}]`);
  }
  if (!isViewSource(entry.source)) {
    throw new Error(`definition.rollback.validate: invalid source for pneuma_views[${index}]`);
  }
  if (entry.presentation !== undefined && entry.presentation !== null && !isPlainRecord(entry.presentation)) {
    throw new Error(`definition.rollback.validate: invalid presentation for pneuma_views[${index}]`);
  }
  const created_by = requiredString(entry.created_by, "created_by");
  const created_by_kind = actorKind(entry.created_by_kind, `pneuma_views[${index}].created_by_kind`);
  const definition_version = requiredNumber(entry.definition_version, "definition_version");
  return {
    id,
    app_id,
    view_id,
    name,
    description,
    kind: entry.kind,
    source: entry.source,
    presentation: entry.presentation === null ? undefined : entry.presentation as Record<string, unknown> | undefined,
    created_by,
    created_by_kind,
    definition_version,
  };
}

function pneumaPolicyRuleEntryFromSnapshot(
  raw: unknown,
  historyEntry: AppHistoryEntry,
  index: number,
): PneumaPolicyRuleEntry {
  const entry = asObject(raw, `pneuma_policy_rules[${index}] at history version ${historyEntry.version}`);
  const id = requiredString(entry.id, "id");
  const app_id = requiredString(entry.app_id, "app_id");
  const rule_id = requiredString(entry.rule_id, "rule_id");
  const created_by = requiredString(entry.created_by, "created_by");
  const created_by_kind = actorKind(entry.created_by_kind, `pneuma_policy_rules[${index}].created_by_kind`);
  const definition_version = requiredNumber(entry.definition_version, "definition_version");
  const row = new Row({
    id,
    app_id,
    table_id: PNEUMA_POLICY_RULES_TABLE_ID,
    cells: {
      rule_id,
      allow: entry.allow,
      actions: entry.do,
      resource: entry.on,
      when: entry.when ?? null,
      created_by,
      created_by_kind,
      definition_version,
    },
  });
  return rowToPneumaPolicyRuleEntry(row);
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`definition.rollback.validate: ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`definition.rollback.validate: ${label} must be a non-empty string`);
  }
  return value;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`definition.rollback.validate: ${label} must be a finite number`);
  }
  return value;
}

function actorKind(value: unknown, label: string): ActorKind {
  if (value === "builder" || value === "agent" || value === "framework") return value;
  throw new Error(`definition.rollback.validate: ${label} must be builder, agent, or framework`);
}

function normalizeInputSchema(value: unknown): InputSchema {
  if (value === undefined) return { type: "record", fields: {} };
  const schema = asObject(value, "input schema");
  if (schema.type !== "record") {
    throw new Error("add_operation: input.type must be 'record'");
  }
  const rawFields = schema.fields ?? {};
  if (typeof rawFields !== "object" || rawFields === null || Array.isArray(rawFields)) {
    throw new Error("add_operation: input.fields must be an object");
  }
  const fields: Record<string, InputSchema["fields"][string]> = {};
  for (const [name, rawField] of Object.entries(rawFields)) {
    const field = asObject(rawField, `input.fields.${name}`);
    if (!isCellType(field.type)) {
      throw new Error(`add_operation: input field '${name}' must declare a valid CellType`);
    }
    fields[name] = {
      type: field.type,
      required: field.required === true ? true : undefined,
      default: field.default,
    };
  }
  return { type: "record", fields };
}

function normalizeQueryHandler(value: unknown): QueryBody {
  const handler = asObject(value, "operation handler");
  if (handler.kind !== "query") {
    throw new Error("add_operation: P12 only supports handler.kind='query'");
  }
  const on = requiredString(handler.on, "handler.on");
  const pagination = handler.pagination === undefined
    ? { kind: "offset" as const, size: 50 }
    : normalizePagination(handler.pagination);
  const fields = handler.fields === undefined ? undefined : stringArray(handler.fields, "handler.fields");
  const sort = handler.sort === undefined ? undefined : normalizeSort(handler.sort);
  if (handler.filter !== undefined && !isWhereClause(handler.filter)) {
    throw new Error("add_operation: handler.filter must be a valid WhereClause");
  }
  const query: {
    kind: "query";
    on: string;
    filter?: QueryBody["filter"];
    sort?: QueryBody["sort"];
    fields?: readonly string[];
    pagination: QueryBody["pagination"];
    cache_ttl?: number;
  } = { kind: "query", on, pagination };
  if (handler.filter !== undefined) query.filter = handler.filter;
  if (sort !== undefined) query.sort = sort;
  if (fields !== undefined) query.fields = fields;
  if (typeof handler.cache_ttl === "number") query.cache_ttl = handler.cache_ttl;
  return query;
}

function normalizePagination(value: unknown): QueryBody["pagination"] {
  const pagination = asObject(value, "handler.pagination");
  if (pagination.kind !== "offset" && pagination.kind !== "cursor") {
    throw new Error("add_operation: handler.pagination.kind must be 'offset' or 'cursor'");
  }
  if (!Number.isInteger(pagination.size) || typeof pagination.size !== "number" || pagination.size <= 0) {
    throw new Error("add_operation: handler.pagination.size must be a positive integer");
  }
  return { kind: pagination.kind, size: pagination.size };
}

function normalizeSort(value: unknown): QueryBody["sort"] {
  if (!Array.isArray(value)) throw new Error("add_operation: handler.sort must be an array");
  return value.map((raw, index) => {
    const sort = asObject(raw, `handler.sort[${index}]`);
    const column = requiredString(sort.column, "handler.sort.column");
    if (sort.dir !== "asc" && sort.dir !== "desc") {
      throw new Error("add_operation: handler.sort.dir must be 'asc' or 'desc'");
    }
    return { column, dir: sort.dir };
  });
}

function normalizeOperationOutput(value: unknown, rowType: string): OperationOutput {
  if (value === undefined) return { kind: "row-list", row_type: rowType };
  if (isCellType(value)) return value;
  const output = asObject(value, "operation output");
  if (output.kind === "void") return { kind: "void" };
  if (output.kind === "row-list") {
    return { kind: "row-list", row_type: requiredString(output.row_type, "output.row_type") };
  }
  if (output.kind === "derived-list") return { kind: "derived-list", item_schema: output.item_schema ?? {} };
  if (output.kind === "graph") {
    return { kind: "graph", node_schema: output.node_schema, edge_schema: output.edge_schema };
  }
  if (output.kind === "object") return { kind: "object", schema: output.schema ?? {} };
  throw new Error("add_operation: unsupported output kind");
}

function normalizeReadOnlyAffects(value: unknown): {
  readonly mutations: readonly string[];
  readonly adapter_writes: readonly string[];
  readonly reads_only: boolean;
  readonly destructive: boolean;
} {
  if (value === undefined) {
    return { mutations: [], adapter_writes: [], reads_only: true, destructive: false };
  }
  const affects = asObject(value, "operation affects");
  const mutations = stringArray(affects.mutations ?? [], "affects.mutations");
  const adapter_writes = stringArray(affects.adapter_writes ?? [], "affects.adapter_writes");
  if (affects.reads_only !== true || affects.destructive === true || mutations.length > 0 || adapter_writes.length > 0) {
    throw new Error("add_operation: P12 operations must be reads_only query operations without writes");
  }
  return { mutations, adapter_writes, reads_only: true, destructive: false };
}

function policyRuleFromInput(app_id: string, input: {
  rule_id?: unknown;
  allow?: unknown;
  actions?: unknown;
  resource?: unknown;
  when?: unknown;
}): PolicyRule {
  if (typeof input.rule_id !== "string" || input.rule_id.length === 0) {
    throw new Error("add_policy_rule: input.rule_id must be a non-empty string");
  }
  if (!Array.isArray(input.allow)) {
    throw new Error("add_policy_rule: input.allow must be an array");
  }
  if (!Array.isArray(input.actions)) {
    throw new Error("add_policy_rule: input.actions must be an array");
  }
  if (!isPlainRecord(input.resource)) {
    throw new Error("add_policy_rule: input.resource must be an object");
  }
  if (input.when !== undefined && input.when !== null && !isWhereClause(input.when)) {
    throw new Error("add_policy_rule: input.when must be a valid WhereClause");
  }

  const rule: PolicyRule = {
    id: input.rule_id,
    allow: input.allow as PolicyRule["allow"],
    do: input.actions as PolicyRule["do"],
    on: input.resource as PolicyRule["on"],
    ...(input.when !== undefined && input.when !== null ? { when: input.when } : {}),
  };
  try {
    new PolicySet({ app_id, rules: [rule] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`add_policy_rule: invalid policy rule: ${message}`);
  }
  return rule;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`add_operation: ${label} must be an array of strings`);
  }
  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function columnKey(entry: Pick<PneumaTableColumnEntry, "table_id" | "column_name">): string {
  return `${entry.table_id}.${entry.column_name}`;
}

function serializeEntryForSnapshot(
  e: PneumaTableColumnEntry | PneumaTableEntry | PneumaOperationEntry | PneumaViewEntry | PneumaPolicyRuleEntry,
): unknown {
  // Snapshot payload rows are lightly serialized; keep structure the same as the entry itself.
  return { ...e };
}

function validateTableDeclaration(app_id: string, table_id: string, columns: readonly Column[]): readonly Column[] {
  // Reuse Table aggregate invariants for column names / CellType / reserved fields.
  const table = new Table({
    id: table_id,
    app_id,
    source: { kind: "stored" },
    columns: [...columns],
  });
  return table.columns;
}

function newTableEntryId(): string {
  return `pt-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

function newEntryId(): string {
  return `ptc-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

function newOperationEntryId(): string {
  return `po-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

function newViewEntryId(): string {
  return `pv-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

function newPolicyRuleEntryId(): string {
  return `ppr-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Merge framework-provided Tables, Operations, handlers, and policy rules
 * into a user-supplied AppConfig. Idempotent — calling twice yields the
 * same effective config.
 *
 * Injections:
 *   - Table `pneuma_tables` (system-owned, stored)
 *   - Table `pneuma_table_columns` (system-owned, stored)
 *   - Table `pneuma_operations` (system-owned, stored)
 *   - Table `pneuma_views` (system-owned, stored)
 *   - Table `pneuma_policy_rules` (system-owned, stored)
 *   - Operation `add_table`
 *   - Operation `add_table_column`
 *   - Operation `add_operation`
 *   - Operation `add_view`
 *   - Operation `add_policy_rule`
 *   - Operation `definition.rollback.validate`
 *   - Handler `framework://add_table`
 *   - Handler `framework://add_table_column`
 *   - Handler `framework://add_operation`
 *   - Handler `framework://add_policy_rule`
 *   - Handler `framework://definition.rollback.validate`
 *   - PolicyRule allowing anyone (including anonymous) to invoke
 *     framework definition operations (MVP — later phases will tighten once
 *     proper Builder attribution lands)
 *
 * Merge semantics:
 *   - Tables / Operations: additive. Caller's entry preserved if id collides.
 *   - Handlers: the framework-reserved key (`framework://...`) MUST NOT be
 *     in caller's `handlers`; collision throws. All other handler keys pass
 *     through unchanged.
 *   - Policy rules: additive (only injected if no rule already targets the
 *     framework operation id).
 */
export function applyFrameworkInjections(config: AppConfig): AppConfig {
  // Tables
  const tables = [...config.tables];
  if (!tables.some((t) => t.id === PNEUMA_TABLES_TABLE_ID)) {
    tables.push(createPneumaTablesTable(config.app_id));
  }
  if (!tables.some((t) => t.id === PNEUMA_TABLE_COLUMNS_TABLE_ID)) {
    tables.push(createPneumaTableColumnsTable(config.app_id));
  }
  if (!tables.some((t) => t.id === PNEUMA_OPERATIONS_TABLE_ID)) {
    tables.push(createPneumaOperationsTable(config.app_id));
  }
  if (!tables.some((t) => t.id === PNEUMA_VIEWS_TABLE_ID)) {
    tables.push(createPneumaViewsTable(config.app_id));
  }
  if (!tables.some((t) => t.id === PNEUMA_POLICY_RULES_TABLE_ID)) {
    tables.push(createPneumaPolicyRulesTable(config.app_id));
  }

  // Operations
  const operations = [...config.operations];
  if (!operations.some((o) => o.id === ADD_TABLE_OP_ID)) {
    operations.push(createAddTableOp(config.app_id));
  }
  if (!operations.some((o) => o.id === ADD_TABLE_COLUMN_OP_ID)) {
    operations.push(createAddTableColumnOp(config.app_id));
  }
  if (!operations.some((o) => o.id === ADD_OPERATION_OP_ID)) {
    operations.push(createAddOperationOp(config.app_id));
  }
  if (!operations.some((o) => o.id === ADD_VIEW_OP_ID)) {
    operations.push(createAddViewOp(config.app_id));
  }
  if (!operations.some((o) => o.id === ADD_POLICY_RULE_OP_ID)) {
    operations.push(createAddPolicyRuleOp(config.app_id));
  }
  if (!operations.some((o) => o.id === DEFINITION_ROLLBACK_VALIDATE_OP_ID)) {
    operations.push(createDefinitionRollbackValidateOp(config.app_id));
  }
  if (!operations.some((o) => o.id === DEFINITION_ROLLBACK_EXECUTE_OP_ID)) {
    operations.push(createDefinitionRollbackExecuteOp(config.app_id));
  }

  // Handlers — the framework-reserved key is exclusive; a template providing
  // a handler there is almost certainly a bug, so fail loud rather than silently
  // overwrite. Re-invocation by the framework itself stays idempotent: the
  // previously-injected handler is branded, so we recognize and replace it.
  const existingAddTableHandler = config.handlers[ADD_TABLE_HANDLER_REF];
  if (existingAddTableHandler !== undefined && !isFrameworkHandler(existingAddTableHandler)) {
    throw new Error(
      `applyFrameworkInjections: handler key '${ADD_TABLE_HANDLER_REF}' is reserved by the framework; templates may not provide a handler at this key.`,
    );
  }
  const existingAddTableColumnHandler = config.handlers[ADD_TABLE_COLUMN_HANDLER_REF];
  if (existingAddTableColumnHandler !== undefined && !isFrameworkHandler(existingAddTableColumnHandler)) {
    throw new Error(
      `applyFrameworkInjections: handler key '${ADD_TABLE_COLUMN_HANDLER_REF}' is reserved by the framework; templates may not provide a handler at this key.`,
    );
  }
  const existingRollbackValidateHandler = config.handlers[DEFINITION_ROLLBACK_VALIDATE_HANDLER_REF];
  if (existingRollbackValidateHandler !== undefined && !isFrameworkHandler(existingRollbackValidateHandler)) {
    throw new Error(
      `applyFrameworkInjections: handler key '${DEFINITION_ROLLBACK_VALIDATE_HANDLER_REF}' is reserved by the framework; templates may not provide a handler at this key.`,
    );
  }
  const existingAddOperationHandler = config.handlers[ADD_OPERATION_HANDLER_REF];
  if (existingAddOperationHandler !== undefined && !isFrameworkHandler(existingAddOperationHandler)) {
    throw new Error(
      `applyFrameworkInjections: handler key '${ADD_OPERATION_HANDLER_REF}' is reserved by the framework; templates may not provide a handler at this key.`,
    );
  }
  const existingAddViewHandler = config.handlers[ADD_VIEW_HANDLER_REF];
  if (existingAddViewHandler !== undefined && !isFrameworkHandler(existingAddViewHandler)) {
    throw new Error(
      `applyFrameworkInjections: handler key '${ADD_VIEW_HANDLER_REF}' is reserved by the framework; templates may not provide a handler at this key.`,
    );
  }
  const existingAddPolicyRuleHandler = config.handlers[ADD_POLICY_RULE_HANDLER_REF];
  if (existingAddPolicyRuleHandler !== undefined && !isFrameworkHandler(existingAddPolicyRuleHandler)) {
    throw new Error(
      `applyFrameworkInjections: handler key '${ADD_POLICY_RULE_HANDLER_REF}' is reserved by the framework; templates may not provide a handler at this key.`,
    );
  }
  const existingRollbackExecuteHandler = config.handlers[DEFINITION_ROLLBACK_EXECUTE_HANDLER_REF];
  if (existingRollbackExecuteHandler !== undefined && !isFrameworkHandler(existingRollbackExecuteHandler)) {
    throw new Error(
      `applyFrameworkInjections: handler key '${DEFINITION_ROLLBACK_EXECUTE_HANDLER_REF}' is reserved by the framework; templates may not provide a handler at this key.`,
    );
  }
  const handlers = {
    ...config.handlers,
    [ADD_TABLE_HANDLER_REF]: createAddTableHandler(),
    [ADD_TABLE_COLUMN_HANDLER_REF]: createAddTableColumnHandler(),
    [ADD_OPERATION_HANDLER_REF]: createAddOperationHandler(),
    [ADD_VIEW_HANDLER_REF]: createAddViewHandler(),
    [ADD_POLICY_RULE_HANDLER_REF]: createAddPolicyRuleHandler(),
    [DEFINITION_ROLLBACK_VALIDATE_HANDLER_REF]: createDefinitionRollbackValidateHandler(),
    [DEFINITION_ROLLBACK_EXECUTE_HANDLER_REF]: createDefinitionRollbackExecuteHandler(),
  };

  const existingRollbackExecuteImpact = config.impacts?.[DEFINITION_ROLLBACK_EXECUTE_IMPACT_REF];
  if (existingRollbackExecuteImpact !== undefined && !isFrameworkImpact(existingRollbackExecuteImpact)) {
    throw new Error(
      `applyFrameworkInjections: impact key '${DEFINITION_ROLLBACK_EXECUTE_IMPACT_REF}' is reserved by the framework; templates may not provide an impact compute at this key.`,
    );
  }
  const impacts = {
    ...(config.impacts ?? {}),
    [DEFINITION_ROLLBACK_EXECUTE_IMPACT_REF]: createDefinitionRollbackExecuteImpact(),
  };

  // Policy rule (idempotent — only add if missing). Always returns a fresh
  // PolicySet so the caller's input is never mutated, matching the spread-copy
  // semantics used for tables / operations / handlers above.
  const policy = cloneWithFrameworkRules(config.policy);

  return {
    ...config,
    tables,
    operations,
    handlers,
    impacts,
    policy,
  };
}

function cloneWithFrameworkRules(policy: PolicySet): PolicySet {
  const clone = new PolicySet({
    app_id: policy.app_id,
    rules: [...policy.rules],
    default_posture: policy.default_posture,
  });
  for (const opId of [
    ADD_TABLE_OP_ID,
    ADD_TABLE_COLUMN_OP_ID,
    ADD_OPERATION_OP_ID,
    ADD_VIEW_OP_ID,
    ADD_POLICY_RULE_OP_ID,
    DEFINITION_ROLLBACK_VALIDATE_OP_ID,
  ]) {
    const hasRule = clone.rules.some(
      (r) => r.on.kind === "operation" && r.on.id === opId,
    );
    if (!hasRule) {
      clone.addRule({
        id: `framework-allow-${opId}`,
        allow: [Subjects.anyone(), Subjects.anonymous()],
        do: ["invoke"],
        on: Resources.operation(opId),
      });
    }
  }
  if (!clone.rules.some((r) => r.on.kind === "operation" && r.on.id === DEFINITION_ROLLBACK_EXECUTE_OP_ID)) {
    clone.addRule({
      id: `framework-allow-${DEFINITION_ROLLBACK_EXECUTE_OP_ID}`,
      allow: [Subjects.user("framework")],
      do: ["invoke"],
      on: Resources.operation(DEFINITION_ROLLBACK_EXECUTE_OP_ID),
    });
  }
  return clone;
}
