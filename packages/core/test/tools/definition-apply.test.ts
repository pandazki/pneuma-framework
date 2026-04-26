import { test, expect } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { createToolRegistry } from "../../src/tools/registry.js";
import { registerActionTools } from "../../src/tools/action.js";

const TEMPLATE = join(import.meta.dir, "../fixtures/templates/fixture-api-config-happy");

function makeRestartCrashTemplate(): string {
  const dir = mkdtempSync(join(tmpdir(), "pneuma-def-apply-restart-template-"));
  const scripts = join(dir, "scripts");
  mkdirSync(scripts, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    name: "fixture-definition-apply-restart-crashes",
    version: "0.0.1",
    displayName: "Fixture Definition Apply Restart Crashes",
    description: "First dev run becomes ready; second dev run exits before ready.",
    backends: { supported: ["claude-code"] },
    runtimeAgent: "none",
    scripts: { dev: "scripts/dev.sh" },
  }, null, 2));
  const dev = join(scripts, "dev.sh");
  writeFileSync(dev, `#!/bin/sh
COUNT_FILE="$PNEUMA_WORKSPACE/.restart-count"
COUNT="$(cat "$COUNT_FILE" 2>/dev/null || echo 0)"
COUNT=$((COUNT + 1))
echo "$COUNT" > "$COUNT_FILE"
if [ "$COUNT" -ge 2 ]; then
  echo "restart crash" 1>&2
  exit 7
fi
trap 'echo "##pneuma:stopping"; exit 0' TERM INT
PORT="\${PNEUMA_PORT_HINT:-0}"
echo "##pneuma:service-ready app http://127.0.0.1:$PORT"
echo "##pneuma:ready"
while true; do sleep 0.1; done
`);
  chmodSync(dev, 0o755);
  return dir;
}

type Column = {
  readonly name: string;
  readonly type: unknown;
  readonly nullable: boolean;
  readonly schema: unknown;
};

type TableFixture = {
  readonly id: string;
  readonly source: unknown;
  readonly system_owned: boolean;
  readonly columns: readonly Column[];
};

type OperationFixture = {
  readonly id: string;
  readonly action: string;
  readonly resource: unknown;
  readonly input: unknown;
  readonly output: unknown;
  readonly affects: unknown;
  readonly handler_kind: "code" | "query";
  readonly surface?: {
    readonly agent_callable: boolean;
    readonly public_surface: boolean;
    readonly view_mountable: boolean;
    readonly framework_internal: boolean;
  };
};

type ViewFixture = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: "table" | "list" | "detail" | "custom";
  readonly source: unknown;
  readonly presentation?: unknown;
};

type DefinitionServerMode = "normal" | "operation-fails" | "no-schema-change";
type DefinitionServerScenario = DefinitionServerMode | "rollback-table-only" | "rollback-column" | "rollback-operation";

type DefinitionServerStats = {
  readonly postCount: number;
  readonly rollbackValidateCount: number;
  readonly rollbackExecuteCount: number;
  readonly columns: readonly Column[];
  readonly tables: readonly TableFixture[];
  readonly operations: readonly OperationFixture[];
  readonly views: readonly ViewFixture[];
};

function rowSchema(columns: readonly Column[]): Record<string, unknown> {
  return {
    type: "object",
    properties: Object.fromEntries(columns.map((c) => [c.name, c.schema])),
    required: columns.filter((c) => !c.nullable).map((c) => c.name),
    additionalProperties: false,
  };
}

function schemaForType(type: unknown): unknown {
  if (typeof type !== "object" || type === null || Array.isArray(type)) return {};
  const t = type as { kind?: unknown; of?: unknown };
  if (t.kind === "primitive" && t.of === "Number") return { type: "number" };
  if (t.kind === "primitive" && t.of === "Bool") return { type: "boolean" };
  if (t.kind === "json") return {};
  return { type: "string" };
}

function normalizeColumn(input: unknown): Column | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
  const c = input as { name?: unknown; type?: unknown; nullable?: unknown };
  if (typeof c.name !== "string" || c.name.length === 0) return undefined;
  if (typeof c.type !== "object" || c.type === null || Array.isArray(c.type)) return undefined;
  return {
    name: c.name,
    type: c.type,
    nullable: c.nullable === true,
    schema: schemaForType(c.type),
  };
}

function configBody(
  tables: readonly TableFixture[],
  operations: readonly OperationFixture[],
  views: readonly ViewFixture[],
): Record<string, unknown> {
  const frameworkSurface = {
    agent_callable: true,
    public_surface: false,
    view_mountable: false,
    framework_internal: true,
  };
  const defaultSurface = (op: OperationFixture) => ({
    agent_callable: true,
    public_surface: true,
    view_mountable: (op.affects as { reads_only?: unknown }).reads_only === true,
    framework_internal: false,
  });
  return {
    app_id: "definition-apply-test",
    operations: [
      {
        id: "add_table",
        action: "write",
        resource: { kind: "app_definition", component: "table" },
        input: {},
        output: {},
        affects: { reads_only: false, destructive: false, mutations: ["pneuma_tables"] },
        handler_kind: "code",
        surface: frameworkSurface,
      },
      {
        id: "add_table_column",
        action: "write",
        resource: { kind: "app_definition", component: "table_column" },
        input: {},
        output: {},
        affects: { reads_only: false, destructive: false, mutations: ["pneuma_table_columns"] },
        handler_kind: "code",
        surface: frameworkSurface,
      },
      {
        id: "add_operation",
        action: "write",
        resource: { kind: "app_definition", component: "operation" },
        input: {},
        output: {},
        affects: { reads_only: false, destructive: false, mutations: ["pneuma_operations"] },
        handler_kind: "code",
        surface: frameworkSurface,
      },
      {
        id: "add_view",
        action: "write",
        resource: { kind: "app_definition", component: "view" },
        input: {},
        output: {},
        affects: { reads_only: false, destructive: false, mutations: ["pneuma_views"] },
        handler_kind: "code",
        surface: frameworkSurface,
      },
      {
        id: "definition.rollback.validate",
        action: "read",
        resource: { kind: "app_definition", component: "rollback" },
        input: {},
        output: {},
        affects: { reads_only: true, destructive: false, mutations: [] },
        handler_kind: "code",
        surface: frameworkSurface,
      },
      {
        id: "definition.rollback.execute",
        action: "write",
        resource: { kind: "app_definition", component: "rollback" },
        input: {},
        output: {},
        affects: {
          reads_only: false,
          destructive: true,
          mutations: ["pneuma_tables", "pneuma_table_columns"],
        },
        handler_kind: "code",
        surface: frameworkSurface,
      },
      ...operations.map((op) => ({ ...op, surface: op.surface ?? defaultSurface(op) })),
    ],
    tables: tables.map((table) => ({
      id: table.id,
      source: table.source,
      system_owned: table.system_owned,
      columns: table.columns,
      row_schema: rowSchema(table.columns),
    })),
    views,
  };
}

