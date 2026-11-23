import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { AppHost } from "../src/host";
import { esc, renderPage, type Overview } from "../src/page";
import { loadRiskPolicy } from "../src/policy";
import { createHostServer } from "../src/server";
import { FakeSpace } from "./fake-space";

const EXAMPLE = join(import.meta.dir, "..");
const HOSTILE = `"><script>alert(1)</script><img src=x onerror=alert(2)>'&`;

let work: string;
let host: AppHost;

const edit = (name: string, rel: string, content: string) => {
  const file = join(work, "apps", name, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};

/** Every tag the page opens, with its attributes. */
const tags = (html: string) => [...html.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)].map(([, name, attrs]) => ({ name: name!.toLowerCase(), attrs: attrs ?? "" }));

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "space-all-in-one-page-"));
  host = new AppHost({
    appsDir: join(work, "apps"),
    space: new FakeSpace(),
    overlayDir: join(EXAMPLE, "overlay"),
    cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
    owner: "user:me",
    policy: loadRiskPolicy(join(EXAMPLE, "policy", "personal.json")),
    runVerify: async () => ({ ok: true, output: "ℹ tests 2\nℹ pass 2\nℹ skipped 0\nℹ todo 0" }),
    hostUrl: "http://127.0.0.1:8090",
    consoleUrl: "http://127.0.0.1:8081/",
  });
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

