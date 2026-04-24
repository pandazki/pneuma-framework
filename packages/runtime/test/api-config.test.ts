// Tests for GET /api/config — operation introspection endpoint.
//
// Verifies that the endpoint returns app_id + rich per-operation metadata
// (id, action, resource, input, output, affects, handler_kind) so the outer
// LifecycleOrchestrator can build agent-visible tool descriptors without
// spinning up the AppRuntime itself.

import { describe, test, expect } from "bun:test";
import {
  bootAppRuntime,
  handleHttp,
  type AppConfig,
  type HttpRequestContext,
  inputSchemaToJsonSchema,
  cellTypeToJsonSchema,
} from "../src/index.js";
import {
  Table,
  Operation,
  PolicySet,
  Subjects,
  Resources,
  type HandlerFn,
  type CellType,
  type InputSchema,
} from "@pneuma-framework/core-domain";

const APP = "api-config-test";
const TEXT: CellType = { kind: "primitive", of: "Text" };
const URL_T: CellType = { kind: "primitive", of: "URL" };

// ---------- helpers ----------

function mkReq(
  method: string,
  pathname: string,
  opts: { body?: unknown } = {}
): HttpRequestContext {
  const headers = new Headers();
  return {
    method,
    pathname,
    searchParams: new URLSearchParams(),
    headers,
    readBody: async () => opts.body,
  };
}

// Minimal config with exactly two operations: one code handler + one query handler.
function twoOpConfig(): AppConfig {
  const bookmarks = new Table({
    id: "bookmarks",
    app_id: APP,
    columns: [
      { name: "url", type: URL_T },
      { name: "title", type: TEXT, nullable: true },
    ],
    source: { kind: "stored" },
  });

  // code handler (mutation)
  const addBookmark = new Operation({
    id: "add_bookmark",
    app_id: APP,
    name: "Add bookmark",
    description: "Creates a new bookmark row",
    input: {
      type: "record",
      fields: {
        url: { type: URL_T, required: true },
        title: { type: TEXT },
      },
    },
    output: { kind: "void" },
    affects: {
      mutations: ["bookmarks"],
      adapter_writes: [],
      reads_only: false,
      destructive: false,
    },
    handler: { kind: "code", ref: "./ops/add_bookmark.ts" },
  });

  // query handler (reads-only)
  const listBookmarks = new Operation({
    id: "list_bookmarks",
    app_id: APP,
    name: "List bookmarks",
    description: "Returns all bookmarks",
    input: { type: "record", fields: {} },
    output: { kind: "row-list", row_type: "bookmarks" },
    affects: {
      mutations: [],
      adapter_writes: [],
      reads_only: true,
      destructive: false,
    },
    handler: {
      kind: "query",
      on: "bookmarks",
      sort: [{ column: "url", dir: "asc" }],
      pagination: { kind: "cursor", size: 25 },
    },
  });

  const policy = new PolicySet({ app_id: APP });
  policy.addRule({
    id: "allow-all",
    allow: [Subjects.anyone(), Subjects.anonymous()],
    do: ["invoke"],
    on: Resources.operation("add_bookmark"),
  });
  policy.addRule({
    id: "allow-list",
    allow: [Subjects.anyone(), Subjects.anonymous()],
    do: ["invoke"],
    on: Resources.operation("list_bookmarks"),
  });

  const handlers: Record<string, HandlerFn> = {
    "./ops/add_bookmark.ts": async ({ input, storage }) => {
      const i = input as { url: string; title?: string };
      const id = `bm-${Date.now()}`;
      const { Row } = await import("@pneuma-framework/core-domain");
      const row = new Row({
        id,
        table_id: "bookmarks",
        app_id: APP,
        cells: { url: i.url, ...(i.title !== undefined ? { title: i.title } : {}) },
      });
      await storage.saveRow(row);
      return { id };
    },
  };

  return {
    app_id: APP,
    tables: [bookmarks],
    operations: [addBookmark, listBookmarks],
    policy,
    handlers,
  };
}

// ---------- test suite ----------

