import { describe, test, expect } from "bun:test";
import {
  PolicySet,
  PolicySetInvariantViolation,
  Subjects,
  Resources,
  type PolicyRule,
} from "../../src/aggregates/policy-set.js";
import type { WhereClause } from "../../src/value-objects/where-clause.js";

function rule(overrides: Partial<PolicyRule> & { id: string }): PolicyRule {
  return {
    id: overrides.id,
    allow: overrides.allow ?? [Subjects.anyone()],
    do: overrides.do ?? ["read"],
    on: overrides.on ?? Resources.app(),
    when: overrides.when,
  };
}

describe("PolicySet · aggregate (ADR-0007 + ADR-0009)", () => {
  describe("construction", () => {
    test("empty app_id rejected", () => {
      expect(() => new PolicySet({ app_id: "" })).toThrow(PolicySetInvariantViolation);
    });

    test("default posture defaults to app:public", () => {
      const p = new PolicySet({ app_id: "app" });
      expect(p.default_posture.app).toBe("public");
    });

    test("explicit posture accepted", () => {
      const p = new PolicySet({
        app_id: "app",
        default_posture: { app: "restricted" },
      });
      expect(p.default_posture.app).toBe("restricted");
    });

    test("initial rules set version=1", () => {
      const p = new PolicySet({
        app_id: "app",
        rules: [rule({ id: "r1" })],
      });
      expect(p.version).toBe(1);
      expect(p.rules).toHaveLength(1);
    });

    test("no rules initial → version=0", () => {
      const p = new PolicySet({ app_id: "app" });
      expect(p.version).toBe(0);
    });
  });

  describe("vocabulary enforcement", () => {
    test("invalid subject kind rejected", () => {
      const bad = {
        id: "r",
        allow: [{ kind: "stars" }] as any,
        do: ["read"],
        on: Resources.app(),
      };
      expect(() => new PolicySet({ app_id: "app", rules: [bad as any] })).toThrow(
        PolicySetInvariantViolation
      );
    });

    test("invalid action rejected", () => {
      expect(
        () =>
          new PolicySet({
            app_id: "app",
            rules: [rule({ id: "r", do: ["yolo"] as any })],
          })
      ).toThrow(PolicySetInvariantViolation);
    });

    test("invalid resource kind rejected", () => {
      expect(
        () =>
          new PolicySet({
            app_id: "app",
            rules: [
              rule({ id: "r", on: { kind: "mystery" } as any }),
            ],
          })
      ).toThrow(PolicySetInvariantViolation);
    });

    test("user subject requires id", () => {
      expect(
        () =>
          new PolicySet({
            app_id: "app",
            rules: [rule({ id: "r", allow: [{ kind: "user", id: "" }] })],
          })
      ).toThrow(PolicySetInvariantViolation);
    });

    test("empty allow / do rejected", () => {
      expect(
        () =>
          new PolicySet({
            app_id: "app",
            rules: [rule({ id: "r", allow: [] as any })],
          })
      ).toThrow(PolicySetInvariantViolation);
      expect(
        () =>
          new PolicySet({
            app_id: "app",
            rules: [rule({ id: "r", do: [] as any })],
          })
      ).toThrow(PolicySetInvariantViolation);
    });

    test("invalid when (malformed WhereClause) rejected", () => {
      expect(
        () =>
          new PolicySet({
            app_id: "app",
            rules: [
              rule({
                id: "r",
                when: { kind: "leaf" } as unknown as WhereClause,
              }),
            ],
          })
      ).toThrow(PolicySetInvariantViolation);
    });
  });

  describe("mutation + version bump", () => {
    test("addRule bumps version", () => {
      const p = new PolicySet({ app_id: "app" });
      p.addRule(rule({ id: "r1" }));
      expect(p.version).toBe(1);
      p.addRule(rule({ id: "r2" }));
      expect(p.version).toBe(2);
    });

    test("duplicate rule id rejected", () => {
      const p = new PolicySet({ app_id: "app" });
      p.addRule(rule({ id: "r" }));
      expect(() => p.addRule(rule({ id: "r" }))).toThrow(PolicySetInvariantViolation);
    });

    test("removeRule bumps version", () => {
      const p = new PolicySet({ app_id: "app" });
      p.addRule(rule({ id: "r1" }));
      p.removeRule("r1");
      expect(p.rules).toHaveLength(0);
      expect(p.version).toBe(2); // 1 for add + 1 for remove
    });

    test("removeRule on missing id throws", () => {
      const p = new PolicySet({ app_id: "app" });
      expect(() => p.removeRule("nope")).toThrow(PolicySetInvariantViolation);
    });

    test("setDefaultPosture bumps version", () => {
      const p = new PolicySet({ app_id: "app" });
      p.setDefaultPosture({ app: "restricted" });
      expect(p.version).toBe(1);
      expect(p.default_posture.app).toBe("restricted");
    });
  });

  describe("compile + staticAnalysis", () => {
    test("compile returns snapshot with version", () => {
      const p = new PolicySet({
        app_id: "app",
        rules: [rule({ id: "r1", on: Resources.table("bookmarks") })],
      });
      const c = p.compile();
      expect(c.app_id).toBe("app");
      expect(c.version).toBe(1);
      expect(c.rules).toHaveLength(1);
    });

    test("staticAnalysis collects referenced user paths", () => {
      const when: WhereClause = {
        kind: "leaf",
        subject: { ns: "row", path: ["owner_id"] },
        op: "eq",
        value: { ref: "user", path: ["id"] },
      };
      const p = new PolicySet({
        app_id: "app",
        rules: [
          rule({
            id: "self-access",
            allow: [Subjects.self()],
            do: ["read"],
            on: Resources.tableRow("bookmarks"),
            when,
          }),
        ],
      });
      const a = p.staticAnalysis();
      expect(a.referenced_user_paths).toContain("id");
      expect(a.user_bound_rules_count).toBe(1);
    });

    test("staticAnalysis no user references when rules only use row/anyone", () => {
      const p = new PolicySet({
        app_id: "app",
        rules: [rule({ id: "r", on: Resources.app() })],
      });
      const a = p.staticAnalysis();
      expect(a.user_bound_rules_count).toBe(0);
      expect(a.referenced_user_paths).toEqual([]);
    });
  });

  describe("canonical examples from ADR-0018 / 0019 / 0021", () => {
    test("allow self read bookmarks.row (with user binding)", () => {
      const when: WhereClause = {
        kind: "leaf",
        subject: { ns: "row", path: ["owner_id"] },
        op: "eq",
        value: { ref: "user", path: ["id"] },
      };
      const p = new PolicySet({ app_id: "ai-bookmarks" });
      p.addRule({
        id: "self-bookmark-read",
        allow: [Subjects.self()],
        do: ["read"],
        on: Resources.tableRow("bookmarks"),
        when,
      });
      expect(p.rules).toHaveLength(1);
    });

    test("allow user:alice invoke operation:delete_bookmark", () => {
      const p = new PolicySet({ app_id: "app" });
      p.addRule({
        id: "alice-delete",
        allow: [Subjects.user("alice")],
        do: ["invoke"],
        on: Resources.operation("delete_bookmark"),
      });
      const c = p.compile();
      expect(c.rules[0]!.on).toEqual({ kind: "operation", id: "delete_bookmark" });
    });
  });
});
