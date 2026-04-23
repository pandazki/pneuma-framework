import { describe, expect, it } from "bun:test";
import {
  MockEmbeddingProvider,
  type EmbeddingProvider,
  type EmbedInput,
} from "../../src/services/embedding-provider.js";
import { buildRootContext } from "../../src/value-objects/permission-context.js";

const CTX = buildRootContext({ app_id: "app", invoked_via: "ui" });

describe("MockEmbeddingProvider", () => {
  it("returns canned vector for configured text", async () => {
    const p: EmbeddingProvider = new MockEmbeddingProvider();
    (p as MockEmbeddingProvider).setResponse("hello", [1, 0, 0]);
    const v = await p.embed({ model: "m", text: "hello" }, CTX);
    expect(v).toEqual([1, 0, 0]);
  });

  it("returns defaultResponse when no canned match", async () => {
    const p = new MockEmbeddingProvider();
    p.defaultResponse = [0.5, 0.5];
    const v = await p.embed({ model: "m", text: "xyz" }, CTX);
    expect(v).toEqual([0.5, 0.5]);
  });

  it("passes through model + text as the lookup key inputs", async () => {
    const p = new MockEmbeddingProvider();
    p.setResponse("A", [1]);
    p.setResponse("B", [2]);
    expect(await p.embed({ model: "m", text: "A" }, CTX)).toEqual([1]);
    expect(await p.embed({ model: "m", text: "B" }, CTX)).toEqual([2]);
  });
});
