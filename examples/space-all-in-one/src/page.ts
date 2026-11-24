import type { HistoryEntry } from "./artifact";
import type { AppStatus, AppSummary } from "./host";
import { HEAD_SCRIPT, SCRIPT, STYLE } from "./page-assets";
import { absoluteTime, agentWords, appTitle, fill, reasonWords, relativeTime, riskWords, WORDS, type Lang, type Words } from "./page-words";
import { previewAddress, type Picture, type PictureMiss } from "./screenshots";

// ---------------------------------------------------------------------------
// The owner page: what a person, not a developer, sees of the apps their agents
// built. Four views: my apps, one app with its history, a change waiting for
// them, and going back. No chat and no app creation: the agent lives elsewhere.
//
// Everything that came from the record or from an app (intents, agent names,
// reasons, file names, addresses) is written as text through `esc`; the agent
// can write those files. Technical terms stay under "Details". The page's own
// writes go through src/owner.ts and need the owner's link.
// ---------------------------------------------------------------------------

/** What `AppHost.overview()` returns: the summaries `GET /apps` returns, and per app what `status` and `history` return. */
export interface Overview {
  readonly governance: string;
  readonly governance_note: string;
  readonly data_snapshot: string | null;
  /** This Host's address as the person's machine reaches it, when known. */
  readonly host_url?: string;
  /** PneumaSpace's console as the person's machine reaches it, when known. */
  readonly console_url?: string;
  readonly summaries: readonly AppSummary[];
  /** `error` when the app could not be read. */
  readonly apps: readonly ({ readonly app_id: string; readonly status: AppStatus; readonly history: readonly HistoryEntry[] } | { readonly app_id: string; readonly error: string })[];
  readonly generated_at: string;
}

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text for HTML content and quoted attribute values. */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ENTITIES[ch]!);
}

/** Pictures the page can show: the screenshot keeper, or nothing. */
export interface PictureLookup {
  readonly enabled: boolean;
  latest(name: string): Picture | null;
  preview(name: string, changeId: string): Picture | null;
  miss(name: string, key: string): PictureMiss | null;
}

export const NO_PICTURES: PictureLookup = { enabled: false, latest: () => null, preview: () => null, miss: () => null };

/** What every view needs besides its own data. */
export interface PageContext {
  readonly lang: Lang;
  /** The response's CSP nonce: the page's own style and script carry it, nothing else can run. */
  readonly nonce: string;
  readonly now: number;
  readonly pictures: PictureLookup;
  /** The path being shown, for the language links. */
  readonly path: string;
  /** Every app, for the search palette. */
  readonly apps: readonly AppSummary[];
  /** Set after one of the page's own decisions went through: the view says so once. */
  readonly done?: "live" | "no" | "back";
  readonly governance?: string;
  readonly governanceNote?: string;
  readonly dataSnapshot?: string | null;
  readonly hostUrl?: string;
  readonly consoleUrl?: string;
  /** The risks the standing policy approves in this mode: a waiting change lists only the others as why it needs the owner. */
  readonly autoApproved?: readonly string[];
}

/** The headers every view is served with: only this response's own script and style run, nothing frames it, nothing leaks the address. */
export function pageHeaders(nonce: string): Record<string, string> {
  return {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self'; connect-src 'self'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cross-origin-opener-policy": "same-origin",
    "cache-control": "no-store",
  };
}

// --- small pieces ----------------------------------------------------------

/** Trusted markup, for a slot in a word. */
class Html {
  constructor(readonly html: string) {}
}
const markup = (html: string) => new Html(html);

/** A word with its slots filled: text escaped, markup kept. */
function say(template: string, vars: Readonly<Record<string, string | number | Html>> = {}): string {
  return template
    .split(/(\{\w+\})/)
    .map((part) => {
      const slot = /^\{(\w+)\}$/.exec(part)?.[1];
      if (!slot || !(slot in vars)) return esc(part);
      const value = vars[slot]!;
      return value instanceof Html ? value.html : esc(value);
    })
    .join("");
}

// The record and the waiting changes come from files an agent can write: any field may be missing or of another type.
const items = <T = unknown>(value: unknown): readonly T[] => (Array.isArray(value) ? (value as T[]) : []);
const str = (value: unknown): string => (typeof value === "string" ? value : value === undefined || value === null ? "" : String(value));
const list = (value: unknown, none = "—") => (items(value).length ? items(value).map(esc).join(", ") : esc(none));

function link(path: string, lang: Lang): string {
  return `${path}${path.includes("?") ? "&" : "?"}lang=${lang}`;
}

/** An address a person may open: http(s) only. */
function safeHref(url: unknown): string | null {
  try {
    const { protocol } = new URL(str(url));
    return protocol === "http:" || protocol === "https:" ? str(url) : null;
  } catch {
    return null;
  }
}

function time(ctx: PageContext, iso: unknown, mode: "rel" | "abs"): string {
  if (typeof iso !== "string" || Number.isNaN(Date.parse(iso))) return "";
  const text = mode === "rel" ? relativeTime(ctx.lang, iso, ctx.now) : absoluteTime(ctx.lang, iso);
  return `<time datetime="${esc(iso)}" data-${mode}>${esc(text)}</time>`;
}

function hue(name: string): number {
  let sum = 0;
  for (const ch of name) sum = (sum * 31 + ch.charCodeAt(0)) % 997;
  return sum % 8;
}

function initials(title: string): string {
  const words = title.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "?").slice(0, 1)).toUpperCase();
}

/** Typographic quotes around the person's own words. */
const quoted = (text: unknown) => `“${esc(str(text).trim())}”`;

