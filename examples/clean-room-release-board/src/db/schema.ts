import { pgSchema, text, timestamp, index } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Drizzle schema for the Neon Postgres persistence target.
//
// Tables live in a dedicated `release_board` Postgres schema so this example
// is fully self-owned and can coexist with other examples on the same Neon
// instance without colliding on table names.
//
// Status / priority / risk are stored as text rather than pg enums on purpose:
// the Creation Host lets a code agent evolve the contract, and a text column
// avoids a separate ALTER TYPE dance on every value-set change while the Zod
// contract remains the real validator.
// ---------------------------------------------------------------------------

export const boardSchema = pgSchema("release_board");

export const releaseItems = boardSchema.table(
  "release_items",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    status: text("status").notNull().default("queued"),
    priority: text("priority").notNull().default("medium"),
    risk: text("risk").notNull().default("low"),
    owner: text("owner").notNull(),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("release_items_status_idx").on(table.status),
  }),
);

export const releaseEvents = boardSchema.table(
  "release_events",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id").notNull(),
    kind: text("kind").notNull(),
    message: text("message").notNull().default(""),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    itemIdx: index("release_events_item_idx").on(table.itemId),
  }),
);

export type ReleaseItemRow = typeof releaseItems.$inferSelect;
export type ReleaseEventRow = typeof releaseEvents.$inferSelect;
