# Embedding + Graph for ai-bookmarks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add text embeddings to each interpretation in `ai-bookmarks-core-domain` so "related bookmarks" and a "bookmark similarity graph" can be derived without changing the framework.

**Architecture:** Introduce `EmbeddingProvider` as a sibling interface to the existing `LLMProvider` in `core-domain`; implement `OpenRouterEmbeddingProvider` in `provider-openrouter`. Inject the provider into the template via closure (no `AppConfig` slot — the template's `embed_text` Transform code-impl captures the provider, same pattern as how `fetch_readable` captures Jina). Keep `related_bookmarks` and `bookmark_graph` as plain code-handler Operations that compute cosine similarity in memory — no new `ComparisonOp`, no vector pushdown (YAGNI: ai-bookmarks stays under 10 k rows).

**Tech Stack:** TypeScript + Bun, `bun:sqlite`, existing `packages/core-domain` aggregates, existing `packages/runtime`, OpenAI-compatible `/embeddings` endpoint via OpenRouter (`openai/text-embedding-3-small`, 1536 dim), hand-rolled SVG for the graph viewer (no new npm deps).

---

## File Structure

### Created

- `packages/core-domain/src/services/embedding-provider.ts` — `EmbeddingProvider` interface + `MockEmbeddingProvider` test double + `embed` contract errors
- `packages/core-domain/test/services/embedding-provider.test.ts` — interface contract tests
- `packages/provider-openrouter/src/embedding.ts` — `OpenRouterEmbeddingProvider` (POSTs `/embeddings`)
- `packages/provider-openrouter/test/embedding.test.ts` — mock-fetch tests for embedding
- `templates/ai-bookmarks-core-domain/server/cosine.ts` — pure cosine-similarity helper (exported for Operation handlers + tests)

### Modified

- `packages/core-domain/src/index.ts` — re-export `EmbeddingProvider`, `EmbedInput`, `MockEmbeddingProvider`, `EmbeddingProviderError`
- `packages/provider-openrouter/src/index.ts` — re-export `OpenRouterEmbeddingProvider`, `OpenRouterEmbeddingConfig`
- `templates/ai-bookmarks-core-domain/server/config.ts` — add `embedding` column on `interpretationsTable`; add `embedText` Transform declaration; extend `BuildConfigDeps` with `embeddingProvider`; register `embed_text` code-impl closure in `transformImpls`; modify `add_bookmark` handler to embed each interpretation body; add `related_bookmarks` + `bookmark_graph` Operations and their handlers
- `templates/ai-bookmarks-core-domain/server/app.ts` — construct `OpenRouterEmbeddingProvider` and pass through `buildConfig({ llmProvider, embeddingProvider })`
- `templates/ai-bookmarks-core-domain/viewer/index.html` — add "Related" section per bookmark; add graph-view toggle with hand-rolled SVG circular layout
- `examples/ai-bookmarks-real/README.md` — document embedding pipeline + graph view + expected cost
- `docs/architecture/OPEN-QUESTIONS.md` — mark 主线 A complete; bump amendment count; note viewer graph is MVP circular layout (not force-directed)

---

## Task 1: `EmbeddingProvider` interface + `MockEmbeddingProvider`

**Files:**
- Create: `packages/core-domain/src/services/embedding-provider.ts`
- Create: `packages/core-domain/test/services/embedding-provider.test.ts`
- Modify: `packages/core-domain/src/index.ts` (add re-exports; current file already re-exports `LLMProvider`, `MockLLMProvider` — mirror that shape exactly)

### - [ ] Step 1: Write failing test

Create `packages/core-domain/test/services/embedding-provider.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import {
  MockEmbeddingProvider,
  type EmbeddingProvider,
  type EmbedInput,
} from "../../src/services/embedding-provider.js";
import type { PermissionContext } from "../../src/value-objects/permission-context.js";

const CTX: PermissionContext = {
  subject: { kind: "user", id: "u1" },
  user: { id: "u1", attrs: {} },
};

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
```

### - [ ] Step 2: Run test to verify it fails

Run: `bun test packages/core-domain/test/services/embedding-provider.test.ts`
Expected: FAIL with `Cannot find module '../../src/services/embedding-provider.js'`.

### - [ ] Step 3: Implement minimal interface + mock

Create `packages/core-domain/src/services/embedding-provider.ts`:

```typescript
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
```

Then add to `packages/core-domain/src/index.ts` (append near other service re-exports — current file already exports `LLMProvider` via `./services/transform-runner.js`, add an adjacent line):

```typescript
export {
  EmbeddingProvider,
  EmbedInput,
  EmbeddingProviderError,
  MockEmbeddingProvider,
} from "./services/embedding-provider.js";
```

### - [ ] Step 4: Run test to verify it passes

Run: `bun test packages/core-domain/test/services/embedding-provider.test.ts`
Expected: PASS, 3 tests green.

### - [ ] Step 5: Typecheck

Run: `bun run typecheck` (or the root `tsc --noEmit -p packages/core-domain/tsconfig.json`).
Expected: no new errors.

### - [ ] Step 6: Commit

```bash
git add packages/core-domain/src/services/embedding-provider.ts \
        packages/core-domain/test/services/embedding-provider.test.ts \
        packages/core-domain/src/index.ts
git commit -m "feat(core-domain): add EmbeddingProvider interface + MockEmbeddingProvider"
```

---

## Task 2: `OpenRouterEmbeddingProvider` implementation

**Files:**
- Create: `packages/provider-openrouter/src/embedding.ts`
- Create: `packages/provider-openrouter/test/embedding.test.ts`
- Modify: `packages/provider-openrouter/src/index.ts` (add re-export line)

### - [ ] Step 1: Write failing test

Create `packages/provider-openrouter/test/embedding.test.ts`:

```typescript
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
    let capturedUrl: string | null = null;
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
```

### - [ ] Step 2: Run test to verify it fails

Run: `bun test packages/provider-openrouter/test/embedding.test.ts`
Expected: FAIL with `Cannot find module '../src/embedding.js'`.

### - [ ] Step 3: Implement

Create `packages/provider-openrouter/src/embedding.ts`:

```typescript
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
```

Modify `packages/provider-openrouter/src/index.ts` — append at end:

```typescript
export {
  OpenRouterEmbeddingProvider,
  type OpenRouterEmbeddingConfig,
} from "./embedding.js";
```

### - [ ] Step 4: Run test to verify it passes

Run: `bun test packages/provider-openrouter/test/embedding.test.ts`
Expected: PASS, 3 tests green.

### - [ ] Step 5: Typecheck

Run: `bun run typecheck`
Expected: no new errors.

### - [ ] Step 6: Commit

```bash
git add packages/provider-openrouter/src/embedding.ts \
        packages/provider-openrouter/test/embedding.test.ts \
        packages/provider-openrouter/src/index.ts
git commit -m "feat(provider-openrouter): add OpenRouterEmbeddingProvider"
```

---

## Task 3: Cosine-similarity helper

**Files:**
- Create: `templates/ai-bookmarks-core-domain/server/cosine.ts`
- Create: `templates/ai-bookmarks-core-domain/test/cosine.test.ts` (new `test/` dir on this template)

Reason we split this out: it's a 10-line pure function used by two Operations (`related_bookmarks`, `bookmark_graph`) and must be unit-tested without the runtime. Inline-ing it into `config.ts` would make `config.ts` even harder to hold in one buffer.

### - [ ] Step 1: Write failing test

Create `templates/ai-bookmarks-core-domain/test/cosine.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { cosineSimilarity } from "../server/cosine.js";

describe("cosineSimilarity", () => {
  it("identical vectors → 1", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 10);
  });

  it("orthogonal → 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("opposite → -1", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
  });

  it("scaled vectors still → 1", () => {
    expect(cosineSimilarity([2, 4], [1, 2])).toBeCloseTo(1, 10);
  });

  it("zero vector anywhere → 0 (safe)", () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
    expect(cosineSimilarity([1, 2], [0, 0])).toBe(0);
  });

  it("mismatched dims → throws", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/dim mismatch/);
  });
});
```

### - [ ] Step 2: Run test to verify it fails

Run: `bun test templates/ai-bookmarks-core-domain/test/cosine.test.ts`
Expected: FAIL with `Cannot find module '../server/cosine.js'`.

### - [ ] Step 3: Implement

Create `templates/ai-bookmarks-core-domain/server/cosine.ts`:

```typescript
// Cosine similarity — 两个 number[] 的纯函数, 不依赖 core-domain.
// 输入同维度, 输出 [-1, 1] 的 number. 任一向量模 0 则返回 0.

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: dim mismatch ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
```

### - [ ] Step 4: Run test to verify it passes

Run: `bun test templates/ai-bookmarks-core-domain/test/cosine.test.ts`
Expected: PASS, 6 tests green.

### - [ ] Step 5: Commit

```bash
git add templates/ai-bookmarks-core-domain/server/cosine.ts \
        templates/ai-bookmarks-core-domain/test/cosine.test.ts
git commit -m "feat(ai-bookmarks-core-domain): add cosineSimilarity helper"
```

---

## Task 4: Schema — add `embedding` column on `interpretationsTable`

**Files:**
- Modify: `templates/ai-bookmarks-core-domain/server/config.ts` (only the `interpretationsTable` definition, around line 68-92 per current file)

### - [ ] Step 1: Modify the `interpretationsTable` declaration

Locate `export const interpretationsTable = new Table({` in `templates/ai-bookmarks-core-domain/server/config.ts` and extend its `columns` array with one new entry (nullable so old rows still validate):

```typescript
export const interpretationsTable = new Table({
  id: "interpretations",
  app_id: APP_ID,
  columns: [
    {
      name: "bookmark_id",
      type: { kind: "ref-row", table: "bookmarks" },
      cascade_on_target_delete: true,
    },
    {
      name: "lens_id",
      type: { kind: "ref-row", table: "lenses" },
      cascade_on_target_delete: true,
    },
    { name: "body", type: RICH },
    { name: "generated_at", type: DATE_T },
    {
      name: "embedding",
      type: { kind: "vector", dim: 1536 },
      nullable: true,
    },
  ],
  source: { kind: "stored" },
});
```

### - [ ] Step 2: Typecheck

Run: `bun run typecheck`
Expected: no new errors (Column accepts `{ kind: "vector"; dim: number }` already).

### - [ ] Step 3: Commit

```bash
git add templates/ai-bookmarks-core-domain/server/config.ts
git commit -m "feat(ai-bookmarks-core-domain): add nullable embedding column on interpretations"
```

---

## Task 5: `embed_text` Transform declaration + plumb `embeddingProvider` through `buildConfig`

**Files:**
- Modify: `templates/ai-bookmarks-core-domain/server/config.ts`
- Modify: `templates/ai-bookmarks-core-domain/server/app.ts`

This task declares the Transform, threads the provider through the existing `BuildConfigDeps`, and registers the code-impl closure. `add_bookmark` is **not** modified yet — that is Task 6.

### - [ ] Step 1: Extend `BuildConfigDeps`

Near the top of `templates/ai-bookmarks-core-domain/server/config.ts`, find the existing `BuildConfigDeps` interface. Add `embeddingProvider` and an optional model override:

```typescript
export interface BuildConfigDeps {
  readonly llmProvider: LLMProvider;
  readonly embeddingProvider: EmbeddingProvider;
  readonly embeddingModel?: string; // default: "openai/text-embedding-3-small"
}
```

Add the import near the top of the file with the other core-domain imports:

```typescript
import type { EmbeddingProvider } from "@pneuma-framework/core-domain";
```

### - [ ] Step 2: Declare `embedText` Transform

Add after the `interpretWithLens` declaration:

```typescript
export const embedText = new Transform({
  id: "embed_text",
  app_id: APP_ID,
  in: { kind: "cell", type: RICH },
  out: { kind: "vector", dim: 1536 },
  impl: { kind: "code", ref: "./transforms/embed_text.ts" },
  purity: "pure-with-ttl",
  ttl_seconds: 60 * 60 * 24 * 7, // 7 days
});
```

And add it to the `transforms:` array returned by `buildConfig`:

```typescript
transforms: [fetchReadable, interpretWithLens, embedText],
```

### - [ ] Step 3: Register code-impl closure

Inside `buildConfig({ llmProvider, embeddingProvider, embeddingModel })`, find the `transformImpls` map (where `fetch_readable` is registered) and add:

```typescript
const embedModel = embeddingModel ?? "openai/text-embedding-3-small";

const transformImpls: Record<string, TransformFn> = {
  "./transforms/fetch_readable.ts": fetchReadableImpl,
  "./transforms/embed_text.ts": async ({ ctx, input }) => {
    const text = typeof input === "string" ? input : String(input ?? "");
    if (!text) return new Array(1536).fill(0); // 空文本 → 零向量, cacheable
    return await embeddingProvider.embed({ model: embedModel, text }, ctx);
  },
};
```

### - [ ] Step 4: Wire provider in `app.ts`

Modify `templates/ai-bookmarks-core-domain/server/app.ts`:

Add import near the `OpenRouterLLMProvider` import:

```typescript
import {
  OpenRouterLLMProvider,
  OpenRouterEmbeddingProvider,
} from "@pneuma-framework/provider-openrouter";
```

Replace the single-provider construction with both:

```typescript
const apiKey = requireEnv("OPENROUTER_API_KEY");
const llmProvider = new OpenRouterLLMProvider({
  apiKey,
  temperature: 0.4,
  maxTokens: 2048,
});
const embeddingProvider = new OpenRouterEmbeddingProvider({ apiKey });

const config = buildConfig({ llmProvider, embeddingProvider });
```

### - [ ] Step 5: Typecheck + boot smoke

Run: `bun run typecheck`
Expected: no new errors.

Run: `bun run examples/ai-bookmarks-real/run.ts --workspace /tmp/pneuma-bookmarks-embed-smoke --port 8766 &` then `sleep 2 && curl -s http://127.0.0.1:8766/api/health` and expect a 200 JSON. Kill server after. This proves wiring compiles + boots; we are not yet exercising embedding.

(If the example's `run.ts` rebuilds before starting and blocks, substitute `cd templates/ai-bookmarks-core-domain && bun run server/app.ts` with the same env var instead.)

### - [ ] Step 6: Commit

```bash
git add templates/ai-bookmarks-core-domain/server/config.ts \
        templates/ai-bookmarks-core-domain/server/app.ts
git commit -m "feat(ai-bookmarks-core-domain): declare embed_text Transform + wire OpenRouter embedding provider"
```

---

## Task 6: Embed after each interpretation in `add_bookmark`

**Files:**
- Modify: `templates/ai-bookmarks-core-domain/server/config.ts` (only the `addBookmark` handler body)

### - [ ] Step 1: Modify the inner lens loop

Inside the existing `addBookmark` handler, find the per-lens `try { … }` block (around line 466 in the current file). Immediately after `const body = ...` and **before** the `storage.saveRow(new Row({ …, cells: { …, body, generated_at } }))` call, add the embedding call; then include `embedding` in the cells map:

```typescript
try {
  const body = (await transformRunner.apply(
    interpretWithLens,
    { body: fetched.body.slice(0, 20_000), lens_prompt: lensPrompt },
    ctx
  )) as string;

  let embedding: number[] | undefined;
  try {
    embedding = (await transformRunner.apply(embedText, body, ctx)) as number[];
  } catch (err) {
    console.error(`[add_bookmark] embed_text failed for lens "${lensId}":`, err);
    // 继续存 interpretation; embedding 列保持 unset (nullable)
  }

  const itpId = `itp-${bookmarkId}-${lensId}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2, 4)}`;
  const cells: Record<string, unknown> = {
    bookmark_id: { kind: "row", table: "bookmarks", id: bookmarkId } satisfies Ref,
    lens_id: { kind: "row", table: "lenses", id: lensId } satisfies Ref,
    body,
    generated_at: Date.now(),
  };
  if (embedding) cells.embedding = embedding;

  await storage.saveRow(
    new Row({
      id: itpId,
      table_id: "interpretations",
      app_id: APP_ID,
      cells,
    })
  );
  created++;
} catch (err) {
  console.error(`[add_bookmark] lens "${lensId}" failed:`, err);
  // 继续其它 lens
}
```

