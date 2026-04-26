import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerWebSocket } from "bun";
import {
  ADD_OPERATION_OP_ID,
  ADD_TABLE_COLUMN_OP_ID,
  DEFINITION_ROLLBACK_EXECUTE_OP_ID,
  DEFINITION_ROLLBACK_VALIDATE_OP_ID,
  bootAppRuntime,
  type AppConfig,
  type AppRuntime,
} from "@pneuma-framework/runtime";
import {
  PNEUMA_OPERATIONS_TABLE_ID,
  PolicySet,
  Row,
  Table,
  buildRootContext,
  type CellType,
} from "@pneuma-framework/core-domain";

const responses: unknown[] = [];
const liveResults: unknown[] = [];
const applyPrompt = {
  dir: "a2v",
  kind: "permission-prompt",
  prompt: {
    id: "pneuma:definition-apply:e2e",
    tool: "definition.apply",
    detail: {
      operation_id: "add_table_column",
      change: {
        kind: "add_table_column",
        table_id: "bookmarks",
        column_name: "tags",
        cell_type: { kind: "primitive", of: "Text" },
        nullable: true,
      },
      impact: {
        changed_tables: [{
          table_id: "bookmarks",
          before_columns: ["url"],
          after_columns: ["url", "tags"],
          added_columns: ["tags"],
        }],
        added_tables: [],
        added_operations: [],
      },
      restart_required: true,
    },
  },
};
const operationPrompt = {
  dir: "a2v",
  kind: "permission-prompt",
  prompt: {
    id: "pneuma:definition-apply-operation:e2e",
    tool: "definition.apply",
    detail: {
      operation_id: "add_operation",
      change: {
        kind: "add_operation",
        operation_id: "list_bookmark_urls",
        name: "List bookmark URLs",
        handler: {
          kind: "query",
          on: "bookmarks",
          fields: ["url"],
          pagination: { kind: "offset", size: 20 },
        },
      },
      impact: {
        changed_tables: [],
        added_tables: [],
        added_operations: [{
          operation_id: "list_bookmark_urls",
          action: "read",
          handler_kind: "query",
        }],
      },
      restart_required: true,
    },
  },
};
const rollbackPrompt = {
  dir: "a2v",
  kind: "permission-prompt",
  prompt: {
    id: "pneuma:definition-rollback-validate:e2e",
    tool: "definition.rollback.validate",
    detail: {
      target_history_version: 0,
      current_history_version: 2,
      destructive: true,
      requires_approval: true,
      impact: {
        removed_tables: [{
          table_id: "notes",
          row_count: 1,
          columns: ["title"],
        }],
        removed_columns: [{
          table_id: "bookmarks",
          column_name: "tags",
          affected_row_count: 1,
        }],
        restored_tables: [],
        restored_columns: [],
        removed_operations: [{
          operation_id: "list_bookmark_urls",
          handler_kind: "query",
        }],
        restored_operations: [],
      },
      warnings: [
        "target_history_version=0 means the baseline before any definition overlay history entry",
      ],
    },
  },
};

type StaticPrompt = typeof applyPrompt | typeof operationPrompt | typeof rollbackPrompt;

function promptForScenario(scenario: string | undefined): StaticPrompt {
  if (scenario === "rollback") return rollbackPrompt;
  if (scenario === "operation") return operationPrompt;
  return applyPrompt;
}

type LiveRollbackHarness = {
  readonly app_id: string;
  readonly prompt_id: string;
  readonly result_path: string;
  readonly error_path: string;
  readonly frameworkCtx: ReturnType<typeof buildRootContext>;
  readonly makeConfig: () => AppConfig;
  runtime: AppRuntime;
  result?: Record<string, unknown>;
};

type CapabilityLifecycleHarness = {
  readonly app_id: string;
  readonly add_prompt_id: string;
  readonly rollback_prompt_id: string;
  readonly status_path: string;
  readonly after_add_path: string;
  readonly result_path: string;
  readonly error_path: string;
  readonly agentCtx: ReturnType<typeof buildRootContext>;
  readonly frameworkCtx: ReturnType<typeof buildRootContext>;
  readonly makeConfig: () => AppConfig;
  runtime: AppRuntime;
  addPromptSent?: boolean;
  rollbackPromptSent?: boolean;
  afterAdd?: Record<string, unknown>;
  result?: Record<string, unknown>;
};