const SVG = (body: string) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const ICON = {
  search: SVG('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  back: SVG('<path d="M15 18l-6-6 6-6"/>'),
  external: SVG('<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'),
  check: SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  alert: SVG('<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>'),
  clock: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  chat: SVG('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'),
  info: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>'),
  dot: SVG('<circle cx="12" cy="12" r="3"/>'),
  x: SVG('<path d="M7 7l10 10M17 7 7 17"/>'),
};

function json(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// --- the state of an app ---------------------------------------------------

export type AppState = "normal" | "waiting" | "not_live" | "uncertain" | "unpublished" | "unreadable";

/** One plain state per app, the most pressing first. */
export function appState(summary: AppSummary): AppState {
  if ("error" in summary) return "unreadable";
  if (items(summary.pending).length) return "waiting";
  if (summary.serving_uncertain) return "uncertain";
  if (summary.serves_other_version) return "not_live";
  if (!summary.active_version) return "unpublished";
  const last = summary.last_change;
  if (last && (last.outcome === "rejected" || last.outcome === "release_failed")) return "not_live";
  return "normal";
}

function stateWords(w: Words, state: AppState): string {
  return w[`state_${state}`];
}

function pill(w: Words, state: AppState): string {
  return `<span class="pill pill-${state}"><i></i>${esc(stateWords(w, state))}</span>`;
}

// --- pictures --------------------------------------------------------------

function shot(ctx: PageContext, name: string, picture: Picture | null, caption: string | null): string {
  const placeholder = `<div class="ph hue-${hue(name)}"><span class="ph-mark">${esc(initials(appTitle(name)))}</span><span class="ph-lines"><span></span><span></span></span>${caption ? `<span class="ph-cap">${esc(caption)}</span>` : ""}</div>`;
  const img = picture ? `<img src="/pictures/${esc(picture.file)}" alt="" decoding="async" width="1024" height="640">` : "";
  return `<div class="shot">${placeholder}${img}</div>`;
}

/** What the placeholder says: nothing when pictures are off, why there is none when the keeper tried. */
function caption(ctx: PageContext, name: string, key: string | null): string | null {
  if (!ctx.pictures.enabled) return null;
  const miss = key ? ctx.pictures.miss(name, key) : null;
  return miss?.reason === "needs_sign_in" ? WORDS[ctx.lang].no_picture_sign_in : WORDS[ctx.lang].no_picture;
}

function liveKey(summary: { serving_version?: string | null; active_version?: string | null }): string | null {
  return summary.serving_version ?? summary.active_version ?? null;
}

// --- the frame around every view ---------------------------------------------

function topBar(ctx: PageContext, back: boolean): string {
  const w = WORDS[ctx.lang];
  const langLink = (lang: Lang) =>
    `<a href="${esc(link(ctx.path, lang))}" data-lang="${lang}" aria-current="${ctx.lang === lang}" lang="${WORDS[lang].html_lang}">${esc(WORDS[lang].lang_name)}</a>`;
  return `<div class="top">
${back ? `<a class="back" href="${esc(link("/", ctx.lang))}">${ICON.back}${esc(w.my_apps)}</a>` : ""}
<div class="spacer"></div>
<button class="search-btn" type="button" data-search aria-label="${esc(w.search_label)}">${ICON.search}<span class="label">${esc(w.search)}</span><kbd data-kbd>⌘K</kbd></button>
<nav class="lang" aria-label="Language">${langLink("zh")}${langLink("en")}</nav>
<button class="owner" type="button" data-open="owner-help"><i></i><span class="no">${esc(w.owner_no)}</span><span class="yes">${esc(w.owner_yes)}</span></button>
</div>`;
}

function ownerDialog(ctx: PageContext): string {
  const w = WORDS[ctx.lang];
  const command = 'docker compose logs host | grep "owner link"';
  return `<dialog id="owner-help" aria-labelledby="owner-help-title"><div class="sheet">
<h2 id="owner-help-title">${esc(w.owner_help_title)}</h2>
<p>${esc(w.owner_help)}</p>
<div class="not-owner"><p>${esc(w.owner_how)}</p><div class="say"><q><code>${esc(command)}</code></q><button class="btn btn-small" type="button" data-copy="${esc(command)}">${esc(w.copy)}</button></div></div>
<div class="panel-actions"><button class="btn" type="button" data-close>${esc(w.close)}</button></div>
</div></dialog>`;
}

function palette(ctx: PageContext): string {
  const w = WORDS[ctx.lang];
  return `<dialog id="palette" class="palette" aria-label="${esc(w.search_label)}"><div class="palette-box">
<div class="palette-input">${ICON.search}<input type="text" placeholder="${esc(w.search_placeholder)}" aria-label="${esc(w.search_label)}" autocomplete="off" spellcheck="false"></div>
<ul role="listbox" aria-label="${esc(w.all_apps)}"></ul>
<p class="empty-line" hidden>${esc(w.search_empty)}</p>
<p class="keys">${esc(w.search_keys)}</p>
</div></dialog>`;
}

function searchData(ctx: PageContext): unknown[] {
  const w = WORDS[ctx.lang];
  return ctx.apps.map((summary) => {
    const name = summary.app_id;
    const words =
      "error" in summary
        ? ""
        : [...items<{ intent?: unknown }>(summary.pending).map((p) => str(p?.intent)), str(summary.last_change?.intent)]
            .filter(Boolean)
            .join(" · ")
            .slice(0, 200);
    return { n: name, t: appTitle(name), u: link(`/app/${name}`, ctx.lang), w: words, s: stateWords(w, appState(summary)), h: hue(name), i: initials(appTitle(name)) };
  });
}

function clientWords(lang: Lang): Record<string, unknown> {
  const w = WORDS[lang];
  const codes = ["verify_failed", "protected_file_changed", "outside_writable_roots", "no_change", "draft_changed_after_check", "base_changed", "invalid_manifest", "publish_failed", "published_unhealthy", "data_snapshot_failed", "record_failed", "agent_failed"];
  return {
    lang,
    locale: lang === "zh" ? "zh-CN" : "en",
    copied: w.copied,
    failed: w.failed,
    not_released: w.not_released,
    why_other: w.why_other,
    why: Object.fromEntries(codes.map((code) => [code, reasonWords(w, code)])),
  };
}

function doneNotice(ctx: PageContext): string {
  if (!ctx.done) return "";
  const w = WORDS[ctx.lang];
  const text = ctx.done === "live" ? w.done_live : ctx.done === "no" ? w.done_no : w.done_back;
  return `<div class="notice notice-ok toast" role="status">${ICON.check}<p>${esc(text)}</p></div>`;
}

function layout(ctx: PageContext, title: string, body: string, back: boolean): string {
  const w = WORDS[ctx.lang];
  return `<!doctype html>
<html lang="${w.html_lang}" data-owner="no">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="referrer" content="no-referrer">
<title>${esc(title)}</title>
<script nonce="${esc(ctx.nonce)}">${HEAD_SCRIPT}</script>
<style nonce="${esc(ctx.nonce)}">${STYLE}</style>
</head>
<body>
<div class="wrap">
${topBar(ctx, back)}
<div class="notice notice-bad" data-owner-lost hidden>${ICON.alert}<p>${esc(w.owner_lost)}</p></div>
${doneNotice(ctx)}
<main>
${body}
</main>
</div>
${ownerDialog(ctx)}
${palette(ctx)}
<script type="application/json" id="page-words">${json(clientWords(ctx.lang))}</script>
<script type="application/json" id="search-data">${json(searchData(ctx))}</script>
<script nonce="${esc(ctx.nonce)}">${SCRIPT}</script>
</body>
</html>
`;
}

/** One part of a view, or a line saying it could not be shown: one malformed record does not take the page down. */
function guarded(render: () => string, fallback: string): string {
  try {
    return render();
  } catch {
    return fallback;
  }
}

function details(w: Words, rows: readonly (readonly [string, string] | null | false | undefined)[], extra = ""): string {
  const shown = rows.filter((row): row is readonly [string, string] => Boolean(row && row[1]));
  return `<details class="more"><summary>${esc(w.details)}</summary>${shown.length ? `<dl class="kv">${shown.map(([dt, dd]) => `<dt>${esc(dt)}</dt><dd>${dd}</dd>`).join("")}</dl>` : ""}${extra}</details>`;
}

const cli = (args: string) => `<code>node .pneuma/pneuma.mjs ${esc(args)}</code>`;

// --- my apps ---------------------------------------------------------------

/** Who made the last change and when, for a card. `owner` reads as "you". */
function lastLine(ctx: PageContext, summary: Extract<AppSummary, { last_change: unknown }>, owner: string | undefined): string {
  const w = WORDS[ctx.lang];
  const last = summary.last_change;
  if (!last) return esc(w.never_changed);
  return `${say(w.updated, { when: markup(time(ctx, last.at, "rel")) })} · ${esc(agentWords(w, last.agent, owner))}`;
}

function card(ctx: PageContext, summary: AppSummary, owner?: string): string {
  const w = WORDS[ctx.lang];
  const name = summary.app_id;
  const title = appTitle(name);
  const href = link(`/app/${name}`, ctx.lang);
  if ("error" in summary) {
    return `<article class="card">
<a href="${esc(href)}" tabindex="-1" aria-hidden="true">${shot(ctx, name, null, null)}</a>
<div class="card-body"><h3 class="card-title"><a href="${esc(href)}">${esc(title)}</a></h3><p class="card-meta">${esc(w.unreadable_body)}</p><p class="card-state">${pill(w, "unreadable")}</p></div>
<div class="card-actions"><a class="btn btn-primary" href="${esc(href)}">${esc(w.open)}</a></div>
</article>`;
  }
  const state = appState(summary);
  const first = items<{ change_id?: unknown }>(summary.pending)[0];
  const primary =
    state === "waiting" && first
      ? `<a class="btn btn-primary" href="${esc(link(`/app/${name}/change/${encodeURIComponent(str(first.change_id))}`, ctx.lang))}">${esc(w.review)}</a>`
      : `<a class="btn btn-primary" href="${esc(href)}">${esc(w.open)}</a>`;
  const address = safeHref(summary.address);
  return `<article class="card">
<a href="${esc(href)}" tabindex="-1" aria-hidden="true">${shot(ctx, name, ctx.pictures.latest(name), caption(ctx, name, liveKey(summary)))}</a>
<div class="card-body">
<h3 class="card-title"><a href="${esc(href)}">${esc(title)}</a></h3>
<p class="card-meta">${lastLine(ctx, summary, owner)}</p>
<p class="card-state">${pill(w, state)}</p>
</div>
<div class="card-actions">${primary}${address ? `<a class="btn btn-icon" href="${esc(address)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(w.open_new)}" title="${esc(w.open_new)}">${ICON.external}</a>` : ""}</div>
</article>`;
}

function waitingRows(ctx: PageContext, summaries: readonly AppSummary[]): string {
  const w = WORDS[ctx.lang];
  const rows = summaries.flatMap((summary) => ("error" in summary ? [] : items<Record<string, unknown>>(summary.pending).map((pending) => ({ summary, pending }))));
  if (!rows.length) return "";
  const html = rows
    .map(({ summary, pending }) =>
      guarded(() => {
        const name = summary.app_id;
        const href = link(`/app/${name}/change/${encodeURIComponent(str(pending.change_id))}`, ctx.lang);
        return `<div class="wait-row">
<a href="${esc(href)}" tabindex="-1" aria-hidden="true">${shot(ctx, name, ctx.pictures.latest(name), null)}</a>
<div>
<p class="wait-app">${esc(appTitle(name))}${pending.one_way ? ` <span class="chip-oneway">${esc(w.one_way)}</span>` : ""}</p>
<p class="wait-intent">${quoted(pending.intent)}</p>
<p class="wait-meta">${say(w.by_on, { who: agentWords(w, pending.agent, undefined), when: markup(time(ctx, pending.created_at, "rel")) })}</p>
</div>
<a class="btn btn-primary" href="${esc(href)}">${esc(w.review)}</a>
</div>`;
      }, ""),
    )
    .join("\n");
  return `<section aria-labelledby="waiting-title"><h2 class="section-title" id="waiting-title">${esc(w.waiting_title)} <span class="count">${rows.length}</span></h2><div class="waiting">${html}</div></section>`;
}

function hint(ctx: PageContext, body: string, example: string): string {
  const w = WORDS[ctx.lang];
  return `<aside class="hint"><span class="hint-icon">${ICON.chat}</span><div class="grow">
<h2>${esc(w.hint_title)}</h2>
<p>${esc(body)}</p>
<div class="say"><q>${esc(example)}</q><button class="btn btn-small" type="button" data-copy="${esc(example)}">${esc(w.copy)}</button></div>
</div></aside>`;
}

function about(ctx: PageContext): string {
  const w = WORDS[ctx.lang];
  const host = safeHref(ctx.hostUrl);
  const console = safeHref(ctx.consoleUrl);
  return `<footer class="about">${details(w, [
    [w.d_governance, `${esc(ctx.governance)}: ${esc(ctx.governanceNote)}`],
    [w.d_snapshot, ctx.dataSnapshot ? esc(ctx.dataSnapshot) : esc(w.d_none)],
    [w.d_pictures, esc(ctx.pictures.enabled ? w.d_pictures_on : w.d_pictures_off)],
    host ? [w.d_host, `<a href="${esc(host)}">${esc(host)}</a>`] : null,
    console ? [w.d_console, `<a href="${esc(console)}" target="_blank" rel="noopener noreferrer">${esc(console)}</a><br>${esc(w.d_console_warn)}`] : null,
    [w.d_terminal, `${cli("list")}<br>${cli("status <name>")} · ${cli("history <name>")}`],
  ])}</footer>`;
}

export function renderHome(overview: Overview, ctx: PageContext): string {
  const w = WORDS[ctx.lang];
  const summaries = overview.summaries;
  const lastAt = (summary: AppSummary) => ("error" in summary ? "" : str(summary.last_change?.at));
  const sorted = [...summaries].sort((a, b) => ("error" in a ? 1 : 0) - ("error" in b ? 1 : 0) || lastAt(b).localeCompare(lastAt(a)) || a.app_id.localeCompare(b.app_id));
  const count = summaries.length === 1 ? w.apps_one : fill(w.apps_other, { n: summaries.length });
  const owners = new Map(overview.apps.flatMap((app) => ("status" in app ? [[app.app_id, app.status.owner] as const] : [])));
  const grid = summaries.length
    ? `<div class="grid">${sorted.map((summary) => guarded(() => card(ctx, summary, owners.get(summary.app_id)), "")).join("\n")}</div>`
    : `<div class="empty"><h2>${esc(w.empty_title)}</h2><p>${esc(w.empty_body)}</p></div>`;
  const body = `<div class="head"><div class="grow"><h1>${esc(w.title_home)}</h1><p class="sub">${esc(w.tagline)}</p></div></div>
${waitingRows(ctx, summaries)}
<section aria-labelledby="apps-title"><h2 class="section-title" id="apps-title">${esc(w.all_apps)} <span class="count">${esc(count)}</span></h2>${grid}</section>
${hint(ctx, w.hint_body, w.hint_new)}
${about(ctx)}`;
  return layout(ctx, w.title_home, body, false);
}

// --- the history, as a person would tell it ------------------------------------

type ItemKind = "created" | "change" | "waiting" | "stale" | "denied" | "rejected" | "not_live" | "undo" | "undo_failed" | "release" | "snapshot" | "other";

export interface TimelineItem {
  readonly id: string;
  /** Every entry this item tells, in record order: a change, the owner's decision on it, the data snapshot before it. */
  readonly entries: readonly HistoryEntry[];
  /** The entry that settled it. */
  readonly main: HistoryEntry;
  readonly kind: ItemKind;
  /** The version this item made, or an undo landed on. */
  readonly version: string | null;
  readonly oneWay: { readonly reason: string; readonly destructive: boolean } | null;
  readonly snapshot: boolean;
  /** Position of `main` in the history: items are told newest first by it. */
  readonly order: number;
}

const DEFAULT_CREATE_INTENT = "Create the app from the PneumaSpace template";
const VERSIONED: readonly ItemKind[] = ["created", "change", "release", "not_live"];

function oneWayReason(entry: HistoryEntry): string | null {
  const value = (entry as { one_way?: unknown }).one_way;
  if (!value) return null;
  if (typeof value === "object") return str((value as { reason?: unknown }).reason) || "one-way";
  return str(value);
}

/**
 * The history grouped into what a person would call one event: a change and the owner's decision on it are one
 * item, a data snapshot belongs to the change it was taken for, and a later one-way declaration marks its version.
 */
export function timeline(history: readonly HistoryEntry[], pendingIds: ReadonlySet<string>): TimelineItem[] {
  const groups = new Map<string, { entries: HistoryEntry[]; indexes: number[] }>();
  const declarations: HistoryEntry[] = [];
  history.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    if (entry.kind === "declaration") return void declarations.push(entry);
    const forChange = (entry as { for_change?: unknown }).for_change;
    const key = entry.kind === "snapshot" && typeof forChange === "string" ? forChange : typeof entry.change_id === "string" && entry.change_id ? entry.change_id : `#${index}`;
    const group = groups.get(key) ?? { entries: [], indexes: [] };
    group.entries.push(entry);
    group.indexes.push(index);
    groups.set(key, group);
  });
  const out: TimelineItem[] = [];
  for (const [id, { entries, indexes }] of groups) {
    let at = entries.length - 1;
    while (at > 0 && entries[at]!.kind === "snapshot") at--;
    const main = entries[at]!;
    const kind: ItemKind =
      main.kind === "snapshot"
        ? "snapshot"
        : main.kind === "restore"
          ? main.outcome === "rolled_back"
            ? "undo"
            : "undo_failed"
          : main.kind === "release"
            ? main.outcome === "published"
              ? "release"
              : "rejected"
            : main.outcome === "published"
              ? main.kind === "create"
                ? "created"
                : "change"
              : main.outcome === "needs_approval"
                ? pendingIds.has(id)
                  ? "waiting"
                  : "stale"
                : main.outcome === "denied"
                  ? "denied"
                  : main.outcome === "rejected"
                    ? "rejected"
                    : main.outcome === "release_failed"
                      ? "not_live"
                      : "other";
    const version = typeof main.version === "string" && (VERSIONED.includes(kind) || kind === "undo") ? main.version : null;
    const reasons = entries.map(oneWayReason).filter((reason): reason is string => Boolean(reason));
    if (version && VERSIONED.includes(kind)) {
      for (const declaration of declarations) if (declaration.version === version) reasons.push(oneWayReason(declaration) ?? "");
    }
    const destructive = entries.some((entry) => items(entry.risks).includes("destructive_definition"));
    out.push({
      id,
      entries,
      main,
      kind,
      version,
      oneWay: reasons.length && kind !== "undo" && kind !== "undo_failed" ? { reason: reasons.find(Boolean) ?? "", destructive } : null,
      snapshot: entries.some((entry) => entry.kind === "snapshot"),
      order: indexes[at]!,
    });
  }
  return out.sort((a, b) => b.order - a.order);
}

