import { describe, test, expect } from "bun:test";
import {
  createAddTableColumnOp,
  ADD_TABLE_COLUMN_OP_ID,
  ADD_TABLE_COLUMN_HANDLER_REF,
  createAddTableColumnHandler,
  applyFrameworkInjections,
} from "../src/framework-operations.js";
import { PolicySet } from "@pneuma-framework/core-domain";
import type { AppConfig } from "../src/types.js";
import {
  Table,
  StorageService,
  InMemoryRepository,
  BunSqliteRowRepository,
  BunSqliteAppHistoryStore,
  openRowDatabase,
  buildRootContext,
  PNEUMA_TABLE_COLUMNS_TABLE_ID,
  createPneumaTableColumnsTable,
  type AppHistoryStore,
  type CellType,
} from "@pneuma-framework/core-domain";
import { Database } from "bun:sqlite";

describe("createAddTableColumnOp", () => {
  test("returns an Operation with the framework id and correct affects", () => {
    const op = createAddTableColumnOp("ai-bookmarks");
    expect(op.id).toBe(ADD_TABLE_COLUMN_OP_ID);
    expect(op.id).toBe("add_table_column");
    expect(op.app_id).toBe("ai-bookmarks");
    expect(op.affects.mutations).toEqual([PNEUMA_TABLE_COLUMNS_TABLE_ID]);
    expect(op.affects.adapter_writes).toEqual([]);
    expect(op.affects.reads_only).toBe(false);
    expect(op.affects.destructive).toBe(false);
  });

  test("input schema requires table_id, column_name, cell_type; optional nullable + default_value", () => {
    const op = createAddTableColumnOp("app");
    const fields = op.input.fields;
    expect(fields.table_id?.required).toBe(true);
    expect(fields.column_name?.required).toBe(true);
    expect(fields.cell_type?.required).toBe(true);
    expect(fields.nullable?.required).not.toBe(true);
    expect(fields.default_value?.required).not.toBe(true);
  });

  test("output is object with entry_id + definition_version fields", () => {
    const op = createAddTableColumnOp("app");
    expect(op.output.kind).toBe("object");
    if (op.output.kind === "object") {
      const schema = op.output.schema as {
        properties: Record<string, unknown>;
        required: string[];
      };
      expect(schema.properties.entry_id).toBeDefined();
      expect(schema.properties.definition_version).toBeDefined();
      expect(schema.required).toEqual(expect.arrayContaining(["entry_id", "definition_version"]));
    }
  });

  test("handler is a code ref with the framework prefix", () => {
    const op = createAddTableColumnOp("app");
    expect(op.handler.kind).toBe("code");
    if (op.handler.kind === "code") {
      expect(op.handler.ref).toBe(ADD_TABLE_COLUMN_HANDLER_REF);
      expect(op.handler.ref).toBe("framework://add_table_column");
    }
  });
});

function bootHandlerTestBed(app_id: string) {
  const rowDb = openRowDatabase(":memory:");
  const historyDb = new Database(":memory:");
  const tables = new InMemoryRepository<Table>((t) => t.id);
  const rows = new BunSqliteRowRepository(rowDb);
  // Target Table (a non-system stored table)
  const bookmarks = new Table({
    id: "bookmarks",
    app_id,
    source: { kind: "stored" },
    columns: [{ name: "url", type: { kind: "primitive", of: "URL" } }],
  });
  // Framework Table
  const ptc = createPneumaTableColumnsTable(app_id);
  void tables.save(bookmarks);
  void tables.save(ptc);
  const storage = new StorageService(tables, rows);
  const history: AppHistoryStore = new BunSqliteAppHistoryStore(historyDb);
  const handler = createAddTableColumnHandler();
  return { handler, storage, history, rowDb, historyDb, bookmarks };
}

function agentCtx(app_id: string) {
  return buildRootContext({
    app_id,
    invoked_via: "agent",
    user: { id: "agent:builder-01", attrs: {}, roles: [] },
  });
}

