// Tests for OperationToolBridge
//
// This module has NO dependency on @pneuma-framework/core-domain —
// it works entirely through DiscoveredOperationLike (structural type).

import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createToolRegistry } from "../src/tools/registry.js";
import { OperationToolBridge, type DiscoveredOperationLike } from "../src/operation-tool-bridge.js";

// ---------- helpers ----------

function makeRegistry() {
  return createToolRegistry({ orchestrator: null as unknown as never });
}

const FOO_OP: DiscoveredOperationLike = {
  id: "foo",
  action: "write",
  resource: { kind: "table", table: "items" },
  input_schema: {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
    additionalProperties: false,
  },
  affects: { reads_only: false, destructive: false },
  handler_kind: "code",
};

const BAR_OP: DiscoveredOperationLike = {
  id: "bar",
  action: "read",
  resource: { kind: "table", table: "items" },
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  affects: { reads_only: true, destructive: false },
  handler_kind: "query",
};

// ---------- Test 1: register produces op.* tools ----------

describe("OperationToolBridge.register", () => {
  test("register produces op.* tools for each operation", () => {
    const reg = makeRegistry();
    const bridge = new OperationToolBridge({
      toolRegistry: reg,
      getServiceUrl: () => "http://127.0.0.1:9999",
    });

    bridge.register([FOO_OP, BAR_OP]);

    expect(reg.has("op.foo")).toBe(true);
    expect(reg.has("op.bar")).toBe(true);
    const names = reg.list().map((t) => t.name);
    expect(names).toContain("op.foo");
    expect(names).toContain("op.bar");
  });

  test("each registered tool's inputSchema equals the passed-through JSON Schema", () => {
    const reg = makeRegistry();
    const bridge = new OperationToolBridge({
      toolRegistry: reg,
      getServiceUrl: () => "http://127.0.0.1:9999",
    });
    bridge.register([FOO_OP]);

    const desc = reg.list().find((t) => t.name === "op.foo");
    expect(desc).toBeDefined();
    expect(desc!.inputSchema).toEqual(FOO_OP.input_schema);
  });

  test("operation without input_schema gets permissive {} inputSchema", () => {
    const reg = makeRegistry();
    const bridge = new OperationToolBridge({
      toolRegistry: reg,
      getServiceUrl: () => "http://127.0.0.1:9999",
    });
    const noSchema: DiscoveredOperationLike = { ...FOO_OP, id: "baz", input_schema: undefined };
    bridge.register([noSchema]);

    const desc = reg.list().find((t) => t.name === "op.baz");
    expect(desc).toBeDefined();
    // permissive fallback: type: "object" only
    expect((desc!.inputSchema as Record<string, unknown>).type).toBe("object");
  });

  test("register is idempotent: re-register replaces existing tools", () => {
    const reg = makeRegistry();
    const bridge = new OperationToolBridge({
      toolRegistry: reg,
      getServiceUrl: () => "http://127.0.0.1:9999",
    });

    bridge.register([FOO_OP]);
    expect(reg.has("op.foo")).toBe(true);

    // Re-register with only BAR_OP — foo should disappear, bar should appear
    bridge.register([BAR_OP]);
    expect(reg.has("op.foo")).toBe(false);
    expect(reg.has("op.bar")).toBe(true);
  });

  test("tool description mentions the operation's output kind", () => {
    const reg = makeRegistry();
    const bridge = new OperationToolBridge({
      toolRegistry: reg,
      getServiceUrl: () => "http://127.0.0.1:9999",
    });
    const derivedListOp: DiscoveredOperationLike = {
      id: "related_bookmarks",
      action: "read",
      resource: { kind: "none" },
      input_schema: { type: "object", properties: {}, required: [] },
      output: { kind: "derived-list", item_schema: {} },
      output_schema: {
        type: "object",
        properties: { rows: { type: "array", items: {} } },
        required: ["rows"],
      },
      affects: { reads_only: true, destructive: false },
      handler_kind: "code",
    };
    bridge.register([derivedListOp]);

    const desc = reg.list().find((t) => t.name === "op.related_bookmarks");
    expect(desc).toBeDefined();
    expect(desc!.description).toContain("derived-list");
  });

  test("tool description defaults cleanly when output is absent (pre-P0 template)", () => {
    const reg = makeRegistry();
    const bridge = new OperationToolBridge({
      toolRegistry: reg,
      getServiceUrl: () => "http://127.0.0.1:9999",
    });
    // Simulate a pre-P0 template that doesn't emit `output` / `output_schema`
    const legacyOp = {
      id: "legacy",
      action: "write",
      resource: { kind: "none" },
      input_schema: { type: "object", properties: {}, required: [] },
      affects: { reads_only: false, destructive: false },
      handler_kind: "code",
    } as DiscoveredOperationLike;
    bridge.register([legacyOp]);

    const desc = reg.list().find((t) => t.name === "op.legacy");
    expect(desc).toBeDefined();
    // must still produce a description (no crash on missing output)
    expect(typeof desc!.description).toBe("string");
    expect(desc!.description.length).toBeGreaterThan(0);
  });
});