/** The version `version` was built on, by the rule undo follows (src/host.ts `builtOn`). */
function builtOn(history: readonly HistoryEntry[], version: string): string | null {
  const base = history.find((entry) => entry?.version === version && entry.kind !== "restore")?.base_version;
  return typeof base === "string" ? base : null;
}

/** `version` and every version it was built on, newest first: the versions undo can go back to. */
export function lineage(history: readonly HistoryEntry[], version: string | null): string[] {
  const out: string[] = [];
  for (let at = version; at && !out.includes(at); at = builtOn(history, at)) out.push(at);
  return out;
}

/** A version named the way the person would: the words of the change that made it, or "how the app first was". */
function versionLabel(w: Words, history: readonly HistoryEntry[], version: string): Html | null {
  const creator = history.find((entry) => entry?.version === version && entry.kind !== "restore");
  if (!creator) return null;
  const intent = str(creator.intent);
  return markup(creator.kind === "create" && (!intent || intent === DEFAULT_CREATE_INTENT) ? esc(w.first_version) : quoted(intent));
}

/** When a version was first recorded. */
function madeAt(history: readonly HistoryEntry[], version: string): string | undefined {
  return history.find((entry) => entry?.version === version && entry.kind !== "restore")?.at;
}

/** What stood behind a change that went live, from its guarantees and its approval. */
function standing(w: Words, entry: HistoryEntry, owner: string): { text: string; tone: "ok" | "plain" } {
  const guarantees = items<string>(entry.guarantees);
  if (!guarantees.length) return { text: w.live_no_checks, tone: "plain" };
  const checked = guarantees.includes("verified");
  const tried = guarantees.includes("previewed");
  const parts = [checked && tried ? w.checked_tried : checked ? w.checked : tried ? w.tried : w.not_checked];
  if (guarantees.includes("approved")) {
    const by = items<string>(entry.approval?.by);
    if (by.includes(owner) || by.some((subject) => String(subject).startsWith("user:"))) parts.push(w.you_confirmed);
    else if (by.includes("policy:auto")) parts.push(w.auto_approved);
    else if (by.length) parts.push(fill(w.approved_by, { who: by.join(", ") }));
  }
  return { text: parts.join(" · "), tone: "ok" };
}