async function withDefinitionServer(
  fn: (port: number, stats: DefinitionServerStats) => Promise<void>,
  mode: DefinitionServerScenario = "normal",
): Promise<void> {
  let tables: TableFixture[] = [
    {
      id: "bookmarks",
      source: { kind: "stored" },
      system_owned: false,
      columns: [
        {
          name: "url",
          type: { kind: "primitive", of: "URL" },
          nullable: false,
          schema: { type: "string" },
        },
      ],
    },
  ];
  let operations: OperationFixture[] = [];
  let views: ViewFixture[] = [];
  let postCount = 0;
  let rollbackValidateCount = 0;
  let rollbackExecuteCount = 0;
  const bookmarks = () => tables.find((t) => t.id === "bookmarks")!;
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "GET" && url.pathname === "/api/config") {
        return Response.json(configBody(tables, operations, views));
      }
      if (req.method === "POST" && url.pathname === "/api/operations/add_table") {
        postCount += 1;
        if (mode === "operation-fails") {
          return Response.json({ error: "boom" }, { status: 500 });
        }
        const body = await req.json().catch(() => undefined) as { input?: Record<string, unknown> } | undefined;
        const input = body?.input;
        if (typeof input?.table_id !== "string") {
          return Response.json({ error: "invalid_input" }, { status: 400 });
        }
        if (tables.some((t) => t.id === input.table_id)) {
          return Response.json({ error: "already_exists" }, { status: 409 });
        }
        if (!Array.isArray(input.columns)) {
          return Response.json({ error: "invalid_columns" }, { status: 400 });
        }
        const newColumns = input.columns.map(normalizeColumn);
        if (newColumns.some((c) => c === undefined)) {
          return Response.json({ error: "invalid_columns" }, { status: 400 });
        }
        if (mode !== "no-schema-change") {
          tables = [
            ...tables,
            {
              id: input.table_id,
              source: { kind: "stored" },
              system_owned: false,
              columns: newColumns as Column[],
            },
          ];
        }
        return Response.json({
          output: { entry_id: `pt-${input.table_id}`, definition_version: tables.length - 1 },
          events: [],
        });
      }
      if (req.method === "POST" && url.pathname === "/api/operations/add_table_column") {
        postCount += 1;
        if (mode === "operation-fails") {
          return Response.json({ error: "boom" }, { status: 500 });
        }
        const body = await req.json().catch(() => undefined) as { input?: Record<string, unknown> } | undefined;
        const input = body?.input;
        if (
          typeof input?.table_id !== "string"
          || typeof input.column_name !== "string"
          || typeof input.cell_type !== "object"
          || input.cell_type === null
        ) {
          return Response.json({ error: "invalid_input" }, { status: 400 });
        }
        if (input.table_id !== "bookmarks") {
          return Response.json({ error: "not_found" }, { status: 404 });
        }
        const current = bookmarks();
        if (mode !== "no-schema-change" && !current.columns.some((c) => c.name === input.column_name)) {
          const nextColumn = {
            name: input.column_name,
            type: input.cell_type,
            nullable: input.nullable === true,
            schema: schemaForType(input.cell_type),
          };
          tables = tables.map((table) =>
            table.id === "bookmarks"
              ? { ...table, columns: [...table.columns, nextColumn] }
              : table,
          );
        }
        return Response.json({
          output: { entry_id: "ptc-tags", definition_version: bookmarks().columns.length - 1 },
          events: [],
        });
      }
      if (req.method === "POST" && url.pathname === "/api/operations/add_operation") {
        postCount += 1;
        if (mode === "operation-fails") {
          return Response.json({ error: "boom" }, { status: 500 });
        }
        const body = await req.json().catch(() => undefined) as { input?: Record<string, unknown> } | undefined;
        const input = body?.input;
        if (typeof input?.operation_id !== "string" || input.operation_id.length === 0) {
          return Response.json({ error: "invalid_operation_id" }, { status: 400 });
        }
        if (operations.some((op) => op.id === input.operation_id)) {
          return Response.json({ error: "already_exists" }, { status: 409 });
        }
        if (typeof input.handler !== "object" || input.handler === null || Array.isArray(input.handler)) {
          return Response.json({ error: "invalid_handler" }, { status: 400 });
        }
        const handler = input.handler as { kind?: unknown; on?: unknown };
        if (handler.kind !== "query" || typeof handler.on !== "string" || handler.on.length === 0) {
          return Response.json({ error: "unsupported_handler" }, { status: 400 });
        }
        if (!tables.some((table) => table.id === handler.on)) {
          return Response.json({ error: "target_table_not_found" }, { status: 404 });
        }
        if (mode !== "no-schema-change") {
          operations = [
            ...operations,
            {
              id: input.operation_id,
              action: "read",
              resource: { kind: "table", table: handler.on },
              input: input.input ?? { type: "record", fields: {} },
              output: input.output ?? { kind: "row-list", row_type: handler.on },
              affects: { reads_only: true, destructive: false, mutations: [], adapter_writes: [] },
              handler_kind: "query",
              surface: typeof input.surface === "object" && input.surface !== null && !Array.isArray(input.surface)
                ? input.surface as OperationFixture["surface"]
                : {
                    agent_callable: true,
                    public_surface: true,
                    view_mountable: true,
                    framework_internal: false,
                  },
            },
          ];
        }
        return Response.json({
          output: { entry_id: `po-${input.operation_id}`, definition_version: operations.length },
          events: [],
        });
      }
      if (req.method === "POST" && url.pathname === "/api/operations/add_view") {
        postCount += 1;
        if (mode === "operation-fails") {
          return Response.json({ error: "boom" }, { status: 500 });
        }
        const body = await req.json().catch(() => undefined) as { input?: Record<string, unknown> } | undefined;
        const input = body?.input;
        if (typeof input?.view_id !== "string" || input.view_id.length === 0) {
          return Response.json({ error: "invalid_view_id" }, { status: 400 });
        }
        if (input.view_kind !== "table" && input.view_kind !== "list" && input.view_kind !== "detail" && input.view_kind !== "custom") {
          return Response.json({ error: "invalid_view_kind" }, { status: 400 });
        }
        if (typeof input.source !== "object" || input.source === null || Array.isArray(input.source)) {
          return Response.json({ error: "invalid_source" }, { status: 400 });
        }
        const source = input.source as { kind?: unknown; operation_id?: unknown };
        if (source.kind !== "operation" || typeof source.operation_id !== "string") {
          return Response.json({ error: "unsupported_source" }, { status: 400 });
        }
        const sourceOperation = operations.find((op) => op.id === source.operation_id);
        if (!sourceOperation) {
          return Response.json({ error: "source_operation_not_found" }, { status: 404 });
        }
        if ((sourceOperation.affects as { reads_only?: unknown }).reads_only !== true) {
          return Response.json({ error: "source_operation_not_readable" }, { status: 400 });
        }
        if (sourceOperation.surface?.view_mountable === false || sourceOperation.surface?.public_surface === false || sourceOperation.surface?.framework_internal === true) {
          return Response.json({ error: "source_operation_not_mountable" }, { status: 400 });
        }
        if (views.some((view) => view.id === input.view_id)) {
          return Response.json({ error: "already_exists" }, { status: 409 });
        }
        if (mode !== "no-schema-change") {
          views = [
            ...views,
            {
              id: input.view_id,
              name: typeof input.name === "string" ? input.name : input.view_id,
              description: typeof input.description === "string" ? input.description : "",
              kind: input.view_kind,
              source: input.source,
              presentation: input.presentation,
            },
          ];
        }
        return Response.json({
          output: { entry_id: `pv-${input.view_id}`, definition_version: views.length, view_id: input.view_id },
          events: [],
        });
      }
      if (req.method === "POST" && url.pathname === "/api/operations/definition.rollback.validate") {
        rollbackValidateCount += 1;
        const body = await req.json().catch(() => undefined) as { input?: Record<string, unknown> } | undefined;
        const target = body?.input?.target_history_version;
        if (!Number.isInteger(target) || (target as number) < 0) {
          return Response.json({ error: "invalid_target_history_version" }, { status: 400 });
        }
        return Response.json({
          output: {
            target_history_version: target,
            current_history_version: 2,
            destructive: mode !== "rollback-operation",
            requires_approval: true,
            impact: {
              removed_tables: mode === "rollback-column" || mode === "rollback-operation"
                ? []
                : [{ table_id: "notes", row_count: 1, columns: ["title"] }],
              removed_columns: mode === "rollback-table-only" || mode === "rollback-operation"
                ? []
                : [{ table_id: "bookmarks", column_name: "tags", affected_row_count: 1 }],
              removed_operations: mode === "rollback-operation"
                ? [{ operation_id: "list_bookmark_urls", handler_kind: "query" }]
                : [],
              removed_views: [],
              restored_tables: [],
              restored_columns: [],
              restored_operations: [],
              restored_views: [],
            },
            current_overlay: {
              pneuma_tables_count: 1,
              pneuma_table_columns_count: 1,
              pneuma_operations_count: operations.length,
              pneuma_views_count: views.length,
            },
            target_overlay: {
              pneuma_tables_count: 0,
              pneuma_table_columns_count: 0,
              pneuma_operations_count: 0,
              pneuma_views_count: 0,
            },
            warnings: ["target_history_version=0 means the baseline before any definition overlay history entry"],
          },
          events: [],
        });
      }
      if (req.method === "POST" && url.pathname === "/api/operations/definition.rollback.execute") {
        rollbackExecuteCount += 1;
        const body = await req.json().catch(() => undefined) as {
          input?: Record<string, unknown>;
          confirmed?: boolean;
        } | undefined;
        const target = body?.input?.target_history_version;
        if (body?.confirmed !== true) {
          return Response.json({ error: "confirmation_required" }, { status: 428 });
        }
        if (!Number.isInteger(target) || (target as number) < 0) {
          return Response.json({ error: "invalid_target_history_version" }, { status: 400 });
        }
        if (mode === "rollback-operation") {
          operations = [];
        } else if (mode === "rollback-column") {
          tables = tables.map((table) =>
            table.id === "bookmarks"
              ? { ...table, columns: table.columns.filter((column) => column.name !== "tags") }
              : table,
          );
        } else {
          tables = tables.filter((table) => table.id !== "notes");
        }
        return Response.json({
          output: {
            status: "rolled_back",
            target_history_version: target,
            previous_history_version: 2,
            backup_history_version: 3,
            rollback_history_version: 4,
            deleted_rows: mode === "rollback-column" || mode === "rollback-operation"
              ? []
              : [{ table_id: "notes", row_ids: ["note-1"] }],
            cleaned_columns: mode === "rollback-column"
              ? [{ table_id: "bookmarks", column_name: "tags", row_ids: ["bookmark-1"] }]
              : [],
            deleted_definition_rows: mode === "rollback-column"
                ? { pneuma_tables: [], pneuma_table_columns: ["ptc-tags"], pneuma_operations: [] }
              : mode === "rollback-operation"
                ? { pneuma_tables: [], pneuma_table_columns: [], pneuma_operations: ["po-list_bookmark_urls"] }
                : { pneuma_tables: ["pt-notes"], pneuma_table_columns: [], pneuma_operations: [] },
            impact: {
              removed_tables: mode === "rollback-column" || mode === "rollback-operation"
                ? []
                : [{ table_id: "notes", row_count: 1, columns: ["title"] }],
              removed_columns: mode === "rollback-column"
                ? [{ table_id: "bookmarks", column_name: "tags", affected_row_count: 1 }]
                : [],
              removed_operations: mode === "rollback-operation"
                ? [{ operation_id: "list_bookmark_urls", handler_kind: "query" }]
                : [],
              removed_views: [],
              restored_tables: [],
              restored_columns: [],
              restored_operations: [],
              restored_views: [],
            },
            restart_required: true,
          },
          events: [],
        });
      }
      return Response.json({ error: "not_found" }, { status: 404 });
    },
  });
  const stats: DefinitionServerStats = {
    get postCount() {
      return postCount;
    },
    get rollbackValidateCount() {
      return rollbackValidateCount;
    },
    get rollbackExecuteCount() {
      return rollbackExecuteCount;
    },
    get columns() {
      return bookmarks().columns;
    },
    get tables() {
      return tables;
    },
    get operations() {
      return operations;
    },
    get views() {
      return views;
    },
  };
  try {
    await fn(server.port, stats);
  } finally {
    server.stop(true);
  }
}

