import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startReferenceCreationHostServer } from "./host-server.js";

describe("M12 Reference Creation Host server", () => {
  test("creates a Generated Application, starts preview, inspects it, and stops preview", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m12-host-"));
    const server = await startReferenceCreationHostServer({ workspace, port: 0 });
    const baseUrl = `http://127.0.0.1:${server.port}`;

    try {
      const profiles = await fetchJson<{ profiles: Array<{ id: string }> }>(`${baseUrl}/api/host/profiles`);
      expect(profiles.profiles.map((profile) => profile.id)).toEqual(["knowledge-inbox-bun-sqlite"]);

      const created = await fetchJson<{ project: { app_id: string; current_version_id: string } }>(
        `${baseUrl}/api/host/projects`,
        {
          method: "POST",
          body: JSON.stringify({
            app_id: "team-knowledge-inbox",
            display_name: "Team Knowledge Inbox",
            profile_id: "knowledge-inbox-bun-sqlite",
            builder_user_id: "builder-alice",
            builder_request: "Create a shared inbox for team knowledge.",
          }),
        },
      );
      expect(created.project).toEqual({
        app_id: "team-knowledge-inbox",
        current_version_id: "v0",
      });

      const preview = await fetchJson<{ preview: { preview_url: string } }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/preview/start`,
        { method: "POST", body: JSON.stringify({ version_id: "v0" }) },
      );
      expect(preview.preview.preview_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

      const inspect = await fetchJson<{
        project: { app_id: string };
        preview: { preview_url: string };
        inspection: {
          schema: { tables: Array<{ id: string }> };
          operations: Array<{ id: string }>;
          data: { inbox_items: unknown[] };
          logs: string[];
        };
      }>(`${baseUrl}/api/host/projects/team-knowledge-inbox/inspect`);

      expect(inspect.project.app_id).toBe("team-knowledge-inbox");
      expect(inspect.preview.preview_url).toBe(preview.preview.preview_url);
      expect(inspect.inspection.schema.tables.map((table) => table.id)).toContain("inbox_items");
      expect(inspect.inspection.operations.map((operation) => operation.id)).toContain("capture_item");
      expect(inspect.inspection.data.inbox_items).toHaveLength(3);
      expect(inspect.inspection.logs.join("\n")).toContain("##pneuma:service-ready api");
      expect(inspect.inspection.logs.join("\n")).toContain("seeded demo data:");

      const stopped = await fetchJson<{ stopped: boolean }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/preview/stop`,
        { method: "POST" },
      );
      expect(stopped.stopped).toBe(true);
    } finally {
      await server.stop();
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 45_000);

  test("smoke CLI creates and inspects one generated app", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m12-cli-"));
    try {
      const proc = Bun.spawn({
        cmd: [
          "bun",
          "run",
          join(import.meta.dir, "run.ts"),
          "--workspace",
          workspace,
          "--port",
          "0",
          "--smoke-exit",
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
      expect(stdout).toContain("M12 Reference Creation Host ready:");
      expect(stdout).toContain("created generated app: team-knowledge-inbox@v0");
      expect(stdout).toContain("preview config: inbox_items table, capture_item operation");
      expect(stdout).toContain("smoke verification: passed");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 60_000);
});

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${url} failed with HTTP ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}
