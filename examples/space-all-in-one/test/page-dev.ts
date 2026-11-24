// Work on the owner page without the compose stack: `bun run dev:page` in examples/space-all-in-one.
//
// Starts the Host server on the tests' in-memory PneumaSpace (FakeSpace), with fixture apps in a temporary
// directory covering every state the page shows: running normally, a change waiting (on an app PneumaSpace lists
// no manager for, beside a hand-written file that is not a waiting change), a one-way change waiting whose
// preview has been discarded, a change that did not go live, an address nobody saw answer, an undo that did not
// finish, an app another manager runs, a long history with an undo, an app that asks visitors to sign in, and an
// app that cannot be read. A small fake ingress serves each
// app's live version (its src/page.html) and each waiting change's preview, and a local headless Chrome takes
// the pictures through the same DevTools interface the compose `screenshot` service offers.
//
//   bun run dev:page [--port 8095] [--ingress-port 8096] [--cdp-port 9335] [--snapshot] [--no-pictures]
//                    [--owner-token <token>] [--dir <path>]
//
// --snapshot starts the Host with a stand-in data snapshot capability, so one-way changes read the way they
// do with the postgres-template practice. The fixtures are rebuilt at every start, and so is the page's client
// (web/build.ts).
//
// Previews are ephemeral apps on the fake PneumaSpace, as on the real one: one waiting change's preview stands,
// the other's was discarded, and "Show it to me again" publishes it again (AppHost.preview).

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildPage } from "../web/build";
import { AppHost, type HostDataSnapshot } from "../src/host";
import { makeOwnerToken, ownerLink } from "../src/owner";
import { loadRiskPolicy } from "../src/policy";
import { cdpScreenshotter, runtimeAddressMapper, ScreenshotKeeper } from "../src/screenshots";
import { createHostServer } from "../src/server";
import { FakeSpace, templateTests } from "./fake-space";

const EXAMPLE = join(import.meta.dir, "..");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string, fallback: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1]! : fallback;
};
const port = Number(option("port", "8095"));
const ingressPort = Number(option("ingress-port", "8096"));
const cdpPort = Number(option("cdp-port", "9335"));
const ownerToken = option("owner-token", makeOwnerToken());
const work = option("dir", mkdtempSync(join(tmpdir(), "pneuma-owner-page-")));
const appsDir = join(work, "apps");
rmSync(appsDir, { recursive: true, force: true });
mkdirSync(appsDir, { recursive: true });

const ingress = `http://127.0.0.1:${ingressPort}`;

