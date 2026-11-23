import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AppHost, HostError } from "./host";

// ---------------------------------------------------------------------------
// Agent-driven control plane: a headless Host a coding agent calls.
//
// The agent edits the app's working tree with its own tools and then asks this
// Host to take the change through the governed loop. The Host never starts an
// agent here; `src/drive.ts` is the other direction.
// ---------------------------------------------------------------------------

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new HostError(400, "request body must be JSON");
  }
}

function text(value: unknown, field: string, fallback?: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (fallback !== undefined) return fallback;
  throw new HostError(400, `${field} is required`);
}

export function createHostServer(host: AppHost) {
  const route = async (req: IncomingMessage): Promise<unknown> => {
    const url = new URL(req.url ?? "/", "http://host");
    const parts = url.pathname.split("/").filter(Boolean);
    const method = req.method ?? "GET";

    if (method === "GET" && url.pathname === "/healthz") return { ok: true };
    if (parts[0] !== "apps") throw new HostError(404, "not found");
    if (parts.length === 1) {
      if (method === "GET") return { apps: host.list() };
      if (method === "POST") {
        const input = await body(req);
        return host.create(text(input.name, "name"), typeof input.intent === "string" ? input.intent : undefined);
      }
    }
    const name = parts[1]!;
    if (parts.length === 2 && method === "GET") return host.status(name);
    if (parts.length === 3 && method === "GET" && parts[2] === "history") return { history: host.history(name) };
    if (parts.length === 3 && method === "POST") {
      const input = await body(req);
      if (parts[2] === "changes") return host.submit({ name, intent: text(input.intent, "intent"), agent: text(input.agent, "agent", "unknown-agent") });
      if (parts[2] === "undo") return host.undo(name, text(input.reason, "reason", "undo"), text(input.actor, "actor", "owner"));
      if (parts[2] === "discard") return host.discard(name);
      if (parts[2] === "adopt") return host.adopt(name), { ok: true };
    }
    if (parts.length === 5 && method === "POST" && parts[2] === "changes" && (parts[4] === "approve" || parts[4] === "deny")) {
      const input = await body(req);
      return host.resolve(
        name,
        parts[3]!,
        parts[4] === "approve" ? "approved" : "denied",
        text(input.subject, "subject"),
        typeof input.reason === "string" ? input.reason : undefined,
      );
    }
    throw new HostError(404, "not found");
  };

  return createServer((req: IncomingMessage, res: ServerResponse) => {
    route(req).then(
      (result) => res.writeHead(200, { "content-type": "application/json" }).end(`${JSON.stringify(result, null, 2)}\n`),
      (err: unknown) => {
        const status = err instanceof HostError ? err.status : 500;
        const message = err instanceof Error ? err.message : String(err);
        res.writeHead(status, { "content-type": "application/json" }).end(`${JSON.stringify({ error: message })}\n`);
      },
    );
  });
}