type WsData = {
  scenario?: string;
  rollbackHarness?: LiveRollbackHarness;
  lifecycleHarness?: CapabilityLifecycleHarness;
};

const TEXT: CellType = { kind: "primitive", of: "Text" };
const URL_T: CellType = { kind: "primitive", of: "URL" };
const DATE_T: CellType = { kind: "primitive", of: "Date" };

const CAPABILITY_BOOKMARK_CELLS: Record<string, unknown> = {
  title: "Pneuma architecture notes",
  url: "https://example.com/full-chain-demo",
  source: "Architecture research",
  lens: "Framework primitives",
  saved_at: Date.UTC(2026, 3, 26, 9, 0, 0),
};

function bookmarkSchemaColumns(): Array<{ name: string; type: CellType; nullable?: boolean }> {
  return [
    { name: "title", type: TEXT },
    { name: "url", type: URL_T },
    { name: "source", type: TEXT },
    { name: "lens", type: TEXT },
    { name: "saved_at", type: DATE_T },
  ];
}

async function createLiveRollbackHarness(): Promise<LiveRollbackHarness> {
  const app_id = "viewer-rollback-execute-e2e";
  const dir = mkdtempSync(join(tmpdir(), "pneuma-viewer-rollback-execute-"));
  const makeConfig = (): AppConfig => ({
    app_id,
    storage: { sqlite_path: join(dir, "rows.sqlite") },
    history: { sqlite_path: join(dir, "history.sqlite") },
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
  });
  const agentCtx = buildRootContext({
    app_id,
    invoked_via: "agent",
    user: { id: "agent:e2e", attrs: {}, roles: [] },
  });
  const frameworkCtx = buildRootContext({
    app_id,
    invoked_via: "system",
    user: { id: "framework", attrs: {}, roles: [] },
  });

  let runtime = await bootAppRuntime(makeConfig());
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

  runtime = await bootAppRuntime(makeConfig());
  await runtime.storage.saveRow(new Row({
    id: "bookmark-1",
    app_id,
    table_id: "bookmarks",
    cells: { url: "https://example.com/live", tags: "live-browser" },
  }));

  return {
    app_id,
    prompt_id: "pneuma:definition-rollback-execute:live-e2e",
    result_path: "rollback-execute/result",
    error_path: "rollback-execute/error",
    frameworkCtx,
    makeConfig,
    runtime,
  };
}

async function createLiveOperationRollbackHarness(): Promise<LiveRollbackHarness> {
  const app_id = "viewer-operation-rollback-execute-e2e";
  const dir = mkdtempSync(join(tmpdir(), "pneuma-viewer-operation-rollback-"));
  const makeConfig = (): AppConfig => ({
    app_id,
    storage: { sqlite_path: join(dir, "rows.sqlite") },
    history: { sqlite_path: join(dir, "history.sqlite") },
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
  });
  const agentCtx = buildRootContext({
    app_id,
    invoked_via: "agent",
    user: { id: "agent:e2e", attrs: {}, roles: [] },
  });
  const frameworkCtx = buildRootContext({
    app_id,
    invoked_via: "system",
    user: { id: "framework", attrs: {}, roles: [] },
  });

  let runtime = await bootAppRuntime(makeConfig());
  await runtime.executor.invoke(
    runtime.getOperation(ADD_OPERATION_OP_ID)!,
    {
      operation_id: "list_bookmark_urls",
      name: "List bookmark URLs",
      description: "Read bookmark URLs for agent inspection.",
      handler: {
        kind: "query",
        on: "bookmarks",
        fields: ["url"],
        pagination: { kind: "offset", size: 10 },
      },
    },
    agentCtx,
  );
  await runtime.close();

  runtime = await bootAppRuntime(makeConfig());
  await runtime.storage.saveRow(new Row({
    id: "bookmark-1",
    app_id,
    table_id: "bookmarks",
    cells: { url: "https://example.com/p15-live-demo" },
  }));

  return {
    app_id,
    prompt_id: "pneuma:operation-rollback-execute:live-e2e",
    result_path: "operation-rollback-execute/result",
    error_path: "operation-rollback-execute/error",
    frameworkCtx,
    makeConfig,
    runtime,
  };
}

