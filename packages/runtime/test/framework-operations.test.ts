import { describe, test, expect } from "bun:test";
import {
  createAddTableOp,
  ADD_TABLE_OP_ID,
  ADD_TABLE_HANDLER_REF,
  createAddTableHandler,
  createAddTableColumnOp,
  ADD_TABLE_COLUMN_OP_ID,
  ADD_TABLE_COLUMN_HANDLER_REF,
  createAddTableColumnHandler,
  createAddOperationOp,
  ADD_OPERATION_OP_ID,
  ADD_OPERATION_HANDLER_REF,
  createAddViewOp,
  ADD_VIEW_OP_ID,
  ADD_VIEW_HANDLER_REF,
  createAddViewHandler,
  createAddPolicyRuleOp,
  ADD_POLICY_RULE_OP_ID,
  ADD_POLICY_RULE_HANDLER_REF,
  createAddPolicyRuleHandler,
  createUpdatePolicyRuleOp,
  UPDATE_POLICY_RULE_OP_ID,
  UPDATE_POLICY_RULE_HANDLER_REF,
  createUpdatePolicyRuleHandler,
  createDeletePolicyRuleOp,
  DELETE_POLICY_RULE_OP_ID,
  DELETE_POLICY_RULE_HANDLER_REF,
  createDeletePolicyRuleHandler,
  createPolicyExplainOp,
  POLICY_EXPLAIN_OP_ID,
  POLICY_EXPLAIN_HANDLER_REF,
  createSetDefaultPostureOp,
  SET_DEFAULT_POSTURE_OP_ID,
  SET_DEFAULT_POSTURE_HANDLER_REF,
  createDefinitionRollbackValidateOp,
  DEFINITION_ROLLBACK_VALIDATE_OP_ID,
  DEFINITION_ROLLBACK_VALIDATE_HANDLER_REF,
  createDefinitionRollbackExecuteOp,
  DEFINITION_ROLLBACK_EXECUTE_OP_ID,
  DEFINITION_ROLLBACK_EXECUTE_HANDLER_REF,
  DEFINITION_ROLLBACK_EXECUTE_IMPACT_REF,
  applyFrameworkInjections,
} from "../src/framework-operations.js";
import { bootAppRuntime } from "../src/runtime.js";
import { PolicySet } from "@pneuma-framework/core-domain";
import type { AppConfig } from "../src/types.js";
import {
  Table,
  Row,
  StorageService,
  InMemoryRepository,
  BunSqliteRowRepository,
  BunSqliteAppHistoryStore,
  openRowDatabase,
  buildRootContext,
  PNEUMA_TABLES_TABLE_ID,
  PNEUMA_TABLE_COLUMNS_TABLE_ID,
  PNEUMA_OPERATIONS_TABLE_ID,
  PNEUMA_VIEWS_TABLE_ID,
  PNEUMA_POLICY_RULES_TABLE_ID,
  PNEUMA_POLICY_SETTINGS_TABLE_ID,
  createPneumaTablesTable,
  createPneumaTableColumnsTable,
  createPneumaViewsTable,
  createPneumaPolicyRulesTable,
  createPneumaPolicySettingsTable,
  Operation,
  Resources,
  Subjects,
  type AppHistoryStore,
  type CellType,
  type HandlerFn,
  type OperationSurfaceInit,
} from "@pneuma-framework/core-domain";
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("createAddTableOp", () => {
  test("returns an Operation with the framework id and correct affects", () => {
    const op = createAddTableOp("ai-bookmarks");
    expect(op.id).toBe(ADD_TABLE_OP_ID);
    expect(op.id).toBe("add_table");
    expect(op.app_id).toBe("ai-bookmarks");
    expect(op.affects.mutations).toEqual([PNEUMA_TABLES_TABLE_ID]);
    expect(op.affects.adapter_writes).toEqual([]);
    expect(op.affects.reads_only).toBe(false);
    expect(op.affects.destructive).toBe(false);
  });

  test("input schema requires table_id and accepts optional columns", () => {
    const op = createAddTableOp("app");
    const fields = op.input.fields;
    expect(fields.table_id?.required).toBe(true);
    expect(fields.columns?.required).not.toBe(true);
  });

  test("handler is a code ref with the framework prefix", () => {
    const op = createAddTableOp("app");
    expect(op.handler.kind).toBe("code");
    if (op.handler.kind === "code") {
      expect(op.handler.ref).toBe(ADD_TABLE_HANDLER_REF);
      expect(op.handler.ref).toBe("framework://add_table");
    }
  });
});

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

describe("createDefinitionRollbackValidateOp", () => {
  test("returns a reads-only code Operation with target_history_version input", () => {
    const op = createDefinitionRollbackValidateOp("ai-bookmarks");
    expect(op.id).toBe(DEFINITION_ROLLBACK_VALIDATE_OP_ID);
    expect(op.id).toBe("definition.rollback.validate");
    expect(op.app_id).toBe("ai-bookmarks");
    expect(op.affects.mutations).toEqual([]);
    expect(op.affects.adapter_writes).toEqual([]);
    expect(op.affects.reads_only).toBe(true);
    expect(op.affects.destructive).toBe(false);
    expect(op.input.fields.target_history_version?.required).toBe(true);
    expect(op.handler.kind).toBe("code");
    if (op.handler.kind === "code") {
      expect(op.handler.ref).toBe(DEFINITION_ROLLBACK_VALIDATE_HANDLER_REF);
    }
  });
});

describe("createAddOperationOp", () => {
  test("returns a framework Operation for query-backed Operation declaration", () => {
    const op = createAddOperationOp("app");
    expect(op.id).toBe(ADD_OPERATION_OP_ID);
    expect(op.affects.mutations).toEqual([PNEUMA_OPERATIONS_TABLE_ID]);
    expect(op.affects.reads_only).toBe(false);
    expect(op.handler.kind).toBe("code");
    if (op.handler.kind === "code") {
      expect(op.handler.ref).toBe(ADD_OPERATION_HANDLER_REF);
    }
  });
});

describe("createAddViewOp", () => {
  test("returns a framework Operation for Operation-backed View declaration", () => {
    const op = createAddViewOp("app");
    expect(op.id).toBe(ADD_VIEW_OP_ID);
    expect(op.affects.mutations).toEqual([PNEUMA_VIEWS_TABLE_ID]);
    expect(op.affects.reads_only).toBe(false);
    expect(op.handler.kind).toBe("code");
    if (op.handler.kind === "code") {
      expect(op.handler.ref).toBe(ADD_VIEW_HANDLER_REF);
    }
  });
});

describe("createAddPolicyRuleOp", () => {
  test("returns a framework Operation for PolicyRule declaration", () => {
    const op = createAddPolicyRuleOp("app");
    expect(op.id).toBe(ADD_POLICY_RULE_OP_ID);
    expect(op.affects.mutations).toEqual([PNEUMA_POLICY_RULES_TABLE_ID]);
    expect(op.affects.reads_only).toBe(false);
    expect(op.handler.kind).toBe("code");
    if (op.handler.kind === "code") {
      expect(op.handler.ref).toBe(ADD_POLICY_RULE_HANDLER_REF);
    }
  });
});

describe("createUpdatePolicyRuleOp", () => {
  test("returns a framework Operation for PolicyRule updates", () => {
    const op = createUpdatePolicyRuleOp("app");
    expect(op.id).toBe(UPDATE_POLICY_RULE_OP_ID);
    expect(op.id).toBe("update_policy_rule");
    expect(op.affects.mutations).toEqual([PNEUMA_POLICY_RULES_TABLE_ID]);
    expect(op.affects.reads_only).toBe(false);
    expect(op.handler.kind).toBe("code");
    if (op.handler.kind === "code") {
      expect(op.handler.ref).toBe(UPDATE_POLICY_RULE_HANDLER_REF);
    }
  });
});

describe("createDeletePolicyRuleOp", () => {
  test("returns a framework Operation for PolicyRule deletion", () => {
    const op = createDeletePolicyRuleOp("app");
    expect(op.id).toBe(DELETE_POLICY_RULE_OP_ID);
    expect(op.id).toBe("delete_policy_rule");
    expect(op.affects.mutations).toEqual([PNEUMA_POLICY_RULES_TABLE_ID]);
    expect(op.affects.reads_only).toBe(false);
    expect(op.handler.kind).toBe("code");
    if (op.handler.kind === "code") {
      expect(op.handler.ref).toBe(DELETE_POLICY_RULE_HANDLER_REF);
    }
  });
});

describe("createPolicyExplainOp", () => {
  test("returns a read-only framework Operation for policy explanations", () => {
    const op = createPolicyExplainOp("app");
    expect(op.id).toBe(POLICY_EXPLAIN_OP_ID);
    expect(op.id).toBe("policy.explain");
    expect(op.affects.mutations).toEqual([]);
    expect(op.affects.reads_only).toBe(true);
    expect(op.handler.kind).toBe("code");
    if (op.handler.kind === "code") {
      expect(op.handler.ref).toBe(POLICY_EXPLAIN_HANDLER_REF);
    }
  });
});

describe("createSetDefaultPostureOp", () => {
  test("returns a framework Operation for governed default posture mutation", () => {
    const op = createSetDefaultPostureOp("app");
    expect(op.id).toBe(SET_DEFAULT_POSTURE_OP_ID);
    expect(op.id).toBe("set_default_posture");
    expect(op.affects.mutations).toEqual([PNEUMA_POLICY_SETTINGS_TABLE_ID]);
    expect(op.affects.reads_only).toBe(false);
    expect(op.handler.kind).toBe("code");
    if (op.handler.kind === "code") {
      expect(op.handler.ref).toBe(SET_DEFAULT_POSTURE_HANDLER_REF);
    }
  });
});


