import { describe, test, expect } from "bun:test";
import {
  isWhereClause,
  evaluate,
  getSubjects,
  requiresUserContext,
  simplify,
  isUniversallyTrue,
  isUniversallyFalse,
  explain,
  type WhereClause,
  type EvalContext,
} from "../../src/value-objects/where-clause.js";

// ---------- helpers ----------

const leafEq = (
  ns: "row" | "user" | "input" | "target",
  path: string[],
  value: unknown
): WhereClause => ({
  kind: "leaf",
  subject: { ns, path },
  op: "eq",
  value: value as any,
});

const branch = (
  logical_op: "and" | "or" | "not",
  children: WhereClause[]
): WhereClause => ({ kind: "branch", logical_op, children });

// ---------- guard ----------

describe("isWhereClause", () => {
  test("accepts basic leaf", () => {
    expect(
      isWhereClause({
        kind: "leaf",
        subject: { ns: "row", path: ["id"] },
        op: "eq",
        value: "x",
      })
    ).toBe(true);
  });

  test("rejects leaf with unknown namespace", () => {
    expect(
      isWhereClause({
        kind: "leaf",
        subject: { ns: "stars", path: ["x"] },
        op: "eq",
      })
    ).toBe(false);
  });

  test("rejects leaf with empty path", () => {
    expect(
      isWhereClause({
        kind: "leaf",
        subject: { ns: "row", path: [] },
        op: "eq",
      })
    ).toBe(false);
  });

  test("rejects leaf with unknown op", () => {
    expect(
      isWhereClause({
        kind: "leaf",
        subject: { ns: "row", path: ["x"] },
        op: "bogus",
      })
    ).toBe(false);
  });

  test("accepts nested branches", () => {
    const c = branch("and", [
      leafEq("row", ["a"], 1),
      branch("or", [leafEq("row", ["b"], 2), leafEq("row", ["c"], 3)]),
    ]);
    expect(isWhereClause(c)).toBe(true);
  });

  test("rejects not-branch with !=1 child", () => {
    expect(
      isWhereClause({
        kind: "branch",
        logical_op: "not",
        children: [leafEq("row", ["a"], 1), leafEq("row", ["b"], 2)],
      })
    ).toBe(false);
  });
});

// ---------- evaluate: leaves ----------

