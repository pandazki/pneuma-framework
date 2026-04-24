// output-schema-to-jsonschema.ts
// Mirror of input-schema-to-jsonschema.ts for OperationOutput.
//
// Emitted shape describes `response.output` (the handler's return value),
// NOT the full `{ output, impact, events }` HTTP envelope. Consumers
// (MCP bridge, future UI generation) combine this with envelope knowledge
// as needed.
//
// JSON-Schema payloads embedded in `derived-list` / `graph` / `object`
// outputs are treated as opaque passthroughs — if they are object-typed
// we use them verbatim, otherwise fall through to permissive {}.

import type { OperationOutput, CellType } from "@pneuma-framework/core-domain";
import { cellTypeToJsonSchema, type JsonSchema } from "./operation-to-jsonschema.js";

function isJsonSchemaObject(v: unknown): v is Record<string, unknown> {
  return v !== null && v !== undefined && typeof v === "object" && !Array.isArray(v);
}

export function outputSchemaToJsonSchema(output: OperationOutput): JsonSchema {
  // CellType branch — discriminated on having `kind` set to any CellType tag.
  // OperationOutput's `void` / `row-list` / `derived-list` / `graph` / `object`
  // use distinct `kind` values that never collide with CellType's `primitive` /
  // `vector` / `blob` / `json` / `ref-row` / `ref-row-list` / `ref-external` /
  // `derived` tags.
  if (
    output.kind === "primitive" ||
    output.kind === "vector" ||
    output.kind === "blob" ||
    output.kind === "json" ||
    output.kind === "ref-row" ||
    output.kind === "ref-row-list" ||
    output.kind === "ref-external" ||
    output.kind === "derived"
  ) {
    return cellTypeToJsonSchema(output as CellType);
  }

  switch (output.kind) {
    case "void":
      return {};

    case "row-list": {
      return {
        type: "object",
        properties: {
          rows: {
            type: "array",
            items: {},
            description: `Array of '${output.row_type}' rows (opaque; follow Table schema)`,
          },
        },
        required: ["rows"],
        additionalProperties: false,
      };
    }

    case "derived-list": {
      const items = isJsonSchemaObject(output.item_schema)
        ? (output.item_schema as unknown as JsonSchema)
        : ({} as JsonSchema);
      return {
        type: "object",
        properties: {
          rows: {
            type: "array",
            items,
          },
        },
        required: ["rows"],
        additionalProperties: false,
      };
    }

    case "graph": {
      const nodeItems = isJsonSchemaObject(output.node_schema)
        ? (output.node_schema as unknown as JsonSchema)
        : ({} as JsonSchema);
      const edgeItems = isJsonSchemaObject(output.edge_schema)
        ? (output.edge_schema as unknown as JsonSchema)
        : ({} as JsonSchema);
      return {
        type: "object",
        properties: {
          nodes: { type: "array", items: nodeItems },
          edges: { type: "array", items: edgeItems },
        },
        required: ["nodes", "edges"],
        additionalProperties: false,
      };
    }

    case "object": {
      if (isJsonSchemaObject(output.schema)) {
        return output.schema as unknown as JsonSchema;
      }
      return {};
    }

    default: {
      // Exhaustiveness guard
      const _never: never = output as never;
      void _never;
      return {};
    }
  }
}