async function createCapabilityLifecycleHarness(): Promise<CapabilityLifecycleHarness> {
  const app_id = "viewer-capability-lifecycle-e2e";
  const dir = mkdtempSync(join(tmpdir(), "pneuma-viewer-capability-lifecycle-"));
  const makeConfig = (): AppConfig => ({
    app_id,
    storage: { sqlite_path: join(dir, "rows.sqlite") },
    history: { sqlite_path: join(dir, "history.sqlite") },
    tables: [
      new Table({
        id: "bookmarks",
        app_id,
        source: { kind: "stored" },
        columns: bookmarkSchemaColumns(),
      }),
    ],
    operations: [],
    policy: new PolicySet({ app_id }),
    handlers: {},
  });
  const agentCtx = buildRootContext({
    app_id,
    invoked_via: "agent",
    user: { id: "agent:e2e", attrs: {}, roles: [] },
  });
  const frameworkCtx = buildRootContext({
    app_id,
    invoked_via: "system",
    user: { id: "framework", attrs: {}, roles: [] },
  });

  const runtime = await bootAppRuntime(makeConfig());
  await runtime.storage.saveRow(new Row({
    id: "bookmark-1",
    app_id,
    table_id: "bookmarks",
    cells: CAPABILITY_BOOKMARK_CELLS,
  }));

  return {
    app_id,
    add_prompt_id: "pneuma:capability-lifecycle:add-operation",
    rollback_prompt_id: "pneuma:capability-lifecycle:rollback-operation",
    status_path: "capability-lifecycle/status",
    after_add_path: "capability-lifecycle/after-add",
    result_path: "capability-lifecycle/result",
    error_path: "capability-lifecycle/error",
    agentCtx,
    frameworkCtx,
    makeConfig,
    runtime,
  };
}

function lifecycleOperationInput(): Record<string, unknown> {
  return {
    operation_id: "list_bookmark_urls",
    name: "List bookmark URLs",
    description: "Read bookmark URLs for agent inspection.",
    handler: {
      kind: "query",
      on: "bookmarks",
      fields: ["url"],
      pagination: { kind: "offset", size: 10 },
    },
  };
}

function lifecycleApplyPromptDetail(): Record<string, unknown> {
  const input = lifecycleOperationInput();
  return {
    operation_id: ADD_OPERATION_OP_ID,
    change: {
      kind: "add_operation",
      operation_id: input.operation_id,
      name: input.name,
      description: input.description,
      handler: input.handler,
    },
    impact: {
      changed_tables: [],
      added_tables: [],
      added_operations: [{
        operation_id: input.operation_id,
        action: "read",
        handler_kind: "query",
      }],
    },
    restart_required: true,
  };
}

async function sendCapabilityLifecycleStart(
  ws: ServerWebSocket<WsData>,
  harness: CapabilityLifecycleHarness,
): Promise<void> {
  const rows = await harness.runtime.storage.listRowsByTable("bookmarks");
  sendLifecycleState(ws, harness.status_path, {
    stage: "baseline",
    operation_visible_initially: harness.runtime.getOperation("list_bookmark_urls") !== undefined,
    row_count: rows.length,
    bookmark_urls: rows.map((row) => row.getCell("url")),
    history_version: await harness.runtime.history.latestVersion(harness.app_id) ?? 0,
    ...(await lifecycleDefinitionFacts(harness)),
  });
}

function sendCapabilityLifecycleAddPrompt(
  ws: ServerWebSocket<WsData>,
  harness: CapabilityLifecycleHarness,
): void {
  if (harness.addPromptSent || harness.afterAdd || harness.result) return;
  harness.addPromptSent = true;
  ws.send(JSON.stringify({
    dir: "a2v",
    kind: "permission-prompt",
    prompt: {
      id: harness.add_prompt_id,
      tool: "definition.apply",
      detail: lifecycleApplyPromptDetail(),
    },
  }));
}

