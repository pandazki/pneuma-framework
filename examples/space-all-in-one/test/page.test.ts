import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { AppHost, type AppHostOptions, type AppStatus } from "../src/host";
import { appState, esc, NO_PICTURES, renderApp, renderBack, renderChange, renderHome, type Overview, type PageContext, type PictureLookup } from "../src/page";
import { chooseLang } from "../src/page-words";
import { loadRiskPolicy } from "../src/policy";
import { createHostServer } from "../src/server";
import { FakeSpace, templateTests } from "./fake-space";

const EXAMPLE = join(import.meta.dir, "..");
const HOSTILE = `"><script>alert(1)</script><img src=x onerror=alert(2)>'&`;

let work: string;
let space: FakeSpace;
let host: AppHost;

const options = (extra: Partial<AppHostOptions> = {}): AppHostOptions => ({
  appsDir: join(work, "apps"),
  space,
  overlayDir: join(EXAMPLE, "overlay"),
  cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
  owner: "user:me",
  policy: loadRiskPolicy(join(EXAMPLE, "policy", "personal.json")),
  runVerify: (root) => templateTests(root),
  hostUrl: "http://127.0.0.1:8090",
  consoleUrl: "http://127.0.0.1:8081/",
  ...extra,
});

const edit = (name: string, rel: string, content: string) => {
  const file = join(work, "apps", name, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};

async function context(lang: "en" | "zh" = "en", pictures: PictureLookup = NO_PICTURES, via: AppHost = host): Promise<{ ctx: PageContext; overview: Overview }> {
  const overview = await via.overview();
  return {
    overview,
    ctx: {
      lang,
      nonce: "test-nonce",
      now: Date.now(),
      pictures,
      path: "/",
      apps: overview.summaries,
      governance: overview.governance,
      governanceNote: overview.governance_note,
      dataSnapshot: overview.data_snapshot,
      hostUrl: overview.host_url,
      consoleUrl: overview.console_url,
      autoApproved: via.autoApproved,
    },
  };
}

/** Every tag the page opens, with its attributes. */
const tags = (html: string) => [...html.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)].map(([, name, attrs]) => ({ name: name!.toLowerCase(), attrs: attrs ?? "" }));
/** The page with every "Details" disclosure taken out: what a person reads without opening anything. */
const surface = (html: string) => html.replace(/<details class="more">[\s\S]*?<\/details>/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "space-all-in-one-page-"));
  space = new FakeSpace();
  host = new AppHost(options());
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

/** A one-way change that waits for the owner, and the status that shows it. */
async function waitingDrop(name = "notes", intent = "start over"): Promise<{ id: string; status: AppStatus }> {
  await host.create(name);
  edit(name, "src/server.ts", "export const sql = 'DROP TABLE notes';\n");
  const result = await host.submit({ name, intent, agent: "codex" });
  expect(result.status).toBe("needs_approval");
  return { id: result.change_id, status: await host.status(name) };
}

