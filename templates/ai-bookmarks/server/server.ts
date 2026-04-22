import indexHtml from "../viewer/index.html";
import { openDb } from "./db.js";
import { openLensRegistry } from "./lenses.js";
import { ingest } from "./interpret.js";

const WORKSPACE = process.env.PNEUMA_WORKSPACE ?? process.cwd();
const PORT = Number(process.env.PNEUMA_PORT_HINT ?? process.env.PORT ?? 3000);
const SIMILARITY_THRESHOLD = Number(process.env.BOOKMARKS_EDGE_THRESHOLD ?? 0.65);

const db = openDb(WORKSPACE);
const lenses = openLensRegistry(WORKSPACE);

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  // HTML routes run Bun's bundler on the entry HTML and its imported TSX/CSS.
  // Any path matched here skips fetch(); api + 404 fall through.
  routes: { "/": indexHtml },
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/api/bookmarks" && req.method === "POST") {
      const body = await req.json() as { url?: string };
      if (!body.url) return new Response(JSON.stringify({ error: "url required" }), { status: 400 });
      try {
        const r = await ingest(db, lenses, body.url);
        return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
      }
    }
    if (url.pathname === "/api/bookmarks" && req.method === "GET") {
      const rows = db.listBookmarksWithInterpretations();
      return new Response(JSON.stringify(rows), { headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/api/graph" && req.method === "GET") {
      const g = db.buildGraph(SIMILARITY_THRESHOLD);
      return new Response(JSON.stringify(g), { headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/api/lenses" && req.method === "GET") {
      return new Response(JSON.stringify({ lenses: lenses.list() }), { headers: { "Content-Type": "application/json" } });
    }

    return new Response("not found", { status: 404 });
  },
});

console.log(`##pneuma:service-ready viewer http://localhost:${PORT}/?sid=${process.env.PNEUMA_SESSION_ID ?? ""}&ws=${encodeURIComponent(process.env.PNEUMA_WS_URL ?? "")}`);
console.log(`##pneuma:ready`);
