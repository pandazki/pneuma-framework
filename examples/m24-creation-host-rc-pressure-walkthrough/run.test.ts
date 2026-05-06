import { describe, expect, test } from "bun:test";
import { buildCreationHostRcWalkthrough } from "./pressure-story.js";
import { parseArgs, startM24RcPressureWalkthroughServer } from "./run.js";

describe("M24 RC Pressure Walkthrough", () => {
  test("parses smoke runner arguments", () => {
    expect(parseArgs(["--port", "0", "--smoke-exit"])).toEqual({
      port: 0,
      smokeExit: true,
    });
  });

  test("builds a walkthrough from the executable pressure story", () => {
    const walkthrough = buildCreationHostRcWalkthrough();

    expect(walkthrough.report.ok).toBe(true);
    expect(walkthrough.steps.map((step) => step.id)).toEqual([
      "alice-prepares-host",
      "bob-shares-artifact",
      "charlie-installs",
      "dave-forks",
    ]);
    expect(walkthrough.failure_cases).toHaveLength(4);
    expect(walkthrough.failure_cases.flatMap((entry) => entry.issues)).toContain(
      "dave_fork.provider_specific_migration_forbidden",
    );
  });

  test("serves the static walkthrough and story API", async () => {
    const server = await startM24RcPressureWalkthroughServer({ port: 0 });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    try {
      const index = await fetchText(`${baseUrl}/`);
      expect(index).toContain("M24 RC Pressure Walkthrough");
      expect(index).toContain('data-testid="story-rail"');
      expect(index).toContain('data-testid="inspector-tabs"');
      expect(index).toContain('href="/?lang=zh-CN"');

      const app = await fetchText(`${baseUrl}/static/app.js`);
      expect(app).toContain("renderStory");

      const story = await fetchJson<{
        report: { ok: boolean };
        steps: Array<{ id: string; result: string }>;
        failure_cases: Array<{ id: string; issues: string[] }>;
      }>(`${baseUrl}/api/story`);
      expect(story.report.ok).toBe(true);
      expect(story.steps).toHaveLength(4);
      expect(story.steps[3]).toMatchObject({ id: "dave-forks", result: "passed" });
      expect(story.failure_cases.map((entry) => entry.id)).toContain("wrong-fork-scope");

      const chineseStory = await fetchJson<{
        title: string;
        steps: Array<{ title: string; evidence: string[] }>;
        failure_cases: Array<{ title: string; evidence: string[] }>;
      }>(`${baseUrl}/api/story?lang=zh-CN`);
      expect(chineseStory.title).toBe("M24 RC Pressure 中文演示");
      expect(chineseStory.steps[1].title).toBe("分享 portable app artifact，而不是分享源数据库");
      expect(chineseStory.steps[3].evidence).toContain(
        "relational-store、GitHub、Linear 的跨 profile 语义由 parity hooks 覆盖",
      );
      expect(chineseStory.failure_cases[0].title).toBe("Charlie 提供的是旧 artifact version 的 credential evidence");
    } finally {
      await server.stop();
    }
  });
});

async function fetchJson<T = unknown>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} failed with HTTP ${response.status}: ${await response.text()}`);
  return await response.json() as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} failed with HTTP ${response.status}: ${await response.text()}`);
  return response.text();
}
