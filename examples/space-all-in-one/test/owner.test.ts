import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { AppHost } from "../src/host";
import { makeOwnerToken, OWNER_HEADER, ownerLink, ownerTokenIn, PAGE_CHANNEL } from "../src/owner";
import { loadRiskPolicy } from "../src/policy";
import { createHostServer } from "../src/server";
import { FakeSpace, templateTests } from "./fake-space";

// The owner page may decide only for the owner's own session: a write must carry the token from the owner
// link, come from the Host's own page, and say JSON. A decision made there leaves the same record the CLI's
// request leaves, plus `channel: "owner-page"`.
const EXAMPLE = join(import.meta.dir, "..");
const TOKEN = "owner-token-for-tests-0123456789";

interface Running {
  work: string;
  space: FakeSpace;
  host: AppHost;
  server: ReturnType<typeof createHostServer>;
  port: number;
}
let runs: Running[] = [];

/** Start a Host with this owner token; null starts one with no owner link at all. */
async function start(ownerToken: string | null = TOKEN, make: (options: ConstructorParameters<typeof AppHost>[0]) => AppHost = (o) => new AppHost(o)): Promise<Running> {
  const work = mkdtempSync(join(tmpdir(), "space-all-in-one-owner-"));
  const space = new FakeSpace();
  const host = make({
    appsDir: join(work, "apps"),
    space,
    overlayDir: join(EXAMPLE, "overlay"),
    cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
    owner: "user:me",
    policy: loadRiskPolicy(join(EXAMPLE, "policy", "personal.json")),
    runVerify: (root) => templateTests(root),
  });
  const server = createHostServer(host, ownerToken === null ? {} : { ownerToken });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const run = { work, space, host, server, port: (server.address() as AddressInfo).port };
  runs.push(run);
  return run;
}
beforeEach(() => {
  runs = [];
});
afterEach(() => {
  for (const run of runs) {
    run.server.close();
    rmSync(run.work, { recursive: true, force: true });
  }
});

/** A raw request, so the test controls every header. */
function send(run: Running, method: string, path: string, headers: Record<string, string>, body?: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: run.port, method, path, headers, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk as Buffer));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let data: Record<string, unknown> = {};
        try {
          data = JSON.parse(text) as Record<string, unknown>;
        } catch {
          data = { text };
        }
        resolve({ status: res.statusCode ?? 0, data });
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

/** What the page's own script sends: same origin, JSON, the owner token. */
const fromPage = (run: Running, extra: Record<string, string> = {}) => ({
  "content-type": "application/json",
  origin: `http://127.0.0.1:${run.port}`,
  "sec-fetch-site": "same-origin",
  [OWNER_HEADER]: TOKEN,
  ...extra,
});
/** What `node .pneuma/pneuma.mjs` sends: JSON, no browser headers. */
const fromCli = { "content-type": "application/json" };

