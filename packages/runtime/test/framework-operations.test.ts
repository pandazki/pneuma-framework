import { describe, test, expect } from "bun:test";
import {
  createAddTableColumnOp,
  ADD_TABLE_COLUMN_OP_ID,
  ADD_TABLE_COLUMN_HANDLER_REF,
} from "../src/framework-operations.js";
import { PNEUMA_TABLE_COLUMNS_TABLE_ID } from "@pneuma-framework/core-domain";

describe("createAddTableColumnOp", () => {
  test("returns an Operation with the framework id and correct affects", () => {
    const op = createAddTableColumnOp("ai-bookmarks");
    expect(op.id).toBe(ADD_TABLE_COLUMN_OP_ID);
    expect(op.id).toBe("add_table_column");
    expect(op.app_id).toBe("ai-bookmarks");
    expect(op.affects.mutations).toEqual([PNEUMA_TABLE_COLUMNS_TABLE_ID]);
    expect(op.affects.adapter_writes).toEqual([]);
    expect(op.affects.reads_only).toBe(false);
    expect(op.affects.destructive).toBe(false);
  });

  test("input schema requires table_id, column_name, cell_type; optional nullable + default_value", () => {
    const op = createAddTableColumnOp("app");
    const fields = op.input.fields;
    expect(fields.table_id?.required).toBe(true);
    expect(fields.column_name?.required).toBe(true);
    expect(fields.cell_type?.required).toBe(true);
    expect(fields.nullable?.required).not.toBe(true);
    expect(fields.default_value?.required).not.toBe(true);
  });

  test("output is object with entry_id + definition_version fields", () => {
    const op = createAddTableColumnOp("app");
    expect(op.output.kind).toBe("object");
    if (op.output.kind === "object") {
      const schema = op.output.schema as {
        properties: Record<string, unknown>;
        required: string[];
      };
      expect(schema.properties.entry_id).toBeDefined();
      expect(schema.properties.definition_version).toBeDefined();
      expect(schema.required).toEqual(expect.arrayContaining(["entry_id", "definition_version"]));
    }
  });

  test("handler is a code ref with the framework prefix", () => {
    const op = createAddTableColumnOp("app");
    expect(op.handler.kind).toBe("code");
    if (op.handler.kind === "code") {
      expect(op.handler.ref).toBe(ADD_TABLE_COLUMN_HANDLER_REF);
      expect(op.handler.ref).toBe("framework://add_table_column");
    }
  });
});
