// pneuma_table_columns — system-owned Table holding Builder-authored column additions.
// Each row represents one "add this column to this existing stored Table" declaration.
// Follows the IdentityRegistry precedent of narrow many-table definition storage.
//
// Mirrors the P1 §Design Decisions in the plan:
// - narrow (one row per column addition), not a JSON-blob generic entry
// - system_owned so `addColumn` on itself is locked
// - definition_version monotonically increasing per target table_id

import { Table } from "../aggregates/table.js";
import { Row } from "../aggregates/row.js";
import type { CellType } from "../value-objects/cell-type.js";
import type { ActorKind } from "./app-history.js";

export const PNEUMA_TABLE_COLUMNS_TABLE_ID = "pneuma_table_columns";

const TEXT: CellType = { kind: "primitive", of: "Text" };
const NUMBER: CellType = { kind: "primitive", of: "Number" };
const BOOL: CellType = { kind: "primitive", of: "Bool" };
const JSON_T: CellType = { kind: "json" };

/**
 * Construct the system-owned `pneuma_table_columns` Table for the given app_id.
 *
 * Columns:
 *   - table_id            (Text)   : which base Table this column targets
 *   - column_name         (Text)   : the new column's name
 *   - cell_type           (json)   : serialized CellType (e.g. { kind: "primitive", of: "Text" })
 *   - nullable            (Bool)   : whether the new column is nullable
 *   - default_value       (json?)  : optional default (null if absent)
 *   - created_by          (Text)   : actor_id from PermissionContext
 *   - created_by_kind     (Text)   : "builder" | "agent" | "framework" (actor_kind)
 *   - definition_version  (Number) : monotonically increasing per-target-table version
 */
export function createPneumaTableColumnsTable(app_id: string): Table {
  return new Table({
    id: PNEUMA_TABLE_COLUMNS_TABLE_ID,
    app_id,
    system_owned: true,
    source: { kind: "stored" },
    columns: [
      { name: "table_id", type: TEXT },
      { name: "column_name", type: TEXT },
      { name: "cell_type", type: JSON_T },
      { name: "nullable", type: BOOL },
      { name: "default_value", type: JSON_T, nullable: true },
      { name: "created_by", type: TEXT },
      { name: "created_by_kind", type: TEXT },
      { name: "definition_version", type: NUMBER },
    ],
  });
}

/**
 * Domain-facing entry shape for one row of `pneuma_table_columns`.
 * Stored as a Row under that Table; this struct is the decoded form.
 */
export interface PneumaTableColumnEntry {
  readonly id: string;
  readonly app_id: string;
  readonly table_id: string;
  readonly column_name: string;
  readonly cell_type: CellType;
  readonly nullable: boolean;
  /** Undefined when not declared. Encoded as null in the Row cell. */
  readonly default_value?: unknown;
  readonly created_by: string;
  readonly created_by_kind: ActorKind;
  readonly definition_version: number;
}

/** Convert a decoded entry to a Row for persistence via StorageService.saveRow. */
export function pneumaTableColumnEntryToRow(entry: PneumaTableColumnEntry): Row {
  return new Row({
    id: entry.id,
    table_id: PNEUMA_TABLE_COLUMNS_TABLE_ID,
    app_id: entry.app_id,
    cells: {
      table_id: entry.table_id,
      column_name: entry.column_name,
      cell_type: entry.cell_type as unknown,
      nullable: entry.nullable,
      // Null is valid for the `default_value` json cell (Table declares nullable: true).
      default_value: entry.default_value ?? null,
      created_by: entry.created_by,
      created_by_kind: entry.created_by_kind,
      definition_version: entry.definition_version,
    },
  });
}

/**
 * Decode a Row back into the domain entry. Throws if the Row is not for
 * `pneuma_table_columns` or required cells are missing / malformed.
 */
export function rowToPneumaTableColumnEntry(row: Row): PneumaTableColumnEntry {
  if (row.table_id !== PNEUMA_TABLE_COLUMNS_TABLE_ID) {
    throw new Error(
      `rowToPneumaTableColumnEntry: row.table_id is '${row.table_id}', expected '${PNEUMA_TABLE_COLUMNS_TABLE_ID}'`,
    );
  }
  const table_id = row.getCell("table_id");
  const column_name = row.getCell("column_name");
  const cell_type = row.getCell("cell_type");
  const nullable = row.getCell("nullable");
  const default_value = row.getCell("default_value");
  const created_by = row.getCell("created_by");
  const created_by_kind = row.getCell("created_by_kind");
  const definition_version = row.getCell("definition_version");

  if (typeof table_id !== "string" || typeof column_name !== "string") {
    throw new Error(`rowToPneumaTableColumnEntry: missing table_id/column_name on row ${row.id}`);
  }
  if (typeof nullable !== "boolean") {
    throw new Error(`rowToPneumaTableColumnEntry: nullable must be boolean on row ${row.id}`);
  }
  if (typeof definition_version !== "number") {
    throw new Error(`rowToPneumaTableColumnEntry: definition_version must be number on row ${row.id}`);
  }
  if (typeof created_by !== "string" || typeof created_by_kind !== "string") {
    throw new Error(`rowToPneumaTableColumnEntry: created_by fields missing on row ${row.id}`);
  }

  return {
    id: row.id,
    app_id: row.app_id,
    table_id,
    column_name,
    cell_type: cell_type as CellType,
    nullable,
    default_value: default_value === null ? undefined : default_value,
    created_by,
    created_by_kind: created_by_kind as ActorKind,
    definition_version,
  };
}