function checkedPart(w: Words, entry: HistoryEntry): string {
  const guarantees = items<string>(entry.guarantees);
  const checked = guarantees.includes("verified");
  const tried = guarantees.includes("previewed");
  return checked && tried ? w.checked_tried : checked ? w.checked : tried ? w.tried : w.not_checked;
}

interface Marks {
  readonly live: string | null;
  readonly savedNotLive: string | null;
  readonly goBack: ReadonlySet<string>;
  readonly undone: ReadonlySet<string>;
}

/** Which item gets "Running now", "Go back to this", "Undone": the newest item that made each version. */
function marks(items: readonly TimelineItem[], history: readonly HistoryEntry[], status: AppStatus): Marks {
  const serving = status.serving_uncertain ? null : (status.serving_version ?? status.active_version);
  const current = status.active_version;
  const line = new Set(lineage(history, current));
  const newest = new Map<string, string>();
  for (const item of items) if (item.version && VERSIONED.includes(item.kind) && !newest.has(item.version)) newest.set(item.version, item.id);
  const goBack = new Set<string>();
  const undone = new Set<string>();
  for (const [version, id] of newest) {
    if (line.has(version) && version !== current) goBack.add(id);
    if (!line.has(version) && version !== serving) undone.add(id);
  }
  return {
    live: serving ? (newest.get(serving) ?? null) : null,
    savedNotLive: current && current !== serving ? (newest.get(current) ?? null) : null,
    goBack,
    undone,
  };
}