test("definition.apply adds a table column through the running dev service and refreshes state after restart", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-tool-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    const start = await reg.call("lifecycle.dev.start", {});
    expect(start.ok).toBe(true);

    const result = await reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      mode: string;
      restart_required: boolean;
      operation_id: string;
      diff: { changed_tables: Array<{ added_columns: string[] }> };
      operation_output: unknown;
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("applied");
    expect(state.mode).toBe("apply");
    expect(state.restart_required).toBe(true);
    expect(state.operation_id).toBe("add_table_column");
    expect(state.diff.changed_tables[0]?.added_columns).toEqual(["tags"]);
    expect(state.operation_output).toEqual({ entry_id: "ptc-tags", definition_version: 1 });
    expect(state.timeline.map((e) => e.phase)).toEqual([
      "validating",
      "applying-definition",
      "stopping-for-definition-apply",
      "starting-after-definition-apply",
      "refreshing-definition",
      "running",
    ]);
    expect(orch.state.dev?.state).toBe("running");
    expect(orch.state.dev?.tables?.[0]?.columns.map((c) => c.name)).toEqual(["url", "tags"]);
    expect(orch.state.definitionApply?.status).toBe("applied");
    expect(orch.state.definitionApply?.phase).toBe("running");

    const stop = await reg.call("lifecycle.dev.stop", {});
    expect(stop.ok).toBe(true);
  });
});

