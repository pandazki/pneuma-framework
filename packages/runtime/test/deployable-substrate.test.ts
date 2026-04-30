import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PolicySet,
  Row,
  Table,
  pneumaTableColumnEntryToRow,
  type CellType,
} from "@pneuma-framework/core-domain";
import { bootAppRuntime } from "../src/runtime.js";
import { handleHttp, type HttpRequestContext } from "../src/http.js";
import type { AppConfig } from "../src/types.js";

function bookmarks(appId: string): Table {
  return new Table({
    id: "bookmarks",
    app_id: appId,
    source: { kind: "stored" },
    columns: [
      { name: "url", type: { kind: "primitive", of: "URL" } },
      { name: "title", type: { kind: "primitive", of: "Text" }, nullable: true },
    ],
  });
}

function cfg(appId: string, dbPath: string): AppConfig {
  return {
    app_id: appId,
    persistence: { kind: "sqlite", path: dbPath },
    tables: [bookmarks(appId)],
    operations: [],
    handlers: {},
    policy: new PolicySet({ app_id: appId }),
  };
}

function req(method: string, pathname: string): HttpRequestContext {
  return {
    method,
    pathname,
    searchParams: new URLSearchParams(),
    headers: new Headers(),
    readBody: async () => undefined,
  };
}

describe("M3 deployable substrate runtime persistence", () => {
  test("one SQLite app database preserves data rows and definition rows across runtime restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pneuma-m3-runtime-"));
    try {
      const dbPath = join(dir, "app.db");
      const appId = "m3-runtime-persistence";

      const r1 = await bootAppRuntime(cfg(appId, dbPath));
      await r1.storage.saveRow(
        new Row({
          id: "bookmark-1",
          app_id: appId,
          table_id: "bookmarks",
          cells: { url: "https://example.com", title: "Persisted" },
        })
      );
      await r1.storage.saveRow(
        pneumaTableColumnEntryToRow({
          id: "ptc-tags",
          app_id: appId,
          table_id: "bookmarks",
          column_name: "tags",
          cell_type: { kind: "primitive", of: "Text" } as CellType,
          nullable: true,
          created_by: "builder-1",
          created_by_kind: "builder",
          definition_version: 1,
        })
      );
      await r1.close();

      const r2 = await bootAppRuntime(cfg(appId, dbPath));
      const rows = await r2.storage.listRowsByTable("bookmarks");
      expect(rows.map((row) => row.id)).toEqual(["bookmark-1"]);
      expect(rows[0]!.getCell("title")).toBe("Persisted");

      const config = await handleHttp(r2, req("GET", "/api/config"));
      expect(config.status).toBe(200);
      const body = config.body as { tables: Array<{ id: string; columns: Array<{ name: string }> }> };
      const table = body.tables.find((item) => item.id === "bookmarks")!;
      expect(table.columns.map((column) => column.name)).toContain("tags");
      await r2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