function itemTitle(ctx: PageContext, item: TimelineItem, history: readonly HistoryEntry[]): string {
  const w = WORDS[ctx.lang];
  const intent = str(item.main.intent || item.entries[0]?.intent);
  switch (item.kind) {
    case "created":
      return intent && intent !== DEFAULT_CREATE_INTENT ? quoted(intent) : esc(w.item_created);
    case "undo":
    case "undo_failed": {
      const target = item.kind === "undo" ? item.version : str((item.main as { target_version?: unknown }).target_version);
      const label = target ? versionLabel(w, history, target) : null;
      if (!label) return esc(w.item_undo_version);
      return say(item.kind === "undo" ? w.item_undo : w.item_undo_failed, { version: label });
    }
    case "snapshot":
      return esc(w.item_snapshot);
    default:
      return intent ? quoted(intent) : esc(w.item_created);
  }
}

/** The line under an item saying what stood behind it, as markup (every value in it escaped). */
function itemStanding(ctx: PageContext, item: TimelineItem, owner: string, history: readonly HistoryEntry[]): { html: string; tone: "ok" | "warn" | "bad" | "plain" } | null {
  const w = WORDS[ctx.lang];
  const main = item.main;
  const plain = (text: string, tone: "ok" | "warn" | "bad" | "plain") => ({ html: esc(text), tone });
  switch (item.kind) {
    case "created":
    case "change":
    case "release": {
      const { text, tone } = standing(w, main, owner);
      return plain(text, tone);
    }
    case "waiting":
      return plain(`${checkedPart(w, main)} · ${w.waiting_for_you}`, "warn");
    case "stale":
      return plain(w.no_decision, "plain");
    case "denied":
      return plain(w.said_no, "plain");
    case "rejected":
      return plain(fill(w.did_not_go_live, { why: reasonWords(w, main.reason, main.checks) }), "bad");
    case "not_live":
      return plain(fill(w.saved_did_not_go_live, { why: reasonWords(w, main.reason, main.checks) }), "bad");
    case "undo_failed":
      return plain(fill(w.undo_failed_why, { why: reasonWords(w, main.reason, main.checks) }), "bad");
    case "undo": {
      const crossed = (main as { one_way_crossed?: { by?: unknown; data_ref?: { ref?: unknown } } }).one_way_crossed;
      if (crossed?.by !== "data_restored") return plain(w.data_kept, "plain");
      const ref = str(crossed.data_ref?.ref);
      const saved = ref ? history.find((entry) => str(entry?.data_ref?.ref) === ref)?.at : undefined;
      return saved ? { html: say(w.data_back, { when: markup(time(ctx, saved, "abs")) }), tone: "plain" } : plain(w.data_back_undated, "plain");
    }
    default:
      return null;
  }
}

function itemDetails(ctx: PageContext, item: TimelineItem, name: string, goBack: boolean): string {
  const w = WORDS[ctx.lang];
  const main = item.main;
  const tests = items<{ id?: unknown; status?: unknown; coverage?: { note?: unknown } }>(main.checks).find((check) => check?.id === "npm-test");
  const snapshot = item.entries.find((entry) => entry.kind === "snapshot")?.data_ref;
  const approval = main.approval as { reason_code?: unknown; by?: unknown; preset?: unknown } | undefined;
  const candidates = items<{ agent?: unknown; markers?: unknown }>(main.agent_candidates);
  return details(w, [
    item.version ? [w.d_version, `${esc(item.version)}${main.base_version ? ` ← ${esc(main.base_version)}` : ""}`] : null,
    [w.d_change, esc(main.change_id)],
    [w.d_outcome, `${esc(main.kind)} ${esc(main.outcome)}`],
    [
      w.d_agent,
      `${esc(main.agent)}${main.agent_source ? ` (${esc(main.agent_source)})` : ""}${candidates.length ? `: ${candidates.map((c) => `${esc(c?.agent)} ${list(c?.markers)}`).join("; ")}` : ""}`,
    ],
    main.kind !== "snapshot" ? [w.d_guarantees, items(main.guarantees).length ? list(main.guarantees) : esc(w.d_recorded_only)] : null,
    items(main.risks).length ? [w.d_risks, list(main.risks)] : null,
    approval ? [w.d_approval, `${esc(approval.reason_code)} · ${list(approval.by)}${approval.preset ? ` (${esc(approval.preset)})` : ""}`] : null,
    items(main.changed_paths).length ? [w.d_files, list(main.changed_paths)] : null,
    tests?.coverage ? [w.d_tests, `${esc(tests.status)}: ${esc(tests.coverage.note)}`] : null,
    item.oneWay ? [w.d_one_way, esc(item.oneWay.reason)] : null,
    snapshot ? [w.d_data, `${esc(snapshot.capability)} ${esc(snapshot.ref)}`] : null,
    main.reason ? [w.d_reason, esc(main.reason)] : null,
    main.address_note ? [w.d_address, esc(main.address_note)] : null,
    main.set_aside ? [w.d_note, esc(main.set_aside)] : null,
    main.note ? [w.d_note, esc(main.note)] : null,
    main.channel ? [w.d_channel, esc(main.channel)] : null,
    goBack && item.version ? [w.d_terminal, cli(`undo --to ${item.version} "<why>" --app ${name}`)] : null,
  ]);
}

