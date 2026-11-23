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

const cli = (cwd: string, ...args: string[]) =>
  runCommand(["node", join(EXAMPLE, "bin", "pneuma.mjs"), ...args], { cwd, env: { PNEUMA_HOST: hostUrl, PNEUMA_AGENT: "codex" }, timeoutMs: 20_000 });

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), "space-all-in-one-cli-"));
  const host = new AppHost({
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