### - [ ] Step 2: Typecheck

Run: `bun run typecheck`
Expected: no new errors.

### - [ ] Step 3: End-to-end smoke (optional local)

```bash
rm -rf /tmp/pneuma-bookmarks-embed-smoke
OPENROUTER_API_KEY=$OPENROUTER_API_KEY \
  bun run examples/ai-bookmarks-real/run.ts \
  --workspace /tmp/pneuma-bookmarks-embed-smoke --port 8766 &
sleep 2
curl -s -X POST http://127.0.0.1:8766/api/operations/add_bookmark \
  -H 'content-type: application/json' \
  -d '{"input":{"url":"https://example.com"}}'
# wait for the add_bookmark response, then:
sqlite3 /tmp/pneuma-bookmarks-embed-smoke/data/rows.db \
  "SELECT json_extract(cells, '$.embedding') IS NOT NULL FROM rows WHERE table_id='interpretations';"
# Expected: "1" printed N times (one per lens interpretation).
```

Skip this step if no `OPENROUTER_API_KEY` is available; the test in Task 7 covers the flow with a mock provider instead.

### - [ ] Step 4: Commit

```bash
git add templates/ai-bookmarks-core-domain/server/config.ts
git commit -m "feat(ai-bookmarks-core-domain): embed each interpretation body during add_bookmark"
```