test("definition.apply adds a stored table through the running dev service and refreshes state after restart", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-tool-table-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    const start = await reg.call("lifecycle.dev.start", {});
    expect(start.ok).toBe(true);

    const result = await reg.call("definition.apply", {
      kind: "add_table",
      table_id: "notes",
      columns: [{ name: "title", type: { kind: "primitive", of: "Text" } }],
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      mode: string;
      restart_required: boolean;
      operation_id: string;
      diff: { added_tables: Array<{ table_id: string; columns: string[] }>; changed_tables: unknown[] };
      operation_output: unknown;
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("applied");
    expect(state.mode).toBe("apply");
    expect(state.restart_required).toBe(true);
    expect(state.operation_id).toBe("add_table");
    expect(state.diff.added_tables).toEqual([{ table_id: "notes", columns: ["title"] }]);
    expect(state.diff.changed_tables).toEqual([]);
    expect(state.operation_output).toEqual({ entry_id: "pt-notes", definition_version: 1 });
    expect(state.timeline.map((e) => e.phase)).toEqual([
      "validating",
      "applying-definition",
      "stopping-for-definition-apply",
      "starting-after-definition-apply",
      "refreshing-definition",
      "running",
    ]);
    expect(orch.state.dev?.state).toBe("running");
    expect(orch.state.dev?.tables?.map((t) => t.id)).toContain("notes");
    expect(orch.state.definitionApply?.status).toBe("applied");

    const stop = await reg.call("lifecycle.dev.stop", {});
    expect(stop.ok).toBe(true);
  });
});

test("definition.apply adds a query-backed operation through the running dev service and refreshes state after restart", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-tool-operation-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    const start = await reg.call("lifecycle.dev.start", {});
    expect(start.ok).toBe(true);

    const result = await reg.call("definition.apply", {
      kind: "add_operation",
      operation_id: "list_bookmark_urls",
      name: "List bookmark URLs",
      description: "Read bookmark URLs for agent inspection.",
      handler: {
        kind: "query",
        on: "bookmarks",
        fields: ["url"],
        pagination: { kind: "offset", size: 20 },
      },
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      mode: string;
      restart_required: boolean;
      operation_id: string;
      diff: { added_operations: Array<{ operation_id: string; action: string; handler_kind: string }> };
      operation_output: unknown;
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("applied");
    expect(state.mode).toBe("apply");
    expect(state.restart_required).toBe(true);
    expect(state.operation_id).toBe("add_operation");
    expect(state.diff.added_operations).toEqual([{
      operation_id: "list_bookmark_urls",
      action: "read",
      handler_kind: "query",
    }]);
    expect(state.operation_output).toEqual({
      entry_id: "po-list_bookmark_urls",
      definition_version: 1,
    });
    expect(state.timeline.map((e) => e.phase)).toEqual([
      "validating",
      "applying-definition",
      "stopping-for-definition-apply",
      "starting-after-definition-apply",
      "refreshing-definition",
      "running",
    ]);
    expect(stats.operations.map((op) => op.id)).toEqual(["list_bookmark_urls"]);
    expect(orch.state.dev?.state).toBe("running");
    expect(orch.state.dev?.operations?.some((op) => op.id === "list_bookmark_urls")).toBe(true);
    expect(orch.state.definitionApply?.status).toBe("applied");

    const stop = await reg.call("lifecycle.dev.stop", {});
    expect(stop.ok).toBe(true);
  });
});

