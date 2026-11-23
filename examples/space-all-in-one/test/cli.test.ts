import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createTcpServer, type AddressInfo, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppHost } from "../src/host";
import { loadRiskPolicy } from "../src/policy";
import { createHostServer } from "../src/server";
import { runCommand } from "../src/space";
import { FakeSpace } from "./fake-space";

// The path a coding agent actually takes: the artifact's own CLI, over HTTP, to a served Host.
const EXAMPLE = join(import.meta.dir, "..");
let work: string;
let server: ReturnType<typeof createHostServer>;
let hostUrl: string;
let host: AppHost;

const cli = (cwd: string, ...args: string[]) =>
  runCommand(["node", join(EXAMPLE, "bin", "pneuma.mjs"), ...args], { cwd, env: { PNEUMA_HOST: hostUrl, PNEUMA_AGENT: "codex" }, timeoutMs: 20_000 });

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), "space-all-in-one-cli-"));
  host = new AppHost({
    appsDir: join(work, "apps"),
    space: new FakeSpace(),
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

  test("errors are plain: unknown app, unreachable host", async () => {
    expect((await cli(work, "status", "--app", "ghost")).output).toContain("no app named ghost");
    const down = await runCommand(["node", join(EXAMPLE, "bin", "pneuma.mjs"), "list"], { env: { PNEUMA_HOST: "http://127.0.0.1:1" } });
    expect(down.code).toBe(3);
    expect(down.output).toContain("cannot reach the Host");
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
      expect(refused.output).toContain("This Host can put stored data back (fake-snapshot). The stored data would return to the snapshot taken before v2 at ");
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
  const json = (res: ServerResponse, status: number, value: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(value));
  const cliAt = (url: string, ...args: string[]) =>
    runCommand(["node", join(EXAMPLE, "bin", "pneuma.mjs"), ...args], { env: { PNEUMA_HOST: url, PNEUMA_AGENT: "codex" }, timeoutMs: 20_000 });
  const published = { status: "published", version: "v2", address: "http://space.test/apps/slow/", changed_paths: ["src/server.ts"], risks: ["low"], approved_by: ["policy:auto"] };

  test("waits for as long as the Host takes to answer, and does not use fetch", async () => {
    let received: unknown;
    const server = createHttpServer(async (req, res) => {
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
      expect(received).toEqual({ method: "POST", url: "/apps/slow/changes", type: "application/json", body: { intent: "add a chart", agent: "codex" } });
    } finally {
      await stop(server);
    }
  }, 15_000);

  test("a Host that takes the request and then drops the connection may still release it", async () => {
    let received = "";
    const server = createHttpServer(async (req) => {
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
    const server = createTcpServer((socket) =>
      socket.once("data", () => socket.end('HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: 400\r\n\r\n{"status":"publ')),
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
    expect(result.output).toContain(`cannot reach the Host at ${url} (ECONNREFUSED). Start it with: docker compose up -d`);
    expect(result.output).not.toContain("may still be released");
  });

  test("a refusal from the Host is reported through its error field", async () => {
    const server = createHttpServer(async (req, res) => {
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