---

## Task 7: `related_bookmarks` Operation

**Files:**
- Modify: `templates/ai-bookmarks-core-domain/server/config.ts` (add Operation + handler)
- Create: `templates/ai-bookmarks-core-domain/test/related-bookmarks.test.ts`

Behavior: given a `bookmark_id` and optional `lens_slug`, return the top-`limit` other bookmarks by max cosine similarity between an interpretation on the target and any interpretation on the candidate under the same lens (or any lens if `lens_slug` omitted). Skip bookmarks whose interpretations have no embedding.

### - [ ] Step 1: Write full failing test (direct-seed style)

Before writing the test, check how existing tests in `packages/runtime/test/*.test.ts` and any `templates/*/test/*.test.ts` boot the runtime and dispatch an Operation. Mirror that exact pattern — the seam hints below (`runtime.invoke` / `runtime.storage`) may need to be replaced with the real exports. The goal is: boot the runtime with mock providers, write rows directly to storage, invoke `related_bookmarks`, check the returned `rows`.

Rationale for direct-seed: going through `add_bookmark` would require mocking `fetch_readable`'s Jina call (heavyweight). Writing rows directly keeps the test focused on the Operation's cosine-sort + filter logic.

Create `templates/ai-bookmarks-core-domain/test/related-bookmarks.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MockLLMProvider,
  MockEmbeddingProvider,
  Row,
} from "@pneuma-framework/core-domain";
import { bootAppRuntime } from "@pneuma-framework/runtime";
import { buildConfig } from "../server/config.js";

const APP_ID = "ai-bookmarks-core-domain";

async function boot() {
  const dir = await mkdtemp(join(tmpdir(), "pneuma-rel-"));
  const llm = new MockLLMProvider();
  llm.defaultResponse = "summary";
  const embed = new MockEmbeddingProvider();
  const base = buildConfig({ llmProvider: llm, embeddingProvider: embed });
  const config = {
    ...base,
    storage: { sqlite_path: join(dir, "rows.db") },
    audit: { ndjson_path: join(dir, "audit.ndjson") },
    history: { sqlite_path: join(dir, "history.db") },
  };
  const runtime = await bootAppRuntime(config);
  return { runtime, dir };
}

function vec(first: number, second = 0): number[] {
  const v = new Array(1536).fill(0);
  v[0] = first;
  v[1] = second;
  return v;
}

async function seedBookmarkWithInterp(
  runtime: Awaited<ReturnType<typeof boot>>["runtime"],
  bmId: string,
  title: string,
  lensId: string,
  embedding: number[]
) {
  await runtime.storage.saveRow(
    new Row({
      id: bmId,
      table_id: "bookmarks",
      app_id: APP_ID,
      cells: { url: `https://x/${bmId}`, title, body: "b" },
    }),
    { checkRefIntegrity: false }
  );
  await runtime.storage.saveRow(
    new Row({
      id: `itp-${bmId}`,
      table_id: "interpretations",
      app_id: APP_ID,
      cells: {
        bookmark_id: { kind: "row", table: "bookmarks", id: bmId },
        lens_id: { kind: "row", table: "lenses", id: lensId },
        body: "b",
        generated_at: Date.now(),
        embedding,
      },
    })
  );
}

