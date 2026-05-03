import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startM15GeneralityHostServer } from "./host-server.js";

describe("M15 generality host server", () => {
  test("creates, previews, and inspects two different generated app profiles", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m15-server-"));
    const server = await startM15GeneralityHostServer({ workspace, port: 0 });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    try {
      const index = await fetchText(`${baseUrl}/`);
      expect(index).toContain("M15 Generality Pressure Host");
      expect(index).toContain('data-testid="create-both"');

      const created = await fetchJson<{ projects: Array<{ app_id: string }> }>(
        `${baseUrl}/api/host/demo/create`,
        { method: "POST" },
      );
      expect(created.projects.map((project) => project.app_id)).toEqual([
        "team-knowledge-inbox",
        "team-decision-log",
      ]);

      for (const appId of ["team-knowledge-inbox", "team-decision-log"]) {
        await fetchJson(`${baseUrl}/api/host/projects/${appId}/preview/start`, { method: "POST" });
      }

      const inbox = await fetchJson<{
        inspection: {
          schema: { tables: Array<{ id: string }> };
          operations: Array<{ id: string }>;
          data: Record<string, unknown[]>;
        };
      }>(`${baseUrl}/api/host/projects/team-knowledge-inbox/inspect`);
      const decisions = await fetchJson<{
        inspection: {
          schema: {
            tables: Array<{ id: string }>;
            views: Array<{ id: string }>;
            policy_rules: Array<{ id: string }>;
          };
          operations: Array<{ id: string }>;
          data: Record<string, unknown[]>;
        };
      }>(`${baseUrl}/api/host/projects/team-decision-log/inspect`);

      expect(inbox.inspection.schema.tables.map((table) => table.id)).toContain("inbox_items");
      expect(inbox.inspection.operations.map((operation) => operation.id)).toContain("capture_item");
      expect(decisions.inspection.schema.tables.map((table) => table.id)).toContain("decisions");
      expect(decisions.inspection.operations.map((operation) => operation.id)).toContain("record_decision");
      expect(decisions.inspection.schema.views.map((view) => view.id)).toContain("decision_log");
      expect(decisions.inspection.schema.policy_rules.map((rule) => rule.id)).toContain("builder-can-read-decisions");
      expect(decisions.inspection.data.decisions).toHaveLength(3);
    } finally {
      await server.stop();
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});

async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
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
  return await response.json() as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}: ${await response.text()}`);
  }
  return response.text();
}
