import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { ChangeRecordRefused } from "@pneuma-framework/host-kit/change-record";
import { APP_NAME } from "./artifact";
import { HostError, type AppHost } from "./host";
import { appModel, assetType, backModel, changeModel, homeModel, loadPageAssets, missingModel, NO_PICTURES, PAGE_ICON, pageHeaders, renderShell, unreadableModel, type PageAssets, type PageContext, type PictureLookup } from "./page";
import type { PageModel } from "./page-model";
import { chooseLang } from "./page-words";

// ---------------------------------------------------------------------------
// The owner page's routes, and the owner link that lets its writes act.
//
// Reads are open the way `GET /apps` is: anyone who can reach the Host's port
// on its own name sees the page. A write (let a change go live, say no, go
// back) is allowed only for the owner's own session, which is how the page
// stays within the rule the CLI keeps with "must be a terminal":
//
//   - The Host makes a random token once, keeps it in its own state directory
//     (mode 0600, outside every app directory, so the link survives a restart),
//     and prints an owner link `<host>/#owner=<token>` at every start.
//     The token rides in the fragment, which no browser sends to any server or
//     puts in a Referer. The page moves it into this tab's sessionStorage and
//     takes it out of the address bar.
//   - Each write sends it in the `x-pneuma-owner` header. Another site cannot
//     ride on that: it has no way to read the token, and a custom header from
//     another origin needs a preflight this Host never answers. No cookie is
//     used: apps on the runtime are served from this machine's own name, and
//     cookies do not separate ports, so an app could see or set one.
//   - The write must also come from this page: `Origin` equal to the Host's own
//     origin and, where the browser sends it, `Sec-Fetch-Site: same-origin`.
//
// This stops an honest agent from approving its own change through the page; it
// does not stop a hostile process on the same machine, which can read the
// Host's log. A real agent product replaces it with its own login.
// ---------------------------------------------------------------------------

/** The header the page's writes carry the owner token in. */
export const OWNER_HEADER = "x-pneuma-owner";
/** What a decision or undo made on the page says in its history entry. */
export const PAGE_CHANNEL = "owner-page";

/** 24 random bytes, base64url: what the owner link carries. */
export function makeOwnerToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * The owner token kept in `<dir>/owner-token` (mode 0600), made on first use: the owner link keeps working
 * across restarts. Deleting the file and restarting makes a new link and retires the old one. When the file
 * cannot be read or written (another user's, say), the token lives in this process only, and `log` says so.
 */
export function ownerTokenIn(dir: string, log: (line: string) => void = () => {}): string {
  const file = join(dir, "owner-token");
  try {
    if (existsSync(file)) {
      const kept = readFileSync(file, "utf8").trim();
      if (/^[A-Za-z0-9_-]{32}$/.test(kept)) {
        chmodSync(file, 0o600);
        return kept;
      }
    }
    mkdirSync(dir, { recursive: true });
    const token = makeOwnerToken();
    writeFileSync(file, `${token}\n`, { mode: 0o600 });
    chmodSync(file, 0o600);
    return token;
  } catch (err) {
    log(`could not keep the owner link's token in ${file} (${err instanceof Error ? err.message : String(err)}); the link below works until the Host restarts`);
    return makeOwnerToken();
  }
}

export function ownerLink(hostUrl: string, token: string): string {
  return `${hostUrl.replace(/\/+$/, "")}/#owner=${token}`;
}

/**
 * Why a write from the page may not act, or null when it may: it must come from this Host's own page (its
 * origin), say JSON, and carry the owner token. The Host-name rule has already run (src/server.ts).
 */
export function refuseOwnerWrite(req: IncomingMessage, token: string | undefined): HostError | null {
  if (!token) return new HostError(403, "this Host was started without an owner link, so its page cannot decide anything; decide in a terminal", "owner_page_off");
  const host = String(req.headers.host ?? "").toLowerCase();
  const origin = String(req.headers.origin ?? "").toLowerCase();
  const site = req.headers["sec-fetch-site"];
  if (!host || (origin !== `http://${host}` && origin !== `https://${host}`) || (site !== undefined && site !== "same-origin")) {
    return new HostError(403, "the owner page's decisions come only from the Host's own page", "not_from_this_page");
  }
  const type = String(req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== "application/json") return new HostError(415, "a request that changes something must say content-type: application/json", "content_type_required");
  const sent = Buffer.from(String(req.headers[OWNER_HEADER] ?? ""));
  const want = Buffer.from(token);
  if (sent.length !== want.length || !timingSafeEqual(sent, want)) {
    return new HostError(403, "this browser does not hold the owner link; open the link the Host printed when it started", "owner_link_required");
  }
  return null;
}

/** The screenshot keeper as the routes use it: lookups for the page, the stored file for a picture, and a nudge after a write. */
export interface PagePictures extends PictureLookup {
  file(name: string): string | null;
  nudge(): void;
}

export interface PageRouteOptions {
  readonly host: AppHost;
  readonly ownerToken?: string;
  readonly pictures?: PagePictures;
  /** The Host-name rule of `refuseWhatABrowserCouldSend`, for every route here. Throws a HostError. */
  readonly checkHostName: (req: IncomingMessage) => void;
  /** The built client (web/dist); by default the one next to this source, read once. */
  readonly assets?: PageAssets;
}

let defaultAssets: PageAssets | undefined;

const MAX_BODY = 16 * 1024;

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HostError(413, "request body too large");
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString();
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch {
    throw new HostError(400, "request body must be a JSON object");
  }
}

