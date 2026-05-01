import type { ToolRegistry } from "./tools/types.js";

export interface FrameworkToolHttpProxyOptions {
  hostname?: string;
  port?: number;
}

export interface FrameworkToolHttpProxy {
  readonly url: string;
  close(): void;
}

export function startFrameworkToolHttpProxy(
  registry: ToolRegistry,
  options: FrameworkToolHttpProxyOptions = {},
): FrameworkToolHttpProxy {
  const hostname = options.hostname ?? "127.0.0.1";
  const server = Bun.serve({
    hostname,
    port: options.port ?? 0,
    fetch: async (request) => handleFrameworkToolRequest(registry, request),
  });
  return {
    url: `http://${hostname}:${server.port}`,
    close: () => server.stop(true),
  };
}

async function handleFrameworkToolRequest(registry: ToolRegistry, request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/api/framework/tools") {
    return json({ tools: registry.list() });
  }

  const prefix = "/api/framework/tools/";
  if (request.method === "POST" && url.pathname.startsWith(prefix)) {
    const rawToolName = url.pathname.slice(prefix.length);
    const toolName = decodeURIComponent(rawToolName);
    if (!registry.has(toolName)) {
      return json({ ok: false, error: `tool not found: ${toolName}` }, 404);
    }

    const body = await parseJsonBody(request);
    if (!body.ok) return json({ ok: false, error: body.error }, 400);
    const input = (body.value as { input?: unknown }).input ?? {};
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return json({ ok: false, error: "input must be an object" }, 400);
    }

    const result = await registry.call(toolName, input as Record<string, unknown>);
    return json(result, 200);
  }

  return json({ ok: false, error: "not found" }, 404);
}

async function parseJsonBody(request: Request): Promise<
  | { ok: true; value: unknown }
  | { ok: false; error: string }
> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, error: "invalid JSON body" };
  }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
