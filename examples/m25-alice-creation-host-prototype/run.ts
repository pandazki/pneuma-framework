#!/usr/bin/env bun

import { join } from "node:path";
import {
  M25_STAGE_IDS,
  buildM25PrototypeModel,
  runM25PrototypeStage,
} from "./prototype-model.js";

export interface RunArgs {
  readonly port: number;
  readonly smokeExit: boolean;
}

export interface M25AliceCreationHostServer {
  readonly port: number;
  stop(): Promise<void>;
}

function usage(): string {
  return [
    "usage: bun run examples/m25-alice-creation-host-prototype/run.ts [--port <port>] [--smoke-exit]",
    "",
    "Starts the M25 Alice-style Creation Host prototype.",
  ].join("\n");
}

export function parseArgs(argv: string[]): RunArgs {
  let port = 8886;
  let smokeExit = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") {
      const value = argv[i + 1];
      if (!value) throw new Error("--port requires a value");
      if (!/^\d+$/.test(value)) throw new Error("--port must be a number");
      port = Number(value);
      i += 1;
    } else if (arg === "--smoke-exit") {
      smokeExit = true;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  return { port, smokeExit };
}

export async function startM25AliceCreationHostServer(
  options: { readonly port: number },
): Promise<M25AliceCreationHostServer> {
  const completedStageIds = new Set<string>();
  const server = Bun.serve({
    port: options.port,
    fetch: (req) => handleRequest(req, completedStageIds),
  });

  return {
    port: server.port,
    async stop() {
      server.stop(true);
    },
  };
}

async function handleRequest(req: Request, completedStageIds: Set<string>): Promise<Response> {
  const url = new URL(req.url);
  try {
    if (req.method === "GET" && url.pathname === "/") return serveStaticFile("index.html");
    if (req.method === "GET" && url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
    if (req.method === "GET" && url.pathname.startsWith("/static/")) {
      return serveStaticFile(url.pathname.replace(/^\/static\//, ""));
    }
    if (req.method === "GET" && url.pathname === "/api/prototype") {
      return json(buildM25PrototypeModel([...completedStageIds]));
    }
    if (req.method === "POST" && url.pathname === "/api/prototype/reset") {
      completedStageIds.clear();
      return json(buildM25PrototypeModel([]));
    }

    const stageMatch = url.pathname.match(/^\/api\/prototype\/stages\/([^/]+)\/run$/);
    if (req.method === "POST" && stageMatch) {
      const stageId = decodeURIComponent(stageMatch[1]);
      const model = runM25PrototypeStage([...completedStageIds], stageId);
      completedStageIds.clear();
      for (const id of model.completed_stage_ids) completedStageIds.add(id);
      return json(model);
    }

    if (req.method === "POST" && url.pathname === "/api/prototype/run-all") {
      completedStageIds.clear();
      for (const id of M25_STAGE_IDS) completedStageIds.add(id);
      return json(buildM25PrototypeModel([...completedStageIds]));
    }

    return json({ error: "not_found" }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
}

function serveStaticFile(name: string): Response {
  if (!/^[a-z0-9._-]+$/i.test(name)) return json({ error: "invalid_static_path" }, 400);
  const file = Bun.file(join(import.meta.dir, "static", name));
  return new Response(file, {
    headers: {
      "content-type": contentType(name),
      "cache-control": "no-store",
    },
  });
}

function contentType(name: string): string {
  if (name.endsWith(".html")) return "text/html; charset=utf-8";
  if (name.endsWith(".css")) return "text/css; charset=utf-8";
  if (name.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (name.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const server = await startM25AliceCreationHostServer({ port: args.port });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  process.stdout.write(`M25 Alice Creation Host prototype ready: ${baseUrl}\n`);

  if (args.smokeExit) {
    try {
      const response = await fetch(`${baseUrl}/api/prototype/run-all`, { method: "POST" });
      if (!response.ok) throw new Error(`smoke failed with HTTP ${response.status}`);
      const model = await response.json() as { rc_ready?: boolean; completed_stage_ids?: unknown[] };
      if (model.rc_ready !== true) throw new Error("expected M25 prototype to reach rc_ready");
      if (!Array.isArray(model.completed_stage_ids) || model.completed_stage_ids.length !== M25_STAGE_IDS.length) {
        throw new Error("expected every M25 stage to complete");
      }
      process.stdout.write("smoke verification: passed\n");
      return 0;
    } finally {
      await server.stop();
    }
  }

  process.stdout.write("Press Ctrl+C to stop the prototype.\n");
  const shutdown = (): void => {
    void server.stop().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await new Promise(() => undefined);
  return 0;
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}
