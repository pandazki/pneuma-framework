import { eq } from "drizzle-orm";
import { releaseEvents, releaseItems } from "../db/schema";
import type {
  CreateReleaseItemInput,
  ReleaseEvent,
  ReleaseItem,
  ReleaseSummary,
  TransitionReleaseItemInput,
} from "../shared/contracts";
import { demoEvents, demoItems } from "../shared/demo-data";

export interface ReleaseRepository {
  listItems(): Promise<ReleaseItem[]>;
  listEvents(itemId?: string): Promise<ReleaseEvent[]>;
  createItem(input: CreateReleaseItemInput): Promise<ReleaseItem>;
  transitionItem(id: string, input: TransitionReleaseItemInput): Promise<ReleaseItem | null>;
  summary(): Promise<ReleaseSummary>;
}

export interface DrizzleRepositoryOptions {
  readonly seedDemoData?: boolean;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createMemoryRepository(seedItems = demoItems, seedEvents = demoEvents): ReleaseRepository {
  const items = new Map(seedItems.map((item) => [item.id, { ...item }]));
  const events = new Map(seedEvents.map((event) => [event.id, { ...event }]));

  return {
    async listItems() {
      return [...items.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async listEvents(itemId) {
      return [...events.values()]
        .filter((event) => !itemId || event.itemId === itemId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async createItem(input) {
      const at = new Date().toISOString();
      const item: ReleaseItem = {
        id: createId("rel"),
        title: input.title,
        owner: input.owner,
        priority: input.priority,
        status: "triage",
        slaAt: input.slaAt ?? null,
        risk: input.risk,
        notes: input.notes,
        createdAt: at,
        updatedAt: at,
      };
      const event: ReleaseEvent = {
        id: createId("evt"),
        itemId: item.id,
        kind: "created",
        message: `Created ${item.title}`,
        actor: input.owner,
        createdAt: at,
      };
      items.set(item.id, item);
      events.set(event.id, event);
      return item;
    },
    async transitionItem(id, input) {
      const existing = items.get(id);
      if (!existing) return null;
      const at = new Date().toISOString();
      const next = { ...existing, status: input.status, updatedAt: at };
      const event: ReleaseEvent = {
        id: createId("evt"),
        itemId: id,
        kind: "transition",
        message: input.message ?? `Moved to ${input.status}`,
        actor: input.actor,
        createdAt: at,
      };
      items.set(id, next);
      events.set(event.id, event);
      return next;
    },
    async summary() {
      return summarizeItems([...items.values()]);
    },
  };
}

export function createDrizzleRepository(db: any, options: DrizzleRepositoryOptions = {}): ReleaseRepository {
  let seedPromise: Promise<void> | undefined;
  async function ensureSeeded(): Promise<void> {
    if (!options.seedDemoData) return;
    seedPromise ??= (async () => {
      const existing = await db.select().from(releaseItems).limit(1);
      if (existing.length > 0) return;
      await db.insert(releaseItems).values(demoItems.map(itemToRow));
      await db.insert(releaseEvents).values(demoEvents.map(eventToRow));
    })();
    await seedPromise;
  }

  return {
    async listItems() {
      await ensureSeeded();
      const rows = await db.select().from(releaseItems);
      return rows.map(rowToItem);
    },
    async listEvents(itemId) {
      await ensureSeeded();
      const rows = itemId
        ? await db.select().from(releaseEvents).where(eq(releaseEvents.itemId, itemId))
        : await db.select().from(releaseEvents);
      return rows.map(rowToEvent);
    },
    async createItem(input) {
      await ensureSeeded();
      const at = new Date();
      const row = {
        id: createId("rel"),
        title: input.title,
        owner: input.owner,
        priority: input.priority,
        status: "triage",
        slaAt: input.slaAt ? new Date(input.slaAt) : null,
        risk: input.risk,
        notes: input.notes,
        createdAt: at,
        updatedAt: at,
      };
      await db.insert(releaseItems).values(row);
      await db.insert(releaseEvents).values({
        id: createId("evt"),
        itemId: row.id,
        kind: "created",
        message: `Created ${row.title}`,
        actor: row.owner,
        createdAt: at,
      });
      return rowToItem(row);
    },
    async transitionItem(id, input) {
      await ensureSeeded();
      const rows = await db.select().from(releaseItems).where(eq(releaseItems.id, id));
      if (rows.length === 0) return null;
      const at = new Date();
      await db.update(releaseItems).set({ status: input.status, updatedAt: at }).where(eq(releaseItems.id, id));
      await db.insert(releaseEvents).values({
        id: createId("evt"),
        itemId: id,
        kind: "transition",
        message: input.message ?? `Moved to ${input.status}`,
        actor: input.actor,
        createdAt: at,
      });
      return rowToItem({ ...rows[0], status: input.status, updatedAt: at });
    },
    async summary() {
      return summarizeItems(await this.listItems());
    },
  };
}

function rowToItem(row: any): ReleaseItem {
  return {
    id: row.id,
    title: row.title,
    owner: row.owner,
    priority: row.priority,
    status: row.status,
    slaAt: iso(row.slaAt ?? row.sla_at),
    risk: row.risk,
    notes: row.notes ?? "",
    createdAt: iso(row.createdAt ?? row.created_at) ?? new Date().toISOString(),
    updatedAt: iso(row.updatedAt ?? row.updated_at) ?? new Date().toISOString(),
  };
}

function itemToRow(item: ReleaseItem) {
  return {
    id: item.id,
    title: item.title,
    owner: item.owner,
    priority: item.priority,
    status: item.status,
    slaAt: item.slaAt ? new Date(item.slaAt) : null,
    risk: item.risk,
    notes: item.notes,
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  };
}

function eventToRow(event: ReleaseEvent) {
  return {
    id: event.id,
    itemId: event.itemId,
    kind: event.kind,
    message: event.message,
    actor: event.actor,
    createdAt: new Date(event.createdAt),
  };
}

function rowToEvent(row: any): ReleaseEvent {
  return {
    id: row.id,
    itemId: row.itemId ?? row.item_id,
    kind: row.kind,
    message: row.message,
    actor: row.actor,
    createdAt: iso(row.createdAt ?? row.created_at) ?? new Date().toISOString(),
  };
}

function summarizeItems(items: ReleaseItem[]): ReleaseSummary {
  return {
    total: items.length,
    blocked: items.filter((item) => item.status === "blocked").length,
    highRisk: items.filter((item) => item.risk === "high" || item.risk === "critical").length,
    releaseReady: items.filter((item) => item.status === "ready_for_release").length,
  };
}