async function handleCapabilityLifecycleAddResponse(
  ws: ServerWebSocket<WsData>,
  harness: CapabilityLifecycleHarness,
  decision: "allow" | "deny" | "allow-always",
): Promise<void> {
  const rowsBefore = await harness.runtime.storage.listRowsByTable("bookmarks");
  if (decision === "deny") {
    harness.result = {
      stage: "add_denied",
      add_decision: decision,
      operation_visible_initially: false,
      operation_visible_after_add: false,
      row_count: rowsBefore.length,
      preserved_bookmark_urls: rowsBefore.map((row) => row.getCell("url")),
      ...(await lifecycleDefinitionFacts(harness)),
    };
    liveResults.push(harness.result);
    sendLifecycleState(ws, harness.result_path, harness.result);
    sendLifecycleToast(ws, "Capability add denied", "warn");
    return;
  }

  const addResult = await harness.runtime.executor.invoke(
    harness.runtime.getOperation(ADD_OPERATION_OP_ID)!,
    lifecycleOperationInput(),
    harness.agentCtx,
  );
  await harness.runtime.close();
  harness.runtime = await bootAppRuntime(harness.makeConfig());

  const addedOperation = harness.runtime.getOperation("list_bookmark_urls");
  const queryOutput = addedOperation
    ? await harness.runtime.queryExec.run(addedOperation, {}, harness.frameworkCtx)
    : { rows: [] };
  const rowsAfter = await harness.runtime.storage.listRowsByTable("bookmarks");
  harness.afterAdd = {
    stage: "operation_added",
    add_decision: decision,
    add_output: addResult.output,
    operation_visible_initially: false,
    operation_visible_after_add: addedOperation !== undefined,
    query_output_after_add: queryOutput,
    row_count_after_add: rowsAfter.length,
    bookmark_urls_after_add: rowsAfter.map((row) => row.getCell("url")),
    history_version_after_add: await harness.runtime.history.latestVersion(harness.app_id),
    ...(await lifecycleDefinitionFacts(harness)),
  };
  liveResults.push(harness.afterAdd);
  sendLifecycleState(ws, harness.after_add_path, harness.afterAdd);
  sendLifecycleToast(ws, "Capability added and queryable", "info");
}

async function sendCapabilityLifecycleRollbackPrompt(
  ws: ServerWebSocket<WsData>,
  harness: CapabilityLifecycleHarness,
): Promise<void> {
  if (harness.rollbackPromptSent || harness.result) return;
  if (!harness.afterAdd) {
    sendLifecycleError(ws, harness, new Error("Capability must be added before rollback can be reviewed."));
    return;
  }
  harness.rollbackPromptSent = true;
  const validation = (await harness.runtime.executor.invoke(
    harness.runtime.getOperation(DEFINITION_ROLLBACK_VALIDATE_OP_ID)!,
    { target_history_version: 0 },
    harness.frameworkCtx,
  )).output as Record<string, unknown>;

  ws.send(JSON.stringify({
    dir: "a2v",
    kind: "permission-prompt",
    prompt: {
      id: harness.rollback_prompt_id,
      tool: "definition.rollback.validate",
      detail: validation,
    },
  }));
}

