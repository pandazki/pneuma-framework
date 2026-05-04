// bookmarks-core-domain / config.ts — AppConfig 声明.
// 把 pneuma 的 8 个 primitive 用 TypeScript 表达出来, 扔给 runtime.
//
// 这里的 handlers 是纯代码 (code impl), 通过 ref 字符串跟 Operation.handler.ref 对齐.

import {
  Operation,
  PolicySet,
  Resources,
  Row,
  Subjects,
  Table,
  type CellType,
  type HandlerFn,
  type ImpactComputeFn,
  type Ref,
} from "@pneuma-framework/core-domain";
import type { AppConfig } from "@pneuma-framework/runtime";
import { join } from "node:path";

// ---------- app id + storage paths ----------

export const APP_ID = "bookmarks-core-domain";

const workspaceRoot =
  process.env.PNEUMA_WORKSPACE ?? join(process.cwd(), ".pneuma-workspace");
const dataDir = process.env.PNEUMA_DATA_DIR ?? join(workspaceRoot, "data");
const appDbPath = process.env.PNEUMA_SQLITE_PATH ?? join(dataDir, "app.db");

// ---------- CellTypes ----------

const TEXT: CellType = { kind: "primitive", of: "Text" };
const URL_T: CellType = { kind: "primitive", of: "URL" };
const DATE_T: CellType = { kind: "primitive", of: "Date" };

// ---------- Tables ----------

export const bookmarksTable = new Table({
  id: "bookmarks",
  app_id: APP_ID,
  columns: [
    { name: "url", type: URL_T },
    { name: "title", type: TEXT, nullable: true },
    { name: "notes", type: TEXT, nullable: true },
    { name: "created_at_cell", type: DATE_T }, // 'created_at' 是 Row aggregate 级字段,
    //   此列名避开保留名; demo 展示 "Builder 自定义的时间戳字段" 跟 framework 侧的 created_at 区分
  ],
  source: { kind: "stored" },
});

// ---------- Operations ----------

export const addBookmarkOp = new Operation({
  id: "add_bookmark",
  app_id: APP_ID,
  name: "Add bookmark",
  description: "创建一个新 bookmark. body 里传 { url, title?, notes? }",
  input: {
    type: "record",
    fields: {
      url: { type: URL_T, required: true },
      title: { type: TEXT },
      notes: { type: TEXT },
    },
  },
  output: {
    kind: "object",
    schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        url: { type: "string" },
      },
      required: ["id", "url"],
      additionalProperties: false,
    },
  },
  affects: {
    mutations: ["bookmarks"],
    adapter_writes: [],
    reads_only: false,
    destructive: false,
  },
  handler: { kind: "code", ref: "./ops/add_bookmark.ts" },
});

export const deleteBookmarkOp = new Operation({
  id: "delete_bookmark",
  app_id: APP_ID,
  name: "Delete bookmark",
  description: "删除一个 bookmark. destructive; 必须 confirmed=true 才执行.",
  input: {
    type: "record",
    fields: {
      bookmark_id: {
        type: { kind: "ref-row", table: "bookmarks" },
        required: true,
      },
    },
  },
  output: {
    kind: "object",
    schema: {
      type: "object",
      properties: {
        deleted: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["deleted"],
      additionalProperties: false,
    },
  },
  affects: {
    mutations: ["bookmarks"],
    adapter_writes: [],
    reads_only: false,
    destructive: true,
  },
  handler: { kind: "code", ref: "./ops/delete_bookmark.ts" },
  impact: {
    compute: { kind: "code", ref: "./ops/delete_bookmark.impact.ts" },
    disclosure_template: "Will permanently delete bookmark {{title}} ({{url}})",
  },
});

export const listBookmarksOp = new Operation({
  id: "list_bookmarks",
  app_id: APP_ID,
  name: "List bookmarks",
  description: "列出所有 bookmark, 按 created_at_cell desc 排序.",
  input: { type: "record", fields: {} },
  output: { kind: "row-list", row_type: "bookmarks" },
  affects: {
    mutations: [],
    adapter_writes: [],
    reads_only: true,
    destructive: false,
  },
  handler: {
    kind: "query",
    on: "bookmarks",
    sort: [{ column: "created_at_cell", dir: "desc" }],
    pagination: { kind: "cursor", size: 100 },
  },
});

export const operations = [addBookmarkOp, deleteBookmarkOp, listBookmarksOp];

// ---------- Policy ----------

export const policy = new PolicySet({ app_id: APP_ID });
for (const op of operations) {
  policy.addRule({
    id: `anyone-${op.id}`,
    allow: [Subjects.anyone(), Subjects.anonymous()],
    do: ["invoke"],
    on: Resources.operation(op.id),
  });
}

// ---------- Handlers ----------

const addBookmarkHandler: HandlerFn = async ({ input, storage }) => {
  const i = input as { url: string; title?: string; notes?: string };
  const id = `bm-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const cells: Record<string, unknown> = {
    url: i.url,
    created_at_cell: Date.now(),
  };
  if (i.title !== undefined) cells.title = i.title;
  if (i.notes !== undefined) cells.notes = i.notes;
  const row = new Row({
    id,
    table_id: "bookmarks",
    app_id: APP_ID,
    cells,
  });
  await storage.saveRow(row);
  return { id, url: i.url };
};

const deleteBookmarkHandler: HandlerFn = async ({ input, storage }) => {
  const i = input as { bookmark_id: Ref | string };
  const id =
    typeof i.bookmark_id === "object" && i.bookmark_id !== null && "id" in i.bookmark_id
      ? (i.bookmark_id as Extract<Ref, { kind: "row" }>).id
      : String(i.bookmark_id);
  const result = await storage.deleteRow(id);
  return { deleted: result.deleted };
};

const deleteBookmarkImpact: ImpactComputeFn = async ({ input, storage }) => {
  const i = input as { bookmark_id: Ref | string };
  const id =
    typeof i.bookmark_id === "object" && i.bookmark_id !== null && "id" in i.bookmark_id
      ? (i.bookmark_id as Extract<Ref, { kind: "row" }>).id
      : String(i.bookmark_id);
  const row = await storage.getRow(id);
  const title = row?.getCell("title") ?? "(untitled)";
  const url = row?.getCell("url") ?? "(unknown)";
  return {
    disclosure: `Will permanently delete bookmark "${title}" (${url})`,
    details: { id, title, url },
  };
};

// ---------- AppConfig ----------

export const config: AppConfig = {
  app_id: APP_ID,
  persistence: { kind: "sqlite", path: appDbPath },
  internal_http: { token: process.env.PNEUMA_INTERNAL_HTTP_TOKEN },
  audit: { ndjson_path: join(dataDir, "audit.ndjson") },
  tables: [bookmarksTable],
  operations,
  policy,
  handlers: {
    "./ops/add_bookmark.ts": addBookmarkHandler,
    "./ops/delete_bookmark.ts": deleteBookmarkHandler,
  },
  impacts: {
    "./ops/delete_bookmark.impact.ts": deleteBookmarkImpact,
  },
};
