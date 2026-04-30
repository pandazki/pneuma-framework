// Tests for template-mcp-bridge
//
// Strategy: export the handler logic (buildToolList, callOperation,
// fetchOperations) and test them in-process. This avoids flaky subprocess
// stdio wiring while still covering all meaningful behaviour.

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { buildToolList, callOperation } from "../bin/template-mcp-bridge.js";
import type { } from "../bin/template-mcp-bridge.js";

// ---- helpers ----

type DiscoveredOperation = Parameters<typeof buildToolList>[0][number];

const FOO_OP: DiscoveredOperation = {
  id: "foo",
  action: "write",
  affects: { reads_only: false, destructive: false },
  input_schema: {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
    additionalProperties: false,
  },
};

const BAR_OP: DiscoveredOperation = {
  id: "bar",
  action: "read",
  affects: { reads_only: true, destructive: false },
  input_schema: { type: "object", properties: {}, required: [] },
};

// ---- Test 1: bridge lists tools ----

describe("buildToolList", () => {
  test("returns op.<id> tool for each operation", () => {
    const tools = buildToolList([FOO_OP, BAR_OP]);
    expect(tools).toHaveLength(2);
    expect(tools[0]!.name).toBe("op.foo");
    expect(tools[1]!.name).toBe("op.bar");
  });

  test("inputSchema matches operation.input_schema when object-typed", () => {
    const tools = buildToolList([FOO_OP]);
    expect(tools[0]!.inputSchema).toEqual(FOO_OP.input_schema);
  });

  test("inputSchema falls back to permissive {} when input_schema is absent", () => {
    const noSchema: DiscoveredOperation = { ...FOO_OP, id: "baz", input_schema: undefined };
    const tools = buildToolList([noSchema]);
    expect(tools[0]!.name).toBe("op.baz");
    expect((tools[0]!.inputSchema as Record<string, unknown>).type).toBe("object");
    expect(Object.keys(tools[0]!.inputSchema as object)).toHaveLength(1);
  });

  test("description includes action and destructive flag", () => {
    const tools = buildToolList([FOO_OP]);
    expect(tools[0]!.description).toMatch(/action=write/);
    expect(tools[0]!.description).toMatch(/destructive=false/);
  });

  test("destructive=true is reflected in description", () => {
    const destructiveOp: DiscoveredOperation = {
      ...FOO_OP,
      id: "drop",
      action: "delete",
      affects: { destructive: true },
    };
    const tools = buildToolList([destructiveOp]);
    expect(tools[0]!.description).toMatch(/destructive=true/);
  });

  test("tool description mentions output kind", () => {
    const derived: DiscoveredOperation = {
      id: "related_bookmarks",
      action: "read",
      affects: { reads_only: true, destructive: false },
      input_schema: { type: "object", properties: {}, required: [] },
      output: { kind: "derived-list", item_schema: {} },
      output_schema: {
        type: "object",
        properties: { rows: { type: "array", items: {} } },
        required: ["rows"],
      },
    };
    const tools = buildToolList([derived]);
    expect(tools[0]!.description).toContain("derived-list");
  });

  test("skips operations with surface.agent_callable=false", () => {
    const tools = buildToolList([
      FOO_OP,
      {
        ...BAR_OP,
        id: "hidden",
        surface: {
          agent_callable: false,
          public_surface: false,
          view_mountable: false,
          framework_internal: false,
        },
      },
    ]);
    expect(tools.map((tool) => tool.name)).toEqual(["op.foo"]);
  });

  test("tool carries an outputSchema field matching the passed output_schema", () => {
    const derived: DiscoveredOperation = {
      id: "related_bookmarks",
      action: "read",
      affects: { reads_only: true, destructive: false },
      input_schema: { type: "object", properties: {}, required: [] },
      output: { kind: "derived-list", item_schema: {} },
      output_schema: {
        type: "object",
        properties: { rows: { type: "array", items: {} } },
        required: ["rows"],
      },
    };
    const tools = buildToolList([derived]);
    // Field is added to the tool descriptor; MCP SDK will forward it or
    // harmlessly ignore it depending on spec version support.
    const tool = tools[0] as unknown as { outputSchema?: unknown };
    expect(tool.outputSchema).toEqual(derived.output_schema!);
  });

  test("tool lacking output / output_schema still builds cleanly (pre-P0 template)", () => {
    const legacy = {
      id: "legacy",
      action: "write",
      affects: { reads_only: false, destructive: false },
      input_schema: { type: "object", properties: {}, required: [] },
    } as DiscoveredOperation;
    const tools = buildToolList([legacy]);
    expect(tools[0]!.name).toBe("op.legacy");
    expect(typeof tools[0]!.description).toBe("string");
  });

  // ---- Regression: MCP spec requires outputSchema root type === "object" ----
  // (reviewer's I1; see ToolSchema v1.29.0 types.js:1252 — z.literal("object"))

  test("does not attach outputSchema when output_schema is null", () => {
    const op: DiscoveredOperation = {
      id: "null_case",
      action: "read",
      affects: { reads_only: true, destructive: false },
      input_schema: { type: "object", properties: {}, required: [] },
      output_schema: null,
    };
    const tools = buildToolList([op]);
    const tool = tools[0] as unknown as { outputSchema?: unknown };
    expect(tool.outputSchema).toBeUndefined();
  });

  test("does not attach outputSchema when output_schema is an array", () => {
    const op: DiscoveredOperation = {
      id: "array_case",
      action: "read",
      affects: { reads_only: true, destructive: false },
      input_schema: { type: "object", properties: {}, required: [] },
      output_schema: [],
    };
    const tools = buildToolList([op]);
    const tool = tools[0] as unknown as { outputSchema?: unknown };
    expect(tool.outputSchema).toBeUndefined();
  });

  test("does not attach outputSchema when output_schema is a primitive string", () => {
    const op: DiscoveredOperation = {
      id: "primitive_case",
      action: "read",
      affects: { reads_only: true, destructive: false },
      input_schema: { type: "object", properties: {}, required: [] },
      output_schema: "string",
    };
    const tools = buildToolList([op]);
    const tool = tools[0] as unknown as { outputSchema?: unknown };
    expect(tool.outputSchema).toBeUndefined();
  });

  test("does not attach outputSchema when output_schema root type !== 'object'", () => {
    // Regression for the actual bug: outputSchemaToJsonSchema for CellType
    // primitives / vector / blob / ref-row / derived emits { type: "string" },
    // { type: "array", ... }, etc. Those must NOT be attached.
    const op: DiscoveredOperation = {
      id: "non_object_root",
      action: "read",
      affects: { reads_only: true, destructive: false },
      input_schema: { type: "object", properties: {}, required: [] },
      output_schema: { type: "string" },
    };
    const tools = buildToolList([op]);
    const tool = tools[0] as unknown as { outputSchema?: unknown };
    expect(tool.outputSchema).toBeUndefined();
  });
});

