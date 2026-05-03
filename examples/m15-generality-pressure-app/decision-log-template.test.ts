import { describe, expect, test } from "bun:test";
import { config } from "./templates/team-decision-log/server/config.js";

describe("M15 Team Decision Log template", () => {
  test("declares a distinct app shape with owner-aware policy", () => {
    expect(config.app_id).toBe("team-decision-log");
    expect(config.tables.map((table) => table.id)).toEqual(["decisions"]);
    expect(config.operations.map((operation) => operation.id)).toEqual(["record_decision", "list_decisions"]);
    expect(config.views?.map((view) => view.id)).toEqual(["decision_log"]);
    expect(config.policy.rules.some((rule) => rule.id === "owner-can-read-decisions")).toBe(true);
  });
});
