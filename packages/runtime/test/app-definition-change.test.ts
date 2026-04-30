import { describe, test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Table,
  Row,
  PolicySet,
  Subjects,
  Resources,
  buildRootContext,
  type CellType,
} from "@pneuma-framework/core-domain";
import { bootAppRuntime, ADD_TABLE_COLUMN_OP_ID } from "../src/index.js";
import type { AppConfig } from "../src/types.js";

function scratch(): { dir: string; rowPath: string; historyPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "p1-def-"));
  return {
    dir,
    rowPath: join(dir, "rows.db"),
    historyPath: join(dir, "history.db"),
  };
}

function baseConfig(app_id: string, paths: { rowPath: string; historyPath: string }): AppConfig {
  const bookmarks = new Table({
    id: "bookmarks",
    app_id,
    source: { kind: "stored" },
    columns: [{ name: "url", type: { kind: "primitive", of: "URL" } }],
  });
  const policy = new PolicySet({ app_id });
  // No template ops in this test — we only exercise the framework-injected one.
  return {
    app_id,
    tables: [bookmarks],
    operations: [],
    policy,
    handlers: {},
    storage: { sqlite_path: paths.rowPath },
    history: { sqlite_path: paths.historyPath },
  };
}

describe("P1 end-to-end: add_table_column survives process restart", () => {
  test("column added in process 1 is visible in process 2, and a new row with the column can be saved", async () => {
    const app_id = "p1-e2e";
    const paths = scratch();

    // ---- Process 1: boot, invoke add_table_column, close ----
    {
      const runtime = await bootAppRuntime(baseConfig(app_id, paths));

      // Confirm tags not yet present
      const before = await runtime.tables.get("bookmarks");
      expect(before!.hasColumn("tags")).toBe(false);

      const op = runtime.getOperation(ADD_TABLE_COLUMN_OP_ID)!;
      const ctx = buildRootContext({
        app_id,
        invoked_via: "system",
        user: { id: "framework", attrs: {}, roles: [] },
      });
      const result = await runtime.executor.invoke(
        op,
        {
          table_id: "bookmarks",
          column_name: "tags",
          cell_type: { kind: "primitive", of: "Text" } as CellType,
          nullable: true,
        },
        ctx,
      );
      const output = result.output as { entry_id: string; definition_version: number };
      expect(output.entry_id).toMatch(/^ptc-/);
      expect(output.definition_version).toBe(1);

      // app_history has the entry (listEntries desc+limit=1 is the "most recent" pattern)
      const histEntries = await runtime.history.listEntries(app_id, { direction: "desc", limit: 1 });
      const latest = histEntries[0];
      expect(latest).toBeDefined();
      expect(latest!.actor_kind).toBe("framework");
      expect(latest!.is_ai_generated).toBe(false);
      expect(latest!.operation_scope).toContain("table:bookmarks");

      // In-process effect: base Table in THIS process should NOT yet have tags
      // (P1 does not restart; the column is row-persisted but the base Table
      // in runtime.tables is unmodified.)
      const after = await runtime.tables.get("bookmarks");
      expect(after!.hasColumn("tags")).toBe(false);

      await runtime.close();
    }

    // ---- Process 2: boot with same SQLite file, assert overlay applied ----
    {
      const runtime = await bootAppRuntime(baseConfig(app_id, paths));
      const base = await runtime.tables.get("bookmarks");
      expect(base!.hasColumn("tags")).toBe(true);

      const tagsCol = base!.columns.find((c) => c.name === "tags")!;
      expect(tagsCol.type.kind).toBe("primitive");
      expect(tagsCol.nullable).toBe(true);

      // Save a Row using the new column — validated by normal schema path
      const row = new Row({
        id: "bm-1",
        table_id: "bookmarks",
        app_id,
        cells: {
          url: "https://example.com",
          tags: "one,two",
        },
      });
      await runtime.storage.saveRow(row);
      const back = await runtime.storage.getRow("bm-1");
      expect(back).toBeDefined();
      expect(back!.getCell("tags")).toBe("one,two");

      await runtime.close();
    }
  });
});
