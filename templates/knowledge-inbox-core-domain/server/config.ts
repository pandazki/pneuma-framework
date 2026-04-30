// knowledge-inbox-core-domain / config.ts
// A small reference app for the M4 product-prototype track.

import {
  Operation,
  PolicySet,
  Resources,
  Row,
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

// ---------- CellTypes ----------

const TEXT: CellType = { kind: "primitive", of: "Text" };
const URL_T: CellType = { kind: "primitive", of: "URL" };
const DATE_T: CellType = { kind: "primitive", of: "Date" };

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

export const operations = [captureItemOp, listInboxItemsOp, updateItemStatusOp];

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
  },
};
