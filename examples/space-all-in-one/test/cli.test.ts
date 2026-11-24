import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createTcpServer, type AddressInfo, type Server } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { AppHost } from "../src/host";
import { loadRiskPolicy } from "../src/policy";
import { createHostServer, HOST_API_LEVEL } from "../src/server";
import { runCommand } from "../src/space";
import { FakeSpace, templateTests } from "./fake-space";

// The path a coding agent actually takes: the artifact's own CLI, over HTTP, to a served Host.
const EXAMPLE = join(import.meta.dir, "..");
let work: string;
let server: ReturnType<typeof createHostServer>;
let hostUrl: string;
let host: AppHost;
let space: FakeSpace;

/** What a Host at the level this CLI is written for sends on every answer. */
const LEVEL = { "pneuma-host-api": String(HOST_API_LEVEL) };

/** A stand-in Host: it answers the CLI's first question, GET /healthz, as this Host does, and hands every other request to `handle`. */
function standInHost(handle: (req: IncomingMessage, res: ServerResponse) => void) {
  return createHttpServer((req, res) => {
    if (req.url !== "/healthz") return handle(req, res);
    req.resume();
    res.writeHead(200, { "content-type": "application/json", ...LEVEL }).end('{"ok":true}');
  });
}

const cli = (cwd: string, ...args: string[]) =>
  runCommand(["node", join(EXAMPLE, "bin", "pneuma.mjs"), ...args], { cwd, env: { PNEUMA_HOST: hostUrl, PNEUMA_AGENT: "codex" }, timeoutMs: 20_000 });

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), "space-all-in-one-cli-"));
  space = new FakeSpace();
  host = new AppHost({
    appsDir: join(work, "apps"),
    space,
    overlayDir: join(EXAMPLE, "overlay"),
    cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
    owner: "user:me",
    policy: loadRiskPolicy(join(import.meta.dir, "..", "policy", "personal.json")),
    runVerify: async () => ({ ok: true, output: "tests passed" }),
  });
  server = createHostServer(host);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  hostUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
  rmSync(work, { recursive: true, force: true });
});

describe("the artifact CLI against a served Host", () => {
  test("create, then drive the app from inside its own directory with the copy it carries", async () => {
    const created = await cli(work, "create", "notes");
    expect(created.code).toBe(0);
    expect(created.output).toContain("published v1 at http://space.test/apps/notes/");

    const appDir = join(work, "apps", "notes");
    const own = (...args: string[]) => runCommand(["node", ".pneuma/pneuma.mjs", ...args], { cwd: appDir, env: { PNEUMA_HOST: hostUrl, PNEUMA_AGENT: "codex" } });
    expect(existsSync(join(appDir, ".pneuma", "pneuma.mjs"))).toBe(true);

    writeFileSync(join(appDir, "src", "server.ts"), "export const changed = true;\n");
    expect((await own("status")).output).toContain("uncommitted: src/server.ts");

    const submitted = await own("submit", "show", "a", "list");
    expect(submitted.code).toBe(0);
    expect(submitted.output).toContain("published v2");
    expect(submitted.output).toContain("approved by: policy:auto");

    const history = await own("history");
    expect(history.output).toContain("change published -> v2 by codex [agent-driven]: show a list");

    const undone = await own("undo", "too much");
    expect(undone.output).toContain("now on v1 (was v2)");
  });

  test("a risky change exits 2 with the disclosure, and approve refuses to run without a terminal", async () => {
    await cli(work, "create", "risky");
    const appDir = join(work, "apps", "risky");
    writeFileSync(join(appDir, "src", "server.ts"), "export const sql = 'DROP TABLE todos';\n");
    const submitted = await cli(appDir, "submit", "clear everything");
    expect(submitted.code).toBe(2);
    expect(submitted.output).toContain("needs_approval");
    expect(submitted.output).toContain("deletes or rewrites data");

    const changeId = /needs_approval (\S+):/.exec(submitted.output)![1]!;
    const approve = await cli(appDir, "approve", changeId);
    expect(approve.code).toBe(1);
    expect(approve.output).toContain("must be run by a person in a terminal");
  });

  test("the owner is shown the preview of a waiting change; once it has ended, status says so and preview publishes it again", async () => {
    await cli(work, "create", "shown");
    const appDir = join(work, "apps", "shown");
    expect((await cli(appDir, "status")).output).toContain("on PneumaSpace: managed on PneumaSpace by this Host (pneuma-host)");
    writeFileSync(join(appDir, "src", "server.ts"), "export const sql = 'DROP TABLE todos';\n");
    const submitted = await cli(appDir, "submit", "clear everything");
    const changeId = /needs_approval (\S+):/.exec(submitted.output)![1]!;
    const preview = `http://space.test/apps/shown-pv${changeId.slice(-4)}/`;
    expect(submitted.output).toMatch(new RegExp(`preview: ${preview} \\(it ends itself at \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2} UTC\\)`));
    expect(submitted.output).toContain("They can open the preview, then decide with");
    expect((await cli(appDir, "status")).output).toContain(`  preview: ${preview} (it ends itself at`);

    const realNow = space.now;
    space.now = () => realNow() + 2 * 3600_000;
    space.sweep();
    try {
      const status = await cli(appDir, "status");
      expect(status.output).toContain(`  preview: none standing; the preview shown-pv${changeId.slice(-4)} is no longer on PneumaSpace: it ended itself (previews stand for 3600 s), or it was discarded.`);
      expect(status.output).toContain(`Publish it again with: node .pneuma/pneuma.mjs preview ${changeId}`);
      const again = await cli(appDir, "preview", changeId);
      expect(again.code).toBe(0);
      expect(again.output).toContain(`published the preview of ${changeId} again.`);
      expect(again.output).toContain(`preview: ${preview} (it ends itself at`);
      expect((await cli(appDir, "preview", changeId)).output).toContain("still stands; nothing was published");

      // PneumaSpace does not answer: the preview may still stand, and nothing tells the owner to publish it again.
      space.unreachable = true;
      const unknown = await cli(appDir, "status");
      expect(unknown.output).toContain(`  preview: unknown; PneumaSpace did not say whether the preview shown-pv${changeId.slice(-4)} still stands (`);
      expect(unknown.output).toContain("Nothing was changed; ask again in a minute.");
      expect(unknown.output).not.toContain("none standing");
      expect(unknown.output).not.toContain("Publish it again");
      const asked = await cli(appDir, "preview", changeId);
      expect(asked.code).toBe(3);
      expect(asked.output).toContain("Nothing was discarded or published, and the change still waits; ask again in a minute");
    } finally {
      space.now = realNow;
      space.unreachable = false;
    }
  });

  test("a waiting change on a Host without previews is shown without sending the owner to a preview", async () => {
    const answer = { status: "needs_approval", change_id: "c-1", risks: ["policy_change"], disclosure: ["Visitors will be able to open this app without signing in."], changed_paths: ["pneuma-space.json"] };
    const standIn = standInHost((req, res) => {
      req.resume();
      req.on("end", () => res.writeHead(200, { "content-type": "application/json", ...LEVEL }).end(JSON.stringify(answer)));
    });
    await new Promise<void>((resolve) => standIn.listen(0, "127.0.0.1", resolve));
    try {
      const run = await runCommand(["node", join(EXAMPLE, "bin", "pneuma.mjs"), "submit", "make it public", "--app", "open"], {
        cwd: work,
        env: { PNEUMA_HOST: `http://127.0.0.1:${(standIn.address() as AddressInfo).port}`, PNEUMA_AGENT: "codex" },
        timeoutMs: 20_000,
      });
      expect(run.code).toBe(2);
      expect(run.output).toContain("Show this to the owner. They decide with: node .pneuma/pneuma.mjs approve c-1   (or deny)");
      // The terminal stays the first way; the owner page is the other.
      expect(run.output).toContain(`Or on the Host's page, opened from the owner link the Host printed when it started: http://127.0.0.1:${(standIn.address() as AddressInfo).port}/app/open/change/c-1`);
      expect(run.output).not.toContain("preview");
    } finally {
      standIn.close();
    }
  });

  test("errors are plain: unknown app, unreachable host", async () => {
    expect((await cli(work, "status", "--app", "ghost")).output).toContain("no app named ghost");
    const down = await runCommand(["node", join(EXAMPLE, "bin", "pneuma.mjs"), "list"], { env: { PNEUMA_HOST: "http://127.0.0.1:1" } });
    expect(down.code).toBe(3);
    expect(down.output).toContain("cannot reach the Host");
  });

  test("a flag that takes a value, given as the last word, fails before anything is sent instead of being dropped", async () => {
    // Nothing listens at this address: a command that got as far as sending would exit 3, "cannot reach the Host".
    const run = (...args: string[]) => bare(work, join(EXAMPLE, "bin", "pneuma.mjs"), args, { PNEUMA_HOST: "http://127.0.0.1:1", PNEUMA_AGENT: "codex" });
    const cases: [string[], string][] = [
      [["guide", "--write"], "guide --write takes the file to put the block in"],
      [["submit", "drops a column", "--app", "notes", "--one-way"], '--one-way takes "<what putting files back would not undo>"'],
      [["undo", "back", "--app", "notes", "--to"], "--to takes a version, e.g. v3"],
      [["status", "--app"], "--app takes the app's name"],
      [["submit", "x", "--app", "notes", "--agent"], "--agent takes the agent's name"],
      [["list", "--host"], "--host takes the Host's address, e.g. http://127.0.0.1:8090"],
    ];
    for (const [args, message] of cases) {
      const result = await run(...args);
      expect({ args, code: result.code, stdout: result.stdout, stderr: result.stderr }).toEqual({ args, code: 1, stdout: "", stderr: `pneuma: ${message}\n` });
    }
  });
});

