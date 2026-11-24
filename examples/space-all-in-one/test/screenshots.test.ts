import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { AppHost } from "../src/host";
import { loadRiskPolicy } from "../src/policy";
import { cdpScreenshotter, previewOf, runtimeAddressMapper, ScreenshotKeeper, type CaptureResult, type Screenshotter } from "../src/screenshots";
import { createHostServer } from "../src/server";
import { FakeSpace, templateTests } from "./fake-space";

const EXAMPLE = join(import.meta.dir, "..");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0xff, 0xd9]);

let work: string;
let space: FakeSpace;
let host: AppHost;
let shots: string;

/** A screenshot browser that answers from a table, and remembers what it was asked to open. */
function fakeShooter(answer: (url: string) => CaptureResult = (url) => ({ ok: true, image: JPEG, url })): Screenshotter & { asked: string[] } {
  const asked: string[] = [];
  return { asked, capture: async (url) => (asked.push(url), answer(url)) };
}
const inside = runtimeAddressMapper("http://space.test", "http://gateway:8080");
const keeper = (shooter?: Screenshotter, extra: Partial<ConstructorParameters<typeof ScreenshotKeeper>[0]> = {}) =>
  new ScreenshotKeeper({ source: host, ...(shooter ? { shooter } : {}), dir: shots, insideUrl: inside, ...extra });
const edit = (name: string, rel: string, content: string) => {
  const file = join(work, "apps", name, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "space-all-in-one-shots-"));
  shots = join(work, "state", "pictures");
  space = new FakeSpace();
  host = new AppHost({
    appsDir: join(work, "apps"),
    space,
    overlayDir: join(EXAMPLE, "overlay"),
    cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
    owner: "user:me",
    policy: loadRiskPolicy(join(EXAMPLE, "policy", "personal.json")),
    runVerify: (root) => templateTests(root),
  });
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

describe("which addresses are ever pictured", () => {
  test("only an app on the runtime, mapped to where the screenshot browser reaches it", () => {
    expect(inside("http://space.test/apps/notes/")).toBe("http://gateway:8080/apps/notes/");
    expect(inside("http://space.test/apps/notes-pv1a2b/?x=1#y")).toBe("http://gateway:8080/apps/notes-pv1a2b/");
    for (const address of [
      "http://elsewhere.test/apps/notes/",
      "http://user:pw@space.test/apps/notes/",
      "http://space.test/apps/notes/admin",
      "http://space.test/apps/../_pneuma-space/login",
      "http://space.test/_pneuma-space/login",
      "http://space.test:8081/api/apps",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "not a url",
    ]) {
      expect([address, inside(address)]).toEqual([address, null]);
    }
  });

  test("a waiting change's preview is read from what status reports: standing with its address, gone, or unknown", () => {
    expect(previewOf({ preview: { state: "standing", app: "a-pv1", address: "http://space.test/apps/a-pv1/", expires_at: null } })).toEqual({ address: "http://space.test/apps/a-pv1/", standing: true, unknown: false });
    expect(previewOf({ preview: { state: "gone", app: "a-pv1", note: "ended" } })).toEqual({ address: null, standing: false, unknown: false });
    expect(previewOf({ preview: { state: "unknown", app: "a-pv1", note: "no answer" } })).toEqual({ address: null, standing: null, unknown: true });
    const none = { address: null, standing: null, unknown: false };
    for (const pending of [null, {}, { preview: "x" }, { preview: { address: "http://space.test/apps/a-pv1/" } }, { preview_address: "http://space.test/apps/a-pv1/" }, { preview: { state: "standing", address: 5 } }, { preview: { state: "other" } }]) {
      expect(previewOf(pending)).toEqual(none);
    }
  });
});

