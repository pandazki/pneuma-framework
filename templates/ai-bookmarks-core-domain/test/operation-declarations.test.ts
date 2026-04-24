// Regression tests pinning the Operation output declarations in
// templates/ai-bookmarks-core-domain/server/config.ts.
//
// Context (2026-04-25): the 2026-04-25 codex follow-up review of the P0
// Operation Semantics Cleanup flagged that four Ops declared
// `output: { kind: "void" }` while their handlers actually return
// agent-useful payloads (bookmark_id / lens_id / deleted / counts).
// Since Task 4 of P0, `/api/config` emits `output_schema` derived from
// `output`, so a void declaration silently erases the contract that
// agents / MCP tooling rely on.
//
// Each test below asserts the on-the-wire output shape declared on the
// Operation matches what the handler returns. Keep this in sync when
// handler return shapes evolve.

import { describe, expect, it } from "bun:test";
import { operations } from "../server/config.js";

function findOp(id: string) {
  const op = operations.find((o) => o.id === id);
  if (!op) throw new Error(`Operation "${id}" not found in config.operations`);
  return op;
}

type ObjectOutput = {
  kind: "object";
  schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

function asObjectOutput(output: unknown): ObjectOutput {
  expect((output as { kind?: unknown }).kind).toBe("object");
  const oo = output as ObjectOutput;
  expect(oo.schema.type).toBe("object");
  return oo;
}

describe("ai-bookmarks-core-domain · Operation output declarations", () => {
  it("add_bookmark declares full bookmark summary object", () => {
    const op = findOp("add_bookmark");
    const out = asObjectOutput(op.output);
    expect(Object.keys(out.schema.properties).sort()).toEqual(
      ["bookmark_id", "interpretation_count", "title", "total_lenses", "url"]
    );
    expect(out.schema.required?.sort()).toEqual(
      ["bookmark_id", "interpretation_count", "total_lenses", "url"]
    );
  });

  it("upsert_lens declares { lens_id, created } object", () => {
    const op = findOp("upsert_lens");
    const out = asObjectOutput(op.output);
    expect(Object.keys(out.schema.properties).sort()).toEqual(["created", "lens_id"]);
    expect(out.schema.required?.sort()).toEqual(["created", "lens_id"]);
  });

  it("delete_lens declares { deleted } object", () => {
    const op = findOp("delete_lens");
    const out = asObjectOutput(op.output);
    expect(Object.keys(out.schema.properties)).toEqual(["deleted"]);
    expect(out.schema.required).toEqual(["deleted"]);
  });

  it("delete_bookmark declares { deleted } object", () => {
    const op = findOp("delete_bookmark");
    const out = asObjectOutput(op.output);
    expect(Object.keys(out.schema.properties)).toEqual(["deleted"]);
    expect(out.schema.required).toEqual(["deleted"]);
  });
});
