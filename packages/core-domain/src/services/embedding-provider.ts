// EmbeddingProvider — text → fixed-dim vector.
// 与 LLMProvider 并列的独立 capability; 不继承/扩展 LLMProvider (域不同).
// 由 template 在 code-impl Transform 的闭包里捕获, 不放进 AppConfig slot (MVP).

import type { PermissionContext } from "../value-objects/permission-context.js";

export interface EmbedInput {
  readonly model: string;
  readonly text: string;
}

export class EmbeddingProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly responseBody?: string
  ) {
    super(message);
    this.name = "EmbeddingProviderError";
  }
}

export interface EmbeddingProvider {
  embed(input: EmbedInput, ctx: PermissionContext): Promise<number[]>;
}

export interface DeterministicEmbeddingProviderConfig {
  readonly dim?: number;
  readonly aliases?: Readonly<Record<string, string>>;
}

/**
 * Local deterministic embedding for tests and demos.
 * It is not semantically rich; it gives stable vectors without a network call.
 */
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  private readonly dim: number;
  private readonly aliases: Readonly<Record<string, string>>;

  constructor(config: DeterministicEmbeddingProviderConfig = {}) {
    this.dim = config.dim ?? 24;
    if (!Number.isInteger(this.dim) || this.dim <= 0) {
      throw new EmbeddingProviderError("DeterministicEmbeddingProvider dim must be a positive integer");
    }
    this.aliases = config.aliases ?? {};
  }

  async embed(input: EmbedInput, _ctx: PermissionContext): Promise<number[]> {
    const out = new Array(this.dim).fill(0) as number[];
    for (const token of tokenizeForDeterministicEmbedding(input.text, this.aliases)) {
      const bucket = positiveHash(token) % this.dim;
      out[bucket] = (out[bucket] ?? 0) + 1;
    }
    const norm = Math.sqrt(out.reduce((sum, value) => sum + value * value, 0));
    if (norm === 0) return out;
    return out.map((value) => value / norm);
  }
}

/** 测试用: 按 text 精确匹配返回固定向量. */
export class MockEmbeddingProvider implements EmbeddingProvider {
  private readonly responses = new Map<string, number[]>();
  defaultResponse: number[] = [];

  setResponse(text: string, vec: number[]): void {
    this.responses.set(text, vec);
  }

  async embed(input: EmbedInput, _ctx: PermissionContext): Promise<number[]> {
    return this.responses.get(input.text) ?? this.defaultResponse;
  }
}

function tokenizeForDeterministicEmbedding(
  text: string,
  aliases: Readonly<Record<string, string>>
): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => aliases[token] ?? token);
}

function positiveHash(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
