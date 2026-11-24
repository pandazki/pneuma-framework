import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppHost, type AppHostOptions, type AppStatus } from "../src/host";
import { appModel, appState, backModel, changeModel, homeModel, json, loadPageAssets, missingModel, NO_PICTURES, renderShell, type Overview, type PageAssets, type PageContext, type PictureLookup } from "../src/page";
import { chooseLang } from "../src/page-words";
import { loadRiskPolicy } from "../src/policy";
import { createHostServer } from "../src/server";
import { OwnerContext, PageContext as ClientPage, type OwnerState } from "../web/src/lib";
import type { HistoryRow, PageModel, Rich } from "../src/page-model";
import { View } from "../web/src/view";
import { FakeSpace, templateTests } from "./fake-space";

// The owner page is built in two halves: the server decides and words each view (src/page.ts, as a JSON model),
// and the client in web/ lays it out with Beautiful UI's components. These tests check both: the model says the
// right things in the person's words, and the client, rendered here with React's own server renderer, shows them
// as text, with the owner's controls only where the owner link is held.

const EXAMPLE = join(import.meta.dir, "..");
const HOSTILE = `"><script>alert(1)</script><img src=x onerror=alert(2)>'&`;

let work: string;
let space: FakeSpace;
let host: AppHost;
let assets: PageAssets;

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

/** The client's markup for a view, as a tab that holds the owner link (or not) sees it. */
function draw(model: PageModel, owner: OwnerState = "no"): string {
  return renderToStaticMarkup(
    createElement(ClientPage.Provider, { value: model }, createElement(OwnerContext.Provider, { value: { state: owner, lose: () => {} } }, createElement(View, { model, onSearch: () => {} }))),
  );
}

/** Text the way React writes it into markup. */
const text = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const words = (rich: Rich | null | undefined) => (rich ? rich.parts.map((part) => (typeof part === "string" ? part : `{${part.mode}}`)).join("") : "");
/** What a history row says without opening Details. */
const said = (row: HistoryRow) => JSON.stringify({ ...row, facts: undefined, id: undefined });
const facts = (row: { facts: readonly { value: string }[] }) => row.facts.map((fact) => fact.value).join(" | ");

