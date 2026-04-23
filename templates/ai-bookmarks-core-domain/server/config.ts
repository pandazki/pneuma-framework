// ai-bookmarks-core-domain / config.ts
//
// 对应 M4 ai-bookmarks 的 core-domain 版本. 业务流程:
//   add_bookmark(url)
//     → fetch_readable Transform (Jina Reader) — pure-with-ttl cache
//     → 存 bookmark row
//     → list_lenses query
//     → foreach lens: interpret_with_lens Transform (prompt, Sonnet 4.6) — pure cache
//     → 存 interpretation row (ref to bookmark + ref to lens)
//     → return { bookmark_id, interpretation_count }
//
// 跟 M4 比差别:
//   - 没有 embedding / graph (推后; M4 的向量相似度值得独立做)
//   - Lens 是 DB row, 不是 runtime watched JSON 文件 (可选 seed from scaffold/lenses.json)
//   - 所有 HTTP 端点都是 Operation (不是手写 route) — 审计 / 策略 / destructive gate 自动

import { join } from "node:path";
import {
  Operation,
  PolicySet,
  Resources,
  Row,
  Subjects,
  Table,
  Transform,
  type CellType,
  type EmbeddingProvider,
  type HandlerFn,
  type ImpactComputeFn,
  type LLMProvider,
  type PermissionContext,
  type QueryBody,
  type Ref,
  type TransformFn,
  type WhereClause,
} from "@pneuma-framework/core-domain";
import type { AppConfig } from "@pneuma-framework/runtime";

export const APP_ID = "ai-bookmarks-core-domain";

const workspaceRoot =
  process.env.PNEUMA_WORKSPACE ?? join(process.cwd(), ".pneuma-workspace");
const dataDir = join(workspaceRoot, "data");

// ---------- CellTypes ----------

const TEXT: CellType = { kind: "primitive", of: "Text" };
const RICH: CellType = { kind: "primitive", of: "RichText" };
const URL_T: CellType = { kind: "primitive", of: "URL" };
const DATE_T: CellType = { kind: "primitive", of: "Date" };

// ---------- Tables ----------

export const bookmarksTable = new Table({
  id: "bookmarks",
  app_id: APP_ID,
  columns: [
    { name: "url", type: URL_T },
    { name: "title", type: TEXT, nullable: true },
    { name: "body", type: RICH, nullable: true },
  ],
  source: { kind: "stored" },
});

export const lensesTable = new Table({
  id: "lenses",
  app_id: APP_ID,
  columns: [
    { name: "slug", type: TEXT },
    { name: "display_name", type: TEXT },
    { name: "prompt", type: RICH },
  ],
  source: { kind: "stored" },
});

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

// ---------- Transforms ----------

// fetch_readable: Jina Reader 抓取 URL 正文. code impl, pure-with-ttl (内容 1 小时内视为不变)
export const fetchReadable = new Transform({
  id: "fetch_readable",
  app_id: APP_ID,
  in: { kind: "cell", type: URL_T },
  out: {
    kind: "json",
    schema: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } } },
  },
  impl: { kind: "code", ref: "./transforms/fetch_readable.ts" },
  purity: "pure-with-ttl",
  ttl_seconds: 3600,
});

// interpret_with_lens: 输入 { body, lens_prompt } → 输出 RichText. prompt impl, pure
export const interpretWithLens = new Transform({
  id: "interpret_with_lens",
  app_id: APP_ID,
  in: {
    kind: "record",
    fields: {
      body: RICH,
      lens_prompt: TEXT,
    },
  },
  out: RICH,
  impl: {
    kind: "prompt",
    model: "anthropic/claude-sonnet-4.6",
    system: [
      "You run a specific 'lens' on a piece of URL content. The user message is a JSON object with:",
      "  - body:       full extracted text of the URL",
      "  - lens_prompt: the lens's persona / instruction (what to produce)",
      "",
      "Execute the lens_prompt against the body. Output ONLY the lens result — no preamble, no fence.",
      "Match the language of the source body (Chinese if the article is in Chinese).",
    ].join("\n"),
  },
  purity: "pure",
});