describe("GET /api/config — operation introspection", () => {
  test("200 + correct app_id and operations array of length 2", async () => {
    const runtime = await bootAppRuntime(twoOpConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/config"));
    expect(resp.status).toBe(200);

    const body = resp.body as {
      app_id: string;
      operations: unknown[];
    };
    expect(body.app_id).toBe(APP);
    expect(Array.isArray(body.operations)).toBe(true);
    expect(body.operations).toHaveLength(2);

    await runtime.close();
  });

  test("each operation entry has all required fields", async () => {
    const runtime = await bootAppRuntime(twoOpConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/config"));

    type OpEntry = {
      id: string;
      action: string;
      resource: unknown;
      input: unknown;
      output: unknown;
      affects: unknown;
      handler_kind: string;
    };
    const body = resp.body as { app_id: string; operations: OpEntry[] };

    for (const op of body.operations) {
      expect(typeof op.id).toBe("string");
      expect(op.id.length).toBeGreaterThan(0);
      expect(typeof op.action).toBe("string");
      expect(op.resource).toBeDefined();
      expect(op.input).toBeDefined();
      expect(op.output).toBeDefined();
      expect(op.affects).toBeDefined();
      expect(op.handler_kind === "code" || op.handler_kind === "query").toBe(true);
    }

    await runtime.close();
  });

  test("handler_kind is 'code' for code handler and 'query' for query handler", async () => {
    const runtime = await bootAppRuntime(twoOpConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/config"));

    const body = resp.body as {
      operations: Array<{ id: string; handler_kind: string }>;
    };

    const add = body.operations.find((o) => o.id === "add_bookmark");
    const list = body.operations.find((o) => o.id === "list_bookmarks");

    expect(add).toBeDefined();
    expect(list).toBeDefined();
    expect(add!.handler_kind).toBe("code");
    expect(list!.handler_kind).toBe("query");

    await runtime.close();
  });

  test("input, output, affects are deep-equal to the Operation aggregate's stored shape", async () => {
    const runtime = await bootAppRuntime(twoOpConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/config"));

    const body = resp.body as {
      operations: Array<{
        id: string;
        input: unknown;
        output: unknown;
        affects: unknown;
      }>;
    };

    const add = body.operations.find((o) => o.id === "add_bookmark")!;
    expect(add.input).toEqual({
      type: "record",
      fields: {
        url: { type: URL_T, required: true },
        title: { type: TEXT },
      },
    });
    expect(add.output).toEqual({ kind: "void" });
    expect(add.affects).toEqual({
      mutations: ["bookmarks"],
      adapter_writes: [],
      reads_only: false,
      destructive: false,
    });

    const list = body.operations.find((o) => o.id === "list_bookmarks")!;
    expect(list.input).toEqual({ type: "record", fields: {} });
    expect(list.output).toEqual({ kind: "row-list", row_type: "bookmarks" });
    expect(list.affects).toEqual({
      mutations: [],
      adapter_writes: [],
      reads_only: true,
      destructive: false,
    });

    await runtime.close();
  });

  test("action and resource are correctly derived from Operation shape", async () => {
    const runtime = await bootAppRuntime(twoOpConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/config"));

    const body = resp.body as {
      operations: Array<{
        id: string;
        action: string;
        resource: unknown;
      }>;
    };

    // code handler, non-destructive mutation → action="write", resource derived from affects.mutations
    const add = body.operations.find((o) => o.id === "add_bookmark")!;
    expect(add.action).toBe("write");
    expect(add.resource).toEqual({ kind: "table", table: "bookmarks" });

    // query handler, reads_only → action="read", resource derived from handler.on
    const list = body.operations.find((o) => o.id === "list_bookmarks")!;
    expect(list.action).toBe("read");
    expect(list.resource).toEqual({ kind: "table", table: "bookmarks" });

    await runtime.close();
  });

  test("POST /api/config → 405 method_not_allowed", async () => {
    const runtime = await bootAppRuntime(twoOpConfig());
    const resp = await handleHttp(runtime, mkReq("POST", "/api/config", { body: {} }));
    expect(resp.status).toBe(405);
    const body = resp.body as { error: string };
    expect(body.error).toBe("method_not_allowed");
    await runtime.close();
  });

  test("each operation entry includes input_schema field", async () => {
    const runtime = await bootAppRuntime(twoOpConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/config"));
    const body = resp.body as {
      operations: Array<{ id: string; input_schema: unknown }>;
    };
    for (const op of body.operations) {
      expect(op.input_schema).toBeDefined();
      expect(typeof op.input_schema).toBe("object");
    }
    await runtime.close();
  });

  test("add_bookmark input_schema has correct required and optional fields", async () => {
    const runtime = await bootAppRuntime(twoOpConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/config"));
    const body = resp.body as {
      operations: Array<{
        id: string;
        input_schema: {
          type: string;
          properties: Record<string, unknown>;
          required: string[];
          additionalProperties: boolean;
        };
      }>;
    };
    const add = body.operations.find((o) => o.id === "add_bookmark")!;
    expect(add).toBeDefined();
    const s = add.input_schema;
    expect(s.type).toBe("object");
    expect(s.additionalProperties).toBe(false);
    // url is required: true → appears in required[]
    expect(s.required).toContain("url");
    // title has no required flag → NOT in required[]
    expect(s.required).not.toContain("title");
    expect(s.properties.url).toEqual({ type: "string" });
    expect(s.properties.title).toEqual({ type: "string" });
    await runtime.close();
  });
});

// ---------- inputSchemaToJsonSchema unit tests ----------

describe("inputSchemaToJsonSchema — standalone converter", () => {
  test("record with required + optional fields emits correct JSON Schema", () => {
    const input: InputSchema = {
      type: "record",
      fields: {
        url: { type: { kind: "primitive", of: "URL" }, required: true },
        count: { type: { kind: "primitive", of: "Number" }, required: false },
      },
    };
    const schema = inputSchemaToJsonSchema(input);
    expect(schema).toEqual({
      type: "object",
      properties: {
        url: { type: "string" },
        count: { type: "number" },
      },
      required: ["url"],
      additionalProperties: false,
    });
  });

  test("record with no required fields → empty required array", () => {
    const input: InputSchema = {
      type: "record",
      fields: {
        note: { type: { kind: "primitive", of: "Text" } },
      },
    };
    const schema = inputSchemaToJsonSchema(input);
    expect(schema).toMatchObject({ type: "object", required: [] });
  });

  test("empty record fields → empty object schema", () => {
    const input: InputSchema = { type: "record", fields: {} };
    const schema = inputSchemaToJsonSchema(input);
    expect(schema).toEqual({
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    });
  });
});

// ---------- cellTypeToJsonSchema unit tests ----------

describe("cellTypeToJsonSchema — CellType conversions", () => {
  test("primitive Text / RichText / URL → { type: string }", () => {
    const text: CellType = { kind: "primitive", of: "Text" };
    expect(cellTypeToJsonSchema(text)).toEqual({ type: "string" });
    const rich: CellType = { kind: "primitive", of: "RichText" };
    expect(cellTypeToJsonSchema(rich)).toEqual({ type: "string" });
    const url: CellType = { kind: "primitive", of: "URL" };
    expect(cellTypeToJsonSchema(url)).toEqual({ type: "string" });
  });

  test("primitive Number → { type: number }", () => {
    const ct: CellType = { kind: "primitive", of: "Number" };
    expect(cellTypeToJsonSchema(ct)).toEqual({ type: "number" });
  });

  test("primitive Bool → { type: boolean }", () => {
    const ct: CellType = { kind: "primitive", of: "Bool" };
    expect(cellTypeToJsonSchema(ct)).toEqual({ type: "boolean" });
  });

  test("primitive Date / Duration → { type: number, description: ... }", () => {
    const d: CellType = { kind: "primitive", of: "Date" };
    const schema = cellTypeToJsonSchema(d);
    expect(schema).toMatchObject({ type: "number" });
    const dur: CellType = { kind: "primitive", of: "Duration" };
    expect(cellTypeToJsonSchema(dur)).toMatchObject({ type: "number" });
  });

  test("vector → correctly-dimensioned array schema", () => {
    const ct: CellType = { kind: "vector", dim: 3 };
    expect(cellTypeToJsonSchema(ct)).toEqual({
      type: "array",
      items: { type: "number" },
      minItems: 3,
      maxItems: 3,
    });
  });

  test("json with schema → returned verbatim", () => {
    const innerSchema = { type: "object", properties: { x: { type: "number" } } };
    const ct: CellType = { kind: "json", schema: innerSchema };
    // Cast to unknown since `innerSchema` is a partial JSON Schema not in our narrow union
    expect(cellTypeToJsonSchema(ct) as unknown).toEqual(innerSchema);
  });

  test("json without schema → empty permissive object", () => {
    const ct: CellType = { kind: "json" };
    expect(cellTypeToJsonSchema(ct)).toEqual({});
  });

  test("ref-row → string ID with description", () => {
    const ct: CellType = { kind: "ref-row", table: "bookmarks" };
    const schema = cellTypeToJsonSchema(ct);
    expect(schema).toMatchObject({ type: "string" });
    expect((schema as { description?: string }).description).toContain("bookmarks");
  });

  test("ref-row-list → array of string IDs with description", () => {
    const ct: CellType = { kind: "ref-row-list", table: "tags" };
    const schema = cellTypeToJsonSchema(ct);
    expect(schema).toMatchObject({ type: "array" });
    const items = (schema as { items?: { description?: string } }).items;
    expect(items?.description).toContain("tags");
  });

  test("ref-external → string with description", () => {
    const ct: CellType = { kind: "ref-external", adapter: "github", externalType: "repo" };
    const schema = cellTypeToJsonSchema(ct);
    expect(schema).toMatchObject({ type: "string" });
    expect((schema as { description?: string }).description).toContain("github");
    expect((schema as { description?: string }).description).toContain("repo");
  });

  test("blob → base64 string with mime description", () => {
    const ct: CellType = { kind: "blob", mime: "image/png" };
    const schema = cellTypeToJsonSchema(ct);
    expect(schema).toMatchObject({ type: "string" });
    expect((schema as { description?: string }).description).toContain("image/png");
  });

  test("derived → empty permissive object (not typical agent input)", () => {
    const ct: CellType = {
      kind: "derived",
      transform: "some_fn",
      output: { kind: "primitive", of: "Number" },
    };
    expect(cellTypeToJsonSchema(ct)).toEqual({});
  });
});