describe("the screenshot keeper", () => {
  test("pictures the live version once, stores it in the Host's own state, and serves it as an image that never runs", async () => {
    await host.create("todo");
    const shooter = fakeShooter();
    const pictures = keeper(shooter);
    await pictures.scan();
    expect(shooter.asked).toEqual(["http://gateway:8080/apps/todo/"]);
    const latest = pictures.latest("todo")!;
    expect(latest).toMatchObject({ key: "v1", kind: "version" });
    expect(latest.file).toMatch(/^todo--v1--\d+\.jpg$/);
    expect(readFileSync(join(shots, latest.file))).toEqual(Buffer.from(JPEG));
    // Nothing is written inside the app.
    expect(readdirSync(join(work, "apps", "todo")).some((file) => file.endsWith(".jpg"))).toBe(false);
    // Low frequency: another pass, or a page view, takes no new picture.
    await pictures.scan();
    expect(shooter.asked).toHaveLength(1);
    expect(pictures.file(latest.file)).toBe(join(shots, latest.file));
    for (const name of ["../index.json", "index.json", "todo--v1--1.jpg/../../x", "TODO--v1--1.jpg"]) expect(pictures.file(name)).toBeNull();

    const server = createHostServer(host, { pictures });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const res = await fetch(`${base}/pictures/${latest.file}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
      expect((await fetch(`${base}/pictures/..%2Findex.json`)).status).toBe(404);
      expect((await fetch(`${base}/pictures/index.json`)).status).toBe(404);
      // The page's data names the stored picture; the client shows it as an image from this Host.
      expect(await (await fetch(`${base}/`)).text()).toContain(`"src":"/pictures/${latest.file}"`);
    } finally {
      server.close();
    }
  });

  test("a new version gets a new picture after it goes live; the old one is kept a while, then dropped", async () => {
    await host.create("todo");
    const shooter = fakeShooter();
    const pictures = keeper(shooter, { keepPerApp: 2 });
    await pictures.scan();
    for (const n of [2, 3, 4]) {
      edit("todo", `src/f${n}.ts`, `export const f = ${n};\n`);
      expect((await host.submit({ name: "todo", intent: `change ${n}`, agent: "codex" })).status).toBe("published");
      await Bun.sleep(5);
      await pictures.scan();
      expect(pictures.latest("todo")?.key).toBe(`v${n}`);
    }
    expect(shooter.asked).toHaveLength(4);
    expect(readdirSync(shots).filter((file) => file.endsWith(".jpg")).sort()).toHaveLength(2);
  });

  test("an app that asks visitors to sign in gets no picture, and says why; it is not tried again at once", async () => {
    await host.create("notes");
    const shooter = fakeShooter(() => ({ ok: false, reason: "needs_sign_in", detail: "sends visitors to /_pneuma-space/login" }));
    const lines: string[] = [];
    const pictures = keeper(shooter, { log: (line) => lines.push(line) });
    await pictures.scan();
    await pictures.scan();
    expect(shooter.asked).toHaveLength(1);
    expect(pictures.latest("notes")).toBeNull();
    expect(pictures.miss("notes", "v1")).toMatchObject({ reason: "needs_sign_in" });
    expect(lines).toHaveLength(1);
    expect(readdirSync(shots).filter((file) => file.endsWith(".jpg"))).toEqual([]);
  });

  test("what is not a JPEG is not stored", async () => {
    await host.create("notes");
    const pictures = keeper(fakeShooter((url) => ({ ok: true, image: new TextEncoder().encode("<script>alert(1)</script>"), url })));
    await pictures.scan();
    expect(pictures.latest("notes")).toBeNull();
    expect(pictures.miss("notes", "v1")).toMatchObject({ reason: "error" });
  });

  test("when the Host cannot confirm what is running, it takes no picture of a guess", async () => {
    const recording = new AppHost({
      appsDir: join(work, "apps"),
      space,
      overlayDir: join(EXAMPLE, "overlay"),
      cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
      owner: "user:me",
      policy: loadRiskPolicy(join(EXAMPLE, "policy", "personal.json")),
      runVerify: (root) => templateTests(root),
      governance: "record",
    });
    await recording.create("unsure");
    space.unhealthy = (name) => name === "unsure";
    edit("unsure", "src/extra.ts", "export const extra = 1;\n");
    expect((await recording.submit({ name: "unsure", intent: "add", agent: "codex" })).status).toBe("release_failed");
    space.unhealthy = null;
    expect(host.summaries().find((s) => s.app_id === "unsure")).toMatchObject({ serving_uncertain: expect.any(String) });
    const shooter = fakeShooter();
    await keeper(shooter).scan();
    expect(shooter.asked).toEqual([]);
  });

  test("a waiting change's preview is pictured while status says it stands, and dropped once the change no longer waits", async () => {
    await host.create("notes");
    edit("notes", "src/server.ts", "export const sql = 'DROP TABLE notes';\n");
    const result = await host.submit({ name: "notes", intent: "start over", agent: "codex" });
    if (result.status !== "needs_approval") throw new Error(`expected needs_approval, got ${result.status}`);
    // The preview stands on PneumaSpace as an ephemeral app while the change waits; status says where.
    const shooter = fakeShooter();
    const pictures = keeper(shooter);
    await pictures.scan();
    expect(shooter.asked).toContain(`http://gateway:8080/apps/notes-pv${result.change_id.slice(-4)}/`);
    expect(pictures.preview("notes", result.change_id)).toMatchObject({ kind: "preview", key: `pv-${result.change_id}` });
    await host.resolve("notes", result.change_id, "denied", "user:me");
    await pictures.scan();
    expect(pictures.preview("notes", result.change_id)).toBeNull();
    expect(readdirSync(shots).filter((name) => name.includes("--pv-"))).toEqual([]);
  });

  test("a preview address that is not an app on the runtime is never opened", async () => {
    await host.create("notes");
    edit("notes", "src/server.ts", "export const sql = 'DROP TABLE notes';\n");
    const result = await host.submit({ name: "notes", intent: "start over", agent: "codex" });
    // A status that names an address off the runtime: the keeper checks it whatever the Host passes on.
    const source = {
      summaries: () => host.summaries(),
      history: (name: string) => host.history(name),
      status: async (name: string) => {
        const status = await host.status(name);
        return { ...status, pending: status.pending.map((p) => ({ ...p, preview: { state: "standing" as const, app: "notes-pv77", address: "http://169.254.169.254/latest/meta-data/", expires_at: null } })) };
      },
    };
    const shooter = fakeShooter();
    const pictures = keeper(shooter, { source });
    await pictures.scan();
    expect(shooter.asked).toEqual(["http://gateway:8080/apps/notes/"]);
    expect(pictures.miss("notes", `pv-${result.change_id}`)).toMatchObject({ reason: "not_an_app_address" });
  });

  test("an app removed and made again under the same name does not show the old app's picture", async () => {
    await host.create("todo");
    const pictures = keeper(fakeShooter());
    await pictures.scan();
    const first = pictures.latest("todo")!;
    rmSync(join(work, "apps", "todo"), { recursive: true, force: true });
    await space.takeDown("todo", "pneuma-host");
    await host.create("todo");
    await pictures.scan();
    const second = pictures.latest("todo")!;
    expect(second.key).toBe("v1");
    expect(second.change).not.toBe(first.change);
    expect(existsSync(join(shots, first.file))).toBe(false);
  });

  test("a keeper reloads its index after a restart; one without a browser does nothing", async () => {
    await host.create("todo");
    await keeper(fakeShooter()).scan();
    const again = keeper(fakeShooter());
    expect(again.latest("todo")?.key).toBe("v1");
    const off = keeper(undefined);
    expect(off.enabled).toBe(false);
    off.start();
    off.nudge();
    await off.scan();
    off.stop();
  });
});

// The same capture path the compose service is reached by, against a Chrome on this machine. Skipped where
// there is none (CI); set PNEUMA_TEST_CHROME to a Chrome or Chromium binary to run it anywhere.
const CHROME = process.env.PNEUMA_TEST_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
describe.skipIf(!existsSync(CHROME))("capture over the DevTools protocol, against a local Chrome", () => {
  test("a page is pictured; a sign-in redirect, a 404 and a missing browser are told apart", async () => {
    const poked: string[] = [];
    const other = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req) => (poked.push(new URL(req.url).pathname), new Response("ok")) });
    const reachOut = `http://127.0.0.1:${other.port}`;
    const app = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(req): Response {
        const path = new URL(req.url).pathname;
        if (path === "/apps/demo/") return new Response("<!doctype html><title>demo</title><h1 style='font:48px sans-serif'>Hello</h1>", { headers: { "content-type": "text/html" } });
        // A page that reaches for another service on plain http, the way a hostile preview would reach the admin API.
        if (path === "/apps/reach/") return new Response(`<!doctype html><script>fetch("${reachOut}/poke", { method: "POST", mode: "no-cors" })</script><p>hi</p>`, { headers: { "content-type": "text/html" } });
        if (path === "/apps/locked/") return Response.redirect(`${new URL(req.url).origin}/_pneuma-space/login?next=%2Fapps%2Flocked%2F`, 303);
        // The same, when the runtime names itself by the address the person's browser uses, which the picture's browser cannot load.
        if (path === "/apps/locked-far/") return Response.redirect("http://127.0.0.1:1/_pneuma-space/login?next=%2Fapps%2Flocked-far%2F", 303);
        if (path.startsWith("/_pneuma-space/login")) return new Response("<form>name</form>", { headers: { "content-type": "text/html" } });
        return new Response("not found", { status: 404 });
      },
    });
    const profile = mkdtempSync(join(tmpdir(), "space-all-in-one-chrome-"));
    const port = 9400 + Math.floor(Math.random() * 400);
    const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
    try {
      for (let i = 0; i < 50; i++) {
        if (await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.ok, () => false)) break;
        await Bun.sleep(200);
      }
      const shooter = cdpScreenshotter({ endpoint: `http://localhost:${port}`, settleMs: 100, loadTimeoutMs: 10_000 });
      const ok = await shooter.capture(`http://127.0.0.1:${app.port}/apps/demo/`);
      expect(ok.ok).toBe(true);
      if (ok.ok) expect([...ok.image.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
      expect(await shooter.capture(`http://127.0.0.1:${app.port}/apps/locked/`)).toMatchObject({ ok: false, reason: "needs_sign_in" });
      expect(await shooter.capture(`http://127.0.0.1:${app.port}/apps/locked-far/`)).toMatchObject({ ok: false, reason: "needs_sign_in" });
      expect(await shooter.capture(`http://127.0.0.1:${app.port}/apps/missing/`)).toMatchObject({ ok: false, reason: "error" });
      expect((await shooter.capture(`http://127.0.0.1:${app.port}/apps/reach/`)).ok).toBe(true);
      expect(poked).toEqual([]);
      expect(await cdpScreenshotter({ endpoint: "http://127.0.0.1:1" }).capture(`http://127.0.0.1:${app.port}/apps/demo/`)).toMatchObject({ ok: false, reason: "unreachable" });
    } finally {
      chrome.kill();
      app.stop(true);
      other.stop(true);
      await Bun.sleep(300);
      rmSync(profile, { recursive: true, force: true });
    }
  }, 60_000);
});