describe("undo and record mode through the artifact CLI", () => {
  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  test("status says what submit does in this mode, and history what held for each entry", async () => {
    await cli(work, "create", "modes");
    const appDir = join(work, "apps", "modes");
    const status = await cli(appDir, "status");
    expect(status.output).toContain("personal mode: submit runs the checks and a preview");
    expect(status.output).toContain("previous: none (this is the first version)");
    const history = await cli(appDir, "history");
    expect(history.output).toContain("guarantees: verified, previewed, approved, sealed");
  });

  test("undo goes back one version at a time, and --to goes straight back", async () => {
    await cli(work, "create", "steps");
    const appDir = join(work, "apps", "steps");
    for (const n of [2, 3, 4]) {
      writeFileSync(join(appDir, "src", "server.ts"), `export const version = ${n};\n`);
      expect((await cli(appDir, "submit", `make v${n}`)).code).toBe(0);
    }
    expect((await cli(appDir, "undo", "back")).output).toContain("now on v3 (was v4)");
    const straight = await cli(appDir, "undo", "--to", "v1", "start over");
    expect(straight.code).toBe(0);
    expect(straight.output).toContain("now on v1 (was v3)");
    expect(straight.output).toContain("Went back past v3, v2.");
    const first = await cli(appDir, "undo", "again");
    expect(first.code).toBe(3);
    expect(first.output).toContain("v1 is the first version of steps");
  });

  test("undo past a one-way change says only code would come back and what to do, and only the owner can confirm", async () => {
    await cli(work, "create", "oneway");
    const appDir = join(work, "apps", "oneway");
    writeFileSync(join(appDir, "src", "server.ts"), "export const sql = `ALTER TABLE todos DROP COLUMN note`;\n");
    const submitted = await cli(appDir, "submit", "drop the note column");
    expect(submitted.code).toBe(2);
    expect(submitted.output).toContain("What approving costs: after this change, going back to an earlier version is refused unless the owner confirms it");
    const changeId = /needs_approval (\S+):/.exec(submitted.output)![1]!;
    await host.resolve("oneway", changeId, "approved", "user:me");
    expect((await cli(appDir, "history")).output).toContain("ONE-WAY: src/server.ts now runs");

    const refused = await cli(appDir, "undo", "back");
    expect(refused.code).toBe(2);
    expect(refused.output).toContain("pneuma: Going back to v1 would undo a change that putting files back cannot undo:");
    expect(refused.output).toContain("  - v2: src/server.ts now runs");
    expect(refused.output).toContain("This Host cannot put stored data back.");
    expect(refused.output).toContain("the older version may fail on today's data");
    expect(refused.output).toContain("node .pneuma/pneuma.mjs undo --accept-one-way");

    const noTerminal = await cli(appDir, "undo", "--accept-one-way", "back");
    expect(noTerminal.code).toBe(1);
    expect(noTerminal.output).toContain("must be run by a person in a terminal");

    // The HTTP route: the message, the reason and which case applies; 403 for anyone but the owner.
    const plain = await post(`${hostUrl}/apps/oneway/undo`, { reason: "back" });
    expect(plain.status).toBe(409);
    expect(plain.body).toMatchObject({ reason: "crosses_one_way_change", detail: ["v2"], data_restore: "none" });
    expect(String(plain.body.error)).toStartWith("Going back to v1 would undo a change that putting files back cannot undo:");
    for (const subject of ["agent:codex", "policy:auto"]) {
      expect((await post(`${hostUrl}/apps/oneway/undo`, { reason: "back", accept_one_way: true, subject })).status).toBe(403);
    }
    const confirmed = await post(`${hostUrl}/apps/oneway/undo`, { reason: "back", accept_one_way: true, subject: "user:me" });
    expect(confirmed).toMatchObject({ status: 200, body: { active_version: "v1", confirmed_by: "user:me", data_restored: false } });
    expect((await cli(appDir, "history")).output).toContain("went back past one-way v2: code only, stored data left as it was, confirmed by user:me");
  });

  test("with a data snapshot capability, the refusal says the data returns to the snapshot, and the owner's confirmation puts it back", async () => {
    const space = new FakeSpace();
    const restored: string[] = [];
    const withData = new AppHost({
      appsDir: join(work, "snapshot-apps"),
      space,
      overlayDir: join(EXAMPLE, "overlay"),
      cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
      owner: "user:me",
      policy: loadRiskPolicy(join(import.meta.dir, "..", "policy", "personal.json")),
      runVerify: async () => ({ ok: true, output: "tests passed" }),
      dataSnapshot: {
        id: "fake-snapshot",
        setAsideNote: "The data in use now is kept in the attic.",
        setAsideAfter: () => "The data that was in use is kept as attic-1.",
        snapshot: async () => ({ ref: "snap-1" }),
        restore: async ({ ref }) => void restored.push(ref),
      },
    });
    const snapshotServer = createHostServer(withData);
    await new Promise<void>((resolve) => snapshotServer.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(snapshotServer.address() as AddressInfo).port}`;
    const run = (cwd: string, ...args: string[]) =>
      runCommand(["node", join(EXAMPLE, "bin", "pneuma.mjs"), ...args], { cwd, env: { PNEUMA_HOST: url, PNEUMA_AGENT: "codex" }, timeoutMs: 20_000 });
    try {
      await run(work, "create", "kept");
      const appDir = join(work, "snapshot-apps", "kept");
      expect((await run(appDir, "status")).output).toContain("data snapshot: fake-snapshot (undo past a one-way change puts stored data back, with the owner's confirmation)");
      writeFileSync(join(appDir, "src", "server.ts"), "export const sql = `ALTER TABLE todos DROP COLUMN note`;\n");
      const changeId = /needs_approval (\S+):/.exec((await run(appDir, "submit", "drop the note column")).output)![1]!;
      await withData.resolve("kept", changeId, "approved", "user:me");

      const refused = await run(appDir, "undo", "back");
      expect(refused.code).toBe(2);
      expect(refused.output).toContain("This Host can put stored data back (fake-snapshot). The stored data would return to the snapshot snap-1, taken before v2 at ");
      expect(refused.output).toContain("Everything stored since then would be set aside and would not be in the app. The data in use now is kept in the attic.");
      expect(refused.output).toContain("node .pneuma/pneuma.mjs undo --accept-one-way");
      expect(restored).toEqual([]);

      const plain = await post(`${url}/apps/kept/undo`, { reason: "back" });
      expect(plain).toMatchObject({ status: 409, body: { reason: "crosses_one_way_change", data_restore: "snapshot" } });
      expect((await post(`${url}/apps/kept/undo`, { reason: "back", accept_one_way: true, subject: "agent:codex" })).status).toBe(403);
      expect(restored).toEqual([]);

      const confirmed = await post(`${url}/apps/kept/undo`, { reason: "back", accept_one_way: true, subject: "user:me" });
      expect(confirmed).toMatchObject({ status: 200, body: { active_version: "v1", data_restored: true, confirmed_by: "user:me", set_aside: "The data that was in use is kept as attic-1." } });
      expect(restored).toEqual(["snap-1"]);
      const history = (await run(appDir, "history")).output;
      expect(history).toContain("went back past one-way v2: stored data put back, confirmed by user:me");
      expect(history).toContain("    The data that was in use is kept as attic-1.");
    } finally {
      snapshotServer.close();
    }
  });

  test("a snapshot the capability will not take is refused before anything is released, and the CLI says nothing changed", async () => {
    const space = new FakeSpace();
    const published: string[] = [];
    space.onPublish = (name) => void (name === "forged" && published.push(name));
    const restored: string[] = [];
    const withData = new AppHost({
      appsDir: join(work, "forged-apps"),
      space,
      overlayDir: join(EXAMPLE, "overlay"),
      cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
      owner: "user:me",
      policy: loadRiskPolicy(join(import.meta.dir, "..", "policy", "personal.json")),
      runVerify: async () => ({ ok: true, output: "tests passed" }),
      dataSnapshot: {
        id: "fake-snapshot",
        snapshot: async () => ({ ref: "snap-1" }),
        check: async ({ ref }) => {
          if (ref !== "snap-1") throw new Error(`the fake made no snapshot called ${ref}. Nothing was changed`);
        },
        restore: async ({ ref }) => void restored.push(ref),
      },
    });
    const listening = createHostServer(withData);
    await new Promise<void>((resolve) => listening.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(listening.address() as AddressInfo).port}`;
    const run = (cwd: string, ...args: string[]) =>
      runCommand(["node", join(EXAMPLE, "bin", "pneuma.mjs"), ...args], { cwd, env: { PNEUMA_HOST: url, PNEUMA_AGENT: "codex" }, timeoutMs: 20_000 });
    let answer: { status: number; body: Record<string, unknown> };
    try {
      await run(work, "create", "forged");
      const appDir = join(work, "forged-apps", "forged");
      writeFileSync(join(appDir, "src", "server.ts"), "export const sql = `ALTER TABLE todos DROP COLUMN note`;\n");
      const changeId = /needs_approval (\S+):/.exec((await run(appDir, "submit", "drop the note column")).output)![1]!;
      await withData.resolve("forged", changeId, "approved", "user:me");
      const history = join(appDir, ".pneuma", "history.jsonl");
      writeFileSync(history, readFileSync(history, "utf8").replaceAll('"ref":"snap-1"', '"ref":"snap_billing_v1"'));
      published.length = 0;

      answer = await post(`${url}/apps/forged/undo`, { reason: "back", accept_one_way: true, subject: "user:me" });
      expect(answer).toMatchObject({ status: 409, body: { reason: "data_snapshot_refused", detail: ["snap_billing_v1"] } });
      expect(String(answer.body.error)).toContain("The undo was refused before anything happened: no code was released, no data was touched, and the record was not changed.");
      expect(published).toEqual([]);
      expect(restored).toEqual([]);
      expect((await run(appDir, "status")).output).toContain("forged: v2 at ");
    } finally {
      listening.close();
    }

    // The CLI reaches this answer only after the owner typed "accept" in a terminal, so a stand-in Host gives it.
    const standIn = standInHost((req, res) => {
      req.resume();
      req.on("end", () => res.writeHead(answer.status, { "content-type": "application/json", ...LEVEL }).end(JSON.stringify(answer.body)));
    });
    await new Promise<void>((resolve) => standIn.listen(0, "127.0.0.1", resolve));
    try {
      const standInUrl = `http://127.0.0.1:${(standIn.address() as AddressInfo).port}`;
      const refused = await runCommand(["node", join(EXAMPLE, "bin", "pneuma.mjs"), "undo", "back", "--app", "forged"], {
        cwd: work,
        env: { PNEUMA_HOST: standInUrl, PNEUMA_AGENT: "codex" },
        timeoutMs: 20_000,
      });
      expect(refused.code).toBe(3);
      expect(refused.output).toContain(`pneuma: ${answer.body.error}`);
      expect(refused.output).toContain("Nothing changed: no code was released and the stored data was not touched.");
      expect(refused.output).not.toContain("could not be put back");
    } finally {
      standIn.close();
    }
  });

  test("submit --one-way is refused by a governed Host", async () => {
    await cli(work, "create", "declared");
    const appDir = join(work, "apps", "declared");
    writeFileSync(join(appDir, "src", "server.ts"), "export const changed = true;\n");
    const result = await cli(appDir, "submit", "--one-way", "drops data", "tweak");
    expect(result.code).toBe(3);
    expect(result.output).toContain("one_way is for record mode only");
  });

  test("record mode: submit says nothing checked it, and a release that does not go live exits 1 and says what the address serves", async () => {
    const space = new FakeSpace();
    const recording = new AppHost({
      appsDir: join(work, "record-apps"),
      space,
      overlayDir: join(EXAMPLE, "overlay"),
      cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
      owner: "user:me",
      governance: "record",
      policy: loadRiskPolicy(join(import.meta.dir, "..", "policy", "personal.json")),
      runVerify: async () => ({ ok: false, output: "never runs in record mode" }),
    });
    const recordServer = createHostServer(recording);
    await new Promise<void>((resolve) => recordServer.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(recordServer.address() as AddressInfo).port}`;
    const run = (cwd: string, ...args: string[]) =>
      runCommand(["node", join(EXAMPLE, "bin", "pneuma.mjs"), ...args], { cwd, env: { PNEUMA_HOST: url, PNEUMA_AGENT: "claude-code" }, timeoutMs: 20_000 });
    try {
      const created = await run(work, "create", "free");
      expect(created.code).toBe(0);
      expect(created.output).toContain("Nothing checked or approved this change");
      const appDir = join(work, "record-apps", "free");
      expect((await run(appDir, "status")).output).toContain("record mode: submit records the working tree as the next version and publishes it.");

      writeFileSync(join(appDir, "src", "server.ts"), "export const sql = `DROP TABLE todos`;\n");
      const submitted = await run(appDir, "submit", "--one-way", "drops the todos table", "start over");
      expect(submitted.code).toBe(0);
      expect(submitted.output).toContain("published v2");
      expect(submitted.output).toContain("Nothing checked or approved this change: the Host recorded it and published it as it was.");
      expect(submitted.output).toContain("ONE-WAY: drops the todos table.");
      expect((await run(appDir, "history")).output).toContain("guarantees: none (recorded only)");

      space.refuse = (name) => name === "free";
      writeFileSync(join(appDir, "src", "extra.ts"), "export const extra = 1;\n");
      const failed = await run(appDir, "submit", "add a file");
      expect(failed.code).toBe(1);
      expect(failed.output).toContain("recorded v3, but it did not go live (publish_failed).");
      expect(failed.output).toContain("the address was not touched and still serves v2");
      expect((await run(appDir, "status")).output).toContain("the address serves v2, not v3: the last release did not go live");
    } finally {
      recordServer.close();
    }
  });
});

describe("what the CLI tells the agent to do after a release that did not go live is true", () => {
  /** A served Host on its own FakeSpace, and a CLI pointed at it. */
  async function served(options: Partial<ConstructorParameters<typeof AppHost>[0]>) {
    const space = new FakeSpace();
    const appsDir = mkdtempSync(join(work, "served-"));
    const served = new AppHost({
      appsDir,
      space,
      overlayDir: join(EXAMPLE, "overlay"),
      cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
      owner: "user:me",
      policy: loadRiskPolicy(join(import.meta.dir, "..", "policy", "personal.json")),
      runVerify: async () => ({ ok: true, output: "tests passed" }),
      ...options,
    });
    const listening = createHostServer(served);
    await new Promise<void>((resolve) => listening.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(listening.address() as AddressInfo).port}`;
    const run = (cwd: string, ...args: string[]) =>
      runCommand(["node", join(EXAMPLE, "bin", "pneuma.mjs"), ...args], { cwd, env: { PNEUMA_HOST: url, PNEUMA_AGENT: "claude-code" }, timeoutMs: 20_000 });
    return { space, host: served, appsDir, run, close: () => listening.close() };
  }
  const failingSnapshots = () => {
    const cap = {
      id: "fake-snapshot",
      fail: true,
      taken: [] as string[],
      snapshot: async ({ version }: { appRoot: string; version: string }) => {
        if (cap.fail) throw new Error("the disk is full");
        cap.taken.push(version);
        return { ref: `snap-${cap.taken.length}` };
      },
      restore: async () => {},
    };
    return cap;
  };

  test('"Fix the cause and submit again": with no new edits, the same submit releases the recorded version as it is', async () => {
    const { space, appsDir, run, close } = await served({ governance: "record" });
    try {
      await run(work, "create", "again");
      const appDir = join(appsDir, "again");
      space.refuse = (name) => name === "again";
      writeFileSync(join(appDir, "src", "extra.ts"), "export const extra = 1;\n");
      const failed = await run(appDir, "submit", "add a file");
      expect(failed.code).toBe(1);
      expect(failed.output).toContain("recorded v2, but it did not go live (publish_failed).");
      expect(failed.output).toContain("Fix the cause and submit again, or undo. Submitting with no new edits releases v2 as it is");
      expect((await run(appDir, "status")).output).toContain("the address serves v1, not v2: the last release did not go live. Submitting with no new edits releases v2 as it is.");

      space.refuse = null;
      const again = await run(appDir, "submit", "add a file");
      expect(again.code).toBe(0);
      expect(again.output).toContain("published v2 at http://space.test/apps/again/");
      expect(again.output).toContain("v2 was recorded earlier and did not go live then; it went live now, as it was. No new version was recorded.");
      expect((await run(appDir, "status")).output).not.toContain("did not go live");
      expect(space.live.get("again")!.files).toContain("src/extra.ts");
    } finally {
      close();
    }
  });

  test('"submit again once saving the data works", in record mode: the same submit takes the snapshot first and releases', async () => {
    const cap = failingSnapshots();
    const { appsDir, run, close } = await served({ governance: "record", dataSnapshot: cap });
    try {
      await run(work, "create", "saving");
      const appDir = join(appsDir, "saving");
      writeFileSync(join(appDir, "src", "server.ts"), "export const sql = `ALTER TABLE todos DROP COLUMN note`;\n");
      const failed = await run(appDir, "submit", "--one-way", "drops the note column", "drop notes");
      expect(failed.code).toBe(1);
      expect(failed.output).toContain("recorded v2, but it did not go live (data_snapshot_failed).");
      expect(failed.output).toContain("submit again once saving the data works");

      cap.fail = false;
      const again = await run(appDir, "submit", "drop notes");
      expect(again.code).toBe(0);
      expect(again.output).toContain("published v2");
      expect(again.output).toContain("ONE-WAY: drops the note column.");
      expect(cap.taken).toEqual(["v1"]);
    } finally {
      close();
    }
  });

  test("when the Host cannot vouch for what the address serves, status says so although the versions agree, and the next release that answers settles it", async () => {
    const { space, appsDir, run, close } = await served({ preview: false });
    try {
      await run(work, "create", "unsure");
      const appDir = join(appsDir, "unsure");
      writeFileSync(join(appDir, "src", "BOOT_FAILS"), "x");
      // The change does not come up, and putting v1 back is refused too.
      space.refuse = (_name, dir) => dir.endsWith(join("versions", "v1"));
      expect((await run(appDir, "submit", "crash on start")).code).toBe(1);
      space.refuse = null;

      const status = await run(appDir, "status");
      expect(status.output).toContain("unsure: v1 at ");
      expect(status.output).toContain("the Host cannot vouch for what the address serves: the address could not be put back on v1 and may still serve the rejected build");
      expect(status.output).toContain("The next release or undo that answers settles it.");
      expect(status.output).not.toContain("Submitting with no new edits");
      // list says it the same way, under the app.
      expect((await run(appsDir, "list")).output).toContain("  the Host cannot vouch for what the address serves: the address could not be put back on v1");

      rmSync(join(appDir, "src", "BOOT_FAILS"));
      writeFileSync(join(appDir, "src", "server.ts"), "export const changed = true;\n");
      const settled = await run(appDir, "submit", "tweak");
      expect(settled.code).toBe(0);
      expect(settled.output).toContain("published v2");
      expect((await run(appDir, "status")).output).not.toContain("cannot vouch");
    } finally {
      close();
    }
  });

  test('"submit again once saving the data works", in a governed mode: the change is still in the working tree, and goes out once approved', async () => {
    const cap = failingSnapshots();
    const { host: governed, appsDir, run, close } = await served({ dataSnapshot: cap });
    try {
      await run(work, "create", "guarded");
      const appDir = join(appsDir, "guarded");
      writeFileSync(join(appDir, "src", "server.ts"), "export const sql = `ALTER TABLE todos DROP COLUMN note`;\n");
      const first = /needs_approval (\S+):/.exec((await run(appDir, "submit", "drop notes")).output)![1]!;
      expect(await governed.resolve("guarded", first, "approved", "user:me")).toMatchObject({ status: "rejected", reason: "data_snapshot_failed" });

      cap.fail = false;
      const again = await run(appDir, "submit", "drop notes");
      expect(again.code).toBe(2);
      const second = /needs_approval (\S+):/.exec(again.output)![1]!;
      expect(await governed.resolve("guarded", second, "approved", "user:me")).toMatchObject({ status: "published", version: "v2" });
      expect(cap.taken).toEqual(["v1"]);
    } finally {
      close();
    }
  });
});

describe("the artifact CLI's connection to the Host", () => {
  const listen = async (server: Server) => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };
  const stop = (server: Server) => new Promise((resolve) => server.close(resolve));
  const readBody = async (req: IncomingMessage) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString();
  };
  const json = (res: ServerResponse, status: number, value: unknown) => res.writeHead(status, { "content-type": "application/json", ...LEVEL }).end(JSON.stringify(value));
  const cliAt = (url: string, ...args: string[]) =>
    runCommand(["node", join(EXAMPLE, "bin", "pneuma.mjs"), ...args], { env: { PNEUMA_HOST: url, PNEUMA_AGENT: "codex" }, timeoutMs: 20_000 });
  // A submit's answer from a Host at this CLI's level.
  const published = {
    status: "published",
    version: "v2",
    address: "http://space.test/apps/slow/",
    changed_paths: ["src/server.ts"],
    risks: ["low"],
    approved_by: ["policy:auto"],
    guarantees: ["verified", "previewed", "approved", "sealed"],
    agent: { name: "codex", source: "PNEUMA_AGENT" },
  };

  test("waits for as long as the Host takes to answer, and does not use fetch", async () => {
    let received: unknown;
    const server = standInHost(async (req, res) => {
      received = { method: req.method, url: req.url, type: req.headers["content-type"], body: JSON.parse(await readBody(req)) };
      setTimeout(() => json(res, 200, published), 2_500);
    });
    // fetch (undici) gives up waiting for headers after 300 s; poisoning it keeps it from coming back.
    const noFetch = join(work, "no-fetch.cjs");
    writeFileSync(noFetch, "globalThis.fetch = () => { throw new Error('pneuma.mjs must not use fetch'); };\n");
    try {
      const url = await listen(server);
      const started = Date.now();
      const result = await runCommand(["node", "--require", noFetch, join(EXAMPLE, "bin", "pneuma.mjs"), "submit", "--app", "slow", "add", "a", "chart"], {
        env: { PNEUMA_HOST: url, PNEUMA_AGENT: "codex" },
        timeoutMs: 20_000,
      });
      expect(Date.now() - started).toBeGreaterThanOrEqual(2_500);
      expect(result.output).toContain("published v2 at http://space.test/apps/slow/");
      expect(result.code).toBe(0);
      expect(received).toEqual({
        method: "POST",
        url: "/apps/slow/changes",
        type: "application/json",
        body: { intent: "add a chart", agent: "codex", agent_source: "PNEUMA_AGENT" },
      });
    } finally {
      await stop(server);
    }
  }, 15_000);

  test("a Host that takes the request and then drops the connection may still release it", async () => {
    let received = "";
    const server = standInHost(async (req) => {
      received = await readBody(req);
      req.socket.destroy();
    });
    try {
      const result = await cliAt(await listen(server), "submit", "--app", "slow", "add", "a", "chart");
      expect(received).toContain("add a chart");
      expect(result.code).toBe(3);
      expect(result.output).toContain("lost while it was working on the request");
      expect(result.output).toContain("the change may still be released: run status and history before submitting again");
      expect(result.output).not.toContain("docker compose up");
    } finally {
      await stop(server);
    }
  });

  test("an answer cut off halfway counts as a lost connection, not a result", async () => {
    // The CLI's first question is answered in full; the answer to the submit stops halfway.
    const server = createTcpServer((socket) =>
      socket.once("data", (chunk) =>
        socket.end(
          String(chunk).startsWith("GET /healthz ")
            ? `HTTP/1.1 200 OK\r\ncontent-type: application/json\r\npneuma-host-api: ${HOST_API_LEVEL}\r\ncontent-length: 11\r\nconnection: close\r\n\r\n{"ok":true}`
            : 'HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: 400\r\n\r\n{"status":"publ',
        ),
      ),
    );
    try {
      const result = await cliAt(await listen(server), "submit", "--app", "slow", "add", "a", "chart");
      expect(result.code).toBe(3);
      expect(result.output).toContain("the change may still be released");
      expect(result.output).not.toContain("docker compose up");
    } finally {
      await stop(server);
    }
  });

  test("nothing listening on the port: cannot reach the Host", async () => {
    const server = createTcpServer();
    const url = await listen(server);
    await stop(server);
    const result = await cliAt(url, "submit", "--app", "slow", "add", "a", "chart");
    expect(result.code).toBe(3);
    expect(result.output).toContain(`cannot reach the Host at ${url} (ECONNREFUSED). That address came from PNEUMA_HOST.`);
    expect(result.output).toContain("The Host may be running on another address, or not running.");
    expect(result.output).not.toContain("docker compose up");
    expect(result.output).not.toContain("may still be released");
  });

  test("a Host older than this CLI, or from before API levels: every command says to rebuild it in one line, and nothing is changed", async () => {
    // The CLI and the Host name the same level.
    expect(Number(/^const HOST_API_LEVEL = (\d+);$/m.exec(readFileSync(join(EXAMPLE, "bin", "pneuma.mjs"), "utf8"))![1])).toBe(HOST_API_LEVEL);
    const appDir = mkdtempSync(join(work, "older-host-"));
    for (const level of [undefined, String(HOST_API_LEVEL - 1)]) {
      const seen: string[] = [];
      // What a Host from before this change answers: GET /apps with names only, the rest as it did then.
      const server = createHttpServer(async (req, res) => {
        await readBody(req);
        seen.push(`${req.method} ${req.url}`);
        const body = req.url === "/apps" ? { apps: ["older", "todo"] } : req.url === "/healthz" ? { ok: true } : { app_id: "older", pending: [] };
        res.writeHead(200, { "content-type": "application/json", ...(level === undefined ? {} : { "pneuma-host-api": level }) }).end(JSON.stringify(body));
      });
      try {
        const url = await listen(server);
        const run = (...args: string[]) => runCommand(["node", join(EXAMPLE, "bin", "pneuma.mjs"), ...args], { cwd: appDir, env: { PNEUMA_HOST: url, PNEUMA_AGENT: "codex" }, timeoutMs: 20_000 });
        for (const args of [["list"], ["status", "older"], ["history", "older"], ["submit", "x", "--app", "older"], ["undo", "back", "--app", "older"], ["discard", "--app", "older"], ["create", "new"]]) {
          const result = await run(...args);
          expect({ args, code: result.code, output: result.output }).toEqual({ args, code: 3, output: `pneuma: the Host at ${url} is older than this CLI; rebuild it: docker compose up -d --build` });
        }
        expect(seen.filter((request) => !request.startsWith("GET "))).toEqual([]);
      } finally {
        await stop(server);
      }
    }
  });

  test("a refusal from the Host is reported through its error field", async () => {
    const server = standInHost(async (req, res) => {
      await readBody(req);
      if (req.method === "POST") json(res, 409, { error: "another change to slow is still being checked" });
      else res.writeHead(502, { "content-type": "text/html" }).end("<h1>Bad Gateway</h1>");
    });
    try {
      const url = await listen(server);
      const refused = await cliAt(url, "submit", "--app", "slow", "add", "a", "chart");
      expect(refused.code).toBe(3);
      expect(refused.output).toBe("pneuma: another change to slow is still being checked");
      const broken = await cliAt(url, "list");
      expect(broken.code).toBe(3);
      expect(broken.output).toBe("pneuma: GET /apps answered 502");
    } finally {
      await stop(server);
    }
  });
});

