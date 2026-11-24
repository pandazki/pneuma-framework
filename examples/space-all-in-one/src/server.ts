import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AGENT_SOURCES, AppHost, HostError, type AgentProvenance } from "./host";
import { servePage, type PagePictures } from "./owner";
import type { PageAssets } from "./page";

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

/**
 * The level of this Host's API, sent in the `pneuma-host-api` header of every answer. The artifact CLI refuses
 * to work with a Host below the level it was written for, so it never reads an answer that lacks what it relies on.
 * Raise it, together with HOST_API_LEVEL in bin/pneuma.mjs, when the CLI starts to rely on something new.
 * 2: status has `space_manager` and each waiting change's `preview`, and POST /apps/:name/changes/:id/preview exists.
 */
export const HOST_API_LEVEL = 2;
const LEVEL_HEADER = { "pneuma-host-api": String(HOST_API_LEVEL) };

const LOOPBACK_NAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
/** Bind addresses that mean "every address": not a name anyone reaches this Host by. */
const WILDCARD_BINDS = new Set(["", "0.0.0.0", "::", "[::]"]);

/** What the server needs to know besides the Host. */
export interface HostServerOptions {
  /** The address `PNEUMA_HOST_BIND` gave it to listen on. */
  readonly bind?: string;
  /** The owner link's token: the owner page's writes need it (src/owner.ts). Without it the page only reads. */
  readonly ownerToken?: string;
  /** Pictures of apps for the owner page (src/screenshots.ts); nudged after every write. */
  readonly pictures?: PagePictures;
  /** The owner page's built client (web/dist); by default the one beside the source. */
  readonly assets?: PageAssets;
}

/**
 * The names a request may call this Host by: the loopback names, the host name of the address it was given
 * (`PNEUMA_HOST_URL`), and the address it listens on (`PNEUMA_HOST_BIND`) when that is one address, not a wildcard.
 */
function acceptedNames(hostUrl: string | undefined, bind: string | undefined): Set<string> {
  const names = new Set(LOOPBACK_NAMES);
  if (hostUrl) names.add(new URL(hostUrl).hostname.toLowerCase());
  const address = bind?.trim().toLowerCase() ?? "";
  if (!WILDCARD_BINDS.has(address)) names.add(address.includes(":") && !address.startsWith("[") ? `[${address}]` : address);
  return names;
}

/**
 * This Host has no authentication: on one trusted machine, whoever can reach its port may act, and it
 * takes the acting subject from the request body. A browser needs a rule of its own, because any page
 * the person has open can send a request to 127.0.0.1 without their knowing, and the owner page
 * gives them a reason to have this port open in one. Three checks, none of them authentication:
 *
 * - The `Host` header must be one of the names in `acceptedNames`. A page on another name that was
 *   pointed at 127.0.0.1 after it loaded (DNS rebinding) fails here, for reads too. So any other name
 *   fails, a LAN address or host.docker.internal included, until PNEUMA_HOST_URL names it.
 * - A request that changes anything must not carry `Origin` or `Sec-Fetch-Site`. Browsers add them and
 *   a page cannot remove them; the CLI and other programs do not send them.
 * - It must say `content-type: application/json`. A form cannot send that, and a script on another
 *   origin can only after a preflight this server never answers.
 */
