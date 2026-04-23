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
