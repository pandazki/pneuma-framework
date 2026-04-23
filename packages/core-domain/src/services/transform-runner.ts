// TransformRunner — 执行 Transform (ADR-0003).
// 职责:
//   1. code impl: 从 TransformRegistry 查函数, 执行, 校验 output type 匹配
//   2. prompt impl: 调 LLMProvider, 拿文本, 构造 output value, 校验匹配
//   3. purity-based cache: pure / pure-with-ttl 结果按 (transform_id, input hash) 缓存
//   4. sandbox: impl 不能调 Adapter / StorageService / 外部 fetch — 通过限制 runContext
//      没有传入这些 handle 来保证 (MVP 规约; ADR-0003 amend follow-up 可加 runtime 检查)

import type { PermissionContext } from "../value-objects/permission-context.js";
import { isValidCellValue } from "../value-objects/cell.js";
import type { Transform } from "../aggregates/transform.js";

// ---------- errors ----------

export class TransformExecutionError extends Error {
  constructor(message: string, public readonly kind: string) {
    super(message);
    this.name = "TransformExecutionError";
  }
}

// ---------- code impl registry ----------

/** Sandbox-restricted context passed to user code impl. */
export interface TransformRunContext {
  readonly ctx: PermissionContext;
  readonly input: unknown;
  /** 仅供 prompt 实现时读, code impl 无用 */
  readonly now: number;
}

export type TransformFn = (args: TransformRunContext) => Promise<unknown>;

export class TransformRegistry {
  private readonly fns = new Map<string, TransformFn>();

  register(ref: string, fn: TransformFn): void {
    this.fns.set(ref, fn);
  }

  resolve(ref: string): TransformFn {
    const fn = this.fns.get(ref);
    if (!fn) {
      throw new TransformExecutionError(
        `transform code impl not registered: "${ref}"`,
        "code_ref_not_registered"
      );
    }
    return fn;
  }
}

// ---------- LLM provider (for prompt impl) ----------

export interface LLMPromptInput {
  readonly model: string;
  readonly system: string;
  readonly user: string; // 调用方已把 input 序列化成 prompt body
  readonly outputSchema?: unknown;
}

export interface LLMProvider {
  /** 返回原始文本 (MVP). 如果 outputSchema 给了, provider 自己保证结构化. */
  complete(input: LLMPromptInput, ctx: PermissionContext): Promise<string>;
}

/** 测试用: 按固定 canned response map 返回 */
export class MockLLMProvider implements LLMProvider {
  private responses = new Map<string, string>();
  /** 默认 fallback 响应 — 方便快速写测试 */
  defaultResponse = "";

  setResponse(key: string, text: string): void {
    this.responses.set(key, text);
  }

  async complete(input: LLMPromptInput, _ctx: PermissionContext): Promise<string> {
    // MVP: key = model + system 前 50 字
    const key = `${input.model}:${input.system.slice(0, 50)}`;
    return this.responses.get(key) ?? this.defaultResponse;
  }
}

// ---------- cache ----------

export interface TransformCacheEntry {
  readonly value: unknown;
  readonly stored_at: number;
}

export class InMemoryTransformCache {
  private readonly store = new Map<string, TransformCacheEntry>();

  get(key: string): TransformCacheEntry | undefined {
    return this.store.get(key);
  }

  set(key: string, entry: TransformCacheEntry): void {
    this.store.set(key, entry);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

// ---------- runner ----------

export interface TransformRunnerOptions {
  readonly now?: number;
}

export class TransformRunner {
  constructor(
    private readonly registry: TransformRegistry,
    private readonly llm: LLMProvider,
    private readonly cache: InMemoryTransformCache = new InMemoryTransformCache()
  ) {}

  /**
   * 跑 transform. Cache-aware (pure / pure-with-ttl).
   * 校验 output value 是否匹配 transform.out.
   */
  async apply(
    transform: Transform,
    input: unknown,
    ctx: PermissionContext,
    opts: TransformRunnerOptions = {}
  ): Promise<unknown> {
    const now = opts.now ?? Date.now();

    // cache lookup
    if (transform.isCacheable()) {
      const key = this.cacheKey(transform, input);
      const hit = this.cache.get(key);
      if (hit && this.cacheHitValid(transform, hit, now)) {
        return hit.value;
      }
    }

    // execute
    let output: unknown;
    if (transform.impl.kind === "code") {
      const fn = this.registry.resolve(transform.impl.ref);
      output = await fn({ ctx, input, now });
    } else {
      // prompt impl: MVP serializes input into user prompt
      const text = await this.llm.complete(
        {
          model: transform.impl.model,
          system: transform.impl.system,
          user: serializeInputForPrompt(input),
          outputSchema: transform.impl.outputSchema,
        },
        ctx
      );
      output = coerceLLMOutput(transform, text);
    }

    // validate output against transform.out
    if (!isValidCellValue(transform.out, output)) {
      throw new TransformExecutionError(
        `transform "${transform.id}" produced output not matching declared out type`,
        "output_type_mismatch"
      );
    }

    // cache store
    if (transform.isCacheable()) {
      const key = this.cacheKey(transform, input);
      this.cache.set(key, { value: output, stored_at: now });
    }

    return output;
  }

  // ---------- internals ----------

  private cacheKey(transform: Transform, input: unknown): string {
    const implHash = hashStr(JSON.stringify(transform.impl));
    const inputHash = hashStr(stableJSON(input));
    return `${transform.app_id}::${transform.id}::${implHash}::${inputHash}`;
  }

  private cacheHitValid(
    transform: Transform,
    hit: TransformCacheEntry,
    now: number
  ): boolean {
    if (transform.purity === "pure") return true;
    if (transform.purity === "pure-with-ttl") {
      const ttl = transform.ttl_seconds!;
      return now - hit.stored_at < ttl * 1000;
    }
    return false; // impure 永不用 cache
  }
}

// ---------- helpers ----------

function serializeInputForPrompt(input: unknown): string {
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function coerceLLMOutput(transform: Transform, text: string): unknown {
  // MVP rules:
  //   - out is primitive Text / RichText / URL → return text as-is
  //   - out is primitive Number → parseFloat
  //   - out is primitive Bool → "true" / "false"
  //   - out is primitive Date → Date.parse
  //   - other → try JSON.parse
  if (transform.out.kind === "primitive") {
    switch (transform.out.of) {
      case "Text":
      case "RichText":
      case "URL":
        return text;
      case "Number":
      case "Duration": {
        const n = parseFloat(text);
        return Number.isFinite(n) ? n : text;
      }
      case "Bool":
        return text.trim().toLowerCase() === "true";
      case "Date": {
        const d = Date.parse(text);
        return Number.isFinite(d) ? d : text;
      }
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function hashStr(s: string): string {
  // MVP: cheap FNV-1a hash. 64-bit would be safer; sufficient for cache key uniqueness.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ s.charCodeAt(i)) * 0x01000193;
    h = h >>> 0; // unsigned 32-bit
  }
  return h.toString(16);
}

function stableJSON(v: unknown): string {
  // 简单稳定化: 仅对 object key 排序. 不处理循环引用 / Date / Uint8Array 等复杂 case.
  // MVP 足够; 更严格的可换 json-stable-stringify.
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableJSON).join(",")}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  const parts = keys.map(
    (k) => JSON.stringify(k) + ":" + stableJSON((v as Record<string, unknown>)[k])
  );
  return `{${parts.join(",")}}`;
}
