// definition-loader.ts — reads framework-owned definition rows and applies them to base Tables.
//
// Runs once at bootAppRuntime, after the AppRuntime constructor finishes (so the
// framework definition Tables are already in runtime.tables + rows repository
// reflects the SQLite file). First registers newly-declared Tables from
// pneuma_tables, then applies column additions from pneuma_table_columns.

import {
  PNEUMA_TABLES_TABLE_ID,
  PNEUMA_TABLE_COLUMNS_TABLE_ID,
  PNEUMA_OPERATIONS_TABLE_ID,
  PNEUMA_VIEWS_TABLE_ID,
  Table,
  buildRootContext,
  operationFromPneumaOperationEntry,
  rowToPneumaTableEntry,
  rowToPneumaTableColumnEntry,
  rowToPneumaOperationEntry,
  rowToPneumaViewEntry,
  viewFromPneumaViewEntry,
  operationCanBackView,
  type CellType,
} from "@pneuma-framework/core-domain";
import type { AppRuntime } from "./runtime.js";

export type DefinitionOverlayWarningCode =
  | "malformed_table_row"
  | "table_apply_failed"
  | "malformed_column_row"
  | "missing_target_table"
  | "non_stored_target_table"
  | "column_apply_failed"
  | "malformed_operation_row"
  | "operation_apply_failed"
  | "malformed_view_row"
  | "missing_view_operation"
  | "framework_view_operation"
  | "non_read_view_operation"
  | "non_mountable_view_operation"
  | "view_apply_failed";

export interface DefinitionOverlayWarning {
  readonly code: DefinitionOverlayWarningCode;
  readonly source:
    | typeof PNEUMA_TABLES_TABLE_ID
    | typeof PNEUMA_TABLE_COLUMNS_TABLE_ID
    | typeof PNEUMA_OPERATIONS_TABLE_ID
    | typeof PNEUMA_VIEWS_TABLE_ID;
  readonly row_id: string;
  readonly table_id?: string;
  readonly column_name?: string;
  readonly message: string;
  readonly ts: number;
}

export async function applyDefinitionOverlay(runtime: AppRuntime): Promise<void> {
  await applyTableDeclarations(runtime);
  await applyColumnDeclarations(runtime);
  await applyOperationDeclarations(runtime);
  await applyViewDeclarations(runtime);
}