describe("related_bookmarks Operation", () => {
  let rt: Awaited<ReturnType<typeof boot>>;

  beforeEach(async () => {
    rt = await boot();
  });

  it("returns top-K candidates by cosine similarity", async () => {
    const { runtime } = rt;

    await runtime.invoke("upsert_lens", {
      input: { slug: "x", display_name: "X", prompt: "lens x" },
    });
    const lensesRes = await runtime.invoke("list_lenses", { input: {} });
    const lensId = (lensesRes.rows[0] as { id: string }).id;

    await seedBookmarkWithInterp(runtime, "bm-a", "A", lensId, vec(1, 0));
    await seedBookmarkWithInterp(runtime, "bm-b", "B", lensId, vec(0.99, 0.01));
    await seedBookmarkWithInterp(runtime, "bm-c", "C", lensId, vec(0, 1));

    const res = await runtime.invoke("related_bookmarks", {
      input: { bookmark_id: "bm-a", limit: 2 },
    });
    const rows = res.rows as Array<{ bookmark_id: string; score: number }>;
    expect(rows.length).toBe(2);
    expect(rows[0]!.bookmark_id).toBe("bm-b");
    expect(rows[0]!.score).toBeGreaterThan(rows[1]!.score);
  });

  it("skips bookmarks whose interpretations lack embedding", async () => {
    const { runtime } = rt;
    await runtime.invoke("upsert_lens", {
      input: { slug: "x", display_name: "X", prompt: "lens x" },
    });
    const lensesRes = await runtime.invoke("list_lenses", { input: {} });
    const lensId = (lensesRes.rows[0] as { id: string }).id;

    await seedBookmarkWithInterp(runtime, "bm-target", "T", lensId, vec(1));

    // Candidate bookmark WITHOUT embedding — manually insert interpretation without embedding cell
    await runtime.storage.saveRow(
      new Row({
        id: "bm-no-emb",
        table_id: "bookmarks",
        app_id: APP_ID,
        cells: { url: "https://y", title: "NoEmb", body: "b" },
      }),
      { checkRefIntegrity: false }
    );
    await runtime.storage.saveRow(
      new Row({
        id: "itp-no-emb",
        table_id: "interpretations",
        app_id: APP_ID,
        cells: {
          bookmark_id: { kind: "row", table: "bookmarks", id: "bm-no-emb" },
          lens_id: { kind: "row", table: "lenses", id: lensId },
          body: "b",
          generated_at: Date.now(),
        },
      })
    );

    const res = await runtime.invoke("related_bookmarks", {
      input: { bookmark_id: "bm-target" },
    });
    expect((res.rows as unknown[]).length).toBe(0);
  });
});
```

Note on `runtime.invoke` and `runtime.storage`: **verify against existing runtime tests before committing**. If `bootAppRuntime` returns a different-shaped object, use the real exports. `Row` must be exported from `@pneuma-framework/core-domain` — if not, add the export or import from a submodule path.

### - [ ] Step 2: Run test to verify it fails

Run: `bun test templates/ai-bookmarks-core-domain/test/related-bookmarks.test.ts`
Expected: FAIL — either `embeddingProvider` not yet accepted by `buildConfig` (Task 5 fixes this) or the operation `related_bookmarks` is not registered.

### - [ ] Step 3: Implement Operation + handler

Add near the other Operation declarations in `templates/ai-bookmarks-core-domain/server/config.ts`:

```typescript
export const relatedBookmarksOp = new Operation({
  id: "related_bookmarks",
  app_id: APP_ID,
  resource: { kind: "table", table: "interpretations" },
  action: "read",
  side_effects: "read-only",
  input_schema: {
    type: "object",
    properties: {
      bookmark_id: { type: "string" },
      lens_slug: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 100 },
    },
    required: ["bookmark_id"],
    additionalProperties: false,
  },
  handler: { kind: "code", ref: "related_bookmarks" },
  ui_binding: { kind: "query", displayKey: "title" },
});
```

Add the handler alongside `addBookmark`:

```typescript
const relatedBookmarks: HandlerFn = async ({ ctx, input, storage, services }) => {
  const i = input as {
    bookmark_id: string;
    lens_slug?: string;
    limit?: number;
  };
  const limit = Math.min(Math.max(i.limit ?? 5, 1), 100);

  // 1. Resolve lens_id filter (optional)
  let lensIdFilter: string | undefined;
  if (i.lens_slug) {
    const allLenses = await storage.listRowsByTable("lenses");
    const match = allLenses.find((r) => r.getCell("slug") === i.lens_slug);
    if (!match) return { rows: [] };
    lensIdFilter = match.id;
  }

  // 2. Load all interpretations
  const allInterps = await storage.listRowsByTable("interpretations");

  const getRefId = (r: { getCell: (n: string) => unknown }, col: string): string | null => {
    const v = r.getCell(col);
    if (typeof v === "object" && v !== null && "id" in v) {
      return String((v as { id?: unknown }).id ?? "");
    }
    return null;
  };

  const targetInterps = allInterps.filter(
    (r) =>
      getRefId(r, "bookmark_id") === i.bookmark_id &&
      (!lensIdFilter || getRefId(r, "lens_id") === lensIdFilter) &&
      Array.isArray(r.getCell("embedding"))
  );
  if (targetInterps.length === 0) return { rows: [] };

  // 3. For each candidate bookmark, compute max cosine across same-lens pairs
  type Score = { bookmark_id: string; score: number; lens_id: string };
  const perBookmark = new Map<string, Score>();
  for (const cand of allInterps) {
    const candBmId = getRefId(cand, "bookmark_id");
    if (!candBmId || candBmId === i.bookmark_id) continue;
    const candLensId = getRefId(cand, "lens_id");
    if (!candLensId) continue;
    if (lensIdFilter && candLensId !== lensIdFilter) continue;
    const candVec = cand.getCell("embedding");
    if (!Array.isArray(candVec)) continue;

    for (const tgt of targetInterps) {
      const tgtLensId = getRefId(tgt, "lens_id");
      if (tgtLensId !== candLensId) continue;
      const tgtVec = tgt.getCell("embedding") as number[];
      const score = cosineSimilarity(tgtVec, candVec as number[]);
      const prev = perBookmark.get(candBmId);
      if (!prev || score > prev.score) {
        perBookmark.set(candBmId, { bookmark_id: candBmId, score, lens_id: candLensId });
      }
    }
  }

  // 4. Join bookmark rows + return top-K
  const allBookmarks = await storage.listRowsByTable("bookmarks");
  const byId = new Map(allBookmarks.map((r) => [r.id, r]));

  const scored = [...perBookmark.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => {
      const bm = byId.get(s.bookmark_id);
      return {
        bookmark_id: s.bookmark_id,
        title: bm?.getCell("title") ?? null,
        url: bm?.getCell("url") ?? null,
        lens_id: s.lens_id,
        score: s.score,
      };
    });

  return { rows: scored };
};
```

Import the helper at the top of `config.ts`:

```typescript
import { cosineSimilarity } from "./cosine.js";
```

Register it in the `handlers` map (where `addBookmark` etc. are registered):

```typescript
related_bookmarks: relatedBookmarks,
```

Add `relatedBookmarksOp` to the `operations:` array in the return of `buildConfig`.

### - [ ] Step 4: Run test

Run: `bun test templates/ai-bookmarks-core-domain/test/related-bookmarks.test.ts`
Expected: PASS, 2 tests green.

### - [ ] Step 5: Typecheck

Run: `bun run typecheck`
Expected: no new errors.

### - [ ] Step 6: Commit

```bash
git add templates/ai-bookmarks-core-domain/server/config.ts \
        templates/ai-bookmarks-core-domain/test/related-bookmarks.test.ts
