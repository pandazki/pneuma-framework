import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppHost } from "../src/host";
import { loadRiskPolicy } from "../src/policy";
import { createHostServer } from "../src/server";
import { FakeSpace } from "./fake-space";

// The Host has no authentication, and people open its owner page in a browser. These tests hold the
// line that a page in that browser cannot make the Host do anything.
const EXAMPLE = join(import.meta.dir, "..");
let work: string;
let server: ReturnType<typeof createHostServer>;
let port: number;

/** A raw request, so the test controls every header, the way a browser or a rebound name would. */
function send(method: string, path: string, headers: Record<string, string>, body?: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method, path, headers, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk as Buffer));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(body);
  });
}
const json = { "content-type": "application/json" };

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), "space-all-in-one-server-"));
  const host = new AppHost({
    appsDir: join(work, "apps"),
    space: new FakeSpace(),
    overlayDir: join(EXAMPLE, "overlay"),
    cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
    owner: "user:me",
    policy: loadRiskPolicy(join(EXAMPLE, "policy", "personal.json")),
    runVerify: async () => ({ ok: true, output: "tests passed" }),
  });
  server = createHostServer(host);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => {
  server.close();
  rmSync(work, { recursive: true, force: true });
});

describe("what a web page could send", () => {
  test("a write with a browser's Origin is refused, and nothing is created", async () => {
    const res = await send("POST", "/apps", { ...json, origin: "https://example.test" }, JSON.stringify({ name: "fromapage" }));
    expect(res.status).toBe(403);
    expect(JSON.parse(res.text)).toMatchObject({ reason: "browser_write_refused" });
    expect(existsSync(join(work, "apps", "fromapage"))).toBe(false);
  });

  test("a write with Sec-Fetch-Site is refused even when it says same-origin", async () => {
    const res = await send("POST", "/apps", { ...json, "sec-fetch-site": "same-origin" }, JSON.stringify({ name: "fromapage" }));
    expect(res.status).toBe(403);
    expect(existsSync(join(work, "apps", "fromapage"))).toBe(false);
  });

  test("a write a form or a no-cors fetch can send (text/plain, or no type at all) is refused", async () => {
    for (const headers of [{ "content-type": "text/plain" }, { "content-type": "application/x-www-form-urlencoded" }, {}] as Record<string, string>[]) {
      const res = await send("POST", "/apps", headers, JSON.stringify({ name: "fromaform" }));
      expect(res.status).toBe(415);
      expect(JSON.parse(res.text)).toMatchObject({ reason: "content_type_required" });
    }
    expect(existsSync(join(work, "apps", "fromaform"))).toBe(false);
  });

  test("an approval sent the way a page could send it is refused before the Host looks at it", async () => {
    const res = await send("POST", "/apps/todo/changes/some-id/approve", { "content-type": "text/plain" }, JSON.stringify({ subject: "user:me" }));
    expect(res.status).toBe(415);
  });

  test("a request that names this Host by another name is refused, for reads and for the page too", async () => {
    for (const path of ["/apps", "/"]) {
      const res = await send("GET", path, { host: `rebound.example.test:${port}` });
      expect(res.status).toBe(403);
      expect(res.text).toContain("rebound.example.test");
    }
  });

  test("the names a request may use: loopback, PNEUMA_HOST_URL's host name, and PNEUMA_HOST_BIND's address unless it is a wildcard", async () => {
    const at = async (options: { hostUrl?: string; bind?: string }, names: string[]) => {
      const named = new AppHost({
        appsDir: join(work, "named-apps"),
        space: new FakeSpace(),
        overlayDir: join(EXAMPLE, "overlay"),
        cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
        owner: "user:me",
        policy: loadRiskPolicy(join(EXAMPLE, "policy", "personal.json")),
        ...(options.hostUrl ? { hostUrl: options.hostUrl } : {}),
      });
      const listening = createHostServer(named, { bind: options.bind });
      await new Promise<void>((resolve) => listening.listen(0, "127.0.0.1", resolve));
      const listeningPort = (listening.address() as AddressInfo).port;
      try {
        const statuses: Record<string, number> = {};
        for (const name of names) {
          const res = await new Promise<{ status: number; text: string }>((resolve, reject) => {
            const req = request({ host: "127.0.0.1", port: listeningPort, path: "/apps", headers: { host: `${name}:${listeningPort}` }, agent: false }, (r) => {
              const chunks: Buffer[] = [];
              r.on("data", (chunk) => chunks.push(chunk as Buffer));
              r.on("end", () => resolve({ status: r.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
            });
            req.on("error", reject);
            req.end();
          });
          statuses[name] = res.status;
          if (res.status === 403) expect(JSON.parse(res.text).error).toContain("To reach it by another name, set PNEUMA_HOST_URL to the address with that name");
        }
        return statuses;
      } finally {
        listening.close();
      }
    };
    // A specific bind address, IPv4 or IPv6, is a name the Host is reached by.
    expect(await at({ bind: "192.168.1.20" }, ["192.168.1.20", "localhost", "192.168.1.21"])).toEqual({ "192.168.1.20": 200, localhost: 200, "192.168.1.21": 403 });
    expect(await at({ bind: "fd00::5" }, ["[fd00::5]", "[fd00::6]"])).toEqual({ "[fd00::5]": 200, "[fd00::6]": 403 });
    // A wildcard bind is not a name; a LAN address or host.docker.internal is accepted only once PNEUMA_HOST_URL names it.
    expect(await at({ bind: "0.0.0.0" }, ["0.0.0.0", "192.168.1.20", "host.docker.internal"])).toEqual({ "0.0.0.0": 403, "192.168.1.20": 403, "host.docker.internal": 403 });
    expect(await at({ bind: "0.0.0.0", hostUrl: "http://host.docker.internal:48363" }, ["host.docker.internal", "192.168.1.20"])).toEqual({ "host.docker.internal": 200, "192.168.1.20": 403 });
  });

  test("the CLI's own kind of request still works: JSON, no browser headers, the machine's own name", async () => {
    const created = await send("POST", "/apps", json, JSON.stringify({ name: "fromthecli" }));
    expect(created.status).toBe(200);
    for (const name of ["127.0.0.1", "localhost"]) {
      expect((await send("GET", "/apps", { host: `${name}:${port}` })).status).toBe(200);
    }
    expect((await send("GET", "/", {})).status).toBe(200);
    // A write with no body of its own, as `discard` is: the content type is still required, and enough.
    expect((await send("POST", "/apps/fromthecli/discard", json, "{}")).status).toBe(200);
    expect((await send("POST", "/apps/fromthecli/discard", {})).status).toBe(415);
  });
});
