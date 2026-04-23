import { describe, test, expect } from "bun:test";
import type { CellType } from "../../src/value-objects/cell-type.js";
import type { Ref } from "../../src/value-objects/ref.js";
import {
  isValidCellValue,
  assertCellValue,
} from "../../src/value-objects/cell.js";

describe("Cell · value-type matching (ADR-0002)", () => {
  describe("primitives", () => {
    const text: CellType = { kind: "primitive", of: "Text" };
    const num: CellType = { kind: "primitive", of: "Number" };
    const bool: CellType = { kind: "primitive", of: "Bool" };
    const date: CellType = { kind: "primitive", of: "Date" };
    const dur: CellType = { kind: "primitive", of: "Duration" };
    const url: CellType = { kind: "primitive", of: "URL" };

    test("Text accepts string", () => {
      expect(isValidCellValue(text, "hi")).toBe(true);
      expect(isValidCellValue(text, "")).toBe(true);
      expect(isValidCellValue(text, 42)).toBe(false);
      expect(isValidCellValue(text, null)).toBe(false);
    });

    test("Number accepts finite number, not Infinity / NaN", () => {
      expect(isValidCellValue(num, 42)).toBe(true);
      expect(isValidCellValue(num, 0)).toBe(true);
      expect(isValidCellValue(num, -1.5)).toBe(true);
      expect(isValidCellValue(num, Infinity)).toBe(false);
      expect(isValidCellValue(num, Number.NaN)).toBe(false);
      expect(isValidCellValue(num, "42")).toBe(false);
    });

    test("Bool accepts boolean strictly", () => {
      expect(isValidCellValue(bool, true)).toBe(true);
      expect(isValidCellValue(bool, false)).toBe(true);
      expect(isValidCellValue(bool, 0)).toBe(false);
      expect(isValidCellValue(bool, "true")).toBe(false);
    });

    test("Date accepts unix-ms number (canonical in-memory form)", () => {
      expect(isValidCellValue(date, Date.now())).toBe(true);
      expect(isValidCellValue(date, 0)).toBe(true);
      expect(isValidCellValue(date, "2026-04-24")).toBe(false);
      expect(isValidCellValue(date, new Date())).toBe(false);
    });

    test("Duration accepts finite millisecond number", () => {
      expect(isValidCellValue(dur, 1000)).toBe(true);
      expect(isValidCellValue(dur, 0)).toBe(true);
      expect(isValidCellValue(dur, -1)).toBe(true); // duration 可以负，如"提前"
    });

    test("URL accepts string (MVP 不做协议校验)", () => {
      expect(isValidCellValue(url, "https://example.com")).toBe(true);
      expect(isValidCellValue(url, "not-a-url")).toBe(true);
      expect(isValidCellValue(url, 42)).toBe(false);
    });
  });

  describe("vector", () => {
    const vec3: CellType = { kind: "vector", dim: 3 };

    test("matches exact dim", () => {
      expect(isValidCellValue(vec3, [0.1, 0.2, 0.3])).toBe(true);
    });

    test("rejects wrong dim", () => {
      expect(isValidCellValue(vec3, [0.1, 0.2])).toBe(false);
      expect(isValidCellValue(vec3, [0.1, 0.2, 0.3, 0.4])).toBe(false);
    });

    test("rejects non-number entries / NaN / Infinity", () => {
      expect(isValidCellValue(vec3, [0.1, 0.2, "x"])).toBe(false);
      expect(isValidCellValue(vec3, [0.1, 0.2, Number.NaN])).toBe(false);
      expect(isValidCellValue(vec3, [0.1, 0.2, Infinity])).toBe(false);
    });

    test("rejects non-array", () => {
      expect(isValidCellValue(vec3, "vector")).toBe(false);
    });
  });

  describe("blob", () => {
    const png: CellType = { kind: "blob", mime: "image/png" };

    test("accepts Uint8Array", () => {
      expect(isValidCellValue(png, new Uint8Array([1, 2, 3]))).toBe(true);
    });

    test("accepts base64 string (serialization form)", () => {
      expect(isValidCellValue(png, "AQID")).toBe(true);
    });

    test("rejects other", () => {
      expect(isValidCellValue(png, [1, 2, 3])).toBe(false);
      expect(isValidCellValue(png, 42)).toBe(false);
    });
  });

  describe("ref-row", () => {
    const refUsers: CellType = { kind: "ref-row", table: "users" };
    const ref: Ref = { kind: "row", table: "users", id: "u1" };

    test("accepts row ref to matching table", () => {
      expect(isValidCellValue(refUsers, ref)).toBe(true);
    });

    test("rejects row ref to wrong table", () => {
      const wrong: Ref = { kind: "row", table: "posts", id: "p1" };
      expect(isValidCellValue(refUsers, wrong)).toBe(false);
    });

    test("rejects external ref", () => {
      const external: Ref = {
        kind: "external",
        adapter: "linear",
        externalType: "Issue",
        external_id: "LIN-1",
      };
      expect(isValidCellValue(refUsers, external)).toBe(false);
    });
  });

  describe("ref-row-list", () => {
    const listUsers: CellType = { kind: "ref-row-list", table: "users" };

    test("accepts empty list", () => {
      expect(isValidCellValue(listUsers, [])).toBe(true);
    });

    test("accepts list of matching row refs", () => {
      const refs: Ref[] = [
        { kind: "row", table: "users", id: "u1" },
        { kind: "row", table: "users", id: "u2" },
      ];
      expect(isValidCellValue(listUsers, refs)).toBe(true);
    });

    test("rejects list with one wrong-table ref", () => {
      const refs: Ref[] = [
        { kind: "row", table: "users", id: "u1" },
        { kind: "row", table: "posts", id: "p1" },
      ];
      expect(isValidCellValue(listUsers, refs)).toBe(false);
    });
  });

  describe("ref-external", () => {
    const linIssue: CellType = {
      kind: "ref-external",
      adapter: "linear",
      externalType: "Issue",
    };

    test("matching adapter + externalType", () => {
      const ref: Ref = {
        kind: "external",
        adapter: "linear",
        externalType: "Issue",
        external_id: "LIN-1",
      };
      expect(isValidCellValue(linIssue, ref)).toBe(true);
    });

    test("wrong adapter rejected", () => {
      const ref: Ref = {
        kind: "external",
        adapter: "github",
        externalType: "Issue",
        external_id: "g#1",
      };
      expect(isValidCellValue(linIssue, ref)).toBe(false);
    });

    test("wrong externalType rejected", () => {
      const ref: Ref = {
        kind: "external",
        adapter: "linear",
        externalType: "Project",
        external_id: "LIN-PROJ-1",
      };
      expect(isValidCellValue(linIssue, ref)).toBe(false);
    });
  });

  describe("derived", () => {
    test("derived validates inner output type", () => {
      const derivedText: CellType = {
        kind: "derived",
        transform: "summarize",
        output: { kind: "primitive", of: "Text" },
      };
      expect(isValidCellValue(derivedText, "summary")).toBe(true);
      expect(isValidCellValue(derivedText, 42)).toBe(false);
    });
  });

  describe("assertCellValue", () => {
    test("throws on mismatch, with reason", () => {
      const t: CellType = { kind: "primitive", of: "Number" };
      expect(() => assertCellValue(t, "not-a-number")).toThrow(/Number/);
    });

    test("no throw on valid", () => {
      const t: CellType = { kind: "primitive", of: "Bool" };
      expect(() => assertCellValue(t, true)).not.toThrow();
    });
  });
});
