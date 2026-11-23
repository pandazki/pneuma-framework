import type { HistoryEntry } from "./artifact";
import type { AppStatus, AppSummary } from "./host";

// ---------------------------------------------------------------------------
// The Host's overview page, served at `/`.
//
// Read-only on purpose: approving, denying and undoing stay in a terminal, where
// the CLI asks the owner to confirm. The page has no script and no form, and its
// Content-Security-Policy allows neither. Intents, paths, notes and agent names
// come from agents and people, so every value is escaped where it is written.
// ---------------------------------------------------------------------------

export interface Overview {
  readonly governance: string;
  readonly governance_note: string;
  readonly data_snapshot: string | null;
  /** This Host's address as the person's machine reaches it, when known. */
  readonly host_url?: string;
  /** PneumaSpace's console as the person's machine reaches it, when known. */
  readonly console_url?: string;
  /** The same summaries `GET /apps` and `list` return. */
  readonly summaries: readonly AppSummary[];
  /** What `status` and `history` return, per app; `error` when the app could not be read. */
  readonly apps: readonly ({ readonly app_id: string; readonly status: AppStatus; readonly history: readonly HistoryEntry[] } | { readonly app_id: string; readonly error: string })[];
  readonly generated_at: string;
}

/** The headers the page is served with: no script, no form target, no framing, no sniffing. */
export const PAGE_HEADERS: Readonly<Record<string, string>> = {
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "cache-control": "no-store",
};

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text for HTML content and quoted attribute values. */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ENTITIES[ch]!);
}

/** A link only for an http(s) address; anything else is shown as text. */
function link(url: string | undefined | null, text?: string): string {
  if (!url) return "";
  let ok = false;
  try {
    const { protocol } = new URL(url);
    ok = protocol === "http:" || protocol === "https:";
  } catch {
    ok = false;
  }
  return ok ? `<a href="${esc(url)}">${esc(text ?? url)}</a>` : esc(text ?? url);
}

/** 2026-11-23T22:48:12.345Z -> 2026-11-23 22:48 UTC */
const readable = (iso: unknown) => esc(typeof iso === "string" && iso.length >= 16 ? `${iso.slice(0, 16).replace("T", " ")} UTC` : iso);

const list = (items: unknown) => (Array.isArray(items) && items.length ? items.map(esc).join(", ") : "none");

// Pending changes and history come from files an agent can write, so an array may be missing.
const items = <T>(value: readonly T[] | undefined | null): readonly T[] => (Array.isArray(value) ? value : []);

/** One part of the page, or a line saying it could not be shown: one malformed record does not take the page down. */
function guarded(render: () => string, fallback: string): string {
  try {
    return render();
  } catch {
    return fallback;
  }
}

function command(app: string, verb: string, changeId: string): string {
  return `<code>node .pneuma/pneuma.mjs ${esc(verb)} ${esc(changeId)} --app ${esc(app)}</code>`;
}

function waiting(overview: Overview): string {
  const rows = overview.summaries.flatMap((app) => ("error" in app ? [] : items(app.pending).map((p) => ({ app: app.app_id, p }))));
  if (!rows.length) return `<section id="waiting"><h2>Waiting for the owner</h2><p class="muted">Nothing waits for the owner.</p></section>`;
  const cards = rows
    .map(({ app, p }) =>
      guarded(
        () => `<li class="card">
<p><strong>${esc(app)}</strong> · <code>${esc(p.change_id)}</code> · ${readable(p.created_at)} · by ${esc(p.agent)} [${esc(p.control)}]</p>
<p class="intent">${esc(p.intent)}</p>
<p>Risks: ${list(p.risks)}${p.one_way ? ` · <span class="oneway">ONE-WAY</span>: ${esc(p.one_way)}` : ""}</p>
<p>Files: ${list(p.changed_paths)}</p>
<ul>${items(p.disclosure)
          .map((line) => `<li>${esc(line)}</li>`)
          .join("")}</ul>
<p>Nothing was released. The owner decides in a terminal, in the apps directory or in the app's directory: ${command(app, "approve", p.change_id)} or ${command(app, "deny", p.change_id)}</p>
</li>`,
        `<li class="card warn">A change waiting in ${esc(app)} does not have the shape this Host writes and is not shown. <code>node .pneuma/pneuma.mjs status ${esc(app)}</code> shows what the Host reads.</li>`,
      ),
    )
    .join("\n");
  return `<section id="waiting"><h2>Waiting for the owner (${rows.length})</h2><ul class="plain">${cards}</ul></section>`;
}

