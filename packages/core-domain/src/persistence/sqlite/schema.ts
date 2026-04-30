import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const pneumaMigrations = sqliteTable("pneuma_migrations", {
  name: text("name").primaryKey(),
  applied_at: integer("applied_at").notNull(),
});

export const rows = sqliteTable("rows", {
  id: text("id").primaryKey(),
  table_id: text("table_id").notNull(),
  app_id: text("app_id").notNull(),
  cells: text("cells").notNull(),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
  owner_id: text("owner_id"),
});

export const appHistory = sqliteTable("app_history", {
  id: text("id").primaryKey(),
  app_id: text("app_id").notNull(),
  version: integer("version").notNull(),
  history_type: text("history_type").notNull(),
  payload: text("payload").notNull(),
  parent_snapshot_version: integer("parent_snapshot_version"),
  is_ai_generated: integer("is_ai_generated").notNull(),
  actor_id: text("actor_id").notNull(),
  actor_kind: text("actor_kind").notNull(),
  description: text("description"),
  operation_scope: text("operation_scope"),
  created_at: integer("created_at").notNull(),
});

export const permissionLedgerEvents = sqliteTable("permission_ledger_events", {
  event_id: text("event_id").primaryKey(),
  prompt_id: text("prompt_id").notNull(),
  app_id: text("app_id").notNull(),
  workspace_id: text("workspace_id").notNull(),
  event_type: text("event_type").notNull(),
  at_ms: integer("at_ms").notNull(),
  event_json: text("event_json").notNull(),
});
