// framework-operations.ts — Operations injected into every AppConfig by the runtime.
// First member: add_table_column (Phase 3 P1).
//
// Framework Operations share the Operation pipeline with template Operations
// (same PolicyEvaluator gate, audit events, /api/config exposure, MCP bridge
// visibility). The only difference is ownership: they're declared here, not
// in the template's config.ts.

import type {
  HandlerFn,
  Operation,
  AppHistoryStore,
  ActorKind,
  CellType,
  PermissionContext,
  PneumaTableColumnEntry,
} from "@pneuma-framework/core-domain";
import {
  Operation as OperationClass,
  PNEUMA_TABLE_COLUMNS_TABLE_ID,
  RESERVED_COLUMN_NAMES,
  isCellType,
  pneumaTableColumnEntryToRow,
  rowToPneumaTableColumnEntry,
} from "@pneuma-framework/core-domain";

export const ADD_TABLE_COLUMN_OP_ID = "add_table_column";
export const ADD_TABLE_COLUMN_HANDLER_REF = "framework://add_table_column";

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
  return async ({ ctx, input, storage, services }) => {
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
    if (!isCellType(i.cell_type as CellType)) {
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

    // 5. Persist the entry
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
    await storage.saveRow(pneumaTableColumnEntryToRow(entry));

    // 6. Append app_history snapshot (P1: snapshot-only, no delta yet)
    const allEntriesAfter = [...existingEntries, entry].map(serializeEntryForSnapshot);
    await history.append({
      app_id: ctx.app_id,
      history_type: "snapshot",
      payload: {
        kind: "pneuma_table_columns_snapshot",
        rows: allEntriesAfter,
      },
      is_ai_generated: actor_kind === "agent",
      actor_id,
      actor_kind,
      description: `Added column '${i.column_name}' to table '${i.table_id}'`,
      operation_scope: [`table:${i.table_id}`, "operation:add_table_column"],
    });

    return { entry_id: entryId, definition_version: nextVersion };
  };
}

function actorKindFromInvokedVia(invoked_via: PermissionContext["invoked_via"]): ActorKind {
  // Map PermissionContext.invoked_via (six values) down to the three ActorKinds used by app_history.
  if (invoked_via === "agent") return "agent";
  if (invoked_via === "system") return "framework";
  // ui / cli / webhook / (default) → builder
  return "builder";
}

function serializeEntryForSnapshot(e: PneumaTableColumnEntry): unknown {
  // Snapshot payload rows are lightly serialized; keep structure the same as the entry itself.
  return { ...e };
}

let _entryCounter = 0;
function newEntryId(): string {
  _entryCounter += 1;
  return `ptc-${Date.now().toString(36)}-${_entryCounter.toString(36)}`;
}