describe("createDefinitionRollbackExecuteOp", () => {
  test("returns a destructive code Operation with impact descriptor", () => {
    const op = createDefinitionRollbackExecuteOp("ai-bookmarks");
    expect(op.id).toBe(DEFINITION_ROLLBACK_EXECUTE_OP_ID);
    expect(op.id).toBe("definition.rollback.execute");
    expect(op.app_id).toBe("ai-bookmarks");
    expect(op.affects.mutations).toEqual([
      PNEUMA_TABLES_TABLE_ID,
      PNEUMA_TABLE_COLUMNS_TABLE_ID,
      PNEUMA_OPERATIONS_TABLE_ID,
      PNEUMA_VIEWS_TABLE_ID,
      PNEUMA_POLICY_RULES_TABLE_ID,
      PNEUMA_POLICY_SETTINGS_TABLE_ID,
    ]);
    expect(op.affects.adapter_writes).toEqual([]);
    expect(op.affects.reads_only).toBe(false);
    expect(op.affects.destructive).toBe(true);
    expect(op.input.fields.target_history_version?.required).toBe(true);
    expect(op.requiresConfirmation()).toBe(true);
    expect(op.handler.kind).toBe("code");
    if (op.handler.kind === "code") {
      expect(op.handler.ref).toBe(DEFINITION_ROLLBACK_EXECUTE_HANDLER_REF);
    }
    expect(op.impact?.compute.ref).toBe(DEFINITION_ROLLBACK_EXECUTE_IMPACT_REF);
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
  const pt = createPneumaTablesTable(app_id);
  const ptc = createPneumaTableColumnsTable(app_id);
  const pv = createPneumaViewsTable(app_id);
  const ppr = createPneumaPolicyRulesTable(app_id);
  void tables.save(bookmarks);
  void tables.save(pt);
  void tables.save(ptc);
  void tables.save(pv);
  void tables.save(ppr);
  const storage = new StorageService(tables, rows);
  const history: AppHistoryStore = new BunSqliteAppHistoryStore(historyDb);
  const handler = createAddTableColumnHandler();
  return { handler, storage, history, rowDb, historyDb, bookmarks };
}

describe("createAddTableHandler", () => {
  test("happy path: writes row + appends snapshot history entry + returns entry_id/version", async () => {
    const { storage, history } = bootHandlerTestBed("app-table-a");
    const handler = createAddTableHandler();
    const result = (await handler({
      ctx: agentCtx("app-table-a"),
      input: {
        table_id: "notes",
        columns: [{ name: "title", type: { kind: "primitive", of: "Text" } }],
      },
      storage,
      services: { history },
    })) as { entry_id: string; definition_version: number };
    expect(result.entry_id).toMatch(/^pt-/);
    expect(result.definition_version).toBe(1);

    const rows = await storage.listRowsByTable(PNEUMA_TABLES_TABLE_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.getCell("table_id")).toBe("notes");

    const entries = await history.listEntries("app-table-a", { direction: "desc", limit: 1 });
    const latest = entries[0]!;
    expect(latest.actor_kind).toBe("agent");
    expect(latest.operation_scope).toContain("table:notes");
    expect(latest.operation_scope).toContain("operation:add_table");
    const payload = latest.payload as {
      kind: string;
      pneuma_tables: unknown[];
      pneuma_table_columns: unknown[];
    };
    expect(payload.kind).toBe("definition_overlay_snapshot");
    expect(payload.pneuma_tables).toHaveLength(1);
    expect(payload.pneuma_table_columns).toHaveLength(0);
  });

  test("rejects duplicate table id", async () => {
    const { storage, history } = bootHandlerTestBed("app-table-b");
    const handler = createAddTableHandler();
    await expect(
      handler({
        ctx: agentCtx("app-table-b"),
        input: { table_id: "bookmarks", columns: [] },
        storage,
        services: { history },
      }),
    ).rejects.toThrow(/already exists/i);
  });

  test("rejects invalid columns", async () => {
    const { storage, history } = bootHandlerTestBed("app-table-c");
    const handler = createAddTableHandler();
    await expect(
      handler({
        ctx: agentCtx("app-table-c"),
        input: {
          table_id: "notes",
          columns: [{ name: "bad", type: { kind: "vector", dim: -1 } }],
        },
        storage,
        services: { history },
      }),
    ).rejects.toThrow(/valid Column/i);
  });
});

function agentCtx(app_id: string) {
  return buildRootContext({
    app_id,
    invoked_via: "agent",
    user: { id: "agent:builder-01", attrs: {}, roles: [] },
  });
}

function makeFrameworkCtx(app_id: string) {
  return buildRootContext({
    app_id,
    invoked_via: "system",
    user: { id: "framework", attrs: {}, roles: [] },
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
    const payload = latest!.payload as {
      kind: string;
      pneuma_tables: unknown[];
      pneuma_table_columns: unknown[];
    };
    expect(payload.kind).toBe("definition_overlay_snapshot");
    expect(payload.pneuma_tables).toHaveLength(0);
    expect(payload.pneuma_table_columns).toHaveLength(1);
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

function listBookmarksOperation(app_id: string, surface?: OperationSurfaceInit): Operation {
  return new Operation({
    id: "list_bookmarks",
    app_id,
    name: "List bookmarks",
    description: "List bookmark rows",
    input: { type: "record", fields: {} },
    output: { kind: "row-list", row_type: "bookmarks" },
    affects: { mutations: [], adapter_writes: [], reads_only: true, destructive: false },
    handler: {
      kind: "query",
      on: "bookmarks",
      pagination: { kind: "offset", size: 10 },
    },
    surface,
  });
}

describe("createAddViewHandler", () => {
  test("happy path: writes row + appends snapshot history entry + returns entry_id/version", async () => {
    const app_id = "app-view-a";
    const { storage, history } = bootHandlerTestBed(app_id);
    const sourceOperation = listBookmarksOperation(app_id);
    const handler = createAddViewHandler();
    const result = (await handler({
      ctx: agentCtx(app_id),
      input: {
        view_id: "review_queue",
        name: "Review Queue",
        view_kind: "table",
        source: { kind: "operation", operation_id: "list_bookmarks" },
        presentation: { columns: ["url"] },
      },
      storage,
      services: {
        history,
        operations: {
          get: (id: string) => id === sourceOperation.id ? sourceOperation : undefined,
          list: () => [sourceOperation],
        },
        views: {
          get: () => undefined,
          list: () => [],
        },
      },
    })) as { entry_id: string; definition_version: number; view_id: string };

    expect(result.entry_id).toMatch(/^pv-/);
    expect(result.definition_version).toBe(1);
    expect(result.view_id).toBe("review_queue");

    const rows = await storage.listRowsByTable(PNEUMA_VIEWS_TABLE_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.getCell("view_id")).toBe("review_queue");
    expect(rows[0]!.getCell("presentation")).toEqual({
      columns: [{ field: "url" }],
    });

    const entries = await history.listEntries(app_id, { direction: "desc", limit: 1 });
    const latest = entries[0]!;
    expect(latest.actor_kind).toBe("agent");
    expect(latest.operation_scope).toContain("view:review_queue");
    expect(latest.operation_scope).toContain("operation:add_view");
    const payload = latest.payload as {
      kind: string;
      pneuma_views: unknown[];
    };
    expect(payload.kind).toBe("definition_overlay_snapshot");
    expect(payload.pneuma_views).toHaveLength(1);
  });

  test("rejects missing source Operation", async () => {
    const app_id = "app-view-b";
    const { storage, history } = bootHandlerTestBed(app_id);
    const handler = createAddViewHandler();
    await expect(
      handler({
        ctx: agentCtx(app_id),
        input: {
          view_id: "review_queue",
          view_kind: "table",
          source: { kind: "operation", operation_id: "missing" },
        },
        storage,
        services: {
          history,
          operations: {
            get: () => undefined,
            list: () => [],
          },
          views: {
            get: () => undefined,
            list: () => [],
          },
        },
      }),
    ).rejects.toThrow(/source operation "missing" not found/);
  });

  test("rejects framework-owned source Operation", async () => {
    const app_id = "app-view-c";
    const { storage, history } = bootHandlerTestBed(app_id);
    const sourceOperation = createDefinitionRollbackValidateOp(app_id);
    const handler = createAddViewHandler();
    await expect(
      handler({
        ctx: agentCtx(app_id),
        input: {
          view_id: "rollback_inspector",
          view_kind: "table",
          source: { kind: "operation", operation_id: DEFINITION_ROLLBACK_VALIDATE_OP_ID },
        },
        storage,
        services: {
          history,
          operations: {
            get: (id: string) => id === sourceOperation.id ? sourceOperation : undefined,
            list: () => [sourceOperation],
          },
          views: {
            get: () => undefined,
            list: () => [],
          },
        },
      }),
    ).rejects.toThrow(/framework-internal/);
  });

  test("rejects non-view-mountable source Operation", async () => {
    const app_id = "app-view-d";
    const { storage, history } = bootHandlerTestBed(app_id);
    const sourceOperation = listBookmarksOperation(app_id, { view_mountable: false });
    const handler = createAddViewHandler();
    await expect(
      handler({
        ctx: agentCtx(app_id),
        input: {
          view_id: "review_queue",
          view_kind: "table",
          source: { kind: "operation", operation_id: "list_bookmarks" },
        },
        storage,
        services: {
          history,
          operations: {
            get: (id: string) => id === sourceOperation.id ? sourceOperation : undefined,
            list: () => [sourceOperation],
          },
          views: {
            get: () => undefined,
            list: () => [],
          },
        },
      }),
    ).rejects.toThrow(/not view_mountable/);
  });
});

describe("createAddPolicyRuleHandler", () => {
  test("happy path: writes row + appends snapshot history entry + returns entry_id/version", async () => {
    const app_id = "app-policy-a";
    const { storage, history } = bootHandlerTestBed(app_id);
    const handler = createAddPolicyRuleHandler();
    const result = (await handler({
      ctx: agentCtx(app_id),
      input: {
        rule_id: "reviewers-can-read-review-queue",
        allow: [Subjects.role("reviewer")],
        actions: ["read"],
        resource: Resources.view("review_queue"),
      },
      storage,
      services: { history },
    })) as { entry_id: string; definition_version: number; rule_id: string };

    expect(result.entry_id).toMatch(/^ppr-/);
    expect(result.definition_version).toBe(1);
    expect(result.rule_id).toBe("reviewers-can-read-review-queue");

    const rows = await storage.listRowsByTable(PNEUMA_POLICY_RULES_TABLE_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.getCell("rule_id")).toBe("reviewers-can-read-review-queue");

    const entries = await history.listEntries(app_id, { direction: "desc", limit: 1 });
    const latest = entries[0]!;
    expect(latest.actor_kind).toBe("agent");
    expect(latest.operation_scope).toContain("policy_rule:reviewers-can-read-review-queue");
    expect(latest.operation_scope).toContain("operation:add_policy_rule");
    const payload = latest.payload as {
      kind: string;
      pneuma_policy_rules: unknown[];
    };
    expect(payload.kind).toBe("definition_overlay_snapshot");
    expect(payload.pneuma_policy_rules).toHaveLength(1);
  });

  test("rejects invalid PolicyRule shapes", async () => {
    const app_id = "app-policy-b";
    const { storage, history } = bootHandlerTestBed(app_id);
    const handler = createAddPolicyRuleHandler();
    await expect(
      handler({
        ctx: agentCtx(app_id),
        input: {
          rule_id: "bad-rule",
          allow: [Subjects.role("reviewer")],
          actions: ["ship-it"],
          resource: Resources.view("review_queue"),
        },
        storage,
        services: { history },
      }),
    ).rejects.toThrow(/invalid policy rule/i);
  });
});

describe("createUpdatePolicyRuleHandler", () => {
  test("updates an existing policy rule row, preserves row id, appends history, and returns changed fields", async () => {
    const app_id = "app-policy-update-a";
    const { storage, history } = bootHandlerTestBed(app_id);
    await createAddPolicyRuleHandler()({
      ctx: agentCtx(app_id),
      input: {
        rule_id: "reviewers-can-read-review-queue",
        allow: [Subjects.role("reviewer")],
        actions: ["read"],
        resource: Resources.view("review_queue"),
      },
      storage,
      services: { history },
    });
    const beforeRows = await storage.listRowsByTable(PNEUMA_POLICY_RULES_TABLE_ID);
    const beforeRowId = beforeRows[0]!.id;

    const result = (await createUpdatePolicyRuleHandler()({
      ctx: agentCtx(app_id),
      input: {
        rule_id: "reviewers-can-read-review-queue",
        allow: [Subjects.user("bob")],
        actions: ["invoke"],
        resource: Resources.operation("review_queue"),
      },
      storage,
      services: { history },
    })) as {
      rule_id: string;
      updated: true;
      previous_definition_version: number;
      definition_version: number;
      changed_fields: string[];
    };

    expect(result).toEqual({
      rule_id: "reviewers-can-read-review-queue",
      updated: true,
      previous_definition_version: 1,
      definition_version: 2,
      changed_fields: ["allow", "actions", "resource"],
    });

    const rows = await storage.listRowsByTable(PNEUMA_POLICY_RULES_TABLE_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(beforeRowId);
    expect(rows[0]!.getCell("allow")).toEqual([Subjects.user("bob")]);
    expect(rows[0]!.getCell("actions")).toEqual(["invoke"]);
    expect(rows[0]!.getCell("resource")).toEqual(Resources.operation("review_queue"));
    expect(rows[0]!.getCell("definition_version")).toBe(2);

    const entries = await history.listEntries(app_id, { direction: "desc", limit: 1 });
    const latest = entries[0]!;
    expect(latest.description).toBe("Updated policy rule 'reviewers-can-read-review-queue'");
    expect(latest.operation_scope).toContain("policy_rule:reviewers-can-read-review-queue");
    expect(latest.operation_scope).toContain("operation:update_policy_rule");
    const payload = latest.payload as {
      kind: string;
      pneuma_policy_rules: unknown[];
    };
    expect(payload.kind).toBe("definition_overlay_snapshot");
    expect(payload.pneuma_policy_rules).toHaveLength(1);
  });

  test("rejects invalid updates without mutating the stored policy rule row", async () => {
    const app_id = "app-policy-update-b";
    const { storage, history } = bootHandlerTestBed(app_id);
    await createAddPolicyRuleHandler()({
      ctx: agentCtx(app_id),
      input: {
        rule_id: "reviewers-can-read-review-queue",
        allow: [Subjects.role("reviewer")],
        actions: ["read"],
        resource: Resources.view("review_queue"),
      },
      storage,
      services: { history },
    });
    const beforeRows = await storage.listRowsByTable(PNEUMA_POLICY_RULES_TABLE_ID);

    await expect(
      createUpdatePolicyRuleHandler()({
        ctx: agentCtx(app_id),
        input: {
          rule_id: "reviewers-can-read-review-queue",
          allow: [],
        },
        storage,
        services: { history },
      }),
    ).rejects.toThrow(/invalid policy rule/i);

    const afterRows = await storage.listRowsByTable(PNEUMA_POLICY_RULES_TABLE_ID);
    expect(afterRows).toEqual(beforeRows);
  });
});

describe("createDeletePolicyRuleHandler", () => {
  test("deletes an existing policy rule row and appends history", async () => {
    const app_id = "app-policy-delete-a";
    const { storage, history } = bootHandlerTestBed(app_id);
    await createAddPolicyRuleHandler()({
      ctx: agentCtx(app_id),
      input: {
        rule_id: "reviewers-can-read-review-queue",
        allow: [Subjects.role("reviewer")],
        actions: ["read"],
        resource: Resources.view("review_queue"),
      },
      storage,
      services: { history },
    });

    const result = (await createDeletePolicyRuleHandler()({
      ctx: agentCtx(app_id),
      input: { rule_id: "reviewers-can-read-review-queue" },
      storage,
      services: { history },
    })) as {
      rule_id: string;
      deleted: true;
      previous_definition_version: number;
      definition_version: number;
    };

    expect(result).toEqual({
      rule_id: "reviewers-can-read-review-queue",
      deleted: true,
      previous_definition_version: 1,
      definition_version: 2,
    });
    expect(await storage.listRowsByTable(PNEUMA_POLICY_RULES_TABLE_ID)).toHaveLength(0);

    const entries = await history.listEntries(app_id, { direction: "desc", limit: 1 });
    const latest = entries[0]!;
    expect(latest.description).toBe("Deleted policy rule 'reviewers-can-read-review-queue'");
    expect(latest.operation_scope).toContain("policy_rule:reviewers-can-read-review-queue");
    expect(latest.operation_scope).toContain("operation:delete_policy_rule");
    const payload = latest.payload as {
      kind: string;
      pneuma_policy_rules: unknown[];
    };
    expect(payload.kind).toBe("definition_overlay_snapshot");
    expect(payload.pneuma_policy_rules).toHaveLength(0);
  });

  test("rejects deleting a missing policy rule", async () => {
    const app_id = "app-policy-delete-b";
    const { storage, history } = bootHandlerTestBed(app_id);

    await expect(
      createDeletePolicyRuleHandler()({
        ctx: agentCtx(app_id),
        input: { rule_id: "missing" },
        storage,
        services: { history },
      }),
    ).rejects.toThrow(/rule "missing" not found/i);
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
  test("merges pneuma_tables Table into config.tables", () => {
    const merged = applyFrameworkInjections(baseConfig("app-merge-0"));
    const ids = merged.tables.map((t) => t.id);
    expect(ids).toContain("pneuma_tables");
  });

  test("merges pneuma_table_columns Table into config.tables", () => {
    const merged = applyFrameworkInjections(baseConfig("app-merge-1"));
    const ids = merged.tables.map((t) => t.id);
    expect(ids).toContain("pneuma_table_columns");
  });

  test("merges pneuma_operations Table into config.tables", () => {
    const merged = applyFrameworkInjections(baseConfig("app-merge-ops-table"));
    const ids = merged.tables.map((t) => t.id);
    expect(ids).toContain(PNEUMA_OPERATIONS_TABLE_ID);
  });

  test("merges pneuma_views Table into config.tables", () => {
    const merged = applyFrameworkInjections(baseConfig("app-merge-views-table"));
    const ids = merged.tables.map((t) => t.id);
    expect(ids).toContain(PNEUMA_VIEWS_TABLE_ID);
  });

  test("merges pneuma_policy_rules Table into config.tables", () => {
    const merged = applyFrameworkInjections(baseConfig("app-merge-policy-table"));
    const ids = merged.tables.map((t) => t.id);
    expect(ids).toContain(PNEUMA_POLICY_RULES_TABLE_ID);
  });

  test("merges pneuma_policy_settings Table into config.tables", () => {
    const merged = applyFrameworkInjections(baseConfig("app-merge-policy-settings-table"));
    const ids = merged.tables.map((t) => t.id);
    expect(ids).toContain(PNEUMA_POLICY_SETTINGS_TABLE_ID);
  });

  test("merges add_table_column Operation into config.operations", () => {
    const merged = applyFrameworkInjections(baseConfig("app-merge-2"));
    const ids = merged.operations.map((o) => o.id);
    expect(ids).toContain(ADD_TABLE_OP_ID);
    expect(ids).toContain(ADD_TABLE_COLUMN_OP_ID);
    expect(ids).toContain(ADD_OPERATION_OP_ID);
    expect(ids).toContain(ADD_VIEW_OP_ID);
    expect(ids).toContain(ADD_POLICY_RULE_OP_ID);
    expect(ids).toContain(UPDATE_POLICY_RULE_OP_ID);
    expect(ids).toContain(DELETE_POLICY_RULE_OP_ID);
    expect(ids).toContain(POLICY_EXPLAIN_OP_ID);
    expect(ids).toContain(SET_DEFAULT_POSTURE_OP_ID);
    expect(ids).toContain(DEFINITION_ROLLBACK_VALIDATE_OP_ID);
    expect(ids).toContain(DEFINITION_ROLLBACK_EXECUTE_OP_ID);
  });

  test("framework Operations are implementation-only and not public View sources", () => {
    const merged = applyFrameworkInjections(baseConfig("app-merge-surface"));
    for (const op of merged.operations) {
      expect(op.surface).toMatchObject({
        agent_callable: false,
        public_surface: false,
        view_mountable: false,
        framework_internal: true,
      });
    }
  });

  test("merges add_table_column handler into config.handlers", () => {
    const merged = applyFrameworkInjections(baseConfig("app-merge-3"));
    expect(merged.handlers["framework://add_table"]).toBeTypeOf("function");
    expect(merged.handlers["framework://add_table_column"]).toBeTypeOf("function");
    expect(merged.handlers["framework://add_operation"]).toBeTypeOf("function");
    expect(merged.handlers["framework://add_view"]).toBeTypeOf("function");
    expect(merged.handlers["framework://add_policy_rule"]).toBeTypeOf("function");
    expect(merged.handlers["framework://update_policy_rule"]).toBeTypeOf("function");
    expect(merged.handlers["framework://delete_policy_rule"]).toBeTypeOf("function");
    expect(merged.handlers["framework://policy.explain"]).toBeTypeOf("function");
    expect(merged.handlers["framework://set_default_posture"]).toBeTypeOf("function");
    expect(merged.handlers["framework://definition.rollback.validate"]).toBeTypeOf("function");
    expect(merged.handlers["framework://definition.rollback.execute"]).toBeTypeOf("function");
    expect(merged.impacts?.["framework://definition.rollback.execute.impact"]).toBeTypeOf("function");
  });

  test("merges framework-only policy rules for framework Operations into config.policy", () => {
    const merged = applyFrameworkInjections(baseConfig("app-merge-4"));
    const frameworkOpIds = [
      ADD_TABLE_OP_ID,
      ADD_TABLE_COLUMN_OP_ID,
      ADD_OPERATION_OP_ID,
      ADD_VIEW_OP_ID,
      ADD_POLICY_RULE_OP_ID,
      UPDATE_POLICY_RULE_OP_ID,
      DELETE_POLICY_RULE_OP_ID,
      POLICY_EXPLAIN_OP_ID,
      SET_DEFAULT_POSTURE_OP_ID,
      DEFINITION_ROLLBACK_VALIDATE_OP_ID,
      DEFINITION_ROLLBACK_EXECUTE_OP_ID,
    ];

    for (const opId of frameworkOpIds) {
      const rule = merged.policy.rules.find((r) => r.on.kind === "operation" && r.on.id === opId);
      expect(rule).toBeDefined();
      expect(rule!.allow).toEqual([Subjects.user("framework")]);
    }
  });

  test("overrides caller policy rules that target framework Operations", () => {
    const policy = new PolicySet({ app_id: "app-merge-framework-policy-override" });
    policy.addRule({
      id: "caller-allow-anyone-framework-op",
      allow: [Subjects.anyone(), Subjects.anonymous()],
      do: ["invoke"],
      on: Resources.operation(ADD_TABLE_COLUMN_OP_ID),
    });
    policy.addRule({
      id: "caller-normal-app-rule",
      allow: [Subjects.anyone()],
      do: ["invoke"],
      on: Resources.operation("list_bookmarks"),
    });

    const merged = applyFrameworkInjections({
      ...baseConfig("app-merge-framework-policy-override"),
      policy,
    });

    const frameworkRules = merged.policy.rules.filter(
      (r) => r.on.kind === "operation" && r.on.id === ADD_TABLE_COLUMN_OP_ID,
    );
    expect(frameworkRules).toHaveLength(1);
    expect(frameworkRules[0]!.id).toBe(`framework-allow-${ADD_TABLE_COLUMN_OP_ID}`);
    expect(frameworkRules[0]!.allow).toEqual([Subjects.user("framework")]);
    expect(merged.policy.rules.some((r) => r.id === "caller-allow-anyone-framework-op")).toBe(false);
    expect(merged.policy.rules.some((r) => r.id === "caller-normal-app-rule")).toBe(true);
  });

  test("does not double-inject if already present (idempotent)", () => {
    const once = applyFrameworkInjections(baseConfig("app-merge-5"));
    const twice = applyFrameworkInjections(once);
    const tableIds = twice.tables.map((t) => t.id);
    expect(tableIds.filter((id) => id === "pneuma_tables")).toHaveLength(1);
    expect(tableIds.filter((id) => id === "pneuma_table_columns")).toHaveLength(1);
    expect(tableIds.filter((id) => id === PNEUMA_OPERATIONS_TABLE_ID)).toHaveLength(1);
    expect(tableIds.filter((id) => id === PNEUMA_VIEWS_TABLE_ID)).toHaveLength(1);
    expect(tableIds.filter((id) => id === PNEUMA_POLICY_RULES_TABLE_ID)).toHaveLength(1);
    expect(tableIds.filter((id) => id === PNEUMA_POLICY_SETTINGS_TABLE_ID)).toHaveLength(1);
    const opIds = twice.operations.map((o) => o.id);
    expect(opIds.filter((id) => id === ADD_TABLE_OP_ID)).toHaveLength(1);
    expect(opIds.filter((id) => id === ADD_TABLE_COLUMN_OP_ID)).toHaveLength(1);
    expect(opIds.filter((id) => id === ADD_OPERATION_OP_ID)).toHaveLength(1);
    expect(opIds.filter((id) => id === ADD_VIEW_OP_ID)).toHaveLength(1);
    expect(opIds.filter((id) => id === ADD_POLICY_RULE_OP_ID)).toHaveLength(1);
    expect(opIds.filter((id) => id === UPDATE_POLICY_RULE_OP_ID)).toHaveLength(1);
    expect(opIds.filter((id) => id === DELETE_POLICY_RULE_OP_ID)).toHaveLength(1);
    expect(opIds.filter((id) => id === POLICY_EXPLAIN_OP_ID)).toHaveLength(1);
    expect(opIds.filter((id) => id === SET_DEFAULT_POSTURE_OP_ID)).toHaveLength(1);
    expect(opIds.filter((id) => id === DEFINITION_ROLLBACK_VALIDATE_OP_ID)).toHaveLength(1);
    expect(opIds.filter((id) => id === DEFINITION_ROLLBACK_EXECUTE_OP_ID)).toHaveLength(1);
  });

  test("throws if the caller already has a handler at the framework-reserved key", () => {
    const cfg = baseConfig("app-reserved-collision");
    (cfg.handlers as Record<string, HandlerFn>)[ADD_TABLE_COLUMN_HANDLER_REF] = (async () =>
      ({})) as never;
    expect(() => applyFrameworkInjections(cfg)).toThrow(/reserved/i);
  });

  test("does not mutate the caller's policy (clone semantics)", () => {
    const cfg = baseConfig("app-merge-clone");
    const rulesBefore = cfg.policy.rules.length;
    const merged = applyFrameworkInjections(cfg);
    // Caller's original policy is untouched
    expect(cfg.policy.rules.length).toBe(rulesBefore);
    expect(cfg.policy).not.toBe(merged.policy);
    // Merged policy carries the framework rule
    expect(
      merged.policy.rules.some(
        (r) => r.on.kind === "operation" && r.on.id === ADD_TABLE_COLUMN_OP_ID,
      ),
    ).toBe(true);
  });

  test("applying twice to the same base returns equivalent policies without duplicate rules", () => {
    const cfg = baseConfig("app-merge-clone-twice");
    const once = applyFrameworkInjections(cfg);
    const twice = applyFrameworkInjections(cfg);
    // Both merged configs have exactly one framework-allow rule for add_table_column
    const countFrameworkRule = (policy: typeof once.policy) =>
      policy.rules.filter(
        (r) => r.on.kind === "operation" && r.on.id === DEFINITION_ROLLBACK_VALIDATE_OP_ID,
      ).length;
    expect(countFrameworkRule(once.policy)).toBe(1);
    expect(countFrameworkRule(twice.policy)).toBe(1);
  });
});

describe("bootAppRuntime + framework injections", () => {
  test("booted runtime exposes pneuma_tables Table", async () => {
    const runtime = await bootAppRuntime(baseConfig("app-boot-0"));
    const t = await runtime.tables.get("pneuma_tables");
    expect(t).toBeDefined();
    expect(t!.system_owned).toBe(true);
    await runtime.close();
  });

  test("booted runtime exposes pneuma_table_columns Table", async () => {
    const runtime = await bootAppRuntime(baseConfig("app-boot-1"));
    const t = await runtime.tables.get("pneuma_table_columns");
    expect(t).toBeDefined();
    expect(t!.system_owned).toBe(true);
    await runtime.close();
  });

  test("booted runtime exposes pneuma_operations Table", async () => {
    const runtime = await bootAppRuntime(baseConfig("app-boot-ops"));
    const t = await runtime.tables.get(PNEUMA_OPERATIONS_TABLE_ID);
    expect(t).toBeDefined();
    expect(t!.system_owned).toBe(true);
    await runtime.close();
  });

  test("booted runtime exposes pneuma_views Table", async () => {
    const runtime = await bootAppRuntime(baseConfig("app-boot-views"));
    const t = await runtime.tables.get(PNEUMA_VIEWS_TABLE_ID);
    expect(t).toBeDefined();
    expect(t!.system_owned).toBe(true);
    await runtime.close();
  });

  test("booted runtime exposes pneuma_policy_rules Table", async () => {
    const runtime = await bootAppRuntime(baseConfig("app-boot-policy-rules"));
    const t = await runtime.tables.get(PNEUMA_POLICY_RULES_TABLE_ID);
    expect(t).toBeDefined();
    expect(t!.system_owned).toBe(true);
    await runtime.close();
  });

  test("booted runtime exposes pneuma_policy_settings Table", async () => {
    const runtime = await bootAppRuntime(baseConfig("app-boot-policy-settings"));
    const t = await runtime.tables.get(PNEUMA_POLICY_SETTINGS_TABLE_ID);
    expect(t).toBeDefined();
    expect(t!.system_owned).toBe(true);
    await runtime.close();
  });

  test("booted runtime lists add_table_column Operation via listOperations()", async () => {
    const runtime = await bootAppRuntime(baseConfig("app-boot-2"));
    const ids = runtime.listOperations().map((o) => o.id);
    expect(ids).toContain(ADD_TABLE_OP_ID);
    expect(ids).toContain(ADD_TABLE_COLUMN_OP_ID);
    expect(ids).toContain(ADD_OPERATION_OP_ID);
    expect(ids).toContain(ADD_VIEW_OP_ID);
    expect(ids).toContain(ADD_POLICY_RULE_OP_ID);
    expect(ids).toContain(UPDATE_POLICY_RULE_OP_ID);
    expect(ids).toContain(DELETE_POLICY_RULE_OP_ID);
    expect(ids).toContain(POLICY_EXPLAIN_OP_ID);
    expect(ids).toContain(SET_DEFAULT_POSTURE_OP_ID);
    expect(ids).toContain(DEFINITION_ROLLBACK_VALIDATE_OP_ID);
    expect(ids).toContain(DEFINITION_ROLLBACK_EXECUTE_OP_ID);
    await runtime.close();
  });

  test("invoking add_table via runtime.executor writes to pneuma_tables", async () => {
    const runtime = await bootAppRuntime(baseConfig("app-boot-table"));
    const op = runtime.getOperation(ADD_TABLE_OP_ID)!;
    const ctx = makeFrameworkCtx("app-boot-table");
    const result = await runtime.executor.invoke(
      op,
      { table_id: "notes", columns: [{ name: "title", type: { kind: "primitive", of: "Text" } }] },
      ctx,
    );
    const output = result.output as { entry_id: string; definition_version: number };
    expect(output.entry_id).toMatch(/^pt-/);
    expect(output.definition_version).toBe(1);
    const rows = await runtime.storage.listRowsByTable("pneuma_tables");
    expect(rows).toHaveLength(1);
    await runtime.close();
  });

  test("invoking add_table_column via runtime.executor actually writes to pneuma_table_columns", async () => {
    const base = baseConfig("app-boot-3");
    const extendedBase: AppConfig = {
      ...base,
      tables: [
        ...base.tables,
        new Table({
          id: "items",
          app_id: "app-boot-3",
          source: { kind: "stored" },
          columns: [{ name: "label", type: { kind: "primitive", of: "Text" } }],
        }),
      ],
    };
    const runtime = await bootAppRuntime(extendedBase);
    const op = runtime.getOperation(ADD_TABLE_COLUMN_OP_ID)!;
    const ctx = makeFrameworkCtx("app-boot-3");
    const result = await runtime.executor.invoke(
      op,
      { table_id: "items", column_name: "color", cell_type: { kind: "primitive", of: "Text" } },
      ctx,
    );
    const output = result.output as { entry_id: string; definition_version: number };
    expect(output.entry_id).toMatch(/^ptc-/);
    expect(output.definition_version).toBe(1);
    const rows = await runtime.storage.listRowsByTable("pneuma_table_columns");
    expect(rows).toHaveLength(1);
    await runtime.close();
  });

  test("invoking add_operation writes to pneuma_operations and becomes queryable after restart", async () => {
    const app_id = "app-boot-add-operation";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-add-operation-"));
    const base = baseConfig(app_id);
    const makeCfg = (): AppConfig => ({
      ...base,
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
      tables: [
        ...base.tables,
        new Table({
          id: "bookmarks",
          app_id,
          source: { kind: "stored" },
          columns: [{ name: "url", type: { kind: "primitive", of: "URL" } }],
        }),
      ],
    });
    const ctx = makeFrameworkCtx(app_id);

    let runtime = await bootAppRuntime(makeCfg());
    const result = await runtime.executor.invoke(
      runtime.getOperation(ADD_OPERATION_OP_ID)!,
      {
        operation_id: "list_bookmark_urls",
        name: "List bookmark URLs",
        handler: {
          kind: "query",
          on: "bookmarks",
          fields: ["url"],
          pagination: { kind: "offset", size: 10 },
        },
      },
      ctx,
    );
    expect(result.output).toMatchObject({
      operation_id: "list_bookmark_urls",
      definition_version: 1,
    });
    expect(await runtime.storage.listRowsByTable(PNEUMA_OPERATIONS_TABLE_ID)).toHaveLength(1);
    expect(runtime.getOperation("list_bookmark_urls")).toBeUndefined();
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    const op = runtime.getOperation("list_bookmark_urls");
    expect(op).toBeDefined();
    expect(op?.isQuery()).toBe(true);
    await runtime.close();
  });

  test("invoking add_view writes to pneuma_views and becomes visible after restart", async () => {
    const app_id = "app-boot-add-view";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-add-view-"));
    const base = baseConfig(app_id);
    const makeCfg = (): AppConfig => ({
      ...base,
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
      tables: [
        ...base.tables,
        new Table({
          id: "bookmarks",
          app_id,
          source: { kind: "stored" },
          columns: [{ name: "url", type: { kind: "primitive", of: "URL" } }],
        }),
      ],
      operations: [
        ...base.operations,
        listBookmarksOperation(app_id),
      ],
    });
    const ctx = makeFrameworkCtx(app_id);

    let runtime = await bootAppRuntime(makeCfg());
    const result = await runtime.executor.invoke(
      runtime.getOperation(ADD_VIEW_OP_ID)!,
      {
        view_id: "review_queue",
        name: "Review Queue",
        view_kind: "table",
        source: { kind: "operation", operation_id: "list_bookmarks" },
        presentation: { columns: ["url"] },
      },
      ctx,
    );
    expect(result.output).toMatchObject({
      view_id: "review_queue",
      definition_version: 1,
    });
    expect(await runtime.storage.listRowsByTable(PNEUMA_VIEWS_TABLE_ID)).toHaveLength(1);
    expect(runtime.getView("review_queue")).toBeUndefined();
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    const view = runtime.getView("review_queue");
    expect(view).toBeDefined();
    expect(view?.kind).toBe("table");
    expect(view?.source.operation_id).toBe("list_bookmarks");
    await runtime.close();
  });

  test("invoking add_policy_rule writes to pneuma_policy_rules and affects policy after restart", async () => {
    const app_id = "app-boot-add-policy-rule";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-add-policy-rule-"));
    const base = baseConfig(app_id);
    const makeCfg = (): AppConfig => ({
      ...base,
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
      policy: new PolicySet({ app_id, default_posture: { app: "restricted" } }),
    });
    const ctx = makeFrameworkCtx(app_id);

    let runtime = await bootAppRuntime(makeCfg());
    const result = await runtime.executor.invoke(
      runtime.getOperation(ADD_POLICY_RULE_OP_ID)!,
      {
        rule_id: "reviewers-can-read-review-queue",
        allow: [Subjects.role("reviewer")],
        actions: ["read"],
        resource: Resources.view("review_queue"),
      },
      ctx,
    );
    expect(result.output).toMatchObject({
      rule_id: "reviewers-can-read-review-queue",
      definition_version: 1,
    });
    expect(await runtime.storage.listRowsByTable(PNEUMA_POLICY_RULES_TABLE_ID)).toHaveLength(1);
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    const reviewer = buildRootContext({
      app_id,
      invoked_via: "ui",
      user: { id: "alice", attrs: {}, roles: ["reviewer"] },
    });
    const guest = buildRootContext({
      app_id,
      invoked_via: "ui",
      user: { id: "bob", attrs: {}, roles: [] },
    });
    expect(runtime.policyEvaluator.check("read", Resources.view("review_queue"), reviewer)).toMatchObject({
      decision: "allow",
      reason: "explicit-allow",
      matched_rule_ids: ["reviewers-can-read-review-queue"],
    });
    expect(runtime.policyEvaluator.check("read", Resources.view("review_queue"), guest)).toMatchObject({
      decision: "deny",
      reason: "default-restricted-no-match",
    });
    await runtime.close();
  });

  test("invoking add_policy_rule with effect=deny denies matching principals after restart", async () => {
    const app_id = "app-boot-add-deny-policy-rule";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-add-deny-policy-rule-"));
    const base = baseConfig(app_id);
    const makeCfg = (): AppConfig => ({
      ...base,
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
      policy: new PolicySet({ app_id, default_posture: { app: "restricted" } }),
    });
    const ctx = makeFrameworkCtx(app_id);

    let runtime = await bootAppRuntime(makeCfg());
    await runtime.executor.invoke(
      runtime.getOperation(ADD_POLICY_RULE_OP_ID)!,
      {
        rule_id: "reviewers-can-read-review-queue",
        allow: [Subjects.role("reviewer")],
        actions: ["read"],
        resource: Resources.view("review_queue"),
      },
      ctx,
    );
    await runtime.executor.invoke(
      runtime.getOperation(ADD_POLICY_RULE_OP_ID)!,
      {
        rule_id: "contractors-cannot-read-review-queue",
        effect: "deny",
        allow: [Subjects.role("contractor")],
        actions: ["read"],
        resource: Resources.view("review_queue"),
      },
      ctx,
    );
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    const principal = buildRootContext({
      app_id,
      invoked_via: "ui",
      user: { id: "casey", attrs: {}, roles: ["reviewer", "contractor"] },
    });
    expect(runtime.policyEvaluator.check("read", Resources.view("review_queue"), principal)).toEqual({
      decision: "deny",
      reason: "explicit-deny",
      matched_rule_ids: ["contractors-cannot-read-review-queue"],
    });
    await runtime.close();
  });

  test("invoking update_policy_rule updates pneuma_policy_rules and affects policy after restart", async () => {
    const app_id = "app-boot-update-policy-rule";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-update-policy-rule-"));
    const base = baseConfig(app_id);
    const makeCfg = (): AppConfig => ({
      ...base,
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
      policy: new PolicySet({ app_id, default_posture: { app: "restricted" } }),
    });
    const ctx = makeFrameworkCtx(app_id);

    let runtime = await bootAppRuntime(makeCfg());
    await runtime.executor.invoke(
      runtime.getOperation(ADD_POLICY_RULE_OP_ID)!,
      {
        rule_id: "reviewers-can-read-review-queue",
        allow: [Subjects.role("reviewer")],
        actions: ["read"],
        resource: Resources.view("review_queue"),
      },
      ctx,
    );
    const result = await runtime.executor.invoke(
      runtime.getOperation(UPDATE_POLICY_RULE_OP_ID)!,
      {
        rule_id: "reviewers-can-read-review-queue",
        allow: [Subjects.user("bob")],
      },
      ctx,
    );
    expect(result.output).toMatchObject({
      rule_id: "reviewers-can-read-review-queue",
      updated: true,
      changed_fields: ["allow"],
    });
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    const reviewer = buildRootContext({
      app_id,
      invoked_via: "ui",
      user: { id: "alice", attrs: {}, roles: ["reviewer"] },
    });
    const bob = buildRootContext({
      app_id,
      invoked_via: "ui",
      user: { id: "bob", attrs: {}, roles: [] },
    });
    expect(runtime.policyEvaluator.check("read", Resources.view("review_queue"), reviewer)).toMatchObject({
      decision: "deny",
      reason: "default-restricted-no-match",
    });
    expect(runtime.policyEvaluator.check("read", Resources.view("review_queue"), bob)).toMatchObject({
      decision: "allow",
      reason: "explicit-allow",
      matched_rule_ids: ["reviewers-can-read-review-queue"],
    });
    await runtime.close();
  });

  test("invoking update_policy_rule can change a rule effect", async () => {
    const app_id = "app-boot-update-policy-effect";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-update-policy-effect-"));
    const base = baseConfig(app_id);
    const makeCfg = (): AppConfig => ({
      ...base,
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
      policy: new PolicySet({ app_id, default_posture: { app: "restricted" } }),
    });
    const ctx = makeFrameworkCtx(app_id);

    let runtime = await bootAppRuntime(makeCfg());
    await runtime.executor.invoke(
      runtime.getOperation(ADD_POLICY_RULE_OP_ID)!,
      {
        rule_id: "bob-review-queue-access",
        allow: [Subjects.user("bob")],
        actions: ["read"],
        resource: Resources.view("review_queue"),
      },
      ctx,
    );
    const result = await runtime.executor.invoke(
      runtime.getOperation(UPDATE_POLICY_RULE_OP_ID)!,
      {
        rule_id: "bob-review-queue-access",
        effect: "deny",
      },
      ctx,
    );
    expect(result.output).toMatchObject({
      rule_id: "bob-review-queue-access",
      updated: true,
      changed_fields: ["effect"],
    });
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    const bob = buildRootContext({
      app_id,
      invoked_via: "ui",
      user: { id: "bob", attrs: {}, roles: [] },
    });
    expect(runtime.policyEvaluator.check("read", Resources.view("review_queue"), bob)).toMatchObject({
      decision: "deny",
      reason: "explicit-deny",
      matched_rule_ids: ["bob-review-queue-access"],
    });
    await runtime.close();
  });

  test("invoking delete_policy_rule removes pneuma_policy_rules and affects policy after restart", async () => {
    const app_id = "app-boot-delete-policy-rule";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-delete-policy-rule-"));
    const base = baseConfig(app_id);
    const makeCfg = (): AppConfig => ({
      ...base,
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
      policy: new PolicySet({ app_id, default_posture: { app: "restricted" } }),
    });
    const ctx = makeFrameworkCtx(app_id);

    let runtime = await bootAppRuntime(makeCfg());
    await runtime.executor.invoke(
      runtime.getOperation(ADD_POLICY_RULE_OP_ID)!,
      {
        rule_id: "reviewers-can-read-review-queue",
        allow: [Subjects.role("reviewer")],
        actions: ["read"],
        resource: Resources.view("review_queue"),
      },
      ctx,
    );
    const result = await runtime.executor.invoke(
      runtime.getOperation(DELETE_POLICY_RULE_OP_ID)!,
      { rule_id: "reviewers-can-read-review-queue" },
      ctx,
    );
    expect(result.output).toMatchObject({
      rule_id: "reviewers-can-read-review-queue",
      deleted: true,
    });
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    const reviewer = buildRootContext({
      app_id,
      invoked_via: "ui",
      user: { id: "alice", attrs: {}, roles: ["reviewer"] },
    });
    expect(runtime.policyEvaluator.check("read", Resources.view("review_queue"), reviewer)).toMatchObject({
      decision: "deny",
      reason: "default-restricted-no-match",
    });
    await runtime.close();
  });

  test("invoking policy.explain returns evaluator-backed policy reasoning", async () => {
    const app_id = "app-boot-policy-explain";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-policy-explain-"));
    const base = baseConfig(app_id);
    const makeCfg = (): AppConfig => ({
      ...base,
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
      policy: new PolicySet({ app_id, default_posture: { app: "restricted" } }),
    });
    const agent = makeFrameworkCtx(app_id);

    let runtime = await bootAppRuntime(makeCfg());
    await runtime.executor.invoke(
      runtime.getOperation(ADD_POLICY_RULE_OP_ID)!,
      {
        rule_id: "alice-can-read-review-queue",
        allow: [Subjects.user("alice")],
        actions: ["read"],
        resource: Resources.view("review_queue"),
      },
      agent,
    );
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    const output = (await runtime.executor.invoke(
      runtime.getOperation(POLICY_EXPLAIN_OP_ID)!,
      {
        principal: { kind: "end_user", id: "bob", roles: [] },
        action: "read",
        resource: Resources.view("review_queue"),
      },
      agent,
    )).output;

    expect(output).toEqual({
      decision: "deny",
      reason_code: "default-restricted-no-match",
      matched_rule_ids: [],
      default_posture: "restricted",
      principal: { kind: "end_user", id: "bob", roles: [] },
      action: "read",
      resource: Resources.view("review_queue"),
    });
    await runtime.close();
  });

  test("invoking set_default_posture persists setting and affects policy after restart", async () => {
    const app_id = "app-boot-set-default-posture";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-set-default-posture-"));
    const base = baseConfig(app_id);
    const makeCfg = (): AppConfig => ({
      ...base,
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
      policy: new PolicySet({ app_id, default_posture: { app: "public" } }),
    });
    const ctx = makeFrameworkCtx(app_id);

    let runtime = await bootAppRuntime(makeCfg());
    const result = await runtime.executor.invoke(
      runtime.getOperation(SET_DEFAULT_POSTURE_OP_ID)!,
      { app: "restricted" },
      ctx,
    );
    expect(result.output).toMatchObject({
      setting_id: "default_posture",
      previous_default_posture: { app: "public" },
      default_posture: { app: "restricted" },
      updated: true,
    });
    expect(await runtime.storage.listRowsByTable(PNEUMA_POLICY_SETTINGS_TABLE_ID)).toHaveLength(1);
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    const guest = buildRootContext({
      app_id,
      invoked_via: "ui",
      user: { id: "guest", attrs: {}, roles: [] },
    });
    expect(runtime.policyEvaluator.check("read", Resources.view("review_queue"), guest)).toMatchObject({
      decision: "deny",
      reason: "default-restricted-no-match",
    });
    await runtime.close();
  });

  test("boot skips manually written Views that mount framework-owned Operations", async () => {
    const app_id = "app-boot-view-framework-source";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-view-framework-source-"));
    const base = baseConfig(app_id);
    const makeCfg = (): AppConfig => ({
      ...base,
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
    });

    let runtime = await bootAppRuntime(makeCfg());
    await runtime.storage.saveRow(new Row({
      id: "pv-framework-source",
      app_id,
      table_id: PNEUMA_VIEWS_TABLE_ID,
      cells: {
        view_id: "rollback_inspector",
        name: "Rollback Inspector",
        description: "",
        kind: "table",
        source: { kind: "operation", operation_id: DEFINITION_ROLLBACK_VALIDATE_OP_ID },
        presentation: null,
        created_by: "agent:x",
        created_by_kind: "agent",
        definition_version: 1,
      },
    }));
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    expect(runtime.getView("rollback_inspector")).toBeUndefined();
    expect(runtime.overlayWarnings.some((warning) =>
      warning.code === "framework_view_operation"
      && warning.row_id === "pv-framework-source"
    )).toBe(true);
    await runtime.close();
  });

  test("invoking definition.rollback.validate computes impact without mutating overlay rows", async () => {
    const app_id = "app-rollback-validate";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-rollback-validate-"));
    const base = baseConfig(app_id);
    const cfg: AppConfig = {
      ...base,
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
      tables: [
        ...base.tables,
        new Table({
          id: "bookmarks",
          app_id,
          source: { kind: "stored" },
          columns: [{ name: "url", type: { kind: "primitive", of: "URL" } }],
        }),
      ],
    };
    const ctx = makeFrameworkCtx(app_id);

    let runtime = await bootAppRuntime(cfg);
    await runtime.executor.invoke(
      runtime.getOperation(ADD_TABLE_OP_ID)!,
      { table_id: "notes", columns: [{ name: "title", type: { kind: "primitive", of: "Text" } }] },
      ctx,
    );
    await runtime.executor.invoke(
      runtime.getOperation(ADD_TABLE_COLUMN_OP_ID)!,
      {
        table_id: "bookmarks",
        column_name: "tags",
        cell_type: { kind: "primitive", of: "Text" },
        nullable: true,
      },
      ctx,
    );
    await runtime.close();

    runtime = await bootAppRuntime(cfg);
    await runtime.storage.saveRow(new Row({
      id: "note-1",
      app_id,
      table_id: "notes",
      cells: { title: "First note" },
    }));
    await runtime.storage.saveRow(new Row({
      id: "bookmark-1",
      app_id,
      table_id: "bookmarks",
      cells: { url: "https://example.com", tags: "ai" },
    }));

    const validateOp = runtime.getOperation(DEFINITION_ROLLBACK_VALIDATE_OP_ID)!;
    const toV1 = (await runtime.executor.invoke(
      validateOp,
      { target_history_version: 1 },
      ctx,
    )).output as {
      current_history_version: number;
      destructive: boolean;
      requires_approval: boolean;
      impact: {
        removed_tables: Array<{ table_id: string; row_count: number; columns: string[] }>;
        removed_columns: Array<{ table_id: string; column_name: string; affected_row_count: number }>;
      };
      current_overlay: { pneuma_tables_count: number; pneuma_table_columns_count: number };
      target_overlay: { pneuma_tables_count: number; pneuma_table_columns_count: number };
    };

    expect(toV1.current_history_version).toBe(2);
    expect(toV1.destructive).toBe(true);
    expect(toV1.requires_approval).toBe(true);
    expect(toV1.current_overlay).toMatchObject({ pneuma_tables_count: 1, pneuma_table_columns_count: 1 });
    expect(toV1.target_overlay).toMatchObject({ pneuma_tables_count: 1, pneuma_table_columns_count: 0 });
    expect(toV1.impact.removed_tables).toEqual([]);
    expect(toV1.impact.removed_columns).toEqual([
      { table_id: "bookmarks", column_name: "tags", affected_row_count: 1 },
    ]);

    const toBaseline = (await runtime.executor.invoke(
      validateOp,
      { target_history_version: 0 },
      ctx,
    )).output as {
      warnings: string[];
      impact: {
        removed_tables: Array<{ table_id: string; row_count: number; columns: string[] }>;
        removed_columns: Array<{ table_id: string; column_name: string; affected_row_count: number }>;
      };
    };
    expect(toBaseline.warnings).toContain(
      "target_history_version=0 means the baseline before any definition overlay history entry",
    );
    expect(toBaseline.impact.removed_tables).toEqual([
      { table_id: "notes", row_count: 1, columns: ["title"] },
    ]);
    expect(toBaseline.impact.removed_columns).toEqual([
      { table_id: "bookmarks", column_name: "tags", affected_row_count: 1 },
    ]);

    // Validate mode is non-destructive: definition rows and user rows remain.
    expect(await runtime.storage.listRowsByTable(PNEUMA_TABLES_TABLE_ID)).toHaveLength(1);
    expect(await runtime.storage.listRowsByTable(PNEUMA_TABLE_COLUMNS_TABLE_ID)).toHaveLength(1);
    expect(await runtime.storage.listRowsByTable("notes")).toHaveLength(1);
    expect(await runtime.storage.listRowsByTable("bookmarks")).toHaveLength(1);
    await runtime.close();
  });

  test("definition.rollback.validate discloses operation-surface changes", async () => {
    const app_id = "app-rollback-validate-operation";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-rollback-validate-operation-"));
    const base = baseConfig(app_id);
    const makeCfg = (): AppConfig => ({
      ...base,
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
      tables: [
        ...base.tables,
        new Table({
          id: "bookmarks",
          app_id,
          source: { kind: "stored" },
          columns: [{ name: "url", type: { kind: "primitive", of: "URL" } }],
        }),
      ],
    });
    const agentCtx = makeFrameworkCtx(app_id);

    let runtime = await bootAppRuntime(makeCfg());
    await runtime.executor.invoke(
      runtime.getOperation(ADD_OPERATION_OP_ID)!,
      {
        operation_id: "list_bookmark_urls",
        name: "List bookmark URLs",
        handler: { kind: "query", on: "bookmarks", fields: ["url"] },
      },
      agentCtx,
    );
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    const validation = (await runtime.executor.invoke(
      runtime.getOperation(DEFINITION_ROLLBACK_VALIDATE_OP_ID)!,
      { target_history_version: 0 },
      agentCtx,
    )).output as {
      current_history_version: number;
      destructive: boolean;
      requires_approval: boolean;
      impact: {
        removed_operations: Array<{ operation_id: string; handler_kind: string }>;
        restored_operations: Array<{ operation_id: string; handler_kind: string }>;
      };
      current_overlay: { pneuma_operations_count: number };
      target_overlay: { pneuma_operations_count: number };
    };

    expect(validation.current_history_version).toBe(1);
    expect(validation.destructive).toBe(false);
    expect(validation.requires_approval).toBe(true);
    expect(validation.impact.removed_operations).toEqual([
      { operation_id: "list_bookmark_urls", handler_kind: "query" },
    ]);
    expect(validation.impact.restored_operations).toEqual([]);
    expect(validation.current_overlay.pneuma_operations_count).toBe(1);
    expect(validation.target_overlay.pneuma_operations_count).toBe(0);
    await runtime.close();
  });

  test("definition.rollback.execute removes an overlay Operation after backup and requires restart", async () => {
    const app_id = "app-rollback-execute-operation";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-rollback-execute-operation-"));
    const base = baseConfig(app_id);
    const makeCfg = (): AppConfig => ({
      ...base,
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
      tables: [
        ...base.tables,
        new Table({
          id: "bookmarks",
          app_id,
          source: { kind: "stored" },
          columns: [{ name: "url", type: { kind: "primitive", of: "URL" } }],
        }),
      ],
    });
    const agentCtx = makeFrameworkCtx(app_id);
    const frameworkCtx = buildRootContext({
      app_id,
      invoked_via: "system",
      user: { id: "framework", attrs: {}, roles: [] },
    });

    let runtime = await bootAppRuntime(makeCfg());
    await runtime.executor.invoke(
      runtime.getOperation(ADD_OPERATION_OP_ID)!,
      {
        operation_id: "list_bookmark_urls",
        name: "List bookmark URLs",
        handler: { kind: "query", on: "bookmarks", fields: ["url"] },
      },
      agentCtx,
    );
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    expect(runtime.getOperation("list_bookmark_urls")).toBeDefined();
    const output = (await runtime.executor.invoke(
      runtime.getOperation(DEFINITION_ROLLBACK_EXECUTE_OP_ID)!,
      { target_history_version: 0 },
      frameworkCtx,
      { confirmed: true },
    )).output as {
      status: string;
      deleted_rows: Array<{ table_id: string; row_ids: string[] }>;
      cleaned_columns: Array<{ table_id: string; column_name: string; row_ids: string[] }>;
      deleted_definition_rows: {
        pneuma_tables: string[];
        pneuma_table_columns: string[];
        pneuma_operations: string[];
      };
      impact: { removed_operations: Array<{ operation_id: string; handler_kind: string }> };
      restart_required: boolean;
    };

    expect(output.status).toBe("rolled_back");
    expect(output.deleted_rows).toEqual([]);
    expect(output.cleaned_columns).toEqual([]);
    expect(output.deleted_definition_rows.pneuma_tables).toEqual([]);
    expect(output.deleted_definition_rows.pneuma_table_columns).toEqual([]);
    expect(output.deleted_definition_rows.pneuma_operations).toHaveLength(1);
    expect(output.impact.removed_operations).toEqual([
      { operation_id: "list_bookmark_urls", handler_kind: "query" },
    ]);
    expect(output.restart_required).toBe(true);
    expect(await runtime.storage.listRowsByTable(PNEUMA_OPERATIONS_TABLE_ID)).toHaveLength(0);
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    expect(runtime.getOperation("list_bookmark_urls")).toBeUndefined();
    await runtime.close();
  });

  test("definition.rollback.execute removes an overlay PolicyRule after backup and requires restart", async () => {
    const app_id = "app-rollback-execute-policy-rule";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-rollback-execute-policy-rule-"));
    const makeCfg = (): AppConfig => ({
      ...baseConfig(app_id),
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
      policy: new PolicySet({ app_id, default_posture: { app: "restricted" } }),
    });
    const agentCtx = makeFrameworkCtx(app_id);
    const frameworkCtx = buildRootContext({
      app_id,
      invoked_via: "system",
      user: { id: "framework", attrs: {}, roles: [] },
    });

    let runtime = await bootAppRuntime(makeCfg());
    await runtime.executor.invoke(
      runtime.getOperation(ADD_POLICY_RULE_OP_ID)!,
      {
        rule_id: "reviewers-can-read-review-queue",
        allow: [Subjects.role("reviewer")],
        actions: ["read"],
        resource: Resources.view("review_queue"),
      },
      agentCtx,
    );
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    const validation = (await runtime.executor.invoke(
      runtime.getOperation(DEFINITION_ROLLBACK_VALIDATE_OP_ID)!,
      { target_history_version: 0 },
      agentCtx,
    )).output as {
      destructive: boolean;
      requires_approval: boolean;
      impact: {
        removed_policy_rules: Array<{ rule_id: string; resource: unknown }>;
      };
      current_overlay: { pneuma_policy_rules_count: number };
      target_overlay: { pneuma_policy_rules_count: number };
    };
    expect(validation.destructive).toBe(false);
    expect(validation.requires_approval).toBe(true);
    expect(validation.impact.removed_policy_rules).toEqual([
      { rule_id: "reviewers-can-read-review-queue", resource: Resources.view("review_queue") },
    ]);
    expect(validation.current_overlay.pneuma_policy_rules_count).toBe(1);
    expect(validation.target_overlay.pneuma_policy_rules_count).toBe(0);

    const output = (await runtime.executor.invoke(
      runtime.getOperation(DEFINITION_ROLLBACK_EXECUTE_OP_ID)!,
      { target_history_version: 0 },
      frameworkCtx,
      { confirmed: true },
    )).output as {
      status: string;
      deleted_definition_rows: { pneuma_policy_rules: string[] };
      impact: { removed_policy_rules: Array<{ rule_id: string; resource: unknown }> };
      restart_required: boolean;
    };
    expect(output.status).toBe("rolled_back");
    expect(output.deleted_definition_rows.pneuma_policy_rules).toHaveLength(1);
    expect(output.impact.removed_policy_rules).toEqual([
      { rule_id: "reviewers-can-read-review-queue", resource: Resources.view("review_queue") },
    ]);
    expect(output.restart_required).toBe(true);
    expect(await runtime.storage.listRowsByTable(PNEUMA_POLICY_RULES_TABLE_ID)).toHaveLength(0);
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    const reviewer = buildRootContext({
      app_id,
      invoked_via: "ui",
      user: { id: "alice", attrs: {}, roles: ["reviewer"] },
    });
    expect(runtime.policyEvaluator.check("read", Resources.view("review_queue"), reviewer)).toMatchObject({
      decision: "deny",
      reason: "default-restricted-no-match",
    });
    await runtime.close();
  });

  test("definition.rollback.execute restores an updated overlay PolicyRule after backup", async () => {
    const app_id = "app-rollback-execute-policy-rule-update";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-rollback-execute-policy-rule-update-"));
    const makeCfg = (): AppConfig => ({
      ...baseConfig(app_id),
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
      policy: new PolicySet({ app_id, default_posture: { app: "restricted" } }),
    });
    const agentCtx = makeFrameworkCtx(app_id);
    const frameworkCtx = buildRootContext({
      app_id,
      invoked_via: "system",
      user: { id: "framework", attrs: {}, roles: [] },
    });

    let runtime = await bootAppRuntime(makeCfg());
    await runtime.executor.invoke(
      runtime.getOperation(ADD_POLICY_RULE_OP_ID)!,
      {
        rule_id: "reviewers-can-read-review-queue",
        allow: [Subjects.role("reviewer")],
        actions: ["read"],
        resource: Resources.view("review_queue"),
      },
      agentCtx,
    );
    await runtime.executor.invoke(
      runtime.getOperation(UPDATE_POLICY_RULE_OP_ID)!,
      {
        rule_id: "reviewers-can-read-review-queue",
        allow: [Subjects.user("bob")],
      },
      agentCtx,
    );

    const output = (await runtime.executor.invoke(
      runtime.getOperation(DEFINITION_ROLLBACK_EXECUTE_OP_ID)!,
      { target_history_version: 1 },
      frameworkCtx,
      { confirmed: true },
    )).output as {
      status: string;
      impact: { updated_policy_rules: Array<{ rule_id: string; changed_fields: string[] }> };
      restart_required: boolean;
    };
    expect(output.status).toBe("rolled_back");
    expect(output.impact.updated_policy_rules).toEqual([
      { rule_id: "reviewers-can-read-review-queue", changed_fields: ["allow"] },
    ]);
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    const reviewer = buildRootContext({
      app_id,
      invoked_via: "ui",
      user: { id: "alice", attrs: {}, roles: ["reviewer"] },
    });
    const bob = buildRootContext({
      app_id,
      invoked_via: "ui",
      user: { id: "bob", attrs: {}, roles: [] },
    });
    expect(runtime.policyEvaluator.check("read", Resources.view("review_queue"), reviewer)).toMatchObject({
      decision: "allow",
      reason: "explicit-allow",
    });
    expect(runtime.policyEvaluator.check("read", Resources.view("review_queue"), bob)).toMatchObject({
      decision: "deny",
      reason: "default-restricted-no-match",
    });
    await runtime.close();
  });

  test("definition.rollback.execute restores a deleted overlay PolicyRule after backup", async () => {
    const app_id = "app-rollback-execute-policy-rule-restore";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-rollback-execute-policy-rule-restore-"));
    const makeCfg = (): AppConfig => ({
      ...baseConfig(app_id),
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
      policy: new PolicySet({ app_id, default_posture: { app: "restricted" } }),
    });
    const agentCtx = makeFrameworkCtx(app_id);
    const frameworkCtx = buildRootContext({
      app_id,
      invoked_via: "system",
      user: { id: "framework", attrs: {}, roles: [] },
    });

    let runtime = await bootAppRuntime(makeCfg());
    await runtime.executor.invoke(
      runtime.getOperation(ADD_POLICY_RULE_OP_ID)!,
      {
        rule_id: "reviewers-can-read-review-queue",
        allow: [Subjects.role("reviewer")],
        actions: ["read"],
        resource: Resources.view("review_queue"),
      },
      agentCtx,
    );
    await runtime.executor.invoke(
      runtime.getOperation(DELETE_POLICY_RULE_OP_ID)!,
      { rule_id: "reviewers-can-read-review-queue" },
      agentCtx,
    );

    const output = (await runtime.executor.invoke(
      runtime.getOperation(DEFINITION_ROLLBACK_EXECUTE_OP_ID)!,
      { target_history_version: 1 },
      frameworkCtx,
      { confirmed: true },
    )).output as {
      status: string;
      impact: { restored_policy_rules: Array<{ rule_id: string; resource: unknown }> };
      restart_required: boolean;
    };
    expect(output.status).toBe("rolled_back");
    expect(output.impact.restored_policy_rules).toEqual([
      { rule_id: "reviewers-can-read-review-queue", resource: Resources.view("review_queue") },
    ]);
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    const reviewer = buildRootContext({
      app_id,
      invoked_via: "ui",
      user: { id: "alice", attrs: {}, roles: ["reviewer"] },
    });
    expect(runtime.policyEvaluator.check("read", Resources.view("review_queue"), reviewer)).toMatchObject({
      decision: "allow",
      reason: "explicit-allow",
    });
    await runtime.close();
  });

  test("definition.rollback.execute restores an updated default posture setting after backup", async () => {
    const app_id = "app-rollback-execute-policy-setting-update";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-rollback-execute-policy-setting-update-"));
    const makeCfg = (): AppConfig => ({
      ...baseConfig(app_id),
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
      policy: new PolicySet({ app_id, default_posture: { app: "public" } }),
    });
    const agentCtx = makeFrameworkCtx(app_id);
    const frameworkCtx = buildRootContext({
      app_id,
      invoked_via: "system",
      user: { id: "framework", attrs: {}, roles: [] },
    });

    let runtime = await bootAppRuntime(makeCfg());
    await runtime.executor.invoke(runtime.getOperation(SET_DEFAULT_POSTURE_OP_ID)!, { app: "restricted" }, agentCtx);
    await runtime.executor.invoke(runtime.getOperation(SET_DEFAULT_POSTURE_OP_ID)!, { app: "public" }, agentCtx);

    const validation = (await runtime.executor.invoke(
      runtime.getOperation(DEFINITION_ROLLBACK_VALIDATE_OP_ID)!,
      { target_history_version: 1 },
      agentCtx,
    )).output as {
      impact: {
        updated_policy_settings: Array<{
          setting_id: string;
          current: unknown;
          target: unknown;
        }>;
      };
    };
    expect(validation.impact.updated_policy_settings).toEqual([{
      setting_id: "default_posture",
      current: { app: "public" },
      target: { app: "restricted" },
    }]);

    const output = (await runtime.executor.invoke(
      runtime.getOperation(DEFINITION_ROLLBACK_EXECUTE_OP_ID)!,
      { target_history_version: 1 },
      frameworkCtx,
      { confirmed: true },
    )).output as {
      status: string;
      impact: {
        updated_policy_settings: Array<{ setting_id: string; current: unknown; target: unknown }>;
      };
      restart_required: boolean;
    };
    expect(output.status).toBe("rolled_back");
    expect(output.impact.updated_policy_settings).toEqual(validation.impact.updated_policy_settings);
    expect(output.restart_required).toBe(true);
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    const guest = buildRootContext({
      app_id,
      invoked_via: "ui",
      user: { id: "guest", attrs: {}, roles: [] },
    });
    expect(runtime.policyEvaluator.check("read", Resources.view("review_queue"), guest)).toMatchObject({
      decision: "deny",
      reason: "default-restricted-no-match",
    });
    await runtime.close();
  });

  test("definition.rollback.execute removes a default posture setting absent at target history", async () => {
    const app_id = "app-rollback-execute-policy-setting-remove";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-rollback-execute-policy-setting-remove-"));
    const makeCfg = (): AppConfig => ({
      ...baseConfig(app_id),
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
      policy: new PolicySet({ app_id, default_posture: { app: "public" } }),
    });
    const agentCtx = makeFrameworkCtx(app_id);
    const frameworkCtx = buildRootContext({
      app_id,
      invoked_via: "system",
      user: { id: "framework", attrs: {}, roles: [] },
    });

    let runtime = await bootAppRuntime(makeCfg());
    await runtime.executor.invoke(runtime.getOperation(SET_DEFAULT_POSTURE_OP_ID)!, { app: "restricted" }, agentCtx);

    const output = (await runtime.executor.invoke(
      runtime.getOperation(DEFINITION_ROLLBACK_EXECUTE_OP_ID)!,
      { target_history_version: 0 },
      frameworkCtx,
      { confirmed: true },
    )).output as {
      status: string;
      deleted_definition_rows: { pneuma_policy_settings: string[] };
      impact: {
        removed_policy_settings: Array<{ setting_id: string; value: unknown }>;
      };
      restart_required: boolean;
    };
    expect(output.status).toBe("rolled_back");
    expect(output.deleted_definition_rows.pneuma_policy_settings).toHaveLength(1);
    expect(output.impact.removed_policy_settings).toEqual([{
      setting_id: "default_posture",
      value: { app: "restricted" },
    }]);
    expect(await runtime.storage.listRowsByTable(PNEUMA_POLICY_SETTINGS_TABLE_ID)).toHaveLength(0);
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    const guest = buildRootContext({
      app_id,
      invoked_via: "ui",
      user: { id: "guest", attrs: {}, roles: [] },
    });
    expect(runtime.policyEvaluator.check("read", Resources.view("review_queue"), guest)).toMatchObject({
      decision: "allow",
      reason: "default-public",
    });
    await runtime.close();
  });

  test("definition.rollback.execute restores a default posture setting deleted by rollback", async () => {
    const app_id = "app-rollback-execute-policy-setting-restore";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-rollback-execute-policy-setting-restore-"));
    const makeCfg = (): AppConfig => ({
      ...baseConfig(app_id),
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
      policy: new PolicySet({ app_id, default_posture: { app: "public" } }),
    });
    const agentCtx = makeFrameworkCtx(app_id);
    const frameworkCtx = buildRootContext({
      app_id,
      invoked_via: "system",
      user: { id: "framework", attrs: {}, roles: [] },
    });

    let runtime = await bootAppRuntime(makeCfg());
    await runtime.executor.invoke(runtime.getOperation(SET_DEFAULT_POSTURE_OP_ID)!, { app: "restricted" }, agentCtx);
    await runtime.executor.invoke(
      runtime.getOperation(DEFINITION_ROLLBACK_EXECUTE_OP_ID)!,
      { target_history_version: 0 },
      frameworkCtx,
      { confirmed: true },
    );

    const output = (await runtime.executor.invoke(
      runtime.getOperation(DEFINITION_ROLLBACK_EXECUTE_OP_ID)!,
      { target_history_version: 1 },
      frameworkCtx,
      { confirmed: true },
    )).output as {
      status: string;
      impact: {
        restored_policy_settings: Array<{ setting_id: string; value: unknown }>;
      };
      restart_required: boolean;
    };
    expect(output.status).toBe("rolled_back");
    expect(output.impact.restored_policy_settings).toEqual([{
      setting_id: "default_posture",
      value: { app: "restricted" },
    }]);
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    const guest = buildRootContext({
      app_id,
      invoked_via: "ui",
      user: { id: "guest", attrs: {}, roles: [] },
    });
    expect(runtime.policyEvaluator.check("read", Resources.view("review_queue"), guest)).toMatchObject({
      decision: "deny",
      reason: "default-restricted-no-match",
    });
    await runtime.close();
  });

  test("invoking definition.rollback.execute removes an overlay Table after backup and requires restart", async () => {
    const app_id = "app-rollback-execute-table";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-rollback-execute-table-"));
    const base = baseConfig(app_id);
    const cfg: AppConfig = {
      ...base,
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
    };
    const agentCtx = makeFrameworkCtx(app_id);
    const frameworkCtx = buildRootContext({
      app_id,
      invoked_via: "system",
      user: { id: "framework", attrs: {}, roles: [] },
    });

    let runtime = await bootAppRuntime(cfg);
    await runtime.executor.invoke(
      runtime.getOperation(ADD_TABLE_OP_ID)!,
      { table_id: "notes", columns: [{ name: "title", type: { kind: "primitive", of: "Text" } }] },
      agentCtx,
    );
    await runtime.close();

    runtime = await bootAppRuntime(cfg);
    await runtime.storage.saveRow(new Row({
      id: "note-1",
      app_id,
      table_id: "notes",
      cells: { title: "First note" },
    }));

    const executeOp = runtime.getOperation(DEFINITION_ROLLBACK_EXECUTE_OP_ID)!;
    const output = (await runtime.executor.invoke(
      executeOp,
      { target_history_version: 0 },
      frameworkCtx,
      { confirmed: true },
    )).output as {
      status: string;
      previous_history_version: number;
      backup_history_version: number;
      rollback_history_version: number;
      deleted_rows: Array<{ table_id: string; row_ids: string[] }>;
      deleted_definition_rows: { pneuma_tables: string[]; pneuma_table_columns: string[] };
      restart_required: boolean;
    };

    expect(output.status).toBe("rolled_back");
    expect(output.previous_history_version).toBe(1);
    expect(output.backup_history_version).toBe(2);
    expect(output.rollback_history_version).toBe(3);
    expect(output.deleted_rows).toEqual([{ table_id: "notes", row_ids: ["note-1"] }]);
    expect(output.deleted_definition_rows.pneuma_tables).toHaveLength(1);
    expect(output.deleted_definition_rows.pneuma_table_columns).toEqual([]);
    expect(output.restart_required).toBe(true);
    expect(await runtime.storage.listRowsByTable("notes")).toHaveLength(0);
    expect(await runtime.storage.listRowsByTable(PNEUMA_TABLES_TABLE_ID)).toHaveLength(0);

    const entries = await runtime.history.listEntries(app_id);
    expect(entries.map((entry) => (entry.payload as { kind?: string }).kind)).toEqual([
      "definition_overlay_snapshot",
      "definition_rollback_backup",
      "definition_overlay_snapshot",
    ]);
    const backup = entries[1]!.payload as { affected_rows: Array<{ table_id: string; rows: Array<{ id: string }> }> };
    expect(backup.affected_rows).toMatchObject([{ table_id: "notes", rows: [{ id: "note-1" }] }]);
    await runtime.close();

    runtime = await bootAppRuntime(cfg);
    expect(await runtime.storage.getTable("notes")).toBeUndefined();
    await runtime.close();
  });

  test("definition.rollback.execute removes an overlay column and clears affected cells before restart", async () => {
    const app_id = "app-rollback-execute-column-cleanup";
    const dir = mkdtempSync(join(tmpdir(), "pneuma-rollback-execute-column-"));
    const base = baseConfig(app_id);
    const makeCfg = (): AppConfig => ({
      ...base,
      storage: { sqlite_path: join(dir, "rows.sqlite") },
      history: { sqlite_path: join(dir, "history.sqlite") },
      tables: [
        ...base.tables,
        new Table({
          id: "bookmarks",
          app_id,
          source: { kind: "stored" },
          columns: [{ name: "url", type: { kind: "primitive", of: "URL" } }],
        }),
      ],
    });
    const agentCtx = makeFrameworkCtx(app_id);
    const frameworkCtx = buildRootContext({
      app_id,
      invoked_via: "system",
      user: { id: "framework", attrs: {}, roles: [] },
    });

    let runtime = await bootAppRuntime(makeCfg());
    await runtime.executor.invoke(
      runtime.getOperation(ADD_TABLE_COLUMN_OP_ID)!,
      {
        table_id: "bookmarks",
        column_name: "tags",
        cell_type: { kind: "primitive", of: "Text" },
        nullable: false,
      },
      agentCtx,
    );
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    await runtime.storage.saveRow(new Row({
      id: "bookmark-1",
      app_id,
      table_id: "bookmarks",
      cells: { url: "https://example.com", tags: "ai" },
    }));

    const output = (await runtime.executor.invoke(
      runtime.getOperation(DEFINITION_ROLLBACK_EXECUTE_OP_ID)!,
      { target_history_version: 0 },
      frameworkCtx,
      { confirmed: true },
    )).output as {
      status: string;
      previous_history_version: number;
      backup_history_version: number;
      rollback_history_version: number;
      deleted_rows: Array<{ table_id: string; row_ids: string[] }>;
      cleaned_columns: Array<{ table_id: string; column_name: string; row_ids: string[] }>;
      deleted_definition_rows: { pneuma_tables: string[]; pneuma_table_columns: string[] };
      restart_required: boolean;
    };

    expect(output.status).toBe("rolled_back");
    expect(output.previous_history_version).toBe(1);
    expect(output.backup_history_version).toBe(2);
    expect(output.rollback_history_version).toBe(3);
    expect(output.deleted_rows).toEqual([]);
    expect(output.cleaned_columns).toEqual([
      { table_id: "bookmarks", column_name: "tags", row_ids: ["bookmark-1"] },
    ]);
    expect(output.deleted_definition_rows.pneuma_tables).toEqual([]);
    expect(output.deleted_definition_rows.pneuma_table_columns).toHaveLength(1);
    expect(output.restart_required).toBe(true);
    expect(await runtime.storage.listRowsByTable(PNEUMA_TABLE_COLUMNS_TABLE_ID)).toHaveLength(0);
    const rows = await runtime.storage.listRowsByTable("bookmarks");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.getCell("tags")).toBeUndefined();
    expect(await runtime.history.latestVersion(app_id)).toBe(3);
    const entries = await runtime.history.listEntries(app_id);
    const backup = entries[1]!.payload as {
      affected_column_rows: Array<{ table_id: string; column_name: string; rows: Array<{ id: string }> }>;
    };
    expect(backup.affected_column_rows).toMatchObject([
      { table_id: "bookmarks", column_name: "tags", rows: [{ id: "bookmark-1" }] },
    ]);
    await runtime.close();

    runtime = await bootAppRuntime(makeCfg());
    expect((await runtime.storage.getTable("bookmarks"))?.columns.map((column) => column.name)).toEqual(["url"]);
    const rebootedRows = await runtime.storage.listRowsByTable("bookmarks");
    expect(rebootedRows).toHaveLength(1);
    expect(rebootedRows[0]!.getCell("tags")).toBeUndefined();
    await runtime.close();
  });
});
