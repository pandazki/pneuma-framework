// OpenRouter LLM Provider — 实现 core-domain 的 LLMProvider 接口.
// OpenRouter 兼容 OpenAI chat completions API, 所以一个 fetch 就够.

import type {
  LLMPromptInput,
  LLMProvider,
  PermissionContext,
} from "@pneuma-framework/core-domain";

export interface OpenRouterProviderConfig {
  readonly apiKey: string;
  /** 默认 baseURL, 可覆盖给兼容 API (e.g. local proxy) */
  readonly baseURL?: string;
  /** 可选 fetch 实现, 测试注入 mock 用 */
  readonly fetchImpl?: typeof fetch;
  /** Temperature, default 0.4. */
  readonly temperature?: number;
  /** 最大 tokens, 默认 2048 */
  readonly maxTokens?: number;
}

export class OpenRouterProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly responseBody?: string
  ) {
    super(message);
    this.name = "OpenRouterProviderError";
  }
}

export class OpenRouterLLMProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly fetchImpl: typeof fetch;
  private readonly temperature: number;
  private readonly maxTokens: number;

  constructor(config: OpenRouterProviderConfig) {
    if (!config.apiKey) {
      throw new OpenRouterProviderError("apiKey required");
    }
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://openrouter.ai/api/v1";
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.temperature = config.temperature ?? 0.4;
    this.maxTokens = config.maxTokens ?? 2048;
  }

  async complete(input: LLMPromptInput, _ctx: PermissionContext): Promise<string> {
    const body = {
      model: input.model,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    };

    const res = await this.fetchImpl(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await safeReadText(res);
      throw new OpenRouterProviderError(
        `OpenRouter ${res.status}: ${text.slice(0, 400)}`,
        res.status,
        text
      );
    }

    const data = (await res.json()) as OpenRouterResponse;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new OpenRouterProviderError(
        `OpenRouter response missing choices[0].message.content; shape: ${JSON.stringify(data).slice(0, 300)}`
      );
    }
    return content;
  }
}

// ---------- types ----------

interface OpenRouterResponse {
  readonly id?: string;
  readonly model?: string;
  readonly choices?: ReadonlyArray<{
    readonly message?: {
      readonly role?: string;
      readonly content?: string;
    };
  }>;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
    readonly cost?: number;
  };
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "(failed to read response body)";
  }
}

// ---------- Embedding Provider ----------

export {
  OpenRouterEmbeddingProvider,
  type OpenRouterEmbeddingConfig,
} from "./embedding.js";
