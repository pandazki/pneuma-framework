import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startM14HostPublishRolloutServer } from "./host-server.js";

describe("M14 host publish rollout server", () => {
  test("creates demo versions, publishes v0/v1, restarts active, and rolls back", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m14-server-"));
    const server = await startM14HostPublishRolloutServer({ workspace, port: 0 });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    try {
      const created = await fetchJson<{ versions: Array<{ version_id: string }> }>(
        `${baseUrl}/api/host/demo/create`,
        { method: "POST" },
      );
      expect(created.versions.map((version) => version.version_id)).toEqual(["v0", "v1"]);

      const v0 = await fetchJson<{ summary: { active_candidate_id: string; previous_candidate_id?: string } }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/publish`,
        { method: "POST", body: JSON.stringify({ version_id: "v0" }) },
      );
      expect(v0.summary.active_candidate_id).toBe("team-knowledge-inbox-v0");
      expect(v0.summary.previous_candidate_id).toBeUndefined();

      const v1 = await fetchJson<{ summary: { active_candidate_id: string; previous_candidate_id?: string } }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/publish`,
        { method: "POST", body: JSON.stringify({ version_id: "v1" }) },
      );
      expect(v1.summary.active_candidate_id).toBe("team-knowledge-inbox-v1");
      expect(v1.summary.previous_candidate_id).toBe("team-knowledge-inbox-v0");

      const restarted = await fetchJson<{ health: { ok: boolean }; summary: { active_candidate_id: string } }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/restart-active`,
        { method: "POST" },
      );
      expect(restarted.summary.active_candidate_id).toBe("team-knowledge-inbox-v1");
      expect(restarted.health.ok).toBe(true);

      const rolledBack = await fetchJson<{ summary: { active_candidate_id: string; previous_candidate_id?: string } }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/rollback`,
        { method: "POST" },
      );
      expect(rolledBack.summary.active_candidate_id).toBe("team-knowledge-inbox-v0");
      expect(rolledBack.summary.previous_candidate_id).toBe("team-knowledge-inbox-v1");
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
