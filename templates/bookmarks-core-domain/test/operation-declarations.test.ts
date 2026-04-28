import { describe, expect, test } from "bun:test";
import { operations } from "../server/config.js";

type ObjectOutput = {
  readonly kind: "object";
  readonly schema: {
    readonly type: "object";
    readonly properties: Record<string, unknown>;
    readonly required?: readonly string[];
  };
};

function objectOutput(id: string): ObjectOutput {
  const op = operations.find((candidate) => candidate.id === id);
  if (!op) throw new Error(`Operation "${id}" not found`);
  expect(op.output.kind).toBe("object");
  return op.output as ObjectOutput;
}

describe("bookmarks-core-domain · Operation output declarations", () => {
  test("add_bookmark declares the id/url payload returned by its handler", () => {
    const out = objectOutput("add_bookmark");
    expect(Object.keys(out.schema.properties).sort()).toEqual(["id", "url"]);
    expect(out.schema.required?.slice().sort()).toEqual(["id", "url"]);
  });

  test("delete_bookmark declares the deleted ids payload returned by its handler", () => {
    const out = objectOutput("delete_bookmark");
    expect(out.schema.properties.deleted).toEqual({
      type: "array",
      items: { type: "string" },
    });
    expect(out.schema.required).toEqual(["deleted"]);
  });
});