async function handleCapabilityLifecycleRollbackResponse(
  ws: ServerWebSocket<WsData>,
  harness: CapabilityLifecycleHarness,
  decision: "allow" | "deny" | "allow-always",
): Promise<void> {
  const operationBeforeRollback = harness.runtime.getOperation("list_bookmark_urls");
  const queryOutputBeforeRollback = operationBeforeRollback
    ? await harness.runtime.queryExec.run(operationBeforeRollback, {}, harness.frameworkCtx)
    : { rows: [] };

  if (decision === "deny") {
    const rows = await harness.runtime.storage.listRowsByTable("bookmarks");
    harness.result = {
      ...(harness.afterAdd ?? {}),
      stage: "rollback_denied",
      rollback_decision: decision,
      operation_visible_after_rollback: harness.runtime.getOperation("list_bookmark_urls") !== undefined,
      query_output_before_rollback: queryOutputBeforeRollback,
      row_count: rows.length,
      preserved_bookmark_urls: rows.map((row) => row.getCell("url")),
      ...(await lifecycleDefinitionFacts(harness)),
    };
    liveResults.push(harness.result);
    sendLifecycleState(ws, harness.result_path, harness.result);
    sendLifecycleToast(ws, "Capability rollback denied", "warn");
    return;
  }

  const rollbackResult = await harness.runtime.executor.invoke(
    harness.runtime.getOperation(DEFINITION_ROLLBACK_EXECUTE_OP_ID)!,
    { target_history_version: 0 },
    harness.frameworkCtx,
    { confirmed: true },
  );
  await harness.runtime.close();
  harness.runtime = await bootAppRuntime(harness.makeConfig());

  const rowsAfterRollback = await harness.runtime.storage.listRowsByTable("bookmarks");
  harness.result = {
    ...(harness.afterAdd ?? {}),
    stage: "rolled_back",
    rollback_decision: decision,
    rollback_output: rollbackResult.output,
    operation_visible_after_rollback: harness.runtime.getOperation("list_bookmark_urls") !== undefined,
    operation_lookup_after_restart: harness.runtime.getOperation("list_bookmark_urls")?.id ?? null,
    query_output_before_rollback: queryOutputBeforeRollback,
    row_count: rowsAfterRollback.length,
    preserved_bookmark_urls: rowsAfterRollback.map((row) => row.getCell("url")),
    history_version: await harness.runtime.history.latestVersion(harness.app_id),
    ...(await lifecycleDefinitionFacts(harness)),
  };
  liveResults.push(harness.result);
  sendLifecycleState(ws, harness.result_path, harness.result);
  sendLifecycleToast(ws, "Capability rolled back", "info");
}

async function sendLiveRollbackPrompt(
  ws: ServerWebSocket<WsData>,
  harness: LiveRollbackHarness,
): Promise<void> {
  if (harness.result) {
    sendLiveResult(ws, harness, harness.result);
    return;
  }
  const validation = (await harness.runtime.executor.invoke(
    harness.runtime.getOperation(DEFINITION_ROLLBACK_VALIDATE_OP_ID)!,
    { target_history_version: 0 },
    harness.frameworkCtx,
  )).output as Record<string, unknown>;

  ws.send(JSON.stringify({
    dir: "a2v",
    kind: "permission-prompt",
    prompt: {
      id: harness.prompt_id,
      tool: "definition.rollback.validate",
      detail: validation,
    },
  }));
}

async function handleLiveRollbackResponse(
  ws: ServerWebSocket<WsData>,
  harness: LiveRollbackHarness,
  decision: "allow" | "deny" | "allow-always",
): Promise<void> {
  if (decision === "deny") {
    const table = await harness.runtime.storage.getTable("bookmarks");
    const rows = await harness.runtime.storage.listRowsByTable("bookmarks");
    harness.result = {
      decision,
      executed: false,
      after_columns: table?.columns.map((column) => column.name) ?? [],
      row_has_tags: rows.some((row) => row.hasCell("tags")),
    };
    liveResults.push(harness.result);
    sendLiveResult(ws, harness, harness.result);
    return;
  }

  const opResult = await harness.runtime.executor.invoke(
    harness.runtime.getOperation(DEFINITION_ROLLBACK_EXECUTE_OP_ID)!,
    { target_history_version: 0 },
    harness.frameworkCtx,
    { confirmed: true },
  );
  await harness.runtime.close();
  harness.runtime = await bootAppRuntime(harness.makeConfig());

  const table = await harness.runtime.storage.getTable("bookmarks");
  const rows = await harness.runtime.storage.listRowsByTable("bookmarks");
  harness.result = {
    decision,
    executed: true,
    output: opResult.output,
    after_columns: table?.columns.map((column) => column.name) ?? [],
    row_count: rows.length,
    row_has_tags: rows.some((row) => row.hasCell("tags")),
    history_version: await harness.runtime.history.latestVersion(harness.app_id),
  };
  liveResults.push(harness.result);
  sendLiveResult(ws, harness, harness.result);
}

