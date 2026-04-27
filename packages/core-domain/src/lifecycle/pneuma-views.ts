// pneuma_views — system-owned Table holding Builder-authored View additions.
// Each row represents one "show this Operation-backed View in the app" declaration.

import { Row } from "../aggregates/row.js";
import { Table } from "../aggregates/table.js";
import {
  View,
  isViewKind,
  isViewSource,
  normalizeViewPresentation,
  type ViewKind,
  type ViewPresentation,
  type ViewSource,
} from "../aggregates/view.js";
import type { CellType } from "../value-objects/cell-type.js";
import type { ActorKind } from "./app-history.js";

export const PNEUMA_VIEWS_TABLE_ID = "pneuma_views";

const TEXT: CellType = { kind: "primitive", of: "Text" };
const NUMBER: CellType = { kind: "primitive", of: "Number" };
const JSON_T: CellType = { kind: "json" };

export function createPneumaViewsTable(app_id: string): Table {
  return new Table({
    id: PNEUMA_VIEWS_TABLE_ID,
    app_id,
    system_owned: true,
    source: { kind: "stored" },
    columns: [
      { name: "view_id", type: TEXT },
      { name: "name", type: TEXT },
      { name: "description", type: TEXT },
      { name: "kind", type: TEXT },
      { name: "source", type: JSON_T },
      { name: "presentation", type: JSON_T, nullable: true },
      { name: "created_by", type: TEXT },
      { name: "created_by_kind", type: TEXT },
      { name: "definition_version", type: NUMBER },
    ],
  });
}

export interface PneumaViewEntry {
  readonly id: string;
  readonly app_id: string;
  readonly view_id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: ViewKind;
  readonly source: ViewSource;
  readonly presentation?: ViewPresentation;
  readonly created_by: string;
  readonly created_by_kind: ActorKind;
  readonly definition_version: number;
}

export function pneumaViewEntryToRow(entry: PneumaViewEntry): Row {
  return new Row({
    id: entry.id,
    table_id: PNEUMA_VIEWS_TABLE_ID,
    app_id: entry.app_id,
    cells: {
      view_id: entry.view_id,
      name: entry.name,
      description: entry.description,
      kind: entry.kind,
      source: entry.source,
      presentation: entry.presentation ?? null,
      created_by: entry.created_by,
      created_by_kind: entry.created_by_kind,
      definition_version: entry.definition_version,
    },
  });
}

export function rowToPneumaViewEntry(row: Row): PneumaViewEntry {
  if (row.table_id !== PNEUMA_VIEWS_TABLE_ID) {
    throw new Error(
      `rowToPneumaViewEntry: row.table_id is '${row.table_id}', expected '${PNEUMA_VIEWS_TABLE_ID}'`,
    );
  }

  const view_id = row.getCell("view_id");
  const name = row.getCell("name");
  const description = row.getCell("description");
  const kind = row.getCell("kind");
  const source = row.getCell("source");
  const presentation = row.getCell("presentation");
  const created_by = row.getCell("created_by");
  const created_by_kind = row.getCell("created_by_kind");
  const definition_version = row.getCell("definition_version");

  if (typeof view_id !== "string" || view_id.length === 0) {
    throw new Error(`rowToPneumaViewEntry: missing view_id on row ${row.id}`);
  }
  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`rowToPneumaViewEntry: missing name on row ${row.id}`);
  }
  if (typeof description !== "string") {
    throw new Error(`rowToPneumaViewEntry: description must be string on row ${row.id}`);
  }
  if (!isViewKind(kind)) {
    throw new Error(`rowToPneumaViewEntry: invalid kind on row ${row.id}`);
  }
  if (!isViewSource(source)) {
    throw new Error(`rowToPneumaViewEntry: invalid source on row ${row.id}`);
  }
  const normalizedPresentation = presentation === null
    ? undefined
    : normalizeRowPresentation(presentation, row.id);
  if (typeof definition_version !== "number") {
    throw new Error(`rowToPneumaViewEntry: definition_version must be number on row ${row.id}`);
  }
  if (typeof created_by !== "string" || typeof created_by_kind !== "string") {
    throw new Error(`rowToPneumaViewEntry: created_by fields missing on row ${row.id}`);
  }

  return {
    id: row.id,
    app_id: row.app_id,
    view_id,
    name,
    description,
    kind,
    source,
    presentation: normalizedPresentation,
    created_by,
    created_by_kind: created_by_kind as ActorKind,
    definition_version,
  };
}

export function viewFromPneumaViewEntry(entry: PneumaViewEntry): View {
  return new View({
    id: entry.view_id,
    app_id: entry.app_id,
    name: entry.name,
    description: entry.description,
    kind: entry.kind,
    source: entry.source,
    presentation: entry.presentation,
  });
}

function normalizeRowPresentation(value: unknown, rowId: string): ViewPresentation {
  if (!isRecord(value)) {
    throw new Error(`rowToPneumaViewEntry: presentation must be object or null on row ${rowId}`);
  }
  try {
    return normalizeViewPresentation(value) ?? {};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`rowToPneumaViewEntry: invalid presentation on row ${rowId}: ${message}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
