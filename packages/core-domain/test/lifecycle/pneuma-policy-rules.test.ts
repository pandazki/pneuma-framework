import { describe, expect, test } from "bun:test";
import {
  PNEUMA_POLICY_RULES_TABLE_ID,
  Resources,
  Row,
  Subjects,
  createPneumaPolicyRulesTable,
  pneumaPolicyRuleEntryToRow,
  policyRuleFromPneumaPolicyRuleEntry,
  rowToPneumaPolicyRuleEntry,
  type PneumaPolicyRuleEntry,
} from "../../src/index.js";

function entry(app_id = "app"): PneumaPolicyRuleEntry {
  return {
    id: "ppr-1",
    app_id,
    rule_id: "reviewers-can-read-review-queue",
    allow: [Subjects.role("reviewer")],
    do: ["read"],
    on: Resources.view("review_queue"),
    created_by: "agent:x",
    created_by_kind: "agent",
    definition_version: 1,
  };
}

describe("createPneumaPolicyRulesTable", () => {
  test("returns a system-owned Table with the expected shape", () => {
    const table = createPneumaPolicyRulesTable("app");
    expect(table.id).toBe(PNEUMA_POLICY_RULES_TABLE_ID);
    expect(table.system_owned).toBe(true);
    expect(table.columns.map((column) => column.name)).toEqual([
      "rule_id",
      "effect",
      "allow",
      "actions",
      "resource",
      "when",
      "created_by",
      "created_by_kind",
      "definition_version",
    ]);
  });
});

describe("PneumaPolicyRuleEntry ↔ Row round-trip", () => {
  test("entry round-trips through Row and rehydrates a PolicyRule", () => {
    const e = { ...entry(), effect: "deny" as const };
    const row = pneumaPolicyRuleEntryToRow(e);
    const decoded = rowToPneumaPolicyRuleEntry(row);
    expect(decoded).toEqual(e);

    const rule = policyRuleFromPneumaPolicyRuleEntry(decoded);
    expect(rule).toEqual({
      id: "reviewers-can-read-review-queue",
      effect: "deny",
      allow: [Subjects.role("reviewer")],
      do: ["read"],
      on: Resources.view("review_queue"),
    });
  });

  test("legacy row without effect decodes as allow", () => {
    const row = pneumaPolicyRuleEntryToRow(entry());
    const legacy = new Row({
      id: row.id,
      app_id: row.app_id,
      table_id: row.table_id,
      cells: Object.fromEntries(
        [...row.cells].filter(([key]) => key !== "effect"),
      ),
    });

    const decoded = rowToPneumaPolicyRuleEntry(legacy);
    expect(decoded.effect).toBe("allow");
    expect(policyRuleFromPneumaPolicyRuleEntry(decoded).effect ?? "allow").toBe("allow");
  });

  test("decoding rejects invalid effect", () => {
    const row = pneumaPolicyRuleEntryToRow(entry());
    const broken = new Row({
      id: row.id,
      app_id: row.app_id,
      table_id: row.table_id,
      cells: {
        ...Object.fromEntries(row.cells),
        effect: "block",
      },
    });

    expect(() => rowToPneumaPolicyRuleEntry(broken)).toThrow(/invalid policy rule/);
  });

  test("decoding rejects rows from a different table", () => {
    const row = pneumaPolicyRuleEntryToRow(entry());
    const wrong = new Row({
      id: row.id,
      app_id: row.app_id,
      table_id: "wrong",
      cells: Object.fromEntries(row.cells),
    });
    expect(() => rowToPneumaPolicyRuleEntry(wrong)).toThrow(/expected 'pneuma_policy_rules'/);
  });

  test("decoding rejects invalid PolicyRule shapes", () => {
    const row = pneumaPolicyRuleEntryToRow(entry());
    const broken = new Row({
      id: row.id,
      app_id: row.app_id,
      table_id: row.table_id,
      cells: {
        ...Object.fromEntries(row.cells),
        actions: ["ship-it"],
      },
    });

    expect(() => rowToPneumaPolicyRuleEntry(broken)).toThrow(/invalid policy rule/);
  });
});
