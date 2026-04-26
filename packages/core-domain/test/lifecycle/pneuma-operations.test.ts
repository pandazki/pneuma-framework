import { describe, expect, test } from "bun:test";
import {
  PNEUMA_OPERATIONS_TABLE_ID,
  Row,
  createPneumaOperationsTable,
  operationFromPneumaOperationEntry,
  pneumaOperationEntryToRow,
  rowToPneumaOperationEntry,
  type PneumaOperationEntry,
} from "../../src/index.js";

function entry(app_id = "app"): PneumaOperationEntry {
  return {
    id: "po-1",
    app_id,
    operation_id: "list_bookmark_urls",
    name: "List bookmark URLs",
    description: "List bookmark URLs for review",
    input: { type: "record", fields: {} },
    output: { kind: "row-list", row_type: "bookmarks" },
    affects: { mutations: [], adapter_writes: [], reads_only: true, destructive: false },
    handler: {
      kind: "query",
      on: "bookmarks",
      fields: ["url"],
      pagination: { kind: "offset", size: 10 },
    },
    created_by: "agent:x",
    created_by_kind: "agent",
    definition_version: 1,
  };
}

describe("createPneumaOperationsTable", () => {
  test("returns a system-owned Table with the expected shape", () => {
    const table = createPneumaOperationsTable("app");
    expect(table.id).toBe(PNEUMA_OPERATIONS_TABLE_ID);
    expect(table.system_owned).toBe(true);
    expect(table.columns.map((column) => column.name)).toEqual([
      "operation_id",
      "name",
      "description",
      "input",
      "output",
      "affects",
      "handler",
      "ui_binding",
      "agent_tool",
      "surface",
      "created_by",
      "created_by_kind",
      "definition_version",
    ]);
  });
});

describe("PneumaOperationEntry ↔ Row round-trip", () => {
  test("entry round-trips through Row and rehydrates an Operation", () => {
    const e = entry();
    const row = pneumaOperationEntryToRow(e);
    const decoded = rowToPneumaOperationEntry(row);
    expect(decoded).toEqual(e);

    const operation = operationFromPneumaOperationEntry(decoded);
    expect(operation.id).toBe("list_bookmark_urls");
    expect(operation.isQuery()).toBe(true);
    expect(operation.surface.view_mountable).toBe(true);
    expect(operation.handler.kind).toBe("query");
  });

  test("surface round-trips and rehydrates into the Operation aggregate", () => {
    const e = {
      ...entry(),
      surface: {
        agent_callable: false,
        public_surface: true,
        view_mountable: true,
        framework_internal: false,
      },
    };
    const decoded = rowToPneumaOperationEntry(pneumaOperationEntryToRow(e));
    expect(decoded.surface).toEqual(e.surface);

    const operation = operationFromPneumaOperationEntry(decoded);
    expect(operation.surface.agent_callable).toBe(false);
    expect(operation.surface.view_mountable).toBe(true);
  });

  test("decoding rejects rows from a different table", () => {
    const row = pneumaOperationEntryToRow(entry());
    const wrong = new Row({
      id: row.id,
      app_id: row.app_id,
      table_id: "wrong",
      cells: Object.fromEntries(row.cells),
    });
    expect(() => rowToPneumaOperationEntry(wrong)).toThrow(/expected 'pneuma_operations'/);
  });
});
