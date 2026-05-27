import { describe, expect, it } from "bun:test";
import { createReleaseOperationsApp } from "../src/server/app";
import { createMemoryRepository } from "../src/server/repository";

describe("release operations API", () => {
  it("serves health, summary, items, and events", async () => {
    const app = createReleaseOperationsApp({ repository: createMemoryRepository() });

    expect((await app.request("/api/health")).status).toBe(200);

    const summary = await (await app.request("/api/summary")).json();
    expect(summary.total).toBe(3);
    expect(summary.highRisk).toBe(2);

    const items = await (await app.request("/api/items")).json();
    expect(items.items).toHaveLength(3);

    const events = await (await app.request("/api/events")).json();
    expect(events.events.length).toBeGreaterThan(0);
  });

  it("validates creation and transition inputs", async () => {
    const app = createReleaseOperationsApp({ repository: createMemoryRepository([], []) });

    const invalid = await app.request("/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "x" }),
    });
    expect(invalid.status).toBe(400);

    const created = await app.request("/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Rehearse production migration",
        owner: "Avery",
        priority: "P1",
        risk: "high",
        notes: "Must pass preview rehearsal before release.",
      }),
    });
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.item.status).toBe("triage");

    const transitioned = await app.request(`/api/items/${body.item.id}/transition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "ready_for_release",
        actor: "Release captain",
      }),
    });
    expect(transitioned.status).toBe(200);
    expect((await transitioned.json()).item.status).toBe("ready_for_release");
  });
});
