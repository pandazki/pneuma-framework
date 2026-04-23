import { describe, expect, it } from "bun:test";
import { OpenRouterEmbeddingProvider } from "../src/embedding.js";
import { buildRootContext } from "@pneuma-framework/core-domain";

const CTX = buildRootContext({ app_id: "app", invoked_via: "ui" });

function mockFetch(respBody: unknown, status = 200): typeof fetch {
  return (async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify(respBody), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("OpenRouterEmbeddingProvider", () => {
  it("POSTs /embeddings and returns first vector", async () => {
    let capturedBody: string | null = null;
    let capturedUrl = "";
    const fetchImpl: typeof fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedBody = init?.body as string;
      return new Response(
        JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const p = new OpenRouterEmbeddingProvider({
      apiKey: "sk-test",
      fetchImpl,
    });
    const v = await p.embed({ model: "openai/text-embedding-3-small", text: "hi" }, CTX);
    expect(v).toEqual([0.1, 0.2, 0.3]);
    expect(capturedUrl).toBe("https://openrouter.ai/api/v1/embeddings");
    const parsed = JSON.parse(capturedBody!) as { model: string; input: string };
    expect(parsed.model).toBe("openai/text-embedding-3-small");
    expect(parsed.input).toBe("hi");
  });

  it("throws EmbeddingProviderError on non-2xx", async () => {
    const fetchImpl = mockFetch({ error: "nope" }, 401);
    const p = new OpenRouterEmbeddingProvider({ apiKey: "sk-bad", fetchImpl });
    await expect(
      p.embed({ model: "m", text: "x" }, CTX)
    ).rejects.toThrow(/OpenRouter 401/);
  });

  it("throws when payload has no data[0].embedding", async () => {
    const fetchImpl = mockFetch({ data: [] });
    const p = new OpenRouterEmbeddingProvider({ apiKey: "sk", fetchImpl });
    await expect(
      p.embed({ model: "m", text: "x" }, CTX)
    ).rejects.toThrow(/missing data\[0\]\.embedding/);
  });
});