// embed_text: 将 RichText 内容向量化. code impl (via EmbeddingProvider), pure-with-ttl 7d
export const embedText = new Transform({
  id: "embed_text",
  app_id: APP_ID,
  in: { kind: "cell", type: RICH },
  out: { kind: "vector", dim: 1536 },
  impl: { kind: "code", ref: "./transforms/embed_text.ts" },
  purity: "pure-with-ttl",
  ttl_seconds: 60 * 60 * 24 * 7, // 7 days
});

// ---------- Operations ----------

const listLensesQuery: QueryBody = {
  kind: "query",
  on: "lenses",
  sort: [{ column: "slug", dir: "asc" }],
  pagination: { kind: "cursor", size: 100 },
};

const listLensesOp = new Operation({
  id: "list_lenses",
  app_id: APP_ID,
  name: "List lenses",
  description: "所有 lens 的 slug/display_name/prompt",
  input: { type: "record", fields: {} },
  output: { kind: "row-list", row_type: "lenses" },
  affects: { mutations: [], adapter_writes: [], reads_only: true, destructive: false },
  handler: listLensesQuery,
});

const upsertLensOp = new Operation({
  id: "upsert_lens",
  app_id: APP_ID,
  name: "Add or update a lens",
  description: "同 slug 存在则更新, 不存在则创建. 不触发已有 interpretation 重新生成.",
  input: {
    type: "record",
    fields: {
      slug: { type: TEXT, required: true },
      display_name: { type: TEXT, required: true },
      prompt: { type: RICH, required: true },
    },
  },
  output: { kind: "void" },
  affects: {
    mutations: ["lenses"],
    adapter_writes: [],
    reads_only: false,
    destructive: false,
  },
  handler: { kind: "code", ref: "./ops/upsert_lens.ts" },
});

const deleteLensOp = new Operation({
  id: "delete_lens",
  app_id: APP_ID,
  name: "Delete lens",
  description: "删 lens. 级联删除所有该 lens 产生的 interpretation. destructive.",
  input: {
    type: "record",
    fields: {
      lens_id: { type: { kind: "ref-row", table: "lenses" }, required: true },
    },
  },
  output: { kind: "void" },
  affects: {
    mutations: ["lenses", "interpretations"],
    adapter_writes: [],
    reads_only: false,
    destructive: true,
  },
  handler: { kind: "code", ref: "./ops/delete_lens.ts" },
  impact: {
    compute: { kind: "code", ref: "./ops/delete_lens.impact.ts" },
    disclosure_template: "Will delete lens and all its interpretations",
  },
});

const addBookmarkOp = new Operation({
  id: "add_bookmark",
  app_id: APP_ID,
  name: "Add bookmark",
  description: "抓 URL 正文 → 对所有 lens 生成 interpretation → 存库. 单次调用走完整流水线; Transform 缓存保证同 url + 同 lens 不重烧 LLM.",
  input: {
    type: "record",
    fields: {
      url: { type: URL_T, required: true },
    },
  },
  output: { kind: "void" },
  affects: {
    mutations: ["bookmarks", "interpretations"],
    adapter_writes: [],
    reads_only: false,
    destructive: false,
  },
  handler: { kind: "code", ref: "./ops/add_bookmark.ts" },
});

const listBookmarksQuery: QueryBody = {
  kind: "query",
  on: "bookmarks",
  sort: [{ column: "created_at", dir: "desc" }], // created_at 是 Row aggregate 字段, 出现在 toRowView 里
  pagination: { kind: "cursor", size: 100 },
};

const listBookmarksOp = new Operation({
  id: "list_bookmarks",
  app_id: APP_ID,
  name: "List bookmarks",
  description: "所有 bookmark 按加入时间倒序",
  input: { type: "record", fields: {} },
  output: { kind: "row-list", row_type: "bookmarks" },
  affects: { mutations: [], adapter_writes: [], reads_only: true, destructive: false },
  handler: listBookmarksQuery,
});