function renderItem(ctx: PageContext, item: TimelineItem, name: string, status: AppStatus, history: readonly HistoryEntry[], m: Marks): string {
  const w = WORDS[ctx.lang];
  const main = item.main;
  const isLive = m.live === item.id;
  const canGoBack = m.goBack.has(item.id);
  const classes = ["item", isLive ? "is-live" : "", item.kind === "waiting" ? "is-wait" : "", ["rejected", "not_live", "undo_failed"].includes(item.kind) ? "is-bad" : ""].filter(Boolean).join(" ");
  const badge = isLive
    ? `<span class="badge badge-live">${esc(w.running_now)}</span>`
    : m.savedNotLive === item.id
      ? `<span class="badge badge-idle">${esc(w.saved_not_live)}</span>`
      : m.undone.has(item.id)
        ? `<span class="badge badge-idle">${esc(w.undone_later)}</span>`
        : "";
  const who = agentWords(w, main.agent, status.owner);
  const stand = itemStanding(ctx, item, status.owner, history);
  const icon = stand?.tone === "bad" ? ICON.x : stand?.tone === "warn" ? ICON.clock : stand?.tone === "plain" ? ICON.dot : ICON.check;
  const undoReason = item.kind === "undo" || item.kind === "undo_failed" ? str(main.intent) : "";
  const oneWay = item.oneWay
    ? `<div class="item-oneway"><strong>${ICON.alert}${esc(w.one_way)}</strong><p>${esc(item.oneWay.destructive ? w.one_way_destructive : w.one_way_other)}</p>${item.oneWay.reason ? `<p class="why">${esc(fill(w.one_way_why, { why: item.oneWay.reason }))}</p>` : ""}</div>`
    : "";
  const actions = [
    item.kind === "waiting" ? `<a class="btn btn-primary btn-small" href="${esc(link(`/app/${name}/change/${encodeURIComponent(item.id)}`, ctx.lang))}">${esc(w.review)}</a>` : "",
    canGoBack && item.version ? `<a class="btn btn-small" href="${esc(link(`/app/${name}/back/${encodeURIComponent(item.version)}`, ctx.lang))}">${esc(w.go_back)}</a>` : "",
  ].join("");
  return `<li class="${classes}"><span class="dot"></span>
<div class="item-top"><p class="item-title">${itemTitle(ctx, item, history)}</p>${badge}</div>
<p class="item-meta">${say(w.by_on, { who, when: markup(time(ctx, main.at, "rel")) })}${undoReason && undoReason !== "undo" ? ` · ${quoted(undoReason)}` : ""}</p>
${stand ? `<p class="item-standing ${stand.tone}">${icon}<span>${stand.html}</span></p>` : ""}
${item.snapshot && item.kind !== "snapshot" ? `<p class="item-standing plain">${ICON.dot}<span>${esc(w.snapshot_saved)}</span></p>` : ""}
${oneWay}
${actions ? `<div class="item-actions">${actions}</div>` : ""}
${itemDetails(ctx, item, name, canGoBack)}
</li>`;
}

function history(ctx: PageContext, name: string, status: AppStatus, entries: readonly HistoryEntry[]): string {
  const w = WORDS[ctx.lang];
  const pendingIds = new Set(items<{ change_id?: unknown }>(status.pending).map((p) => str(p?.change_id)));
  let all: TimelineItem[];
  try {
    all = timeline(entries, pendingIds);
  } catch {
    return `<p class="muted">${esc(w.item_unreadable)}</p>`;
  }
  const m = marks(all, entries, status);
  const rendered = all.map((item) => guarded(() => renderItem(ctx, item, name, status, entries, m), `<li class="item"><span class="dot"></span><p class="muted">${esc(w.item_unreadable)}</p></li>`));
  const first = rendered.slice(0, 8).join("\n");
  const rest = rendered.slice(8);
  return `<ol class="timeline">${first}</ol>${rest.length ? `<details class="earlier"><summary>${esc(fill(w.show_earlier, { n: rest.length }))}</summary><ol class="timeline">${rest.join("\n")}</ol></details>` : ""}`;
}

// --- one app ---------------------------------------------------------------

export function renderApp(name: string, status: AppStatus, entries: readonly HistoryEntry[], ctx: PageContext): string {
  const w = WORDS[ctx.lang];
  const title = appTitle(name);
  const summary = ctx.apps.find((app) => app.app_id === name);
  const state = summary ? appState(summary) : "normal";
  const address = safeHref(status.address);
  const picture = ctx.pictures.latest(name);
  const last = summary && !("error" in summary) ? summary.last_change : null;
  const pending = items<Record<string, unknown>>(status.pending);
  const uncommitted = items<string>(status.uncommitted);
  const waiting = pending
    .map(
      (p) => `<div class="notice notice-wait">${ICON.clock}<div class="grow"><p><strong>${esc(w.state_waiting)}</strong></p><p class="quote">${quoted(p.intent)}</p></div><a class="btn btn-primary btn-small" href="${esc(link(`/app/${name}/change/${encodeURIComponent(str(p.change_id))}`, ctx.lang))}">${esc(w.review)}</a></div>`,
    )
    .join("");
  const body = `<div class="app-head">
<h1>${esc(title)}</h1>${pill(w, state)}<span class="grow"></span>
${address ? `<a class="btn btn-primary" href="${esc(address)}" target="_blank" rel="noopener noreferrer">${esc(w.open_app)}${ICON.external}</a>` : ""}
<p class="meta">${last ? say(w.updated, { when: markup(time(ctx, last.at, "rel")) }) : esc(w.never_changed)}</p>
</div>
<div class="layout">
<div>
<div class="frame">
<div class="frame-bar"><span class="addr">${esc(status.address)}</span>${address ? `<a href="${esc(address)}" target="_blank" rel="noopener noreferrer">${esc(w.open_new)}</a>` : ""}</div>
${address ? `<a href="${esc(address)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(w.open_new)}">` : ""}${shot(ctx, name, picture, caption(ctx, name, liveKey(status)))}${address ? "</a>" : ""}
</div>
${picture ? `<p class="faint under">${say(picture.key === liveKey(status) ? w.picture_taken : w.picture_older, { when: markup(time(ctx, picture.at, "rel")) })}</p>` : ""}
${status.serving_uncertain ? `<div class="notice notice-bad under">${ICON.alert}<p>${esc(w.uncertain_body)}</p></div>` : status.serving_version && status.active_version && status.serving_version !== status.active_version ? `<div class="notice notice-bad under">${ICON.alert}<p>${esc(w.serves_other_body)}</p></div>` : ""}
${uncommitted.length ? `<div class="notice under">${ICON.info}<p>${esc(uncommitted.length === 1 ? w.working_here_one : fill(w.working_here_other, { n: uncommitted.length }))}</p></div>` : ""}
${hint(ctx, w.hint_app_body, fill(w.hint_app, { name }))}
${details(w, [
  [w.d_current, esc(status.active_version ?? w.d_none)],
  [w.d_serving, status.serving_uncertain ? esc(status.serving_uncertain) : esc(status.serving_version ?? w.d_none)],
  [w.d_previous, esc(status.previous_version ?? w.d_none)],
  [w.d_owner, esc(status.owner)],
  [w.d_address, address ? `<a href="${esc(address)}" target="_blank" rel="noopener noreferrer">${esc(address)}</a>` : esc(status.address)],
  uncommitted.length ? [w.d_uncommitted, list(uncommitted)] : null,
  [w.d_governance, `${esc(status.governance)}: ${esc(status.governance_note)}`],
  [w.d_terminal, `${cli(`status ${name}`)} · ${cli(`history ${name}`)}`],
])}
</div>
<aside class="side" aria-labelledby="history-title">
<h2 id="history-title">${esc(w.history_title)}</h2>
${waiting ? `<div class="under">${waiting}</div>` : ""}
${history(ctx, name, status, entries)}
</aside>
</div>`;
  return layout(ctx, title, body, true);
}

/** An app the Host could not read: its name, the plain state, and the error under Details. */
export function renderUnreadable(name: string, error: string, ctx: PageContext): string {
  const w = WORDS[ctx.lang];
  const body = `<div class="app-head"><h1>${esc(appTitle(name))}</h1>${pill(w, "unreadable")}</div>
<div class="panel"><p>${esc(w.unreadable_body)}</p>${details(w, [[w.d_error, esc(error)]])}</div>`;
  return layout(ctx, appTitle(name), body, true);
}

