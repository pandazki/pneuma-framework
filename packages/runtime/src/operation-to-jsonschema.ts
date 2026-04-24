// operation-to-jsonschema.ts
// Converts a core-domain InputSchema (and its constituent CellType values)
// into a plain JSON Schema object that can be embedded in /api/config responses
// and consumed by outer layers that cannot import @pneuma-framework/core-domain.
//
// This file lives in `packages/runtime` (the core-domain boundary) and imports
// the core-domain types ONLY here. Packages upstream (core, cli, …) must use
// the emitted JSON Schema rather than the domain types directly.

import type { InputSchema, InputSchemaField } from "@pneuma-framework/core-domain";
import type { CellType } from "@pneuma-framework/core-domain";

// JSON Schema subset we emit. Kept intentionally narrow — we only need what
// agents care about, not a full draft-7 implementation.
export type JsonSchema =
  | { type: "string"; description?: string }
  | { type: "number"; description?: string }
  | { type: "boolean"; description?: string }
  | { type: "array"; items: JsonSchema; minItems?: number; maxItems?: number; description?: string }
  | {
      type: "object";
      properties: Record<string, JsonSchema>;
      required: string[];
      additionalProperties: false;
      description?: string;
    }
  | Record<string, never>; // permissive empty schema fallback

/**
 * Convert a core-domain `CellType` discriminated union to a JSON Schema node.
 * Unknown / unsupported kinds fall through to the empty permissive object `{}`.
 */
export function cellTypeToJsonSchema(ct: CellType): JsonSchema {
  switch (ct.kind) {
    case "primitive": {
      switch (ct.of) {
        case "Text":
        case "RichText":
        case "URL":
          return { type: "string" };
        case "Number":
          return { type: "number" };
        case "Bool":
          return { type: "boolean" };
        case "Date":
          return { type: "number", description: "timestamp in ms" };
        case "Duration":
          return { type: "number", description: "duration in ms" };
        default: {
          // Exhaustiveness guard — future PrimitiveCellType additions
          const _never: never = ct.of;
          void _never;
          return {};
        }
      }
    }
    case "vector":
      return {
        type: "array",
        items: { type: "number" },
        minItems: ct.dim,
        maxItems: ct.dim,
      };
    case "json":
      // If a schema is present and looks like a JSON Schema object, use it
      // directly; otherwise emit permissive empty object.
      if (ct.schema && typeof ct.schema === "object" && !Array.isArray(ct.schema)) {
        return ct.schema as JsonSchema;
      }
      return {};
    case "ref-row":
      return { type: "string", description: `ID of row in '${ct.table}' table` };
    case "ref-row-list":
      return {
        type: "array",
        items: {
          type: "string",
          description: `ID of row in '${ct.table}' table`,
        },
      };
    case "ref-external":
      return {
        type: "string",
        description: `External ${ct.externalType} reference via ${ct.adapter}`,
      };
    case "blob":
      return { type: "string", description: `Base64 ${ct.mime} content` };
    case "derived":
      // Derived cells are computed server-side; not typical agent input.
      return {};
    default: {
      // Exhaustiveness guard
      const _never: never = ct;
      void _never;
      return {};
    }
  }
}

/**
 * Convert a core-domain `InputSchema` to a top-level JSON Schema.
 *
 * Supported kinds:
 *   - `{ type: "record", fields: {...} }` → `{ type: "object", properties, required, additionalProperties: false }`
 *
 * Unsupported / future kinds fall through to `{}` (permissive).
 */
export function inputSchemaToJsonSchema(input: InputSchema): JsonSchema {
  if (input.type === "record") {
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];

    for (const [name, field] of Object.entries(input.fields) as [string, InputSchemaField][]) {
      properties[name] = cellTypeToJsonSchema(field.type);
      // A field appears in the JSON Schema `required` array only when it is
      // explicitly marked as required. Fields with `required` absent or false
      // are optional (omittable by the agent).
      if (field.required === true) {
        required.push(name);
      }
    }

    return {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    };
  }

  // Unsupported input kind — return permissive empty schema
  return {};
}
