import { describe, expect, test } from "bun:test";
import { M25_STAGE_IDS } from "./prototype-model.js";
import { parseArgs, startM25AliceCreationHostServer } from "./run.js";

describe("M25 Alice Creation Host prototype server", () => {
  test("parses smoke runner arguments", () => {
    expect(parseArgs(["--port", "0", "--smoke-exit"])).toEqual({
      port: 0,
      smokeExit: true,
    });
  });

  test("serves the Developer-first workbench and executes stages", async () => {
    const server = await startM25AliceCreationHostServer({ port: 0 });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    try {
      const index = await fetchText(`${baseUrl}/`);
      expect(index).toContain("M25 Alice Creation Host Prototype");
      expect(index).toContain('data-testid="developer-path"');
      expect(index).toContain('data-testid="evidence-ledger"');

      const first = await fetchJson<{
        rc_ready: boolean;
        stages: Array<{ id: string; status: string }>;
      }>(`${baseUrl}/api/prototype`);
      expect(first.rc_ready).toBe(false);
      expect(first.stages[0]).toMatchObject({ id: "name-the-product-layer", status: "pending" });

      const afterOne = await postJson<{
        completed_stage_ids: string[];
        stages: Array<{ id: string; status: string }>;
      }>(`${baseUrl}/api/prototype/stages/name-the-product-layer/run`, {});
      expect(afterOne.completed_stage_ids).toEqual(["name-the-product-layer"]);
      expect(afterOne.stages[0]).toMatchObject({ status: "completed" });

      const completed = await postJson<{
        rc_ready: boolean;
        completed_stage_ids: string[];
      }>(`${baseUrl}/api/prototype/run-all`, {});
      expect(completed.rc_ready).toBe(true);
      expect(completed.completed_stage_ids).toEqual([...M25_STAGE_IDS]);

      const reset = await postJson<{
        rc_ready: boolean;
        completed_stage_ids: string[];
      }>(`${baseUrl}/api/prototype/reset`, {});
      expect(reset.rc_ready).toBe(false);
      expect(reset.completed_stage_ids).toEqual([]);
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

async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`POST ${url} failed with HTTP ${response.status}: ${await response.text()}`);
  return await response.json() as T;
}
