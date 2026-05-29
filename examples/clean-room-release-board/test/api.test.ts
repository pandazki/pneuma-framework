import { describe, expect, test } from "bun:test";
import { createApi } from "../src/server/app";
import { MemoryReleaseRepository } from "../src/server/repository";
import type { ReleaseItem, ReleaseItemWithEvents, ReleaseSummary } from "../src/shared/contracts";

async function freshApi() {
  const repo = new MemoryReleaseRepository();
  await repo.seedIfEmpty();
  return createApi(repo);
}

describe("release board API", () => {
  test("health reports memory persistence and a schema signature", async () => {
    const api = await freshApi();
    const res = await api.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.persistence).toBe("memory");
    expect(body.schemaSignature).toContain("release_items(");
  });

  test("seeded board lists items and summarizes by status", async () => {
    const api = await freshApi();
    const items: ReleaseItem[] = await (await api.request("/api/items")).json();
    expect(items.length).toBe(4);
    const summary: ReleaseSummary = await (await api.request("/api/summary")).json();
    expect(summary.total).toBe(4);
    expect(summary.byStatus.shipped).toBe(1);
    expect(summary.atRisk).toBeGreaterThanOrEqual(1);
  });

  test("creates an item, then transitions it with an event trail", async () => {
    const api = await freshApi();
    const created: ReleaseItem = await (
      await api.request("/api/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Promote canary", owner: "SRE", priority: "high" }),
      })
    ).json();
    expect(created.status).toBe("queued");

    const moved = await api.request(`/api/items/${created.id}/transition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toStatus: "in_progress", note: "Canary at 5%" }),
    });
    const detail: ReleaseItemWithEvents = await moved.json();
    expect(detail.status).toBe("in_progress");
    expect(detail.events.some((e) => e.kind === "created")).toBe(true);
    expect(detail.events.some((e) => e.toStatus === "in_progress")).toBe(true);
  });

  test("rejects invalid create input", async () => {
    const api = await freshApi();
    const res = await api.request("/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "", owner: "" }),
    });
    expect(res.status).toBe(400);
  });

  test("returns 404 for an unknown item", async () => {
    const api = await freshApi();
    const res = await api.request("/api/items/does-not-exist");
    expect(res.status).toBe(404);
  });
});
