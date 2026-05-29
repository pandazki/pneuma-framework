import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { createApi } from "./app";
import { buildRepository } from "./runtime";

// Local + Docker entry. Serves the JSON API and the built client bundle from a
// single Bun process. Vercel uses api/index.ts + static hosting instead.
const repo = await buildRepository();

const app = new Hono();
app.route("/", createApi(repo));
app.use("/assets/*", serveStatic({ root: "./dist/client" }));
// SPA fallback: serve the built shell for any non-API route.
app.get("*", async (c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "not_found" }, 404);
  const file = Bun.file("./dist/client/index.html");
  if (await file.exists()) {
    return new Response(file, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  return c.text("Client bundle not built. Run `bun run build`.", 503);
});

const port = Number(process.env.PORT ?? 8787);
// eslint-disable-next-line no-console
console.log(`clean-room-release-board listening on :${port} (persistence: ${repo.persistence})`);

export default { port, fetch: app.fetch };
