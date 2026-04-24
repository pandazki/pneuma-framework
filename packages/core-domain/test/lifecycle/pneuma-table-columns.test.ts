import { describe, test, expect } from "bun:test";
import {
  createPneumaTableColumnsTable,
  PNEUMA_TABLE_COLUMNS_TABLE_ID,
} from "../../src/lifecycle/pneuma-table-columns.js";
import {
  pneumaTableColumnEntryToRow,
  rowToPneumaTableColumnEntry,
  type PneumaTableColumnEntry,
} from "../../src/lifecycle/pneuma-table-columns.js";

describe("createPneumaTableColumnsTable", () => {
  test("returns a system-owned Table with the expected shape", () => {
    const t = createPneumaTableColumnsTable("ai-bookmarks");
    expect(t.id).toBe(PNEUMA_TABLE_COLUMNS_TABLE_ID);
    expect(t.id).toBe("pneuma_table_columns");
    expect(t.app_id).toBe("ai-bookmarks");
    expect(t.system_owned).toBe(true);
    expect(t.source.kind).toBe("stored");
    const names = t.columns.map((c) => c.name).sort();
    expect(names).toEqual(
      [
        "table_id",
        "column_name",
        "cell_type",
        "nullable",
        "default_value",
        "created_by",
        "created_by_kind",
        "definition_version",
      ].sort(),
    );
  });

  test("cell_type column is json", () => {
    const t = createPneumaTableColumnsTable("app");
    const ct = t.columns.find((c) => c.name === "cell_type")!;
    expect(ct.type.kind).toBe("json");
  });

  test("default_value column is json and nullable", () => {
    const t = createPneumaTableColumnsTable("app");
    const ct = t.columns.find((c) => c.name === "default_value")!;
    expect(ct.type.kind).toBe("json");
    expect(ct.nullable).toBe(true);
  });

  test("system_owned Table rejects addColumn", () => {
    const t = createPneumaTableColumnsTable("app");
    expect(() =>
      t.addColumn({ name: "extra", type: { kind: "primitive", of: "Text" } }),
    ).toThrow();
  });
});

describe("PneumaTableColumnEntry ↔ Row round-trip", () => {
  test("entry with all fields round-trips through Row", () => {
    const entry: PneumaTableColumnEntry = {
      id: "ptc-abc123",
      app_id: "ai-bookmarks",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
      default_value: "",
      created_by: "agent:builder-01",
      created_by_kind: "agent",
      definition_version: 1,
    };
    const row = pneumaTableColumnEntryToRow(entry);
    const back = rowToPneumaTableColumnEntry(row);
    expect(back).toEqual(entry);
  });

  test("entry with missing default_value encodes null cell and decodes undefined", () => {
    const entry: PneumaTableColumnEntry = {
      id: "ptc-no-default",
      app_id: "app",
      table_id: "items",
      column_name: "label",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: false,
      created_by: "builder:u1",
      created_by_kind: "builder",
      definition_version: 1,
    };
    const row = pneumaTableColumnEntryToRow(entry);
    const back = rowToPneumaTableColumnEntry(row);
    expect(back.default_value).toBeUndefined();
  });

  test("decoding rejects rows from a different table", () => {
    // Construct a Row against a different table_id — should throw on decode
    const { Row } = require("../../src/aggregates/row.js") as typeof import("../../src/aggregates/row.js");
    const wrong = new Row({
      id: "bad",
      table_id: "bookmarks",
      app_id: "app",
      cells: { url: "x" },
    });
    expect(() => rowToPneumaTableColumnEntry(wrong)).toThrow();
  });
});
