// knowledge-inbox-core-domain / config.ts
// A small reference app for the M4 product-prototype track.

import {
  BunSqliteSemanticIndexStore,
  DeterministicEmbeddingProvider,
  Operation,
  PolicySet,
  Resources,
  Row,
  SemanticIndexService,
  Subjects,
  Table,
  type CellType,
  type HandlerFn,
} from "@pneuma-framework/core-domain";
import type { AppConfig } from "@pneuma-framework/runtime";
import { join } from "node:path";

// ---------- app id + storage paths ----------

export const APP_ID = "knowledge-inbox-core-domain";

const workspaceRoot =
  process.env.PNEUMA_WORKSPACE ?? join(process.cwd(), ".pneuma-workspace");
const dataDir = process.env.PNEUMA_DATA_DIR ?? join(workspaceRoot, "data");
const appDbPath = process.env.PNEUMA_SQLITE_PATH ?? join(dataDir, "app.db");

const SEMANTIC_INDEX_ID = "knowledge_inbox_items";
const SEMANTIC_MODEL = "local-deterministic";
const semanticProjection = { fields: ["title", "source", "summary"] } as const;
const semanticEmbeddingProvider = new DeterministicEmbeddingProvider({
  dim: 24,
  aliases: {
    release: "launch",
    deployment: "deploy",
    escalation: "customer",
    risk: "blocking",
    confidence: "evidence",
    alignment: "team",
  },
});

// ---------- CellTypes ----------

const TEXT: CellType = { kind: "primitive", of: "Text" };
const URL_T: CellType = { kind: "primitive", of: "URL" };
const DATE_T: CellType = { kind: "primitive", of: "Date" };
const NUMBER_T: CellType = { kind: "primitive", of: "Number" };

// ---------- Tables ----------

export const inboxItemsTable = new Table({
  id: "inbox_items",
  app_id: APP_ID,
  columns: [
    { name: "url", type: URL_T },
    { name: "title", type: TEXT, nullable: true },
    { name: "source", type: TEXT, nullable: true },
    { name: "summary", type: TEXT, nullable: true },
    { name: "status", type: TEXT },
    { name: "created_at_cell", type: DATE_T },
  ],
  source: { kind: "stored" },
});

// ---------- Operations ----------

export const captureItemOp = new Operation({
  id: "capture_item",
  app_id: APP_ID,
  name: "Capture item",
  description: "Capture a source into the Knowledge Inbox. body: { url, title?, source?, summary? }",
  input: {
    type: "record",
    fields: {
      url: { type: URL_T, required: true },
      title: { type: TEXT },
      source: { type: TEXT },
      summary: { type: TEXT },
    },
  },
  output: {
    kind: "object",
    schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        url: { type: "string" },
        status: { type: "string" },
      },
      required: ["id", "url", "status"],
      additionalProperties: false,
    },
  },
  affects: {
    mutations: ["inbox_items"],
    adapter_writes: [],
    reads_only: false,
    destructive: false,
  },
  handler: { kind: "code", ref: "./ops/capture_item.ts" },
});

export const updateItemStatusOp = new Operation({
  id: "update_item_status",
  app_id: APP_ID,
  name: "Update item status",
  description: "Move an inbox item through triage. body: { item_id, status }",
  input: {
    type: "record",
    fields: {
      item_id: { type: TEXT, required: true },
      status: { type: TEXT, required: true },
    },
  },
  output: {
    kind: "object",
    schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string" },
      },
      required: ["id", "status"],
      additionalProperties: false,
    },
  },
  affects: {
    mutations: ["inbox_items"],
    adapter_writes: [],
    reads_only: false,
    destructive: false,
  },
  handler: { kind: "code", ref: "./ops/update_item_status.ts" },
});

export const listInboxItemsOp = new Operation({
  id: "list_inbox_items",
  app_id: APP_ID,
  name: "List inbox items",
  description: "List Knowledge Inbox items by newest first.",
  input: { type: "record", fields: {} },
  output: { kind: "row-list", row_type: "inbox_items" },
  affects: {
    mutations: [],
    adapter_writes: [],
    reads_only: true,
    destructive: false,
  },
  handler: {
    kind: "query",
    on: "inbox_items",
    sort: [{ column: "created_at_cell", dir: "desc" }],
    pagination: { kind: "cursor", size: 100 },
  },
});

export const rebuildSemanticIndexOp = new Operation({
  id: "rebuild_semantic_index",
  app_id: APP_ID,
  name: "Rebuild semantic index",
  description: "Rebuild the derived semantic index from current Knowledge Inbox rows.",
  input: { type: "record", fields: {} },
  output: {
    kind: "object",
    schema: {
      type: "object",
      properties: {
        index_status: { type: "string" },
        source_count: { type: "number" },
        indexed_count: { type: "number" },
        ready_count: { type: "number" },
        missing_count: { type: "number" },
        stale_count: { type: "number" },
        orphaned_count: { type: "number" },
      },
      required: [
        "index_status",
        "source_count",
        "indexed_count",
        "ready_count",
        "missing_count",
        "stale_count",
        "orphaned_count",
      ],
      additionalProperties: false,
    },
  },
  affects: {
    mutations: [],
    adapter_writes: ["semantic_index_entries"],
    reads_only: false,
    destructive: false,
  },
  handler: { kind: "code", ref: "./ops/rebuild_semantic_index.ts" },
});

