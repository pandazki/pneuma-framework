import { test, expect } from "bun:test";
import { createToolRegistry } from "../../src/tools/registry.js";

test("registry stores tools and dispatches calls", async () => {
  const reg = createToolRegistry();
  reg.register(
    {
      name: "math.add",
      description: "Adds two numbers",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    async (_ctx, params) => ({ ok: true, state: (params.a as number) + (params.b as number) }),
  );
  expect(reg.has("math.add")).toBe(true);
  expect(reg.has("math.sub")).toBe(false);
  const names = reg.list().map((t) => t.name);
  expect(names).toEqual(["math.add"]);
  const r = await reg.call("math.add", { a: 1, b: 2 });
  expect(r).toEqual({ ok: true, state: 3 });
});

test("registry returns error for unknown tool", async () => {
  const reg = createToolRegistry();
  const r = await reg.call("nope", {});
  expect(r.ok).toBe(false);
  expect(r.error).toMatch(/not found|unknown/i);
});

test("registry call() passes ctx to the handler", async () => {
  const reg = createToolRegistry({ orchestrator: "ORCH-SENTINEL" as unknown as never });
  reg.register(
    { name: "probe", description: "", inputSchema: { type: "object" } },
    async (ctx) => ({ ok: true, state: (ctx as unknown as { orchestrator: string }).orchestrator }),
  );
  const r = await reg.call("probe", {});
  expect(r.state).toBe("ORCH-SENTINEL");
});