function summaryTable(overview: Overview): string {
  if (!overview.summaries.length) return `<p class="muted">No apps yet. Create one with <code>node .pneuma/pneuma.mjs create &lt;name&gt;</code>.</p>`;
  const rows = overview.summaries
    .map((app) => guarded(() => summaryRow(app), `<tr><td>${esc(app.app_id)}</td><td colspan="5" class="warn">could not be shown</td></tr>`))
    .join("\n");
  return `<div class="scroll"><table>
<thead><tr><th>App</th><th>Version</th><th>Address</th><th>Last change</th><th>Waiting</th><th>Uncommitted</th></tr></thead>
<tbody>${rows}</tbody>
</table></div>`;
}

function summaryRow(app: AppSummary): string {
  if ("error" in app) return `<tr><td><a href="#app-${esc(app.app_id)}">${esc(app.app_id)}</a></td><td colspan="5" class="warn">could not be read: ${esc(app.error)}</td></tr>`;
  const last = app.last_change;
  const serving = app.serves_other_version ? `<div class="warn">the address serves ${esc(app.serving_version)}, not ${esc(app.active_version)}</div>` : "";
  return `<tr>
<td class="nowrap"><a href="#app-${esc(app.app_id)}">${esc(app.app_id)}</a></td>
<td class="nowrap">${esc(app.active_version ?? "unpublished")}</td>
<td>${link(app.address)}${serving}</td>
<td>${last ? `${readable(last.at)} by ${esc(last.agent)}: <span class="intent">${esc(last.intent)}</span> <span class="muted">(${esc(last.kind)} ${esc(last.outcome)}${last.version ? ` ${esc(last.version)}` : ""})</span>` : "none"}</td>
<td>${items(app.pending).length ? `<a href="#waiting">${items(app.pending).length}</a>` : "0"}</td>
<td>${list(app.uncommitted)}</td>
</tr>`;
}

/**
 * One history entry. The history file lives in the app directory, where an agent can write anything, so an
 * entry that does not have the shape this Host writes is shown as such instead of taking the page down.
 */
function entry(h: HistoryEntry): string {
  try {
    return entryLines(h);
  } catch {
    return `<li class="entry warn">An entry here does not have the shape this Host writes and is not shown${typeof h?.at === "string" ? ` (${readable(h.at)})` : ""}.</li>`;
  }
}

