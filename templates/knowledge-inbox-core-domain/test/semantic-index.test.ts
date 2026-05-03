import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  Row,
  buildRootContext,
  type Operation,
} from "@pneuma-framework/core-domain";
import { bootAppRuntime, type AppRuntime } from "@pneuma-framework/runtime";

function row(id: string, cells: Record<string, unknown>): Row {
  return new Row({
    id,
    app_id: "knowledge-inbox-core-domain",
    table_id: "inbox_items",
    cells: {
      url: `https://pneuma.local/${id}`,
      status: "pending",
      created_at_cell: Date.now(),
      ...cells,
    },
  });
}

async function boot(workspace: string): Promise<AppRuntime> {
  process.env.PNEUMA_WORKSPACE = workspace;
  process.env.PNEUMA_DATA_DIR = join(workspace, "data");
  process.env.PNEUMA_SQLITE_PATH = join(workspace, "data", "app.db");
  const mod = await import(`../server/config.ts?semantic=${Date.now()}-${Math.random()}`);
  return await bootAppRuntime(mod.config);
}

async function invoke(runtime: AppRuntime, operationId: string, input: unknown) {
  const op = runtime.getOperation(operationId) as Operation | undefined;
  expect(op).toBeDefined();
  return await runtime.executor.invoke(
    op!,
    input,
    buildRootContext({
      app_id: "knowledge-inbox-core-domain",
      invoked_via: "ui",
    }),
  );
}

describe("Knowledge Inbox semantic index Operations", () => {
  test("rebuild_semantic_index and semantic_search_items return semantic hits without adding embedding columns", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-ki-semantic-"));
    try {
      const runtime = await boot(workspace);
      try {
        await runtime.storage.saveRow(
          row("risk", {
            title: "Critical customer signal",
            source: "customer calls",
            summary: "Blocking launch risk from a customer escalation.",
          }),
        );
        await runtime.storage.saveRow(
          row("deploy", {
            title: "Docker release evidence",
            source: "release notes",
            summary: "Container restart and deploy confidence from mounted SQLite.",
          }),
        );

        const rebuild = await invoke(runtime, "rebuild_semantic_index", {});
        expect(rebuild.output).toMatchObject({
          index_status: "ready",
          indexed_count: 2,
        });

        const search = await invoke(runtime, "semantic_search_items", {
          query: "release risk from customer escalation",
          limit: 1,
        });
        expect(search.output).toMatchObject({ index_status: "ready" });
        const rows = (search.output as {
          rows: Array<{ item_id: string; score: number }>;
        }).rows;
        expect(rows[0]?.item_id).toBe("risk");
        expect(rows[0]?.score).toBeGreaterThan(0.5);

        const inbox = runtime.config.tables.find((table) => table.id === "inbox_items");
        expect(inbox?.columns.some((column) => column.name === "embedding")).toBe(false);
      } finally {
        await runtime.close();
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("semantic_search_items exposes missing and stale index state", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-ki-semantic-stale-"));
    try {
      const runtime = await boot(workspace);
      try {
        await runtime.storage.saveRow(
          row("risk", {
            title: "Critical customer signal",
            source: "customer calls",
            summary: "Blocking launch risk from a customer escalation.",
          }),
        );
        const missing = await invoke(runtime, "semantic_search_items", {
          query: "customer risk",
          limit: 5,
        });
        expect(missing.output).toMatchObject({
          index_status: "missing",
          missing_count: 1,
        });

        await invoke(runtime, "rebuild_semantic_index", {});
        const changed = await runtime.storage.getRow("risk");
        changed?.setCell("summary", "Updated wording after the index was built.");
        if (changed) await runtime.storage.saveRow(changed);

        const stale = await invoke(runtime, "semantic_search_items", {
          query: "customer risk",
          limit: 5,
        });
        expect(stale.output).toMatchObject({
          index_status: "stale",
          stale_count: 1,
        });
      } finally {
        await runtime.close();
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
