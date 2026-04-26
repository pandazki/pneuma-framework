// pneuma_operations — system-owned Table holding Builder-authored Operation additions.
// P12 intentionally supports query-backed read Operations only. This proves
// Operation/tool surface mutation through the same system-owned row path without
// introducing arbitrary code handler upload/execution.

import {
  Operation,
  type AffectDeclaration,
  type AgentToolConfig,
  type HandlerRef,
  type InputSchema,
  type OperationOutput,
  type QueryBody,
  type UIBinding,
} from "../aggregates/operation.js";
import { Row } from "../aggregates/row.js";
import { Table } from "../aggregates/table.js";
import { isCellType, type CellType } from "../value-objects/cell-type.js";
import type { ActorKind } from "./app-history.js";

export const PNEUMA_OPERATIONS_TABLE_ID = "pneuma_operations";

const TEXT: CellType = { kind: "primitive", of: "Text" };
const NUMBER: CellType = { kind: "primitive", of: "Number" };
const JSON_T: CellType = { kind: "json" };

export function createPneumaOperationsTable(app_id: string): Table {
  return new Table({
    id: PNEUMA_OPERATIONS_TABLE_ID,
    app_id,
    system_owned: true,
    source: { kind: "stored" },
    columns: [
      { name: "operation_id", type: TEXT },
      { name: "name", type: TEXT },
      { name: "description", type: TEXT },
      { name: "input", type: JSON_T },
      { name: "output", type: JSON_T },
      { name: "affects", type: JSON_T },
      { name: "handler", type: JSON_T },
      { name: "ui_binding", type: JSON_T, nullable: true },
      { name: "agent_tool", type: JSON_T, nullable: true },
      { name: "created_by", type: TEXT },
      { name: "created_by_kind", type: TEXT },
      { name: "definition_version", type: NUMBER },
    ],
  });
}

export interface PneumaOperationEntry {
  readonly id: string;
  readonly app_id: string;
  readonly operation_id: string;
  readonly name: string;
  readonly description: string;
  readonly input: InputSchema;
  readonly output: OperationOutput;
  readonly affects: AffectDeclaration;
  readonly handler: HandlerRef | QueryBody;
  readonly ui_binding?: UIBinding;
  readonly agent_tool?: AgentToolConfig;
  readonly created_by: string;
  readonly created_by_kind: ActorKind;
  readonly definition_version: number;
}

export function pneumaOperationEntryToRow(entry: PneumaOperationEntry): Row {
  return new Row({
    id: entry.id,
    table_id: PNEUMA_OPERATIONS_TABLE_ID,
    app_id: entry.app_id,
    cells: {
      operation_id: entry.operation_id,
      name: entry.name,
      description: entry.description,
      input: entry.input,
      output: entry.output,
      affects: entry.affects,
      handler: entry.handler,
      ui_binding: entry.ui_binding ?? null,
      agent_tool: entry.agent_tool ?? null,
      created_by: entry.created_by,
      created_by_kind: entry.created_by_kind,
      definition_version: entry.definition_version,
    },
  });
}

export function rowToPneumaOperationEntry(row: Row): PneumaOperationEntry {
  if (row.table_id !== PNEUMA_OPERATIONS_TABLE_ID) {
    throw new Error(
      `rowToPneumaOperationEntry: row.table_id is '${row.table_id}', expected '${PNEUMA_OPERATIONS_TABLE_ID}'`,
    );
  }

  const operation_id = row.getCell("operation_id");
  const name = row.getCell("name");
  const description = row.getCell("description");
  const input = row.getCell("input");
  const output = row.getCell("output");
  const affects = row.getCell("affects");
  const handler = row.getCell("handler");
  const ui_binding = row.getCell("ui_binding");
  const agent_tool = row.getCell("agent_tool");
  const created_by = row.getCell("created_by");
  const created_by_kind = row.getCell("created_by_kind");
  const definition_version = row.getCell("definition_version");

  if (typeof operation_id !== "string" || operation_id.length === 0) {
    throw new Error(`rowToPneumaOperationEntry: missing operation_id on row ${row.id}`);
  }
  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`rowToPneumaOperationEntry: missing name on row ${row.id}`);
  }
  if (typeof description !== "string") {
    throw new Error(`rowToPneumaOperationEntry: description must be string on row ${row.id}`);
  }
  if (!isInputSchema(input)) {
    throw new Error(`rowToPneumaOperationEntry: invalid input schema on row ${row.id}`);
  }
  if (!isOperationOutput(output)) {
    throw new Error(`rowToPneumaOperationEntry: invalid output on row ${row.id}`);
  }
  if (!isAffects(affects)) {
    throw new Error(`rowToPneumaOperationEntry: invalid affects on row ${row.id}`);
  }
  if (!isQueryBody(handler) && !isHandlerRef(handler)) {
    throw new Error(`rowToPneumaOperationEntry: invalid handler on row ${row.id}`);
  }
  if (typeof definition_version !== "number") {
    throw new Error(`rowToPneumaOperationEntry: definition_version must be number on row ${row.id}`);
  }
  if (typeof created_by !== "string" || typeof created_by_kind !== "string") {
    throw new Error(`rowToPneumaOperationEntry: created_by fields missing on row ${row.id}`);
  }

  return {
    id: row.id,
    app_id: row.app_id,
    operation_id,
    name,
    description,
    input,
    output,
    affects,
    handler,
    ui_binding: ui_binding === null ? undefined : ui_binding as UIBinding,
    agent_tool: agent_tool === null ? undefined : agent_tool as AgentToolConfig,
    created_by,
    created_by_kind: created_by_kind as ActorKind,
    definition_version,
  };
}

