import { describe, test, expect } from "bun:test";
import { isRef, equalsRef, type Ref } from "../../src/value-objects/ref.js";

describe("Ref · ref-row / ref-external (ADR-0002)", () => {
  test("row ref requires non-empty table + id", () => {
    expect(isRef({ kind: "row", table: "users", id: "u1" })).toBe(true);
    expect(isRef({ kind: "row", table: "", id: "u1" })).toBe(false);
    expect(isRef({ kind: "row", table: "users", id: "" })).toBe(false);
  });

  test("external ref requires adapter + externalType + external_id", () => {
    expect(
      isRef({
        kind: "external",
        adapter: "linear",
        externalType: "Issue",
        external_id: "LIN-42",
      })
    ).toBe(true);
    expect(
      isRef({ kind: "external", adapter: "linear", externalType: "Issue", external_id: "" })
    ).toBe(false);
    expect(
      isRef({ kind: "external", adapter: "", externalType: "Issue", external_id: "LIN-42" })
    ).toBe(false);
  });

  test("rejects unknown kind / null / non-object", () => {
    expect(isRef(null)).toBe(false);
    expect(isRef("user")).toBe(false);
    expect(isRef({ kind: "mystery" })).toBe(false);
    expect(isRef({})).toBe(false);
  });

  test("equalsRef compares all fields", () => {
    const a: Ref = { kind: "row", table: "users", id: "u1" };
    expect(equalsRef(a, { kind: "row", table: "users", id: "u1" })).toBe(true);
    expect(equalsRef(a, { kind: "row", table: "users", id: "u2" })).toBe(false);
    expect(equalsRef(a, { kind: "row", table: "posts", id: "u1" })).toBe(false);

    const e: Ref = {
      kind: "external",
      adapter: "linear",
      externalType: "Issue",
      external_id: "LIN-42",
    };
    expect(
      equalsRef(e, {
        kind: "external",
        adapter: "linear",
        externalType: "Issue",
        external_id: "LIN-42",
      })
    ).toBe(true);
    expect(
      equalsRef(e, {
        kind: "external",
        adapter: "linear",
        externalType: "Issue",
        external_id: "LIN-43",
      })
    ).toBe(false);

    // cross-kind with "same-looking" table/adapter fails
    expect(equalsRef(a, e)).toBe(false);
  });
});