async function handleLiveOperationRollbackResponse(
  ws: ServerWebSocket<WsData>,
  harness: LiveRollbackHarness,
  decision: "allow" | "deny" | "allow-always",
): Promise<void> {
  const rowsBefore = await harness.runtime.storage.listRowsByTable("bookmarks");
  const operationBefore = harness.runtime.getOperation("list_bookmark_urls");
  const beforeOutput = operationBefore
    ? await harness.runtime.queryExec.run(operationBefore, {}, harness.frameworkCtx)
    : { rows: [] };

  if (decision === "deny") {
    harness.result = {
      decision,
      executed: false,
      operation_visible_before: operationBefore !== undefined,
      operation_visible_after: harness.runtime.getOperation("list_bookmark_urls") !== undefined,
      before_output: beforeOutput,
      row_count: rowsBefore.length,
    };
    liveResults.push(harness.result);
    sendLiveResult(ws, harness, harness.result);
    return;
  }

  const opResult = await harness.runtime.executor.invoke(
    harness.runtime.getOperation(DEFINITION_ROLLBACK_EXECUTE_OP_ID)!,
    { target_history_version: 0 },
    harness.frameworkCtx,
    { confirmed: true },
  );
  await harness.runtime.close();
  harness.runtime = await bootAppRuntime(harness.makeConfig());

  const rowsAfter = await harness.runtime.storage.listRowsByTable("bookmarks");
  harness.result = {
    decision,
    executed: true,
    output: opResult.output,
    operation_visible_before: operationBefore !== undefined,
    operation_visible_after: harness.runtime.getOperation("list_bookmark_urls") !== undefined,
    before_output: beforeOutput,
    operation_lookup_after_restart: harness.runtime.getOperation("list_bookmark_urls")?.id ?? null,
    row_count: rowsAfter.length,
    preserved_bookmark_urls: rowsAfter.map((row) => row.getCell("url")),
    history_version: await harness.runtime.history.latestVersion(harness.app_id),
  };
  liveResults.push(harness.result);
  sendLiveResult(ws, harness, harness.result);
}

function sendLiveResult(
  ws: ServerWebSocket<WsData>,
  harness: LiveRollbackHarness,
  result: Record<string, unknown>,
): void {
  ws.send(JSON.stringify({
    dir: "a2v",
    kind: "state",
    state: {
      path: harness.result_path,
      content: JSON.stringify(result, null, 2),
      ts: Date.now(),
    },
  }));
  ws.send(JSON.stringify({
    dir: "a2v",
    kind: "viewer-request",
    req: {
      kind: "toast",
      level: result.executed === true ? "info" : "warn",
      message: result.executed === true
        ? "Rollback execute completed"
        : "Rollback execute denied",
    },
  }));
}

function sendLifecycleState(
  ws: ServerWebSocket<WsData>,
  path: string,
  content: Record<string, unknown>,
): void {
  ws.send(JSON.stringify({
    dir: "a2v",
    kind: "state",
    state: {
      path,
      content: JSON.stringify(content, null, 2),
      ts: Date.now(),
    },
  }));
}

function sendLifecycleToast(
  ws: ServerWebSocket<WsData>,
  message: string,
  level: "info" | "warn",
): void {
  ws.send(JSON.stringify({
    dir: "a2v",
    kind: "viewer-request",
    req: { kind: "toast", level, message },
  }));
}

function sendLifecycleError(
  ws: ServerWebSocket<WsData>,
  harness: CapabilityLifecycleHarness,
  err: unknown,
): void {
  sendLifecycleState(ws, harness.error_path, {
    error: err instanceof Error ? err.message : String(err),
  });
}

