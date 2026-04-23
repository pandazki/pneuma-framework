// OpenRouter EmbeddingProvider — 走 OpenAI-compatible /embeddings endpoint.

import {
  EmbeddingProviderError,
  type EmbedInput,
  type EmbeddingProvider,
  type PermissionContext,
} from "@pneuma-framework/core-domain";

export interface OpenRouterEmbeddingConfig {
  readonly apiKey: string;
  readonly baseURL?: string;
  readonly fetchImpl?: typeof fetch;
}

interface OpenRouterEmbeddingResponse {
  readonly data?: ReadonlyArray<{ readonly embedding?: readonly number[] }>;
}

export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OpenRouterEmbeddingConfig) {
    if (!config.apiKey) throw new EmbeddingProviderError("apiKey required");
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://openrouter.ai/api/v1";
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async embed(input: EmbedInput, _ctx: PermissionContext): Promise<number[]> {
    const res = await this.fetchImpl(`${this.baseURL}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: input.model, input: input.text }),
    });

    if (!res.ok) {
      const text = await safeReadText(res);
      throw new EmbeddingProviderError(
        `OpenRouter ${res.status}: ${text.slice(0, 400)}`,
        res.status,
        text
      );
    }

    const data = (await res.json()) as OpenRouterEmbeddingResponse;
    const vec = data.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length === 0) {
      throw new EmbeddingProviderError(
        `OpenRouter response missing data[0].embedding; shape: ${JSON.stringify(
          data
        ).slice(0, 300)}`
      );
    }
    return [...vec];
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "(failed to read response body)";
  }
}