export function renderMissing(ctx: PageContext, message?: string): string {
  const w = WORDS[ctx.lang];
  return layout(ctx, w.not_found, `<div class="confirm-page"><div class="panel"><h1>${esc(message ?? w.not_found)}</h1><div class="panel-actions"><a class="btn btn-primary" href="${esc(link("/", ctx.lang))}">${esc(w.my_apps)}</a></div></div></div>`, true);
}

// --- a change waiting for the owner ------------------------------------------

/** A preview address the page may link to: an app on the same runtime as the app itself. The value comes from a file the agent can write. */
function previewHref(appAddress: string, pending: unknown): string | null {
  const address = previewAddress(pending);
  if (!address) return null;
  try {
    const app = new URL(appAddress);
    const preview = new URL(address);
    return preview.origin === app.origin && preview.pathname.startsWith(app.pathname.replace(/[^/]+\/$/, "")) && !preview.username ? preview.href : null;
  } catch {
    return null;
  }
}

export function renderChange(name: string, status: AppStatus, changeId: string, ctx: PageContext): string {
  const w = WORDS[ctx.lang];
  const title = appTitle(name);
  const pending = items<Record<string, any>>(status.pending).find((p) => str(p?.change_id) === changeId);
  if (!pending) {
    return layout(
      ctx,
      title,
      `<div class="confirm-page"><div class="panel"><h1>${esc(w.change_gone)}</h1><div class="panel-actions"><a class="btn btn-primary" href="${esc(link(`/app/${name}`, ctx.lang))}">${esc(title)}</a></div></div></div>`,
      true,
    );
  }
  const address = safeHref(status.address);
  const preview = previewHref(status.address, pending);
  const previewPicture = ctx.pictures.preview(name, changeId);
  const checks = items<{ id?: unknown; status?: unknown; coverage?: { tests?: unknown; app_tests?: unknown } }>(pending.checks);
  const tests = checks.find((check) => check?.id === "npm-test");
  const previewCheck = checks.find((check) => check?.id === "space-preview");
  const risks = items<string>(pending.risks);
  const paths = items<string>(pending.changed_paths);
  const oneWay = typeof pending.one_way === "string" && pending.one_way ? pending.one_way : null;
  const snapshotHost = Boolean(status.data_snapshot);
  const decideUrl = (verb: string) => `/owner/apps/${name}/changes/${encodeURIComponent(changeId)}/${verb}`;
  const backTo = (done: string) => link(`/app/${name}?done=${done}`, ctx.lang);

  const checked: { text: string; caution?: true }[] = [];
  if (tests?.status === "passed") {
    const n = tests.coverage?.tests;
    const own = tests.coverage?.app_tests;
    checked.push({ text: typeof n === "number" && typeof own === "number" ? fill(w.tests_passed, { n, own }) : w.tests_passed_plain });
    if (own === 0) checked.push({ text: w.tests_none_own, caution: true });
  }
  if (previewCheck?.status === "passed") checked.push({ text: w.started_in_preview });
  checked.push({ text: paths.length === 1 ? w.files_one : fill(w.files_other, { n: paths.length }) });
  // Only what the standing policy could not approve is why the change waits; in review-all mode that is every risk.
  const auto = new Set(ctx.autoApproved ?? []);
  const why = [...new Set(risks.filter((risk) => !auto.has(risk)).map((risk) => riskWords(w, risk)))];
  if (status.governance === "review-all") why.push(w.review_all);

  const afterBox = previewPicture
    ? shot(ctx, name, previewPicture, null)
    : `<div class="shot"><div class="gone">${previewCheck?.status === "passed" ? `${ICON.check}<p>${esc(preview ? w.no_picture : w.preview_passed)}</p>` : `${ICON.info}<p>${esc(w.no_preview)}</p>`}</div></div>`;

  const signInDropped = risks.includes("policy_change");
  const confirmLines = [fill(w.confirm_who, { app: title }), ...(signInDropped ? [w.confirm_sign_in] : []), ...(oneWay ? [] : [w.confirm_back])];
  const body = `<div class="review-head">
<p class="eyebrow">${pill(w, "waiting")} <a href="${esc(link(`/app/${name}`, ctx.lang))}">${esc(title)}</a></p>
<h1>${quoted(pending.intent)}</h1>
<p class="meta">${say(w.made_by, { who: agentWords(w, pending.agent, status.owner), when: markup(time(ctx, pending.created_at, "rel")) })}</p>
</div>
<div class="compare">
<div><div class="label"><span>${esc(w.now)}</span>${address ? `<a class="btn btn-small" href="${esc(address)}" target="_blank" rel="noopener noreferrer">${esc(w.open)}${ICON.external}</a>` : ""}</div>
<div class="frame">${shot(ctx, name, ctx.pictures.latest(name), caption(ctx, name, liveKey(status)))}</div></div>
<div><div class="label"><span>${esc(w.after)}</span>${preview ? `<a class="btn btn-small" href="${esc(preview)}" target="_blank" rel="noopener noreferrer">${esc(w.open)}${ICON.external}</a>` : ""}</div>
<div class="frame">${afterBox}</div></div>
</div>
<div class="facts">
<div class="fact"><h2>${esc(w.checked_title)}</h2><ul>${checked.map((line) => `<li class="${line.caution ? "caution" : ""}">${line.caution ? ICON.info : ICON.check}<span>${esc(line.text)}</span></li>`).join("")}</ul></div>
<div class="fact why"><h2>${esc(w.why_title)}</h2><ul>${(why.length ? why : [w.risk_other]).map((line) => `<li>${ICON.alert}<span>${esc(line)}</span></li>`).join("")}</ul></div>
</div>
${oneWay ? `<div class="oneway-box"><h2>${ICON.alert}${esc(w.one_way_title)}</h2><p>${esc(snapshotHost ? w.one_way_with_snapshot : w.one_way_no_snapshot)}</p></div>` : ""}
<div class="decide">
<p class="grow not-owner">${esc(w.read_only_decide)}</p>
<p class="grow owner-only">${esc(w.decide_lead)}</p>
<button class="btn owner-only" type="button" data-open="confirm-deny">${esc(w.deny)}</button>
<button class="btn btn-primary owner-only" type="button" data-open="confirm-approve">${esc(w.approve)}</button>
</div>
${details(w, [
  [w.d_change, esc(changeId)],
  [w.d_risks, list(risks)],
  [w.d_disclosure, `<ul>${items(pending.disclosure).map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`],
  [w.d_files, list(paths)],
  [w.d_tests, checks.map((check) => `${esc(check?.id)} ${esc(check?.status)}`).join(", ")],
  oneWay ? [w.d_one_way, esc(oneWay)] : null,
  preview ? [w.d_preview, esc(preview)] : null,
  [w.d_agent, `${esc(pending.agent)}${pending.agent_provenance?.source ? ` (${esc(pending.agent_provenance.source)})` : ""}`],
  [w.d_terminal, `${cli(`approve ${changeId} --app ${name}`)}<br>${cli(`deny ${changeId} --app ${name}`)}`],
])}
<dialog id="confirm-approve" aria-labelledby="confirm-approve-title"><div class="sheet" data-act-scope>
<h2 id="confirm-approve-title">${esc(w.confirm_title)}</h2>
<ul>${confirmLines.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
${oneWay ? `<p class="consequence">${esc(snapshotHost ? w.one_way_with_snapshot : w.one_way_no_snapshot)}</p><label class="check"><input type="checkbox" data-arms="approve-go"><span>${esc(snapshotHost ? w.confirm_check_snapshot : w.confirm_check_none)}</span></label>` : ""}
${errorBox(w)}
<div class="panel-actions"><span class="busy"><span class="spin"></span>${esc(w.working)}</span><button class="btn" type="button" data-close>${esc(w.cancel)}</button><button class="btn ${oneWay ? "btn-danger" : "btn-primary"}" type="button" id="approve-go" data-kind="approve" data-act="${esc(decideUrl("approve"))}" data-done="${esc(backTo("live"))}">${esc(w.confirm_go)}</button></div>
</div></dialog>
<dialog id="confirm-deny" aria-labelledby="confirm-deny-title"><div class="sheet" data-act-scope>
<h2 id="confirm-deny-title">${esc(w.deny_title)}</h2>
<p>${esc(w.deny_body)}</p>
<label class="field" for="deny-reason">${esc(w.deny_reason)}</label>
<textarea id="deny-reason" data-reason maxlength="500"></textarea>
${errorBox(w)}
<div class="panel-actions"><span class="busy"><span class="spin"></span>${esc(w.working)}</span><button class="btn" type="button" data-close>${esc(w.cancel)}</button><button class="btn btn-primary" type="button" data-kind="deny" data-act="${esc(decideUrl("deny"))}" data-done="${esc(backTo("no"))}">${esc(w.deny_go)}</button></div>
</div></dialog>`;
  return layout(ctx, `${w.change_title} · ${title}`, body, true);
}

function errorBox(w: Words): string {
  return `<div class="notice notice-bad err" data-error hidden>${ICON.alert}<div class="grow"><p data-error-text></p><details class="more"><summary>${esc(w.details)}</summary><pre data-error-detail></pre></details></div></div>`;
}

// --- going back -------------------------------------------------------------

/** What `AppHost.undoPlan` returns, as far as the page reads it. */
export interface UndoPlanView {
  readonly target: string;
  readonly undone: readonly string[];
  readonly oneWay: readonly { readonly version?: string }[];
  readonly dataRef?: { readonly capability: string; readonly ref: string };
  readonly crossing: { readonly data_restore: "snapshot" | "none"; readonly text: string } | null;
}

export function renderBack(name: string, status: AppStatus, entries: readonly HistoryEntry[], version: string, plan: UndoPlanView | null, ctx: PageContext): string {
  const w = WORDS[ctx.lang];
  const title = appTitle(name);
  const at = madeAt(entries, version);
  const appLink = link(`/app/${name}`, ctx.lang);
  const uncommitted = items<string>(status.uncommitted);
  const inLine = lineage(entries, status.active_version).includes(version);
  const label = versionLabel(w, entries, version);
  const heading = `<h1>${label ? say(w.back_title, { version: label }) : esc(w.item_undo_version)}</h1>${at ? `<p class="muted made">${say(w.back_made, { when: markup(time(ctx, at, "abs")) })}</p>` : ""}`;
  const close = `<div class="panel-actions"><a class="btn" href="${esc(appLink)}">${esc(w.cancel)}</a></div>`;
  if (version === status.active_version) {
    return layout(ctx, title, `<div class="confirm-page"><div class="panel">${heading}<p class="muted big">${esc(w.back_current)}</p>${close}</div></div>`, true);
  }
  if (!plan || !inLine) {
    return layout(ctx, title, `<div class="confirm-page"><div class="panel">${heading}<p class="big">${esc(w.back_not_earlier)}</p>${close}</div></div>`, true);
  }
  const oneWayVersions = new Set(plan.oneWay.map((entry) => str(entry.version)));
  const undone = plan.undone
    .map((v) => {
      const made = entries.find((entry) => entry?.version === v && entry.kind !== "restore");
      return `<li class="${oneWayVersions.has(v) ? "ow" : ""}">${quoted(made?.intent ?? v)}<span class="faint">${made ? time(ctx, made.at, "abs") : esc(v)}${oneWayVersions.has(v) ? ` · ${esc(w.one_way)}` : ""}</span></li>`;
    })
    .join("");
  let data: string;
  let check = "";
  if (!plan.crossing) data = esc(w.back_data_stays);
  else if (plan.crossing.data_restore === "snapshot" && plan.dataRef) {
    const saved = entries.filter((entry) => str(entry?.data_ref?.ref) === plan.dataRef!.ref).at(-1)?.at;
    const oldest = [...plan.undone].reverse().find((v) => oneWayVersions.has(v));
    const change = oldest ? str(entries.find((entry) => entry?.version === oldest && entry.kind !== "restore")?.intent) : "";
    data = say(w.back_data_snapshot, { when: markup(saved ? time(ctx, saved, "abs") : ""), change });
    check = w.back_check_snapshot;
  } else {
    data = esc(w.back_data_none);
    check = w.back_check_none;
  }
  const blocked = uncommitted.length > 0;
  const accept = plan.crossing ? "1" : "0";
  const actions = blocked
    ? `<div class="notice notice-wait result">${ICON.info}<p>${esc(uncommitted.length === 1 ? w.back_blocked_one : fill(w.back_blocked_other, { n: uncommitted.length }))}</p></div>${close}`
    : `${check ? `<label class="check owner-only"><input type="checkbox" data-arms="back-go"><span>${esc(check)}</span></label>` : ""}
<p class="notice result not-owner">${ICON.info}<span>${esc(w.read_only_decide)}</span></p>
${errorBox(w)}
<div class="panel-actions"><span class="busy"><span class="spin"></span>${esc(w.working)}</span><a class="btn" href="${esc(appLink)}">${esc(w.cancel)}</a><button class="btn ${plan.crossing ? "btn-danger" : "btn-primary"} owner-only" type="button" id="back-go" data-kind="undo" data-act="${esc(`/owner/apps/${name}/undo`)}" data-to="${esc(version)}" data-accept="${accept}" data-done="${esc(link(`/app/${name}?done=back`, ctx.lang))}">${esc(w.back_go)}</button></div>`;
  const body = `<div class="confirm-page"><div class="panel" data-act-scope>
${heading}
${plan.undone.length ? `<h2>${esc(w.back_undoes)}</h2><ul class="undone">${undone}</ul>` : ""}
<h2>${esc(w.data_title)}</h2>
<p>${data}</p>
${actions}
${details(w, [
  [w.d_version, `${esc(status.active_version)} → ${esc(version)}`],
  plan.crossing ? [w.d_plan, `<pre>${esc(plan.crossing.text)}</pre>`] : null,
  [w.d_terminal, cli(`undo --to ${version} "<why>" --app ${name}${plan.crossing ? " --accept-one-way" : ""}`)],
])}
</div></div>`;
  return layout(ctx, `${title}`, body, true);
}