// list_bookmark_interpretations: 按输入 bookmark_id 查该 bookmark 的所有 interpretation.
// 用 WhereClause 的 input ValueRef 支持 (刚刚加的).
const listBookmarkInterpretationsQuery: QueryBody = {
  kind: "query",
  on: "interpretations",
  filter: {
    kind: "leaf",
    subject: { ns: "row", path: ["bookmark_id", "id"] },
    op: "eq",
    value: { ref: "input", path: ["bookmark_id"] }, // input.bookmark_id 是 string id
  },
  sort: [{ column: "generated_at", dir: "asc" }],
  pagination: { kind: "cursor", size: 100 },
};

const listBookmarkInterpretationsOp = new Operation({
  id: "list_bookmark_interpretations",
  app_id: APP_ID,
  name: "List bookmark interpretations",
  description: "某个 bookmark 的所有 lens interpretation",
  input: {
    type: "record",
    fields: {
      bookmark_id: { type: TEXT, required: true },
    },
  },
  output: { kind: "row-list", row_type: "interpretations" },
  affects: { mutations: [], adapter_writes: [], reads_only: true, destructive: false },
  handler: listBookmarkInterpretationsQuery,
});

const deleteBookmarkOp = new Operation({
  id: "delete_bookmark",
  app_id: APP_ID,
  name: "Delete bookmark",
  description: "删除 bookmark 以及所有它的 interpretation. destructive.",
  input: {
    type: "record",
    fields: {
      bookmark_id: { type: { kind: "ref-row", table: "bookmarks" }, required: true },
    },
  },
  output: { kind: "void" },
  affects: {
    mutations: ["bookmarks", "interpretations"],
    adapter_writes: [],
    reads_only: false,
    destructive: true,
  },
  handler: { kind: "code", ref: "./ops/delete_bookmark.ts" },
  impact: {
    compute: { kind: "code", ref: "./ops/delete_bookmark.impact.ts" },
    disclosure_template: "Will delete bookmark and all interpretations",
  },
});

export const operations = [
  listLensesOp,
  upsertLensOp,
  deleteLensOp,
  addBookmarkOp,
  listBookmarksOp,
  listBookmarkInterpretationsOp,
  deleteBookmarkOp,
];

// ---------- Policy ----------

function buildPolicy(): PolicySet {
  const p = new PolicySet({ app_id: APP_ID });
  for (const op of operations) {
    p.addRule({
      id: `any-${op.id}`,
      allow: [Subjects.anyone(), Subjects.anonymous()],
      do: ["invoke"],
      on: Resources.operation(op.id),
    });
  }
  return p;
}

// ---------- Handlers ----------

