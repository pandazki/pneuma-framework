import { describe, test, expect } from "bun:test";
import {
  OpenRouterLLMProvider,
  OpenRouterProviderError,
} from "../src/index.js";
import { buildRootContext } from "@pneuma-framework/core-domain";

function mockFetch(
  respond: (input: Request | URL | string, init?: RequestInit) => Response | Promise<Response>
): typeof fetch {
  return (async (url: Request | URL | string, init?: RequestInit) =>
    respond(url, init)) as typeof fetch;
}

const ctx = () => buildRootContext({ app_id: "test", invoked_via: "ui" });

describe("OpenRouterLLMProvider · happy path", () => {
  test("successful completion returns text", async () => {
    let capturedBody: Record<string, unknown> = {};
    let capturedAuth = "";
    const provider = new OpenRouterLLMProvider({
      apiKey: "sk-or-fake",
      fetchImpl: mockFetch((_url, init) => {
        capturedAuth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
        capturedBody = JSON.parse(String(init?.body ?? "{}"));
        return new Response(
          JSON.stringify({
            id: "gen-abc",
            choices: [{ message: { role: "assistant", content: "hello from LLM" } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }),
    });

    const out = await provider.complete(
      {
        model: "anthropic/claude-sonnet-4.6",
        system: "You are a test.",
        user: "say hi",
      },
      ctx()
    );
    expect(out).toBe("hello from LLM");
    expect(capturedAuth).toBe("Bearer sk-or-fake");
    expect(capturedBody.model).toBe("anthropic/claude-sonnet-4.6");
    expect((capturedBody.messages as Array<{ role: string; content: string }>)[0]).toEqual({
      role: "system",
      content: "You are a test.",
    });
  });

  test("custom baseURL / temperature / maxTokens honored", async () => {
    let capturedURL = "";
    let capturedBody: Record<string, unknown> = {};
    const provider = new OpenRouterLLMProvider({
      apiKey: "sk-x",
      baseURL: "https://proxy.example/v1",
      temperature: 0.1,
      maxTokens: 100,
      fetchImpl: mockFetch((url, init) => {
        capturedURL = String(url);
        capturedBody = JSON.parse(String(init?.body ?? "{}"));
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
          { status: 200 }
        );
      }),
    });
    await provider.complete(
      { model: "x", system: "s", user: "u" },
      ctx()
    );
    expect(capturedURL).toBe("https://proxy.example/v1/chat/completions");
    expect(capturedBody.temperature).toBe(0.1);
    expect(capturedBody.max_tokens).toBe(100);
  });
});

describe("OpenRouterLLMProvider · error paths", () => {
  test("non-2xx throws OpenRouterProviderError with status", async () => {
    const provider = new OpenRouterLLMProvider({
      apiKey: "sk",
      fetchImpl: mockFetch(() => new Response("rate limited", { status: 429 })),
    });
    await expect(
      provider.complete({ model: "x", system: "s", user: "u" }, ctx())
    ).rejects.toBeInstanceOf(OpenRouterProviderError);
  });

  test("missing choices[0].message.content throws", async () => {
    const provider = new OpenRouterLLMProvider({
      apiKey: "sk",
      fetchImpl: mockFetch(() =>
        new Response(JSON.stringify({ choices: [] }), { status: 200 })
      ),
    });
    await expect(
      provider.complete({ model: "x", system: "s", user: "u" }, ctx())
    ).rejects.toBeInstanceOf(OpenRouterProviderError);
  });

  test("empty apiKey rejected at construction", () => {
    expect(() => new OpenRouterLLMProvider({ apiKey: "" })).toThrow(OpenRouterProviderError);
  });
});