git commit -m "feat(ai-bookmarks-core-domain): related_bookmarks Operation via cosine similarity"
```

---

## Task 8: `bookmark_graph` Operation

**Files:**
- Modify: `templates/ai-bookmarks-core-domain/server/config.ts`
- Create: `templates/ai-bookmarks-core-domain/test/bookmark-graph.test.ts`

Behavior: return `{ nodes: [{ id, title, url }], edges: [{ source, target, lens_id, score }] }` where edges are same-lens interpretation pairs with cosine ≥ `threshold` (default 0.75). Optional `lens_slug` filters to a single lens.

### - [ ] Step 1: Write failing test

Create `templates/ai-bookmarks-core-domain/test/bookmark-graph.test.ts` — same boot helper as Task 7 test (copy it inline; do **not** share a helper file for 2 tests — keep them self-contained). Seed three bookmarks with the same vectors as Task 7's first test, then:

```typescript
it("emits edges above threshold with correct endpoints", async () => {
  // … seed bm-a, bm-b, bm-c under one lens as in Task 7 …
  const res = await runtime.invoke("bookmark_graph", {
    input: { threshold: 0.5 },
  });
  const { nodes, edges } = res as {
    nodes: Array<{ id: string; title: string | null }>;
    edges: Array<{ source: string; target: string; score: number }>;
  };
  expect(nodes.map((n) => n.id).sort()).toEqual(["bm-a", "bm-b", "bm-c"]);
  // A–B passes 0.5; A–C / B–C orthogonal (~0) → filtered out
  const ids = edges
    .map((e) => [e.source, e.target].sort().join("-"))
    .sort();
  expect(ids).toEqual(["bm-a-bm-b"]);
  expect(edges[0]!.score).toBeGreaterThan(0.5);
});