/** Every tag in some markup, with its attributes. */
const tags = (html: string) => [...html.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)].map(([, name, attrs]) => ({ name: name!.toLowerCase(), attrs: attrs ?? "" }));

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "space-all-in-one-page-"));
  space = new FakeSpace();
  host = new AppHost(options());
  // A stand-in for web/dist: the shell and the asset route only need the files to exist.
  const dist = join(work, "dist");
  mkdirSync(join(dist, "fonts"), { recursive: true });
  writeFileSync(join(dist, "app.js"), "console.log('page')\n");
  writeFileSync(join(dist, "app.css"), "body{color:red}\n");
  writeFileSync(join(dist, "fonts", "inter-latin-wght-normal.woff2"), "wOF2");
  assets = loadPageAssets(dist);
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
  test("every view keeps what an agent or a person wrote as text: in the page's data, and in what the client draws", async () => {
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
    const models: PageModel[] = [
      homeModel(overview, ctx),
      appModel("notes", status, host.history("notes"), ctx),
      changeModel("notes", status, waiting.change_id, ctx),
      backModel("notes", status, host.history("notes"), "v1", host.undoPlan("notes", "v1"), ctx),
    ];
    const allowed = new Set(["html", "head", "meta", "title", "script", "link", "body", "div", "noscript", "p"]);
    for (const [i, model] of models.entries()) {
      // The page as served: a shell around the view's data. Nothing in the data can close its script element.
      const shell = renderShell(model, "test-nonce", assets);
      expect([i, shell.includes("\\u003cscript\\u003ealert(1)\\u003c/script\\u003e")]).toEqual([i, true]);
      expect(shell).not.toContain("<script>alert(1)");
      expect(shell).not.toContain("<img src=x");
      for (const tag of tags(shell)) {
        expect(allowed.has(tag.name)).toBe(true);
        expect(tag.attrs).not.toMatch(/\son\w+\s*=/i);
        expect(tag.attrs).not.toMatch(/\sstyle\s*=/i);
        if (tag.name === "script") expect(tag.attrs).toMatch(/nonce="test-nonce"|type="application\/json"/);
      }
      expect(JSON.parse(/<script type="application\/json" id="model">([\s\S]*?)<\/script>/.exec(shell)![1]!)).toEqual(JSON.parse(JSON.stringify(model)));
      // What the client draws from it: the same words, as text, for the owner and for anyone else.
      for (const owner of ["yes", "no"] as const) {
        const html = draw(model, owner);
        expect([i, owner, html.includes(text(`“${HOSTILE}”`))]).toEqual([i, owner, true]);
        for (const raw of ["<script", "<img src=x", "<b>", "<em>", "<i>", "<u>", "<s>"]) expect(html).not.toContain(raw);
        for (const tag of tags(html)) expect(tag.attrs).not.toMatch(/\son\w+\s*=/i);
      }
    }
    const change = draw(models[2]!, "yes");
    expect(change).toContain(text("src/<b>bold</b>.ts"));
    expect(change).toContain(text("codex<i>"));
    // The search data rides in the page's data, as text.
    expect(models[0]!.search.find((entry) => entry.name === "notes")?.words).toContain(HOSTILE);
  });

  test("the client never puts markup from data into the page", () => {
    const sources = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? (name === "dist" ? [] : sources(join(dir, name))) : /\.tsx?$/.test(name) ? [join(dir, name)] : []));
    const files = sources(join(EXAMPLE, "web"));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const sink of ["dangerouslySetInnerHTML", "innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function"]) expect([file, source.includes(sink)]).toEqual([file, false]);
    }
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
    const en = homeModel(overview, ctx);
    expect(Object.fromEntries(en.apps.map((app) => [app.name, [app.stateLabel, app.tone]]))).toEqual({
      asks: ["A change is waiting for you", "orange"],
      broken: ["Can't read this app", "neutral"],
      calm: ["Running normally", "green"],
      failed: ["The last change didn't go live", "red"],
      unsure: ["Can't confirm what's running", "neutral"],
    });
    const zh = homeModel(overview, { ...ctx, lang: "zh" });
    expect(zh.apps.map((app) => app.stateLabel).sort()).toEqual(["上次的改动没有上线", "无法确认正在运行的版本", "无法读取这个应用", "有改动等你确认", "运行正常"].sort());
    expect(renderShell(zh, "n", assets)).toContain('<html lang="zh-CN"');
    const zhPage = draw(zh);
    for (const line of ["等你确认", "全部应用", "运行正常"]) expect(zhPage).toContain(line);
    // The app's own view says in plain words what the Host does not know.
    const unsure = appModel("unsure", await host.status("unsure"), host.history("unsure"), ctx).notices;
    // The address nobody saw answer holds nothing up: said as a caution, not as a refusal.
    expect(unsure.map((notice) => notice.tone)).toEqual(["orange"]);
    expect(unsure[0]!.text).toContain("Nothing is held up");
    expect(unsure[0]!.text).toContain("The Host can't tell which version your app's address shows right now");
    expect(appModel("calm", await host.status("calm"), host.history("calm"), ctx).notices).toEqual([]);
    // Waiting changes come first, above the grid.
    expect(en.waiting.map((card) => [card.app, card.intent, card.oneWay])).toEqual([["asks", "“start over”", true]]);
    const page = draw(en);
    expect(page.indexOf("Waiting for you")).toBeLessThan(page.indexOf("All apps"));
    expect(page.indexOf("“start over”")).toBeLessThan(page.indexOf("All apps"));
  });

  test("\"you confirmed it\" is said only when the app's owner is among the approvers, not for any user: subject", async () => {
    await host.create("todo");
    edit("todo", "src/server.ts", "export const sql = `ALTER TABLE todos DROP COLUMN note`;\n");
    const drop = await host.submit({ name: "todo", intent: "drop the note column", agent: "codex" });
    await host.resolve("todo", drop.change_id, "approved", "user:me");
    const { ctx } = await context();
    const standing = async () => words(appModel("todo", await host.status("todo"), host.history("todo"), ctx).history.find((row) => row.title === "“drop the note column”")!.standing);
    expect(await standing()).toBe("Checked and tried out · you confirmed it");
    // The app has another owner now: user:me approved it, and that is not "you".
    const info = join(work, "apps", "todo", ".pneuma", "app.json");
    writeFileSync(info, JSON.stringify({ ...JSON.parse(readFileSync(info, "utf8")), owner: "user:someone-new" }));
    expect(await standing()).toBe("Checked and tried out · approved by user:me");
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
    const model = appModel("todo", await host.status("todo"), host.history("todo"), ctx);
    const rows = Object.fromEntries(model.history.map((row) => [row.title, row]));
    expect(words(rows["“add a list”"]!.standing)).toBe("Checked and tried out · approved automatically as a routine change");
    expect(words(rows["“drop the note column”"]!.standing)).toBe("Checked and tried out · you confirmed it");
    expect(rows["“drop the note column”"]!.oneWay?.body).toBe("It deletes or rewrites data you already have, and going back won't bring that data back.");
    expect(rows["“drop the note column”"]!.pill).toEqual({ label: "Undone", tone: "neutral" });
    expect(words(rows["“add a file without checks”"]!.standing)).toBe("Went live without checks");
    expect(rows["“add a file without checks”"]!.pill).toEqual({ label: "Running now", tone: "green" });
    expect(words(rows["Went back to “add a list”"]!.standing)).toBe("Only the app went back; your stored data stayed as it was.");
    expect(rows["“add a list”"]!.back).toBe("/app/todo/back/v2?lang=en");
    const read = model.history.map(said).join("\n");
    for (const term of ["verified", "previewed", "sealed", "source_code_change", "destructive_definition", "policy:auto", drop.change_id]) expect(read).not.toContain(term);
    // ...and all of them are there for whoever opens Details.
    const details = model.history.map(facts).join("\n");
    for (const term of ["verified, previewed, approved, sealed", "source_code_change", "policy:auto", drop.change_id, "undo --to v1"]) expect(details).toContain(term);
    // The client shows each row with its pill and its way back, behind the same disclosure.
    const page = draw(model, "yes");
    for (const line of ["“add a list”", "Running now", "Undone", "Go back to this", "Details", "Can&#x27;t be undone by going back"]) expect(page).toContain(line);
    const zh = appModel("todo", await host.status("todo"), host.history("todo"), { ...ctx, lang: "zh" });
    const zhRead = zh.history.map(said).join("\n");
    for (const line of ["检查过，也试运行过 · 例行改动，自动通过", "检查过，也试运行过 · 你确认过", "未经检查直接上线", "回到了“add a list”的版本", "正在运行"]) expect(zhRead).toContain(line);
    expect(draw(zh)).toContain("回到这个版本");
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
    const model = changeModel("notes", await host.status("notes"), result.change_id, ctx);
    expect(model.gone).toBe(false);
    expect(model.intent).toBe("“let my family in without signing in”");
    expect(words(model.meta)).toBe("Claude Code made this change · {rel}");
    expect(model.checked.map((row) => row.text)).toEqual(["Its tests passed (2 tests, 0 of them for this app)", "None of those tests were written for this app itself.", "It started when it was tried out", "1 file changed"]);
    // Only what the standing policy could not approve is why it waits: not the code change itself.
    expect(model.why).toEqual(["Anyone with the address could open the app without signing in."]);
    expect(model.oneWay).toBeNull();
    expect(model.decision).toMatchObject({
      approveUrl: `/owner/apps/notes/changes/${result.change_id}/approve`,
      denyUrl: `/owner/apps/notes/changes/${result.change_id}/deny`,
      doneLive: "/app/notes?done=live&lang=en",
      oneWay: false,
      check: null,
    });
    expect(model.decision.lines).toContain("After this, anyone with the address can open it without signing in.");
    expect(facts(model)).toContain(`approve ${result.change_id} --app notes`);
    // The decisions are the owner's: shown only where this tab holds the owner link, with a plain line for everyone else.
    const owner = draw(model, "yes");
    expect(owner).toContain(">Let it go live<");
    expect(owner).toContain(">Not this time<");
    expect(owner).not.toContain("To decide here, open this page from your owner link.");
    for (const state of ["no", "lost", "off"] as const) {
      const other = draw(model, state);
      expect(other).not.toContain(">Let it go live<");
      expect(other).not.toContain(">Not this time<");
      expect(other).toContain("To decide here, open this page from your owner link.");
    }
    expect(draw(model, "checking")).not.toContain(">Let it go live<");
    // The preview stays up as an ephemeral app on PneumaSpace while the change waits: linked, with when it ends.
    expect(model.after).toMatchObject({ open: expect.stringMatching(/^http:\/\/space\.test\/apps\/notes-pv[a-z0-9]{4}\/$/), empty: null, again: null });
    expect(model.after.note?.parts[0]).toBe("ends itself ");
  });

  test("the preview comes from status as PneumaSpace answers: linked while it stands, when it ends, and 'show it to me again' once it has ended", async () => {
    const { id, status } = await waitingDrop();
    const { ctx } = await context();
    const previewApp = `notes-pv${id.slice(-4)}`;
    const address = `http://space.test/apps/${previewApp}/`;
    // Standing: linked, with when it ends itself, and nothing holds the decision up.
    const standing = changeModel("notes", status, id, ctx);
    expect(standing.after.open).toBe(address);
    expect(standing.after.note?.parts[0]).toBe("ends itself ");
    expect(standing.decision.blocked).toBeNull();
    expect(draw(standing, "yes")).toContain("<span>ends itself </span><time");

    // The page links only an address on the app's own runtime, whatever status says.
    for (const [href, linked] of [
      [address, true],
      ["javascript:alert(1)", false],
      ["http://elsewhere.test/apps/notes-pv1234/", false],
    ] as const) {
      const said = { ...status, pending: status.pending.map((p) => ({ ...p, preview: { state: "standing" as const, app: previewApp, address: href, expires_at: null } })) };
      const model = changeModel("notes", said, id, ctx);
      expect([href, model.after.open]).toEqual([href, linked ? href : null]);
      expect(draw(model).includes(`href="${href}"`)).toBe(linked);
    }

    // Ended (discarded at PneumaSpace): no link, approving is held up with why, and the owner is offered a new preview.
    await space.discard(previewApp, "pneuma-host");
    const gone = changeModel("notes", await host.status("notes"), id, ctx);
    expect(gone.after).toMatchObject({ open: null, empty: { text: "The preview isn't running any more." }, again: { label: "Show it to me again", url: `/owner/apps/notes/changes/${id}/preview` } });
    expect(gone.decision.blocked).toBe("Look at it first: the preview isn't running, and a change goes live only after you could see it. Use “Show it to me again” above.");
    expect(draw(gone, "yes")).toContain(">Show it to me again<");
    expect(draw(gone, "yes")).toMatch(/<button[^>]*disabled=""[^>]*>Let it go live<\/button>/);
    expect(draw(gone, "yes")).toContain(">Not this time<");
    expect(draw(gone, "no")).not.toContain(">Show it to me again<");
    expect(draw(gone, "yes")).toContain("The preview isn&#x27;t running any more.");
    expect(gone.facts.map((f) => f.value)).toContainEqual(expect.stringContaining(`${previewApp} (no longer running): the preview ${previewApp} is no longer on PneumaSpace`));

    // Unknown: PneumaSpace did not answer, and the preview may still stand. The page says so, holds approving up,
    // and offers no new preview, which would replace one that may be running.
    const lookUp = space.app.bind(space);
    space.app = async () => {
      throw new Error("no answer");
    };
    const unknown = changeModel("notes", await host.status("notes"), id, ctx);
    space.app = lookUp;
    expect(unknown.after.empty?.text).toBe("The Host couldn't check whether the preview is still running.");
    expect(unknown.after.again).toBeNull();
    expect(unknown.facts.map((f) => f.value)).toContainEqual(`${previewApp} (unknown): PneumaSpace did not say whether the preview ${previewApp} still stands (no answer)`);
    expect(unknown.decision.blocked).toBe("The Host couldn't check the preview just now, and a change goes live only after you could see it. Reload in a minute.");
    const zh = changeModel("notes", await host.status("notes"), id, { ...ctx, lang: "zh" });
    expect(zh.after).toMatchObject({ empty: { text: "预览已经不在运行了。" }, again: { label: "再给我看一次" } });
    expect(zh.decision.blocked).toContain("再给我看一次");
  });

  test("another manager on PneumaSpace, an unmanaged app, and a file that is not a waiting change: each has its place in plain words", async () => {
    const { id } = await waitingDrop();
    const { ctx } = await context();
    // Nobody manages it (someone cleared it at the console): going live or back says it will mark this Host, and the done line says it did.
    space.setManager("notes", null);
    let status = await host.status("notes");
    const unmanaged = changeModel("notes", status, id, ctx);
    expect(unmanaged.decision.marks).toBe("PneumaSpace doesn't list who runs this app yet; letting this go live records this Host as the one that does.");
    expect(unmanaged.decision.doneLive).toContain("done=live_marked");
    expect(draw(unmanaged, "yes")).toContain("letting this go live records this Host");

    // Another manager runs it: the app, the change and going back say so; approving is held up, saying no is not.
    space.setManager("notes", { name: "other-studio", url: "http://studio.test/" });
    status = await host.status("notes");
    const app = appModel("notes", status, host.history("notes"), ctx);
    expect(app.notices[0]).toEqual({ tone: "red", text: expect.stringContaining("other-studio runs this app on PneumaSpace, not this Host.") });
    expect(app.facts).toContainEqual({ label: "On PneumaSpace", value: expect.stringContaining("notes is managed on PneumaSpace by other-studio (http://studio.test/), not by this Host (pneuma-host)") });
    const change = changeModel("notes", status, id, ctx);
    expect(change.decision.blocked).toBe("This can't go live from here: other-studio runs this app on PneumaSpace, not this Host. You can still say no.");
    expect(change.notices.map((n) => n.text)).toContainEqual(expect.stringContaining("other-studio runs this app"));
    const page = draw(change, "yes");
    expect(page).toMatch(/<button[^>]*disabled=""[^>]*>Let it go live<\/button>/);
    expect(page).not.toMatch(/<button[^>]*disabled=""[^>]*>Not this time<\/button>/);
    expect(changeModel("notes", status, id, { ...ctx, lang: "zh" }).decision.blocked).toContain("由 other-studio 管理");
    // And the Host refuses it, which the page words in one sentence.
    await expect(host.resolve("notes", id, "approved", "user:me")).rejects.toMatchObject({ status: 409, reason: "managed_elsewhere" });
    expect(change.refusals.managed_elsewhere).toBe("Nothing happened: another manager runs this app on PneumaSpace, and this Host doesn't change an app someone else runs. The Host's words below say how to settle it.");
    space.setManager("notes", { name: "pneuma-host" });

    // A hand-written file among the waiting changes: named on home and in the app, and its page says it cannot be decided.
    writeFileSync(join(work, "apps", "notes", ".pneuma", "pending", "c-hand.json"), JSON.stringify({ change_id: "c-hand", intent: HOSTILE }));
    const overview = await host.overview();
    const home = homeModel(overview, { ...ctx, apps: overview.summaries });
    expect(home.problems).toEqual([
      { app: "notes", appTitle: "Notes", href: "/app/notes?lang=en", text: "A change in Notes can't be decided: its file isn't in the shape the Host writes. Ask your agent to look at it, or delete it.", line: expect.stringContaining(".pneuma/pending/c-hand.json is not a waiting change") },
    ]);
    expect(home.waiting.map((card) => card.app)).toEqual(["notes"]);
    const html = draw(home);
    expect(html).toContain("A change in Notes can&#x27;t be decided");
    expect(html).not.toContain(HOSTILE);
    status = await host.status("notes");
    expect(changeModel("notes", status, "c-hand", ctx)).toMatchObject({ gone: true, intent: "This change can't be decided: its file isn't in the shape the Host writes." });
    expect(appModel("notes", status, host.history("notes"), ctx).notices.map((n) => n.text)).toContain(
      "A change here can't be decided: its file (.pneuma/pending/c-hand.json) isn't in the shape the Host writes. Ask your agent to look at it, or delete it.",
    );
  });

  test("a one-way change needs a second, deliberate confirmation that states the consequence", async () => {
    const { id, status } = await waitingDrop();
    const { ctx } = await context();
    const model = changeModel("notes", status, id, ctx);
    expect(model.oneWay?.title).toBe("This one can't be taken back");
    expect(model.decision.oneWay).toBe(true);
    expect(model.decision.consequence).toContain("If you go back later, only the app goes back. The data this change removes stays removed");
    expect(model.decision.check).toBe("I understand: going back later won't bring this data back.");
    expect(model.decision.lines).not.toContain("You can go back to the current version later.");
    // The confirmation is drawn for the owner with its box, which Go live waits for.
    const page = draw(model, "yes");
    expect(page).toContain("This one can&#x27;t be taken back");
    expect(page).toContain('type="checkbox"');
    expect(page).toContain("I understand: going back later won&#x27;t bring this data back.");
    // With a data snapshot capability, the consequence is the snapshot's.
    host = new AppHost(options({ dataSnapshot: { id: "copy", snapshot: async () => ({ ref: "snap" }), restore: async () => {} } }));
    const withSnapshot = changeModel("notes", await host.status("notes"), id, (await context()).ctx);
    expect(withSnapshot.decision.consequence).toContain("Before it goes live, the Host saves a copy of your data.");
    expect(withSnapshot.decision.check).toBe("I understand: if I go back later, anything saved after this won't be in the app.");
    const zh = changeModel("notes", status, id, { ...ctx, lang: "zh" });
    expect(zh.oneWay?.title).toBe("这个改动无法撤回");
    expect(zh.decision.check).toBe("我明白：以后回退也找不回这些数据。");
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

    const plain = backModel("todo", status, history, "v3", host.undoPlan("todo", "v3"), ctx);
    // "Go back" sends the version this plan starts from, so the Host refuses it once the app has moved on.
    expect(plain).toMatchObject({ kind: "plan", heading: "Go back to “drop the table”?", check: null, accept: false, blocked: null, from: "v4" });
    expect(words(plain.data)).toBe("Your stored data stays as it is. Going back changes the app, not the data in it.");
    expect(plain.undone.map((row) => [row.title, row.oneWay])).toEqual([["“one more thing”", false]]);

    const back = backModel("todo", status, history, "v2", host.undoPlan("todo", "v2"), ctx);
    expect(words(back.data)).toBe("Your stored data goes back to the copy saved {abs}, before “drop the table”. Anything saved after that is set aside and won't be in the app.");
    expect(back).toMatchObject({ check: "I understand: anything saved after that copy won't be in the app.", accept: true, undoUrl: "/owner/apps/todo/undo", version: "v2" });
    expect(back.undone.map((row) => [row.title, row.oneWay])).toEqual([["“one more thing”", false], ["“drop the table”", true]]);
    // The Host's own words are under Details.
    expect(facts(back)).toContain("snap_v2");
    expect(facts(back)).toContain('undo --to v2 "<why>" --app todo --accept-one-way');
    const page = draw(back, "yes");
    expect(page).toContain(">Go back</button>");
    expect(page).toContain("I understand: anything saved after that copy won&#x27;t be in the app.");
    expect(draw(back, "no")).not.toContain(">Go back</button>");

    // Without the capability: only code goes back, and the confirmation says so.
    host = new AppHost(options());
    const none = backModel("todo", status, history, "v2", host.undoPlan("todo", "v2"), (await context()).ctx);
    expect(words(none.data)).toContain("Your stored data can't be put back.");
    expect(none.check).toBe("I understand: the older version may not work with my data as it is now.");

    // An agent mid-change blocks going back; the current version and a version off the line say so.
    edit("todo", "src/wip.ts", "export const wip = 1;\n");
    const blocked = backModel("todo", await host.status("todo"), history, "v3", host.undoPlan("todo", "v3"), ctx);
    expect(blocked.blocked).toBe("Your agent is in the middle of a change here (1 file edited, not sent yet). Going back would overwrite it, so ask your agent to finish or drop that work first.");
    expect(draw(blocked, "yes")).not.toContain(">Go back</button>");
    const current = backModel("todo", status, history, "v4", host.undoPlan("todo", "v4"), ctx);
    expect(current.kind).toBe("current");
    expect(draw(current)).toContain("This is the version running now.");
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
    const model = homeModel(overview, ctx);
    const shots = Object.fromEntries(model.apps.map((app) => [app.name, app.shot]));
    expect(shots.todo).toEqual({ src: "/pictures/todo--v1--1.jpg", monogram: "T", caption: null });
    expect(shots.locked).toEqual({ src: null, monogram: "L", caption: "Asks visitors to sign in, so there is no picture" });
    const page = draw(model);
    expect(page).toContain('src="/pictures/todo--v1--1.jpg"');
    expect(page).toContain("Asks visitors to sign in, so there is no picture");
    // A newer version that asks visitors to sign in is not shown by the older picture of its guest view.
    const later = await context("en", {
      enabled: true,
      latest: (name) => (name === "locked" ? { file: "locked--v0--1.jpg", at: new Date().toISOString(), key: "v0", kind: "version" } : null),
      preview: () => null,
      miss: (name, key) => (name === "locked" && key === "v1" ? { at: new Date().toISOString(), reason: "needs_sign_in" } : null),
    });
    const lockedNow = homeModel(later.overview, later.ctx).apps.find((app) => app.name === "locked")!;
    expect(lockedNow.shot).toEqual({ src: null, monogram: "L", caption: "Asks visitors to sign in, so there is no picture" });
    // With no screenshot browser at all, the placeholder carries no caption.
    const off = homeModel(overview, { ...ctx, pictures: NO_PICTURES });
    expect(off.apps.map((app) => app.shot.caption)).toEqual([null, null]);
    expect(draw(off)).not.toContain("No picture yet");
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
    writeFileSync(join(pending, "c-hand.json"), JSON.stringify({ change_id: "c-hand", created_at: "2026-11-24T08:00:00.000Z", intent: HOSTILE, risks: "<b>all</b>", disclosure: "<i>none</i>", one_way: "<b>yes</b>", checks: 5, preview: { state: "standing", address: ["x"] } }));
    appendFileSync(join(work, "apps", "notes", ".pneuma", "history.jsonl"), `${JSON.stringify(null)}\n${JSON.stringify({ kind: "restore", outcome: "rolled_back", version: 7 })}\n`);
    const { ctx, overview } = await context();
    const status = await host.status("notes");
    for (const model of [homeModel(overview, ctx), appModel("notes", status, host.history("notes"), ctx), changeModel("notes", status, "c-hand", ctx), missingModel(ctx)]) {
      expect(renderShell(model, "n", assets)).toContain("</html>");
      for (const owner of ["yes", "no"] as const) expect(draw(model, owner)).not.toContain("<b>");
    }
  });
});

