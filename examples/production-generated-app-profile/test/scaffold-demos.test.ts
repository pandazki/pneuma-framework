import { describe, expect, it } from "bun:test";
import { createReleaseOperationsApp } from "../src/server/app";
import { createMemoryRepository } from "../src/server/repository";
import { scaffoldDemos } from "../src/profile/scaffold-demos";

describe("production scaffold demo slices", () => {
  for (const demo of scaffoldDemos) {
    it(`runs ${demo.id}`, async () => {
      const app = createReleaseOperationsApp({ repository: createMemoryRepository([], []) });

      const created = await app.request("/api/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(demo.createItem),
      });
      expect(created.status).toBe(201);
      const body = await created.json();

      for (const status of demo.transitions) {
        const moved = await app.request(`/api/items/${body.item.id}/transition`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status,
            actor: demo.createItem.owner,
            message: `${demo.title}: ${status}`,
          }),
        });
        expect(moved.status).toBe(200);
      }

      const items = await (await app.request("/api/items")).json();
      expect(items.items).toHaveLength(1);
      expect(items.items[0].status).toBe(demo.expectedFinalStatus);

      const summary = await (await app.request("/api/summary")).json();
      expect(summary.total).toBe(1);
      expect(summary.highRisk).toBe(demo.createItem.risk === "high" || demo.createItem.risk === "critical" ? 1 : 0);
      expect(summary.releaseReady).toBe(demo.expectedFinalStatus === "ready_for_release" ? 1 : 0);
    });
  }
});
