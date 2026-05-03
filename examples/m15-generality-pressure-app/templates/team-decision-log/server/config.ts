import { join } from "node:path";
import {
  Operation,
  PolicySet,
  Resources,
  Row,
  Subjects,
  Table,
  View,
  type CellType,
  type HandlerFn,
} from "@pneuma-framework/core-domain";
import type { AppConfig } from "@pneuma-framework/runtime";

export const APP_ID = "team-decision-log";

const workspaceRoot = process.env.PNEUMA_WORKSPACE ?? join(process.cwd(), ".pneuma-workspace");
const dataDir = process.env.PNEUMA_DATA_DIR ?? join(workspaceRoot, "data");
const appDbPath = process.env.PNEUMA_SQLITE_PATH ?? join(dataDir, "app.db");

const TEXT: CellType = { kind: "primitive", of: "Text" };
const DATE_T: CellType = { kind: "primitive", of: "Date" };

export const decisionsTable = new Table({
  id: "decisions",
  app_id: APP_ID,
  columns: [
    { name: "title", type: TEXT },
    { name: "context", type: TEXT, nullable: true },
    { name: "decision", type: TEXT },
    { name: "owner_user_id", type: TEXT },
    { name: "status", type: TEXT },
    { name: "created_at_cell", type: DATE_T },
  ],
  source: { kind: "stored" },
});

export const recordDecisionOp = new Operation({
  id: "record_decision",
  app_id: APP_ID,
  name: "Record decision",
  description: "Record a team decision. body: { title, context?, decision, owner_user_id?, status? }",
  input: {
    type: "record",
    fields: {
      title: { type: TEXT, required: true },
      context: { type: TEXT },
      decision: { type: TEXT, required: true },
      owner_user_id: { type: TEXT },
      status: { type: TEXT },
    },
  },
  output: {
    kind: "object",
    schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        owner_user_id: { type: "string" },
        status: { type: "string" },
      },
      required: ["id", "title", "owner_user_id", "status"],
      additionalProperties: false,
    },
  },
  affects: {
    mutations: ["decisions"],
    adapter_writes: [],
    reads_only: false,
    destructive: false,
  },
  handler: { kind: "code", ref: "./ops/record_decision.ts" },
});

export const listDecisionsOp = new Operation({
  id: "list_decisions",
  app_id: APP_ID,
  name: "List decisions",
  description: "List team decisions by newest first.",
  input: { type: "record", fields: {} },
  output: { kind: "row-list", row_type: "decisions" },
  affects: {
    mutations: [],
    adapter_writes: [],
    reads_only: true,
    destructive: false,
  },
  handler: {
    kind: "query",
    on: "decisions",
    sort: [{ column: "created_at_cell", dir: "desc" }],
    pagination: { kind: "cursor", size: 100 },
  },
});

export const decisionLogView = new View({
  id: "decision_log",
  app_id: APP_ID,
  name: "Decision Log",
  description: "A table view over recorded team decisions.",
  kind: "table",
  source: { kind: "operation", operation_id: "list_decisions" },
  presentation: {
    title: "Decision Log",
    empty_state: "No decisions recorded yet.",
    columns: [
      { field: "title", label: "Title", role: "title" },
      { field: "decision", label: "Decision", role: "body" },
      { field: "owner_user_id", label: "Owner", role: "metadata" },
      { field: "status", label: "Status", role: "metadata" },
    ],
  },
});

export const operations = [recordDecisionOp, listDecisionsOp];
export const views = [decisionLogView];

export const policy = new PolicySet({ app_id: APP_ID });
policy.addRule({
  id: "builder-can-record-decisions",
  allow: [Subjects.role("builder"), Subjects.user("builder-alice")],
  do: ["invoke"],
  on: Resources.operation("record_decision"),
});
policy.addRule({
  id: "builder-can-read-decisions",
  allow: [Subjects.role("builder"), Subjects.user("builder-alice")],
  do: ["invoke"],
  on: Resources.operation("list_decisions"),
});
policy.addRule({
  id: "builder-can-read-decision-log-view",
  allow: [Subjects.role("builder"), Subjects.user("builder-alice")],
  do: ["read"],
  on: Resources.view("decision_log"),
});

const recordDecisionHandler: HandlerFn = async ({ input, storage, ctx }) => {
  const i = input as {
    title: string;
    context?: string;
    decision: string;
    owner_user_id?: string;
    status?: string;
  };
  const owner = i.owner_user_id?.trim() || ctx.user?.id || "builder-alice";
  const status = i.status?.trim() || "open";
  const id = `tdl-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const row = new Row({
    id,
    table_id: "decisions",
    app_id: APP_ID,
    cells: {
      title: i.title,
      context: i.context ?? "",
      decision: i.decision,
      owner_user_id: owner,
      status,
      created_at_cell: Date.now(),
    },
  });
  await storage.saveRow(row);
  return { id, title: i.title, owner_user_id: owner, status };
};

export const config: AppConfig = {
  app_id: APP_ID,
  persistence: {
    kind: "sqlite",
    path: appDbPath,
  },
  tables: [decisionsTable],
  operations,
  views,
  policy,
  handlers: {
    "./ops/record_decision.ts": recordDecisionHandler,
  },
};
