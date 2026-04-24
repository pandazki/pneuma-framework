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
  PolicySet,
  Subjects,
  Resources,
  createPneumaTableColumnsTable,
} from "@pneuma-framework/core-domain";
import type { AppConfig } from "./types.js";

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

    // 7. Persist the entry
    await storage.saveRow(pneumaTableColumnEntryToRow(entry));

    return { entry_id: entryId, definition_version: nextVersion };
  };
}

function actorKindFromInvokedVia(invoked_via: PermissionContext["invoked_via"]): ActorKind {
  // Map PermissionContext.invoked_via (five values) down to the three ActorKinds used by app_history.
  if (invoked_via === "agent") return "agent";
  if (invoked_via === "system") return "framework";
  // ui / cli / webhook / (default) → builder
  return "builder";
}

function serializeEntryForSnapshot(e: PneumaTableColumnEntry): unknown {
  // Snapshot payload rows are lightly serialized; keep structure the same as the entry itself.
  return { ...e };
}

function newEntryId(): string {
  return `ptc-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Merge framework-provided Tables, Operations, handlers, and policy rules
 * into a user-supplied AppConfig. Idempotent — calling twice yields the
 * same effective config.
 *
 * Injections (Phase 3 P1):
 *   - Table `pneuma_table_columns` (system-owned, stored)
 *   - Operation `add_table_column`
 *   - Handler `framework://add_table_column`
 *   - PolicyRule allowing anyone (including anonymous) to invoke
 *     `operation:add_table_column` (MVP — Phase 3 P2 will tighten
 *     once proper Builder attribution lands)
 */
export function applyFrameworkInjections(config: AppConfig): AppConfig {
  // Tables
  const tables = [...config.tables];
  if (!tables.some((t) => t.id === PNEUMA_TABLE_COLUMNS_TABLE_ID)) {
    tables.push(createPneumaTableColumnsTable(config.app_id));
  }

  // Operations
  const operations = [...config.operations];
  if (!operations.some((o) => o.id === ADD_TABLE_COLUMN_OP_ID)) {
    operations.push(createAddTableColumnOp(config.app_id));
  }

  // Handlers
  const handlers = {
    ...config.handlers,
    [ADD_TABLE_COLUMN_HANDLER_REF]: createAddTableColumnHandler(),
  };

  // Policy rule (idempotent — only add if missing)
  const policy = ensureFrameworkPolicyRules(config.policy, config.app_id);

  return {
    ...config,
    tables,
    operations,
    handlers,
    policy,
  };
}

function ensureFrameworkPolicyRules(policy: PolicySet, app_id: string): PolicySet {
  // Read existing rules (readonly-ish — we construct a new PolicySet if missing).
  // PolicySet internal shape: `rules: PolicyRule[]`. We use addRule if the
  // target rule isn't already present.
  const existingRules = (policy as unknown as { rules: Array<{ on: unknown }> }).rules;
  const hasRule = existingRules.some((r) => {
    const on = r.on as { kind?: string; id?: string };
    return on.kind === "operation" && on.id === ADD_TABLE_COLUMN_OP_ID;
  });
  if (hasRule) return policy;
  policy.addRule({
    id: `framework-allow-${ADD_TABLE_COLUMN_OP_ID}`,
    allow: [Subjects.anyone(), Subjects.anonymous()],
    do: ["invoke"],
    on: Resources.operation(ADD_TABLE_COLUMN_OP_ID),
  });
  void app_id;
  return policy;
}