test("definition.apply adds an Operation-backed view through the running dev service", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-tool-view-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    const start = await reg.call("lifecycle.dev.start", {});
    expect(start.ok).toBe(true);

    const operationResult = await reg.call("definition.apply", {
      kind: "add_operation",
      operation_id: "list_bookmark_urls",
      name: "List bookmark URLs",
      description: "Read bookmark URLs for app views.",
      handler: {
        kind: "query",
        on: "bookmarks",
        fields: ["url"],
        pagination: { kind: "offset", size: 20 },
      },
    });
    expect(operationResult.ok).toBe(true);

    const result = await reg.call("definition.apply", {
      kind: "add_view",
      view_id: "review_queue",
      name: "Review Queue",
      description: "Sources ready for review.",
      view_kind: "table",
      source: { kind: "operation", operation_id: "list_bookmark_urls" },
      presentation: { columns: ["url"] },
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      operation_id: string;
      diff: { added_views: Array<{ view_id: string; kind: string; source_operation_id: string }> };
      operation_output: unknown;
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("applied");
    expect(state.operation_id).toBe("add_view");
    expect(state.diff.added_views).toEqual([{
      view_id: "review_queue",
      kind: "table",
      source_operation_id: "list_bookmark_urls",
    }]);
    expect(state.operation_output).toEqual({
      entry_id: "pv-review_queue",
      definition_version: 1,
      view_id: "review_queue",
    });
    expect(state.timeline.map((e) => e.phase)).toEqual([
      "validating",
      "applying-definition",
      "stopping-for-definition-apply",
      "starting-after-definition-apply",
      "refreshing-definition",
      "running",
    ]);
    expect(stats.views.map((view) => view.id)).toEqual(["review_queue"]);
    expect(orch.state.dev?.views?.some((view) => view.id === "review_queue")).toBe(true);

    const stop = await reg.call("lifecycle.dev.stop", {});
    expect(stop.ok).toBe(true);
  });
  });

  test("definition.apply rejects Views backed by non-view-mountable Operations", async () => {
    await withDefinitionServer(async (port, stats) => {
      const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-view-surface-"));
      const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
      const reg = createToolRegistry({ orchestrator: orch });
      registerActionTools(reg);

      const start = await reg.call("lifecycle.dev.start", {});
      expect(start.ok).toBe(true);

      const addOperation = await reg.call("definition.apply", {
        kind: "add_operation",
        operation_id: "internal_urls",
        name: "Internal URLs",
        handler: { kind: "query", on: "bookmarks", fields: ["url"], pagination: { kind: "offset", size: 10 } },
        surface: {
          agent_callable: true,
          public_surface: true,
          view_mountable: false,
          framework_internal: false,
        },
      });
      expect(addOperation.ok).toBe(true);
      expect(stats.operations.find((op) => op.id === "internal_urls")?.surface?.view_mountable).toBe(false);

      const addView = await reg.call("definition.apply", {
        kind: "add_view",
        view_id: "internal_review_queue",
        name: "Internal Review Queue",
        view_kind: "table",
        source: { kind: "operation", operation_id: "internal_urls" },
      });

      expect(addView.ok).toBe(false);
      const state = addView.state as { failure: { category: string; message: string } };
      expect(state.failure.category).toBe("validation_failed");
      expect(state.failure.message).toMatch(/not view_mountable/);
      expect(stats.views).toHaveLength(0);

      const stop = await reg.call("lifecycle.dev.stop", {});
      expect(stop.ok).toBe(true);
    });
  });

  test("definition.apply rejects Views backed by framework-owned Operations", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-tool-framework-view-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    const start = await reg.call("lifecycle.dev.start", {});
    expect(start.ok).toBe(true);

    const result = await reg.call("definition.apply", {
      kind: "add_view",
      view_id: "rollback_inspector",
      name: "Rollback Inspector",
      view_kind: "table",
      source: { kind: "operation", operation_id: "definition.rollback.validate" },
      presentation: { columns: ["target_history_version"] },
    });

    expect(result.ok).toBe(false);
    const state = result.state as { failure: { category: string; message: string }; timeline: Array<{ phase: string }> };
    expect(state.failure.category).toBe("validation_failed");
    expect(state.failure.message).toMatch(/framework-internal/);
    expect(state.timeline.map((e) => e.phase)).toEqual(["validating", "failed"]);
    expect(stats.postCount).toBe(0);
    expect(stats.views).toHaveLength(0);

    const stop = await reg.call("lifecycle.dev.stop", {});
    expect(stop.ok).toBe(true);
  });
});

