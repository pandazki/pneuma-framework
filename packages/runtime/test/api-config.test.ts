// Tests for GET /api/config — operation introspection endpoint.
//
// Verifies that the endpoint returns app_id + rich per-operation metadata
// (id, action, resource, input, output, affects, handler_kind) plus table
// schema metadata so outer layers can build agent-visible tool descriptors
// and compare definition changes without importing core-domain.

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
  View,
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
  opts: { body?: unknown; headers?: Record<string, string> } = {}
): HttpRequestContext {
  const headers = new Headers();
  for (const [key, value] of Object.entries(opts.headers ?? {})) {
    headers.set(key, value);
  }
  return {
    method,
    pathname,
    searchParams: new URLSearchParams(),
    headers,
    readBody: async () => opts.body,
  };
}

// Minimal config with four operations covering all five OperationOutput kinds
// that matter on the wire:
//   - add_bookmark           : code handler, output `object`
//   - list_bookmarks         : query handler, output `row-list`
//   - related_bookmarks_stub : code handler (reads_only), output `derived-list`
//   - bookmark_graph_stub    : code handler (reads_only), output `graph`
// `object` is exercised in output-schema-to-jsonschema.test.ts; this fixture
// pins that derived-list + graph also flow correctly through the full
// configResponse pipeline (I2 of final P0 review).
function fourOpConfig(): AppConfig {
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
    output: {
      kind: "object",
      schema: {
        type: "object",
        properties: {
          id: { type: "string" },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
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

  // code handler, reads-only, derived-list output (ADR-0018 amend pattern)
  const relatedBookmarksStub = new Operation({
    id: "related_bookmarks_stub",
    app_id: APP,
    name: "Related bookmarks (stub)",
    description: "Returns top-K similar bookmarks.",
    input: { type: "record", fields: {} },
    output: {
      kind: "derived-list",
      item_schema: {
        type: "object",
        properties: {
          bookmark_id: { type: "string" },
          score: { type: "number" },
        },
        required: ["bookmark_id", "score"],
      },
    },
    affects: {
      mutations: [],
      adapter_writes: [],
      reads_only: true,
      destructive: false,
    },
    handler: { kind: "code", ref: "./ops/related_bookmarks_stub.ts" },
  });

  // code handler, reads-only, graph output (ADR-0018 amend pattern)
  const bookmarkGraphStub = new Operation({
    id: "bookmark_graph_stub",
    app_id: APP,
    name: "Bookmark graph (stub)",
    description: "Returns { nodes, edges } similarity graph.",
    input: { type: "record", fields: {} },
    output: {
      kind: "graph",
      node_schema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
      edge_schema: {
        type: "object",
        properties: {
          source: { type: "string" },
          target: { type: "string" },
        },
        required: ["source", "target"],
      },
    },
    affects: {
      mutations: [],
      adapter_writes: [],
      reads_only: true,
      destructive: false,
    },
    handler: { kind: "code", ref: "./ops/bookmark_graph_stub.ts" },
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
  policy.addRule({
    id: "allow-related",
    allow: [Subjects.anyone(), Subjects.anonymous()],
    do: ["invoke"],
    on: Resources.operation("related_bookmarks_stub"),
  });
  policy.addRule({
    id: "allow-graph",
    allow: [Subjects.anyone(), Subjects.anonymous()],
    do: ["invoke"],
    on: Resources.operation("bookmark_graph_stub"),
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
    "./ops/related_bookmarks_stub.ts": async () => ({ rows: [] }),
    "./ops/bookmark_graph_stub.ts": async () => ({ nodes: [], edges: [] }),
  };

  return {
    app_id: APP,
    tables: [bookmarks],
    operations: [addBookmark, listBookmarks, relatedBookmarksStub, bookmarkGraphStub],
    views: [
      new View({
        id: "bookmark_index",
        app_id: APP,
        name: "Bookmark Index",
        description: "End-user table view backed by the list_bookmarks Operation",
        kind: "table",
        source: { kind: "operation", operation_id: "list_bookmarks" },
        presentation: { columns: ["url", "title"] },
      }),
    ],
    policy,
    handlers,
  };
}

function viewPolicyConfig(policy: PolicySet): AppConfig {
  const base = fourOpConfig();
  return {
    ...base,
    policy,
  };
}

// ---------- test suite ----------

describe("GET /api/config — operation introspection", () => {
  test("200 + correct app_id and operations array includes framework definition ops", async () => {
    const runtime = await bootAppRuntime(fourOpConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/config"));
    expect(resp.status).toBe(200);

    const body = resp.body as {
      app_id: string;
      operations: unknown[];
    };
    expect(body.app_id).toBe(APP);
    expect(Array.isArray(body.operations)).toBe(true);
    // 4 template ops + 11 framework-injected definition/policy operations.
    expect(body.operations).toHaveLength(15);

    await runtime.close();
  });

  test("each operation entry has all required fields", async () => {
    const runtime = await bootAppRuntime(fourOpConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/config"));

    type OpEntry = {
      id: string;
      action: string;
      resource: unknown;
      input: unknown;
      output: unknown;
      affects: unknown;
      handler_kind: string;
      invocation_method: string;
      surface: unknown;
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
      expect(op.invocation_method === "GET" || op.invocation_method === "POST").toBe(true);
      expect(op.surface).toBeDefined();
    }

    await runtime.close();
  });

  test("surface classifies template app Operations separately from framework-internal Operations", async () => {
    const runtime = await bootAppRuntime(fourOpConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/config"));
    const body = resp.body as {
      operations: Array<{
        id: string;
        surface: {
          agent_callable: boolean;
          public_surface: boolean;
          view_mountable: boolean;
          framework_internal: boolean;
        };
      }>;
    };

    const list = body.operations.find((o) => o.id === "list_bookmarks")!;
    expect(list.surface).toEqual({
      agent_callable: true,
      public_surface: true,
      view_mountable: true,
      framework_internal: false,
    });

    const addView = body.operations.find((o) => o.id === "add_view")!;
    expect(addView.surface).toEqual({
      agent_callable: true,
      public_surface: false,
      view_mountable: false,
      framework_internal: true,
    });

    await runtime.close();
  });

  test("includes table entries with column schemas and row_schema", async () => {
    const runtime = await bootAppRuntime(fourOpConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/config"));
    const body = resp.body as {
      tables: Array<{
        id: string;
        source: unknown;
        system_owned: boolean;
        columns: Array<{ name: string; schema: unknown; nullable: boolean }>;
        row_schema: {
          type: string;
          properties: Record<string, unknown>;
          required: string[];
          additionalProperties: boolean;
        };
      }>;
    };

    expect(Array.isArray(body.tables)).toBe(true);
    const bookmarks = body.tables.find((t) => t.id === "bookmarks")!;
    expect(bookmarks).toBeDefined();
    expect(bookmarks.source).toEqual({ kind: "stored" });
    expect(bookmarks.system_owned).toBe(false);
    expect(bookmarks.columns.map((c) => c.name).sort()).toEqual(["title", "url"]);
    expect(bookmarks.columns.find((c) => c.name === "url")!.schema).toEqual({ type: "string" });
    expect(bookmarks.columns.find((c) => c.name === "title")!.nullable).toBe(true);
    expect(bookmarks.row_schema).toEqual({
      type: "object",
      properties: {
        url: { type: "string" },
        title: { type: "string" },
      },
      required: ["url"],
      additionalProperties: false,
    });

    const tablesSystem = body.tables.find((t) => t.id === "pneuma_tables")!;
    expect(tablesSystem.system_owned).toBe(true);
    expect(tablesSystem.columns.map((c) => c.name)).toContain("definition_version");
    const columnsSystem = body.tables.find((t) => t.id === "pneuma_table_columns")!;
    expect(columnsSystem.system_owned).toBe(true);
    expect(columnsSystem.columns.map((c) => c.name)).toContain("definition_version");

    await runtime.close();
  });

  test("handler_kind is 'code' for code handler and 'query' for query handler", async () => {
    const runtime = await bootAppRuntime(fourOpConfig());
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

  test("invocation_method distinguishes query GET from code POST, including reads_only computed code", async () => {
    const runtime = await bootAppRuntime(fourOpConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/config"));
    const body = resp.body as {
      operations: Array<{ id: string; invocation_method: string; handler_kind: string; affects: { reads_only: boolean } }>;
    };

    expect(body.operations.find((o) => o.id === "list_bookmarks")).toMatchObject({
      handler_kind: "query",
      invocation_method: "GET",
      affects: { reads_only: true },
    });
    expect(body.operations.find((o) => o.id === "add_bookmark")).toMatchObject({
      handler_kind: "code",
      invocation_method: "POST",
      affects: { reads_only: false },
    });
    expect(body.operations.find((o) => o.id === "related_bookmarks_stub")).toMatchObject({
      handler_kind: "code",
      invocation_method: "POST",
      affects: { reads_only: true },
    });

    await runtime.close();
  });

  test("input, output, affects are deep-equal to the Operation aggregate's stored shape", async () => {
    const runtime = await bootAppRuntime(fourOpConfig());
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
    expect(add.output).toEqual({
      kind: "object",
      schema: {
        type: "object",
        properties: {
          id: { type: "string" },
        },
        required: ["id"],
        additionalProperties: false,
      },
    });
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
    const runtime = await bootAppRuntime(fourOpConfig());
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

  test("views include request-scoped visibility decisions when visible", async () => {
    const runtime = await bootAppRuntime(fourOpConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/config"));
    const body = resp.body as {
      views: Array<{
        id: string;
        source: { operation_id: string };
        visibility: {
          visible: boolean;
          view_read: { decision: string; reason: string; matched_rule_ids: string[] };
          source_operation_invoke: {
            decision: string;
            reason: string;
            matched_rule_ids: string[];
          };
        };
      }>;
    };

    const view = body.views.find((v) => v.id === "bookmark_index")!;
    expect(view).toBeDefined();
    expect(view.source.operation_id).toBe("list_bookmarks");
    expect(view.visibility.visible).toBe(true);
    expect(view.visibility.view_read).toMatchObject({
      decision: "allow",
      reason: "default-public",
    });
    expect(view.visibility.source_operation_invoke).toMatchObject({
      decision: "allow",
      reason: "explicit-allow",
    });
    expect(view.visibility.source_operation_invoke.matched_rule_ids).toContain("allow-list");

    await runtime.close();
  });

  test("includes policy_rules as app-definition surface", async () => {
    const runtime = await bootAppRuntime(fourOpConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/config"));
    const body = resp.body as {
      policy_rules: Array<{
        id: string;
        effect: "allow" | "deny";
        actions: string[];
        resource: unknown;
        allow: unknown[];
      }>;
      policy_default_posture: { app: "public" | "restricted" };
    };

    expect(body.policy_default_posture).toEqual({ app: "public" });
    expect(body.policy_rules.some((rule) =>
      rule.id === "allow-list"
      && rule.effect === "allow"
      && rule.actions.includes("invoke")
      && JSON.stringify(rule.resource) === JSON.stringify(Resources.operation("list_bookmarks"))
    )).toBe(true);
    expect(body.policy_rules.some((rule) => rule.id === "framework-allow-add_policy_rule")).toBe(true);

    await runtime.close();
  });

  test("restricted apps hide views without an explicit read rule", async () => {
    const policy = new PolicySet({
      app_id: APP,
      default_posture: { app: "restricted" },
    });
    policy.addRule({
      id: "alice-can-invoke-list",
      allow: [Subjects.user("alice")],
      do: ["invoke"],
      on: Resources.operation("list_bookmarks"),
    });

    const runtime = await bootAppRuntime(viewPolicyConfig(policy));
    const resp = await handleHttp(
      runtime,
      mkReq("GET", "/api/config", { headers: { "x-pneuma-user-id": "alice" } })
    );
    const body = resp.body as { views: Array<{ id: string }> };

    expect(body.views.map((v) => v.id)).not.toContain("bookmark_index");

    await runtime.close();
  });

  test("restricted apps hide views when the source Operation is not invokable", async () => {
    const policy = new PolicySet({
      app_id: APP,
      default_posture: { app: "restricted" },
    });
    policy.addRule({
      id: "alice-can-read-view",
      allow: [Subjects.user("alice")],
      do: ["read"],
      on: Resources.view("bookmark_index"),
    });

    const runtime = await bootAppRuntime(viewPolicyConfig(policy));
    const resp = await handleHttp(
      runtime,
      mkReq("GET", "/api/config", { headers: { "x-pneuma-user-id": "alice" } })
    );
    const body = resp.body as { views: Array<{ id: string }> };

    expect(body.views.map((v) => v.id)).not.toContain("bookmark_index");

    await runtime.close();
  });

  test("restricted apps expose views only when view read and source invoke both allow", async () => {
    const policy = new PolicySet({
      app_id: APP,
      default_posture: { app: "restricted" },
    });
    policy.addRule({
      id: "alice-can-read-view",
      allow: [Subjects.user("alice")],
      do: ["read"],
      on: Resources.view("bookmark_index"),
    });
    policy.addRule({
      id: "alice-can-invoke-list",
      allow: [Subjects.user("alice")],
      do: ["invoke"],
      on: Resources.operation("list_bookmarks"),
    });

    const runtime = await bootAppRuntime(viewPolicyConfig(policy));
    const aliceResp = await handleHttp(
      runtime,
      mkReq("GET", "/api/config", { headers: { "x-pneuma-user-id": "alice" } })
    );
    const bobResp = await handleHttp(
      runtime,
      mkReq("GET", "/api/config", { headers: { "x-pneuma-user-id": "bob" } })
    );
    const aliceBody = aliceResp.body as {
      views: Array<{
        id: string;
        visibility: {
          view_read: { matched_rule_ids: string[] };
          source_operation_invoke: { matched_rule_ids: string[] };
        };
      }>;
    };
    const bobBody = bobResp.body as { views: Array<{ id: string }> };

    const view = aliceBody.views.find((v) => v.id === "bookmark_index")!;
    expect(view).toBeDefined();
    expect(view.visibility.view_read.matched_rule_ids).toContain("alice-can-read-view");
    expect(view.visibility.source_operation_invoke.matched_rule_ids).toContain(
      "alice-can-invoke-list"
    );
    expect(bobBody.views.map((v) => v.id)).not.toContain("bookmark_index");

    await runtime.close();
  });

  test("GET query-backed Operations enforce invoke policy", async () => {
    const policy = new PolicySet({
      app_id: APP,
      default_posture: { app: "restricted" },
    });

    const runtime = await bootAppRuntime(viewPolicyConfig(policy));
    const resp = await handleHttp(
      runtime,
      mkReq("GET", "/api/operations/list_bookmarks", {
        headers: { "x-pneuma-user-id": "alice" },
      })
    );

    expect(resp.status).toBe(403);
    expect(resp.body).toMatchObject({
      error: "policy_denied",
      reason: "default-restricted-no-match",
    });
    expect(runtime.debugSink.events).toContainEqual(
      expect.objectContaining({
        category: "access",
        audit: true,
        payload: expect.objectContaining({
          decision: "deny",
          action: "invoke",
          resource: { kind: "operation", id: "list_bookmarks" },
        }),
      })
    );

    await runtime.close();
  });

  test("POST /api/config → 405 method_not_allowed", async () => {
    const runtime = await bootAppRuntime(fourOpConfig());
    const resp = await handleHttp(runtime, mkReq("POST", "/api/config", { body: {} }));
    expect(resp.status).toBe(405);
    const body = resp.body as { error: string };
    expect(body.error).toBe("method_not_allowed");
    await runtime.close();
  });

  test("each operation entry includes input_schema field", async () => {
    const runtime = await bootAppRuntime(fourOpConfig());
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
    const runtime = await bootAppRuntime(fourOpConfig());
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

  test("each operation entry includes output_schema", async () => {
    const runtime = await bootAppRuntime(fourOpConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/config"));
    const body = resp.body as {
      operations: Array<{ id: string; output_schema: unknown }>;
    };
    for (const op of body.operations) {
      expect(op.output_schema).toBeDefined();
      expect(typeof op.output_schema).toBe("object");
    }
    await runtime.close();
  });

  test("add_bookmark output_schema reflects object handler payload", async () => {
    const runtime = await bootAppRuntime(fourOpConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/config"));
    const body = resp.body as {
      operations: Array<{
        id: string;
        output_schema: {
          type: string;
          properties: Record<string, unknown>;
          required: string[];
          additionalProperties: boolean;
        };
      }>;
    };
    const add = body.operations.find((o) => o.id === "add_bookmark")!;
    expect(add.output_schema).toEqual({
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    });
    await runtime.close();
  });

  test("list_bookmarks output_schema reflects row-list → rows array", async () => {
    const runtime = await bootAppRuntime(fourOpConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/config"));
    const body = resp.body as {
      operations: Array<{
        id: string;
        output_schema: {
          type: string;
          properties: { rows: { type: string } };
          required: string[];
        };
      }>;
    };
    const list = body.operations.find((o) => o.id === "list_bookmarks")!;
    expect(list.output_schema.type).toBe("object");
    expect(list.output_schema.properties.rows.type).toBe("array");
    expect(list.output_schema.required).toContain("rows");
    await runtime.close();
  });

  test("related_bookmarks_stub output_schema reflects derived-list → rows array wrapping item_schema", async () => {
    const runtime = await bootAppRuntime(fourOpConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/config"));
    const body = resp.body as {
      operations: Array<{
        id: string;
        output_schema: {
          type: string;
          properties: { rows: { type: string; items: unknown } };
          required: string[];
          additionalProperties: boolean;
        };
      }>;
    };
    const op = body.operations.find((o) => o.id === "related_bookmarks_stub")!;
    expect(op.output_schema.type).toBe("object");
    expect(op.output_schema.properties.rows.type).toBe("array");
    expect(op.output_schema.properties.rows.items).toEqual({
      type: "object",
      properties: { bookmark_id: { type: "string" }, score: { type: "number" } },
      required: ["bookmark_id", "score"],
    });
    expect(op.output_schema.required).toContain("rows");
    expect(op.output_schema.additionalProperties).toBe(false);
    await runtime.close();
  });

  test("bookmark_graph_stub output_schema reflects graph → { nodes, edges } with schemas", async () => {
    const runtime = await bootAppRuntime(fourOpConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/config"));
    const body = resp.body as {
      operations: Array<{
        id: string;
        output_schema: {
          type: string;
          properties: {
            nodes: { type: string; items: unknown };
            edges: { type: string; items: unknown };
          };
          required: string[];
          additionalProperties: boolean;
        };
      }>;
    };
    const op = body.operations.find((o) => o.id === "bookmark_graph_stub")!;
    expect(op.output_schema.type).toBe("object");
    expect(op.output_schema.properties.nodes.type).toBe("array");
    expect(op.output_schema.properties.edges.type).toBe("array");
    expect(op.output_schema.required).toEqual(expect.arrayContaining(["nodes", "edges"]));
    expect(op.output_schema.additionalProperties).toBe(false);
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