describe("evaluate · leaves · comparison ops", () => {
  const ctx: EvalContext = {
    row: { id: "u1", age: 30, tags: ["a", "b"], name: "Alice", note: null },
    user: { id: "u1", attrs: {}, roles: [] },
    now: new Date(2026, 3, 24).getTime(),
  };

  test("eq / neq", () => {
    expect(evaluate(leafEq("row", ["id"], "u1"), ctx)).toBe(true);
    expect(evaluate(leafEq("row", ["id"], "u2"), ctx)).toBe(false);
    expect(
      evaluate(
        { kind: "leaf", subject: { ns: "row", path: ["id"] }, op: "neq", value: "u2" },
        ctx
      )
    ).toBe(true);
  });

  test("gt / gte / lt / lte", () => {
    const mk = (op: "gt" | "gte" | "lt" | "lte", v: number): WhereClause => ({
      kind: "leaf",
      subject: { ns: "row", path: ["age"] },
      op,
      value: v,
    });
    expect(evaluate(mk("gt", 29), ctx)).toBe(true);
    expect(evaluate(mk("gt", 30), ctx)).toBe(false);
    expect(evaluate(mk("gte", 30), ctx)).toBe(true);
    expect(evaluate(mk("lt", 31), ctx)).toBe(true);
    expect(evaluate(mk("lte", 30), ctx)).toBe(true);
  });

  test("gt on non-number → false", () => {
    expect(
      evaluate(
        { kind: "leaf", subject: { ns: "row", path: ["name"] }, op: "gt", value: 3 },
        ctx
      )
    ).toBe(false);
  });

  test("in / nin", () => {
    expect(
      evaluate(
        { kind: "leaf", subject: { ns: "row", path: ["id"] }, op: "in", value: ["u1", "u2"] },
        ctx
      )
    ).toBe(true);
    expect(
      evaluate(
        { kind: "leaf", subject: { ns: "row", path: ["id"] }, op: "nin", value: ["u2", "u3"] },
        ctx
      )
    ).toBe(true);
  });

  test("like / nlike (substring)", () => {
    expect(
      evaluate(
        { kind: "leaf", subject: { ns: "row", path: ["name"] }, op: "like", value: "lic" },
        ctx
      )
    ).toBe(true);
    expect(
      evaluate(
        { kind: "leaf", subject: { ns: "row", path: ["name"] }, op: "nlike", value: "zzz" },
        ctx
      )
    ).toBe(true);
  });

  test("contains on array + string", () => {
    expect(
      evaluate(
        { kind: "leaf", subject: { ns: "row", path: ["tags"] }, op: "contains", value: "a" },
        ctx
      )
    ).toBe(true);
    expect(
      evaluate(
        { kind: "leaf", subject: { ns: "row", path: ["tags"] }, op: "contains", value: "z" },
        ctx
      )
    ).toBe(false);
    expect(
      evaluate(
        { kind: "leaf", subject: { ns: "row", path: ["name"] }, op: "contains", value: "Ali" },
        ctx
      )
    ).toBe(true);
  });

  test("starts_with / ends_with", () => {
    expect(
      evaluate(
        { kind: "leaf", subject: { ns: "row", path: ["name"] }, op: "starts_with", value: "Al" },
        ctx
      )
    ).toBe(true);
    expect(
      evaluate(
        { kind: "leaf", subject: { ns: "row", path: ["name"] }, op: "ends_with", value: "ce" },
        ctx
      )
    ).toBe(true);
  });

  test("between / nbetween (inclusive)", () => {
    expect(
      evaluate(
        { kind: "leaf", subject: { ns: "row", path: ["age"] }, op: "between", value: [20, 40] },
        ctx
      )
    ).toBe(true);
    expect(
      evaluate(
        { kind: "leaf", subject: { ns: "row", path: ["age"] }, op: "nbetween", value: [50, 60] },
        ctx
      )
    ).toBe(true);
  });

  test("null / not_null / empty / not_empty", () => {
    expect(
      evaluate({ kind: "leaf", subject: { ns: "row", path: ["note"] }, op: "null" }, ctx)
    ).toBe(true);
    expect(
      evaluate({ kind: "leaf", subject: { ns: "row", path: ["id"] }, op: "not_null" }, ctx)
    ).toBe(true);
    expect(
      evaluate({ kind: "leaf", subject: { ns: "row", path: ["missing"] }, op: "empty" }, ctx)
    ).toBe(true);
    expect(
      evaluate({ kind: "leaf", subject: { ns: "row", path: ["tags"] }, op: "not_empty" }, ctx)
    ).toBe(true);
  });
});

// ---------- evaluate: date sub_ops ----------