function buildHandlers(deps: {
  embeddingProvider: EmbeddingProvider;
  embedModel: string;
}): {
  handlers: Record<string, HandlerFn>;
  impacts: Record<string, ImpactComputeFn>;
  transformImpls: Record<string, TransformFn>;
} {
  const { embeddingProvider, embedModel } = deps;

  // --- Transform: fetch_readable (code impl)
  const fetchReadableFn = async (args: {
    ctx: PermissionContext;
    input: unknown;
  }): Promise<{ title: string | null; body: string }> => {
    const url = String(args.input);
    if (!url.startsWith("http")) {
      throw new Error(`fetch_readable: input must be a URL string, got "${url.slice(0, 40)}"`);
    }
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain" },
    });
    if (!res.ok) {
      throw new Error(`jina-reader HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const body = await res.text();
    const firstLine = body.split("\n", 1)[0]?.trim() ?? "";
    const title = firstLine.startsWith("Title:")
      ? firstLine.replace(/^Title:\s*/, "")
      : null;
    return { title, body };
  };

  // --- Handlers ---

  const upsertLens: HandlerFn = async ({ input, storage }) => {
    const { slug, display_name, prompt } = input as {
      slug: string;
      display_name: string;
      prompt: string;
    };
    // find existing by slug
    const allLenses = await storage.listRowsByTable("lenses");
    const existing = allLenses.find((r) => r.getCell("slug") === slug);
    const id = existing?.id ?? `lens-${slug}`;
    const now = Date.now();
    const row = new Row({
      id,
      table_id: "lenses",
      app_id: APP_ID,
      cells: { slug, display_name, prompt },
      created_at: existing?.created_at ?? now,
      updated_at: now,
    });
    await storage.saveRow(row, { checkRefIntegrity: false });
    return { lens_id: id, created: !existing };
  };

  const deleteLens: HandlerFn = async ({ input, storage }) => {
    const i = input as { lens_id: Ref | string };
    const id =
      typeof i.lens_id === "object" && i.lens_id !== null && "id" in i.lens_id
        ? (i.lens_id as Extract<Ref, { kind: "row" }>).id
        : String(i.lens_id);
    const res = await storage.deleteRow(id);
    return { deleted: res.deleted };
  };

  const deleteLensImpact: ImpactComputeFn = async ({ input, storage }) => {
    const i = input as { lens_id: Ref | string };
    const id =
      typeof i.lens_id === "object" && i.lens_id !== null && "id" in i.lens_id
        ? (i.lens_id as Extract<Ref, { kind: "row" }>).id
        : String(i.lens_id);
    const lens = await storage.getRow(id);
    const interps = await storage.listRowsByTable("interpretations");
    const count = interps.filter((r) => {
      const ref = r.getCell("lens_id");
      return (
        typeof ref === "object" &&
        ref !== null &&
        "id" in ref &&
        (ref as { id?: string }).id === id
      );
    }).length;
    return {
      disclosure: `Will delete lens "${lens?.getCell("display_name") ?? id}" and ${count} related interpretations.`,
      details: { lens_id: id, interpretation_count: count },
    };
  };

  const addBookmark: HandlerFn = async ({ ctx, input, storage, services }) => {
    const { url } = input as { url: string };
    if (!services?.queryExec || !services.transformRunner) {
      throw new Error("QueryExecutor / TransformRunner not injected into runtime");
    }
    const queryExec = services.queryExec as {
      run(op: Operation, input: unknown, c: PermissionContext): Promise<{ rows: Array<Record<string, unknown>> }>;
    };
    const transformRunner = services.transformRunner as {
      apply(tx: Transform, input: unknown, c: PermissionContext): Promise<unknown>;
    };

    // 1. fetch readable (Transform cache — 同 url 1h 内不重抓)
    const fetched = (await transformRunner.apply(fetchReadable, url, ctx)) as {
      title: string | null;
      body: string;
    };

    // 2. 存 bookmark row
    const bookmarkId = `bm-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const now = Date.now();
    const bookmarkRow = new Row({
      id: bookmarkId,
      table_id: "bookmarks",
      app_id: APP_ID,
      cells: {
        url,
        title: fetched.title ?? undefined,
        body: fetched.body.slice(0, 50_000), // 防超大
      },
      created_at: now,
      updated_at: now,
    });
    // 需要移除 undefined 的 cell (否则 Cell 校验会 fail)
    if (fetched.title === null) {
      bookmarkRow.unsetCell("title", now);
    }
    await storage.saveRow(bookmarkRow, { checkRefIntegrity: false });

    // 3. 列所有 lens
    const lensesResult = await queryExec.run(listLensesOp, {}, ctx);
    const allLenses = lensesResult.rows;

    // 4. 对每个 lens 生成 interpretation (Transform cache: 同 body+lens_prompt 不重调 LLM)
    let created = 0;
    for (const lens of allLenses) {
      const lensId = (lens as { id?: string }).id ?? "";
      const lensPrompt = (lens as { prompt?: string }).prompt ?? "";
      if (!lensId || !lensPrompt) continue;
      try {
        const body = (await transformRunner.apply(
          interpretWithLens,
          { body: fetched.body.slice(0, 20_000), lens_prompt: lensPrompt },
          ctx
        )) as string;
        const itpId = `itp-${bookmarkId}-${lensId}-${Date.now()}-${Math.random().toString(16).slice(2, 4)}`;
        await storage.saveRow(
          new Row({
            id: itpId,
            table_id: "interpretations",
            app_id: APP_ID,
            cells: {
              bookmark_id: { kind: "row", table: "bookmarks", id: bookmarkId } satisfies Ref,
              lens_id: { kind: "row", table: "lenses", id: lensId } satisfies Ref,
              body,
              generated_at: Date.now(),
            },
          })
        );
        created++;
      } catch (err) {
        console.error(`[add_bookmark] lens "${lensId}" failed:`, err);
        // 继续其它 lens — E6 场景的部分失败语义
      }
    }

    return {
      bookmark_id: bookmarkId,
      title: fetched.title,
      url,
      interpretation_count: created,
      total_lenses: allLenses.length,
    };
  };

  const deleteBookmark: HandlerFn = async ({ input, storage }) => {
    const i = input as { bookmark_id: Ref | string };
    const id =
      typeof i.bookmark_id === "object" && i.bookmark_id !== null && "id" in i.bookmark_id
        ? (i.bookmark_id as Extract<Ref, { kind: "row" }>).id
        : String(i.bookmark_id);
    const res = await storage.deleteRow(id);
    return { deleted: res.deleted };
  };

  const deleteBookmarkImpact: ImpactComputeFn = async ({ input, storage }) => {
    const i = input as { bookmark_id: Ref | string };
    const id =
      typeof i.bookmark_id === "object" && i.bookmark_id !== null && "id" in i.bookmark_id
        ? (i.bookmark_id as Extract<Ref, { kind: "row" }>).id
        : String(i.bookmark_id);
    const bm = await storage.getRow(id);
    const title = bm?.getCell("title") ?? "(untitled)";
    const url = bm?.getCell("url") ?? "";
    // cascade 会连带删 interpretations — 数一下
    const interps = await storage.listRowsByTable("interpretations");
    const count = interps.filter((r) => {
      const ref = r.getCell("bookmark_id");
      return (
        typeof ref === "object" &&
        ref !== null &&
        "id" in ref &&
        (ref as { id?: string }).id === id
      );
    }).length;
    return {
      disclosure: `Will delete bookmark "${title}" (${url}) and ${count} interpretations.`,
      details: { bookmark_id: id, title, url, interpretation_count: count },
    };
  };

  return {
    handlers: {
      "./ops/upsert_lens.ts": upsertLens,
      "./ops/delete_lens.ts": deleteLens,
      "./ops/add_bookmark.ts": addBookmark,
      "./ops/delete_bookmark.ts": deleteBookmark,
    },
    impacts: {
      "./ops/delete_lens.impact.ts": deleteLensImpact,
      "./ops/delete_bookmark.impact.ts": deleteBookmarkImpact,
    },
    transformImpls: {
      "./transforms/fetch_readable.ts": fetchReadableFn,
      "./transforms/embed_text.ts": async ({ ctx, input }) => {
        const text = typeof input === "string" ? input : String(input ?? "");
        if (!text) return new Array(1536).fill(0); // 空文本 → 零向量, cacheable
        return await embeddingProvider.embed({ model: embedModel, text }, ctx);
      },
    },
  };
}

// ---------- AppConfig builder ----------

export interface BuildConfigDeps {
  readonly llmProvider: LLMProvider;
  readonly embeddingProvider: EmbeddingProvider;
  readonly embeddingModel?: string; // default: "openai/text-embedding-3-small"
}

export function buildConfig(deps: BuildConfigDeps): AppConfig {
  const { llmProvider, embeddingProvider, embeddingModel } = deps;
  const embedModel = embeddingModel ?? "openai/text-embedding-3-small";

  const policy = buildPolicy();
  const { handlers, impacts, transformImpls } = buildHandlers({ embeddingProvider, embedModel });

  return {
    app_id: APP_ID,
    storage: { sqlite_path: join(dataDir, "rows.db") },
    audit: { ndjson_path: join(dataDir, "audit.ndjson") },
    history: { sqlite_path: join(dataDir, "app-history.db") },
    tables: [bookmarksTable, lensesTable, interpretationsTable],
    operations,
    transforms: [fetchReadable, interpretWithLens, embedText],
    policy,
    handlers,
    impacts,
    transformImpls,
    llmProvider,
  };
}
