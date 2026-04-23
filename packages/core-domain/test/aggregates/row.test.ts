import { describe, test, expect } from "bun:test";
import { Row, RowInvariantViolation } from "../../src/aggregates/row.js";

describe("Row · per-row aggregate (ADR-0002 §2.2)", () => {
  describe("construction", () => {
    test("requires id / table_id / app_id", () => {
      expect(() => new Row({ id: "", table_id: "t", app_id: "a" })).toThrow(
        RowInvariantViolation
      );
      expect(() => new Row({ id: "r", table_id: "", app_id: "a" })).toThrow(
        RowInvariantViolation
      );
      expect(() => new Row({ id: "r", table_id: "t", app_id: "" })).toThrow(
        RowInvariantViolation
      );
    });

    test("defaults created_at / updated_at to now", () => {
      const t0 = Date.now();
      const r = new Row({ id: "r1", table_id: "t", app_id: "a" });
      expect(r.created_at).toBeGreaterThanOrEqual(t0);
      expect(r.updated_at).toBe(r.created_at);
    });

    test("rejects updated_at < created_at", () => {
      expect(
        () =>
          new Row({
            id: "r",
            table_id: "t",
            app_id: "a",
            created_at: 2000,
            updated_at: 1000,
          })
      ).toThrow(RowInvariantViolation);
    });

    test("initial cells preserved", () => {
      const r = new Row({
        id: "r",
        table_id: "t",
        app_id: "a",
        cells: { url: "https://x", title: "X" },
      });
      expect(r.getCell("url")).toBe("https://x");
      expect(r.getCell("title")).toBe("X");
    });

    test("owner_id optional", () => {
      const withOwner = new Row({ id: "r", table_id: "t", app_id: "a", owner_id: "alice" });
      const without = new Row({ id: "r", table_id: "t", app_id: "a" });
      expect(withOwner.owner_id).toBe("alice");
      expect(without.owner_id).toBeUndefined();
    });
  });

  describe("cell mutation", () => {
    test("setCell bumps updated_at", () => {
      const r = new Row({ id: "r", table_id: "t", app_id: "a", created_at: 1000, updated_at: 1000 });
      r.setCell("title", "Hello", 2000);
      expect(r.getCell("title")).toBe("Hello");
      expect(r.updated_at).toBe(2000);
    });

    test("setCells batch updates with single bump", () => {
      const r = new Row({ id: "r", table_id: "t", app_id: "a", created_at: 1000, updated_at: 1000 });
      r.setCells({ title: "t1", url: "https://x" }, 3000);
      expect(r.getCell("title")).toBe("t1");
      expect(r.getCell("url")).toBe("https://x");
      expect(r.updated_at).toBe(3000);
    });

    test("unsetCell removes key and bumps", () => {
      const r = new Row({
        id: "r", table_id: "t", app_id: "a",
        cells: { x: 1, y: 2 },
        created_at: 100, updated_at: 100,
      });
      expect(r.unsetCell("x", 500)).toBe(true);
      expect(r.hasCell("x")).toBe(false);
      expect(r.hasCell("y")).toBe(true);
      expect(r.updated_at).toBe(500);
    });

    test("unsetCell on missing returns false, no bump", () => {
      const r = new Row({
        id: "r", table_id: "t", app_id: "a",
        created_at: 100, updated_at: 200,
      });
      expect(r.unsetCell("nonexistent", 999)).toBe(false);
      expect(r.updated_at).toBe(200);
    });

    test("setCell with empty name throws", () => {
      const r = new Row({ id: "r", table_id: "t", app_id: "a" });
      expect(() => r.setCell("", "x")).toThrow(RowInvariantViolation);
    });
  });

  describe("cells view", () => {
    test("cells returns readonly snapshot-like map", () => {
      const r = new Row({
        id: "r", table_id: "t", app_id: "a",
        cells: { a: 1, b: 2 },
      });
      const view = r.cells;
      expect(view.size).toBe(2);
      expect(view.get("a")).toBe(1);
      // TypeScript would reject (view as Map).set(...); runtime允许但不应该这么干
    });

    test("toRowView merges aggregate-level + cell fields for WhereClause EvalContext", () => {
      const r = new Row({
        id: "r1",
        table_id: "bookmarks",
        app_id: "app",
        owner_id: "alice",
        cells: { url: "https://x", status: "pending" },
        created_at: 1000,
        updated_at: 2000,
      });
      const v = r.toRowView();
      expect(v.id).toBe("r1");
      expect(v.owner_id).toBe("alice");
      expect(v.created_at).toBe(1000);
      expect(v.updated_at).toBe(2000);
      expect(v.url).toBe("https://x");
      expect(v.status).toBe("pending");
    });

    test("toRowView without owner_id does not include key", () => {
      const r = new Row({ id: "r", table_id: "t", app_id: "a" });
      const v = r.toRowView();
      expect("owner_id" in v).toBe(false);
    });
  });

  describe("diff", () => {
    const base = (): Row =>
      new Row({
        id: "r", table_id: "t", app_id: "a",
        cells: { title: "A", count: 1, tags: ["x"] },
      });

    test("no change → empty", () => {
      const a = base();
      const b = base();
      expect(a.diff(b)).toEqual({});
    });

    test("scalar change", () => {
      const a = base();
      const b = base();
      b.setCell("title", "B");
      const d = a.diff(b);
      expect(d.title).toEqual({ before: "A", after: "B" });
      expect(Object.keys(d)).toEqual(["title"]);
    });

    test("array-of-scalars deep-ish compare", () => {
      const a = base();
      const b = base();
      b.setCell("tags", ["x"]);
      // tags same → no diff
      expect(a.diff(b).tags).toBeUndefined();
      b.setCell("tags", ["x", "y"]);
      expect(a.diff(b).tags).toEqual({ before: ["x"], after: ["x", "y"] });
    });

    test("missing on one side", () => {
      const a = base();
      const b = base();
      b.setCell("new_col", "hi");
      expect(a.diff(b)).toEqual({ new_col: { before: undefined, after: "hi" } });
    });

    test("Uint8Array bytewise compare", () => {
      const r1 = new Row({
        id: "r", table_id: "t", app_id: "a",
        cells: { blob: new Uint8Array([1, 2, 3]) },
      });
      const r2 = new Row({
        id: "r", table_id: "t", app_id: "a",
        cells: { blob: new Uint8Array([1, 2, 3]) },
      });
      expect(r1.diff(r2)).toEqual({});

      r2.setCell("blob", new Uint8Array([1, 2, 4]));
      expect(r1.diff(r2).blob).toBeDefined();
    });
  });
});