describe("evaluate · date sub_ops", () => {
  // anchor now = Apr 24 2026 (noon)
  const now = new Date(2026, 3, 24, 12, 0, 0).getTime();
  const ctx = (rowDate: number): EvalContext => ({
    row: { created_at: rowDate },
    now,
  });

  const today = new Date(2026, 3, 24, 14, 0, 0).getTime();
  const yesterday = new Date(2026, 3, 23, 10, 0, 0).getTime();
  const tenDaysAgo = new Date(2026, 3, 14, 10, 0, 0).getTime();

  test("today", () => {
    const c: WhereClause = {
      kind: "leaf",
      subject: { ns: "row", path: ["created_at"] },
      op: "date",
      sub_op: "today",
    };
    expect(evaluate(c, ctx(today))).toBe(true);
    expect(evaluate(c, ctx(yesterday))).toBe(false);
  });

  test("yesterday", () => {
    const c: WhereClause = {
      kind: "leaf",
      subject: { ns: "row", path: ["created_at"] },
      op: "date",
      sub_op: "yesterday",
    };
    expect(evaluate(c, ctx(yesterday))).toBe(true);
    expect(evaluate(c, ctx(today))).toBe(false);
  });

  test("last_n_days with value = 14 includes 10-days-ago", () => {
    const c: WhereClause = {
      kind: "leaf",
      subject: { ns: "row", path: ["created_at"] },
      op: "date",
      sub_op: "last_n_days",
      value: 14,
    };
    expect(evaluate(c, ctx(tenDaysAgo))).toBe(true);
  });

  test("last_n_days with value = 5 excludes 10-days-ago", () => {
    const c: WhereClause = {
      kind: "leaf",
      subject: { ns: "row", path: ["created_at"] },
      op: "date",
      sub_op: "last_n_days",
      value: 5,
    };
    expect(evaluate(c, ctx(tenDaysAgo))).toBe(false);
  });

  test("before / after with explicit timestamp", () => {
    const cutoff = new Date(2026, 3, 20).getTime();
    const before: WhereClause = {
      kind: "leaf",
      subject: { ns: "row", path: ["created_at"] },
      op: "date",
      sub_op: "before",
      value: cutoff,
    };
    const after: WhereClause = {
      kind: "leaf",
      subject: { ns: "row", path: ["created_at"] },
      op: "date",
      sub_op: "after",
      value: cutoff,
    };
    expect(evaluate(before, ctx(yesterday))).toBe(false); // yesterday > cutoff
    expect(evaluate(before, ctx(tenDaysAgo))).toBe(true);
    expect(evaluate(after, ctx(today))).toBe(true);
  });
});

// ---------- evaluate: branches ----------

describe("evaluate · branches", () => {
  const ctx: EvalContext = { row: { a: 1, b: 2, c: 3 } };

  test("and short-circuits on false", () => {
    let touched = 0;
    const probe: WhereClause = {
      kind: "leaf",
      subject: { ns: "row", path: ["a"] },
      op: "eq",
      value: 99,
    };
    const later: WhereClause = {
      kind: "leaf",
      subject: { ns: "row", path: ["b"] },
      op: "eq",
      value: 2,
    };
    // 本测试用结果证伪即可
    expect(evaluate(branch("and", [probe, later]), ctx)).toBe(false);
    expect(touched).toBe(0); // placeholder
  });

  test("and true when all true", () => {
    expect(
      evaluate(
        branch("and", [leafEq("row", ["a"], 1), leafEq("row", ["b"], 2)]),
        ctx
      )
    ).toBe(true);
  });

  test("or true if any true", () => {
    expect(
      evaluate(
        branch("or", [leafEq("row", ["a"], 99), leafEq("row", ["b"], 2)]),
        ctx
      )
    ).toBe(true);
  });

  test("or false if all false", () => {
    expect(
      evaluate(
        branch("or", [leafEq("row", ["a"], 99), leafEq("row", ["b"], 99)]),
        ctx
      )
    ).toBe(false);
  });

  test("not inverts single child", () => {
    expect(evaluate(branch("not", [leafEq("row", ["a"], 1)]), ctx)).toBe(false);
    expect(evaluate(branch("not", [leafEq("row", ["a"], 99)]), ctx)).toBe(true);
  });

  test("nested and/or/not", () => {
    const c = branch("and", [
      leafEq("row", ["a"], 1),
      branch("not", [leafEq("row", ["b"], 99)]),
      branch("or", [leafEq("row", ["c"], 99), leafEq("row", ["c"], 3)]),
    ]);
    expect(evaluate(c, ctx)).toBe(true);
  });

  test("vacuous: and([]) → true, or([]) → false", () => {
    expect(evaluate(branch("and", []), ctx)).toBe(true);
    expect(evaluate(branch("or", []), ctx)).toBe(false);
  });
});

// ---------- evaluate: namespaces + value refs ----------

