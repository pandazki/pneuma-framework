import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostStore } from "./host-store.js";
import {
  inspectPreviewRuntime,
  startPreviewRuntime,
  stopPreviewRuntime,
} from "./preview-runtime.js";

describe("M12 preview runtime", () => {
  test("starts a generated app preview, reads config/data/logs, and stops cleanly", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m12-preview-"));
    try {
      const store = createHostStore({ workspace, now: () => 10_000 });
      const { version } = store.createProject({
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
      });

      const preview = await startPreviewRuntime({
        project: store.getProject("team-knowledge-inbox"),
        version,
        port: 0,
      });

      expect(preview.status).toBe("running");
      expect(preview.preview_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

      const configResponse = await fetch(`${preview.preview_url}/api/config`);
      expect(configResponse.status).toBe(200);
      const config = (await configResponse.json()) as {
        app_id: string;
        tables: Array<{ id: string }>;
        operations: Array<{ id: string }>;
      };
      expect(config.app_id).toBe("knowledge-inbox-core-domain");
      expect(config.tables.map((table) => table.id)).toContain("inbox_items");
      expect(config.operations.map((operation) => operation.id)).toContain("list_inbox_items");

      const inspected = await inspectPreviewRuntime(preview);
      expect(inspected.schema.tables.map((table) => table.id)).toContain("inbox_items");
      expect(inspected.operations.map((operation) => operation.id)).toContain("capture_item");
      expect(inspected.data.inbox_items).toHaveLength(3);
      expect(inspected.data.inbox_items.map((row) => row.status).sort()).toEqual([
        "archived",
        "kept",
        "pending",
      ]);
      expect(inspected.logs.join("\n")).toContain("##pneuma:service-ready api");

      await stopPreviewRuntime(preview);
      expect(preview.proc.exitCode).not.toBe(null);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 30_000);
});