// ---------- Test 2: handler POSTs correctly ----------

describe("OperationToolBridge tool handler", () => {
  test("handler POSTs to /api/operations/:id with correct body and returns response body", async () => {
    const reg = makeRegistry();

    // Mock fetch
    const fetchCalls: Array<{ url: string; options: RequestInit }> = [];
    const mockFetch = mock(async (url: string, options: RequestInit) => {
      fetchCalls.push({ url, options });
      return new Response(JSON.stringify({ output: { id: "new-item-123" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    try {
      const bridge = new OperationToolBridge({
        toolRegistry: reg,
        getServiceUrl: () => "http://127.0.0.1:9999",
      });
      bridge.register([FOO_OP]);

      const result = await reg.call("op.foo", { name: "x" });

      expect(result.ok).toBe(true);
      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0]!.url).toBe("http://127.0.0.1:9999/api/operations/foo");
      expect(fetchCalls[0]!.options.method).toBe("POST");
      const sentBody = JSON.parse(fetchCalls[0]!.options.body as string);
      expect(sentBody).toEqual({ input: { name: "x" } });
      expect((result.state as { output: { id: string } }).output.id).toBe("new-item-123");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("handler returns error on non-2xx response", async () => {
    const reg = makeRegistry();

    const mockFetch = mock(async () =>
      new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    try {
      const bridge = new OperationToolBridge({
        toolRegistry: reg,
        getServiceUrl: () => "http://127.0.0.1:9999",
      });
      bridge.register([FOO_OP]);

      const result = await reg.call("op.foo", { name: "x" });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/404/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("handler wraps network error", async () => {
    const reg = makeRegistry();

    const mockFetch = mock(async () => {
      throw new Error("ECONNREFUSED");
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    try {
      const bridge = new OperationToolBridge({
        toolRegistry: reg,
        getServiceUrl: () => "http://127.0.0.1:9999",
      });
      bridge.register([FOO_OP]);

      const result = await reg.call("op.foo", { name: "x" });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/ECONNREFUSED/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ---------- Test 3: clear removes tools ----------

describe("OperationToolBridge.clear", () => {
  test("clear removes all previously-registered op.* tools", () => {
    const reg = makeRegistry();
    const bridge = new OperationToolBridge({
      toolRegistry: reg,
      getServiceUrl: () => "http://127.0.0.1:9999",
    });

    bridge.register([FOO_OP, BAR_OP]);
    expect(reg.has("op.foo")).toBe(true);
    expect(reg.has("op.bar")).toBe(true);

    bridge.clear();

    expect(reg.has("op.foo")).toBe(false);
    expect(reg.has("op.bar")).toBe(false);
  });

  test("clear is idempotent — double-clear does not throw", () => {
    const reg = makeRegistry();
    const bridge = new OperationToolBridge({
      toolRegistry: reg,
      getServiceUrl: () => "http://127.0.0.1:9999",
    });
    bridge.register([FOO_OP]);
    bridge.clear();
    expect(() => bridge.clear()).not.toThrow();
  });

  test("clear does not remove non-op.* lifecycle tools", () => {
    const reg = makeRegistry();
    // Manually register a lifecycle tool (usually done by buildToolRegistry)
    reg.register(
      { name: "lifecycle.state", description: "probe", inputSchema: { type: "object" } },
      async () => ({ ok: true }),
    );
    const bridge = new OperationToolBridge({
      toolRegistry: reg,
      getServiceUrl: () => "http://127.0.0.1:9999",
    });
    bridge.register([FOO_OP]);
    bridge.clear();

    // lifecycle.state must still be present
    expect(reg.has("lifecycle.state")).toBe(true);
    expect(reg.has("op.foo")).toBe(false);
  });
});

// ---------- Test 4: missing service URL → handler throws ----------

describe("OperationToolBridge — missing service URL", () => {
  test("handler rejects when getServiceUrl returns undefined", async () => {
    const reg = makeRegistry();
    const bridge = new OperationToolBridge({
      toolRegistry: reg,
      getServiceUrl: () => undefined,
    });
    bridge.register([FOO_OP]);

    const result = await reg.call("op.foo", { name: "x" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not ready|unavailable/i);
  });
});