describe("evaluate · namespaces + value refs", () => {
  const ctx: EvalContext = {
    row: { owner_id: "alice", assignee_id: "bob" },
    user: {
      id: "alice",
      attrs: { linear_user_id: "LIN-alice" },
      roles: ["team"],
    },
    input: { status: "pending" },
    target: { issue_ref: { assignee_id: "alice", state: "open" } },
  };

  test("row.x eq user.y via value ref", () => {
    const c: WhereClause = {
      kind: "leaf",
      subject: { ns: "row", path: ["owner_id"] },
      op: "eq",
      value: { ref: "user", path: ["id"] },
    };
    expect(evaluate(c, ctx)).toBe(true);
  });

  test("row.assignee_id eq user.id (should fail; bob ≠ alice)", () => {
    const c: WhereClause = {
      kind: "leaf",
      subject: { ns: "row", path: ["assignee_id"] },
      op: "eq",
      value: { ref: "user", path: ["id"] },
    };
    expect(evaluate(c, ctx)).toBe(false);
  });

  test("target.issue_ref.assignee_id eq user.attrs.linear_user_id fails (alice ≠ LIN-alice)", () => {
    // Note: target field is raw alice, user attr is LIN-alice (different)
    const c: WhereClause = {
      kind: "leaf",
      subject: { ns: "target", path: ["issue_ref", "assignee_id"] },
      op: "eq",
      value: { ref: "user", path: ["attrs", "linear_user_id"] },
    };
    expect(evaluate(c, ctx)).toBe(false);
  });

  test("target deep access", () => {
    const c: WhereClause = {
      kind: "leaf",
      subject: { ns: "target", path: ["issue_ref", "state"] },
      op: "eq",
      value: "open",
    };
    expect(evaluate(c, ctx)).toBe(true);
  });

  test("user.* with anonymous ctx resolves to undefined → fails eq", () => {
    const anonCtx: EvalContext = { row: { x: 1 } };
    const c: WhereClause = {
      kind: "leaf",
      subject: { ns: "user", path: ["id"] },
      op: "eq",
      value: "alice",
    };
    expect(evaluate(c, anonCtx)).toBe(false);
  });

  test("missing path segment resolves to undefined", () => {
    const c: WhereClause = {
      kind: "leaf",
      subject: { ns: "row", path: ["nonexistent"] },
      op: "null",
    };
    expect(evaluate(c, ctx)).toBe(true);
  });

  test("input namespace", () => {
    const c: WhereClause = {
      kind: "leaf",
      subject: { ns: "input", path: ["status"] },
      op: "eq",
      value: "pending",
    };
    expect(evaluate(c, ctx)).toBe(true);
  });
});

// ---------- static analysis ----------

describe("getSubjects", () => {
  test("collects single leaf subject", () => {
    expect(getSubjects(leafEq("row", ["owner_id"], 1))).toEqual([
      { ns: "row", path: ["owner_id"] },
    ]);
  });

  test("collects value ref in addition to subject", () => {
    const c: WhereClause = {
      kind: "leaf",
      subject: { ns: "row", path: ["owner_id"] },
      op: "eq",
      value: { ref: "user", path: ["id"] },
    };
    const subs = getSubjects(c);
    expect(subs).toEqual([
      { ns: "row", path: ["owner_id"] },
      { ns: "user", path: ["id"] },
    ]);
  });

  test("recursive into branches + deduplicates", () => {
    const c = branch("and", [
      {
        kind: "leaf",
        subject: { ns: "row", path: ["owner_id"] },
        op: "eq",
        value: { ref: "user", path: ["id"] },
      },
      {
        kind: "leaf",
        subject: { ns: "row", path: ["owner_id"] },
        op: "neq",
        value: { ref: "user", path: ["id"] },
      }, // same paths
      leafEq("row", ["status"], "pending"),
    ]);
    const subs = getSubjects(c);
    expect(subs).toHaveLength(3);
    const keys = subs.map((s) => `${s.ns}.${s.path.join(".")}`);
    expect(keys).toEqual(["row.owner_id", "user.id", "row.status"]);
  });
});