/** The fake runtime, at an address a browser can open. Apps start like the PneumaSpace template: sign-in not required. */
class DevSpace extends FakeSpace {
  readonly signIn = new Set(["notes", "locked"]);
  override async init(dir: string) {
    const result = await super.init(dir);
    const name = dir.split("/").at(-1)!;
    const manifest = JSON.parse(readFileSync(join(dir, "pneuma-space.json"), "utf8"));
    if (!this.signIn.has(name)) manifest.capabilities.identity = { required: false };
    writeFileSync(join(dir, "pneuma-space.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return result;
  }
  override address(name: string): string {
    return `${ingress}/apps/${name}/`;
  }
}
const space = new DevSpace();

const snapshot: HostDataSnapshot | undefined = flag("snapshot")
  ? {
      id: "dev-copy",
      setAsideNote: "The data in use now is kept beside it under another name.",
      snapshot: async ({ version }) => ({ ref: `snap_dev_${version}_${Date.now().toString(36)}` }),
      restore: async () => {},
    }
  : undefined;

const common = {
  appsDir,
  space,
  overlayDir: join(EXAMPLE, "overlay"),
  cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
  owner: "user:me",
  policy: loadRiskPolicy(join(EXAMPLE, "policy", "personal.json")),
  // `npm ci && npm test` stands in: the template's tests always pass, unless the draft carries src/TESTS_FAIL.
  runVerify: async (root: string) => (existsSync(join(root, "src", "TESTS_FAIL")) ? { ok: false, output: "1 test failed" } : templateTests(root)),
  hostUrl: `http://127.0.0.1:${port}`,
  consoleUrl: "http://127.0.0.1:8081/",
  ...(snapshot ? { dataSnapshot: snapshot } : {}),
  log: (line: string) => console.log(`[host] ${line}`),
};
const host = new AppHost(common);
const recording = new AppHost({ ...common, governance: "record" });

// --- what each app looks like ------------------------------------------------

function look(title: string, accent: string, inner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
body{margin:0;font:15px/1.5 -apple-system,"Segoe UI","PingFang SC",sans-serif;background:#f7f7f5;color:#1f2328}
header{display:flex;align-items:center;gap:12px;padding:22px 36px;background:#fff;border-bottom:1px solid #eceae6}
header b{font-size:20px}header i{width:28px;height:28px;border-radius:8px;background:${accent};display:inline-block}
main{padding:28px 36px;display:grid;gap:14px}
.card{background:#fff;border:1px solid #eceae6;border-radius:12px;padding:14px 18px;display:flex;align-items:center;gap:12px}
.box{width:18px;height:18px;border-radius:5px;border:2px solid ${accent}}.done{background:${accent}}
.muted{color:#7a7f87;font-size:13px}.grow{flex:1}.tag{font-size:12px;background:#f1efe9;border-radius:99px;padding:2px 9px}
.row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.big{font-size:26px;font-weight:700}
.bar{height:10px;border-radius:6px;background:${accent}}.btn{background:${accent};color:#fff;border-radius:8px;padding:8px 14px;font-weight:600}
.cover{height:120px;border-radius:8px;background:linear-gradient(135deg,${accent},#f3d9b1)}
.dots{display:grid;grid-template-columns:120px repeat(7,26px);gap:8px;align-items:center}.dot{width:22px;height:22px;border-radius:50%;background:#e9e6df}.on{background:${accent}}
</style></head><body><header><i></i><b>${title}</b><span class="grow"></span><span class="btn">+ New</span></header><main>${inner}</main></body></html>`;
}

const todoItems = (rows: [string, boolean, string?][]) =>
  rows.map(([text, done, due]) => `<div class="card"><span class="box ${done ? "done" : ""}"></span><span class="grow">${text}</span>${due ? `<span class="tag">${due}</span>` : ""}</div>`).join("");

const PAGES = {
  todo1: look("Todo", "#3b82f6", `<p class="muted">Nothing here yet.</p>`),
  todo2: look("Todo", "#3b82f6", todoItems([["Buy oat milk", false], ["Call the plumber", false], ["Return library books", true]])),
  todo3: look("Todo", "#3b82f6", `<p class="muted">2 left</p>${todoItems([["Buy oat milk", false], ["Call the plumber", false], ["Return library books", true]])}`),
  todo4: look("Todo", "#3b82f6", `<p class="muted">2 left</p>${todoItems([["Buy oat milk", false, "Today"], ["Call the plumber", false, "Fri"], ["Return library books", true, "Mon"]])}`),
  notes1: look("Notes", "#a855f7", `<div class="card"><span class="grow">Ideas for the garden</span><span class="muted">2 days ago</span></div><div class="card"><span class="grow">Trip to Kyoto</span></div>`),
  notes2: look(
    "Notes",
    "#a855f7",
    `<div class="row"><div class="card"><b>Home</b></div><div class="card"><b>Travel</b></div><div class="card"><b>Work</b></div><div class="card"><b>Recipes</b></div></div><div class="card"><span class="grow">Ideas for the garden</span><span class="tag">Home</span></div><div class="card"><span class="grow">Trip to Kyoto</span><span class="tag">Travel</span></div>`,
  ),
  budget1: look("Budget", "#10b981", `<div class="row"><div class="card"><div><div class="muted">This month</div><div class="big">¥ 8,420</div></div></div></div>`),
  budget2: look(
    "Budget",
    "#10b981",
    `<div class="row"><div class="card"><div><div class="muted">This month</div><div class="big">¥ 8,420</div></div></div><div class="card"><div><div class="muted">Food</div><div class="big">¥ 3,100</div></div></div><div class="card"><div><div class="muted">Transport</div><div class="big">¥ 1,240</div></div></div><div class="card"><div><div class="muted">Fun</div><div class="big">¥ 980</div></div></div></div>
<div class="card"><span style="width:120px">Food</span><div class="bar" style="width:62%"></div></div><div class="card"><span style="width:120px">Transport</span><div class="bar" style="width:25%"></div></div>`,
  ),
  budget3: look(
    "Budget",
    "#10b981",
    `<div class="row"><div class="card"><div><div class="muted">This month</div><div class="big">¥ 8,420</div></div></div><div class="card"><div><div class="muted">Food</div><div class="big">¥ 3,100</div></div></div><div class="card"><div><div class="muted">Transport</div><div class="big">¥ 1,240</div></div></div><div class="card"><div><div class="muted">Fun</div><div class="big">¥ 980</div></div></div></div>
<div class="card"><span style="width:120px">Food</span><div class="bar" style="width:62%"></div></div>`,
  ),
  reading1: look(
    "Reading list",
    "#f97316",
    `<div class="row">${["Piranesi", "The Overstory", "Klara and the Sun", "Stoner"].map((t) => `<div class="card" style="display:block"><div class="cover"></div><b>${t}</b></div>`).join("")}</div>`,
  ),
  habits1: look(
    "Habits",
    "#ef4444",
    `<div class="card"><div class="dots"><span></span>${"MTWTFSS".split("").map((d) => `<span class="muted">${d}</span>`).join("")}${[["Walk", 5], ["Read", 3], ["Stretch", 6]].map(([h, n]) => `<span>${h}</span>${Array.from({ length: 7 }, (_, i) => `<span class="dot ${i < Number(n) ? "on" : ""}"></span>`).join("")}`).join("")}</div></div>`,
  ),
  recipes: (n: number) =>
    look(
      "Recipes",
      "#eab308",
      `${n >= 9 ? `<div class="card"><span class="grow"><b>Tonight, why not:</b> Pad kra pao</span><span class="btn">Another one</span></div>` : ""}<div class="row">${["Miso soup", "Shakshuka", "Pad kra pao", "Lemon cake", "Dal", "Gyoza", "Focaccia", "Ramen"].slice(0, Math.min(8, 2 + n)).map((t) => `<div class="card" style="display:block"><div class="cover"></div><b>${t}</b><div class="muted">${20 + t.length} min${n >= 8 ? " · serves 2" : ""}</div></div>`).join("")}</div>`,
    ),
  locked1: look("Family photos", "#0ea5e9", `<p>Private.</p>`),
  garden1: look("Garden", "#22c55e", `<div class="card"><span class="grow">Tomatoes</span><span class="tag">March</span></div><div class="card"><span class="grow">Basil</span><span class="tag">April</span></div>`),
  garden2: look("Garden", "#22c55e", `<p class="muted">Sow this month</p><div class="card"><span class="grow">Tomatoes</span><span class="tag">March</span></div><div class="card"><span class="grow">Basil</span><span class="tag">April</span></div><div class="card"><span class="grow">Peas</span><span class="tag">March</span></div>`),
  shop1: look("Shop", "#8b5cf6", todoItems([["Rice", false], ["Eggs", false], ["Soap", true]])),
};

// --- the fixtures ----------------------------------------------------------

const edit = (name: string, rel: string, content: string) => {
  const file = join(appsDir, name, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};
const page = (name: string, html: string) => edit(name, "src/page.html", html);
const remove = (name: string, rel: string) => rmSync(join(appsDir, name, rel), { force: true });
const manifest = (name: string, change: (m: any) => void) => {
  const file = join(appsDir, name, "pneuma-space.json");
  const value = JSON.parse(readFileSync(file, "utf8"));
  change(value);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

async function submit(name: string, intent: string, agent: string, via: AppHost = host, oneWay?: string) {
  const agentProvenance = agent === "unknown" ? ({ source: "none" } as const) : ({ source: "detected", markers: [agent === "codex" ? "CODEX_SANDBOX" : "CLAUDECODE"] } as const);
  const result = await via.submit({ name, intent, agent, agentProvenance, ...(oneWay ? { oneWay } : {}) });
  console.log(`[dev] ${name}: "${intent}" -> ${result.status}${"version" in result ? ` ${result.version}` : ""}`);
  return result;
}

async function build() {
  // Running normally, with a few changes by two agents.
  await host.create("todo");
  page("todo", PAGES.todo1);
  await submit("todo", "start the page", "claude-code");
  page("todo", PAGES.todo2);
  await submit("todo", "add a todo list stored in the database, with a form to add items", "claude-code");
  page("todo", PAGES.todo3);
  await submit("todo", "show how many items are left", "codex");
  page("todo", PAGES.todo4);
  await submit("todo", "add a due date to each item", "claude-code");

  // A change waiting for the owner: it drops sign-in.
  await host.create("notes");
  page("notes", PAGES.notes1);
  await submit("notes", "a simple notes page", "claude-code");
  page("notes", PAGES.notes2);
  manifest("notes", (m) => (m.capabilities.identity = { required: false }));
  await submit("notes", "keep notes in folders, and let my family open them without signing in", "claude-code");
  // Someone cleared its manager at PneumaSpace's console: letting the change go live marks this Host again.
  space.setManager("notes", null);
  // What an agent can leave beside it: a file that is not a waiting change in the Host's shape.
  edit("notes", ".pneuma/pending/c-hand.json", JSON.stringify({ change_id: "c-hand", intent: "make it pink" }));

  // A one-way change waiting for the owner: it drops a column.
  await host.create("budget");
  page("budget", PAGES.budget1);
  await submit("budget", "track what I spend each month", "codex");
  page("budget", PAGES.budget2);
  await submit("budget", "split spending by category", "codex");
  page("budget", PAGES.budget3);
  edit("budget", "src/db.ts", "export const migrate = `ALTER TABLE expenses DROP COLUMN note`;\n");
  const budget = await submit("budget", "remove the note field from expenses, I never use it", "claude-code");
  // Its preview was discarded (or ended itself): approving waits until "Show it to me again".
  if (budget.status === "needs_approval") await space.discard(`budget-pv${budget.change_id.slice(-4)}`, "pneuma-host");

  // The last change did not go live: it did not start when it was tried out.
  await host.create("reading-list");
  page("reading-list", PAGES.reading1);
  await submit("reading-list", "a list of books I want to read, with covers", "claude-code");
  edit("reading-list", "src/BOOT_FAILS", "1\n");
  edit("reading-list", "src/goodreads.ts", "export const sync = true;\n");
  await submit("reading-list", "import my books from Goodreads", "codex");
  remove("reading-list", "src/BOOT_FAILS");
  remove("reading-list", "src/goodreads.ts");

  // The Host cannot confirm what is running: the release did not answer, and neither did putting v2 back.
  await host.create("habits");
  page("habits", PAGES.habits1);
  await submit("habits", "a weekly habit tracker", "claude-code");
  space.unhealthy = (name) => name === "habits";
  edit("habits", "src/reminders.ts", "export const remind = true;\n");
  await submit("habits", "remind me in the evening if I haven't ticked anything", "claude-code");
  space.unhealthy = null;

  // A long history: governed and recorded changes, a denial, a refusal, an approved one-way change, an undo.
  await host.create("recipes");
  const steps: [string, string][] = [
    ["a place to keep my recipes", "claude-code"],
    ["add a photo to each recipe", "claude-code"],
    ["show the cooking time", "codex"],
    ["let me search by ingredient", "codex"],
    ["group recipes by meal", "claude-code"],
  ];
  for (const [i, [intent, agent]] of steps.entries()) {
    page("recipes", PAGES.recipes(i));
    await submit("recipes", intent, agent);
  }
  edit("recipes", "public/ui.css", "body { color: red }\n");
  await submit("recipes", "make all text red", "codex");
  remove("recipes", "public/ui.css");
  await host.discard("recipes");
  page("recipes", PAGES.recipes(6));
  edit("recipes", "src/db.ts", "export const migrate = `DROP TABLE favourites`;\n");
  const drop = await submit("recipes", "drop the old favourites table, favourites are now a tag", "claude-code");
  if (drop.status === "needs_approval") await host.resolve("recipes", drop.change_id, "approved", "user:me");
  page("recipes", PAGES.recipes(7));
  edit("recipes", "src/print.ts", "export const print = true;\n");
  await submit("recipes", "a print view for one recipe", "claude-code", recording);
  page("recipes", PAGES.recipes(8));
  await submit("recipes", "bigger photos on the list", "unknown", recording);
  await host.undo("recipes", "the bigger photos look blurry", { actor: "user:me" });
  edit("recipes", "src/share.ts", "export const share = `DELETE FROM shares;`;\n");
  const share = await submit("recipes", "clear out all shared links", "codex");
  if (share.status === "needs_approval") await host.resolve("recipes", share.change_id, "denied", "user:me", "keep the links, I still use them");
  await host.discard("recipes");
  page("recipes", PAGES.recipes(9));
  await submit("recipes", "show a random recipe on the front page", "claude-code");
  // The agent is in the middle of something in another app.
  edit("todo", "src/wip.ts", "export const wip = true;\n");

  // An undo that did not finish: the record names v2, which has served, and the address serves v1. A change waits, held up.
  await host.create("garden");
  page("garden", PAGES.garden1);
  await submit("garden", "a planting calendar", "claude-code");
  page("garden", PAGES.garden2);
  await submit("garden", "show what to sow this month", "codex");
  edit("garden", "src/db.ts", "export const migrate = `DROP TABLE sown`;\n");
  await submit("garden", "forget what I sowed last year", "claude-code");
  const rollout = join(appsDir, "garden", ".pneuma", "release-rollout.json");
  const state = JSON.parse(readFileSync(rollout, "utf8"));
  state.active.candidate_id = "v2";
  writeFileSync(rollout, `${JSON.stringify(state, null, 2)}\n`);

  // Another manager runs it on PneumaSpace: a change waits, and only saying no works here.
  await host.create("shop");
  page("shop", PAGES.shop1);
  await submit("shop", "a list of things to buy", "codex");
  edit("shop", "src/db.ts", "export const migrate = `DELETE FROM bought`;\n");
  await submit("shop", "clear the bought list every Monday", "codex");
  space.setManager("shop", { name: "family-studio", url: "http://127.0.0.1:9000/" });

  // Asks visitors to sign in: no picture.
  await host.create("locked");
  page("locked", PAGES.locked1);
  await submit("locked", "a private family photo album", "codex");

  // An app the Host cannot read.
  edit("broken", ".pneuma/app.json", "{ this is not json");
}

/** Spread each app's history back in time, so the page reads like a few weeks of use. Newest entry first offset. */
function backdate() {
  const lastAgo: Record<string, number> = { todo: 12, notes: 95, budget: 6, "reading-list": 41, habits: 180, recipes: 300, locked: 60 * 26, garden: 70, shop: 20 };
  for (const name of readdirSync(appsDir)) {
    const file = join(appsDir, name, ".pneuma", "history.jsonl");
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
    let at = Date.now() - (lastAgo[name] ?? 30) * 60_000;
    const times: string[] = [];
    for (let i = lines.length - 1; i >= 0; i--) {
      times[i] = new Date(at).toISOString();
      at -= ((i * 7919) % 11) * 3_600_000 + 47 * 60_000;
    }
    const byChange = new Map<string, string>();
    const out = lines.map((line, i) => {
      const entry = JSON.parse(line);
      entry.at = times[i];
      if (entry.outcome === "needs_approval") byChange.set(entry.change_id, entry.at);
      return JSON.stringify(entry);
    });
    writeFileSync(file, `${out.join("\n")}\n`);
    const pendingDir = join(appsDir, name, ".pneuma", "pending");
    for (const pf of existsSync(pendingDir) ? readdirSync(pendingDir) : []) {
      const pending = JSON.parse(readFileSync(join(pendingDir, pf), "utf8"));
      if (byChange.has(pending.change_id)) pending.created_at = byChange.get(pending.change_id);
      writeFileSync(join(pendingDir, pf), `${JSON.stringify(pending, null, 2)}\n`);
    }
  }
}

// --- the fake ingress ------------------------------------------------------

function liveVersion(name: string): string | null {
  try {
    return JSON.parse(readFileSync(join(appsDir, name, ".pneuma", "release-rollout.json"), "utf8")).active?.candidate_id ?? null;
  } catch {
    return null;
  }
}

/** PneumaSpace's rule: sign-in is required unless the manifest says `identity.required: false`. */
function needsSignIn(root: string): boolean {
  try {
    const identity = JSON.parse(readFileSync(join(root, "pneuma-space.json"), "utf8")).capabilities?.identity;
    return identity !== undefined && identity?.required !== false;
  } catch {
    return false;
  }
}

const html = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });

const ingressServer = Bun.serve({
  port: ingressPort,
  hostname: "127.0.0.1",
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/_pneuma-space/login")) return html(`<!doctype html><meta charset="utf-8"><title>Sign in</title><form><label>Name <input name="name"></label><button>Sign in</button></form>`);
    const match = /^\/apps\/([a-z0-9-]+)\/$/.exec(url.pathname);
    if (!match) return html("not found", 404);
    let name = match[1]!;
    let root: string | null = null;
    const preview = /^(.+)-pv([a-z0-9]{4})$/.exec(name);
    if (preview) {
      name = preview[1]!;
      const drafts = join(appsDir, name, ".pneuma", "drafts");
      const id = existsSync(drafts) ? readdirSync(drafts).find((d) => d.endsWith(preview[2]!)) : undefined;
      root = id ? join(drafts, id) : null;
    } else {
      const version = liveVersion(name);
      root = version ? join(appsDir, name, ".pneuma", "versions", version) : null;
    }
    if (!root || !existsSync(root)) return html(`{"error":"no app at this address"}`, 404);
    if (needsSignIn(root)) return new Response(null, { status: 303, headers: { location: `/_pneuma-space/login?next=${encodeURIComponent(url.pathname)}` } });
    const file = join(root, "src", "page.html");
    return html(existsSync(file) ? readFileSync(file, "utf8") : look(name, "#64748b", "<p>Hello</p>"));
  },
});

// --- start -----------------------------------------------------------------

await buildPage();
await build();
backdate();

let chrome: ReturnType<typeof Bun.spawn> | undefined;
if (!flag("no-pictures")) {
  chrome = Bun.spawn([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${join(work, "chrome")}`, "about:blank"], {
    stdout: "ignore",
    stderr: "ignore",
  });
  for (let i = 0; i < 40; i++) {
    if (await fetch(`http://127.0.0.1:${cdpPort}/json/version`).then((r) => r.ok, () => false)) break;
    await Bun.sleep(250);
  }
}
const pictures = new ScreenshotKeeper({
  source: host,
  ...(chrome ? { shooter: cdpScreenshotter({ endpoint: `http://127.0.0.1:${cdpPort}` }) } : {}),
  dir: join(work, "state", "pictures"),
  insideUrl: runtimeAddressMapper(ingress, ingress),
  retryAfterMs: 30_000,
  log: (line) => console.log(`[host] ${line}`),
});
await pictures.scan();
pictures.start();

const server = createHostServer(host, { ownerToken, pictures });
server.listen(port, "127.0.0.1", () => {
  const { port: bound } = server.address() as AddressInfo;
  console.log(`\n[dev] apps directory: ${appsDir}`);
  console.log(`[dev] fake ingress: ${ingress}/apps/<name>/`);
  console.log(`[dev] the page (view only): http://127.0.0.1:${bound}/`);
  console.log(`[dev] owner link: ${ownerLink(`http://127.0.0.1:${bound}`, ownerToken)}\n`);
});

const stop = () => {
  chrome?.kill();
  ingressServer.stop(true);
  server.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
