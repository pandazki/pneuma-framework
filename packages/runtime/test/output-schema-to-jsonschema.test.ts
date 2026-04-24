import { describe, test, expect } from "bun:test";
import { outputSchemaToJsonSchema } from "../src/output-schema-to-jsonschema.js";
import type { OperationOutput, CellType } from "@pneuma-framework/core-domain";

describe("outputSchemaToJsonSchema", () => {
  test("void → permissive {}", () => {
    const output: OperationOutput = { kind: "void" };
    expect(outputSchemaToJsonSchema(output)).toEqual({});
  });

  test("row-list → object with opaque rows array", () => {
    const output: OperationOutput = { kind: "row-list", row_type: "bookmarks" };
    expect(outputSchemaToJsonSchema(output)).toEqual({
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: {},
          description: "Array of 'bookmarks' rows (opaque; follow Table schema)",
        },
      },
      required: ["rows"],
      additionalProperties: false,
    });
  });

  test("derived-list → object wrapping rows array with item_schema", () => {
    const itemSchema = {
      type: "object",
      properties: { bookmark_id: { type: "string" }, score: { type: "number" } },
      required: ["bookmark_id", "score"],
    };
    const output: OperationOutput = { kind: "derived-list", item_schema: itemSchema };
    expect(outputSchemaToJsonSchema(output)).toEqual({
      type: "object",
      properties: {
        rows: {
          type: "array",
          items: itemSchema,
        },
      },
      required: ["rows"],
      additionalProperties: false,
    } as unknown as ReturnType<typeof outputSchemaToJsonSchema>);
  });

  test("derived-list without item_schema falls back to opaque items", () => {
    const output: OperationOutput = { kind: "derived-list", item_schema: undefined as unknown };
    const got = outputSchemaToJsonSchema(output);
    expect(
      (got as unknown as { properties: { rows: { items: unknown } } }).properties.rows.items,
    ).toEqual({});
  });

  test("graph → object with nodes + edges arrays (schemas attached when present)", () => {
    const nodeSchema = { type: "object", properties: { id: { type: "string" } }, required: ["id"] };
    const edgeSchema = {
      type: "object",
      properties: { source: { type: "string" }, target: { type: "string" }, score: { type: "number" } },
      required: ["source", "target"],
    };
    const output: OperationOutput = { kind: "graph", node_schema: nodeSchema, edge_schema: edgeSchema };
    const got = outputSchemaToJsonSchema(output);
    expect(got).toEqual({
      type: "object",
      properties: {
        nodes: { type: "array", items: nodeSchema },
        edges: { type: "array", items: edgeSchema },
      },
      required: ["nodes", "edges"],
      additionalProperties: false,
    } as unknown as ReturnType<typeof outputSchemaToJsonSchema>);
  });

  test("graph without schemas falls back to opaque items", () => {
    const output: OperationOutput = { kind: "graph" };
    const got = outputSchemaToJsonSchema(output) as unknown as {
      properties: { nodes: { items: unknown }; edges: { items: unknown } };
    };
    expect(got.properties.nodes.items).toEqual({});
    expect(got.properties.edges.items).toEqual({});
  });

  test("object → the embedded schema, unwrapped", () => {
    const schema = {
      type: "object",
      properties: { summary: { type: "string" }, count: { type: "number" } },
      required: ["summary", "count"],
    };
    const output: OperationOutput = { kind: "object", schema };
    expect(outputSchemaToJsonSchema(output)).toEqual(
      schema as unknown as ReturnType<typeof outputSchemaToJsonSchema>,
    );
  });

  test("object with non-object schema falls back to {}", () => {
    const output: OperationOutput = { kind: "object", schema: undefined as unknown };
    expect(outputSchemaToJsonSchema(output)).toEqual({});
  });

  test("CellType primitive (Text) → { type: 'string' } via cellTypeToJsonSchema", () => {
    const output: OperationOutput = { kind: "primitive", of: "Text" } as CellType;
    expect(outputSchemaToJsonSchema(output)).toEqual({ type: "string" });
  });

  test("CellType vector → fixed-length number array", () => {
    const output: OperationOutput = { kind: "vector", dim: 4 } as CellType;
    expect(outputSchemaToJsonSchema(output)).toEqual({
      type: "array",
      items: { type: "number" },
      minItems: 4,
      maxItems: 4,
    });
  });
});