const DONE = new Set(["live", "live_marked", "no", "back", "back_marked"]);

/**
 * Serve a request if it is one of the page's: `GET /`, `/app/<name>`, `/app/<name>/change/<id>`,
 * `/app/<name>/back/<version>`, `/pictures/<file>`, the built client under `/assets/`, and the page's writes
 * under `POST /owner/`.
 * Returns false for anything else, which the JSON API answers unchanged.
 */
export function servePage(req: IncomingMessage, res: ServerResponse, opts: PageRouteOptions): boolean {
  const url = new URL(req.url ?? "/", "http://host");
  const path = url.pathname;
  const method = req.method ?? "GET";
  const view = method === "GET" && (path === "/" || path.startsWith("/app/") || path.startsWith("/pictures/") || path.startsWith("/assets/"));
  const write = method === "POST" && path.startsWith("/owner/");
  if (!view && !write) return false;
  const answer = write ? ownerWrite(req, path, opts) : path.startsWith("/pictures/") ? picture(req, path, opts) : path.startsWith("/assets/") ? asset(req, path, opts) : page(req, url, opts);
  answer.then(
    ({ status, headers, body }) => res.writeHead(status, headers).end(body),
    (err: unknown) => {
      const status = err instanceof HostError ? err.status : 500;
      const message = err instanceof Error ? err.message : String(err);
      if (write) {
        const extra = err instanceof HostError ? { ...err.fields, ...(err.reason ? { reason: err.reason } : {}), ...(err.detail ? { detail: err.detail } : {}) } : {};
        res.writeHead(status, { "content-type": "application/json" }).end(`${JSON.stringify({ error: message, ...extra })}\n`);
      } else {
        res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" }).end(`the page could not be shown: ${message}\n`);
      }
    },
  );
  return true;
}

type Answer = { status: number; headers: Record<string, string>; body: string | Buffer };

async function page(req: IncomingMessage, url: URL, opts: PageRouteOptions): Promise<Answer> {
  opts.checkHostName(req);
  const { host } = opts;
  const nonce = randomBytes(16).toString("base64");
  const overview = await host.overview();
  const done = url.searchParams.get("done");
  const ctx: PageContext = {
    lang: chooseLang(url.searchParams.get("lang"), req.headers["accept-language"]),
    now: Date.now(),
    pictures: opts.pictures ?? NO_PICTURES,
    path: url.pathname,
    apps: overview.summaries,
    ...(done && DONE.has(done) ? { done: done as PageContext["done"] } : {}),
    governance: overview.governance,
    governanceNote: overview.governance_note,
    dataSnapshot: overview.data_snapshot,
    hostUrl: overview.host_url,
    consoleUrl: overview.console_url,
    autoApproved: host.autoApproved,
    ownerOff: !opts.ownerToken,
    ...(overview.manager ? { manager: overview.manager } : {}),
  };
  const assets = opts.assets ?? (defaultAssets ??= loadPageAssets());
  const html = (status: number, model: PageModel): Answer => ({ status, headers: pageHeaders(nonce), body: renderShell(model, nonce, assets) });
  if (url.pathname === "/") return html(200, homeModel(overview, ctx));
  const parts = url.pathname.split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return "";
    }
  });
  const name = parts[1] ?? "";
  // The directory name, as every command takes it; the summaries are keyed by it.
  const app = APP_NAME.test(name) ? overview.apps.find((a) => a.app_id === name) : undefined;
  if (!app) return html(404, missingModel(ctx));
  if ("error" in app) return html(200, unreadableModel(name, app.error, ctx));
  if (parts.length === 2) return html(200, appModel(name, app.status, app.history, ctx));
  if (parts.length === 4 && parts[2] === "change") return html(200, changeModel(name, app.status, parts[3]!, ctx));
  if (parts.length === 4 && parts[2] === "back") {
    const version = parts[3]!;
    let plan = null;
    try {
      plan = /^v\d+$/.test(version) ? host.undoPlan(name, version) : null;
    } catch (err) {
      if (!(err instanceof HostError || err instanceof ChangeRecordRefused)) throw err;
    }
    return html(200, backModel(name, app.status, app.history, version, plan, ctx));
  }
  return html(404, missingModel(ctx));
}

