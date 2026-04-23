import { describe, test, expect } from "bun:test";
import {
  isCellType,
  equalsCellType,
  PRIMITIVE_CELL_TYPES,
  type CellType,
} from "../../src/value-objects/cell-type.js";

describe("CellType · closed type set (ADR-0002)", () => {
  describe("isCellType runtime guard", () => {
    test("accepts all 7 primitive kinds", () => {
      for (const of of PRIMITIVE_CELL_TYPES) {
        expect(isCellType({ kind: "primitive", of })).toBe(true);
      }
    });

    test("rejects unknown primitive", () => {
      expect(isCellType({ kind: "primitive", of: "Int64" })).toBe(false);
      expect(isCellType({ kind: "primitive", of: "" })).toBe(false);
    });

    test("vector requires finite positive dim", () => {
      expect(isCellType({ kind: "vector", dim: 384 })).toBe(true);
      expect(isCellType({ kind: "vector", dim: 1 })).toBe(true);
      expect(isCellType({ kind: "vector", dim: 0 })).toBe(false);
      expect(isCellType({ kind: "vector", dim: -1 })).toBe(false);
      expect(isCellType({ kind: "vector", dim: Infinity })).toBe(false);
      expect(isCellType({ kind: "vector", dim: Number.NaN })).toBe(false);
    });

    test("blob requires non-empty mime", () => {
      expect(isCellType({ kind: "blob", mime: "image/png" })).toBe(true);
      expect(isCellType({ kind: "blob", mime: "*/*" })).toBe(true);
      expect(isCellType({ kind: "blob", mime: "" })).toBe(false);
    });

    test("ref-row / ref-row-list require non-empty table id", () => {
      expect(isCellType({ kind: "ref-row", table: "users" })).toBe(true);
      expect(isCellType({ kind: "ref-row-list", table: "bookmarks" })).toBe(true);
      expect(isCellType({ kind: "ref-row", table: "" })).toBe(false);
      expect(isCellType({ kind: "ref-row-list", table: "" })).toBe(false);
    });

    test("ref-external requires adapter + externalType", () => {
      expect(
        isCellType({ kind: "ref-external", adapter: "linear", externalType: "Issue" })
      ).toBe(true);
      expect(
        isCellType({ kind: "ref-external", adapter: "", externalType: "Issue" })
      ).toBe(false);
      expect(
        isCellType({ kind: "ref-external", adapter: "linear", externalType: "" })
      ).toBe(false);
    });

    test("derived recursively validates output", () => {
      const ok: CellType = {
        kind: "derived",
        transform: "summarize",
        output: { kind: "primitive", of: "Text" },
      };
      expect(isCellType(ok)).toBe(true);

      const badInner = {
        kind: "derived",
        transform: "summarize",
        output: { kind: "vector", dim: -1 },
      };
      expect(isCellType(badInner)).toBe(false);

      const missingTransform = {
        kind: "derived",
        transform: "",
        output: { kind: "primitive", of: "Text" },
      };
      expect(isCellType(missingTransform)).toBe(false);
    });

    test("rejects null, non-object, unknown kind, missing kind", () => {
      expect(isCellType(null)).toBe(false);
      expect(isCellType(undefined)).toBe(false);
      expect(isCellType("Text")).toBe(false);
      expect(isCellType(42)).toBe(false);
      expect(isCellType({})).toBe(false);
      expect(isCellType({ kind: "mystery" })).toBe(false);
    });
  });

  describe("equalsCellType structural equality", () => {
    test("same primitive", () => {
      expect(
        equalsCellType(
          { kind: "primitive", of: "Text" },
          { kind: "primitive", of: "Text" }
        )
      ).toBe(true);
    });

    test("different primitive", () => {
      expect(
        equalsCellType(
          { kind: "primitive", of: "Text" },
          { kind: "primitive", of: "RichText" }
        )
      ).toBe(false);
    });

    test("different kind", () => {
      expect(
        equalsCellType(
          { kind: "primitive", of: "Text" },
          { kind: "vector", dim: 384 }
        )
      ).toBe(false);
    });

    test("vector with different dim", () => {
      expect(
        equalsCellType({ kind: "vector", dim: 384 }, { kind: "vector", dim: 768 })
      ).toBe(false);
    });

    test("ref-row vs ref-row-list with same table are not equal", () => {
      expect(
        equalsCellType(
          { kind: "ref-row", table: "users" },
          { kind: "ref-row-list", table: "users" }
        )
      ).toBe(false);
    });

    test("ref-external needs both adapter and externalType to match", () => {
      const a: CellType = { kind: "ref-external", adapter: "linear", externalType: "Issue" };
      expect(
        equalsCellType(a, { kind: "ref-external", adapter: "linear", externalType: "Issue" })
      ).toBe(true);
      expect(
        equalsCellType(a, { kind: "ref-external", adapter: "linear", externalType: "Project" })
      ).toBe(false);
      expect(
        equalsCellType(a, { kind: "ref-external", adapter: "github", externalType: "Issue" })
      ).toBe(false);
    });

    test("derived compares transform and inner recursively", () => {
      const nested1: CellType = {
        kind: "derived",
        transform: "summarize",
        output: { kind: "primitive", of: "Text" },
      };
      const nested2: CellType = {
        kind: "derived",
        transform: "summarize",
        output: { kind: "primitive", of: "Text" },
      };
      const nested3: CellType = {
        kind: "derived",
        transform: "summarize",
        output: { kind: "primitive", of: "RichText" },
      };
      expect(equalsCellType(nested1, nested2)).toBe(true);
      expect(equalsCellType(nested1, nested3)).toBe(false);
    });
  });
});
