import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Space } from "../src/space";

// The real client, against a stand-in admin API and a stand-in appctl: what goes over the wire for the
// two PneumaSpace primitives the Host now uses (ephemeral apps, managed apps). The in-memory FakeSpace
// enforces the rules; this checks that the client sends what those rules read.

let dir: string;
let admin: Server;
let adminUrl: string;
const seen: { method: string; url: string; manager: string | undefined }[] = [];
const answers = new Map<string, number>();

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "pneuma-space-client-"));
  // Prints the arguments it was given, as appctl would print its result.
  // An ephemeral publish ends its line with the app's end and id, as appctl at the pinned commit does.
  writeFileSync(
    join(dir, "appctl.mjs"),
    'const args = process.argv.slice(2);\nconsole.log(JSON.stringify(args));\nif (args.includes("--ephemeral")) console.log(`${args[1]}  http://127.0.0.1:8080/apps/${args[1]}/  release 1  expires 2026-11-24T10:00:00.000Z  app 0a1b2c3d4e5f`);\n',
  );
  admin = createServer((req: IncomingMessage, res) => {
    seen.push({ method: req.method ?? "", url: req.url ?? "", manager: req.headers["x-pneuma-space-manager"] as string | undefined });
    if (req.method === "GET" && req.url === "/api/apps") {
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify([
          { name: "todo", status: "registered", expiresAt: null, manager: { name: "pneuma-host", url: "http://127.0.0.1:8090/" } },
          { name: "todo-pvab12", status: "purging", expiresAt: 1_800_000_000_000, manager: { name: "pneuma-host", url: null } },
          // A PneumaSpace from before ADRs 0038 and 0039 sends neither field.
          { name: "old", status: "registered" },
        ]),
      );
      return;
    }
    res.writeHead(answers.get(`${req.method} ${req.url}`) ?? 200, { "content-type": "application/json" }).end("{}");
  });
  await new Promise<void>((resolve) => admin.listen(0, "127.0.0.1", resolve));
  adminUrl = `http://127.0.0.1:${(admin.address() as AddressInfo).port}`;
});
afterAll(() => {
  admin.close();
  rmSync(dir, { recursive: true, force: true });
});

const space = () => new Space({ cli: join(dir, "appctl.mjs"), adminUrl, ingressUrl: adminUrl, publicUrl: "http://127.0.0.1:8080", owner: "user:me" });

describe("the PneumaSpace client", () => {
  test("a preview is published with --ephemeral and its ttl, and a release names its manager, with the url only when there is one", async () => {
    const preview = await space().publish("todo-pvab12", "/apps/todo/.pneuma/drafts/c1", { ephemeral: { ttlSeconds: 600 }, manager: { name: "pneuma-host", url: "http://127.0.0.1:8090/" } });
    expect(JSON.parse(preview.output.split("\n")[0]!)).toEqual([
      "publish", "todo-pvab12", "/apps/todo/.pneuma/drafts/c1", "--owner", "user:me", "--ephemeral", "--ttl", "600", "--manager", "pneuma-host", "--manager-url", "http://127.0.0.1:8090/",
    ]);
    // The id the publish printed: a discard of the preview carries it.
    expect(preview.app).toBe("0a1b2c3d4e5f");
    const release = await space().publish("todo", "/tmp/release", { manager: { name: "pneuma-host" } });
    expect(JSON.parse(release.output)).toEqual(["publish", "todo", "/tmp/release", "--owner", "user:me", "--manager", "pneuma-host"]);
    expect(release.app).toBeUndefined();
    expect(JSON.parse((await space().publish("todo", "/tmp/release")).output)).toEqual(["publish", "todo", "/tmp/release", "--owner", "user:me"]);
  });

  test("discard is one call that names the manager and carries the app id; a name that is gone counts as discarded, a refusal does not", async () => {
    seen.length = 0;
    expect(await space().discard("todo-pvab12", "pneuma-host", "0a1b2c3d4e5f")).toBe(true);
    answers.set("POST /api/apps/gone/discard", 404);
    expect(await space().discard("gone", "pneuma-host")).toBe(true);
    answers.set("POST /api/apps/todo/discard", 409);
    expect(await space().discard("todo", "pneuma-host")).toBe(false);
    expect(seen).toEqual([
      { method: "POST", url: "/api/apps/todo-pvab12/discard?app=0a1b2c3d4e5f", manager: "pneuma-host" },
      { method: "POST", url: "/api/apps/gone/discard", manager: "pneuma-host" },
      { method: "POST", url: "/api/apps/todo/discard", manager: "pneuma-host" },
    ]);
  });

  test("a durable app is taken down with remove, then purge, both naming the manager", async () => {
    seen.length = 0;
    expect(await space().takeDown("notes", "pneuma-host")).toBe(true);
    expect(seen).toEqual([
      { method: "POST", url: "/api/apps/notes/remove", manager: "pneuma-host" },
      { method: "POST", url: "/api/apps/notes/purge", manager: "pneuma-host" },
    ]);
    answers.set("POST /api/apps/kept/remove", 409);
    expect(await space().takeDown("kept", "pneuma-host")).toBe(false);
  });

  test("an app reads with its status, its end and its manager, and a PneumaSpace that sends neither of the last two reads as durable and unmanaged", async () => {
    expect(await space().app("todo-pvab12")).toEqual({ name: "todo-pvab12", status: "purging", expiresAt: 1_800_000_000_000, manager: { name: "pneuma-host", url: null } });
    expect(await space().app("todo")).toEqual({ name: "todo", status: "registered", expiresAt: null, manager: { name: "pneuma-host", url: "http://127.0.0.1:8090/" } });
    expect(await space().app("old")).toEqual({ name: "old", status: "registered", expiresAt: null, manager: null });
    expect(await space().app("nothing")).toBeNull();
  });
});