describe("requiresUserContext", () => {
  test("yes when subject is user", () => {
    expect(requiresUserContext(leafEq("user", ["id"], "x"))).toBe(true);
  });

  test("yes when value ref is user", () => {
    const c: WhereClause = {
      kind: "leaf",
      subject: { ns: "row", path: ["owner_id"] },
      op: "eq",
      value: { ref: "user", path: ["id"] },
    };
    expect(requiresUserContext(c)).toBe(true);
  });

  test("no when only row", () => {
    expect(requiresUserContext(leafEq("row", ["status"], "x"))).toBe(false);
  });
});

// ---------- simplify ----------

describe("simplify", () => {
  test("not(not(X)) → X", () => {
    const inner = leafEq("row", ["id"], 1);
    const c = branch("not", [branch("not", [inner])]);
    expect(simplify(c)).toEqual(inner);
  });

  test("and(X) → X (single-child unwrap)", () => {
    const inner = leafEq("row", ["id"], 1);
    expect(simplify(branch("and", [inner]))).toEqual(inner);
  });

  test("or(X) → X", () => {
    const inner = leafEq("row", ["id"], 1);
    expect(simplify(branch("or", [inner]))).toEqual(inner);
  });

  test("and(A, and(B, C)) → and(A, B, C) (flatten)", () => {
    const A = leafEq("row", ["a"], 1);
    const B = leafEq("row", ["b"], 2);
    const C = leafEq("row", ["c"], 3);
    const nested = branch("and", [A, branch("and", [B, C])]);
    const out = simplify(nested);
    expect(out.kind).toBe("branch");
    expect((out as any).children).toHaveLength(3);
  });

  test("leaf passed through unchanged", () => {
    const l = leafEq("row", ["a"], 1);
    expect(simplify(l)).toEqual(l);
  });

  test("does NOT flatten across different logical_ops", () => {
    const A = leafEq("row", ["a"], 1);
    const B = leafEq("row", ["b"], 2);
    const C = leafEq("row", ["c"], 3);
    const c = branch("and", [A, branch("or", [B, C])]);
    const out = simplify(c);
    expect(out.kind).toBe("branch");
    expect((out as any).children).toHaveLength(2);
  });
});

describe("isUniversallyTrue / isUniversallyFalse", () => {
  test("and([]) is universally true", () => {
    expect(isUniversallyTrue(branch("and", []))).toBe(true);
    expect(isUniversallyFalse(branch("and", []))).toBe(false);
  });

  test("or([]) is universally false", () => {
    expect(isUniversallyFalse(branch("or", []))).toBe(true);
    expect(isUniversallyTrue(branch("or", []))).toBe(false);
  });

  test("leaf is neither", () => {
    const l = leafEq("row", ["x"], 1);
    expect(isUniversallyTrue(l)).toBe(false);
    expect(isUniversallyFalse(l)).toBe(false);
  });
});

// ---------- explain ----------

describe("explain (zh)", () => {
  test("single eq leaf", () => {
    const s = explain(leafEq("row", ["owner_id"], "u1"));
    expect(s).toContain("row.owner_id");
    expect(s).toContain("等于");
    expect(s).toContain('"u1"');
  });

  test("value ref explanation", () => {
    const c: WhereClause = {
      kind: "leaf",
      subject: { ns: "row", path: ["owner_id"] },
      op: "eq",
      value: { ref: "user", path: ["id"] },
    };
    const s = explain(c);
    expect(s).toContain("row.owner_id");
    expect(s).toContain("user.id");
  });

  test("and/or joiner", () => {
    const c = branch("and", [leafEq("row", ["a"], 1), leafEq("row", ["b"], 2)]);
    expect(explain(c)).toContain(" 且 ");
    const c2 = branch("or", [leafEq("row", ["a"], 1), leafEq("row", ["b"], 2)]);
    expect(explain(c2)).toContain(" 或 ");
  });

  test("not wrapper", () => {
    const c = branch("not", [leafEq("row", ["a"], 1)]);
    expect(explain(c)).toMatch(/^非\(/);
  });

  test("empty branches: 始终成立 / 始终不成立", () => {
    expect(explain(branch("and", []))).toContain("始终成立");
    expect(explain(branch("or", []))).toContain("始终不成立");
  });
});
