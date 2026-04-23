import { describe, test, expect } from "bun:test";
import {
  encodeCellValue,
  decodeCellValue,
} from "../../src/repositories/cell-codec.js";

function roundtrip(v: unknown): unknown {
  const enc = encodeCellValue(v);
  const json = JSON.stringify(enc);
  const parsed = JSON.parse(json);
  return decodeCellValue(parsed);
}

describe("cell-codec · round-trip preservation", () => {
  test("primitives pass through", () => {
    expect(roundtrip("hi")).toBe("hi");
    expect(roundtrip(42)).toBe(42);
    expect(roundtrip(true)).toBe(true);
    expect(roundtrip(null)).toBe(null);
    expect(roundtrip(0)).toBe(0);
  });

  test("arrays of primitives", () => {
    expect(roundtrip([1, 2, 3])).toEqual([1, 2, 3]);
    expect(roundtrip(["a", "b"])).toEqual(["a", "b"]);
    expect(roundtrip([])).toEqual([]);
  });

  test("Ref<row> round-trips as plain JSON object", () => {
    const ref = { kind: "row", table: "users", id: "u1" };
    expect(roundtrip(ref)).toEqual(ref);
  });

  test("Ref<external> round-trips", () => {
    const ref = {
      kind: "external",
      adapter: "linear",
      externalType: "Issue",
      external_id: "LIN-1",
    };
    expect(roundtrip(ref)).toEqual(ref);
  });

  test("Uint8Array round-trips BYTEWISE (base64 tagged)", () => {
    const bytes = new Uint8Array([1, 2, 3, 0, 255, 127]);
    const back = roundtrip(bytes);
    expect(back).toBeInstanceOf(Uint8Array);
    expect((back as Uint8Array).length).toBe(6);
    for (let i = 0; i < 6; i++) {
      expect((back as Uint8Array)[i]).toBe(bytes[i]!);
    }
  });

  test("Uint8Array inside array", () => {
    const back = roundtrip([
      "label",
      new Uint8Array([9, 8, 7]),
      42,
    ]) as unknown[];
    expect(back[0]).toBe("label");
    expect(back[1]).toBeInstanceOf(Uint8Array);
    expect(Array.from(back[1] as Uint8Array)).toEqual([9, 8, 7]);
    expect(back[2]).toBe(42);
  });

  test("Uint8Array inside nested object (e.g. json cell with embedded blob)", () => {
    const v = {
      meta: { author: "alice" },
      payload: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    };
    const back = roundtrip(v) as {
      meta: { author: string };
      payload: Uint8Array;
    };
    expect(back.meta.author).toBe("alice");
    expect(back.payload).toBeInstanceOf(Uint8Array);
    expect(Array.from(back.payload)).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  test("Ref inside ref-row-list array round-trips", () => {
    const list = [
      { kind: "row", table: "tags", id: "t-a" },
      { kind: "row", table: "tags", id: "t-b" },
    ];
    expect(roundtrip(list)).toEqual(list);
  });

  test("JSON-cell nested structures deep round-trip", () => {
    const attrs = {
      linear_user_id: "LIN-alice",
      prefs: { lang: "zh", density: "compact" },
      tags: ["admin", "beta"],
      empty: [],
      nested_nothing: null,
    };
    expect(roundtrip(attrs)).toEqual(attrs);
  });

  test("empty Uint8Array", () => {
    const back = roundtrip(new Uint8Array([])) as Uint8Array;
    expect(back).toBeInstanceOf(Uint8Array);
    expect(back.length).toBe(0);
  });

  test("large Uint8Array (256 bytes)", () => {
    const src = new Uint8Array(256);
    for (let i = 0; i < 256; i++) src[i] = i;
    const back = roundtrip(src) as Uint8Array;
    expect(back.length).toBe(256);
    for (let i = 0; i < 256; i++) expect(back[i]).toBe(i);
  });
});
