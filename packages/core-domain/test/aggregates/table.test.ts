import { describe, test, expect } from "bun:test";
import {
  Table,
  TableInvariantViolation,
  RESERVED_COLUMN_NAMES,
  type Relation,
  type TableSource,
  type TableInit,
} from "../../src/aggregates/table.js";
import type { CellType } from "../../src/value-objects/cell-type.js";

const TEXT: CellType = { kind: "primitive", of: "Text" };
const URL_T: CellType = { kind: "primitive", of: "URL" };
const NUM: CellType = { kind: "primitive", of: "Number" };
const STORED: TableSource = { kind: "stored" };

function mkTable(over: Partial<TableInit> = {}): Table {
  return new Table({
    id: "bookmarks",
    app_id: "ai-bookmarks",
    columns: [{ name: "url", type: URL_T }],
    source: STORED,
    ...over,
  });
}

describe("Table · schema aggregate (ADR-0002)", () => {
  describe("construction invariants", () => {
    test("requires id and app_id", () => {
      expect(() => new Table({ id: "", app_id: "x", columns: [], source: STORED })).toThrow(
        TableInvariantViolation
      );
      expect(() => new Table({ id: "t", app_id: "", columns: [], source: STORED })).toThrow(
        TableInvariantViolation
      );
    });

    test("rejects duplicate columns in constructor", () => {
      expect(
        () =>
          new Table({
            id: "t",
            app_id: "a",
            columns: [
              { name: "x", type: TEXT },
              { name: "x", type: NUM },
            ],
            source: STORED,
          })
      ).toThrow(TableInvariantViolation);
    });

    test("rejects reserved column names in constructor (stored tables)", () => {
      for (const name of RESERVED_COLUMN_NAMES) {
        expect(
          () =>
            new Table({
              id: "t",
              app_id: "a",
              columns: [{ name, type: TEXT }],
              source: STORED,
            })
        ).toThrow(TableInvariantViolation);
      }
    });

    test("ALLOWS reserved column names on adapter-backed tables (ADR-0002 amend 2026-04-24)", () => {
      // Linear issues' primary id is just `id`; framework should not block
      for (const name of RESERVED_COLUMN_NAMES) {
        expect(
          () =>
            new Table({
              id: "external",
              app_id: "a",
              columns: [{ name, type: TEXT }],
              source: { kind: "adapter-backed", adapter: "linear", config: {} },
            })
        ).not.toThrow();
      }
    });

    test("rejects invalid CellType in column", () => {
      expect(
        () =>
          new Table({
            id: "t",
            app_id: "a",
            columns: [{ name: "x", type: { kind: "vector", dim: -1 } as unknown as CellType }],
            source: STORED,
          })
      ).toThrow(TableInvariantViolation);
    });
  });

  describe("addColumn", () => {
    test("adds valid column", () => {
      const t = mkTable();
      t.addColumn({ name: "title", type: TEXT });
      expect(t.hasColumn("title")).toBe(true);
      expect(t.columns.map((c) => c.name)).toEqual(["url", "title"]);
    });

    test("rejects duplicate name", () => {
      const t = mkTable();
      expect(() => t.addColumn({ name: "url", type: TEXT })).toThrow(TableInvariantViolation);
    });

    test("rejects reserved name", () => {
      const t = mkTable();
      expect(() => t.addColumn({ name: "id", type: TEXT })).toThrow(TableInvariantViolation);
    });

    test("system_owned table rejects addColumn", () => {
      const t = mkTable({ system_owned: true });
      expect(() => t.addColumn({ name: "x", type: TEXT })).toThrow(TableInvariantViolation);
    });
  });

  describe("dropColumn", () => {
    test("removes existing column on stored table", () => {
      const t = mkTable();
      t.addColumn({ name: "title", type: TEXT });
      t.dropColumn("title");
      expect(t.hasColumn("title")).toBe(false);
    });

    test("rejects on system_owned table", () => {
      const t = mkTable({ system_owned: true });
      expect(() => t.dropColumn("url")).toThrow(TableInvariantViolation);
    });

    test("rejects on adapter-backed source", () => {
      const t = new Table({
        id: "lin-issues",
        app_id: "app",
        columns: [{ name: "state", type: TEXT }],
        source: { kind: "adapter-backed", adapter: "linear", config: {} },
      });
      expect(() => t.dropColumn("state")).toThrow(TableInvariantViolation);
    });

    test("rejects missing column", () => {
      const t = mkTable();
      expect(() => t.dropColumn("nonexistent")).toThrow(TableInvariantViolation);
    });
  });

  describe("changeColumn", () => {
    test("can change type to another valid CellType", () => {
      const t = mkTable();
      t.addColumn({ name: "qty", type: NUM });
      t.changeColumn("qty", { type: TEXT });
      expect(t.getColumn("qty")!.type).toEqual(TEXT);
    });

    test("rejects invalid new CellType", () => {
      const t = mkTable();
      t.addColumn({ name: "qty", type: NUM });
      expect(() =>
        t.changeColumn("qty", { type: { kind: "vector", dim: 0 } as CellType })
      ).toThrow(TableInvariantViolation);
    });

    test("rejects on system_owned", () => {
      const t = mkTable({ system_owned: true });
      expect(() => t.changeColumn("url", { type: TEXT })).toThrow(TableInvariantViolation);
    });

    test("can change nullable / default_access without changing type", () => {
      const t = mkTable();
      t.changeColumn("url", { nullable: true, default_access: "restricted" });
      expect(t.getColumn("url")!.nullable).toBe(true);
      expect(t.getColumn("url")!.default_access).toBe("restricted");
    });
  });

  describe("relations", () => {
    test("addRelation requires local_column to exist", () => {
      const t = mkTable();
      expect(() =>
        t.addRelation({
          name: "interpretations",
          to: "interpretations",
          kind: "has_many",
          via: { kind: "foreign_key", local_column: "missing", remote_column: "bookmark_id" },
        })
      ).toThrow(TableInvariantViolation);
    });

    test("accepts valid relation", () => {
      const t = mkTable();
      t.addColumn({ name: "id_col", type: TEXT });
      const rel: Relation = {
        name: "interpretations",
        to: "interpretations",
        kind: "has_many",
        via: { kind: "foreign_key", local_column: "id_col", remote_column: "bookmark_id" },
        cascade_delete: true,
      };
      t.addRelation(rel);
      expect(t.relations).toHaveLength(1);
      expect(t.relations[0]!.cascade_delete).toBe(true);
    });

    test("removeRelation", () => {
      const t = mkTable();
      t.addColumn({ name: "id_col", type: TEXT });
      t.addRelation({
        name: "r",
        to: "x",
        kind: "has_many",
        via: { kind: "foreign_key", local_column: "id_col", remote_column: "id_col" },
      });
      t.removeRelation("r");
      expect(t.relations).toHaveLength(0);
    });

    test("duplicate relation name rejected", () => {
      const t = mkTable();
      t.addColumn({ name: "fk", type: TEXT });
      t.addRelation({
        name: "r",
        to: "x",
        kind: "belongs_to",
        via: { kind: "foreign_key", local_column: "fk", remote_column: "id" },
      });
      expect(() =>
        t.addRelation({
          name: "r",
          to: "y",
          kind: "belongs_to",
          via: { kind: "foreign_key", local_column: "fk", remote_column: "id" },
        })
      ).toThrow(TableInvariantViolation);
    });
  });

  describe("source variants", () => {
    test("adapter-backed table construction", () => {
      const t = new Table({
        id: "lin-issues",
        app_id: "app",
        columns: [{ name: "state", type: TEXT }],
        source: { kind: "adapter-backed", adapter: "linear", config: {}, externalType: "Issue" },
      });
      expect(t.source.kind).toBe("adapter-backed");
    });

    test("stored allows dropColumn but adapter-backed does not", () => {
      const stored = mkTable();
      stored.addColumn({ name: "extra", type: TEXT });
      expect(() => stored.dropColumn("extra")).not.toThrow();

      const adapter = new Table({
        id: "lin",
        app_id: "app",
        columns: [{ name: "state", type: TEXT }],
        source: { kind: "adapter-backed", adapter: "linear", config: {} },
      });
      expect(() => adapter.dropColumn("state")).toThrow(TableInvariantViolation);
    });
  });
});