function entryLines(h: HistoryEntry): string {
  const lines: string[] = [];
  const where = h.version ? ` → ${esc(h.version)}` : "";
  lines.push(
    `<p><span class="muted">${readable(h.at)}</span> <strong>${esc(h.kind)} ${esc(h.outcome)}</strong>${where} by ${esc(h.agent)} [${esc(h.control)}]${h.reason ? ` <span class="muted">(${esc(h.reason)})</span>` : ""}</p>`,
    `<p class="intent">${esc(h.intent)}</p>`,
  );
  if (Array.isArray(h.agent_candidates) && h.agent_candidates.length) {
    lines.push(`<p class="warn">Agent unknown: markers of more than one agent were set (${h.agent_candidates.map((c) => `${esc(c?.agent)}: ${list(c?.markers)}`).join("; ")}).</p>`);
  }
  if (h.changed_paths?.length) lines.push(`<p>Files: ${list(h.changed_paths)}</p>`);
  if (h.risks?.length) lines.push(`<p>Risks: ${list(h.risks)}</p>`);
  if (h.approval) lines.push(`<p>Approval: ${esc(h.approval.reason_code)} by ${Array.isArray(h.approval.by) && h.approval.by.length ? list(h.approval.by) : "nobody yet"}${h.approval.preset ? ` <span class="muted">(preset ${esc(h.approval.preset)})</span>` : ""}</p>`);
  const tests = Array.isArray(h.checks) ? h.checks.find((check) => check?.id === "npm-test") : undefined;
  if (tests?.coverage) lines.push(`<p>Tests (${esc(tests.status)}): ${esc(tests.coverage.note)}</p>`);
  if (h.kind !== "snapshot") lines.push(`<p>Guarantees: ${h.guarantees?.length ? list(h.guarantees) : "none (recorded only)"}</p>`);
  if (h.one_way) lines.push(`<p><span class="oneway">ONE-WAY</span>: ${esc(typeof h.one_way === "object" ? h.one_way.reason : h.one_way)}</p>`);
  if (h.data_ref) lines.push(`<p>Stored data saved: ${esc(h.data_ref.capability)} ${esc(h.data_ref.ref)}</p>`);
  if (h.one_way_crossed) {
    const how = h.one_way_crossed.by === "data_restored" ? "stored data put back" : "code only, stored data left as it was";
    lines.push(`<p>Went back past one-way ${list(h.one_way_crossed.versions)}: ${how}${h.confirmed_by ? `, confirmed by ${esc(h.confirmed_by)}` : ""}</p>`);
    if (h.set_aside) lines.push(`<p>${esc(h.set_aside)}</p>`);
  }
  if (h.address_note) lines.push(`<p>Address: ${esc(h.address_note)}</p>`);
  if (h.kept_edits?.length) lines.push(`<p>Working tree left as it was (edited meanwhile): ${list(h.kept_edits)}</p>`);
  if (h.note) lines.push(`<p>${esc(h.note)}</p>`);
  return `<li class="${h.one_way ? "entry oneway-entry" : "entry"}">${lines.join("\n")}</li>`;
}

/** An app's section, or a line saying it could not be shown: one malformed app does not take the page down. */
function appBlock(app: Overview["apps"][number]): string {
  try {
    return appSection(app);
  } catch (err) {
    return `<section id="app-${esc(app.app_id)}" class="app"><h2>${esc(app.app_id)}</h2><p class="warn">This app could not be shown: ${esc(err instanceof Error ? err.message : String(err))}</p></section>`;
  }
}

