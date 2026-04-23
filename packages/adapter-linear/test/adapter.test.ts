import { describe, test, expect } from "bun:test";
import { createLinearAdapter } from "../src/adapter.js";

describe("createLinearAdapter · Adapter aggregate shape", () => {
  test("returns admin_delegated Adapter with correct identity_binding + required_for_admin_delegated", () => {
    const a = createLinearAdapter({ app_id: "test" });
    expect(a.credential_mode).toBe("admin_delegated");
    expect(a.identity_binding?.strategy).toBe("email_match");
    expect(a.identity_binding?.store_at).toBe("user.attrs.linear_user_id");
    const req = a.requiresAdminDelegatedFilter();
    expect(req).toEqual([{ column: "creator_id", required_ops: ["eq"] }]);
  });

  test("declares list capability and key pushdown ops", () => {
    const a = createLinearAdapter({ app_id: "test" });
    expect(a.capabilities.list).toBe(true);
    expect(a.capabilities.update).toBe(false);
    expect(a.canPushdownFilter("creator_id", "eq")).toBe(true);
    expect(a.canPushdownFilter("state_type", "in")).toBe(true);
    expect(a.canPushdownFilter("created_at", "date")).toBe(true);
    expect(a.canPushdownFilter("title", "eq")).toBe(false); // title 不在 pushdown
  });

  test("Issue externalType has all expected columns", () => {
    const a = createLinearAdapter({ app_id: "test" });
    const issue = a.externalTypeByName("Issue");
    expect(issue).toBeDefined();
    const names = new Set(issue!.columns.map((c) => c.name));
    for (const required of [
      "id", "identifier", "title", "priority", "state_name", "state_type",
      "assignee_id", "creator_id", "team_key",
      "created_at", "updated_at", "completed_at",
    ]) {
      expect(names.has(required)).toBe(true);
    }
  });
});
