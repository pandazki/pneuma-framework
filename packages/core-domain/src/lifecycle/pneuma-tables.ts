// pneuma_tables — system-owned Table holding Builder-authored Table additions.
// Each row represents one "add this stored Table" declaration.

import { Table, type Column, type TableSource } from "../aggregates/table.js";
import { Row } from "../aggregates/row.js";
import { isCellType, type CellType } from "../value-objects/cell-type.js";
import type { ActorKind } from "./app-history.js";

export const PNEUMA_TABLES_TABLE_ID = "pneuma_tables";

const TEXT: CellType = { kind: "primitive", of: "Text" };
const NUMBER: CellType = { kind: "primitive", of: "Number" };
const BOOL: CellType = { kind: "primitive", of: "Bool" };
const JSON_T: CellType = { kind: "json" };

/**
 * Construct the system-owned `pneuma_tables` Table for the given app_id.
 *
 * Columns:
 *   - table_id            (Text)   : id of the Table being declared
 *   - source              (json)   : serialized TableSource (MVP accepts stored only)
 *   - columns             (json)   : serialized Column[]
 *   - system_owned        (Bool)   : whether the declared table is framework-owned
 *   - created_by          (Text)   : actor_id from PermissionContext
 *   - created_by_kind     (Text)   : "builder" | "agent" | "framework" (actor_kind)
 *   - definition_version  (Number) : monotonically increasing for app-level table declarations
 */
export function createPneumaTablesTable(app_id: string): Table {
  return new Table({
    id: PNEUMA_TABLES_TABLE_ID,
    app_id,
    system_owned: true,
    source: { kind: "stored" },
    columns: [
      { name: "table_id", type: TEXT },
      { name: "source", type: JSON_T },
      { name: "columns", type: JSON_T },
      { name: "system_owned", type: BOOL },
      { name: "created_by", type: TEXT },
      { name: "created_by_kind", type: TEXT },
      { name: "definition_version", type: NUMBER },
    ],
  });
}

export interface PneumaTableEntry {
  readonly id: string;
  readonly app_id: string;
  readonly table_id: string;
  readonly source: TableSource;
  readonly columns: readonly Column[];
  readonly system_owned: boolean;
  readonly created_by: string;
  readonly created_by_kind: ActorKind;
  readonly definition_version: number;
}

export function pneumaTableEntryToRow(entry: PneumaTableEntry): Row {
  return new Row({
    id: entry.id,
    table_id: PNEUMA_TABLES_TABLE_ID,
    app_id: entry.app_id,
    cells: {
      table_id: entry.table_id,
      source: serializeTableSource(entry.source),
      columns: entry.columns.map(serializeColumn),
      system_owned: entry.system_owned,
      created_by: entry.created_by,
      created_by_kind: entry.created_by_kind,
      definition_version: entry.definition_version,
    },
  });
}

export function rowToPneumaTableEntry(row: Row): PneumaTableEntry {
  if (row.table_id !== PNEUMA_TABLES_TABLE_ID) {
    throw new Error(
      `rowToPneumaTableEntry: row.table_id is '${row.table_id}', expected '${PNEUMA_TABLES_TABLE_ID}'`,
    );
  }
  const table_id = row.getCell("table_id");
  const source = row.getCell("source");
  const columns = row.getCell("columns");
  const system_owned = row.getCell("system_owned");
  const created_by = row.getCell("created_by");
  const created_by_kind = row.getCell("created_by_kind");
  const definition_version = row.getCell("definition_version");

  if (typeof table_id !== "string" || table_id.length === 0) {
    throw new Error(`rowToPneumaTableEntry: missing table_id on row ${row.id}`);
  }
  if (!isTableSource(source)) {
    throw new Error(`rowToPneumaTableEntry: invalid source on row ${row.id}`);
  }
  if (!Array.isArray(columns) || !columns.every(isColumn)) {
    throw new Error(`rowToPneumaTableEntry: invalid columns on row ${row.id}`);
  }
  if (typeof system_owned !== "boolean") {
    throw new Error(`rowToPneumaTableEntry: system_owned must be boolean on row ${row.id}`);
  }
  if (typeof definition_version !== "number") {
    throw new Error(`rowToPneumaTableEntry: definition_version must be number on row ${row.id}`);
  }
  if (typeof created_by !== "string" || typeof created_by_kind !== "string") {
    throw new Error(`rowToPneumaTableEntry: created_by fields missing on row ${row.id}`);
  }

  return {
    id: row.id,
    app_id: row.app_id,
    table_id,
    source,
    columns,
    system_owned,
    created_by,
    created_by_kind: created_by_kind as ActorKind,
    definition_version,
  };
}

export function isColumn(v: unknown): v is Column {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const c = v as Column;
  if (typeof c.name !== "string" || c.name.length === 0) return false;
  if (!isCellType(c.type)) return false;
  if (c.nullable !== undefined && typeof c.nullable !== "boolean") return false;
  if (
    c.default_access !== undefined &&
    c.default_access !== "public" &&
    c.default_access !== "restricted"
  ) return false;
  if (
    c.cascade_on_target_delete !== undefined &&
    typeof c.cascade_on_target_delete !== "boolean"
  ) return false;
  return true;
}

export function isTableSource(v: unknown): v is TableSource {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const source = v as { kind?: unknown };
  if (source.kind === "stored") return true;
  return false;
}

function serializeColumn(column: Column): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: column.name,
    type: column.type,
  };
  if (column.nullable !== undefined) out.nullable = column.nullable;
  if (column.default_access !== undefined) out.default_access = column.default_access;
  if (column.cascade_on_target_delete !== undefined) {
    out.cascade_on_target_delete = column.cascade_on_target_delete;
  }
  return out;
}

function serializeTableSource(source: TableSource): Record<string, unknown> {
  if (source.kind === "stored") return { kind: "stored" };
  return { ...source };
}
