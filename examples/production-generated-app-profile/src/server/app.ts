import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createNeonDb } from "../db/client";
import { createDrizzleRepository, createMemoryRepository, type ReleaseRepository } from "./repository";
import { createReleaseItemSchema, transitionReleaseItemSchema } from "../shared/contracts";

export interface AppEnv {
  repository?: ReleaseRepository;
}

export function createReleaseOperationsApp(options: AppEnv = {}) {
  const app = new Hono();
  const repository =
    options.repository ??
    (process.env.DATABASE_URL ? createDrizzleRepository(createNeonDb(process.env.DATABASE_URL)) : createMemoryRepository());

  app.use("/api/*", cors());

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      runtime: typeof Bun === "undefined" ? "node-compatible" : "bun",
      persistence: process.env.DATABASE_URL ? "neon" : "memory-demo",
    }),
  );

  app.get("/api/summary", async (c) => c.json(await repository.summary()));
  app.get("/api/items", async (c) => c.json({ items: await repository.listItems() }));
  app.get("/api/events", async (c) => c.json({ events: await repository.listEvents(c.req.query("item_id")) }));

  app.post("/api/items", zValidator("json", createReleaseItemSchema), async (c) => {
    const input = c.req.valid("json");
    const item = await repository.createItem(input);
    return c.json({ item }, 201);
  });

  app.post("/api/items/:id/transition", zValidator("json", transitionReleaseItemSchema), async (c) => {
    const item = await repository.transitionItem(c.req.param("id"), c.req.valid("json"));
    if (!item) return c.json({ error: "not_found" }, 404);
    return c.json({ item });
  });

  return app;
}

export default createReleaseOperationsApp();
