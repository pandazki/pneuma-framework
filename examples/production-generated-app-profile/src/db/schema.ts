import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const releaseItems = pgTable("release_items", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  owner: text("owner").notNull(),
  priority: text("priority").notNull(),
  status: text("status").notNull(),
  slaAt: timestamp("sla_at"),
  risk: text("risk").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const releaseEvents = pgTable("release_events", {
  id: text("id").primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => releaseItems.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  actor: text("actor").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
