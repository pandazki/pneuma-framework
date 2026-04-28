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

describe("weekly-linear-digest · Operation output declarations", () => {
  test("bind_linear_identity declares the identity payload returned by its handler", () => {
    const out = objectOutput("bind_linear_identity");
    expect(Object.keys(out.schema.properties).sort()).toEqual([
      "linear_name",
      "linear_user_id",
      "note",
      "pneuma_user_id",
    ]);
    expect(out.schema.required?.slice().sort()).toEqual([
      "linear_name",
      "linear_user_id",
      "note",
      "pneuma_user_id",
    ]);
  });

  test("generate_weekly_digest declares the digest payload returned by its handler", () => {
    const out = objectOutput("generate_weekly_digest");
    expect(Object.keys(out.schema.properties).sort()).toEqual(["body", "digest_id", "source_count"]);
    expect(out.schema.required?.slice().sort()).toEqual(["body", "digest_id", "source_count"]);
  });

  test("delete_digest declares the deleted ids payload returned by its handler", () => {
    const out = objectOutput("delete_digest");
    expect(out.schema.properties.deleted).toEqual({
      type: "array",
      items: { type: "string" },
    });
    expect(out.schema.required).toEqual(["deleted"]);
  });
});
