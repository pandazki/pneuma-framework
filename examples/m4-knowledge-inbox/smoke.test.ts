import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootAppRuntime, handleHttp, type AppRuntime } from "@pneuma-framework/runtime";
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

async function postOperation(
  runtime: AppRuntime,
  opId: string,
  input: Record<string, unknown>
) {
  return handleHttp(runtime, {
    method: "POST",
    pathname: `/api/operations/${opId}`,
    searchParams: new URLSearchParams(),
    headers: new Headers(),
    readBody: async () => ({ input }),
  });
}

async function getOperation(runtime: AppRuntime, opId: string) {
  return handleHttp(runtime, {
    method: "GET",
    pathname: `/api/operations/${opId}`,
    searchParams: new URLSearchParams(),
    headers: new Headers(),
    readBody: async () => undefined,
  });
}

describe("M4 Knowledge Inbox local smoke", () => {
  test("captures and lists an inbox item across runtime reopen", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m4-knowledge-inbox-"));
    let runtime: AppRuntime | undefined;
    try {
      runtime = await bootAppRuntime(configFor(workspace));

      const captured = await postOperation(runtime, "capture_item", {
        url: "https://example.com/m4-knowledge-inbox",
        title: "M4 Knowledge Inbox",
        source: "example",
        summary: "First reference app item",
      });
      expect(captured.status).toBe(200);
      const output = (captured.body as { output: { id: string; status: string; url: string } })
        .output;
      expect(output.status).toBe("pending");
      expect(output.url).toBe("https://example.com/m4-knowledge-inbox");

      const firstList = await getOperation(runtime, "list_inbox_items");
      expect(firstList.status).toBe(200);
      const firstRows = (firstList.body as { rows: Array<Record<string, unknown>> }).rows;
      expect(firstRows).toContainEqual(
        expect.objectContaining({
          id: output.id,
          status: "pending",
          title: "M4 Knowledge Inbox",
        })
      );

      await runtime.close();
      runtime = undefined;

      runtime = await bootAppRuntime(configFor(workspace));
      const reopenedList = await getOperation(runtime, "list_inbox_items");
      expect(reopenedList.status).toBe(200);
      const reopenedRows = (reopenedList.body as { rows: Array<Record<string, unknown>> }).rows;
      expect(reopenedRows).toContainEqual(
        expect.objectContaining({
          id: output.id,
          status: "pending",
          title: "M4 Knowledge Inbox",
        })
      );
    } finally {
      await runtime?.close();
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