export function operationFromPneumaOperationEntry(entry: PneumaOperationEntry): Operation {
  return new Operation({
    id: entry.operation_id,
    app_id: entry.app_id,
    name: entry.name,
    description: entry.description,
    input: entry.input,
    output: entry.output,
    affects: entry.affects,
    handler: entry.handler,
    ui_binding: entry.ui_binding,
    agent_tool: entry.agent_tool,
  });
}

function isInputSchema(value: unknown): value is InputSchema {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const schema = value as { type?: unknown; fields?: unknown };
  if (schema.type !== "record") return false;
  if (typeof schema.fields !== "object" || schema.fields === null || Array.isArray(schema.fields)) return false;
  for (const field of Object.values(schema.fields)) {
    if (typeof field !== "object" || field === null || Array.isArray(field)) return false;
    const candidate = field as { type?: unknown; required?: unknown };
    if (!isCellType(candidate.type)) return false;
    if (candidate.required !== undefined && typeof candidate.required !== "boolean") return false;
  }
  return true;
}

function isAffects(value: unknown): value is AffectDeclaration {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const affects = value as { mutations?: unknown; adapter_writes?: unknown; reads_only?: unknown; destructive?: unknown };
  return Array.isArray(affects.mutations)
    && affects.mutations.every((item) => typeof item === "string" && item.length > 0)
    && Array.isArray(affects.adapter_writes)
    && affects.adapter_writes.every((item) => typeof item === "string" && item.length > 0)
    && typeof affects.reads_only === "boolean"
    && typeof affects.destructive === "boolean";
}

function isHandlerRef(value: unknown): value is HandlerRef {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const handler = value as { kind?: unknown; ref?: unknown };
  return handler.kind === "code" && typeof handler.ref === "string" && handler.ref.length > 0;
}

function isQueryBody(value: unknown): value is QueryBody {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const query = value as { kind?: unknown; on?: unknown; pagination?: unknown; fields?: unknown; sort?: unknown };
  if (query.kind !== "query" || typeof query.on !== "string" || query.on.length === 0) return false;
  if (query.fields !== undefined && (!Array.isArray(query.fields) || !query.fields.every((f) => typeof f === "string"))) {
    return false;
  }
  if (query.sort !== undefined) {
    if (!Array.isArray(query.sort)) return false;
    for (const item of query.sort) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
      const sort = item as { column?: unknown; dir?: unknown };
      if (typeof sort.column !== "string" || (sort.dir !== "asc" && sort.dir !== "desc")) return false;
    }
  }
  if (typeof query.pagination !== "object" || query.pagination === null || Array.isArray(query.pagination)) return false;
  const pagination = query.pagination as { kind?: unknown; size?: unknown };
  return (pagination.kind === "cursor" || pagination.kind === "offset")
    && Number.isInteger(pagination.size)
    && typeof pagination.size === "number"
    && pagination.size > 0;
}

function isOperationOutput(value: unknown): value is OperationOutput {
  if (isCellType(value)) return true;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const output = value as { kind?: unknown; row_type?: unknown };
  if (output.kind === "void") return true;
  if (output.kind === "row-list") return typeof output.row_type === "string" && output.row_type.length > 0;
  if (output.kind === "derived-list" || output.kind === "graph" || output.kind === "object") return true;
  return false;
}
