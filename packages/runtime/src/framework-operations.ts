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
} from "@pneuma-framework/core-domain";
import {
  Operation as OperationClass,
  PNEUMA_TABLE_COLUMNS_TABLE_ID,
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
