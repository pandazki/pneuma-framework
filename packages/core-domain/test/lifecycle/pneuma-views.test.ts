import { describe, expect, test } from "bun:test";
import {
  PNEUMA_VIEWS_TABLE_ID,
  Row,
  View,
  createPneumaViewsTable,
  normalizeViewPresentation,
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
    presentation: {
      title: "Review Queue",
      columns: [
        { field: "title", label: "Title", role: "title" },
        { field: "url", label: "URL", role: "url" },
        { field: "status", label: "Status", role: "metadata" },
      ],
      empty_state: "No sources are waiting for review.",
    },
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
    expect(view.presentation?.columns?.map((column) => column.field)).toEqual(["title", "url", "status"]);
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

  test("decoding normalizes legacy string columns into the View presentation contract", () => {
    const row = pneumaViewEntryToRow({
      ...entry(),
      presentation: undefined,
    });
    const legacy = new Row({
      id: row.id,
      app_id: row.app_id,
      table_id: row.table_id,
      cells: {
        ...Object.fromEntries(row.cells),
        presentation: { columns: ["title", "url"] },
      },
    });

    expect(rowToPneumaViewEntry(legacy).presentation).toEqual({
      columns: [{ field: "title" }, { field: "url" }],
    });
  });
});

describe("View presentation contract", () => {
  test("normalizes column strings and column metadata objects", () => {
    expect(normalizeViewPresentation({
      title: "Review Queue",
      columns: ["title", { field: "url", label: "URL", role: "url" }],
      empty_state: "No sources are waiting for review.",
    })).toEqual({
      title: "Review Queue",
      columns: [{ field: "title" }, { field: "url", label: "URL", role: "url" }],
      empty_state: "No sources are waiting for review.",
    });
  });

  test("rejects invalid presentation shapes", () => {
    expect(() => new View({
      id: "bad_view",
      app_id: "app",
      name: "Bad View",
      kind: "table",
      source: { kind: "operation", operation_id: "list_review_sources" },
      presentation: { columns: [{ label: "Missing field" }] },
    })).toThrow(/presentation\.columns/);
  });
});
