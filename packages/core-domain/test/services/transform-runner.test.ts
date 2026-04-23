import { describe, test, expect } from "bun:test";
import { Transform } from "../../src/aggregates/transform.js";
import {
  TransformRegistry,
  TransformRunner,
  MockLLMProvider,
  TransformExecutionError,
  InMemoryTransformCache,
} from "../../src/services/transform-runner.js";
import { buildRootContext } from "../../src/value-objects/permission-context.js";
import type { CellType } from "../../src/value-objects/cell-type.js";

const TEXT: CellType = { kind: "primitive", of: "Text" };
const RICH: CellType = { kind: "primitive", of: "RichText" };
const NUM: CellType = { kind: "primitive", of: "Number" };

function ctx() {
  return buildRootContext({ app_id: "app", invoked_via: "ui" });
}

describe("TransformRunner · code impl", () => {
  test("code impl runs through registry + returns output", async () => {
    const reg = new TransformRegistry();
    reg.register("./transforms/upper.ts", async ({ input }) => {
      return (input as string).toUpperCase();
    });
    const runner = new TransformRunner(reg, new MockLLMProvider());

    const t = new Transform({
      id: "upper",
      app_id: "app",
      in: { kind: "cell", type: TEXT },
      out: TEXT,
      impl: { kind: "code", ref: "./transforms/upper.ts" },
      purity: "pure",
    });
    const out = await runner.apply(t, "hello", ctx());
    expect(out).toBe("HELLO");
  });

  test("unregistered code ref throws", async () => {
    const runner = new TransformRunner(new TransformRegistry(), new MockLLMProvider());
    const t = new Transform({
      id: "x",
      app_id: "app",
      in: { kind: "cell", type: TEXT },
      out: TEXT,
      impl: { kind: "code", ref: "./missing.ts" },
      purity: "pure",
    });
    await expect(runner.apply(t, "in", ctx())).rejects.toBeInstanceOf(
      TransformExecutionError
    );
  });

  test("output type mismatch throws", async () => {
    const reg = new TransformRegistry();
    reg.register("./t.ts", async () => 42); // Number but out is Text
    const runner = new TransformRunner(reg, new MockLLMProvider());
    const t = new Transform({
      id: "mismatch",
      app_id: "app",
      in: { kind: "cell", type: TEXT },
      out: TEXT,
      impl: { kind: "code", ref: "./t.ts" },
      purity: "pure",
    });
    await expect(runner.apply(t, "in", ctx())).rejects.toThrow(/output/);
  });

  test("pure cache hits on repeated invocation with same input", async () => {
    let calls = 0;
    const reg = new TransformRegistry();
    reg.register("./t.ts", async ({ input }) => {
      calls++;
      return (input as string).toUpperCase();
    });
    const cache = new InMemoryTransformCache();
    const runner = new TransformRunner(reg, new MockLLMProvider(), cache);
    const t = new Transform({
      id: "upper",
      app_id: "app",
      in: { kind: "cell", type: TEXT },
      out: TEXT,
      impl: { kind: "code", ref: "./t.ts" },
      purity: "pure",
    });
    await runner.apply(t, "hello", ctx());
    await runner.apply(t, "hello", ctx());
    await runner.apply(t, "world", ctx());
    expect(calls).toBe(2); // 'hello' cached, 'world' new
    expect(cache.size()).toBe(2);
  });

  test("impure never caches", async () => {
    let calls = 0;
    const reg = new TransformRegistry();
    reg.register("./t.ts", async () => {
      calls++;
      return "x";
    });
    const runner = new TransformRunner(reg, new MockLLMProvider());
    const t = new Transform({
      id: "t",
      app_id: "app",
      in: { kind: "cell", type: TEXT },
      out: TEXT,
      impl: { kind: "code", ref: "./t.ts" },
      purity: "impure",
    });
    await runner.apply(t, "a", ctx());
    await runner.apply(t, "a", ctx());
    expect(calls).toBe(2);
  });

  test("pure-with-ttl cache expires after ttl", async () => {
    let calls = 0;
    const reg = new TransformRegistry();
    reg.register("./t.ts", async () => {
      calls++;
      return "x";
    });
    const runner = new TransformRunner(reg, new MockLLMProvider());
    const t = new Transform({
      id: "t",
      app_id: "app",
      in: { kind: "cell", type: TEXT },
      out: TEXT,
      impl: { kind: "code", ref: "./t.ts" },
      purity: "pure-with-ttl",
      ttl_seconds: 10,
    });
    const t0 = 1_000_000;
    await runner.apply(t, "a", ctx(), { now: t0 });
    await runner.apply(t, "a", ctx(), { now: t0 + 5_000 }); // within TTL
    await runner.apply(t, "a", ctx(), { now: t0 + 20_000 }); // expired
    expect(calls).toBe(2);
  });
});

describe("TransformRunner · prompt impl", () => {
  test("calls LLM provider and returns text", async () => {
    const llm = new MockLLMProvider();
    llm.defaultResponse = "CANNED SUMMARY";
    const runner = new TransformRunner(new TransformRegistry(), llm);
    const t = new Transform({
      id: "summarize",
      app_id: "app",
      in: { kind: "row-list", table: "issues" },
      out: RICH,
      impl: {
        kind: "prompt",
        model: "claude-haiku",
        system: "Summarize Linear issues into a weekly digest.",
      },
      purity: "pure",
    });
    const out = await runner.apply(t, [{ id: 1 }, { id: 2 }], ctx());
    expect(out).toBe("CANNED SUMMARY");
  });

  test("prompt Number output gets parsed", async () => {
    const llm = new MockLLMProvider();
    llm.defaultResponse = "42.5";
    const runner = new TransformRunner(new TransformRegistry(), llm);
    const t = new Transform({
      id: "count",
      app_id: "app",
      in: { kind: "cell", type: TEXT },
      out: NUM,
      impl: { kind: "prompt", model: "x", system: "s" },
      purity: "pure",
    });
    const out = await runner.apply(t, "how many", ctx());
    expect(out).toBe(42.5);
  });

  test("prompt output type mismatch throws", async () => {
    const llm = new MockLLMProvider();
    llm.defaultResponse = "not a number";
    const runner = new TransformRunner(new TransformRegistry(), llm);
    const t = new Transform({
      id: "count",
      app_id: "app",
      in: { kind: "cell", type: TEXT },
      out: NUM,
      impl: { kind: "prompt", model: "x", system: "s" },
      purity: "pure",
    });
    // coerce will parseFloat("not a number") = NaN → not finite → returns text → isValidCellValue(Number, "not a number") false → throws
    await expect(runner.apply(t, "in", ctx())).rejects.toThrow(/output/);
  });

  test("prompt cache hit avoids calling LLM again", async () => {
    let llmCalls = 0;
    const llm: MockLLMProvider = new MockLLMProvider();
    const origComplete = llm.complete.bind(llm);
    llm.defaultResponse = "SUM";
    llm.complete = async (args, c) => {
      llmCalls++;
      return origComplete(args, c) as Promise<string>;
    };
    const runner = new TransformRunner(new TransformRegistry(), llm);
    const t = new Transform({
      id: "sum",
      app_id: "app",
      in: { kind: "cell", type: TEXT },
      out: TEXT,
      impl: { kind: "prompt", model: "x", system: "s" },
      purity: "pure",
    });
    await runner.apply(t, "x", ctx());
    await runner.apply(t, "x", ctx());
    expect(llmCalls).toBe(1);
  });
});