test("definition.apply validate mode returns a predicted diff without mutating or restarting", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-validate-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const beforePid = orch.state.dev?.pid;

    const result = await reg.call("definition.apply", {
      mode: "validate",
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      mode: string;
      diff: { changed_tables: Array<{ before_columns: string[]; after_columns: string[]; added_columns: string[] }> };
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("validated");
    expect(state.mode).toBe("validate");
    expect(state.diff.changed_tables[0]).toMatchObject({
      before_columns: ["url"],
      after_columns: ["url", "tags"],
      added_columns: ["tags"],
    });
    expect(state.timeline.map((e) => e.phase)).toEqual(["validating", "running"]);
    expect(stats.postCount).toBe(0);
    expect(stats.columns.map((c) => c.name)).toEqual(["url"]);
    expect(orch.state.dev?.pid).toBe(beforePid);

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.apply validate mode predicts add_operation without mutating or restarting", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-validate-operation-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const beforePid = orch.state.dev?.pid;

    const result = await reg.call("definition.apply", {
      mode: "validate",
      kind: "add_operation",
      operation_id: "list_bookmark_urls",
      handler: { kind: "query", on: "bookmarks", fields: ["url"] },
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      mode: string;
      diff: { added_operations: Array<{ operation_id: string; action: string; handler_kind: string }> };
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("validated");
    expect(state.mode).toBe("validate");
    expect(state.diff.added_operations).toEqual([{
      operation_id: "list_bookmark_urls",
      action: "read",
      handler_kind: "query",
    }]);
    expect(state.timeline.map((e) => e.phase)).toEqual(["validating", "running"]);
    expect(stats.postCount).toBe(0);
    expect(stats.operations).toEqual([]);
    expect(orch.state.dev?.pid).toBe(beforePid);

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.apply reports operation_failed when the underlying framework operation fails", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-op-fail-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const beforePid = orch.state.dev?.pid;

    const result = await reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
    });

    expect(result.ok).toBe(false);
    const state = result.state as { failure: { category: string }; timeline: Array<{ phase: string }> };
    expect(state.failure.category).toBe("operation_failed");
    expect(state.timeline.map((e) => e.phase)).toEqual([
      "validating",
      "applying-definition",
      "failed",
    ]);
    expect(orch.state.dev?.pid).toBe(beforePid);

    await reg.call("lifecycle.dev.stop", {});
  }, "operation-fails");
});

test("definition.apply reports diff_mismatch when schema refresh does not show the requested column", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-diff-mismatch-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const result = await reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
    });

    expect(result.ok).toBe(false);
    const state = result.state as { failure: { category: string }; timeline: Array<{ phase: string }> };
    expect(state.failure.category).toBe("diff_mismatch");
    expect(state.timeline.map((e) => e.phase)).toContain("refreshing-definition");

    await reg.call("lifecycle.dev.stop", {});
  }, "no-schema-change");
});

test("definition.apply reports restart_failed when dev exits before ready after mutation", async () => {
  await withDefinitionServer(async (port) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-restart-fail-"));
    const orch = new LifecycleOrchestrator({
      templateDir: makeRestartCrashTemplate(),
      workspace: ws,
      portHint: port,
    });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const result = await reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
    });

    expect(result.ok).toBe(false);
    const state = result.state as { failure: { category: string }; timeline: Array<{ phase: string }> };
    expect(state.failure.category).toBe("restart_failed");
    expect(state.timeline.map((e) => e.phase)).toContain("starting-after-definition-apply");
  });
});