describe("the owner page: how it is served", () => {
  async function serve(via: AppHost = host, extra: Parameters<typeof createHostServer>[1] = {}) {
    const server = createHostServer(via, { assets, ...extra });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
  }

  test("every view is served with a policy that runs only its own scripts, frames nothing and is framed by nothing; reading changes no record", async () => {
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
        expect(csp).toContain(`script-src 'nonce-${nonce}';`);
        expect(csp).toContain("style-src 'self';");
        expect(csp).toContain("font-src 'self';");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("frame-src 'none'");
        expect(csp).toContain("img-src 'self'");
        expect(csp).toContain("connect-src 'self'");
        expect(csp).not.toContain("unsafe");
        expect(res.headers.get("x-frame-options")).toBe("DENY");
        expect(res.headers.get("referrer-policy")).toBe("no-referrer");
        const html = await res.text();
        expect(html).toStartWith("<!doctype html>");
        const scripts = tags(html).filter((t) => t.name === "script" && !t.attrs.includes("application/json"));
        expect(scripts.length).toBe(2);
        for (const tag of scripts) expect(tag.attrs).toContain(`nonce="${nonce}"`);
        expect(html).toContain(`<script nonce="${nonce}" src="/assets/app.js?v=${assets.files.get("app.js")}" defer></script>`);
        expect(html).toContain(`<link rel="stylesheet" href="/assets/app.css?v=${assets.files.get("app.css")}">`);
        expect(tags(html).filter((t) => t.name === "link")).toHaveLength(2);
        expect(html).toContain('<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">');
        expect(html).not.toMatch(/<(iframe|form|img)\b/);
      }
      expect(readFileSync(join(work, "apps", "notes", ".pneuma", "history.jsonl"), "utf8")).toBe(before);
      expect((await host.status("notes")).uncommitted).toEqual(uncommitted);
    } finally {
      server.close();
    }
  });

  test("the built client is served from a fixed list of names, each with its own type, and nothing else", async () => {
    const { server, base } = await serve();
    try {
      for (const [path, type] of [
        ["/assets/app.js", "text/javascript; charset=utf-8"],
        ["/assets/app.css", "text/css; charset=utf-8"],
        ["/assets/fonts/inter-latin-wght-normal.woff2", "font/woff2"],
        ["/assets/icon.svg", "image/svg+xml"],
      ] as const) {
        const res = await fetch(`${base}${path}`);
        expect([path, res.status, res.headers.get("content-type"), res.headers.get("x-content-type-options")]).toEqual([path, 200, type, "nosniff"]);
      }
      for (const path of ["/assets/", "/assets/index.html", "/assets/../package.json", "/assets/%2e%2e/package.json", "/assets/fonts/../../src/page.ts", "/assets/app.js.map", "/assets/fonts/missing-wght-normal.woff2"]) {
        expect([path, (await fetch(`${base}${path}`)).status]).toEqual([path, 404]);
      }
      // The tab's icon runs nothing, so a browser never falls back to asking for /favicon.ico.
      expect((await fetch(`${base}/assets/icon.svg`)).headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
      expect(await (await fetch(`${base}/`)).text()).toContain('<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">');
      // Without a build the page still answers, and says how to make one.
      const bare = createHostServer(host, { assets: loadPageAssets(join(work, "no-dist")) });
      await new Promise<void>((resolve) => bare.listen(0, "127.0.0.1", resolve));
      try {
        const html = await (await fetch(`http://127.0.0.1:${(bare.address() as AddressInfo).port}/`)).text();
        expect(html).toContain("bun run build:page");
        expect(html).not.toContain("/assets/app.js");
      } finally {
        bare.close();
      }
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
      expect(await missing.text()).toContain("<title>There is nothing here.</title>");
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
    const model = homeModel(overview, ctx);
    expect(model.apps.map((app) => [app.name, app.href])).toEqual([["notes", "/app/notes?lang=en"]]);
    expect(json(model)).not.toContain("renamed");
  });
});
