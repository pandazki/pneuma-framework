import { describe, test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Row,
  Table,
  PolicySet,
  type CellType,
} from "@pneuma-framework/core-domain";
import {
  applyDefinitionChange,
  bootAppRuntime,
  handleHttp,
  type AppConfig,
} from "../src/index.js";

function scratch(): { rowPath: string; historyPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "p2-def-apply-"));
  return {
    rowPath: join(dir, "rows.db"),
    historyPath: join(dir, "history.db"),
  };
}

function config(app_id: string, paths: { rowPath: string; historyPath: string }): AppConfig {
  return {
    app_id,
    tables: [
      new Table({
        id: "bookmarks",
        app_id,
        source: { kind: "stored" },
        columns: [{ name: "url", type: { kind: "primitive", of: "URL" } }],
      }),
    ],
    operations: [],
    policy: new PolicySet({ app_id }),
    handlers: {},
    storage: { sqlite_path: paths.rowPath },
    history: { sqlite_path: paths.historyPath },
  };
}

describe("applyDefinitionChange", () => {
  test("add_table: before rejects rows for the missing table, apply restarts runtime, after accepts it", async () => {
    const app_id = "p2-definition-apply-table";
    const paths = scratch();
    const appConfig = config(app_id, paths);

    {
      const runtime = await bootAppRuntime(appConfig);
      await expect(
        runtime.storage.saveRow(
          new Row({
            id: "note-before",
            app_id,
            table_id: "notes",
            cells: { title: "Before" },
          }),
        ),
      ).rejects.toThrow(/table "notes" not found/i);
      await runtime.close();
    }

    const result = await applyDefinitionChange(appConfig, {
      kind: "add_table",
      table_id: "notes",
      columns: [{ name: "title", type: { kind: "primitive", of: "Text" } }],
    });

    expect(result.diff.added_tables).toEqual([{
      table_id: "notes",
      columns: ["title"],
    }]);
    expect(result.diff.changed_tables).toEqual([]);
    expect(result.operation_output).toMatchObject({ definition_version: 1 });

    const beforeNotes = result.before.tables.find((t) => t.id === "notes");
    const afterNotes = result.after.tables.find((t) => t.id === "notes")!;
    expect(beforeNotes).toBeUndefined();
    expect(afterNotes.columns.map((c) => c.name)).toEqual(["title"]);

    await result.runtime.storage.saveRow(
      new Row({
        id: "note-after",
        app_id,
        table_id: "notes",
        cells: { title: "After" },
      }),
    );
    const saved = await result.runtime.storage.getRow("note-after");
    expect(saved?.getCell("title")).toBe("After");

    const latestHistory = (await result.runtime.history.listEntries(app_id, {
      direction: "desc",
      limit: 1,
    }))[0]!;
    expect(latestHistory.actor_kind).toBe("agent");
    expect(latestHistory.actor_id).toBe("agent:definition-apply");
    expect(latestHistory.operation_scope).toContain("table:notes");
    expect(latestHistory.operation_scope).toContain("operation:add_table");

    await result.runtime.close();
  });

  test("add_table_column: before fails schema validation, apply restarts runtime, after accepts the new column", async () => {
    const app_id = "p2-definition-apply";
    const paths = scratch();
    const appConfig = config(app_id, paths);

    {
      const runtime = await bootAppRuntime(appConfig);
      await expect(
        runtime.storage.saveRow(
          new Row({
            id: "bm-before",
            app_id,
            table_id: "bookmarks",
            cells: { url: "https://example.com/before", tags: "p2" },
          }),
        ),
      ).rejects.toThrow(/no matching column/i);
      await runtime.close();
    }

    const result = await applyDefinitionChange(appConfig, {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" } as CellType,
      nullable: true,
    });

    expect(result.diff.changed_tables).toEqual([{
      table_id: "bookmarks",
      before_columns: ["url"],
      after_columns: ["url", "tags"],
      added_columns: ["tags"],
    }]);
    expect(result.operation_output).toMatchObject({ definition_version: 1 });

    const beforeBookmarks = result.before.tables.find((t) => t.id === "bookmarks")!;
    const afterBookmarks = result.after.tables.find((t) => t.id === "bookmarks")!;
    expect(beforeBookmarks.columns.map((c) => c.name)).toEqual(["url"]);
    expect(afterBookmarks.columns.map((c) => c.name)).toEqual(["url", "tags"]);

    await result.runtime.storage.saveRow(
      new Row({
        id: "bm-after",
        app_id,
        table_id: "bookmarks",
        cells: { url: "https://example.com/after", tags: "p2" },
      }),
    );
    const saved = await result.runtime.storage.getRow("bm-after");
    expect(saved?.getCell("tags")).toBe("p2");

    const latestHistory = (await result.runtime.history.listEntries(app_id, {
      direction: "desc",
      limit: 1,
    }))[0]!;
    expect(latestHistory.actor_kind).toBe("agent");
    expect(latestHistory.actor_id).toBe("agent:definition-apply");
    expect(latestHistory.operation_scope).toContain("table:bookmarks");

    await result.runtime.close();
  });

  test("add_operation: applies a query-backed Operation and exposes it through HTTP after restart", async () => {
    const app_id = "p2-definition-apply-operation";
    const paths = scratch();
    const appConfig = config(app_id, paths);

    {
      const runtime = await bootAppRuntime(appConfig);
      await runtime.storage.saveRow(
        new Row({
          id: "bm-1",
          app_id,
          table_id: "bookmarks",
          cells: { url: "https://example.com/p12" },
        }),
      );
      expect(runtime.getOperation("list_bookmark_urls")).toBeUndefined();
      await runtime.close();
    }

    const result = await applyDefinitionChange(appConfig, {
      kind: "add_operation",
      operation_id: "list_bookmark_urls",
      name: "List bookmark URLs",
      handler: {
        kind: "query",
        on: "bookmarks",
        fields: ["url"],
        pagination: { kind: "offset", size: 10 },
      },
    });

    expect(result.diff.added_operations).toEqual([{
      operation_id: "list_bookmark_urls",
      action: "read",
      handler_kind: "query",
    }]);
    expect(result.operation_output).toMatchObject({
      operation_id: "list_bookmark_urls",
      definition_version: 1,
    });
    expect(result.before.operations.map((op) => op.id)).not.toContain("list_bookmark_urls");
    expect(result.after.operations.map((op) => op.id)).toContain("list_bookmark_urls");

    const resp = await handleHttp(result.runtime, {
      method: "GET",
      pathname: "/api/operations/list_bookmark_urls",
      searchParams: new URLSearchParams(),
      headers: new Headers(),
      readBody: async () => undefined,
    });
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({ rows: [{ url: "https://example.com/p12" }] });

    await result.runtime.close();
  });

  test("add_view: applies an Operation-backed View and exposes it through config after restart", async () => {
    const app_id = "p2-definition-apply-view";
    const paths = scratch();
    const appConfig = config(app_id, paths);

    const operationResult = await applyDefinitionChange(appConfig, {
      kind: "add_operation",
      operation_id: "list_bookmark_urls",
      name: "List bookmark URLs",
      handler: {
        kind: "query",
        on: "bookmarks",
        fields: ["url"],
        pagination: { kind: "offset", size: 10 },
      },
    });
    await operationResult.runtime.close();

    const result = await applyDefinitionChange(appConfig, {
      kind: "add_view",
      view_id: "review_queue",
      name: "Review Queue",
      view_kind: "table",
      source: { kind: "operation", operation_id: "list_bookmark_urls" },
      presentation: { columns: ["url"] },
    });

    expect(result.diff.added_views).toEqual([{
      view_id: "review_queue",
      kind: "table",
      source_operation_id: "list_bookmark_urls",
    }]);
    expect(result.operation_output).toMatchObject({
      view_id: "review_queue",
      definition_version: 1,
    });
    expect(result.before.views.map((view) => view.id)).not.toContain("review_queue");
    expect(result.after.views.map((view) => view.id)).toContain("review_queue");

    const configResp = await handleHttp(result.runtime, {
      method: "GET",
      pathname: "/api/config",
      searchParams: new URLSearchParams(),
      headers: new Headers(),
      readBody: async () => undefined,
    });
    expect(configResp.status).toBe(200);
    expect((configResp.body as { views: Array<{ id: string }> }).views.map((view) => view.id))
      .toContain("review_queue");

    await result.runtime.close();
  });

  test("requires persistent row storage so the definition row can survive restart", async () => {
    const app_id = "p2-definition-apply-memory";
    const appConfig: AppConfig = {
      app_id,
      tables: [
        new Table({
          id: "bookmarks",
          app_id,
          source: { kind: "stored" },
          columns: [{ name: "url", type: { kind: "primitive", of: "URL" } }],
        }),
      ],
      operations: [],
      policy: new PolicySet({ app_id }),
      handlers: {},
    };

    await expect(
      applyDefinitionChange(appConfig, {
        kind: "add_table_column",
        table_id: "bookmarks",
        column_name: "tags",
        cell_type: { kind: "primitive", of: "Text" } as CellType,
      }),
    ).rejects.toThrow(/persistent SQLite file/i);
  });
});