export const semanticSearchItemsOp = new Operation({
  id: "semantic_search_items",
  app_id: APP_ID,
  name: "Semantic search items",
  description: "Search Knowledge Inbox items through a rebuildable derived semantic index.",
  input: {
    type: "record",
    fields: {
      query: { type: TEXT, required: true },
      limit: { type: NUMBER_T, default: 5 },
    },
  },
  output: {
    kind: "object",
    schema: {
      type: "object",
      properties: {
        index_status: { type: "string" },
        source_count: { type: "number" },
        indexed_count: { type: "number" },
        ready_count: { type: "number" },
        missing_count: { type: "number" },
        stale_count: { type: "number" },
        orphaned_count: { type: "number" },
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item_id: { type: "string" },
              title: { type: ["string", "null"] },
              source: { type: ["string", "null"] },
              summary: { type: ["string", "null"] },
              score: { type: "number" },
              source_fingerprint: { type: "string" },
            },
            required: ["item_id", "score", "source_fingerprint"],
            additionalProperties: false,
          },
        },
      },
      required: [
        "index_status",
        "source_count",
        "indexed_count",
        "ready_count",
        "missing_count",
        "stale_count",
        "orphaned_count",
        "rows",
      ],
      additionalProperties: false,
    },
  },
  affects: {
    mutations: [],
    adapter_writes: [],
    reads_only: true,
    destructive: false,
  },
  handler: { kind: "code", ref: "./ops/semantic_search_items.ts" },
});

export const operations = [
  captureItemOp,
  listInboxItemsOp,
  updateItemStatusOp,
  rebuildSemanticIndexOp,
  semanticSearchItemsOp,
];

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

const captureItemHandler: HandlerFn = async ({ input, storage }) => {
  const i = input as { url: string; title?: string; source?: string; summary?: string };
  const id = `ki-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const status = "pending";
  const cells: Record<string, unknown> = {
    url: i.url,
    status,
    created_at_cell: Date.now(),
  };
  if (i.title !== undefined) cells.title = i.title;
  if (i.source !== undefined) cells.source = i.source;
  if (i.summary !== undefined) cells.summary = i.summary;
  const row = new Row({
    id,
    table_id: "inbox_items",
    app_id: APP_ID,
    cells,
  });
  await storage.saveRow(row);
  return { id, url: i.url, status };
};

const updateItemStatusHandler: HandlerFn = async ({ input, storage }) => {
  const i = input as { item_id: string; status: string };
  const row = await storage.getRow(i.item_id);
  if (!row) throw new Error(`inbox item "${i.item_id}" not found`);
  row.setCell("status", i.status);
  await storage.saveRow(row);
  return { id: row.id, status: i.status };
};

async function withSemanticService<T>(
  fn: (service: SemanticIndexService) => Promise<T>
): Promise<T> {
  const store = new BunSqliteSemanticIndexStore(appDbPath);
  const service = new SemanticIndexService({
    store,
    embeddingProvider: semanticEmbeddingProvider,
    model: SEMANTIC_MODEL,
  });
  try {
    return await fn(service);
  } finally {
    await store.close();
  }
}

async function listInboxRows(
  storage: Parameters<HandlerFn>[0]["storage"]
): Promise<Row[]> {
  return await storage.listRowsByTable("inbox_items");
}

const rebuildSemanticIndexHandler: HandlerFn = async ({ storage, ctx }) => {
  return await withSemanticService(async (service) => {
    const stats = await service.rebuild({
      index_id: SEMANTIC_INDEX_ID,
      source_rows: await listInboxRows(storage),
      projection: semanticProjection,
      permissionContext: ctx,
    });
    return {
      index_status: stats.status,
      source_count: stats.source_count,
      indexed_count: stats.indexed_count,
      ready_count: stats.ready_count,
      missing_count: stats.missing_count,
      stale_count: stats.stale_count,
      orphaned_count: stats.orphaned_count,
    };
  });
};

const semanticSearchItemsHandler: HandlerFn = async ({ input, storage, ctx }) => {
  const i = input as { query?: string; limit?: number };
  const query = typeof i.query === "string" ? i.query.trim() : "";
  if (!query) throw new Error("semantic_search_items requires query");
  const limit =
    typeof i.limit === "number" && Number.isFinite(i.limit)
      ? Math.max(1, Math.min(20, Math.trunc(i.limit)))
      : 5;
  const sourceRows = await listInboxRows(storage);
  return await withSemanticService(async (service) => {
    const result = await service.search({
      index_id: SEMANTIC_INDEX_ID,
      query,
      limit,
      source_rows: sourceRows,
      projection: semanticProjection,
      permissionContext: ctx,
    });
    const byId = new Map(sourceRows.map((row) => [row.id, row]));
    return {
      index_status: result.index_status,
      source_count: result.source_count,
      indexed_count: result.indexed_count,
      ready_count: result.ready_count,
      missing_count: result.missing_count,
      stale_count: result.stale_count,
      orphaned_count: result.orphaned_count,
      rows: result.rows
        .map((hit) => {
          const row = byId.get(hit.source_row_id);
          if (!row) return undefined;
          return {
            item_id: row.id,
            title: stringCellOrNull(row.getCell("title")),
            source: stringCellOrNull(row.getCell("source")),
            summary: stringCellOrNull(row.getCell("summary")),
            score: hit.score,
            source_fingerprint: hit.source_fingerprint,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== undefined),
    };
  });
};

function stringCellOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

// ---------- AppConfig ----------

export const config: AppConfig = {
  app_id: APP_ID,
  persistence: { kind: "sqlite", path: appDbPath },
  audit: { ndjson_path: join(dataDir, "audit.ndjson") },
  tables: [inboxItemsTable],
  operations,
  policy,
  handlers: {
    "./ops/capture_item.ts": captureItemHandler,
    "./ops/update_item_status.ts": updateItemStatusHandler,
    "./ops/rebuild_semantic_index.ts": rebuildSemanticIndexHandler,
    "./ops/semantic_search_items.ts": semanticSearchItemsHandler,
  },
};