/** A file of the built client: only the names web/build.ts writes, each with its fixed type. */
async function asset(req: IncomingMessage, path: string, opts: PageRouteOptions): Promise<Answer> {
  opts.checkHostName(req);
  const name = path.slice("/assets/".length);
  if (name === "icon.svg") {
    return {
      status: 200,
      headers: { "content-type": "image/svg+xml", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox", "cache-control": "public, max-age=86400" },
      body: PAGE_ICON,
    };
  }
  const type = assetType(name);
  const assets = opts.assets ?? (defaultAssets ??= loadPageAssets());
  const file = join(assets.dir, name);
  if (!type || !existsSync(file)) return { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" }, body: "no such file\n" };
  return {
    status: 200,
    headers: {
      "content-type": type,
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
      // The page asks for app.js and app.css with their content's hash; fonts never change under one name.
      "cache-control": "public, max-age=31536000, immutable",
    },
    body: readFileSync(file),
  };
}

/** A stored picture: always image/jpeg, never sniffed, never run. */
async function picture(req: IncomingMessage, path: string, opts: PageRouteOptions): Promise<Answer> {
  opts.checkHostName(req);
  const file = opts.pictures?.file(path.slice("/pictures/".length));
  if (!file) return { status: 404, headers: { "content-type": "text/plain; charset=utf-8" }, body: "no such picture\n" };
  return {
    status: 200,
    headers: {
      "content-type": "image/jpeg",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-disposition": "inline",
      // A picture's name changes with every new picture, so a stored one never changes.
      "cache-control": "private, max-age=31536000, immutable",
    },
    body: readFileSync(file),
  };
}

/** The page's writes. Each takes the app's owner as the deciding subject and says in its entry that it came through the page. */
async function ownerWrite(req: IncomingMessage, path: string, opts: PageRouteOptions): Promise<Answer> {
  opts.checkHostName(req);
  const refused = refuseOwnerWrite(req, opts.ownerToken);
  if (refused) throw refused;
  const input = await readJson(req);
  const json = (value: unknown): Answer => ({ status: 200, headers: { "content-type": "application/json" }, body: `${JSON.stringify(value, null, 2)}\n` });
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 2 && parts[1] === "session") return json({ ok: true });
  const name = parts[2] ?? "";
  if (parts[1] !== "apps" || !APP_NAME.test(name)) throw new HostError(404, "not found");
  const { host } = opts;
  // The subject the app's governance takes as its owner: the same one `approve` in a terminal sends by default.
  const owner = (await host.status(name)).owner;
  const reason = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim().slice(0, 500) : undefined;
  let result: unknown;
  if (parts.length === 6 && parts[3] === "changes" && (parts[5] === "approve" || parts[5] === "deny")) {
    result = await host.resolve(name, parts[4]!, parts[5] === "approve" ? "approved" : "denied", owner, parts[5] === "deny" ? reason : undefined, PAGE_CHANNEL);
  } else if (parts.length === 6 && parts[3] === "changes" && parts[5] === "preview") {
    // Publish the checked draft again as a preview once the last one ended itself; nothing is decided by it.
    result = await host.preview(name, parts[4]!);
  } else if (parts.length === 4 && parts[3] === "undo") {
    if (typeof input.to !== "string" || !/^v\d+$/.test(input.to)) throw new HostError(400, "to must be a version name, e.g. v3");
    // Going back is tied to the plan the page showed: the version it started from comes with the click.
    if (typeof input.from !== "string" || !/^v\d+$/.test(input.from)) throw new HostError(400, "from must be the version the plan started from, e.g. v5");
    result = await host.undo(name, reason ?? "undo", {
      actor: owner,
      to: input.to,
      from: input.from,
      acceptOneWay: input.accept_one_way === true,
      subject: owner,
      channel: PAGE_CHANNEL,
    });
  } else {
    throw new HostError(404, "not found");
  }
  opts.pictures?.nudge();
  return json(result);
}
