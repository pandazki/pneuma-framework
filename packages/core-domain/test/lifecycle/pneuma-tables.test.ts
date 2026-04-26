import { describe, test, expect } from "bun:test";
import {
  createPneumaTablesTable,
  PNEUMA_TABLES_TABLE_ID,
  pneumaTableEntryToRow,
  rowToPneumaTableEntry,
  type PneumaTableEntry,
} from "../../src/lifecycle/pneuma-tables.js";

describe("createPneumaTablesTable", () => {
  test("returns a system-owned Table with the expected shape", () => {
    const t = createPneumaTablesTable("ai-bookmarks");
    expect(t.id).toBe(PNEUMA_TABLES_TABLE_ID);
    expect(t.id).toBe("pneuma_tables");
    expect(t.app_id).toBe("ai-bookmarks");
    expect(t.system_owned).toBe(true);
    expect(t.source.kind).toBe("stored");
    const names = t.columns.map((c) => c.name).sort();
    expect(names).toEqual(
      [
        "table_id",
        "source",
        "columns",
        "system_owned",
        "created_by",
        "created_by_kind",
        "definition_version",
      ].sort(),
    );
  });

  test("system-owned Table rejects addColumn", () => {
    const t = createPneumaTablesTable("app");
    expect(() =>
      t.addColumn({ name: "extra", type: { kind: "primitive", of: "Text" } }),
    ).toThrow();
  });
});

describe("PneumaTableEntry <-> Row round-trip", () => {
  test("entry with stored source and columns round-trips through Row", () => {
    const entry: PneumaTableEntry = {
      id: "pt-notes",
      app_id: "ai-bookmarks",
      table_id: "notes",
      source: { kind: "stored" },
      columns: [
        { name: "title", type: { kind: "primitive", of: "Text" } },
        { name: "score", type: { kind: "primitive", of: "Number" }, nullable: true },
      ],
      system_owned: false,
      created_by: "agent:builder-01",
      created_by_kind: "agent",
      definition_version: 1,
    };

    const row = pneumaTableEntryToRow(entry);
    const back = rowToPneumaTableEntry(row);

    expect(row.getCell("columns")).toEqual([
      { name: "title", type: { kind: "primitive", of: "Text" } },
      { name: "score", type: { kind: "primitive", of: "Number" }, nullable: true },
    ]);
    expect(back).toEqual(entry);
  });

  test("decoding rejects rows from a different table", () => {
    const { Row } = require("../../src/aggregates/row.js") as typeof import("../../src/aggregates/row.js");
    const wrong = new Row({
      id: "bad",
      table_id: "bookmarks",
      app_id: "app",
      cells: { url: "x" },
    });
    expect(() => rowToPneumaTableEntry(wrong)).toThrow();
  });
});
