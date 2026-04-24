// definition-loader.ts — reads pneuma_table_columns rows and applies them to base Tables.
//
// Runs once at bootAppRuntime, after the AppRuntime constructor finishes (so the
// framework Table pneuma_table_columns is already in runtime.tables + rows
// repository reflects the SQLite file). Calls Table.addColumn on each matching
// base Table so downstream HTTP / handler / QueryExecutor paths see the
// extended schema.

import {
  PNEUMA_TABLE_COLUMNS_TABLE_ID,
  rowToPneumaTableColumnEntry,
  type CellType,
} from "@pneuma-framework/core-domain";
import type { AppRuntime } from "./runtime.js";

export async function applyDefinitionOverlay(runtime: AppRuntime): Promise<void> {
  const rows = await runtime.storage.listRowsByTable(PNEUMA_TABLE_COLUMNS_TABLE_ID);
  for (const row of rows) {
    let entry;
    try {
      entry = rowToPneumaTableColumnEntry(row);
    } catch (err) {
      process.stderr.write(
        `[definition-loader] skipping malformed pneuma_table_columns row ${row.id}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      continue;
    }
    const target = await runtime.tables.get(entry.table_id);
    if (!target) {
      process.stderr.write(
        `[definition-loader] skipping overlay entry ${entry.id}: target table '${entry.table_id}' not registered in AppConfig.tables\n`,
      );
      continue;
    }
    if (target.source.kind !== "stored") {
      process.stderr.write(
        `[definition-loader] skipping overlay entry ${entry.id}: target table '${entry.table_id}' is not stored (source=${target.source.kind})\n`,
      );
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
      process.stderr.write(
        `[definition-loader] failed to apply overlay entry ${entry.id} (${entry.table_id}.${entry.column_name}): ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
}
