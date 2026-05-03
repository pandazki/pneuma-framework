import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGeneralityHostStore } from "./host-store.js";
import {
  inspectM15PreviewRuntime,
  startM15PreviewRuntime,
  stopM15PreviewRuntime,
} from "./preview-runtime.js";
import type { M15PreviewRuntimeHandle } from "./types.js";

describe("M15 preview runtime", () => {
  test("inspection fails closed when the profile read operation fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/api/config")) {
        return Response.json({
          tables: [],
          operations: [],
          views: [],
          policy_rules: [],
        });
      }
      if (url.endsWith("/api/operations/list_decisions")) {
        return new Response("read failed", { status: 500 });
      }
      return new Response("unexpected request", { status: 404 });
    };

    try {
      await expect(
        inspectM15PreviewRuntime({
          profile_id: "team-decision-log-bun-sqlite",
          preview_url: "http://preview.local",
          logs: [],
        } as unknown as M15PreviewRuntimeHandle),
      ).rejects.toThrow("GET /api/operations/list_decisions failed with HTTP 500");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("starts and inspects Knowledge Inbox and Team Decision Log through one runtime path", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m15-preview-"));
    const store = createGeneralityHostStore({ workspace });
    const inbox = store.createProject({
      app_id: "team-knowledge-inbox",
      display_name: "Team Knowledge Inbox",
      profile_id: "knowledge-inbox-bun-sqlite",
    });
    const decisions = store.createProject({
      app_id: "team-decision-log",
      display_name: "Team Decision Log",
      profile_id: "team-decision-log-bun-sqlite",
    });
    const runtimes = [
      await startM15PreviewRuntime({ project: inbox.project, version: inbox.version, port: 0 }),
      await startM15PreviewRuntime({ project: decisions.project, version: decisions.version, port: 0 }),
    ];
    try {
      const inboxInspection = await inspectM15PreviewRuntime(runtimes[0]);
      const decisionInspection = await inspectM15PreviewRuntime(runtimes[1]);
      expect(inboxInspection.schema.tables.map((table) => table.id)).toContain("inbox_items");
      expect(inboxInspection.operations.map((operation) => operation.id)).toContain("capture_item");
      expect(decisionInspection.schema.tables.map((table) => table.id)).toContain("decisions");
      expect(decisionInspection.operations.map((operation) => operation.id)).toContain("record_decision");
      expect(decisionInspection.schema.views.map((view) => view.id)).toContain("decision_log");
      expect(decisionInspection.schema.policy_rules.map((rule) => rule.id)).toContain("builder-can-read-decisions");
      expect(decisionInspection.data.decisions).toHaveLength(3);
    } finally {
      await Promise.all(runtimes.map((runtime) => stopM15PreviewRuntime(runtime)));
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});