const edit = (run: Running, name: string, rel: string, content: string) => {
  const file = join(run.work, "apps", name, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};
const history = (run: Running, name: string) =>
  readFileSync(join(run.work, "apps", name, ".pneuma", "history.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);

/** An app with a one-way change waiting for the owner. */
async function waiting(run: Running, name = "notes"): Promise<string> {
  await run.host.create(name);
  edit(run, name, "src/server.ts", "export const sql = 'DROP TABLE notes';\n");
  const result = await run.host.submit({ name, intent: "start over", agent: "codex" });
  expect(result.status).toBe("needs_approval");
  return result.change_id;
}

describe("the owner link", () => {
  test("is a fragment, which no browser sends to a server, carrying 24 random bytes", () => {
    const token = makeOwnerToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(makeOwnerToken()).not.toBe(token);
    expect(ownerLink("http://127.0.0.1:8090/", token)).toBe(`http://127.0.0.1:8090/#owner=${token}`);
  });

  test("is kept in the Host's own state directory, readable by the Host's user only, so it survives a restart", () => {
    const dir = mkdtempSync(join(tmpdir(), "space-all-in-one-state-"));
    try {
      const first = ownerTokenIn(join(dir, "state"));
      expect(first).toMatch(/^[A-Za-z0-9_-]{32}$/);
      const file = join(dir, "state", "owner-token");
      expect(statSync(file).mode & 0o777).toBe(0o600);
      expect(ownerTokenIn(join(dir, "state"))).toBe(first);
      // A file someone loosened is tightened again; one that does not hold a token is replaced.
      Bun.spawnSync(["chmod", "644", file]);
      expect(ownerTokenIn(join(dir, "state"))).toBe(first);
      expect(statSync(file).mode & 0o777).toBe(0o600);
      writeFileSync(file, "not a token\n");
      const second = ownerTokenIn(join(dir, "state"));
      expect(second).not.toBe(first);
      expect(second).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(statSync(file).mode & 0o777).toBe(0o600);
      // A token it cannot keep still makes a working link, for this run only, and the log says why.
      const lines: string[] = [];
      writeFileSync(join(dir, "blocked"), "a file where the directory should be");
      const loose = ownerTokenIn(join(dir, "blocked"), (line) => lines.push(line));
      expect(loose).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(lines.join("\n")).toContain("works until the Host restarts");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the page never prints the token, and its script only reads it from the fragment", async () => {
    const run = await start();
    await waiting(run);
    const res = await fetch(`http://127.0.0.1:${run.port}/`);
    expect(await res.text()).not.toContain(TOKEN);
  });
});

describe("a write from the page", () => {
  test("without the owner token is refused, and nothing is decided", async () => {
    const run = await start();
    const id = await waiting(run);
    const before = history(run, "notes").length;
    for (const headers of [{ ...fromPage(run), [OWNER_HEADER]: "" }, { ...fromPage(run), [OWNER_HEADER]: `${TOKEN}x` }, { ...fromPage(run), [OWNER_HEADER]: TOKEN.slice(0, -1) + "Z" }]) {
      const res = await send(run, "POST", `/owner/apps/notes/changes/${id}/approve`, headers, "{}");
      expect(res.status).toBe(403);
      expect(res.data).toMatchObject({ reason: "owner_link_required" });
    }
    expect(history(run, "notes").length).toBe(before);
    expect((await run.host.status("notes")).pending.map((p) => p.change_id)).toEqual([id]);
  });

  test("with the token, from another site, is refused: by Origin, by Sec-Fetch-Site, or with no Origin at all", async () => {
    const run = await start();
    const id = await waiting(run);
    const cases: Record<string, string | undefined>[] = [
      { origin: "https://example.test" },
      { origin: `http://localhost:${run.port}` }, // the same machine under another name is another origin
      { origin: `http://127.0.0.1:${run.port + 1}` }, // and so is another port
      { "sec-fetch-site": "same-site" },
      { "sec-fetch-site": "cross-site" },
      { origin: undefined },
      { origin: "null" },
    ];
    for (const change of cases) {
      const headers = Object.fromEntries(Object.entries({ ...fromPage(run), ...change }).filter(([, v]) => v !== undefined)) as Record<string, string>;
      const res = await send(run, "POST", `/owner/apps/notes/changes/${id}/approve`, headers, "{}");
      expect([change, res.status, res.data.reason]).toEqual([change, 403, "not_from_this_page"]);
    }
    expect((await run.host.status("notes")).pending).toHaveLength(1);
  });

  test("a form or no-cors kind of request is refused even with the token; and a rebound name is refused first", async () => {
    const run = await start();
    const id = await waiting(run);
    for (const type of ["text/plain", "application/x-www-form-urlencoded", ""]) {
      const res = await send(run, "POST", `/owner/apps/notes/changes/${id}/approve`, fromPage(run, { "content-type": type }), "{}");
      expect(res.status).toBe(415);
    }
    const rebound = await send(run, "POST", `/owner/apps/notes/changes/${id}/approve`, fromPage(run, { host: `rebound.example.test:${run.port}`, origin: `http://rebound.example.test:${run.port}` }), "{}");
    expect(rebound.status).toBe(403);
    expect((await run.host.status("notes")).pending).toHaveLength(1);
  });

  test("a Host started without an owner link has a page that decides nothing", async () => {
    const run = await start(null);
    const id = await waiting(run);
    const res = await send(run, "POST", `/owner/apps/notes/changes/${id}/approve`, fromPage(run), "{}");
    expect(res.status).toBe(403);
    expect(res.data).toMatchObject({ reason: "owner_page_off" });
  });

  test("with the token, from the page, decides; the JSON API still refuses the same browser request", async () => {
    const run = await start();
    const id = await waiting(run);
    expect((await send(run, "POST", "/owner/session", fromPage(run), "{}")).data).toEqual({ ok: true });
    // The CLI's API stays closed to anything a browser sends, token or not.
    const api = await send(run, "POST", `/apps/notes/changes/${id}/approve`, fromPage(run), JSON.stringify({ subject: "user:me" }));
    expect(api.status).toBe(403);
    expect(api.data).toMatchObject({ reason: "browser_write_refused" });
    const res = await send(run, "POST", `/owner/apps/notes/changes/${id}/approve`, fromPage(run), "{}");
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ status: "published", version: "v2" });
    expect(history(run, "notes").at(-1)).toMatchObject({ kind: "decision", outcome: "published", channel: PAGE_CHANNEL });
  });

  test("the page's writes go through the same gates: an unknown change, an undo with uncommitted work, a one-way undo without its confirmation", async () => {
    const run = await start();
    const id = await waiting(run);
    expect((await send(run, "POST", "/owner/apps/notes/changes/c-nothing/approve", fromPage(run), "{}")).status).toBe(404);
    expect((await send(run, "POST", `/owner/apps/notes/changes/${id}/approve`, fromPage(run), "{}")).status).toBe(200);
    // Back past the one-way change without saying yes to it: refused, as in a terminal.
    const refused = await send(run, "POST", "/owner/apps/notes/undo", fromPage(run), JSON.stringify({ to: "v1", from: "v2" }));
    expect(refused.status).toBe(409);
    expect(refused.data).toMatchObject({ reason: "crosses_one_way_change", from: "v2" });
    expect((await run.host.status("notes")).active_version).toBe("v2");
    edit(run, "notes", "src/wip.ts", "export const wip = 1;\n");
    const busy = await send(run, "POST", "/owner/apps/notes/undo", fromPage(run), JSON.stringify({ to: "v1", from: "v2", accept_one_way: true }));
    expect(busy.status).toBe(409);
    expect((await run.host.status("notes")).active_version).toBe("v2");
    expect((await send(run, "POST", "/owner/apps/notes/undo", fromPage(run), JSON.stringify({ to: "../v1", from: "v2" }))).status).toBe(400);
    expect((await send(run, "POST", "/owner/apps/notes/undo", fromPage(run), "x".repeat(20_000))).status).toBe(413);
  });

  test("going back is tied to the plan the page showed: without the version it started from it is refused, and once the app moved on it answers 409", async () => {
    const run = await start();
    await run.host.create("notes");
    edit(run, "notes", "src/a.ts", "export const a = 1;\n");
    await run.host.submit({ name: "notes", intent: "a", agent: "codex" });
    // The page drew the plan for going back to v1 from v2.
    expect(run.host.undoPlan("notes", "v1")).toMatchObject({ from: "v2", undone: ["v2"] });
    // Meanwhile a submit took v3 live (record or personal mode releases at once).
    edit(run, "notes", "src/b.ts", "export const b = 1;\n");
    await run.host.submit({ name: "notes", intent: "b", agent: "codex" });
    const entries = history(run, "notes").length;

    const missing = await send(run, "POST", "/owner/apps/notes/undo", fromPage(run), JSON.stringify({ to: "v1" }));
    expect(missing.status).toBe(400);
    const stale = await send(run, "POST", "/owner/apps/notes/undo", fromPage(run), JSON.stringify({ to: "v1", from: "v2" }));
    expect(stale.status).toBe(409);
    expect(stale.data).toMatchObject({ reason: "plan_changed", current: "v3" });
    expect(String(stale.data.error)).toContain("notes is on v3 now, not on v2, where the plan that was shown started");
    expect((await run.host.status("notes")).active_version).toBe("v3");
    expect(history(run, "notes").length).toBe(entries);
    // The plan as it is now goes through.
    expect(run.host.undoPlan("notes", "v1")).toMatchObject({ from: "v3", undone: ["v3", "v2"] });
    expect((await send(run, "POST", "/owner/apps/notes/undo", fromPage(run), JSON.stringify({ to: "v1", from: "v3" }))).status).toBe(200);
    expect((await run.host.status("notes")).active_version).toBe("v1");
  });

  test("asking for a preview again needs the owner link too, publishes the checked draft once the last one ended, and decides nothing", async () => {
    const run = await start();
    const id = await waiting(run);
    const previewApp = `notes-pv${id.slice(-4)}`;
    const url = `/owner/apps/notes/changes/${id}/preview`;
    const published = () => run.space.log.filter((line) => line.startsWith(`publish ${previewApp}`)).length;
    const before = published();
    expect((await send(run, "POST", url, { ...fromPage(run), [OWNER_HEADER]: "" }, "{}")).status).toBe(403);
    expect((await send(run, "POST", url, fromPage(run, { origin: "https://example.test" }), "{}")).status).toBe(403);
    // While it stands, nothing is published.
    const standing = await send(run, "POST", url, fromPage(run), "{}");
    expect(standing.status).toBe(200);
    expect(standing.data).toMatchObject({ change_id: id, republished: false, preview: { state: "standing", app: previewApp } });
    expect(published()).toBe(before);
    // Discarded at PneumaSpace: approving is refused until it stands again, through the page as in a terminal.
    await run.space.discard(previewApp, "pneuma-host");
    const refused = await send(run, "POST", `/owner/apps/notes/changes/${id}/approve`, fromPage(run), "{}");
    expect(refused.status).toBe(409);
    expect(refused.data).toMatchObject({ reason: "preview_gone" });
    const entries = history(run, "notes").length;
    const again = await send(run, "POST", url, fromPage(run), "{}");
    expect(again.status).toBe(200);
    expect(again.data).toMatchObject({ change_id: id, republished: true, preview: { state: "standing", app: previewApp, address: `http://space.test/apps/${previewApp}/` } });
    expect(published()).toBe(before + 1);
    // It decides nothing: the change still waits, the history has no new entry, and status sees the preview again.
    const status = await run.host.status("notes");
    expect(status.pending.map((p) => [p.change_id, p.preview?.state])).toEqual([[id, "standing"]]);
    expect(history(run, "notes")).toHaveLength(entries);
    // A Host without previews says so, in a refusal the page words.
    const off = await start(TOKEN, (o) => new AppHost({ ...o, preview: false }));
    const offId = await waiting(off);
    const none = await send(off, "POST", `/owner/apps/notes/changes/${offId}/preview`, fromPage(off), "{}");
    expect(none.status).toBe(409);
    expect(none.data).toMatchObject({ reason: "previews_off" });
  });
});

/** The parts of an entry that differ between two runs of the same steps: ids, times, and file hashes of a new tree. */
function stable(entry: Record<string, unknown>): Record<string, unknown> {
  const { at, change_id, for_change, duration_ms, data_ref, ...rest } = entry as Record<string, unknown> & { [k: string]: unknown };
  void at, change_id, for_change, duration_ms, data_ref;
  return JSON.parse(JSON.stringify(rest, (key, value) => (key === "sha256" || key === "tree" || key === "commit" || key.endsWith("_at") ? "<varies>" : value)));
}

describe("a decision on the page leaves the record the CLI leaves, and says it came through the page", () => {
  async function both(steps: (run: Running, via: "page" | "cli") => Promise<void>, app = "notes") {
    const page = await start();
    const cli = await start();
    await steps(page, "page");
    await steps(cli, "cli");
    return { page: history(page, app), cli: history(cli, app) };
  }

  test("show it to me again, then let it go live", async () => {
    const { page, cli } = await both(async (run, via) => {
      const id = await waiting(run);
      await run.space.discard(`notes-pv${id.slice(-4)}`, "pneuma-host");
      const again =
        via === "page"
          ? await send(run, "POST", `/owner/apps/notes/changes/${id}/preview`, fromPage(run), "{}")
          : await send(run, "POST", `/apps/notes/changes/${id}/preview`, fromCli, "{}");
      expect(again.status).toBe(200);
      const res =
        via === "page"
          ? await send(run, "POST", `/owner/apps/notes/changes/${id}/approve`, fromPage(run), "{}")
          : await send(run, "POST", `/apps/notes/changes/${id}/approve`, fromCli, JSON.stringify({ subject: "user:me" }));
      expect(res.status).toBe(200);
    });
    const { channel, ...rest } = stable(page.at(-1)!);
    expect(channel).toBe(PAGE_CHANNEL);
    expect(rest).toEqual(stable(cli.at(-1)!));
    expect(page.map(stable).slice(0, -1)).toEqual(cli.map(stable).slice(0, -1));
  });

  test("let it go live", async () => {
    const { page, cli } = await both(async (run, via) => {
      const id = await waiting(run);
      const res =
        via === "page"
          ? await send(run, "POST", `/owner/apps/notes/changes/${id}/approve`, fromPage(run), "{}")
          : await send(run, "POST", `/apps/notes/changes/${id}/approve`, fromCli, JSON.stringify({ subject: "user:me" }));
      expect(res.status).toBe(200);
    });
    expect(page.length).toBe(cli.length);
    const last = page.at(-1)!;
    expect(last).toMatchObject({ kind: "decision", outcome: "published", channel: PAGE_CHANNEL, approval: { by: ["user:me"] } });
    expect(last.guarantees).toEqual(["verified", "previewed", "approved", "sealed"]);
    expect(cli.at(-1)!.channel).toBeUndefined();
    const { channel, ...rest } = stable(last);
    expect(channel).toBe(PAGE_CHANNEL);
    expect(rest).toEqual(stable(cli.at(-1)!));
    expect(page.slice(0, -1).map(stable)).toEqual(cli.slice(0, -1).map(stable));
  });

  test("not this time, with a reason", async () => {
    const { page, cli } = await both(async (run, via) => {
      const id = await waiting(run);
      const body = JSON.stringify(via === "page" ? { reason: "not today" } : { subject: "user:me", reason: "not today" });
      const res =
        via === "page"
          ? await send(run, "POST", `/owner/apps/notes/changes/${id}/deny`, fromPage(run), body)
          : await send(run, "POST", `/apps/notes/changes/${id}/deny`, fromCli, body);
      expect(res.status).toBe(200);
    });
    expect(page.length).toBe(cli.length);
    const { channel, ...rest } = stable(page.at(-1)!);
    expect(channel).toBe(PAGE_CHANNEL);
    expect(rest).toEqual(stable(cli.at(-1)!));
    expect(page.at(-1)).toMatchObject({ outcome: "denied" });
  });

  test("go back past a one-way change, confirmed", async () => {
    const { page, cli } = await both(async (run, via) => {
      const id = await waiting(run);
      expect((await send(run, "POST", `/apps/notes/changes/${id}/approve`, fromCli, JSON.stringify({ subject: "user:me" }))).status).toBe(200);
      // The page acts as the owner; the CLI names its actor, here the same subject, so the entries compare.
      const res =
        via === "page"
          ? await send(run, "POST", "/owner/apps/notes/undo", fromPage(run), JSON.stringify({ to: "v1", from: "v2", accept_one_way: true, reason: "too soon" }))
          : await send(run, "POST", "/apps/notes/undo", fromCli, JSON.stringify({ to: "v1", accept_one_way: true, subject: "user:me", actor: "user:me", reason: "too soon" }));
      expect(res.status).toBe(200);
    });
    expect(page.length).toBe(cli.length);
    const last = page.at(-1)!;
    expect(last).toMatchObject({ kind: "restore", outcome: "rolled_back", version: "v1", channel: PAGE_CHANNEL, agent: "user:me" });
    const { channel, ...rest } = stable(last);
    expect(channel).toBe(PAGE_CHANNEL);
    expect(rest).toEqual(stable(cli.at(-1)!));
  });

  test("a refused undo is noted in the record the same way, with the channel", async () => {
    const run = await start();
    await run.host.create("notes");
    edit(run, "notes", "src/a.ts", "export const a = 1;\n");
    await run.host.submit({ name: "notes", intent: "a", agent: "codex" });
    run.space.unhealthy = () => true;
    const res = await send(run, "POST", "/owner/apps/notes/undo", fromPage(run), JSON.stringify({ to: "v1", from: "v2" }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    const last = history(run, "notes").at(-1)!;
    expect(last.channel).toBe(PAGE_CHANNEL);
    expect(existsSync(join(run.work, "apps", "notes"))).toBe(true);
  });
});