// ---- Test 2: callOperation proxies correctly ----

describe("callOperation", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  test("POSTs to /api/operations/:id with correct body", async () => {
    const calls: Array<{ url: string; method?: string; body: unknown }> = [];
    globalThis.fetch = mock(async (url: string, opts: RequestInit) => {
      calls.push({ url, method: opts.method, body: JSON.parse(opts.body as string) });
      return new Response(JSON.stringify({ output: { id: "new-123" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const result = await callOperation("http://localhost:9999", "foo", { name: "x" }, "POST");

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://localhost:9999/api/operations/foo");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.body).toEqual({ input: { name: "x" } });
    expect((result as { output: { id: string } }).output.id).toBe("new-123");
  });

  test("GETs query-backed operations using args as query string", async () => {
    const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
    globalThis.fetch = mock(async (url: string, opts: RequestInit) => {
      calls.push({ url, method: opts.method, body: opts.body });
      return new Response(JSON.stringify({ rows: [{ id: "row-1" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const result = await callOperation(
      "http://localhost:9999",
      "bar",
      { q: "alpha", limit: 10, include_archived: false },
      "GET",
    );

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(url.origin + url.pathname).toBe("http://localhost:9999/api/operations/bar");
    expect(url.searchParams.get("q")).toBe("alpha");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("include_archived")).toBe("false");
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.body).toBeUndefined();
    expect((result as { rows: Array<{ id: string }> }).rows[0]!.id).toBe("row-1");
  });

  test("trailing slash in appUrl is stripped", async () => {
    const calls: string[] = [];
    globalThis.fetch = mock(async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    await callOperation("http://localhost:9999/", "foo", {});
    expect(calls[0]).toBe("http://localhost:9999/api/operations/foo");
  });

  test("throws McpError on non-2xx response", async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ error: "not_found" }), { status: 404 }),
    ) as unknown as typeof fetch;

    await expect(callOperation("http://localhost:9999", "foo", {})).rejects.toThrow(/404/);
  });

  test("throws McpError on network error", async () => {
    globalThis.fetch = mock(async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;

    await expect(callOperation("http://localhost:9999", "foo", {})).rejects.toThrow(/ECONNREFUSED/);
  });

  test("throws McpError on non-JSON response", async () => {
    globalThis.fetch = mock(async () =>
      new Response("not json", { status: 200, headers: { "content-type": "text/plain" } }),
    ) as unknown as typeof fetch;

    await expect(callOperation("http://localhost:9999", "foo", {})).rejects.toThrow(/non-JSON/);
  });
});

// ---- Test 3: bridge fails fast if PNEUMA_APP_URL missing ----

describe("bridge startup — subprocess", () => {
  test("exits non-zero within 2s when PNEUMA_APP_URL is missing", async () => {
    const bridgePath = new URL("../bin/template-mcp-bridge.ts", import.meta.url).pathname;
    // Use process.execPath to find the bun binary that's running this test,
    // since "bun" may not be in $PATH in the test sandbox.
    const bunBin = process.execPath;
    const proc = Bun.spawn([bunBin, "run", bridgePath], {
      env: {}, // no PNEUMA_APP_URL
      stdout: "pipe",
      stderr: "pipe",
    });
    const timer = setTimeout(() => proc.kill(), 2000);
    const exitCode = await proc.exited;
    clearTimeout(timer);
    expect(exitCode).not.toBe(0);
  });
});
