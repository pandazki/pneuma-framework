import { describe, expect, test } from "bun:test";
import {
  PNEUMA_POLICY_SETTINGS_TABLE_ID,
  Row,
  createPneumaPolicySettingsTable,
  pneumaPolicySettingEntryToRow,
  rowToPneumaPolicySettingEntry,
  type PneumaPolicySettingEntry,
} from "../../src/index.js";

function entry(app_id = "app"): PneumaPolicySettingEntry {
  return {
    id: "pps-default-posture",
    app_id,
    setting_id: "default_posture",
    value: { app: "restricted" },
    created_by: "agent:x",
    created_by_kind: "agent",
    definition_version: 1,
  };
}

describe("createPneumaPolicySettingsTable", () => {
  test("returns a system-owned Table with the expected shape", () => {
    const table = createPneumaPolicySettingsTable("app");
    expect(table.id).toBe(PNEUMA_POLICY_SETTINGS_TABLE_ID);
    expect(table.system_owned).toBe(true);
    expect(table.columns.map((column) => column.name)).toEqual([
      "setting_id",
      "value",
      "created_by",
      "created_by_kind",
      "definition_version",
    ]);
  });
});

describe("PneumaPolicySettingEntry ↔ Row round-trip", () => {
  test("default posture entry round-trips through Row", () => {
    const e = entry();
    const row = pneumaPolicySettingEntryToRow(e);

    expect(row.getCell("setting_id")).toBe("default_posture");
    expect(row.getCell("value")).toEqual({ app: "restricted" });
    expect(rowToPneumaPolicySettingEntry(row)).toEqual(e);
  });

  test("decoding rejects rows from a different table", () => {
    const row = pneumaPolicySettingEntryToRow(entry());
    const wrong = new Row({
      id: row.id,
      app_id: row.app_id,
      table_id: "wrong",
      cells: Object.fromEntries(row.cells),
    });

    expect(() => rowToPneumaPolicySettingEntry(wrong)).toThrow(/expected 'pneuma_policy_settings'/);
  });

  test("decoding rejects invalid default posture values", () => {
    const row = pneumaPolicySettingEntryToRow(entry());
    const broken = new Row({
      id: row.id,
      app_id: row.app_id,
      table_id: row.table_id,
      cells: {
        ...Object.fromEntries(row.cells),
        value: { app: "internal" },
      },
    });

    expect(() => rowToPneumaPolicySettingEntry(broken)).toThrow(/invalid policy setting/);
  });
});
