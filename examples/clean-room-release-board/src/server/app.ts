import { Hono } from "hono";
import type { ReleaseRepository } from "./repository";
import {
  createReleaseItemInputSchema,
  schemaSignature,
  transitionReleaseItemInputSchema,
} from "../shared/contracts";

// Builds the JSON API. The app is persistence-agnostic: it is handed a
// repository (memory for preview/local, Neon for a published runtime) and
// never reaches for env or a database itself.
export function createApi(repo: ReleaseRepository): Hono {
  const api = new Hono();

  api.get("/api/health", (c) =>
    c.json({ ok: true, persistence: repo.persistence, schemaSignature: schemaSignature() }),
  );

  api.get("/api/summary", async (c) => c.json(await repo.summary()));

  api.get("/api/items", async (c) => c.json(await repo.listItems()));

  api.post("/api/items", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createReleaseItemInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_input", issues: parsed.error.flatten() }, 400);
    }
    const item = await repo.createItem(parsed.data);
    return c.json(item, 201);
  });

  api.get("/api/items/:id", async (c) => {
    const item = await repo.getItem(c.req.param("id"));
    if (!item) return c.json({ error: "not_found" }, 404);
    return c.json(item);
  });

  api.post("/api/items/:id/transition", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = transitionReleaseItemInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_input", issues: parsed.error.flatten() }, 400);
    }
    const item = await repo.transition(c.req.param("id"), parsed.data);
    if (!item) return c.json({ error: "not_found" }, 404);
    return c.json(item);
  });

  api.get("/api/events", async (c) => {
    const limit = Number(c.req.query("limit") ?? "40");
    return c.json(await repo.listEvents(Number.isFinite(limit) ? limit : 40));
  });

  return api;
}
