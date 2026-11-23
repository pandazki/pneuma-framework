import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppHost } from "../src/host";
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
