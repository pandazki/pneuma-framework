import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AGENT_SOURCES, AppHost, HostError, type AgentProvenance } from "./host";

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

const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

/**
 * Where the submitting client says the agent's name came from. Absent fields mean the client did not say.
 * With markers of more than one agent the name must be `unknown`: the record never names one of them on a guess.
 */
function provenance(input: Record<string, unknown>, agent: string): AgentProvenance | undefined {
  const { agent_source: source, agent_markers: markers, agent_candidates: candidates } = input;
  if (source === undefined) return undefined;
  if (typeof source !== "string" || !(AGENT_SOURCES as readonly string[]).includes(source)) {
    throw new HostError(400, `agent_source must be one of ${AGENT_SOURCES.join(", ")}`);
  }
  if (markers !== undefined && !strings(markers)) throw new HostError(400, "agent_markers must be a list of environment variable names");
  if (
    candidates !== undefined &&
    !(Array.isArray(candidates) && candidates.every((c) => typeof c === "object" && c !== null && typeof c.agent === "string" && strings(c.markers)))
  ) {
    throw new HostError(400, "agent_candidates must be a list of { agent, markers }");
  }
  if (source === "ambiguous" && agent !== "unknown") {
    throw new HostError(400, 'with markers of more than one agent the agent is recorded as "unknown", not as one of them');
  }
  return {
    source: source as AgentProvenance["source"],
    ...(markers ? { markers } : {}),
    ...(candidates ? { candidates: candidates as AgentProvenance["candidates"] } : {}),
  };
}

export function createHostServer(host: AppHost) {
  const route = async (req: IncomingMessage): Promise<unknown> => {
    const url = new URL(req.url ?? "/", "http://host");
    const parts = url.pathname.split("/").filter(Boolean);
    const method = req.method ?? "GET";

    if (method === "GET" && url.pathname === "/healthz") return { ok: true };
    if (parts[0] !== "apps") throw new HostError(404, "not found");
    if (parts.length === 1) {
      if (method === "GET") return { governance: host.governanceMode, apps: host.summaries() };
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
      if (parts[2] === "changes") {
        if (input.one_way !== undefined && typeof input.one_way !== "string") throw new HostError(400, "one_way must be a sentence saying what putting files back would not undo");
        const agent = text(input.agent, "agent", "unknown");
        const agentProvenance = provenance(input, agent);
        return host.submit({
          name,
          intent: text(input.intent, "intent"),
          agent,
          ...(agentProvenance ? { agentProvenance } : {}),
          ...(typeof input.one_way === "string" ? { oneWay: input.one_way } : {}),
        });
      }
      if (parts[2] === "undo") {
        if (input.to !== undefined && typeof input.to !== "string") throw new HostError(400, "to must be a version name, e.g. v3");
        return host.undo(name, text(input.reason, "reason", "undo"), {
          actor: text(input.actor, "actor", "owner"),
          ...(typeof input.to === "string" ? { to: input.to.trim() } : {}),
          // The owner's confirmation to go back past a one-way change, with or without its data. Like
          // approve: the subject comes from the body, and only the owner's is accepted.
          acceptOneWay: input.accept_one_way === true,
          ...(typeof input.subject === "string" ? { subject: input.subject } : {}),
        });
      }
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
        // `reason`, `detail` and the error's own fields let a client act on a refusal; `error` is the message, unchanged.
        const extra =
          err instanceof HostError ? { ...err.fields, ...(err.reason ? { reason: err.reason } : {}), ...(err.detail ? { detail: err.detail } : {}) } : {};
        res.writeHead(status, { "content-type": "application/json" }).end(`${JSON.stringify({ error: message, ...extra })}\n`);
      },
    );
  });
}
