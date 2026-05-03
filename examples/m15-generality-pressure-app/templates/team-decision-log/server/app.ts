import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { asBunFetch, bootAppRuntime } from "@pneuma-framework/runtime";
import { config } from "./config.js";

function ensureDir(path: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    // Ignore concurrent directory creation.
  }
}

if (config.persistence?.kind === "sqlite") ensureDir(config.persistence.path);

const runtime = await bootAppRuntime(config);
const port = Number(process.env.PNEUMA_PORT_HINT ?? "8775");
const apiFetch = asBunFetch(runtime);
const viewerDir = join(import.meta.dir, "..", "viewer");

const server = Bun.serve({
  port,
  fetch: async (req): Promise<Response> => {
    const url = new URL(req.url);

    if (url.pathname === "/healthz") {
      return Response.json({ ok: true, app_id: config.app_id });
    }

    if (url.pathname.startsWith("/api/")) return apiFetch(req);

    let rel = url.pathname;
    if (rel === "/") rel = "/index.html";
    if (rel.includes("..")) return new Response("forbidden", { status: 403 });
    const file = Bun.file(join(viewerDir, rel));
    if (await file.exists()) return new Response(file);
    return new Response("not found", { status: 404 });
  },
});

const base = `http://127.0.0.1:${server.port}`;
process.stdout.write(`##pneuma:service-ready api ${base}\n`);
process.stdout.write("##pneuma:ready\n");
process.stdout.write(`team-decision-log up at ${base} - ${runtime.listOperations().length} operations\n`);

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