it("returns no edges if all below threshold", async () => {
  // … seed bm-a, bm-c only (orthogonal pair) …
  const res = await runtime.invoke("bookmark_graph", {
    input: { threshold: 0.5 },
  });
  expect((res as { edges: unknown[] }).edges.length).toBe(0);
});
```

### - [ ] Step 2: Run test to verify it fails

Run: `bun test templates/ai-bookmarks-core-domain/test/bookmark-graph.test.ts`
Expected: FAIL — either unknown operation `bookmark_graph` or similar registry miss.

### - [ ] Step 3: Implement

Add to `templates/ai-bookmarks-core-domain/server/config.ts`:

```typescript
export const bookmarkGraphOp = new Operation({
  id: "bookmark_graph",
  app_id: APP_ID,
  resource: { kind: "table", table: "interpretations" },
  action: "read",
  side_effects: "read-only",
  input_schema: {
    type: "object",
    properties: {
      lens_slug: { type: "string" },
      threshold: { type: "number", minimum: -1, maximum: 1 },
    },
    additionalProperties: false,
  },
  handler: { kind: "code", ref: "bookmark_graph" },
  ui_binding: { kind: "query", displayKey: "title" },
});

const bookmarkGraph: HandlerFn = async ({ input, storage }) => {
  const i = input as { lens_slug?: string; threshold?: number };
  const threshold = typeof i.threshold === "number" ? i.threshold : 0.75;

  // Resolve lens filter (optional)
  let lensIdFilter: string | undefined;
  if (i.lens_slug) {
    const allLenses = await storage.listRowsByTable("lenses");
    const match = allLenses.find((r) => r.getCell("slug") === i.lens_slug);
    if (!match) return { nodes: [], edges: [] };
    lensIdFilter = match.id;
  }

  const allInterps = await storage.listRowsByTable("interpretations");

  const getRefId = (r: { getCell: (n: string) => unknown }, col: string): string | null => {
    const v = r.getCell(col);
    if (typeof v === "object" && v !== null && "id" in v) {
      return String((v as { id?: unknown }).id ?? "");
    }
    return null;
  };

  const withEmb = allInterps
    .filter((r) => Array.isArray(r.getCell("embedding")))
    .filter((r) => !lensIdFilter || getRefId(r, "lens_id") === lensIdFilter);

  // Group by lens_id
  const byLens = new Map<string, typeof withEmb>();
  for (const r of withEmb) {
    const lid = getRefId(r, "lens_id")!;
    const arr = byLens.get(lid) ?? [];
    arr.push(r);
    byLens.set(lid, arr);
  }

  // Compute pairs per lens, take max score per (bmA, bmB) across all lenses
  type Edge = { source: string; target: string; lens_id: string; score: number };
  const edges: Edge[] = [];
  for (const [lid, group] of byLens) {
    for (let i1 = 0; i1 < group.length; i1++) {
      for (let i2 = i1 + 1; i2 < group.length; i2++) {
        const aBm = getRefId(group[i1]!, "bookmark_id")!;
        const bBm = getRefId(group[i2]!, "bookmark_id")!;
        if (aBm === bBm) continue;
        const aVec = group[i1]!.getCell("embedding") as number[];
        const bVec = group[i2]!.getCell("embedding") as number[];
        const score = cosineSimilarity(aVec, bVec);
        if (score >= threshold) {
          const [source, target] = aBm < bBm ? [aBm, bBm] : [bBm, aBm];
          edges.push({ source, target, lens_id: lid, score });
        }
      }
    }
  }

  // Nodes = every bookmark that participates in an edge OR has any interp with embedding
  const bmIds = new Set<string>();
  for (const e of edges) {
    bmIds.add(e.source);
    bmIds.add(e.target);
  }
  for (const r of withEmb) {
    const bmId = getRefId(r, "bookmark_id");
    if (bmId) bmIds.add(bmId);
  }
  const allBookmarks = await storage.listRowsByTable("bookmarks");
  const nodes = allBookmarks
    .filter((r) => bmIds.has(r.id))
    .map((r) => ({ id: r.id, title: r.getCell("title") ?? null, url: r.getCell("url") ?? null }));

  return { nodes, edges };
};
```

Register `bookmark_graph: bookmarkGraph` in the `handlers` map and add `bookmarkGraphOp` to the `operations:` array.

### - [ ] Step 4: Run test

Run: `bun test templates/ai-bookmarks-core-domain/test/bookmark-graph.test.ts`
Expected: PASS.

### - [ ] Step 5: Typecheck

Run: `bun run typecheck`
Expected: no new errors.

### - [ ] Step 6: Commit

```bash
git add templates/ai-bookmarks-core-domain/server/config.ts \
        templates/ai-bookmarks-core-domain/test/bookmark-graph.test.ts