async function applyTableDeclarations(runtime: AppRuntime): Promise<void> {
  const rows = await runtime.storage.listRowsByTable(PNEUMA_TABLES_TABLE_ID);
  for (const row of rows) {
    let entry;
    try {
      entry = rowToPneumaTableEntry(row);
    } catch (err) {
      recordOverlayWarning(runtime, {
        code: "malformed_table_row",
        source: PNEUMA_TABLES_TABLE_ID,
        row_id: row.id,
        message: `skipping malformed pneuma_tables row ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    const existing = await runtime.tables.get(entry.table_id);
    if (existing) {
      // Idempotent: AppConfig-declared tables win; duplicate overlay rows are skipped.
      continue;
    }
    try {
      await runtime.tables.save(new Table({
        id: entry.table_id,
        app_id: entry.app_id,
        source: entry.source,
        columns: [...entry.columns],
        system_owned: entry.system_owned,
      }));
    } catch (err) {
      recordOverlayWarning(runtime, {
        code: "table_apply_failed",
        source: PNEUMA_TABLES_TABLE_ID,
        row_id: entry.id,
        table_id: entry.table_id,
        message: `failed to apply table entry ${entry.id} (${entry.table_id}): ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}

async function applyColumnDeclarations(runtime: AppRuntime): Promise<void> {
  const rows = await runtime.storage.listRowsByTable(PNEUMA_TABLE_COLUMNS_TABLE_ID);
  for (const row of rows) {
    let entry;
    try {
      entry = rowToPneumaTableColumnEntry(row);
    } catch (err) {
      recordOverlayWarning(runtime, {
        code: "malformed_column_row",
        source: PNEUMA_TABLE_COLUMNS_TABLE_ID,
        row_id: row.id,
        message: `skipping malformed pneuma_table_columns row ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    const target = await runtime.tables.get(entry.table_id);
    if (!target) {
      recordOverlayWarning(runtime, {
        code: "missing_target_table",
        source: PNEUMA_TABLE_COLUMNS_TABLE_ID,
        row_id: entry.id,
        table_id: entry.table_id,
        column_name: entry.column_name,
        message: `skipping overlay entry ${entry.id}: target table '${entry.table_id}' not registered in AppConfig.tables`,
      });
      continue;
    }
    if (target.source.kind !== "stored") {
      recordOverlayWarning(runtime, {
        code: "non_stored_target_table",
        source: PNEUMA_TABLE_COLUMNS_TABLE_ID,
        row_id: entry.id,
        table_id: entry.table_id,
        column_name: entry.column_name,
        message: `skipping overlay entry ${entry.id}: target table '${entry.table_id}' is not stored (source=${target.source.kind})`,
      });
      continue;
    }
    if (target.hasColumn(entry.column_name)) {
      // Idempotent: already-applied overlay on restart is a no-op.
      continue;
    }
    try {
      target.addColumn({
        name: entry.column_name,
        type: entry.cell_type as CellType,
        nullable: entry.nullable,
      });
    } catch (err) {
      recordOverlayWarning(runtime, {
        code: "column_apply_failed",
        source: PNEUMA_TABLE_COLUMNS_TABLE_ID,
        row_id: entry.id,
        table_id: entry.table_id,
        column_name: entry.column_name,
        message: `failed to apply overlay entry ${entry.id} (${entry.table_id}.${entry.column_name}): ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}

async function applyOperationDeclarations(runtime: AppRuntime): Promise<void> {
  const rows = await runtime.storage.listRowsByTable(PNEUMA_OPERATIONS_TABLE_ID);
  for (const row of rows) {
    let entry;
    try {
      entry = rowToPneumaOperationEntry(row);
    } catch (err) {
      recordOverlayWarning(runtime, {
        code: "malformed_operation_row",
        source: PNEUMA_OPERATIONS_TABLE_ID,
        row_id: row.id,
        message: `skipping malformed pneuma_operations row ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    if (runtime.getOperation(entry.operation_id)) {
      // Idempotent: AppConfig/framework-declared operations win.
      continue;
    }
    try {
      runtime.registerOperation(operationFromPneumaOperationEntry(entry));
    } catch (err) {
      recordOverlayWarning(runtime, {
        code: "operation_apply_failed",
        source: PNEUMA_OPERATIONS_TABLE_ID,
        row_id: entry.id,
        message: `failed to apply operation entry ${entry.id} (${entry.operation_id}): ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}

async function applyViewDeclarations(runtime: AppRuntime): Promise<void> {
  const rows = await runtime.storage.listRowsByTable(PNEUMA_VIEWS_TABLE_ID);
  for (const row of rows) {
    let entry;
    try {
      entry = rowToPneumaViewEntry(row);
    } catch (err) {
      recordOverlayWarning(runtime, {
        code: "malformed_view_row",
        source: PNEUMA_VIEWS_TABLE_ID,
        row_id: row.id,
        message: `skipping malformed pneuma_views row ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    if (runtime.getView(entry.view_id)) {
      // Idempotent: AppConfig-declared views win.
      continue;
    }
    const sourceOperation = runtime.getOperation(entry.source.operation_id);
    if (!sourceOperation) {
      recordOverlayWarning(runtime, {
        code: "missing_view_operation",
        source: PNEUMA_VIEWS_TABLE_ID,
        row_id: entry.id,
        message: `skipping view entry ${entry.id} (${entry.view_id}): source operation '${entry.source.operation_id}' is not registered`,
      });
      continue;
    }
    if (sourceOperation.surface.framework_internal) {
      recordOverlayWarning(runtime, {
        code: "framework_view_operation",
        source: PNEUMA_VIEWS_TABLE_ID,
        row_id: entry.id,
        message: `skipping view entry ${entry.id} (${entry.view_id}): source operation '${entry.source.operation_id}' is framework-internal`,
      });
      continue;
    }
    if (!sourceOperation.affects.reads_only) {
      recordOverlayWarning(runtime, {
        code: "non_read_view_operation",
        source: PNEUMA_VIEWS_TABLE_ID,
        row_id: entry.id,
        message: `skipping view entry ${entry.id} (${entry.view_id}): source operation '${entry.source.operation_id}' is not reads_only`,
      });
      continue;
    }
    if (!operationCanBackView(sourceOperation)) {
      recordOverlayWarning(runtime, {
        code: "non_mountable_view_operation",
        source: PNEUMA_VIEWS_TABLE_ID,
        row_id: entry.id,
        message: `skipping view entry ${entry.id} (${entry.view_id}): source operation '${entry.source.operation_id}' is not view_mountable`,
      });
      continue;
    }
    try {
      await runtime.registerView(viewFromPneumaViewEntry(entry));
    } catch (err) {
      recordOverlayWarning(runtime, {
        code: "view_apply_failed",
        source: PNEUMA_VIEWS_TABLE_ID,
        row_id: entry.id,
        message: `failed to apply view entry ${entry.id} (${entry.view_id}): ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}

function recordOverlayWarning(
  runtime: AppRuntime,
  warning: Omit<DefinitionOverlayWarning, "ts">,
): void {
  const full: DefinitionOverlayWarning = { ...warning, ts: Date.now() };
  runtime.recordOverlayWarning(full);
  process.stderr.write(`[definition-loader] ${full.message}\n`);
  void runtime.events.append({
    id: `evt-definition-overlay-${full.ts.toString(36)}-${crypto.randomUUID().slice(0, 8)}`,
    ts: full.ts,
    category: "lifecycle",
    ctx: buildRootContext({
      app_id: runtime.app_id,
      invoked_via: "system",
    }),
    trace_id: `definition-overlay:${full.source}:${full.row_id}`,
    payload: {
      kind: "definition-overlay.warning",
      warning: full,
    },
    audit: true,
    tags: ["definition-overlay", "warning", full.code],
  }).catch((err) => {
    process.stderr.write(
      `[definition-loader] failed to audit overlay warning ${full.row_id}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  });
}
