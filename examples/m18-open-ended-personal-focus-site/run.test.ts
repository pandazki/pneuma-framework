import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startM18PersonalFocusHostServer } from "./host-server.js";
import { parseArgs } from "./run.js";

describe("M18 Personal Focus Site Creation Host", () => {
  test("parses smoke runner arguments", () => {
    const parsed = parseArgs(["--workspace", "/tmp/m18", "--port", "0", "--smoke-exit"]);
    expect(parsed).toEqual({
      workspace: "/tmp/m18",
      port: 0,
      smokeExit: true,
    });
  });

  test("creates, previews, inspects, evolves, publishes, restarts, and rolls back an open-ended site", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m18-focus-"));
    const server = await startM18PersonalFocusHostServer({ workspace, port: 0 });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    try {
      const index = await fetchText(`${baseUrl}/`);
      expect(index).toContain("M18 Personal Focus Site");
      expect(index).toContain('data-testid="create-focus-site"');
      expect(index).toContain('data-testid="approve-evolution"');
      expect(index).toContain('data-testid="publish-v1"');
      expect(index).toContain('data-testid="rollback"');

      const profiles = await fetchJson<{ profiles: Array<{ id: string }> }>(`${baseUrl}/api/host/profiles`);
      expect(profiles.profiles.map((profile) => profile.id)).toEqual(["personal-focus-site-bun-sqlite"]);

      const created = await fetchJson<{ project: { current_version_id: string } }>(`${baseUrl}/api/host/projects`, {
        method: "POST",
        body: JSON.stringify({
          app_id: "pandazki-focus-site",
          display_name: "Pandazki Focus Site",
          profile_id: "personal-focus-site-bun-sqlite",
        }),
      });
      expect(created.project.current_version_id).toBe("v0");

      const repeatedCreate = await fetchJson<{
        project: { current_version_id: string };
        existing: boolean;
      }>(`${baseUrl}/api/host/projects`, {
        method: "POST",
        body: JSON.stringify({
          app_id: "pandazki-focus-site",
          display_name: "Pandazki Focus Site",
          profile_id: "personal-focus-site-bun-sqlite",
        }),
      });
      expect(repeatedCreate.existing).toBe(true);
      expect(repeatedCreate.project.current_version_id).toBe("v0");

      const preview = await fetchJson<{ preview: { preview_url: string; version_id: string } }>(
        `${baseUrl}/api/host/projects/pandazki-focus-site/preview/start`,
        { method: "POST" },
      );
      expect(preview.preview.version_id).toBe("v0");

      const site = await fetchJson<{
        site_definition: { version: string; sections: Array<{ kind: string }> };
        github_attention: { ranked: Array<{ repo: string; title: string; score: number }> };
      }>(`${preview.preview.preview_url}/api/site`);
      expect(site.site_definition.version).toBe("v0");
      expect(site.site_definition.sections.map((section) => section.kind)).toContain("github_attention");
      expect(site.github_attention.ranked).toHaveLength(3);
      expect(site.github_attention.ranked[0].repo).toBe("pneuma-skills");

      const inspected = await fetchJson<{
        inspection: {
          ui_definition: { summary: { primary_shape: string; table_like_surfaces: string[] } };
          definition_governance_boundary: {
            artifact_kind: string;
            governance_scope: string;
            framework_definition_rows: boolean;
            framework_definition_apply_change_set: boolean;
          };
          github_attention: { profile: { login: string }; ranked: unknown[] };
        };
      }>(`${baseUrl}/api/host/projects/pandazki-focus-site/inspect`);
      expect(inspected.inspection.ui_definition.summary.primary_shape).toBe("open-ended-site");
      expect(inspected.inspection.ui_definition.summary.table_like_surfaces).toHaveLength(0);
      expect(inspected.inspection.definition_governance_boundary).toMatchObject({
        artifact_kind: "host_owned_open_ended_definition",
        governance_scope: "host_approval",
        framework_definition_rows: false,
        framework_definition_apply_change_set: false,
      });
      expect(inspected.inspection.github_attention.profile.login).toBe("pandazki");
      expect(inspected.inspection.github_attention.ranked).toHaveLength(3);

      const evolution = await fetchJson<{
        evolution: {
          status: string;
          version_id: string;
          proposal: { changes: string[] };
          transcript: Array<{
            kind: string;
            tool?: string;
            governance_scope?: string;
            artifact_kind?: string;
            framework_definition_rows?: boolean;
            framework_definition_apply_change_set?: boolean;
          }>;
        };
      }>(`${baseUrl}/api/host/projects/pandazki-focus-site/evolution/start`, {
        method: "POST",
        body: JSON.stringify({
          builder_user_id: "builder-alice",
          builder_request: "Make GitHub attention more useful and highlight the top 3 things I should handle.",
        }),
      });
      expect(evolution.evolution.status).toBe("awaiting_approval");
      expect(evolution.evolution.version_id).toBe("v1");
      expect(evolution.evolution.proposal.changes).toEqual([
        "rewrite hero and GitHub attention section copy",
        "switch visual tone to editorial focus",
        "rank GitHub attention by assignment, review request, mentions, priority labels, and recent activity",
      ]);
      expect(evolution.evolution.transcript.find((entry) => entry.kind === "agent_proposal")).toMatchObject({
        tool: "host.apply_open_ended_evolution",
        governance_scope: "host_approval",
        artifact_kind: "host_owned_open_ended_definition",
        framework_definition_rows: false,
        framework_definition_apply_change_set: false,
      });

      const approved = await fetchJson<{
        evolution: { status: string };
        site: { site_definition: { version: string; style_tokens: { tone: string } } };
      }>(`${baseUrl}/api/host/projects/pandazki-focus-site/evolution/approve`, { method: "POST" });
      expect(approved.evolution.status).toBe("completed");
      expect(approved.site.site_definition.version).toBe("v1");
      expect(approved.site.site_definition.style_tokens.tone).toBe("editorial");

      const publishedV0 = await publish(baseUrl, "pandazki-focus-site", "v0");
      expect(publishedV0.summary.active_candidate_id).toBe("pandazki-focus-site-v0");

      const publishedV1 = await publish(baseUrl, "pandazki-focus-site", "v1");
      expect(publishedV1.summary.active_candidate_id).toBe("pandazki-focus-site-v1");
      expect(publishedV1.summary.previous_candidate_id).toBe("pandazki-focus-site-v0");

      const restarted = await fetchJson<{ health: { ok: boolean }; summary: { active_candidate_id: string } }>(
        `${baseUrl}/api/host/projects/pandazki-focus-site/restart-active`,
        { method: "POST" },
      );
      expect(restarted.health.ok).toBe(true);
      expect(restarted.summary.active_candidate_id).toBe("pandazki-focus-site-v1");

      const rolledBack = await fetchJson<{
        health: { ok: boolean; url: string };
        state: {
          active?: { checks: Array<{ name: string; status: string }> };
        };
        summary: { active_candidate_id: string; previous_candidate_id?: string; active_url?: string };
      }>(`${baseUrl}/api/host/projects/pandazki-focus-site/rollback`, { method: "POST" });
      expect(rolledBack.health.ok).toBe(true);
      expect(rolledBack.summary.active_candidate_id).toBe("pandazki-focus-site-v0");
      expect(rolledBack.summary.previous_candidate_id).toBe("pandazki-focus-site-v1");
      expect(rolledBack.summary.active_url).toBe(rolledBack.health.url);
      expect(rolledBack.state.active?.checks).toMatchObject([
        { name: "health", status: "passed" },
        { name: "site_api", status: "passed" },
      ]);
    } finally {
      await server.stop();
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});

async function publish(
  baseUrl: string,
  appId: string,
  versionId: string,
): Promise<{ summary: { active_candidate_id: string; previous_candidate_id?: string; active_url?: string } }> {
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
  if (!response.ok) throw new Error(`GET ${url} failed with HTTP ${response.status}: ${await response.text()}`);
  return response.text();
}