describe("the owner page: what it shows", () => {
  test("every view escapes what an agent or a person wrote: intents, agent names, file names, notes", async () => {
    await host.create("notes");
    edit("notes", "src/live.ts", "export const live = 1;\n");
    expect((await host.submit({ name: "notes", intent: HOSTILE, agent: "claude-code" })).status).toBe("published");
    edit("notes", "src/<b>bold</b>.ts", "export const x = 1;\n");
    edit("notes", "src/server.ts", "export const sql = 'DROP TABLE todos';\n");
    const waiting = await host.submit({ name: "notes", intent: HOSTILE, agent: `codex<i>`, agentProvenance: { source: "ambiguous", candidates: [{ agent: "<u>x</u>", markers: ["CODEX_<s>"] }] } });
    expect(waiting.status).toBe("needs_approval");
    appendFileSync(
      join(work, "apps", "notes", ".pneuma", "history.jsonl"),
      `${JSON.stringify({ change_id: "c-hand", at: "<script>t</script>", kind: "change<b>", intent: HOSTILE, agent: "<em>x</em>", outcome: "published", version: "v1", guarantees: ["<em>sealed</em>"], approval: { by: "<s>me</s>" }, checks: "nope", one_way: "<b>drop</b>", note: HOSTILE })}\n`,
    );
    const { ctx, overview } = await context();
    const status = await host.status("notes");
    const views = [
      renderHome(overview, ctx),
      renderApp("notes", status, host.history("notes"), ctx),
      renderChange("notes", status, waiting.change_id, ctx),
      renderBack("notes", status, host.history("notes"), "v1", host.undoPlan("notes", "v1"), ctx),
    ];
    const allowed = new Set(["html", "head", "meta", "title", "script", "style", "body", "div", "main", "section", "aside", "footer", "nav", "h1", "h2", "h3", "p", "a", "span", "strong", "i", "q", "code", "pre", "kbd", "ul", "ol", "li", "dl", "dt", "dd", "details", "summary", "dialog", "button", "input", "label", "textarea", "img", "time", "article", "br", "svg", "path", "circle"]);
    for (const [i, html] of views.entries()) {
      expect([i, html.includes(esc(HOSTILE))]).toEqual([i, true]);
      expect(html).not.toContain("<script>alert(1)");
      expect(html).not.toContain("<img src=x");
      expect(html).not.toContain("<b>");
      expect(html).not.toContain("<em>");
      // The only scripts are the page's own, each with this response's nonce, or JSON data blocks.
      for (const tag of tags(html)) {
        expect(allowed.has(tag.name)).toBe(true);
        expect(tag.attrs).not.toMatch(/\son\w+\s*=/i);
        if (tag.name === "script") expect(tag.attrs).toMatch(/nonce="test-nonce"|type="application\/json"/);
      }
    }
    expect(views[2]).toContain("src/&lt;b&gt;bold&lt;/b&gt;.ts");
    expect(views[2]).toContain("codex&lt;i&gt;");
    // The search data is JSON inside the page: nothing in it can close the script element.
    expect(views[0]).not.toMatch(/<\/script><script>alert/);
    expect(views[0]).toContain("\\u003cscript\\u003ealert(1)");
  });

  test("each app has one plain state, in English and in Chinese", async () => {
    await host.create("calm");
    await waitingDrop("asks");
    await host.create("failed");
    edit("failed", "src/BOOT_FAILS", "1\n");
    expect((await host.submit({ name: "failed", intent: "break it", agent: "codex" })).status).toBe("rejected");
    // Record mode: the release does not answer, and neither does putting v1 back, so nobody saw what serves.
    const recording = new AppHost(options({ governance: "record" }));
    await recording.create("unsure");
    space.unhealthy = (name) => name === "unsure";
    edit("unsure", "src/extra.ts", "export const extra = 1;\n");
    expect((await recording.submit({ name: "unsure", intent: "add a file", agent: "codex" })).status).toBe("release_failed");
    space.unhealthy = null;
    edit("broken", ".pneuma/app.json", "{ not json");

    const { ctx, overview } = await context("en");
    expect(Object.fromEntries(overview.summaries.map((s) => [s.app_id, appState(s)]))).toEqual({ asks: "waiting", broken: "unreadable", calm: "normal", failed: "not_live", unsure: "uncertain" });
    const en = renderHome(overview, ctx);
    for (const words of ["Running normally", "A change is waiting for you", "The last change didn&#39;t go live", "Can&#39;t confirm what&#39;s running", "Can&#39;t read this app"]) expect(en).toContain(words);
    const zh = renderHome(overview, { ...ctx, lang: "zh" });
    expect(zh).toContain('<html lang="zh-CN"');
    for (const words of ["运行正常", "有改动等你确认", "上次的改动没有上线", "无法确认正在运行的版本", "无法读取这个应用", "等你确认", "全部应用"]) expect(zh).toContain(words);
    // The app's own view says in plain words what the Host does not know.
    expect(renderApp("unsure", await host.status("unsure"), host.history("unsure"), ctx)).toContain("The Host can&#39;t tell which version your app&#39;s address shows right now");
    expect(renderApp("calm", await host.status("calm"), host.history("calm"), ctx)).not.toContain('class="notice notice-bad under"');
    // Waiting changes come first, above the grid.
    expect(en.indexOf("Waiting for you")).toBeLessThan(en.indexOf("All apps"));
    expect(en.indexOf("“start over”")).toBeLessThan(en.indexOf("All apps"));
  });

  test("the history is told in the person's words; record terms stay under Details", async () => {
    await host.create("todo");
    edit("todo", "src/list.ts", "export const list = [];\n");
    await host.submit({ name: "todo", intent: "add a list", agent: "claude-code" });
    edit("todo", "src/server.ts", "export const sql = `ALTER TABLE todos DROP COLUMN note`;\n");
    const drop = await host.submit({ name: "todo", intent: "drop the note column", agent: "codex" });
    await host.resolve("todo", drop.change_id, "approved", "user:me");
    await host.undo("todo", "undo", { to: "v2", acceptOneWay: true, subject: "user:me", actor: "user:me" });
    const recording = new AppHost(options({ governance: "record" }));
    edit("todo", "src/extra.ts", "export const extra = 1;\n");
    await recording.submit({ name: "todo", intent: "add a file without checks", agent: "codex" });

    const { ctx } = await context();
    const html = renderApp("todo", await host.status("todo"), host.history("todo"), ctx);
    const read = surface(html);
    expect(read).toContain("“add a list”");
    expect(read).toContain("Checked and tried out · approved automatically as a routine change");
    expect(read).toContain("Checked and tried out · you confirmed it");
    expect(read).toContain("Went live without checks");
    expect(read).toContain("Can&#39;t be undone by going back");
    expect(read).toContain("It deletes or rewrites data you already have");
    expect(read).toContain("Went back to “add a list”");
    expect(read).toContain("Only the app went back; your stored data stayed as it was.");
    expect(read).toContain("Running now");
    expect(read).toContain("Undone");
    expect(read).toContain("Go back to this");
    for (const term of ["verified", "previewed", "sealed", "source_code_change", "destructive_definition", "policy:auto", drop.change_id]) expect(read).not.toContain(term);
    // ...and all of them are there for whoever opens Details.
    for (const term of ["verified, previewed, approved, sealed", "source_code_change", "policy:auto", drop.change_id, "undo --to v1"]) expect(html).toContain(term);
    const zh = surface(renderApp("todo", await host.status("todo"), host.history("todo"), { ...ctx, lang: "zh" }));
    for (const words of ["检查过，也试运行过 · 例行改动，自动通过", "检查过，也试运行过 · 你确认过", "未经检查直接上线", "无法通过回退撤销", "回到了“add a list”的版本", "正在运行", "回到这个版本"]) expect(zh).toContain(words);
  });

  test("a waiting change: before and after, what was checked, why it needs the owner, and the decisions", async () => {
    await host.create("notes");
    edit("notes", "src/list.ts", "export const list = [];\n");
    await host.submit({ name: "notes", intent: "a list", agent: "claude-code" });
    const manifest = join(work, "apps", "notes", "pneuma-space.json");
    const value = JSON.parse(readFileSync(manifest, "utf8"));
    value.capabilities.identity = { required: false };
    writeFileSync(manifest, JSON.stringify(value));
    const result = await host.submit({ name: "notes", intent: "let my family in without signing in", agent: "claude-code" });
    expect(result.status).toBe("needs_approval");
    const { ctx } = await context();
    const html = renderChange("notes", await host.status("notes"), result.change_id, ctx);
    const read = surface(html);
    expect(read).toContain("“let my family in without signing in”");
    expect(read).toContain("Claude Code made this change");
    expect(read).toContain("Its tests passed (2 tests, 0 of them for this app)");
    expect(read).toContain("It started when it was tried out");
    // Only what the standing policy could not approve is why it waits: not the code change itself.
    expect(read).toContain("Anyone with the address could open the app without signing in.");
    expect(read).not.toContain("It changes how the app works.");
    expect(read).toContain("After this, anyone with the address can open it without signing in.");
    expect(read).toContain("Let it go live");
    expect(read).toContain("Not this time");
    expect(read).not.toContain("This one can&#39;t be taken back");
    // The decisions are the owner's: hidden until this tab holds the owner link, with a plain line for everyone else.
    expect(html).toMatch(/class="btn btn-primary owner-only" type="button" data-open="confirm-approve"/);
    expect(html).toContain('<p class="grow not-owner">To decide here, open this page from your owner link.');
    expect(html).toContain(`data-act="/owner/apps/notes/changes/${result.change_id}/approve"`);
    expect(html).toContain(`approve ${result.change_id} --app notes`);
    // This Host removes previews when the submit ends: the page says it was tried, without a link to a preview.
    expect(read).toContain("It was tried out before it came to you, and it started fine.");
    // A Host that keeps the preview writes its address into the waiting change; the page links to it only on the runtime.
    const file = join(work, "apps", "notes", ".pneuma", "pending", `${result.change_id}.json`);
    const pending = JSON.parse(readFileSync(file, "utf8"));
    for (const [address, linked] of [
      ["http://space.test/apps/notes-pv1234/", true],
      ["javascript:alert(1)", false],
      ["http://elsewhere.test/apps/notes-pv1234/", false],
    ] as const) {
      writeFileSync(file, JSON.stringify({ ...pending, preview: { address } }));
      const shown = renderChange("notes", await host.status("notes"), result.change_id, ctx);
      expect(shown.includes(`href="${address}"`)).toBe(linked);
    }
  });

  test("a one-way change needs a second, deliberate confirmation that states the consequence", async () => {
    const { id, status } = await waitingDrop();
    const { ctx } = await context();
    const html = renderChange("notes", status, id, ctx);
    expect(html).toContain("This one can&#39;t be taken back");
    expect(html).toContain("If you go back later, only the app goes back. The data this change removes stays removed");
    expect(html).toContain('<input type="checkbox" data-arms="approve-go">');
    expect(html).toContain("I understand: going back later won&#39;t bring this data back.");
    expect(html).toMatch(/class="btn btn-danger" type="button" id="approve-go"/);
    // With a data snapshot capability, the consequence is the snapshot's.
    host = new AppHost(options({ dataSnapshot: { id: "copy", snapshot: async () => ({ ref: "snap" }), restore: async () => {} } }));
    const withSnapshot = renderChange("notes", await host.status("notes"), id, (await context()).ctx);
    expect(withSnapshot).toContain("Before it goes live, the Host saves a copy of your data.");
    expect(withSnapshot).toContain("I understand: if I go back later, anything saved after this won&#39;t be in the app.");
    const zh = renderChange("notes", status, id, { ...ctx, lang: "zh" });
    expect(zh).toContain("这个改动无法撤回");
    expect(zh).toContain("我明白：以后回退也找不回这些数据。");
  });

  test("going back says what happens to stored data, using what the Host knows", async () => {
    const snapshots: string[] = [];
    host = new AppHost(options({ dataSnapshot: { id: "copy", snapshot: async ({ version }) => (snapshots.push(version), { ref: `snap_${version}` }), restore: async () => {} } }));
    await host.create("todo");
    edit("todo", "src/list.ts", "export const list = [];\n");
    await host.submit({ name: "todo", intent: "add a list", agent: "claude-code" });
    edit("todo", "src/server.ts", "export const sql = 'DROP TABLE todos';\n");
    const drop = await host.submit({ name: "todo", intent: "drop the table", agent: "codex" });
    await host.resolve("todo", drop.change_id, "approved", "user:me");
    edit("todo", "src/more.ts", "export const more = 1;\n");
    await host.submit({ name: "todo", intent: "one more thing", agent: "codex" });
    const { ctx } = await context();
    const status = await host.status("todo");
    const history = host.history("todo");

    const plain = surface(renderBack("todo", status, history, "v3", host.undoPlan("todo", "v3"), ctx));
    expect(plain).toContain("Go back to “drop the table”?");
    expect(plain).toContain("Your stored data stays as it is.");
    expect(plain).not.toContain("data-arms");

    const back = renderBack("todo", status, history, "v2", host.undoPlan("todo", "v2"), ctx);
    expect(surface(back)).toContain("Your stored data goes back to the copy saved");
    expect(surface(back)).toContain("before “drop the table”. Anything saved after that is set aside and won&#39;t be in the app.");
    expect(back).toContain('data-arms="back-go"');
    expect(back).toContain('data-to="v2" data-accept="1"');
    // The Host's own words are under Details.
    expect(back).toContain(esc("snap_v2"));
    expect(back).toContain("undo --to v2 &quot;&lt;why&gt;&quot; --app todo --accept-one-way");

    // Without the capability: only code goes back, and the confirmation says so.
    host = new AppHost(options());
    const none = renderBack("todo", status, history, "v2", host.undoPlan("todo", "v2"), (await context()).ctx);
    expect(surface(none)).toContain("Your stored data can&#39;t be put back.");
    expect(none).toContain("I understand: the older version may not work with my data as it is now.");

    // An agent mid-change blocks going back; the current version and a version off the line say so.
    edit("todo", "src/wip.ts", "export const wip = 1;\n");
    const blocked = renderBack("todo", await host.status("todo"), history, "v3", host.undoPlan("todo", "v3"), ctx);
    expect(blocked).toContain("Your agent is in the middle of a change here (1 file edited, not sent yet).");
    expect(blocked).not.toContain('id="back-go"');
    expect(renderBack("todo", status, history, "v4", host.undoPlan("todo", "v4"), ctx)).toContain("This is the version running now.");
  });

  test("a picture when there is one, a designed placeholder when not, and why there is none", async () => {
    await host.create("todo");
    await host.create("locked");
    const { ctx, overview } = await context("en", {
      enabled: true,
      latest: (name) => (name === "todo" ? { file: "todo--v1--1.jpg", at: new Date().toISOString(), key: "v1", kind: "version" } : null),
      preview: () => null,
      miss: (name) => (name === "locked" ? { at: new Date().toISOString(), reason: "needs_sign_in" } : null),
    });
    const html = renderHome(overview, ctx);
    expect(html).toContain('<img src="/pictures/todo--v1--1.jpg"');
    expect(html).toContain("Asks visitors to sign in, so there is no picture");
    expect(html).toMatch(/<div class="ph hue-\d"><span class="ph-mark">L<\/span>/);
    // With no screenshot browser at all, the placeholder carries no caption.
    expect(renderHome(overview, { ...ctx, pictures: NO_PICTURES })).not.toContain("No picture yet");
  });

  test("the language: ?lang first, then the browser's languages, then English", () => {
    expect(chooseLang("zh", "en-US")).toBe("zh");
    expect(chooseLang(null, "zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh");
    expect(chooseLang(null, "fr-FR,en;q=0.5,zh;q=0.3")).toBe("en");
    expect(chooseLang("de", undefined)).toBe("en");
  });

  test("a waiting change or history line written by hand, of any shape, does not take a view down", async () => {
    await host.create("notes");
    const pending = join(work, "apps", "notes", ".pneuma", "pending");
    mkdirSync(pending, { recursive: true });
    writeFileSync(join(pending, "c-hand.json"), JSON.stringify({ change_id: "c-hand", created_at: "2026-11-24T08:00:00.000Z", intent: HOSTILE, risks: "<b>all</b>", disclosure: "<i>none</i>", one_way: "<b>yes</b>", checks: 5 }));
    appendFileSync(join(work, "apps", "notes", ".pneuma", "history.jsonl"), `${JSON.stringify(null)}\n${JSON.stringify({ kind: "restore", outcome: "rolled_back", version: 7 })}\n`);
    const { ctx, overview } = await context();
    const status = await host.status("notes");
    for (const html of [renderHome(overview, ctx), renderApp("notes", status, host.history("notes"), ctx), renderChange("notes", status, "c-hand", ctx)]) {
      expect(html).toContain("</html>");
      expect(html).not.toContain("<b>");
    }
  });
});

describe("the owner page: how it is served", () => {
  async function serve(via: AppHost = host, extra: Parameters<typeof createHostServer>[1] = {}) {
    const server = createHostServer(via, extra);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
  }

  test("every view is served with a policy that runs only its own script, frames nothing and is framed by nothing; reading changes no record", async () => {
    const { id } = await waitingDrop();
    edit("notes", "src/draft.ts", "export const draft = true;\n");
    const before = readFileSync(join(work, "apps", "notes", ".pneuma", "history.jsonl"), "utf8");
    const uncommitted = (await host.status("notes")).uncommitted;
    expect(uncommitted).toContain("src/draft.ts");
    const { server, base } = await serve();
    try {
      for (const path of ["/", "/app/notes", `/app/notes/change/${id}`, "/app/notes/back/v1"]) {
        const res = await fetch(`${base}${path}`);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
        const csp = res.headers.get("content-security-policy")!;
        const nonce = /script-src 'nonce-([^']+)'/.exec(csp)?.[1];
        expect(nonce).toBeTruthy();
        expect(csp).toContain("default-src 'none'");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("frame-src 'none'");
        expect(csp).toContain("img-src 'self'");
        expect(csp).toContain("connect-src 'self'");
        expect(csp).not.toContain("unsafe-inline");
        expect(res.headers.get("x-frame-options")).toBe("DENY");
        expect(res.headers.get("referrer-policy")).toBe("no-referrer");
        const html = await res.text();
        expect(html).toStartWith("<!doctype html>");
        for (const tag of tags(html).filter((t) => t.name === "script" && !t.attrs.includes("application/json"))) expect(tag.attrs).toContain(`nonce="${nonce}"`);
        expect(html).not.toMatch(/<(iframe|link|form)\b/);
      }
      expect(readFileSync(join(work, "apps", "notes", ".pneuma", "history.jsonl"), "utf8")).toBe(before);
      expect((await host.status("notes")).uncommitted).toEqual(uncommitted);
    } finally {
      server.close();
    }
  });

  test("the language follows the browser unless the address names one; an unknown app is a plain 404", async () => {
    await host.create("notes");
    const { server, base } = await serve();
    try {
      expect(await (await fetch(`${base}/`, { headers: { "accept-language": "zh-CN,zh;q=0.9" } })).text()).toContain('<html lang="zh-CN"');
      expect(await (await fetch(`${base}/?lang=en`, { headers: { "accept-language": "zh-CN" } })).text()).toContain('<html lang="en"');
      const missing = await fetch(`${base}/app/nothing-here`);
      expect(missing.status).toBe(404);
      expect(await missing.text()).toContain("There is nothing here.");
      expect((await fetch(`${base}/app/..%2F..%2Fetc`)).status).toBe(404);
    } finally {
      server.close();
    }
  });

  test("the JSON API is unchanged beside the page: /apps answers JSON, /app answers the page", async () => {
    await host.create("notes");
    const { server, base } = await serve();
    try {
      const api = await fetch(`${base}/apps/notes`);
      expect(api.headers.get("content-type")).toBe("application/json");
      expect(await api.json()).toMatchObject({ app_id: "notes", active_version: "v1" });
      expect((await fetch(`${base}/apps`)).headers.get("content-type")).toBe("application/json");
      expect((await fetch(`${base}/app/notes`)).headers.get("content-type")).toBe("text/html; charset=utf-8");
    } finally {
      server.close();
    }
  });

  test("a page that cannot be drawn answers 500 instead of leaving the request open", async () => {
    const broken = { overview: async () => ({ summaries: null, apps: [] }), hostUrl: undefined } as unknown as AppHost;
    const { server, base } = await serve(broken);
    try {
      const res = await fetch(`${base}/`, { signal: AbortSignal.timeout(5_000) });
      expect(res.status).toBe(500);
      expect(await res.text()).toStartWith("the page could not be shown: ");
    } finally {
      server.close();
    }
  });

  test("each app is shown under its directory name, which every command takes, whatever app.json says", async () => {
    await host.create("notes");
    const info = join(work, "apps", "notes", ".pneuma", "app.json");
    writeFileSync(info, JSON.stringify({ ...JSON.parse(readFileSync(info, "utf8")), app_id: "<b>renamed</b>" }));
    const { ctx, overview } = await context();
    const html = renderHome(overview, ctx);
    expect(html).toContain('href="/app/notes?lang=en"');
    expect(html).not.toContain("renamed");
  });
});