describe("the overview page", () => {
  test("escapes every value that came from an agent or a person: a hostile intent and file name stay text", async () => {
    await host.create("notes");
    edit("notes", "src/<b>bold</b>.ts", "export const x = 1;\n");
    edit("notes", "src/server.ts", "export const sql = 'DROP TABLE todos';\n");
    const waiting = await host.submit({ name: "notes", intent: HOSTILE, agent: `codex<i>`, agentProvenance: { source: "ambiguous", candidates: [{ agent: "<u>x</u>", markers: ["CODEX_<s>"] }] } });
    expect(waiting.status).toBe("needs_approval");
    const html = renderPage(await host.overview());

    expect(html).toContain(esc(HOSTILE));
    expect(html).toContain("&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(2)&gt;&#39;&amp;");
    expect(html).toContain("src/&lt;b&gt;bold&lt;/b&gt;.ts");
    expect(html).toContain("codex&lt;i&gt;");
    expect(html).toContain("&lt;u&gt;x&lt;/u&gt;: CODEX_&lt;s&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    const allowed = new Set(["html", "head", "meta", "title", "style", "body", "main", "header", "section", "h1", "h2", "p", "a", "code", "strong", "span", "ul", "ol", "li", "div", "table", "thead", "tbody", "tr", "th", "td", "dl", "dt", "dd", "details", "summary"]);
    for (const tag of tags(html)) {
      expect(allowed.has(tag.name)).toBe(true);
      expect(tag.attrs).not.toMatch(/\son\w+\s*=/i);
    }
  });

  test("a history line an agent wrote by hand, of any shape, is escaped or set aside, and the page still renders", async () => {
    await host.create("notes");
    appendFileSync(
      join(work, "apps", "notes", ".pneuma", "history.jsonl"),
      `${JSON.stringify({ at: "<script>t</script>", kind: "change<b>", intent: HOSTILE, agent: "x", outcome: "<i>published</i>", guarantees: ["<em>sealed</em>"], approval: { by: "<s>me</s>" }, checks: "nope", one_way: "<b>drop</b>" })}\n`,
    );
    const html = renderPage(await host.overview());
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<em>");
    expect(html).not.toContain("<b>drop");
    expect(html).toContain(esc(HOSTILE));
    expect(html).toContain("&lt;b&gt;drop&lt;/b&gt;");
  });

  test("offers no write: no script, no form, nothing that posts", async () => {
    await host.create("notes");
    edit("notes", "src/server.ts", "export const sql = 'DROP TABLE todos';\n");
    await host.submit({ name: "notes", intent: "start over", agent: "codex" });
    const html = renderPage(await host.overview());
    for (const marker of ["<script", "<form", "<button", "<input", "method=", "fetch(", "XMLHttpRequest", "javascript:", "action="]) expect(html).not.toContain(marker);
  });

  test("shows what status and history show, for every app, and the terminal command for each waiting change", async () => {
    await host.create("notes");
    await host.create("todo");
    edit("todo", "src/server.ts", "export const shown = true;\n");
    await host.submit({ name: "todo", intent: "show the list", agent: "claude-code", agentProvenance: { source: "PNEUMA_AGENT" } });
    edit("todo", "src/server.ts", "export const sql = `ALTER TABLE todos DROP COLUMN note`;\n");
    const waiting = await host.submit({ name: "todo", intent: "drop the note column", agent: "codex" });
    await host.resolve("todo", waiting.change_id, "approved", "user:me");
    edit("notes", "src/server.ts", "export const sql = 'DROP TABLE notes';\n");
    const pending = await host.submit({ name: "notes", intent: "start over", agent: "codex" });
    edit("notes", "src/extra.ts", "export const extra = 1;\n");

    const overview = await host.overview();
    const html = renderPage(overview);
    for (const app of overview.apps) {
      if ("error" in app) throw new Error(app.error);
      const s = app.status;
      expect(html).toContain(`id="app-${s.app_id}"`);
      expect(html).toContain(`<a href="${s.address}">${s.address}</a>`);
      expect(html).toContain(`<dt>Current version</dt><dd>${s.active_version}</dd>`);
      expect(html).toContain(esc(s.governance_note));
      for (const h of app.history) {
        expect(html).toContain(esc(h.intent));
        expect(html).toContain(`by ${esc(h.agent)} [${h.control}]`);
        if (h.approval) expect(html).toContain(`Approval: ${h.approval.reason_code} by ${h.approval.by.join(", ") || "nobody yet"}`);
        if (h.risks?.length) expect(html).toContain(`Risks: ${h.risks.join(", ")}`);
        if (h.kind !== "snapshot") expect(html).toContain(`Guarantees: ${h.guarantees.length ? h.guarantees.join(", ") : "none (recorded only)"}`);
      }
    }
    expect(html).toContain('<span class="oneway">ONE-WAY</span>: src/server.ts now runs');
    expect(html).toContain("<dt>Previous version</dt><dd>v2 (undo goes back here)</dd>");
    expect(html).toContain("<dt>Uncommitted</dt><dd>src/extra.ts, src/server.ts</dd>");
    expect(html).toContain("Approval: required-approvals-satisfied by user:me");
    expect(html).toContain("Approval: required-approvals-satisfied by policy:auto");
    expect(html).toContain("Approval: missing-required-approval by nobody yet");
    expect(html).toContain(`<code>node .pneuma/pneuma.mjs approve ${pending.change_id} --app notes</code>`);
    expect(html).toContain(`<code>node .pneuma/pneuma.mjs deny ${pending.change_id} --app notes</code>`);
    expect(html).toContain('<a href="http://127.0.0.1:8081/">http://127.0.0.1:8081/</a>');
    expect(html).toContain("Its remove, purge, access, policy and publish actions go around this Host");
    expect(html).toContain("Waiting for the owner (1)");
    // Light and dark both have their colours.
    expect(html).toContain("@media (prefers-color-scheme: dark)");
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
  });

  test("served at / with headers that allow no script, and reading it changes no record", async () => {
    await host.create("notes");
    edit("notes", "src/server.ts", "export const draft = true;\n");
    const before = readFileSync(join(work, "apps", "notes", ".pneuma", "history.jsonl"), "utf8");
    const server = createHostServer(host);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(res.headers.get("content-security-policy")).not.toContain("script-src");
      expect(res.headers.get("content-security-policy")).toContain("form-action 'none'");
      const html = await res.text();
      expect(html).toStartWith("<!doctype html>");
      expect(html).toContain("Apps on this pneuma Host");
      expect(html).not.toMatch(/<(link|script|img|iframe)\b/);
      expect(html).not.toMatch(/(src|href)="(?!#|http:\/\/space\.test|http:\/\/127\.0\.0\.1)/);
      expect(readFileSync(join(work, "apps", "notes", ".pneuma", "history.jsonl"), "utf8")).toBe(before);
      expect((await host.status("notes")).uncommitted).toEqual(["src/server.ts"]);
    } finally {
      server.close();
    }
  });

  test("a waiting change written by hand, with fields missing or of another type, does not take the page down", async () => {
    await host.create("notes");
    const pending = join(work, "apps", "notes", ".pneuma", "pending");
    mkdirSync(pending, { recursive: true });
    writeFileSync(join(pending, "c-hand.json"), JSON.stringify({ change_id: "c-hand", created_at: "2026-11-24T08:00:00.000Z", intent: HOSTILE, risks: "<b>all</b>", disclosure: "<i>none</i>", one_way: "<b>yes</b>" }));
    const server = createHostServer(host);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`, { signal: AbortSignal.timeout(5_000) });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Waiting for the owner (1)");
      expect(html).toContain(esc(HOSTILE));
      expect(html).toContain("&lt;b&gt;yes&lt;/b&gt;");
      expect(html).not.toContain("<b>");
      expect(html).toContain('<section id="app-notes" class="app">');
    } finally {
      server.close();
    }

    // A record no field of which can be read is set aside with a line saying so; the rest of the page renders.
    const overview = await host.overview();
    const odd = { ...overview, summaries: overview.summaries.map((app) => ({ ...app, pending: [null, { change_id: "c-ok", intent: "kept", disclosure: ["shown"] }] })) } as unknown as Overview;
    const html = renderPage(odd);
    expect(html).toContain("A change waiting in notes does not have the shape this Host writes and is not shown.");
    expect(html).toContain("<li>shown</li>");
    expect(html).toContain("</html>");
  });

  test("a page that cannot be drawn answers 500 instead of leaving the request open", async () => {
    const broken = { overview: async () => ({ summaries: null, apps: [] }) } as unknown as AppHost;
    const server = createHostServer(broken);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`, { signal: AbortSignal.timeout(5_000) });
      expect(res.status).toBe(500);
      expect(await res.text()).toStartWith("the overview could not be shown: ");
    } finally {
      server.close();
    }
  });

  test("each app is shown under its directory name, which every command takes, whatever app.json says", async () => {
    await host.create("notes");
    const info = join(work, "apps", "notes", ".pneuma", "app.json");
    writeFileSync(info, JSON.stringify({ ...JSON.parse(readFileSync(info, "utf8")), app_id: "<b>renamed</b>" }));
    const html = renderPage(await host.overview());
    expect(html).toContain('<a href="#app-notes">notes</a>');
    expect(html).toContain('<section id="app-notes" class="app">\n<h2>notes</h2>');
    expect(html).not.toContain("renamed");
  });
});