export function refuseWhatABrowserCouldSend(req: IncomingMessage, hostUrl: string | undefined, bind?: string): void {
  const named = String(req.headers.host ?? "").replace(/:\d+$/, "").toLowerCase();
  if (!acceptedNames(hostUrl, bind).has(named)) {
    throw new HostError(
      403,
      `this Host answers only to localhost, 127.0.0.1, [::1], the host name in PNEUMA_HOST_URL and the address in PNEUMA_HOST_BIND when it is not a wildcard; not to "${named || "(no Host header)"}". ` +
        "To reach it by another name, set PNEUMA_HOST_URL to the address with that name (the Host also records it for the CLI in every app) and restart the Host.",
      "wrong_host_name",
    );
  }
  const method = req.method ?? "GET";
  if (method === "GET" || method === "HEAD") return;
  if (req.headers.origin !== undefined || req.headers["sec-fetch-site"] !== undefined) {
    throw new HostError(403, "this Host takes changes from its CLI, not from a web page: the request carries a browser's headers", "browser_write_refused");
  }
  const type = String(req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== "application/json") {
    throw new HostError(415, "a request that changes something must say content-type: application/json", "content_type_required");
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

export function createHostServer(host: AppHost, options: HostServerOptions = {}) {
  const route = async (req: IncomingMessage): Promise<unknown> => {
    refuseWhatABrowserCouldSend(req, host.hostUrl, options.bind);
    const url = new URL(req.url ?? "/", "http://host");
    const parts = url.pathname.split("/").filter(Boolean);
    const method = req.method ?? "GET";

    if (method === "GET" && url.pathname === "/healthz") return { ok: true };
    if (parts[0] !== "apps") throw new HostError(404, "not found");
    if (parts.length === 1) {
      if (method === "GET") return { governance: host.governanceMode, ...(host.consoleUrl ? { console: host.consoleUrl } : {}), apps: host.summaries() };
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
        if (input.from !== undefined && typeof input.from !== "string") throw new HostError(400, "from must be the version the plan started from, e.g. v5");
        return host.undo(name, text(input.reason, "reason", "undo"), {
          actor: text(input.actor, "actor", "owner"),
          ...(typeof input.to === "string" ? { to: input.to.trim() } : {}),
          // The plan the person was shown and confirmed: refused once the current version is another one.
          ...(typeof input.from === "string" ? { from: input.from.trim() } : {}),
          // The owner's confirmation to go back past a one-way change, with or without its data. Like
          // approve: the subject comes from the body, and only the owner's is accepted.
          acceptOneWay: input.accept_one_way === true,
          ...(typeof input.subject === "string" ? { subject: input.subject } : {}),
        });
      }
      if (parts[2] === "discard") return host.discard(name);
      if (parts[2] === "adopt") return host.adopt(name), { ok: true };
    }
    // The owner asks for a waiting change's preview again, once it has ended itself.
    if (parts.length === 5 && method === "POST" && parts[2] === "changes" && parts[4] === "preview") return host.preview(name, parts[3]!);
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

  // The owner page's own writes carry a browser's headers on purpose and pass their own check (src/owner.ts),
  // so they take only the Host-name rule from refuseWhatABrowserCouldSend.
  const checkHostName = (req: IncomingMessage) => refuseWhatABrowserCouldSend({ headers: req.headers, method: "GET" } as IncomingMessage, host.hostUrl, options.bind);

  return createServer((req: IncomingMessage, res: ServerResponse) => {
    // Every answer, the page's included, says which API level this Host speaks.
    res.setHeader("pneuma-host-api", String(HOST_API_LEVEL));
    // The owner page, its pictures and its writes. Every other route answers JSON, as before.
    if (servePage(req, res, { host, checkHostName, ...options })) return;
    route(req).then(
      (result) => {
        // A write may have taken a version live or left a change waiting: the pictures look soon.
        if (req.method === "POST") options.pictures?.nudge();
        res.writeHead(200, { "content-type": "application/json", ...LEVEL_HEADER }).end(`${JSON.stringify(result, null, 2)}\n`);
      },
      (err: unknown) => {
        const status = err instanceof HostError ? err.status : 500;
        const message = err instanceof Error ? err.message : String(err);
        // `reason`, `detail` and the error's own fields let a client act on a refusal; `error` is the message, unchanged.
        const extra =
          err instanceof HostError ? { ...err.fields, ...(err.reason ? { reason: err.reason } : {}), ...(err.detail ? { detail: err.detail } : {}) } : {};
        res.writeHead(status, { "content-type": "application/json", ...LEVEL_HEADER }).end(`${JSON.stringify({ error: message, ...extra })}\n`);
      },
    );
  });
}
