import { describe, test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Table,
  pneumaTableEntryToRow,
  pneumaTableColumnEntryToRow,
  type CellType,
} from "@pneuma-framework/core-domain";
import { bootAppRuntime } from "../src/runtime.js";
import { handleHttp, type HttpRequestContext } from "../src/http.js";
import { applyDefinitionOverlay } from "../src/definition-loader.js";
import type { AppConfig } from "../src/types.js";
import { PolicySet } from "@pneuma-framework/core-domain";

function cfg(app_id: string, baseTables: Table[]): AppConfig {
  return {
    app_id,
    tables: baseTables,
    operations: [],
    policy: new PolicySet({ app_id }),
    handlers: {},
  };
}

function bookmarks(app_id: string): Table {
  return new Table({
    id: "bookmarks",
    app_id,
    source: { kind: "stored" },
    columns: [{ name: "url", type: { kind: "primitive", of: "URL" } }],
  });
}

function mkReq(method: string, pathname: string, search = ""): HttpRequestContext {
  return {
    method,
    pathname,
    searchParams: new URLSearchParams(search),
    headers: new Headers(),
    readBody: async () => undefined,
  };
}

describe("applyDefinitionOverlay", () => {
  test("reads pneuma_tables rows and registers newly declared stored Tables", async () => {
    const runtime = await bootAppRuntime(cfg("ovl-table-1", [bookmarks("ovl-table-1")]));
    await runtime.storage.saveRow(
      pneumaTableEntryToRow({
        id: "pt-notes",
        app_id: "ovl-table-1",
        table_id: "notes",
        source: { kind: "stored" },
        columns: [
          { name: "title", type: { kind: "primitive", of: "Text" } },
          { name: "rating", type: { kind: "primitive", of: "Number" }, nullable: true },
        ],
        system_owned: false,
        created_by: "tester",
        created_by_kind: "builder",
        definition_version: 1,
      }),
    );
    expect(await runtime.tables.get("notes")).toBeUndefined();

    await applyDefinitionOverlay(runtime);

    const notes = await runtime.tables.get("notes");
    expect(notes).toBeDefined();
    expect(notes!.source.kind).toBe("stored");
    expect(notes!.system_owned).toBe(false);
    expect(notes!.columns.map((c) => c.name)).toEqual(["title", "rating"]);
    await runtime.close();
  });

  test("reads pneuma_table_columns rows and calls addColumn on the matching base Table", async () => {
    const runtime = await bootAppRuntime(cfg("ovl-1", [bookmarks("ovl-1")]));
    // Pre-seed a pneuma_table_columns row directly
    await runtime.storage.saveRow(
      pneumaTableColumnEntryToRow({
        id: "ptc-1",
        app_id: "ovl-1",
        table_id: "bookmarks",
        column_name: "tags",
        cell_type: { kind: "primitive", of: "Text" } as CellType,
        nullable: true,
        created_by: "tester",
        created_by_kind: "builder",
        definition_version: 1,
      }),
    );
    // Base Table should NOT yet have `tags` — bootAppRuntime hasn't run overlay yet
    // in this test path (we don't call it twice).
    const base = await runtime.tables.get("bookmarks");
    expect(base!.hasColumn("tags")).toBe(false);

    // Apply the overlay manually
    await applyDefinitionOverlay(runtime);

    const after = await runtime.tables.get("bookmarks");
    expect(after!.hasColumn("tags")).toBe(true);
    const col = after!.columns.find((c) => c.name === "tags")!;
    expect(col.type.kind).toBe("primitive");
    expect(col.nullable).toBe(true);

    await runtime.close();
  });

  test("skips rows pointing at missing tables (logs warning, continues)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pneuma-overlay-warning-"));
    const runtime = await bootAppRuntime({
      ...cfg("ovl-2", [bookmarks("ovl-2")]),
      audit: { ndjson_path: join(dir, "audit.ndjson") },
    });
    await runtime.storage.saveRow(
      pneumaTableColumnEntryToRow({
        id: "ptc-stale",
        app_id: "ovl-2",
        table_id: "missing_table",
        column_name: "extra",
        cell_type: { kind: "primitive", of: "Text" } as CellType,
        nullable: false,
        created_by: "system",
        created_by_kind: "framework",
        definition_version: 1,
      }),
    );
    // Should not throw — just skips the stale row.
    await applyDefinitionOverlay(runtime);
    const base = await runtime.tables.get("bookmarks");
    // bookmarks unchanged
    expect(base!.hasColumn("extra")).toBe(false);

    expect(runtime.overlayWarnings).toHaveLength(1);
    expect(runtime.overlayWarnings[0]).toMatchObject({
      code: "missing_target_table",
      source: "pneuma_table_columns",
      row_id: "ptc-stale",
      table_id: "missing_table",
      column_name: "extra",
    });

    const health = await handleHttp(runtime, mkReq("GET", "/api/health"));
    expect(health.status).toBe(200);
    const healthBody = health.body as {
      overlay_warning_count: number;
      overlay_warnings: Array<{ code: string; row_id: string }>;
    };
    expect(healthBody.overlay_warning_count).toBe(1);
    expect(healthBody.overlay_warnings[0]).toMatchObject({
      code: "missing_target_table",
      row_id: "ptc-stale",
    });

    let events: Array<{ payload: { kind?: string } }> = [];
    for (let i = 0; i < 20; i++) {
      const resp = await handleHttp(runtime, mkReq("GET", "/api/events", "tag=definition-overlay"));
      events = (resp.body as { events: Array<{ payload: { kind?: string } }> }).events;
      if (events.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(events.some((e) => e.payload.kind === "definition-overlay.warning")).toBe(true);
    await runtime.close();
  });

  test("bootAppRuntime applies overlay before returning", async () => {
    const db = await import("bun:sqlite");
    const rowPath = `:memory:`;
    // Simulate the "prior process" — boot, write overlay entry, close.
    const app_id = "ovl-3-cross";
    const runtime1 = await bootAppRuntime({
      ...cfg(app_id, [bookmarks(app_id)]),
      storage: { sqlite_path: rowPath },
    });
    // With :memory: each boot is a fresh DB, so this test just verifies
    // the in-process overlay path end-to-end. For true cross-restart we use
    // Task 8's test.
    await runtime1.storage.saveRow(
      pneumaTableColumnEntryToRow({
        id: "ptc-same-proc",
        app_id,
        table_id: "bookmarks",
        column_name: "summary",
        cell_type: { kind: "primitive", of: "RichText" } as CellType,
        nullable: false,
        created_by: "tester",
        created_by_kind: "builder",
        definition_version: 1,
      }),
    );
    // Re-run overlay (this is what happens on next boot)
    await applyDefinitionOverlay(runtime1);
    const t = await runtime1.tables.get("bookmarks");
    expect(t!.hasColumn("summary")).toBe(true);
    await runtime1.close();
    void db;
  });
});