async function lifecycleDefinitionFacts(
  harness: CapabilityLifecycleHarness,
): Promise<Record<string, unknown>> {
  const operationRows = await harness.runtime.storage.listRowsByTable(PNEUMA_OPERATIONS_TABLE_ID);
  const bookmarkTable = await harness.runtime.storage.getTable("bookmarks");
  const bookmarkRows = await harness.runtime.storage.listRowsByTable("bookmarks");
  const historyEntries = await harness.runtime.history.listEntries(harness.app_id, { direction: "asc" });
  return {
    schema_tables: bookmarkTable
      ? [{
        table_id: bookmarkTable.id,
        source_kind: bookmarkTable.source.kind,
        system_owned: bookmarkTable.system_owned,
        columns: bookmarkTable.columns.map((column) => ({
          name: column.name,
          type: describeCellType(column.type),
          nullable: column.nullable === true,
        })),
        demo_rows: bookmarkRows.map((row) => row.toRowView()),
      }]
      : [],
    definition_operations: operationRows.map((row) => {
      const handler = row.getCell("handler");
      const affects = row.getCell("affects");
      return {
        row_id: row.id,
        operation_id: row.getCell("operation_id"),
        name: row.getCell("name"),
        handler_kind: objectField(handler, "kind"),
        source_table: objectField(handler, "on"),
        action: objectField(affects, "action"),
        reads_only: objectField(affects, "reads_only"),
        definition_version: row.getCell("definition_version"),
        created_by_kind: row.getCell("created_by_kind"),
      };
    }),
    history_entries: historyEntries.map((entry) => ({
      version: entry.version,
      actor_kind: entry.actor_kind,
      description: entry.description ?? "",
      operation_scope: entry.operation_scope ?? [],
    })),
  };
}

function describeCellType(type: CellType): string {
  if (type.kind === "primitive") return type.of;
  if (type.kind === "json") return "JSON";
  if (type.kind === "vector") return `Vector(${type.dim})`;
  if (type.kind === "blob") return `Blob(${type.mime})`;
  if (type.kind === "ref-row") return `Ref(${type.table})`;
  if (type.kind === "ref-row-list") return `RefList(${type.table})`;
  if (type.kind === "ref-external") return `External(${type.adapter}.${type.externalType})`;
  return `Derived(${type.transform})`;
}

function objectField(source: unknown, key: string): unknown {
  return source && typeof source === "object"
    ? (source as Record<string, unknown>)[key]
    : undefined;
}

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>P5 Viewer Approval E2E</title>
  </head>
  <body style="margin:0">
    <div id="root"></div>
    <script type="module" src="/main.js"></script>
  </body>