describe("createAddTableColumnHandler", () => {
  test("happy path: writes row + appends snapshot history entry + returns entry_id/version", async () => {
    const { handler, storage, history } = bootHandlerTestBed("app-a");
    const result = (await handler({
      ctx: agentCtx("app-a"),
      input: {
        table_id: "bookmarks",
        column_name: "tags",
        cell_type: { kind: "primitive", of: "Text" } as CellType,
        nullable: true,
      },
      storage,
      services: { history },
    })) as { entry_id: string; definition_version: number };
    expect(typeof result.entry_id).toBe("string");
    expect(result.definition_version).toBe(1);

    // Row persisted
    const rows = await storage.listRowsByTable(PNEUMA_TABLE_COLUMNS_TABLE_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.getCell("column_name")).toBe("tags");
    expect(rows[0]!.getCell("nullable")).toBe(true);

    // History appended (use listEntries with direction=desc + limit=1 to fetch the most recent)
    const entries = await history.listEntries("app-a", { direction: "desc", limit: 1 });
    const latest = entries[0];
    expect(latest).toBeDefined();
    expect(latest!.history_type).toBe("snapshot");
    expect(latest!.actor_kind).toBe("agent");
    expect(latest!.is_ai_generated).toBe(true);
    expect(latest!.operation_scope).toContain("table:bookmarks");
    expect(latest!.operation_scope).toContain("operation:add_table_column");
    const payload = latest!.payload as { kind: string; rows: unknown[] };
    expect(payload.kind).toBe("pneuma_table_columns_snapshot");
    expect(payload.rows).toHaveLength(1);
  });

  test("rejects reserved column name on stored table", async () => {
    const { handler, storage, history } = bootHandlerTestBed("app-b");
    await expect(
      handler({
        ctx: agentCtx("app-b"),
        input: {
          table_id: "bookmarks",
          column_name: "id", // reserved
          cell_type: { kind: "primitive", of: "Text" } as CellType,
        },
        storage,
        services: { history },
      }),
    ).rejects.toThrow(/reserved/i);
  });

  test("rejects duplicate column name on base table", async () => {
    const { handler, storage, history } = bootHandlerTestBed("app-c");
    await expect(
      handler({
        ctx: agentCtx("app-c"),
        input: {
          table_id: "bookmarks",
          column_name: "url", // already on base
          cell_type: { kind: "primitive", of: "Text" } as CellType,
        },
        storage,
        services: { history },
      }),
    ).rejects.toThrow(/already (exists|present)/i);
  });

  test("rejects invalid CellType", async () => {
    const { handler, storage, history } = bootHandlerTestBed("app-d");
    await expect(
      handler({
        ctx: agentCtx("app-d"),
        input: {
          table_id: "bookmarks",
          column_name: "broken",
          cell_type: { kind: "vector", dim: -1 } as CellType,
        },
        storage,
        services: { history },
      }),
    ).rejects.toThrow(/invalid.*CellType/i);
  });

  test("rejects unknown target table", async () => {
    const { handler, storage, history } = bootHandlerTestBed("app-e");
    await expect(
      handler({
        ctx: agentCtx("app-e"),
        input: {
          table_id: "missing_table",
          column_name: "foo",
          cell_type: { kind: "primitive", of: "Text" } as CellType,
        },
        storage,
        services: { history },
      }),
    ).rejects.toThrow(/table.*not.*found/i);
  });

  test("rejects non-stored target table", async () => {
    const { handler, storage, history } = bootHandlerTestBed("app-f");
    // Swap out bookmarks for a derived table under same id
    const tables = (storage as unknown as { tables: { save(t: Table): void } }).tables;
    const derived = new Table({
      id: "bookmarks",
      app_id: "app-f",
      source: { kind: "derived", expression: {} },
      columns: [],
    });
    tables.save(derived);
    await expect(
      handler({
        ctx: agentCtx("app-f"),
        input: {
          table_id: "bookmarks",
          column_name: "tags",
          cell_type: { kind: "primitive", of: "Text" } as CellType,
        },
        storage,
        services: { history },
      }),
    ).rejects.toThrow(/stored/i);
  });

  test("definition_version increments within a table_id", async () => {
    const { handler, storage, history } = bootHandlerTestBed("app-g");
    const r1 = (await handler({
      ctx: agentCtx("app-g"),
      input: {
        table_id: "bookmarks",
        column_name: "tags",
        cell_type: { kind: "primitive", of: "Text" } as CellType,
      },
      storage,
      services: { history },
    })) as { definition_version: number };
    const r2 = (await handler({
      ctx: agentCtx("app-g"),
      input: {
        table_id: "bookmarks",
        column_name: "summary",
        cell_type: { kind: "primitive", of: "RichText" } as CellType,
      },
      storage,
      services: { history },
    })) as { definition_version: number };
    expect(r1.definition_version).toBe(1);
    expect(r2.definition_version).toBe(2);
  });
});

function baseConfig(app_id: string): AppConfig {
  const policy = new PolicySet({ app_id });
  return {
    app_id,
    tables: [],
    operations: [],
    policy,
    handlers: {},
  };
}

describe("applyFrameworkInjections", () => {
  test("merges pneuma_table_columns Table into config.tables", () => {
    const merged = applyFrameworkInjections(baseConfig("app-merge-1"));
    const ids = merged.tables.map((t) => t.id);
    expect(ids).toContain("pneuma_table_columns");
  });

  test("merges add_table_column Operation into config.operations", () => {
    const merged = applyFrameworkInjections(baseConfig("app-merge-2"));
    const ids = merged.operations.map((o) => o.id);
    expect(ids).toContain(ADD_TABLE_COLUMN_OP_ID);
  });

  test("merges add_table_column handler into config.handlers", () => {
    const merged = applyFrameworkInjections(baseConfig("app-merge-3"));
    expect(merged.handlers["framework://add_table_column"]).toBeTypeOf("function");
  });

  test("merges allow-all policy rule for add_table_column into config.policy", () => {
    const merged = applyFrameworkInjections(baseConfig("app-merge-4"));
    const compiled = merged.policy.compile();
    // Existence check: there must be at least one rule on operation:add_table_column
    const rules = (merged.policy as unknown as { rules: Array<{ on: unknown }> }).rules;
    const match = rules.some((r) => {
      const on = r.on as { kind?: string; id?: string };
      return on.kind === "operation" && on.id === ADD_TABLE_COLUMN_OP_ID;
    });
    expect(match).toBe(true);
    void compiled; // compiled is smoke-checked above; rules array is the authoritative source
  });

  test("does not double-inject if already present (idempotent)", () => {
    const once = applyFrameworkInjections(baseConfig("app-merge-5"));
    const twice = applyFrameworkInjections(once);
    const tableIds = twice.tables.map((t) => t.id);
    expect(tableIds.filter((id) => id === "pneuma_table_columns")).toHaveLength(1);
    const opIds = twice.operations.map((o) => o.id);
    expect(opIds.filter((id) => id === ADD_TABLE_COLUMN_OP_ID)).toHaveLength(1);
  });
});
