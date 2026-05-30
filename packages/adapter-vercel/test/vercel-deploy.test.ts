import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { deployToVercel } from "../src/vercel-deploy.js";

const temps: string[] = [];
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

describe("deployToVercel (content-addressed two-phase upload)", () => {
  test("uploads missing blobs, re-posts, and polls to READY", async () => {
    const root = mkdtempSync(join(tmpdir(), "vercel-"));
    temps.push(root);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/app.ts"), "export const x = 1;\n");
    const sha = createHash("sha1").update("export const x = 1;\n").digest("hex");

    const calls: string[] = [];
    let deployPosts = 0;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      calls.push(`${method} ${u.replace("https://api.vercel.com", "")}`);
      if (u.includes("/v13/deployments") && method === "POST") {
        deployPosts += 1;
        if (deployPosts === 1) {
          return new Response(JSON.stringify({ error: { code: "missing_files", missing: [sha] } }), {
            status: 400,
          });
        }
        return new Response(JSON.stringify({ id: "dpl_test", url: "clean-room.vercel.app", readyState: "QUEUED" }), {
          status: 200,
        });
      }
      if (u.includes("/v2/files") && method === "POST") {
        expect(init?.headers).toMatchObject({ "x-now-digest": sha });
        return new Response("", { status: 200 });
      }
      if (u.includes("/v13/deployments/dpl_test")) {
        return new Response(JSON.stringify({ readyState: "READY" }), { status: 200 });
      }
      throw new Error(`unexpected call ${method} ${u}`);
    }) as unknown as typeof fetch;

    const receipt = await deployToVercel({
      root,
      token: "tok",
      project: "clean-room",
      env: { DATABASE_URL: "postgres://x" },
      fetchImpl,
      pollIntervalMs: 1,
    });

    expect(receipt).toMatchObject({ target: "vercel", deploymentId: "dpl_test", readyState: "READY", files: 1 });
    expect(receipt.url).toBe("https://clean-room.vercel.app");
    // two-phase: create -> upload blob -> re-create -> poll
    expect(calls).toEqual([
      "POST /v13/deployments",
      "POST /v2/files",
      "POST /v13/deployments",
      "GET /v13/deployments/dpl_test",
    ]);
  });
});