function appSection(app: Overview["apps"][number]): string {
  if ("error" in app) {
    return `<section id="app-${esc(app.app_id)}" class="app"><h2>${esc(app.app_id)}</h2><p class="warn">This app could not be read: ${esc(app.error)}</p></section>`;
  }
  const s = app.status;
  const pending = items(s.pending).length
    ? items(s.pending)
        .map((p) => `<li><code>${esc(p.change_id)}</code> <span class="intent">${esc(p.intent)}</span> (${list(p.risks)}) · <a href="#waiting">details</a></li>`)
        .join("")
    : "<li>none</li>";
  const history = [...app.history].reverse().map(entry).join("\n");
  // The directory name, as in the summary table and every command; app.json's app_id is the agent's to edit.
  return `<section id="app-${esc(app.app_id)}" class="app">
<h2>${esc(app.app_id)}</h2>
<dl>
<dt>Current version</dt><dd>${esc(s.active_version ?? "unpublished")}</dd>
<dt>Address</dt><dd>${link(s.address)}</dd>
<dt>The address serves</dt><dd>${esc(s.serving_version ?? "unknown")}${s.serving_version && s.serving_version !== s.active_version ? ` <span class="warn">(not ${esc(s.active_version)}: the last release did not go live)</span>` : ""}</dd>
<dt>Previous version</dt><dd>${s.previous_version ? `${esc(s.previous_version)} (undo goes back here)` : "none (this is the first version)"}</dd>
<dt>Owner</dt><dd>${esc(s.owner)}</dd>
<dt>Governance</dt><dd>${esc(s.governance)}: ${esc(s.governance_note)}</dd>
<dt>Data snapshot</dt><dd>${s.data_snapshot ? `${esc(s.data_snapshot)} (undo past a one-way change puts stored data back, with the owner's confirmation)` : "none (undo past a one-way change puts back code only, with the owner's confirmation)"}</dd>
<dt>Uncommitted</dt><dd>${list(s.uncommitted)}</dd>
<dt>Waiting for the owner</dt><dd><ul class="plain">${pending}</ul></dd>
</dl>
<details${app.history.length <= 12 ? " open" : ""}>
<summary>History: ${app.history.length} entr${app.history.length === 1 ? "y" : "ies"}, newest first</summary>
<ol class="history" reversed>${history}</ol>
</details>
</section>`;
}

const STYLE = `
:root { color-scheme: light dark; --bg: #fbfbf9; --fg: #1d1d1b; --muted: #5d5d58; --line: #d9d9d3; --card: #ffffff; --link: #0b57b0; --warn: #9a3412; --oneway: #b91c1c; --code: #f0f0ec; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #161615; --fg: #ececea; --muted: #a3a39d; --line: #3a3a37; --card: #1f1f1d; --link: #8ab4f8; --warn: #fdba74; --oneway: #fca5a5; --code: #2a2a27; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 1.5rem; margin: 0 0 8px; }
h2 { font-size: 1.15rem; margin: 32px 0 8px; }
a { color: var(--link); }
p { margin: 4px 0; }
code { background: var(--code); padding: 1px 4px; border-radius: 4px; font: 0.9em ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
.muted { color: var(--muted); }
.warn { color: var(--warn); }
.oneway { color: var(--oneway); font-weight: 600; }
.intent { overflow-wrap: anywhere; white-space: pre-wrap; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; vertical-align: top; padding: 6px 8px; border-bottom: 1px solid var(--line); overflow-wrap: break-word; }
th, td.nowrap { white-space: nowrap; }
th { font-weight: 600; color: var(--muted); }
.plain { list-style: none; padding: 0; margin: 0; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px; margin: 8px 0; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 8px 0; }
dt { color: var(--muted); }
dd { margin: 0; overflow-wrap: anywhere; }
.history { padding-left: 24px; }
.entry { border-left: 3px solid var(--line); padding: 4px 0 4px 10px; margin: 8px 0; }
.oneway-entry { border-left-color: var(--oneway); }
summary { cursor: pointer; color: var(--muted); }
@media (max-width: 640px) { dl { grid-template-columns: 1fr; } dt { margin-top: 6px; } }
`;

/** The whole page. Self-contained: no script, no external asset, every value escaped. */
export function renderPage(overview: Overview): string {
  const apps = overview.summaries.length;
  const waitingCount = overview.summaries.reduce((n, app) => n + ("error" in app ? 0 : items(app.pending).length), 0);
  const consoleLine = overview.console_url
    ? `<p>PneumaSpace console: ${link(overview.console_url)}. It shows the platform's side of each app (runtime, asleep or awake, requests). Its remove, purge, access, policy and publish actions go around this Host: after one, the history below no longer matches what is live.</p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Apps on this pneuma Host</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<header>
<h1>Apps on this pneuma Host</h1>
<p>${apps} app${apps === 1 ? "" : "s"} · ${waitingCount} change${waitingCount === 1 ? "" : "s"} waiting for the owner · governance ${esc(overview.governance)}: ${esc(overview.governance_note)}</p>
<p class="muted">This page only reads. Approving, denying and undoing happen in a terminal, with <code>node .pneuma/pneuma.mjs</code>. Shown at ${readable(overview.generated_at)}; reload to update.${overview.host_url ? ` Host: ${link(overview.host_url)}.` : ""}</p>
${consoleLine}
</header>
${waiting(overview)}
<section id="apps"><h2>Apps</h2>${summaryTable(overview)}</section>
${overview.apps.map(appBlock).join("\n")}
</main>
</body>
</html>
`;
}