</html>`;

const server = Bun.serve({
  port: Number(process.env.PORT ?? 0),
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const scenario = url.searchParams.get("scenario") ?? "apply";
      return server.upgrade(req, { data: { scenario } })
        ? undefined
        : new Response("upgrade failed", { status: 500 });
    }
    if (url.pathname === "/main.js") {
      return new Response(readFileSync(join(import.meta.dir, "dist/main.js")), {
        headers: { "content-type": "text/javascript; charset=utf-8" },
      });
    }
    if (url.pathname === "/events") {
      return Response.json({ responses, liveResults });
    }
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  },
  websocket: {
    open(ws) {
      const data = ws.data as WsData | undefined;
      if (data?.scenario === "rollback-execute" || data?.scenario === "operation-rollback-execute") {
        setTimeout(() => {
          void (async () => {
            const harness = data.scenario === "operation-rollback-execute"
              ? await createLiveOperationRollbackHarness()
              : await createLiveRollbackHarness();
            data.rollbackHarness = harness;
            await sendLiveRollbackPrompt(ws as ServerWebSocket<WsData>, harness);
          })().catch((err) => {
            ws.send(JSON.stringify({
              dir: "a2v",
              kind: "state",
              state: {
                path: data.scenario === "operation-rollback-execute"
                  ? "operation-rollback-execute/error"
                  : "rollback-execute/error",
                content: err instanceof Error ? err.message : String(err),
                ts: Date.now(),
              },
            }));
          });
        }, 50);
        return;
      }
      if (data?.scenario === "capability-lifecycle") {
        setTimeout(() => {
          void (async () => {
            const harness = await createCapabilityLifecycleHarness();
            data.lifecycleHarness = harness;
            await sendCapabilityLifecycleStart(ws as ServerWebSocket<WsData>, harness);
          })().catch((err) => {
            ws.send(JSON.stringify({
              dir: "a2v",
              kind: "state",
              state: {
                path: "capability-lifecycle/error",
                content: err instanceof Error ? err.message : String(err),
                ts: Date.now(),
              },
            }));
          });
        }, 50);
        return;
      }
      setTimeout(() => ws.send(JSON.stringify(promptForScenario(data?.scenario))), 50);
    },
    message(ws, message) {
      const env = JSON.parse(String(message)) as {
        kind?: string;
        action?: { kind?: string; target?: string; text?: string; meta?: Record<string, unknown> };
        response?: { id?: string; decision?: "allow" | "deny" | "allow-always" };
      };
      responses.push(env);
      const data = ws.data as WsData | undefined;
      if (
        data?.scenario === "capability-lifecycle"
        && env.kind === "action"
        && env.action?.kind === "click"
      ) {
        void (async () => {
          const harness = data.lifecycleHarness ?? await createCapabilityLifecycleHarness();
          data.lifecycleHarness = harness;
          if (env.action?.target === "capability.request-add") {
            sendCapabilityLifecycleAddPrompt(ws as ServerWebSocket<WsData>, harness);
          }
          if (env.action?.target === "capability.request-rollback") {
            await sendCapabilityLifecycleRollbackPrompt(ws as ServerWebSocket<WsData>, harness);
          }
        })().catch((err) => {
          const harness = data.lifecycleHarness;
          if (harness) sendLifecycleError(ws as ServerWebSocket<WsData>, harness, err);
        });
      }
      if (
        data?.scenario === "rollback-execute"
        && env.kind === "permission-response"
        && env.response?.id === "pneuma:definition-rollback-execute:live-e2e"
        && env.response.decision
      ) {
        void (async () => {
          const harness = data.rollbackHarness ?? await createLiveRollbackHarness();
          data.rollbackHarness = harness;
          await handleLiveRollbackResponse(
            ws as ServerWebSocket<WsData>,
            harness,
            env.response!.decision!,
          );
        })().catch((err) => {
          ws.send(JSON.stringify({
            dir: "a2v",
            kind: "state",
            state: {
              path: "rollback-execute/error",
              content: err instanceof Error ? err.message : String(err),
              ts: Date.now(),
            },
          }));
        });
      }
      if (
        data?.scenario === "operation-rollback-execute"
        && env.kind === "permission-response"
        && env.response?.id === "pneuma:operation-rollback-execute:live-e2e"
        && env.response.decision
      ) {
        void (async () => {
          const harness = data.rollbackHarness ?? await createLiveOperationRollbackHarness();
          data.rollbackHarness = harness;
          await handleLiveOperationRollbackResponse(
            ws as ServerWebSocket<WsData>,
            harness,
            env.response!.decision!,
          );
        })().catch((err) => {
          ws.send(JSON.stringify({
            dir: "a2v",
            kind: "state",
            state: {
              path: "operation-rollback-execute/error",
              content: err instanceof Error ? err.message : String(err),
              ts: Date.now(),
            },
          }));
        });
      }
      if (
        data?.scenario === "capability-lifecycle"
        && env.kind === "permission-response"
        && env.response?.id === "pneuma:capability-lifecycle:add-operation"
        && env.response.decision
      ) {
        void (async () => {
          const harness = data.lifecycleHarness ?? await createCapabilityLifecycleHarness();
          data.lifecycleHarness = harness;
          await handleCapabilityLifecycleAddResponse(
            ws as ServerWebSocket<WsData>,
            harness,
            env.response!.decision!,
          );
        })().catch((err) => {
          const harness = data.lifecycleHarness;
          if (harness) sendLifecycleError(ws as ServerWebSocket<WsData>, harness, err);
        });
      }
      if (
        data?.scenario === "capability-lifecycle"
        && env.kind === "permission-response"
        && env.response?.id === "pneuma:capability-lifecycle:rollback-operation"
        && env.response.decision
      ) {
        void (async () => {
          const harness = data.lifecycleHarness ?? await createCapabilityLifecycleHarness();
          data.lifecycleHarness = harness;
          await handleCapabilityLifecycleRollbackResponse(
            ws as ServerWebSocket<WsData>,
            harness,
            env.response!.decision!,
          );
        })().catch((err) => {
          const harness = data.lifecycleHarness;
          if (harness) sendLifecycleError(ws as ServerWebSocket<WsData>, harness, err);
        });
      }
    },
  },
});

console.log(`p5-viewer-approval-e2e http://127.0.0.1:${server.port}`);