test("definition.apply approval gate allows an approved definition mutation", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-approval-allow-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string; tool: string; detail: Record<string, unknown> } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const pending = reg.call("definition.apply", {
      require_approval: true,
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
    });

    for (let i = 0; i < 40; i++) {
      if (prompts.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.prompt.tool).toBe("definition.apply");
    expect(prompts[0]!.prompt.detail.restart_required).toBe(true);
    expect(stats.postCount).toBe(0);
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "allow")).toBe(true);

    const result = await pending;
    expect(result.ok).toBe(true);
    const state = result.state as { status: string; approval: { required: boolean; decision: string } };
    expect(state.status).toBe("applied");
    expect(state.approval).toMatchObject({ required: true, decision: "allow" });
    expect(stats.postCount).toBe(1);

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.apply approval gate discloses add_operation impact before mutation", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-operation-approval-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string; tool: string; detail: Record<string, unknown> } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const pending = reg.call("definition.apply", {
      require_approval: true,
      kind: "add_operation",
      operation_id: "list_bookmark_urls",
      name: "List bookmark URLs",
      handler: { kind: "query", on: "bookmarks", fields: ["url"] },
    });

    for (let i = 0; i < 40; i++) {
      if (prompts.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.prompt.tool).toBe("definition.apply");
    expect(prompts[0]!.prompt.detail.operation_id).toBe("add_operation");
    expect(prompts[0]!.prompt.detail.change).toMatchObject({
      kind: "add_operation",
      operation_id: "list_bookmark_urls",
    });
    expect(prompts[0]!.prompt.detail.impact).toMatchObject({
      added_operations: [{
        operation_id: "list_bookmark_urls",
        action: "read",
        handler_kind: "query",
      }],
    });
    expect(stats.postCount).toBe(0);
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "allow")).toBe(true);

    const result = await pending;
    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      approval: { required: boolean; decision: string };
      diff: { added_operations: Array<{ operation_id: string }> };
    };
    expect(state.status).toBe("applied");
    expect(state.approval).toMatchObject({ required: true, decision: "allow" });
    expect(state.diff.added_operations).toEqual([{ operation_id: "list_bookmark_urls", action: "read", handler_kind: "query" }]);
    expect(stats.postCount).toBe(1);

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.apply approval gate denies without mutating definition storage", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-approval-deny-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string; tool: string } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const pending = reg.call("definition.apply", {
      require_approval: true,
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
    });

    for (let i = 0; i < 40; i++) {
      if (prompts.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(stats.postCount).toBe(0);
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "deny")).toBe(true);

    const result = await pending;
    expect(result.ok).toBe(false);
    const state = result.state as { status: string; approval: { decision: string }; timeline: Array<{ phase: string }> };
    expect(state.status).toBe("denied");
    expect(state.approval.decision).toBe("deny");
    expect(state.timeline.map((e) => e.phase)).toEqual([
      "validating",
      "awaiting-approval",
      "denied",
    ]);
    expect(stats.postCount).toBe(0);
    expect(stats.columns.map((c) => c.name)).toEqual(["url"]);
    expect(orch.state.dev?.state).toBe("running");

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.rollback.prepare validates rollback impact and reaches ready_to_execute after approval", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-prepare-allow-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string; tool: string; detail: Record<string, unknown> } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const beforePid = orch.state.dev?.pid;
    const pending = reg.call("definition.rollback.prepare", { target_history_version: 0 });

    for (let i = 0; i < 40; i++) {
      if (prompts.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.prompt.tool).toBe("definition.rollback.validate");
    expect(prompts[0]!.prompt.detail.target_history_version).toBe(0);
    expect(prompts[0]!.prompt.detail.impact).toMatchObject({
      removed_tables: [{ table_id: "notes", row_count: 1, columns: ["title"] }],
      removed_columns: [{ table_id: "bookmarks", column_name: "tags", affected_row_count: 1 }],
    });
    expect(stats.rollbackValidateCount).toBe(1);
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "allow")).toBe(true);

    const result = await pending;
    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      operation_id: string;
      destructive: boolean;
      requires_approval: boolean;
      approval: { required: boolean; decision: string };
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("ready_to_execute");
    expect(state.operation_id).toBe("definition.rollback.validate");
    expect(state.destructive).toBe(true);
    expect(state.requires_approval).toBe(true);
    expect(state.approval).toMatchObject({ required: true, decision: "allow" });
    expect(state.timeline.map((e) => e.phase)).toEqual([
      "validating",
      "awaiting-approval",
      "ready-to-execute",
    ]);
    expect(orch.state.dev?.pid).toBe(beforePid);
    expect(orch.state.definitionRollbackPrepare?.status).toBe("ready_to_execute");

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.rollback.prepare denial stops before ready_to_execute", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-prepare-deny-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string; tool: string } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const pending = reg.call("definition.rollback.prepare", { target_history_version: 0 });

    for (let i = 0; i < 40; i++) {
      if (prompts.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "deny")).toBe(true);

    const result = await pending;
    expect(result.ok).toBe(false);
    const state = result.state as {
      status: string;
      approval: { decision: string };
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("denied");
    expect(state.approval.decision).toBe("deny");
    expect(state.timeline.map((e) => e.phase)).toEqual([
      "validating",
      "awaiting-approval",
      "denied",
    ]);
    expect(stats.rollbackValidateCount).toBe(1);
    expect(orch.state.dev?.state).toBe("running");

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.rollback.prepare reports approval_unavailable when destructive validation has no prompt hook", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-prepare-no-hook-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const result = await reg.call("definition.rollback.prepare", { target_history_version: 0 });

    expect(result.ok).toBe(false);
    const state = result.state as { failure: { category: string }; timeline: Array<{ phase: string }> };
    expect(state.failure.category).toBe("approval_unavailable");
    expect(state.timeline.map((e) => e.phase)).toEqual(["validating", "awaiting-approval"]);
    expect(stats.rollbackValidateCount).toBe(1);

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.rollback.prepare can bypass approval and still does not restart dev", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-prepare-no-approval-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<unknown> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const beforePid = orch.state.dev?.pid;
    const result = await reg.call("definition.rollback.prepare", {
      target_history_version: 0,
      require_approval: false,
    });

    expect(result.ok).toBe(true);
    const state = result.state as { status: string; approval: { required: boolean }; timeline: Array<{ phase: string }> };
    expect(state.status).toBe("ready_to_execute");
    expect(state.approval.required).toBe(false);
    expect(state.timeline.map((e) => e.phase)).toEqual(["validating", "ready-to-execute"]);
    expect(prompts).toHaveLength(0);
    expect(stats.rollbackValidateCount).toBe(1);
    expect(orch.state.dev?.pid).toBe(beforePid);

    await reg.call("lifecycle.dev.stop", {});
  });
});

test("definition.rollback.execute prepares, executes table rollback, restarts, and verifies schema", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-execute-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string; tool: string; detail: Record<string, unknown> } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    expect((await reg.call("definition.apply", {
      kind: "add_table",
      table_id: "notes",
      columns: [{ name: "title", type: { kind: "primitive", of: "Text" } }],
    })).ok).toBe(true);
    expect(stats.tables.map((t) => t.id)).toContain("notes");

    const pending = reg.call("definition.rollback.execute", { target_history_version: 0 });
    for (let i = 0; i < 40; i++) {
      if (prompts.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(prompts[0]!.prompt.tool).toBe("definition.rollback.validate");
    expect(prompts[0]!.prompt.detail.impact).toMatchObject({
      removed_tables: [{ table_id: "notes", row_count: 1, columns: ["title"] }],
      removed_columns: [],
    });
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "allow")).toBe(true);

    const result = await pending;
    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      operation_id: string;
      diff: { removed_tables: string[] };
      operation_output: { status: string; backup_history_version: number; rollback_history_version: number };
      timeline: Array<{ phase: string }>;
    };
    expect(state.status).toBe("rolled_back");
    expect(state.operation_id).toBe("definition.rollback.execute");
    expect(state.diff.removed_tables).toEqual(["notes"]);
    expect(state.operation_output).toMatchObject({
      status: "rolled_back",
      backup_history_version: 3,
      rollback_history_version: 4,
    });
    expect(state.timeline.map((e) => e.phase)).toEqual([
      "preparing",
      "executing-rollback",
      "stopping-after-rollback",
      "starting-after-rollback",
      "refreshing-definition",
      "running",
    ]);
    expect(stats.rollbackValidateCount).toBe(1);
    expect(stats.rollbackExecuteCount).toBe(1);
    expect(stats.tables.map((t) => t.id)).not.toContain("notes");
    expect(orch.state.dev?.state).toBe("running");
    expect(orch.state.dev?.tables?.map((t) => t.id)).not.toContain("notes");
    expect(orch.state.definitionRollbackExecute?.status).toBe("rolled_back");

    await reg.call("lifecycle.dev.stop", {});
  }, "rollback-table-only");
});

