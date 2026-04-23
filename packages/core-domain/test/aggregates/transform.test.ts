import { describe, test, expect } from "bun:test";
import {
  Transform,
  TransformInvariantViolation,
  type TransformInit,
  type TransformInputShape,
} from "../../src/aggregates/transform.js";
import type { CellType } from "../../src/value-objects/cell-type.js";

const TEXT: CellType = { kind: "primitive", of: "Text" };
const RICH: CellType = { kind: "primitive", of: "RichText" };

function mkInit(over: Partial<TransformInit> = {}): TransformInit {
  return {
    id: "t1",
    app_id: "app",
    in: { kind: "cell", type: TEXT },
    out: RICH,
    impl: { kind: "code", ref: "./transforms/echo.ts" },
    purity: "pure",
    ...over,
  };
}

describe("Transform · ADR-0003 aggregate", () => {
  test("id / app_id / out required", () => {
    expect(() => new Transform(mkInit({ id: "" }))).toThrow(TransformInvariantViolation);
    expect(() => new Transform(mkInit({ app_id: "" }))).toThrow(TransformInvariantViolation);
    expect(() =>
      new Transform(mkInit({ out: { kind: "vector", dim: -1 } as CellType }))
    ).toThrow(TransformInvariantViolation);
  });

  test("code impl requires non-empty ref", () => {
    expect(() =>
      new Transform(mkInit({ impl: { kind: "code", ref: "" } }))
    ).toThrow(TransformInvariantViolation);
  });

  test("prompt impl requires model and system", () => {
    expect(() =>
      new Transform(
        mkInit({ impl: { kind: "prompt", model: "", system: "x" } })
      )
    ).toThrow(TransformInvariantViolation);
    expect(() =>
      new Transform(
        mkInit({ impl: { kind: "prompt", model: "claude", system: "" } })
      )
    ).toThrow(TransformInvariantViolation);
  });

  test("purity=pure-with-ttl requires ttl_seconds > 0", () => {
    expect(() =>
      new Transform(mkInit({ purity: "pure-with-ttl" }))
    ).toThrow(TransformInvariantViolation);
    expect(() =>
      new Transform(mkInit({ purity: "pure-with-ttl", ttl_seconds: 0 }))
    ).toThrow(TransformInvariantViolation);
    const t = new Transform(
      mkInit({ purity: "pure-with-ttl", ttl_seconds: 60 })
    );
    expect(t.ttl_seconds).toBe(60);
  });

  test("ttl_seconds without pure-with-ttl rejected", () => {
    expect(() =>
      new Transform(mkInit({ purity: "pure", ttl_seconds: 60 }))
    ).toThrow(TransformInvariantViolation);
    expect(() =>
      new Transform(mkInit({ purity: "impure", ttl_seconds: 60 }))
    ).toThrow(TransformInvariantViolation);
  });

  test("input shape variants valid", () => {
    const forms: TransformInputShape[] = [
      { kind: "cell", type: TEXT },
      { kind: "row", table: "bookmarks" },
      { kind: "row-list", table: "bookmarks" },
      { kind: "record", fields: { a: TEXT, b: RICH } },
    ];
    for (const in_ of forms) {
      expect(() => new Transform(mkInit({ in: in_ }))).not.toThrow();
    }
  });

  test("input shape rejects empty table / invalid CellType in record", () => {
    expect(() =>
      new Transform(mkInit({ in: { kind: "row", table: "" } }))
    ).toThrow(TransformInvariantViolation);
    expect(() =>
      new Transform(
        mkInit({
          in: { kind: "record", fields: { bad: { kind: "vector", dim: -1 } as CellType } },
        })
      )
    ).toThrow(TransformInvariantViolation);
  });

  test("isPure / isCacheable", () => {
    expect(new Transform(mkInit({ purity: "pure" })).isPure()).toBe(true);
    expect(
      new Transform(mkInit({ purity: "pure-with-ttl", ttl_seconds: 10 })).isCacheable()
    ).toBe(true);
    expect(new Transform(mkInit({ purity: "impure" })).isCacheable()).toBe(false);
  });

  test("prompt impl variant accepted", () => {
    const t = new Transform(
      mkInit({
        impl: {
          kind: "prompt",
          model: "anthropic/claude-haiku",
          system: "Summarize ...",
        },
      })
    );
    expect(t.impl.kind).toBe("prompt");
  });
});
