import {
  createReleaseItemInputSchema,
  type CreateReleaseItemInput,
  type ReleaseEvent,
  type ReleaseItem,
  type ReleaseItemWithEvents,
  type ReleaseStatus,
  type ReleaseSummary,
  type TransitionReleaseItemInput,
  RELEASE_STATUSES,
} from "../shared/contracts";
import { DEMO_RELEASE_ITEMS } from "../shared/demo-data";

// ---------------------------------------------------------------------------
// Persistence-agnostic contract. The Hono app only ever talks to this; the
// memory implementation backs preview/local, the Neon implementation backs a
// published runtime. Both must behave identically.
// ---------------------------------------------------------------------------

export interface ReleaseRepository {
  readonly persistence: "neon" | "memory";
  listItems(): Promise<ReleaseItem[]>;
  getItem(id: string): Promise<ReleaseItemWithEvents | null>;
  createItem(input: CreateReleaseItemInput): Promise<ReleaseItem>;
  transition(id: string, input: TransitionReleaseItemInput): Promise<ReleaseItemWithEvents | null>;
  listEvents(limit?: number): Promise<ReleaseEvent[]>;
  summary(): Promise<ReleaseSummary>;
  /** Seed demo stories only when the board is empty. Returns rows inserted. */
  seedIfEmpty(): Promise<number>;
}

export function summarize(items: ReleaseItem[]): ReleaseSummary {
  const byStatus = Object.fromEntries(RELEASE_STATUSES.map((s) => [s, 0])) as Record<
    ReleaseStatus,
    number
  >;
  for (const item of items) byStatus[item.status] += 1;
  return {
    total: items.length,
    byStatus,
    atRisk: items.filter((i) => i.risk === "high" && i.status !== "shipped").length,
    shippedThisCycle: byStatus.shipped,
  };
}

function newId(): string {
  return crypto.randomUUID();
}

// --- in-memory implementation --------------------------------------------

export class MemoryReleaseRepository implements ReleaseRepository {
  readonly persistence = "memory" as const;
  private items: ReleaseItem[] = [];
  private events: ReleaseEvent[] = [];

  async listItems(): Promise<ReleaseItem[]> {
    return [...this.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getItem(id: string): Promise<ReleaseItemWithEvents | null> {
    const item = this.items.find((i) => i.id === id);
    if (!item) return null;
    const events = this.events
      .filter((e) => e.itemId === id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { ...item, events };
  }

  async createItem(input: CreateReleaseItemInput): Promise<ReleaseItem> {
    const parsed = createReleaseItemInputSchema.parse(input);
    const now = new Date().toISOString();
    const item: ReleaseItem = {
      id: newId(),
      title: parsed.title,
      summary: parsed.summary,
      status: "queued",
      priority: parsed.priority,
      risk: parsed.risk,
      owner: parsed.owner,
      slaDueAt: parsed.slaDueAt,
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(item);
    this.events.push({
      id: newId(),
      itemId: item.id,
      kind: "created",
      message: `Queued by ${item.owner}`,
      fromStatus: null,
      toStatus: "queued",
      createdAt: now,
    });
    return item;
  }

  async transition(
    id: string,
    input: TransitionReleaseItemInput,
  ): Promise<ReleaseItemWithEvents | null> {
    const item = this.items.find((i) => i.id === id);
    if (!item) return null;
    const now = new Date().toISOString();
    const from = item.status;
    item.status = input.toStatus;
    item.updatedAt = now;
    this.events.push({
      id: newId(),
      itemId: id,
      kind: "transition",
      message: input.note ?? `${from} → ${input.toStatus}`,
      fromStatus: from,
      toStatus: input.toStatus,
      createdAt: now,
    });
    return this.getItem(id);
  }

  async listEvents(limit = 40): Promise<ReleaseEvent[]> {
    return [...this.events]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async summary(): Promise<ReleaseSummary> {
    return summarize(this.items);
  }

  async seedIfEmpty(): Promise<number> {
    if (this.items.length > 0) return 0;
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
