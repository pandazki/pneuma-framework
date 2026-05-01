// Tests for framework-mcp-bridge
//
// Strategy mirrors template-mcp-bridge.test.ts: test the pure descriptor
// builder and HTTP proxy helper in-process, plus one subprocess startup guard.

import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  buildFrameworkToolList,
  callFrameworkTool,
  fetchFrameworkTools,
} from "../bin/framework-mcp-bridge.js";

type FrameworkTool = Parameters<typeof buildFrameworkToolList>[0][number];

const APPLY_TOOL: FrameworkTool = {
  name: "definition.apply",
  description: "framework semantic tool for app-definition mutation",
  inputSchema: {
    type: "object",
    properties: { kind: { type: "string" } },
    required: ["kind"],
    additionalProperties: false,
  },
};

describe("buildFrameworkToolList", () => {
  test("preserves framework semantic tool name, description, and object input schema", () => {
    const tools = buildFrameworkToolList([APPLY_TOOL]);
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe("definition.apply");
    expect(tools[0]!.description).toContain("framework semantic");
    expect(tools[0]!.inputSchema).toEqual(APPLY_TOOL.inputSchema!);
  });

  test("falls back to an object input schema when the proxy omits schema", () => {
    const tools = buildFrameworkToolList([
      { name: "lifecycle.state", description: "read framework lifecycle state" },
    ]);
    expect(tools[0]!.inputSchema).toEqual({ type: "object" });
  });

  test("falls back to an object input schema when the proxy returns a non-object root", () => {
    const tools = buildFrameworkToolList([
      { ...APPLY_TOOL, inputSchema: { type: "string" } },
    ]);
    expect(tools[0]!.inputSchema).toEqual({ type: "object" });
  });
});

describe("framework tool HTTP proxy helpers", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  test("fetchFrameworkTools reads /api/framework/tools", async () => {
    const calls: string[] = [];
    globalThis.fetch = mock(async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ tools: [APPLY_TOOL] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const tools = await fetchFrameworkTools("http://localhost:9010/");

    expect(calls).toEqual(["http://localhost:9010/api/framework/tools"]);
    expect(tools).toEqual([APPLY_TOOL]);
  });

  test("callFrameworkTool POSTs input to /api/framework/tools/:name", async () => {
    const calls: Array<{ url: string; method?: string; body: unknown }> = [];
    globalThis.fetch = mock(async (url: string, opts: RequestInit) => {
      calls.push({ url, method: opts.method, body: JSON.parse(opts.body as string) });
      return new Response(JSON.stringify({ ok: true, applied: "change-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const result = await callFrameworkTool("http://localhost:9010", "definition.apply", {
      kind: "add_view",
      view_id: "priority_queue",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("http://localhost:9010/api/framework/tools/definition.apply");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.body).toEqual({
      input: { kind: "add_view", view_id: "priority_queue" },
    });
    expect(result).toEqual({ ok: true, applied: "change-1" });
  });

  test("callFrameworkTool URL-encodes tool names with non-path characters", async () => {
    const calls: string[] = [];
    globalThis.fetch = mock(async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    await callFrameworkTool("http://localhost:9010", "definition/apply", {});

    expect(calls[0]).toBe("http://localhost:9010/api/framework/tools/definition%2Fapply");
  });

  test("callFrameworkTool throws on non-2xx response", async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
    ) as unknown as typeof fetch;

    await expect(callFrameworkTool("http://localhost:9010", "definition.apply", {}))
      .rejects.toThrow(/403/);
  });
});

describe("bridge startup — subprocess", () => {
  test("exits non-zero within 2s when PNEUMA_FRAMEWORK_TOOL_URL is missing", async () => {
    const bridgePath = new URL("../bin/framework-mcp-bridge.ts", import.meta.url).pathname;
    const proc = Bun.spawn([process.execPath, "run", bridgePath], {
      env: {},
      stdout: "pipe",
      stderr: "pipe",
    });
    const timer = setTimeout(() => proc.kill(), 2000);
    const exitCode = await proc.exited;
    clearTimeout(timer);
    expect(exitCode).not.toBe(0);
  });
});