/**
 * Runs a CLI with exactly the environment given, plus PATH: no PNEUMA_HOST or agent markers leak in from
 * the shell that runs the tests.
 */
function bare(cwd: string, script: string, args: string[], env: Record<string, string> = {}): Promise<{ code: number; output: string; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("node", [script, ...args], { cwd, env: { PATH: process.env.PATH ?? "", ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => ((output += chunk), (stdout += chunk)));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => ((output += chunk), (stderr += chunk)));
    child.on("close", (code) => resolve({ code: code ?? 1, output: output.trim(), stdout, stderr }));
  });
}

/** Runs a command line the way an agent copies it into a shell, with nothing exported but PATH. */
function shell(cwd: string, command: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", command], { cwd, env: { PATH: process.env.PATH ?? "" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

describe("the Host's address, as the Host recorded it", () => {
  let addrWork: string;
  let addrServer: ReturnType<typeof createHostServer>;
  let url: string;
  let closedUrl: string;
  const appDir = () => join(addrWork, "apps", "moved");
  const own = (args: string[], env: Record<string, string> = {}) => bare(appDir(), ".pneuma/pneuma.mjs", args, { PNEUMA_AGENT: "codex", ...env });

  beforeAll(async () => {
    addrWork = mkdtempSync(join(tmpdir(), "space-all-in-one-address-"));
    // Two ports nobody holds: one for this Host, which records its address before it listens, and one left closed.
    const freePort = async () => {
      const placeholder = createTcpServer();
      await new Promise<void>((resolve) => placeholder.listen(0, "127.0.0.1", resolve));
      const { port } = placeholder.address() as AddressInfo;
      await new Promise((resolve) => placeholder.close(resolve));
      return port;
    };
    const port = await freePort();
    url = `http://127.0.0.1:${port}`;
    closedUrl = `http://127.0.0.1:${await freePort()}`;
    addrServer = createHostServer(
      new AppHost({
        appsDir: join(addrWork, "apps"),
        space: new FakeSpace(),
        overlayDir: join(EXAMPLE, "overlay"),
        cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
        owner: "user:me",
        policy: loadRiskPolicy(join(EXAMPLE, "policy", "personal.json")),
        runVerify: async () => ({ ok: true, output: "tests passed" }),
        hostUrl: url,
      }),
    );
    await new Promise<void>((resolve) => addrServer.listen(port, "127.0.0.1", resolve));
  });
  afterAll(() => {
    addrServer.close();
    rmSync(addrWork, { recursive: true, force: true });
  });

  test("on a port other than 8090, status and submit work from the app directory with no PNEUMA_HOST", async () => {
    const created = await bare(addrWork, join(EXAMPLE, "bin", "pneuma.mjs"), ["create", "moved", "--host", url]);
    expect(created.code).toBe(0);
    const recorded = JSON.parse(readFileSync(join(appDir(), ".pneuma", "host.json"), "utf8"));
    expect(recorded).toMatchObject({ schema_version: 1, url, scope: "app" });

    const status = await own(["status"]);
    expect(status.code).toBe(0);
    expect(status.output).toContain("moved: v1 at http://space.test/apps/moved/");

    writeFileSync(join(appDir(), "src", "server.ts"), "export const moved = true;\n");
    const submitted = await own(["submit", "say", "it", "moved"]);
    expect(submitted.code).toBe(0);
    expect(submitted.output).toContain("published v2");
  });

  test("the copy run by its path from another directory finds the address recorded beside it", async () => {
    const elsewhere = mkdtempSync(join(tmpdir(), "space-all-in-one-elsewhere-"));
    try {
      const status = await bare(elsewhere, join(appDir(), ".pneuma", "pneuma.mjs"), ["status", "--app", "moved"]);
      expect(status.code).toBe(0);
      expect(status.output).toContain("moved: v2");
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  test("--host comes before PNEUMA_HOST, which comes before the recorded address", async () => {
    expect((await own(["status", "--host", url], { PNEUMA_HOST: closedUrl })).code).toBe(0);
    const env = await own(["status"], { PNEUMA_HOST: closedUrl });
    expect(env.code).toBe(3);
    expect(env.output).toContain(`cannot reach the Host at ${closedUrl} (ECONNREFUSED). That address came from PNEUMA_HOST.`);
    const flag = await own(["status", "--host", closedUrl]);
    expect(flag.output).toContain(`cannot reach the Host at ${closedUrl} (ECONNREFUSED). That address came from the --host flag.`);
  });

  test("a recorded address nobody answers on: the message names it, where it came from, and does not say the stack is down", async () => {
    const file = join(appDir(), ".pneuma", "host.json");
    const before = readFileSync(file, "utf8");
    writeFileSync(file, JSON.stringify({ ...JSON.parse(before), url: closedUrl }));
    try {
      const status = await own(["status"]);
      expect(status.code).toBe(3);
      expect(status.output).toContain(`pneuma: cannot reach the Host at ${closedUrl} (ECONNREFUSED). That address was recorded by the Host on 20`);
      // The CLI names the file by the path it found it at; the temp directory may sit behind a symlink (macOS /var).
      expect(status.output).toContain(` UTC in ${realpathSync(file)}.`);
      expect(status.output).toContain("The Host may be running on another address, or not running. Ask the user for its address, then pass --host <url> or set PNEUMA_HOST.");
      expect(status.output).not.toContain("docker compose");
      expect(status.output).not.toContain("down");
    } finally {
      writeFileSync(file, before);
    }
  });

  test("the app's AGENTS.md says where the address comes from, and no longer that the stack is down", () => {
    const agents = readFileSync(join(appDir(), "AGENTS.md"), "utf8");
    expect(agents).toContain("The CLI finds the host at the address the host recorded in `.pneuma/host.json`");
    expect(agents).toContain("The host may be running on another address, or not running");
    expect(agents).not.toContain("the stack is down");
  });
});

describe("the agent a submit records, and where its name came from", () => {
  const CLI = join(EXAMPLE, "bin", "pneuma.mjs");
  const BOTH = { CLAUDECODE: "1", CLAUDE_CODE_ENTRYPOINT: "cli", CODEX_THREAD_ID: "019a2b3c-thread" };
  let appDir: string;
  let n = 0;
  const submit = async (env: Record<string, string>, ...extra: string[]) => {
    writeFileSync(join(appDir, "src", "server.ts"), `export const n = ${++n};\n`);
    return bare(appDir, CLI, ["submit", `change ${n}`, ...extra], { PNEUMA_HOST: hostUrl, ...env });
  };
  const lastEntry = () => host.history("agents").at(-1)!;

  beforeAll(async () => {
    await cli(work, "create", "agents");
    appDir = join(work, "apps", "agents");
  });

  test("with markers of two agents and nothing naming one, submit warns, records unknown with the candidates, and still submits", async () => {
    const result = await submit(BOTH);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("published v");
    expect(result.stderr).toContain("pneuma: warning: markers of more than one agent are set (claude-code: CLAUDECODE, CLAUDE_CODE_ENTRYPOINT; codex: CODEX_THREAD_ID)");
    expect(result.stderr).toContain("Say which agent you are with --agent <name> or PNEUMA_AGENT=<name>.");
    expect(result.stdout).toContain("recorded agent: unknown (markers of more than one agent are set: claude-code from CLAUDECODE, CLAUDE_CODE_ENTRYPOINT; codex from CODEX_THREAD_ID)");
    expect(lastEntry()).toMatchObject({
      agent: "unknown",
      agent_source: "ambiguous",
      agent_candidates: [
        { agent: "claude-code", markers: ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"] },
        { agent: "codex", markers: ["CODEX_THREAD_ID"] },
      ],
    });
    const history = await bare(appDir, CLI, ["history"], { PNEUMA_HOST: hostUrl });
    expect(history.output).toContain(`by unknown [agent-driven]: change ${n}`);
    expect(history.output).toContain("    agent unknown: markers of more than one agent were set (claude-code: CLAUDECODE, CLAUDE_CODE_ENTRYPOINT; codex: CODEX_THREAD_ID)");
  });

  test("--json carries the recorded agent and stays one JSON document; the warning goes to stderr", async () => {
    const result = await submit(BOTH, "--json");
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toMatchObject({ status: "published", agent: { name: "unknown", source: "ambiguous", candidates: [{ agent: "claude-code" }, { agent: "codex" }] } });
    expect(result.stderr).toContain("warning: markers of more than one agent are set");
  });

  test("PNEUMA_AGENT and --agent name the agent over any markers, and the output says which did", async () => {
    const env = await submit({ ...BOTH, PNEUMA_AGENT: "codex" });
    expect(env.stdout).toContain("recorded agent: codex (from PNEUMA_AGENT)");
    expect(env.stderr).toBe("");
    expect(lastEntry()).toMatchObject({ agent: "codex", agent_source: "PNEUMA_AGENT" });
    expect(lastEntry().agent_candidates).toBeUndefined();

    const flag = await submit({ ...BOTH, PNEUMA_AGENT: "codex" }, "--agent", "claude-code");
    expect(flag.stdout).toContain("recorded agent: claude-code (from the --agent flag)");
    expect(lastEntry()).toMatchObject({ agent: "claude-code", agent_source: "--agent" });

    const json = JSON.parse((await submit({ PNEUMA_AGENT: "codex" }, "--json")).stdout);
    expect(json.agent).toEqual({ name: "codex", source: "PNEUMA_AGENT" });
  });

  test("one agent's markers: detected, naming the marker; none: unknown, saying nothing named or detected it", async () => {
    const detected = await submit({ CLAUDECODE: "1" });
    expect(detected.stdout).toContain("recorded agent: claude-code (detected from CLAUDECODE)");
    expect(lastEntry()).toMatchObject({ agent: "claude-code", agent_source: "detected", agent_markers: ["CLAUDECODE"] });

    const none = await submit({});
    expect(none.stdout).toContain("recorded agent: unknown (no --agent, no PNEUMA_AGENT, and no agent's markers in the environment)");
    expect(lastEntry()).toMatchObject({ agent: "unknown", agent_source: "none" });
  });

  test("CODEX_ variables a person or another tool sets are not Codex's markers: only those Codex sets in its shells are", async () => {
    // A Claude Code shell with CODEX_HOME from a shell profile and the Codex plugin's session id.
    const inherited = { CODEX_HOME: "/Users/me/.codex", CODEX_COMPANION_SESSION_ID: "c-123", CODEX_MANAGED_BY_NPM: "1" };
    const claude = await submit({ CLAUDECODE: "1", CLAUDE_CODE_ENTRYPOINT: "cli", ...inherited });
    expect(claude.code).toBe(0);
    expect(claude.stderr).toBe("");
    expect(claude.stdout).toContain("recorded agent: claude-code (detected from CLAUDECODE, CLAUDE_CODE_ENTRYPOINT)");
    expect(lastEntry()).toMatchObject({ agent: "claude-code", agent_source: "detected", agent_markers: ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"] });

    // A shell Codex started, as in pandazki/pneuma-framework#3: its own variables beside the inherited ones.
    const codex = await submit({ CODEX_THREAD_ID: "019a2b3c-thread", CODEX_TOOL_CALL_ID: "call_1", ...inherited });
    expect(codex.stderr).toBe("");
    expect(codex.stdout).toContain("recorded agent: codex (detected from CODEX_THREAD_ID, CODEX_TOOL_CALL_ID)");
    expect(lastEntry()).toMatchObject({ agent: "codex", agent_source: "detected", agent_markers: ["CODEX_THREAD_ID", "CODEX_TOOL_CALL_ID"] });

    // Inherited ones alone name nobody.
    expect((await submit(inherited)).stdout).toContain("recorded agent: unknown (no --agent, no PNEUMA_AGENT, and no agent's markers in the environment)");
  });

  test("undo with markers of two agents warns too, and says only what its entry keeps: the name unknown", async () => {
    await submit({ PNEUMA_AGENT: "codex" });
    const result = await bare(appDir, CLI, ["undo", "back one"], { PNEUMA_HOST: hostUrl, ...BOTH });
    expect(result.code).toBe(0);
    expect(result.stderr).toContain('pneuma: warning: markers of more than one agent are set (claude-code: CLAUDECODE, CLAUDE_CODE_ENTRYPOINT; codex: CODEX_THREAD_ID), so this undo is recorded as done by "unknown".');
    expect(result.stderr).not.toContain("candidates kept");
    expect(lastEntry()).toMatchObject({ kind: "restore", agent: "unknown" });
  });

  test("the Host refuses a name picked from several candidates", async () => {
    writeFileSync(join(appDir, "src", "server.ts"), "export const picked = true;\n");
    const res = await fetch(`${hostUrl}/apps/agents/changes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "pick one", agent: "codex", agent_source: "ambiguous", agent_candidates: [{ agent: "codex", markers: ["CODEX_THREAD_ID"] }] }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('recorded as "unknown"');
  });
});

describe("the test check, as submit and history show it", () => {
  test("submit warns in one line when app code changed and none of the app's own tests ran; history shows what ran", async () => {
    const counted = new AppHost({
      appsDir: join(work, "counted-apps"),
      space: new FakeSpace(),
      overlayDir: join(EXAMPLE, "overlay"),
      cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
      owner: "user:me",
      policy: loadRiskPolicy(join(EXAMPLE, "policy", "personal.json")),
      runVerify: (root) => templateTests(root),
    });
    const countedServer = createHostServer(counted);
    await new Promise<void>((resolve) => countedServer.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(countedServer.address() as AddressInfo).port}`;
    const run = (cwd: string, ...args: string[]) => bare(cwd, join(EXAMPLE, "bin", "pneuma.mjs"), args, { PNEUMA_HOST: url, PNEUMA_AGENT: "codex" });
    try {
      expect((await run(work, "create", "timer")).code).toBe(0);
      const appDir = join(work, "counted-apps", "timer");
      writeFileSync(join(appDir, "src", "server.ts"), "export const minutes = 25;\n");
      const untested = await run(appDir, "submit", "a pomodoro timer");
      expect(untested.code).toBe(0);
      const warnings = untested.stdout.split("\n").filter((line) => line.startsWith("warning:"));
      expect(warnings).toEqual([
        "warning: this change touched app code (src/server.ts) and none of the app's own tests ran. Add a test for it as a *.test.ts file under src/.",
      ]);

      writeFileSync(join(appDir, "src", "server.test.ts"), "// GET / answers\n");
      const tested = await run(appDir, "submit", "test the timer");
      expect(tested.code).toBe(0);
      expect(tested.stdout).not.toContain("warning:");

      const history = (await run(appDir, "history")).stdout;
      expect(history).toContain("    tests (passed): 2 tests ran in 2 files, all of them the SDK's (sdk/); none of the app's own.");
      expect(history).toContain("    tests (passed): 3 tests ran in 3 files. The app's own: 1 test in 1 file; the rest are the SDK's (sdk/).");
    } finally {
      countedServer.close();
    }
  });
});

describe("from the directory that holds the apps, or from anywhere with the guide", () => {
  let rootWork: string;
  let rootServer: ReturnType<typeof createHostServer>;
  let rootHost: AppHost;
  let url: string;
  const appsDir = () => join(rootWork, "apps");
  // The copy the Host keeps in the apps directory, run there with nothing exported.
  const here = (args: string[], env: Record<string, string> = {}) => bare(appsDir(), ".pneuma/pneuma.mjs", args, { PNEUMA_AGENT: "codex", ...env });

  beforeAll(async () => {
    rootWork = mkdtempSync(join(tmpdir(), "space-all-in-one-root-"));
    const placeholder = createTcpServer();
    await new Promise<void>((resolve) => placeholder.listen(0, "127.0.0.1", resolve));
    const { port } = placeholder.address() as AddressInfo;
    await new Promise((resolve) => placeholder.close(resolve));
    url = `http://127.0.0.1:${port}`;
    rootHost = new AppHost({
      appsDir: join(rootWork, "apps"),
      space: new FakeSpace(),
      overlayDir: join(EXAMPLE, "overlay"),
      cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
      owner: "user:me",
      policy: loadRiskPolicy(join(EXAMPLE, "policy", "personal.json")),
      runVerify: async () => ({ ok: true, output: "tests passed" }),
      hostUrl: url,
    });
    rootServer = createHostServer(rootHost);
    await new Promise<void>((resolve) => rootServer.listen(port, "127.0.0.1", resolve));
    rootHost.announce();
  });
  afterAll(() => {
    rootServer.close();
    rmSync(rootWork, { recursive: true, force: true });
  });

  test("with no app selected: list, create and status <name> work, and the agent there is told what the directory is", async () => {
    expect(readFileSync(join(appsDir(), "AGENTS.md"), "utf8")).toContain(`The Host is at ${url}`);
    expect((await here(["list"])).stdout).toContain("no apps yet");

    const created = await here(["create", "alpha"]);
    expect(created.code).toBe(0);
    expect(created.stdout).toContain(`The app directory is ${join(realpathSync(appsDir()), "alpha")}.`);
    await here(["create", "beta"]);
    writeFileSync(join(appsDir(), "beta", "src", "server.ts"), "export const sql = 'DROP TABLE todos';\n");
    const waiting = await bare(join(appsDir(), "beta"), ".pneuma/pneuma.mjs", ["submit", "start over"], { PNEUMA_AGENT: "codex" });
    expect(waiting.code).toBe(2);
    writeFileSync(join(appsDir(), "alpha", "src", "server.ts"), "export const draft = true;\n");

    const status = await here(["status", "alpha"]);
    expect(status.code).toBe(0);
    expect(status.stdout).toContain("alpha: v1 at http://space.test/apps/alpha/");
    expect((await here(["history", "beta"])).stdout).toContain("change needs_approval by codex [agent-driven]: start over");
    const nothing = await here(["submit", "x"]);
    expect(nothing.code).toBe(1);
    expect(nothing.output).toContain("Name the app with --app <name> (status and history also take it as a word); list shows every app.");
  });

  test("one call answers how many apps, which versions, and what waits for the owner; --json carries all of it", async () => {
    const list = await here(["list"]);
    expect(list.code).toBe(0);
    const lines = list.stdout.trim().split("\n");
    expect(lines[0]).toBe(`2 apps on the Host at ${url}, in personal mode. Waiting for the owner: 1 change (beta).`);
    expect(list.stdout).toContain("alpha  v1  http://space.test/apps/alpha/");
    expect(list.stdout).toContain('  last change ');
    expect(list.stdout).toContain(' by host: "Create the app from the PneumaSpace template" (create published v1)');
    expect(list.stdout).toContain("  uncommitted: src/server.ts");
    expect(list.stdout).toMatch(/ {2}waiting for the owner: c\S+ "start over" \(.*destructive_definition/);

    const json = JSON.parse((await here(["list", "--json"])).stdout);
    expect(json.governance).toBe("personal");
    expect(json.apps.map((a: { app_id: string }) => a.app_id)).toEqual(["alpha", "beta"]);
    expect(json.apps[1]).toMatchObject({ active_version: "v1", serves_other_version: false, pending: [{ intent: "start over", agent: "codex" }] });
    expect(json.apps[1].pending[0].disclosure.length).toBeGreaterThan(0);
  });

  test("ten apps stay readable: a line per app, and more only for what deserves a look", async () => {
    for (let i = 0; i < 8; i++) expect((await here(["create", `app-${i}`])).code).toBe(0);
    const list = (await here(["list"])).stdout.trim();
    const blocks = list.split("\n\n").slice(1);
    expect(blocks).toHaveLength(10);
    for (const block of blocks) {
      // Name, version and address, then the last change; a waiting change, uncommitted files or an address on another version add a line each.
      expect(block).toMatch(/^[a-z0-9-]+ +v\d+ {2}http:\/\/space\.test\/apps\/[a-z0-9-]+\/\n {2}last change /);
      expect(block.split("\n").length).toBe(block.startsWith("alpha") ? 3 : block.startsWith("beta") ? 4 : 2);
    }
  });

  test("guide prints a self-contained block, and an agent in an unrelated directory can run what it says", async () => {
    const guide = await here(["guide"]);
    expect(guide.code).toBe(0);
    const root = realpathSync(appsDir());
    const cli = join(root, ".pneuma", "pneuma.mjs");
    expect(guide.stdout).toContain("<!-- pneuma-apps:begin");
    expect(guide.stdout).toContain(`kept and published by a pneuma Host at ${url}. The app directories are in '${root}'`);
    expect(guide.stdout).toContain(`\`node '${cli}' list\``);
    expect(guide.stdout).toContain(`\`node '${cli}' status <name>\``);
    expect(guide.stdout).toContain(`\`node '${cli}' create <name>\``);
    expect(guide.stdout).toContain("A change goes live only through that app's own submit.");
    // From an app's directory the block is the same: the apps live in its parent.
    expect((await bare(join(appsDir(), "alpha"), ".pneuma/pneuma.mjs", ["guide"])).stdout).toBe(guide.stdout);

    const listCommand = /`(node .+? list)`/.exec(guide.stdout)![1]!;
    const elsewhere = mkdtempSync(join(tmpdir(), "space-all-in-one-anywhere-"));
    try {
      const list = await shell(elsewhere, listCommand);
      expect(list.code).toBe(0);
      expect(list.stdout).toContain("10 apps on the Host at");
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  test("in an apps directory whose name has a space and a quote, the commands in the guide run as copied", async () => {
    const spaced = join(mkdtempSync(join(tmpdir(), "space-all-in-one-spaced-")), "My Apps (Bob's)");
    const placeholder = createTcpServer();
    await new Promise<void>((resolve) => placeholder.listen(0, "127.0.0.1", resolve));
    const { port } = placeholder.address() as AddressInfo;
    await new Promise((resolve) => placeholder.close(resolve));
    const spacedUrl = `http://127.0.0.1:${port}`;
    const spacedHost = new AppHost({
      appsDir: spaced,
      space: new FakeSpace(),
      overlayDir: join(EXAMPLE, "overlay"),
      cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
      owner: "user:me",
      policy: loadRiskPolicy(join(EXAMPLE, "policy", "personal.json")),
      runVerify: async () => ({ ok: true, output: "tests passed" }),
      hostUrl: spacedUrl,
    });
    const spacedServer = createHostServer(spacedHost);
    await new Promise<void>((resolve) => spacedServer.listen(port, "127.0.0.1", resolve));
    const elsewhere = mkdtempSync(join(tmpdir(), "space-all-in-one-anywhere-"));
    try {
      spacedHost.announce();
      const guide = await bare(spaced, ".pneuma/pneuma.mjs", ["guide"]);
      expect(guide.code).toBe(0);
      const commands = [...guide.stdout.matchAll(/`(node [^`]+)`/g)].map((match) => match[1]!);
      expect(commands).toHaveLength(4);
      const create = await shell(elsewhere, commands.find((command) => command.endsWith(" create <name>"))!.replace("<name>", "notes"));
      expect(create.code).toBe(0);
      const list = await shell(elsewhere, commands.find((command) => command.endsWith(" list"))!);
      expect(list).toMatchObject({ code: 0, stderr: "" });
      expect(list.stdout).toContain(`1 app on the Host at ${spacedUrl}`);
      expect(guide.stdout).toContain(`The app directories are in '${realpathSync(spaced).replaceAll("'", "'\\''")}'`);
    } finally {
      spacedServer.close();
      rmSync(elsewhere, { recursive: true, force: true });
      rmSync(dirname(spaced), { recursive: true, force: true });
    }
  });

  test("guide --write adds the block to the named file, replaces it on the next run, and touches nothing else", async () => {
    const dir = mkdtempSync(join(tmpdir(), "space-all-in-one-guide-"));
    try {
      const file = join(dir, "AGENTS.md");
      writeFileSync(file, "# My instructions\n\nBe brief.\n");
      const first = await here(["guide", "--write", file]);
      expect(first.code).toBe(0);
      expect(first.stdout).toBe(`added the pneuma block to ${file}\n`);
      const once = readFileSync(file, "utf8");
      expect(once).toStartWith("# My instructions\n\nBe brief.\n\n<!-- pneuma-apps:begin");
      expect(once).toEndWith("<!-- pneuma-apps:end -->\n");

      writeFileSync(file, `${once}\nA line I added later.\n`);
      const second = await here(["guide", "--write", file]);
      expect(second.stdout).toBe(`replaced the pneuma block in ${file}\n`);
      const twice = readFileSync(file, "utf8");
      expect(twice.split("pneuma-apps:begin").length).toBe(2);
      expect(twice).toStartWith("# My instructions\n\nBe brief.\n\n<!-- pneuma-apps:begin");
      expect(twice).toEndWith("<!-- pneuma-apps:end -->\n\nA line I added later.\n");
      expect(readdirSync(dir)).toEqual(["AGENTS.md"]);

      const fresh = join(dir, "new.md");
      expect((await here(["guide", "--write", fresh])).stdout).toBe(`wrote the pneuma block to ${fresh}\n`);
      expect(readdirSync(dir).sort()).toEqual(["AGENTS.md", "new.md"]);

      // With no file named, it says so and fails; it does not print the block and succeed.
      const unnamed = await here(["guide", "--write"]);
      expect(unnamed).toMatchObject({ code: 1, stdout: "", stderr: "pneuma: guide --write takes the file to put the block in\n" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("guide --write replaces its own block when stray markers sit elsewhere in the file, and keeps the text around them", async () => {
    const dir = mkdtempSync(join(tmpdir(), "space-all-in-one-guide-"));
    try {
      const file = join(dir, "AGENTS.md");
      const BEGIN = "<!-- pneuma-apps:begin (written by pneuma.mjs guide; guide --write replaces this block) -->";
      const END = "<!-- pneuma-apps:end -->";
      // A stray end marker, then a begin marker whose block was cut off by hand, each with the person's text after it.
      const mine = `# Mine\n${END}\nNotes after a stray end.\n${BEGIN}\nNotes after a stray begin.\n`;
      writeFileSync(file, mine);
      for (let run = 0; run < 3; run++) expect((await here(["guide", "--write", file])).code).toBe(0);
      const written = readFileSync(file, "utf8");
      expect(written).toStartWith(`${mine}\n${BEGIN}\n## My apps (pneuma Host)`);
      expect(written.split(BEGIN).length).toBe(3);
      expect(written.split("## My apps (pneuma Host)").length).toBe(2);
      expect(written).toEndWith(`${END}\n`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a create sent to another Host with --host does not claim the app landed in this directory", async () => {
    const other = new AppHost({
      appsDir: join(rootWork, "other-apps"),
      space: new FakeSpace(),
      overlayDir: join(EXAMPLE, "overlay"),
      cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
      owner: "user:me",
      policy: loadRiskPolicy(join(EXAMPLE, "policy", "personal.json")),
      runVerify: async () => ({ ok: true, output: "tests passed" }),
    });
    const otherServer = createHostServer(other);
    await new Promise<void>((resolve) => otherServer.listen(0, "127.0.0.1", resolve));
    try {
      const created = await here(["create", "gamma", "--host", `http://127.0.0.1:${(otherServer.address() as AddressInfo).port}`]);
      expect(created.code).toBe(0);
      expect(created.stdout).toContain("The app directory is gamma/ in the Host's apps directory");
      expect(created.stdout).not.toContain(realpathSync(appsDir()));
      expect(existsSync(join(rootWork, "other-apps", "gamma", ".pneuma", "app.json"))).toBe(true);
    } finally {
      otherServer.close();
    }
  });

  test("guide refuses when it cannot tell where the apps live", async () => {
    const dir = mkdtempSync(join(tmpdir(), "space-all-in-one-noapps-"));
    try {
      writeFileSync(join(dir, "pneuma.mjs"), readFileSync(join(EXAMPLE, "bin", "pneuma.mjs")));
      const guide = await bare(dir, join(dir, "pneuma.mjs"), ["guide"], { PNEUMA_HOST: url });
      expect(guide.code).toBe(1);
      expect(guide.output).toContain("guide needs to know where the apps live");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the same Host by another loopback name is still this directory's Host", async () => {
    const guide = await here(["guide"], { PNEUMA_HOST: url.replace("127.0.0.1", "localhost") });
    expect(guide.code).toBe(0);
    expect(guide.stdout).toContain(`The app directories are in '${realpathSync(appsDir())}'`);
  });

  test("a record left in a directory the apps moved out of: guide refuses, and create does not name that directory", async () => {
    // What a move of PNEUMA_APPS_DIR leaves behind: the old directory keeps the Host's address record and CLI copy.
    const old = join(rootWork, "old-apps");
    mkdirSync(join(old, ".pneuma"), { recursive: true });
    for (const file of ["host.json", "pneuma.mjs"]) writeFileSync(join(old, ".pneuma", file), readFileSync(join(appsDir(), ".pneuma", file)));
    const stale = (args: string[]) => bare(old, ".pneuma/pneuma.mjs", args, { PNEUMA_AGENT: "codex" });

    const guide = await stale(["guide"]);
    expect(guide.code).toBe(1);
    expect(guide.output).toContain(`the apps directory found here (${realpathSync(old)}) does not hold the apps of the Host at ${url} (not there: alpha, app-0,`);
    expect(guide.output).toContain("Run guide in the Host's apps directory, or in one of its apps.");

    const created = await stale(["create", "delta"]);
    expect(created.code).toBe(0);
    expect(created.stdout).toContain("The app directory is delta/ in the Host's apps directory");
    expect(created.stdout).not.toContain(realpathSync(old));
    expect(existsSync(join(appsDir(), "delta", ".pneuma", "app.json"))).toBe(true);
  });

  test("list stays readable when an app's files have fields missing, and names each app by its directory", async () => {
    expect((await here(["create", "odd"])).code).toBe(0);
    const dir = join(appsDir(), "odd", ".pneuma");
    // A history line and a waiting change written by hand, with the intent, the agent and the risks left out.
    appendFileSync(join(dir, "history.jsonl"), `${JSON.stringify({ kind: "change", outcome: "published", at: "2026-11-24T08:00:00.000Z" })}\n`);
    mkdirSync(join(dir, "pending"), { recursive: true });
    writeFileSync(join(dir, "pending", "c-hand.json"), JSON.stringify({ change_id: "c-hand", created_at: "2026-11-24T08:01:00.000Z" }));
    // app.json is in the app directory, where an agent can edit it; the commands take the directory name.
    const info = join(dir, "app.json");
    writeFileSync(info, JSON.stringify({ ...JSON.parse(readFileSync(info, "utf8")), app_id: "renamed" }));

    const list = await here(["list"]);
    expect(list.code).toBe(0);
    // The waiting change has no intent, agent or risks to show the owner, so it is named, not listed.
    const malformed =
      ".pneuma/pending/c-hand.json is not a waiting change in the shape this Host writes (intent is missing or not text), so it is not listed and cannot be approved or denied. Look at it, then delete it.";
    expect(list.stdout).toMatch(/\nodd +v1 {2}http:\/\/space\.test\/apps\/odd\/\n {2}last change 2026-11-24 08:00 UTC by : "" \(change published\)\n {2}\.pneuma\/pending\/c-hand\.json /);
    expect(list.stdout).toContain(`\n  ${malformed}\n`);
    expect(list.stdout).not.toContain("renamed");
    const status = await here(["status", "odd"]);
    expect(status.code).toBe(0);
    expect(status.stdout).toContain(`uncommitted: none\n${malformed}\n`);
    expect(JSON.parse((await here(["list", "--json"])).stdout).apps.map((a: { app_id: string }) => a.app_id)).toContain("odd");
  });
});
