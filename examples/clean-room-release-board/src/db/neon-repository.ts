import { eq, desc } from "drizzle-orm";
import type { NeonDb } from "./client";
import { releaseEvents, releaseItems, type ReleaseEventRow, type ReleaseItemRow } from "./schema";
import {
  createReleaseItemInputSchema,
  type CreateReleaseItemInput,
  type ReleaseEvent,
  type ReleaseItem,
  type ReleaseItemWithEvents,
  type ReleasePriority,
  type ReleaseRisk,
  type ReleaseStatus,
  type ReleaseSummary,
  type TransitionReleaseItemInput,
} from "../shared/contracts";
import { DEMO_RELEASE_ITEMS } from "../shared/demo-data";
import { summarize, type ReleaseRepository } from "../server/repository";

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapItem(row: ReleaseItemRow): ReleaseItem {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    status: row.status as ReleaseStatus,
    priority: row.priority as ReleasePriority,
    risk: row.risk as ReleaseRisk,
    owner: row.owner,
    slaDueAt: iso(row.slaDueAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapEvent(row: ReleaseEventRow): ReleaseEvent {
  return {
    id: row.id,
    itemId: row.itemId,
    kind: row.kind as ReleaseEvent["kind"],
    message: row.message,
    fromStatus: (row.fromStatus as ReleaseStatus | null) ?? null,
    toStatus: (row.toStatus as ReleaseStatus | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export class NeonReleaseRepository implements ReleaseRepository {
  readonly persistence = "neon" as const;
  constructor(private readonly db: NeonDb) {}

  async listItems(): Promise<ReleaseItem[]> {
    const rows = await this.db.select().from(releaseItems).orderBy(desc(releaseItems.updatedAt));
    return rows.map(mapItem);
  }

  async getItem(id: string): Promise<ReleaseItemWithEvents | null> {
    const rows = await this.db.select().from(releaseItems).where(eq(releaseItems.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;
    const eventRows = await this.db
      .select()
      .from(releaseEvents)
      .where(eq(releaseEvents.itemId, id))
      .orderBy(releaseEvents.createdAt);
    return { ...mapItem(row), events: eventRows.map(mapEvent) };
  }

  async createItem(input: CreateReleaseItemInput): Promise<ReleaseItem> {
    const parsed = createReleaseItemInputSchema.parse(input);
    const now = new Date();
    const id = crypto.randomUUID();
    const inserted = await this.db
      .insert(releaseItems)
      .values({
        id,
        title: parsed.title,
        summary: parsed.summary,
        status: "queued",
        priority: parsed.priority,
        risk: parsed.risk,
        owner: parsed.owner,
        slaDueAt: parsed.slaDueAt ? new Date(parsed.slaDueAt) : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await this.db.insert(releaseEvents).values({
      id: crypto.randomUUID(),
      itemId: id,
      kind: "created",
      message: `Queued by ${parsed.owner}`,
      fromStatus: null,
      toStatus: "queued",
      createdAt: now,
    });
    const row = inserted[0];
    if (!row) throw new Error("insert returned no row");
    return mapItem(row);
  }

  async transition(
    id: string,
    input: TransitionReleaseItemInput,
  ): Promise<ReleaseItemWithEvents | null> {
    const existing = await this.getItem(id);
    if (!existing) return null;
    const now = new Date();
    await this.db
      .update(releaseItems)
      .set({ status: input.toStatus, updatedAt: now })
      .where(eq(releaseItems.id, id));
    await this.db.insert(releaseEvents).values({
      id: crypto.randomUUID(),
      itemId: id,
      kind: "transition",
      message: input.note ?? `${existing.status} → ${input.toStatus}`,
      fromStatus: existing.status,
      toStatus: input.toStatus,
      createdAt: now,
    });
    return this.getItem(id);
  }

  async listEvents(limit = 40): Promise<ReleaseEvent[]> {
    const rows = await this.db
      .select()
      .from(releaseEvents)
      .orderBy(desc(releaseEvents.createdAt))
      .limit(limit);
    return rows.map(mapEvent);
  }

  async summary(): Promise<ReleaseSummary> {
    return summarize(await this.listItems());
  }

  async seedIfEmpty(): Promise<number> {
    const rows = await this.db.select({ id: releaseItems.id }).from(releaseItems).limit(1);
    if (rows.length > 0) return 0;
    let seeded = 0;
    for (const demo of DEMO_RELEASE_ITEMS) {
      const created = await this.createItem(demo);
      seeded += 1;
      if (demo.status && demo.status !== "queued") {
        await this.transition(created.id, { toStatus: demo.status, note: "Seeded state" });
      }
    }
    return seeded;
  }
}
