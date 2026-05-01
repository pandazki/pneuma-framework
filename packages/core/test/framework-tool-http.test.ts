import { afterEach, describe, expect, test } from "bun:test";
import {
  createToolRegistry,
  startFrameworkToolHttpProxy,
  type FrameworkToolHttpProxy,
} from "../src/index.js";

function makeRegistry() {
  const reg = createToolRegistry({ orchestrator: {} as never });
  reg.register(
    {
      name: "definition.apply",
      description: "framework semantic tool for app-definition mutation",
      inputSchema: {
        type: "object",
        properties: { kind: { type: "string" } },
        required: ["kind"],
      },
    },
    async (_ctx, params) => ({
      ok: true,
      state: { applied: params.kind, target: params.table_id ?? params.view_id ?? null },
    }),
  );
  return reg;
}

describe("framework tool HTTP proxy", () => {
  let proxy: FrameworkToolHttpProxy | undefined;
  afterEach(() => {
    proxy?.close();
    proxy = undefined;
  });

  test("lists framework semantic tools over HTTP", async () => {
    proxy = startFrameworkToolHttpProxy(makeRegistry(), { port: 0 });

    const response = await fetch(`${proxy.url}/api/framework/tools`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { tools: Array<{ name: string; inputSchema: unknown }> };

    expect(body.tools.map((tool) => tool.name)).toEqual(["definition.apply"]);
    expect(body.tools[0]!.inputSchema).toMatchObject({
      type: "object",
      required: ["kind"],
    });
  });

  test("invokes framework semantic tools over HTTP with an input envelope", async () => {
    proxy = startFrameworkToolHttpProxy(makeRegistry(), { port: 0 });

    const response = await fetch(`${proxy.url}/api/framework/tools/definition.apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: { kind: "add_table_column", table_id: "inbox_items" },
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      state: { applied: "add_table_column", target: "inbox_items" },
    });
  });

  test("unknown tools return HTTP 404 before registry call", async () => {
    proxy = startFrameworkToolHttpProxy(makeRegistry(), { port: 0 });

    const response = await fetch(`${proxy.url}/api/framework/tools/nope`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: {} }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false, error: "tool not found: nope" });
  });

  test("invalid input envelopes fail as client errors", async () => {
    proxy = startFrameworkToolHttpProxy(makeRegistry(), { port: 0 });

    const response = await fetch(`${proxy.url}/api/framework/tools/definition.apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "not-an-object" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "input must be an object" });
  });
});
