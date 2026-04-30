// knowledge-inbox-core-domain / app.ts - dev entry.
// Read config.ts, boot runtime, serve through Bun, and emit pneuma markers.
//
// scripts/dev.sh launches this file; SIGTERM/SIGINT trigger graceful shutdown.

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { asBunFetch, bootAppRuntime } from "@pneuma-framework/runtime";
import { config } from "./config.js";

// ensure storage dirs exist
const ensureDir = (path: string): void => {
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    // ignore
  }
};
if (config.persistence?.kind === "sqlite") ensureDir(config.persistence.path);
if (config.storage?.sqlite_path) ensureDir(config.storage.sqlite_path);
if (config.audit?.ndjson_path) ensureDir(config.audit.ndjson_path);
if (config.history?.sqlite_path) ensureDir(config.history.sqlite_path);

const runtime = await bootAppRuntime(config);

const port = Number(process.env.PNEUMA_PORT_HINT ?? "8765");
const apiFetch = asBunFetch(runtime);

// viewer directory (relative to this file, in templates/knowledge-inbox-core-domain/viewer/)
const viewerDir = join(import.meta.dir, "..", "viewer");

const server = Bun.serve({
  port,
  fetch: async (req): Promise<Response> => {
    const url = new URL(req.url);

    if (url.pathname === "/healthz") {
      return new Response(JSON.stringify({ ok: true, app_id: config.app_id }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // /api/* -> core-domain runtime
    if (url.pathname.startsWith("/api/")) {
      return apiFetch(req);
    }

    // static files from viewer/; / -> /index.html
    let rel = url.pathname;
    if (rel === "/") rel = "/index.html";
    // block path traversal
    if (rel.includes("..")) {
      return new Response("forbidden", { status: 403 });
    }
    const filePath = join(viewerDir, rel);
    const f = Bun.file(filePath);
    if (await f.exists()) {
      return new Response(f);
    }
    return new Response("not found", { status: 404 });
  },
});

const base = `http://127.0.0.1:${server.port}`;

// pneuma markers: tell lifecycle orchestrator we're up
process.stdout.write(`##pneuma:service-ready api ${base}\n`);
process.stdout.write(`##pneuma:ready\n`);
process.stdout.write(`knowledge-inbox-core-domain up at ${base} - ${runtime.listOperations().length} operations\n`);

// --- graceful shutdown ---
let stopping = false;
const shutdown = async (): Promise<void> => {
  if (stopping) return;
  stopping = true;
  process.stdout.write("##pneuma:stopping\n");
  try {
    server.stop(true);
  } catch {
    // ignore
  }
  try {
    await runtime.close();
  } catch {
    // ignore
  }
  process.exit(0);
};
process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});