test("definition.rollback.execute prepares, executes column rollback, restarts, and verifies schema", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-execute-column-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    expect((await reg.call("definition.apply", {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
    })).ok).toBe(true);
    expect(stats.columns.map((column) => column.name)).toContain("tags");

    const result = await reg.call("definition.rollback.execute", {
      target_history_version: 0,
      require_approval: false,
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      diff: {
        removed_tables: string[];
        removed_columns: Array<{ table_id: string; column_name: string }>;
      };
      operation_output: {
        status: string;
        cleaned_columns: Array<{ table_id: string; column_name: string; row_ids: string[] }>;
        deleted_definition_rows: { pneuma_tables: string[]; pneuma_table_columns: string[]; pneuma_operations: string[] };
      };
      timeline: Array<{ phase: string; detail?: Record<string, unknown> }>;
    };
    expect(state.status).toBe("rolled_back");
    expect(state.diff.removed_tables).toEqual([]);
    expect(state.diff.removed_columns).toEqual([{ table_id: "bookmarks", column_name: "tags" }]);
    expect(state.operation_output.cleaned_columns).toEqual([
      { table_id: "bookmarks", column_name: "tags", row_ids: ["bookmark-1"] },
    ]);
    expect(state.operation_output.deleted_definition_rows).toEqual({
      pneuma_tables: [],
      pneuma_table_columns: ["ptc-tags"],
      pneuma_operations: [],
    });
    expect(state.timeline.find((entry) => entry.phase === "executing-rollback")?.detail).toMatchObject({
      expected_removed_tables: [],
      expected_removed_columns: [{ table_id: "bookmarks", column_name: "tags" }],
    });
    expect(stats.rollbackValidateCount).toBe(1);
    expect(stats.rollbackExecuteCount).toBe(1);
    expect(stats.columns.map((column) => column.name)).not.toContain("tags");
    expect(orch.state.dev?.state).toBe("running");
    expect(orch.state.dev?.tables?.find((table) => table.id === "bookmarks")?.columns.map((column) => column.name))
      .toEqual(["url"]);

    await reg.call("lifecycle.dev.stop", {});
  }, "rollback-column");
});

test("definition.rollback.execute removes an overlay operation and verifies config", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-execute-operation-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    expect((await reg.call("definition.apply", {
      kind: "add_operation",
      operation_id: "list_bookmark_urls",
      name: "List bookmark URLs",
      handler: { kind: "query", on: "bookmarks", fields: ["url"] },
    })).ok).toBe(true);
    expect(stats.operations.map((operation) => operation.id)).toContain("list_bookmark_urls");

    const result = await reg.call("definition.rollback.execute", {
      target_history_version: 0,
      require_approval: false,
    });

    expect(result.ok).toBe(true);
    const state = result.state as {
      status: string;
      diff: {
        removed_tables: string[];
        removed_columns: Array<{ table_id: string; column_name: string }>;
        removed_operations: string[];
      };
      operation_output: {
        status: string;
        deleted_definition_rows: { pneuma_tables: string[]; pneuma_table_columns: string[]; pneuma_operations: string[] };
      };
      timeline: Array<{ phase: string; detail?: Record<string, unknown> }>;
    };
    expect(state.status).toBe("rolled_back");
    expect(state.diff.removed_tables).toEqual([]);
    expect(state.diff.removed_columns).toEqual([]);
    expect(state.diff.removed_operations).toEqual(["list_bookmark_urls"]);
    expect(state.operation_output.deleted_definition_rows).toEqual({
      pneuma_tables: [],
      pneuma_table_columns: [],
      pneuma_operations: ["po-list_bookmark_urls"],
    });
    expect(state.timeline.find((entry) => entry.phase === "executing-rollback")?.detail).toMatchObject({
      expected_removed_operations: ["list_bookmark_urls"],
    });
    expect(stats.rollbackValidateCount).toBe(1);
    expect(stats.rollbackExecuteCount).toBe(1);
    expect(stats.operations.map((operation) => operation.id)).not.toContain("list_bookmark_urls");
    expect(orch.state.dev?.state).toBe("running");
    expect(orch.state.dev?.operations?.map((operation) => operation.id)).not.toContain("list_bookmark_urls");

    await reg.call("lifecycle.dev.stop", {});
  }, "rollback-operation");
});

test("definition.rollback.execute denial stops before destructive runtime call", async () => {
  await withDefinitionServer(async (port, stats) => {
    const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-execute-deny-"));
    const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws, portHint: port });
    const reg = createToolRegistry({ orchestrator: orch });
    registerActionTools(reg);
    const prompts: Array<{ prompt: { id: string; tool: string } }> = [];
    orch.setPermissionPromptPushHook((env) => prompts.push(env));

    expect((await reg.call("lifecycle.dev.start", {})).ok).toBe(true);
    const pending = reg.call("definition.rollback.execute", { target_history_version: 0 });
    for (let i = 0; i < 40; i++) {
      if (prompts.length > 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(prompts).toHaveLength(1);
    expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "deny")).toBe(true);

    const result = await pending;
    expect(result.ok).toBe(false);
    const state = result.state as { status: string; timeline: Array<{ phase: string }> };
    expect(state.status).toBe("denied");
    expect(state.timeline.map((e) => e.phase)).toEqual(["preparing", "denied"]);
    expect(stats.rollbackValidateCount).toBe(1);
    expect(stats.rollbackExecuteCount).toBe(0);

    await reg.call("lifecycle.dev.stop", {});
  }, "rollback-table-only");
});

test("definition.apply validates the current MVP change shape before invoking lifecycle", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-invalid-"));
  const orch = new LifecycleOrchestrator({ templateDir: TEMPLATE, workspace: ws });
  const reg = createToolRegistry({ orchestrator: orch });
  registerActionTools(reg);

  const result = await reg.call("definition.apply", {
    kind: "add_table_column",
    table_id: "bookmarks",
    column_name: "tags",
  });

  expect(result.ok).toBe(false);
  expect(result.error).toMatch(/cell_type/i);
});
