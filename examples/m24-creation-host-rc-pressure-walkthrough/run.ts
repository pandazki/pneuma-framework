#!/usr/bin/env bun

import { join } from "node:path";
import { buildCreationHostRcWalkthrough, type CreationHostRcWalkthroughLocale } from "./pressure-story.js";

export interface RunArgs {
  readonly port: number;
  readonly smokeExit: boolean;
}

export interface M24RcPressureWalkthroughServer {
  readonly port: number;
  stop(): Promise<void>;
}

function usage(): string {
  return [
    "usage: bun run examples/m24-creation-host-rc-pressure-walkthrough/run.ts [--port <port>] [--smoke-exit]",
    "",
    "Starts the M24 Creation Host RC Pressure Walkthrough.",
  ].join("\n");
}

export function parseArgs(argv: string[]): RunArgs {
  let port = 8885;
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

export async function startM24RcPressureWalkthroughServer(
  options: { readonly port: number },
): Promise<M24RcPressureWalkthroughServer> {
  const server = Bun.serve({
    port: options.port,
    fetch: (req) => handleRequest(req),
  });

  return {
    port: server.port,
    async stop() {
      server.stop(true);
    },
  };
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  try {
    if (req.method === "GET" && url.pathname === "/") return serveStaticFile("index.html");
    if (req.method === "GET" && url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
    if (req.method === "GET" && url.pathname === "/api/story") {
      return json(buildCreationHostRcWalkthrough(readLocale(url)));
    }
    if (req.method === "GET" && url.pathname.startsWith("/static/")) {
      return serveStaticFile(url.pathname.replace(/^\/static\//, ""));
    }
    return json({ error: "not_found" }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

function readLocale(url: URL): CreationHostRcWalkthroughLocale {
  return url.searchParams.get("lang") === "zh-CN" ? "zh-CN" : "en";
}

function serveStaticFile(name: string): Response {
  if (!/^[a-z0-9._-]+$/i.test(name)) return json({ error: "invalid_static_path" }, 400);
  const file = Bun.file(join(import.meta.dir, "static", name));
  const type = contentType(name);
  return new Response(file, {
    headers: {
      "content-type": type,
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
  const server = await startM24RcPressureWalkthroughServer({ port: args.port });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  process.stdout.write(`M24 Creation Host RC Pressure Walkthrough ready: ${baseUrl}\n`);

  if (args.smokeExit) {
    try {
      const response = await fetch(`${baseUrl}/api/story`);
      if (!response.ok) throw new Error(`smoke failed with HTTP ${response.status}`);
      const story = await response.json() as { report?: { ok?: boolean }; steps?: unknown[] };
      if (story.report?.ok !== true) throw new Error("expected pressure report to pass");
      if (!Array.isArray(story.steps) || story.steps.length !== 4) throw new Error("expected 4 walkthrough steps");
      process.stdout.write("smoke verification: passed\n");
      return 0;
    } finally {
      await server.stop();
    }
  }

  process.stdout.write("Press Ctrl+C to stop the walkthrough.\n");
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
