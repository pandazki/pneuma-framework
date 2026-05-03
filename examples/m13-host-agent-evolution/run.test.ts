import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startM13HostAgentEvolutionServer } from "./host-server.js";

describe("M13 host agent evolution server", () => {
  test("allow path evolves Generated Application through one Host approval", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m13-server-allow-"));
    const server = await startM13HostAgentEvolutionServer({
      workspace,
      port: 0,
      backend: "fake",
      autoDecision: "none",
    });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    try {
      await createAndStartPreview(baseUrl);
      const started = await fetchJson<{
        status: string;
        transcript: { events: Array<{ kind: string }> };
      }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/evolution/start`,
        {
          method: "POST",
          body: JSON.stringify({
            builder_user_id: "builder-alice",
            builder_request: "Add a Priority Queue for urgent inbox items.",
          }),
        },
      );
      expect(started.status).toBe("awaiting_approval");
      expect(started.transcript.events.filter((event) => event.kind === "approval_prompt")).toHaveLength(1);

      const approved = await fetchJson<{ status: string; transcript: { status: string } }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/evolution/approve`,
        { method: "POST" },
      );
      expect(approved.status).toBe("completed");
      expect(approved.transcript.status).toBe("completed");

      const queue = await fetchJson<{ rows: Array<{ priority: string }> }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/priority-queue`,
      );
      expect(queue.rows.map((row) => row.priority).sort()).toEqual(["P1", "P2", "P3"]);
    } finally {
      await server.stop();
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);

  test("deny path leaves Priority Queue absent", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m13-server-deny-"));
    const server = await startM13HostAgentEvolutionServer({
      workspace,
      port: 0,
      backend: "fake",
      autoDecision: "none",
    });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    try {
      await createAndStartPreview(baseUrl);
      await fetchJson(`${baseUrl}/api/host/projects/team-knowledge-inbox/evolution/start`, {
        method: "POST",
        body: JSON.stringify({
          builder_user_id: "builder-alice",
          builder_request: "Add a Priority Queue for urgent inbox items.",
        }),
      });
      const denied = await fetchJson<{ status: string; transcript: { status: string } }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/evolution/deny`,
        { method: "POST" },
      );
      expect(denied.status).toBe("denied");
      expect(denied.transcript.status).toBe("denied");

      const response = await fetch(`${baseUrl}/api/host/projects/team-knowledge-inbox/priority-queue`);
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("list_priority_queue failed");
    } finally {
      await server.stop();
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});

async function createAndStartPreview(baseUrl: string): Promise<void> {
  await fetchJson(`${baseUrl}/api/host/projects`, {
    method: "POST",
    body: JSON.stringify({
      app_id: "team-knowledge-inbox",
      display_name: "Team Knowledge Inbox",
      profile_id: "knowledge-inbox-bun-sqlite",
      builder_user_id: "builder-alice",
      builder_request: "Create a shared inbox for team knowledge.",
    }),
  });
  await fetchJson(`${baseUrl}/api/host/projects/team-knowledge-inbox/preview/start`, {
    method: "POST",
    body: JSON.stringify({ version_id: "v0" }),
  });
}

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
