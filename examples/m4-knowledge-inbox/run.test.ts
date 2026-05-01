import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asBunFetch, bootAppRuntime, type AppRuntime } from "@pneuma-framework/runtime";
import type { AppConfig } from "@pneuma-framework/runtime";
import { config as baseConfig } from "../../templates/knowledge-inbox-core-domain/server/config.js";

function configFor(workspace: string): AppConfig {
  const dataDir = join(workspace, "data");
  mkdirSync(dataDir, { recursive: true });
  return {
    ...baseConfig,
    persistence: { kind: "sqlite", path: join(dataDir, "app.db") },
    audit: { ndjson_path: join(dataDir, "audit.ndjson") },
  };
}

describe("M4 Knowledge Inbox demo runner", () => {
  test("seeds deterministic demo rows idempotently through the public HTTP API", async () => {
    const { DEMO_ITEMS, seedKnowledgeInboxDemo } = await import("./seed-demo.js");
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m4-seed-"));
    let runtime: AppRuntime | undefined;
    let server: ReturnType<typeof Bun.serve> | undefined;

    try {
      runtime = await bootAppRuntime(configFor(workspace));
      server = Bun.serve({
        port: 0,
        fetch: async (req): Promise<Response> => {
          const url = new URL(req.url);
          if (url.pathname === "/healthz") {
            return Response.json({ ok: true, app_id: baseConfig.app_id });
          }
          return asBunFetch(runtime!)(req);
        },
      });
      const baseUrl = `http://127.0.0.1:${server.port}`;

      const first = await seedKnowledgeInboxDemo({ baseUrl });
      expect(first.captured).toBe(DEMO_ITEMS.length);
      expect(first.updated).toBe(2);
      expect(first.existing).toBe(0);

      const second = await seedKnowledgeInboxDemo({ baseUrl });
      expect(second.captured).toBe(0);
      expect(second.updated).toBe(0);
      expect(second.existing).toBe(DEMO_ITEMS.length);

      const list = await fetch(`${baseUrl}/api/operations/list_inbox_items`);
      expect(list.status).toBe(200);
      const body = (await list.json()) as { rows: Array<Record<string, unknown>> };
      expect(body.rows).toHaveLength(DEMO_ITEMS.length);
      expect(body.rows.map((row) => row.status).sort()).toEqual(["archived", "kept", "pending"]);
      expect(body.rows.map((row) => row.url).sort()).toEqual(
        DEMO_ITEMS.map((item) => item.url).sort()
      );
    } finally {
      server?.stop(true);
      await runtime?.close();
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("starts the template, seeds it, verifies rows, and exits in smoke mode", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m4-runner-"));
    try {
      const proc = Bun.spawn({
        cmd: [
          "bun",
          "run",
          join(import.meta.dir, "run.ts"),
          "--seed",
          "--smoke-exit",
          "--workspace",
          workspace,
          "--port",
          "0",
        ],
        stdout: "pipe",
        stderr: "pipe",
      });

      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("Knowledge Inbox ready:");
      expect(stdout).toContain("seeded: captured=3 updated=2 existing=0");
      expect(stdout).toContain("smoke verification: 3 rows");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
