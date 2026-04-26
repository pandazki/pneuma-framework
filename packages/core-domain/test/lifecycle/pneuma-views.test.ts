import { describe, expect, test } from "bun:test";
import {
  PNEUMA_VIEWS_TABLE_ID,
  Row,
  createPneumaViewsTable,
  pneumaViewEntryToRow,
  rowToPneumaViewEntry,
  viewFromPneumaViewEntry,
  type PneumaViewEntry,
} from "../../src/index.js";

function entry(app_id = "app"): PneumaViewEntry {
  return {
    id: "pv-1",
    app_id,
    view_id: "review_queue",
    name: "Review Queue",
    description: "Sources ready for review",
    kind: "table",
    source: { kind: "operation", operation_id: "list_review_sources" },
    presentation: { columns: ["title", "url", "status"] },
    created_by: "agent:x",
    created_by_kind: "agent",
    definition_version: 1,
  };
}

describe("createPneumaViewsTable", () => {
  test("returns a system-owned Table with the expected shape", () => {
    const table = createPneumaViewsTable("app");
    expect(table.id).toBe(PNEUMA_VIEWS_TABLE_ID);
    expect(table.system_owned).toBe(true);
    expect(table.columns.map((column) => column.name)).toEqual([
      "view_id",
      "name",
      "description",
      "kind",
      "source",
      "presentation",
      "created_by",
      "created_by_kind",
      "definition_version",
    ]);
  });
});

describe("PneumaViewEntry ↔ Row round-trip", () => {
  test("entry round-trips through Row and rehydrates a View", () => {
    const e = entry();
    const row = pneumaViewEntryToRow(e);
    const decoded = rowToPneumaViewEntry(row);
    expect(decoded).toEqual(e);

    const view = viewFromPneumaViewEntry(decoded);
    expect(view.id).toBe("review_queue");
    expect(view.kind).toBe("table");
    expect(view.source.operation_id).toBe("list_review_sources");
  });

  test("decoding rejects rows from a different table", () => {
    const row = pneumaViewEntryToRow(entry());
    const wrong = new Row({
      id: row.id,
      app_id: row.app_id,
      table_id: "wrong",
      cells: Object.fromEntries(row.cells),
    });
    expect(() => rowToPneumaViewEntry(wrong)).toThrow(/expected 'pneuma_views'/);
  });
});
