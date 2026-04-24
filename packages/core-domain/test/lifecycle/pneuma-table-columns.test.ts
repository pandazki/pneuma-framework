import { describe, test, expect } from "bun:test";
import {
  createPneumaTableColumnsTable,
  PNEUMA_TABLE_COLUMNS_TABLE_ID,
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