git commit -m "feat(ai-bookmarks-core-domain): bookmark_graph Operation with per-lens pair edges"
```

---

## Task 9: Viewer — inline "Related" section per bookmark

**Files:**
- Modify: `templates/ai-bookmarks-core-domain/viewer/index.html`

The viewer is a single static HTML file with embedded CSS + vanilla JS. We add one fetch + one render function. No build step, no npm deps.

### - [ ] Step 1: Add "Related" fetch + render

Locate the existing bookmark-card render function (search for `interpretation` rendering). For each bookmark card, after rendering its interpretations, append a "Related" panel fed by `POST /api/operations/related_bookmarks` with `{ bookmark_id, limit: 5 }`.

Insert this helper at module scope:

```javascript
async function loadRelated(bookmarkId) {
  try {
    const res = await fetch("/api/operations/related_bookmarks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: { bookmark_id: bookmarkId, limit: 5 } }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.rows ?? [];
  } catch {
    return [];
  }
}

function renderRelated(container, rows) {
  if (!rows.length) {
    container.innerHTML = "<div class='muted'>No related bookmarks yet.</div>";
    return;
  }
  container.innerHTML =
    "<h4>Related</h4><ul>" +
    rows
      .map(
        (r) =>
          `<li><a href="#bm-${r.bookmark_id}">${escapeHtml(r.title ?? r.url ?? r.bookmark_id)}</a>` +
          ` <span class="muted">(${r.score.toFixed(3)})</span></li>`
      )
      .join("") +
    "</ul>";
}
```

And call from the per-bookmark render:

```javascript
// at the end of the bookmark card construction
const relatedEl = document.createElement("div");
relatedEl.className = "related-panel";
card.appendChild(relatedEl);
loadRelated(bookmark.id).then((rows) => renderRelated(relatedEl, rows));
```

Add minimal CSS (near the other `.panel` / `.muted` rules):

```css
.related-panel { margin-top: 1rem; padding-top: 0.5rem; border-top: 1px dashed var(--divider); }
.related-panel h4 { margin: 0 0 0.25rem; font-size: 0.85rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
.related-panel ul { list-style: none; margin: 0; padding: 0; }
.related-panel li { font-size: 0.9rem; padding: 0.15rem 0; }
.muted { color: var(--muted); }
```

### - [ ] Step 2: Manual smoke

Run the example server (same command as Task 5 Step 5). In browser:
1. Add two bookmarks of similar topics (e.g. both about React, or both about Rust).
2. Verify "Related" panel under each shows the other with a reasonable score.
3. Add an unrelated bookmark (e.g. a cooking recipe) and verify lower score / not in top.

### - [ ] Step 3: Commit

```bash
git add templates/ai-bookmarks-core-domain/viewer/index.html
git commit -m "feat(ai-bookmarks-core-domain viewer): inline Related panel per bookmark"
```

---

## Task 10: Viewer — graph toggle with hand-rolled SVG

**Files:**
- Modify: `templates/ai-bookmarks-core-domain/viewer/index.html`

MVP layout: nodes placed on a circle, edges drawn as lines whose stroke-opacity scales with score. No force-directed physics. Nodes show title on hover; clicking a node scrolls to its bookmark card.

### - [ ] Step 1: Add toggle button + graph container

In the top toolbar, add a button:

```html
<button id="toggle-graph-btn" class="ghost">Graph</button>
```

And below the bookmarks list, add:

```html
<div id="graph-view" hidden>
  <svg id="graph-svg" viewBox="0 0 600 600" width="600" height="600"></svg>
</div>
```

### - [ ] Step 2: Wire toggle + render

Add at module scope:

```javascript
const toggleGraphBtn = document.getElementById("toggle-graph-btn");
const graphView = document.getElementById("graph-view");
const graphSvg = document.getElementById("graph-svg");

toggleGraphBtn.addEventListener("click", async () => {
  const willShow = graphView.hasAttribute("hidden");
  graphView.toggleAttribute("hidden");
  toggleGraphBtn.classList.toggle("active", willShow);
  if (willShow) await renderGraph();
});

async function renderGraph() {
  graphSvg.innerHTML = "<text x='300' y='300' text-anchor='middle' fill='currentColor'>Loading…</text>";
  const res = await fetch("/api/operations/bookmark_graph", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: { threshold: 0.75 } }),
  });
  if (!res.ok) {
    graphSvg.innerHTML = "<text x='300' y='300' text-anchor='middle' fill='red'>failed</text>";
    return;
  }
  const { nodes, edges } = await res.json();

  const cx = 300, cy = 300, r = 240;
  const pos = new Map();
  nodes.forEach((n, i) => {
    const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
    pos.set(n.id, { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  });

  const edgeSvg = edges
    .map((e) => {
      const a = pos.get(e.source), b = pos.get(e.target);
      if (!a || !b) return "";
      const opacity = Math.max(0.1, Math.min(1, e.score)).toFixed(2);
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="currentColor" stroke-opacity="${opacity}" stroke-width="1.5"/>`;
    })
    .join("");

  const nodeSvg = nodes
    .map((n) => {
      const p = pos.get(n.id);
      const label = (n.title ?? n.url ?? n.id).toString().slice(0, 28);
      return (
        `<g class="graph-node" data-bm="${n.id}">` +
        `<circle cx="${p.x}" cy="${p.y}" r="6" fill="currentColor"/>` +
        `<text x="${p.x}" y="${p.y - 10}" text-anchor="middle" font-size="11">${escapeHtml(label)}</text>` +
        `</g>`
      );
    })
    .join("");

  graphSvg.innerHTML = edgeSvg + nodeSvg;

  graphSvg.querySelectorAll(".graph-node").forEach((g) => {
    g.style.cursor = "pointer";
    g.addEventListener("click", () => {
      const id = g.getAttribute("data-bm");
      const card = document.getElementById(`bm-${id}`);
      if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}
```

Add CSS:

```css
#graph-view { margin: 2rem 0; display: flex; justify-content: center; }
#graph-svg { max-width: 100%; color: var(--fg); }
button.ghost.active { background: var(--accent); color: var(--bg); }
```

And ensure each bookmark card has `id="bm-{bookmarkId}"` in the existing render (add if missing).

### - [ ] Step 3: Manual smoke

Reload viewer. Click "Graph":
- Loading text appears briefly
- Circle layout with N nodes + edges appears
- Click a node — page scrolls to that bookmark's card

### - [ ] Step 4: Commit

```bash
git add templates/ai-bookmarks-core-domain/viewer/index.html
git commit -m "feat(ai-bookmarks-core-domain viewer): hand-rolled SVG graph view toggle"
```

---

## Task 11: Docs — `examples/ai-bookmarks-real/README.md` + `OPEN-QUESTIONS.md`

**Files:**
- Modify: `examples/ai-bookmarks-real/README.md`
- Modify: `docs/architecture/OPEN-QUESTIONS.md`

### - [ ] Step 1: Update example README

In `examples/ai-bookmarks-real/README.md`, add to the "演示了这些承诺端到端真实化" bullet list:

```markdown
- **主线 A (2026-04-24)**：interpretation 有 `embedding` 列；`related_bookmarks` + `bookmark_graph` Operation 在内存里算 cosine 相似度；viewer 下方多一条 "Related" + 一个 "Graph" 切换
```

And add to the "玩玩建议" list:

```markdown
- 加 5+ 个不同主题的 URL，观察 Related 列表 / Graph 聚类是否符合直觉
- 删一个 bookmark 看 graph 是否跟着消失（cascade 下 interpretation 消失 → graph 边消失）
```

### - [ ] Step 2: Update OPEN-QUESTIONS

In `docs/architecture/OPEN-QUESTIONS.md`:

1. At the top, bump the "最后更新" line to `2026-04-25（或当天实际日期；主线 A 完成: embedding + graph）`.
2. Under "### 两个真 AI-native app 在本地可跑", replace the `ai-bookmarks-core-domain` bullet to include the embedding + graph paragraph.
3. Move the "主线 A" section from "Post-compact 候选" into a new "✅ 已完成主线" section with a one-line summary + pointer to this plan.
4. Note any edge cases discovered during implementation as new entries under "已知需要 amend 的 ADR" or "Post-compact 候选" as appropriate (e.g. "vector ComparisonOp still deferred — code-handler path sufficient for <10K rows").

### - [ ] Step 3: Commit

```bash
git add examples/ai-bookmarks-real/README.md \
        docs/architecture/OPEN-QUESTIONS.md
git commit -m "docs: 主线 A done — embedding + graph for ai-bookmarks"
```

---

## Final verification

### - [ ] Full test suite

Run: `bun test`
Expected: all existing tests pass + the new tests above pass. Note the final totals.

### - [ ] Full typecheck

Run: `bun run typecheck`
Expected: green across all 13+ tsconfig projects.

### - [ ] End-to-end dogfood

```bash
rm -rf /tmp/pneuma-bookmarks-embed-e2e
OPENROUTER_API_KEY=... \
  bun run examples/ai-bookmarks-real/run.ts \
  --workspace /tmp/pneuma-bookmarks-embed-e2e --port 8767
```

Browser to `http://127.0.0.1:8767/`:
1. Seed with 4–5 diverse URLs (mix 2 technical + 2 non-technical)
2. Verify each bookmark shows "Related" panel with similarity scores
3. Click "Graph" — nodes + edges show; click a node scrolls to card
4. Delete a bookmark — observe graph edge vanishes (cascade delete interpretations → fewer edges)

### - [ ] Cost sanity check

Confirm embedding calls cost ~$0.00003 per bookmark (3 interpretations × ~500 tokens × $0.02/1M). Note in README if materially different.
