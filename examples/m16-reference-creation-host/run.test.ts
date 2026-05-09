import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startM16ReferenceCreationHostServer } from "./host-server.js";

describe("M16 Reference Creation Host", () => {
  test("integrates profile creation, preview, governed evolution, publish, restart, rollback, and second-app inspection", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m16-host-"));
    const server = await startM16ReferenceCreationHostServer({ workspace, port: 0 });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    try {
      const index = await fetchText(`${baseUrl}/`);
      expect(index).toContain("M16 Reference Creation Host");
      expect(index).toContain('data-testid="create-inbox"');
      expect(index).toContain('data-testid="approve-evolution"');
      expect(index).toContain('data-testid="publish-v1"');
      expect(index).toContain('data-testid="rollback"');
      expect(index).toContain('data-testid="assurance-card"');

      const profiles = await fetchJson<{ profiles: Array<{ id: string }> }>(`${baseUrl}/api/host/profiles`);
      expect(profiles.profiles.map((profile) => profile.id)).toEqual([
        "knowledge-inbox-bun-sqlite",
        "team-decision-log-bun-sqlite",
      ]);

      const inbox = await createProject(baseUrl, {
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
      });
      expect(inbox.project.current_version_id).toBe("v0");

      await fetchJson(`${baseUrl}/api/host/projects/team-knowledge-inbox/preview/start`, { method: "POST" });
      const before = await fetchJson<{
        inspection: {
          schema: { tables: Array<{ id: string }> };
          operations: Array<{ id: string }>;
          data: Record<string, unknown[]>;
        };
      }>(`${baseUrl}/api/host/projects/team-knowledge-inbox/inspect`);
      expect(before.inspection.schema.tables.map((table) => table.id)).toContain("inbox_items");
      expect(before.inspection.operations.map((operation) => operation.id)).toContain("capture_item");
      expect(before.inspection.data.inbox_items).toHaveLength(3);

      const publishedV0 = await publish(baseUrl, "team-knowledge-inbox", "v0");
      expect(publishedV0.summary.active_candidate_id).toBe("team-knowledge-inbox-v0");

      const evolution = await fetchJson<{
        evolution: { status: string; version_id: string };
        assurance: {
          readiness: string;
          risk_classification: string[];
          blocking_reasons: string[];
          evidence_refs: Array<{ kind: string }>;
        };
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
      expect(evolution.evolution).toMatchObject({
        status: "awaiting_approval",
        version_id: "v1",
      });
      expect(evolution.assurance).toMatchObject({
        readiness: "awaiting_approval",
        risk_classification: ["definition_additive"],
        blocking_reasons: [],
      });
      expect(evolution.assurance.evidence_refs.map((ref) => ref.kind)).toContain("host_check");

      const approved = await fetchJson<{
        evolution: { status: string };
        assurance: {
          readiness: string;
          risk_classification: string[];
          blocking_reasons: string[];
          evidence_refs: Array<{ kind: string }>;
        };
        priority_rows: unknown[];
      }>(`${baseUrl}/api/host/projects/team-knowledge-inbox/evolution/approve`, { method: "POST" });
      expect(approved.evolution.status).toBe("completed");
      expect(approved.priority_rows).toHaveLength(3);
      expect(approved.assurance).toMatchObject({
        readiness: "verified",
        risk_classification: ["definition_additive"],
        blocking_reasons: [],
      });
      expect(approved.assurance.evidence_refs.map((ref) => ref.kind)).toContain("definition_history");

      const publishedV1 = await publish(baseUrl, "team-knowledge-inbox", "v1");
      expect(publishedV1.summary.active_candidate_id).toBe("team-knowledge-inbox-v1");
      expect(publishedV1.summary.previous_candidate_id).toBe("team-knowledge-inbox-v0");
      expect(publishedV1.assurance).toMatchObject({
        readiness: "ready_to_publish",
        risk_classification: ["release_change"],
        blocking_reasons: [],
      });
      expect(publishedV1.assurance.evidence_refs.map((ref) => ref.kind)).toEqual(
        expect.arrayContaining(["runtime_health", "release_rollout"]),
      );

      const restarted = await fetchJson<{ health: { ok: boolean }; summary: { active_candidate_id: string } }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/restart-active`,
        { method: "POST" },
      );
      expect(restarted.summary.active_candidate_id).toBe("team-knowledge-inbox-v1");
      expect(restarted.health.ok).toBe(true);

      const rolledBack = await fetchJson<{
        health: { url: string };
        summary: { active_candidate_id: string; previous_candidate_id?: string; active_url?: string };
      }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/rollback`,
        { method: "POST" },
      );
      expect(rolledBack.summary.active_candidate_id).toBe("team-knowledge-inbox-v0");
      expect(rolledBack.summary.previous_candidate_id).toBe("team-knowledge-inbox-v1");
      expect(rolledBack.summary.active_url).toBe(rolledBack.health.url);

      await createProject(baseUrl, {
        app_id: "team-decision-log",
        display_name: "Team Decision Log",
        profile_id: "team-decision-log-bun-sqlite",
      });
      await fetchJson(`${baseUrl}/api/host/projects/team-decision-log/preview/start`, { method: "POST" });
      const decisionLog = await fetchJson<{
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
      expect(decisionLog.inspection.schema.tables.map((table) => table.id)).toContain("decisions");
      expect(decisionLog.inspection.operations.map((operation) => operation.id)).toContain("record_decision");
      expect(decisionLog.inspection.schema.views.map((view) => view.id)).toContain("decision_log");
      expect(decisionLog.inspection.schema.policy_rules.map((rule) => rule.id)).toContain("builder-can-read-decisions");
      expect(decisionLog.inspection.data.decisions).toHaveLength(3);
    } finally {
      await server.stop();
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});

async function createProject(
  baseUrl: string,
  body: { app_id: string; display_name: string; profile_id: string },
): Promise<{ project: { current_version_id: string } }> {
  return await fetchJson(`${baseUrl}/api/host/projects`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function publish(
  baseUrl: string,
  appId: string,
  versionId: string,
): Promise<{
  summary: { active_candidate_id: string; previous_candidate_id?: string };
  assurance?: {
    readiness: string;
    risk_classification: string[];
    blocking_reasons: string[];
    evidence_refs: Array<{ kind: string }>;
  };
}> {
  return await fetchJson(`${baseUrl}/api/host/projects/${appId}/publish`, {
    method: "POST",
    body: JSON.stringify({ version_id: versionId }),
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

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}: ${await response.text()}`);
  }
  return response.text();
}
