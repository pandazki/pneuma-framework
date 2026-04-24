// pneuma_table_columns — system-owned Table holding Builder-authored column additions.
// Each row represents one "add this column to this existing stored Table" declaration.
// Follows the IdentityRegistry precedent of narrow many-table definition storage.
//
// Mirrors the P1 §Design Decisions in the plan:
// - narrow (one row per column addition), not a JSON-blob generic entry
// - system_owned so `addColumn` on itself is locked
// - definition_version monotonically increasing per target table_id

import { Table } from "../aggregates/table.js";
import type { CellType } from "../value-objects/cell-type.js";

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
