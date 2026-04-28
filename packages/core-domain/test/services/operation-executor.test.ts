import { describe, expect, test } from "bun:test";
import { Operation } from "../../src/aggregates/operation.js";
import { PolicySet, Resources, Subjects } from "../../src/aggregates/policy-set.js";
import { Row } from "../../src/aggregates/row.js";
import { Table } from "../../src/aggregates/table.js";
import {
  EventStream,
  InMemoryEventSink,
} from "../../src/aggregates/event-stream.js";
import { InMemoryRepository } from "../../src/repositories/types.js";
import {
  HandlerRegistry,
  OperationExecutor,
} from "../../src/services/operation-executor.js";
import { PolicyEvaluator } from "../../src/services/policy-evaluator.js";
import { StorageService } from "../../src/services/storage-service.js";
import { buildRootContext } from "../../src/value-objects/permission-context.js";
import type { CellType } from "../../src/value-objects/cell-type.js";

const APP = "operation-executor-readonly-test";
const URL_T: CellType = { kind: "primitive", of: "URL" };

async function readonlyHarness(handlerRef: string) {
  const tables = new InMemoryRepository<Table>((table) => table.id);
  const rows = new InMemoryRepository<Row>((row) => row.id);
  const storage = new StorageService(tables, rows);
  await tables.save(
    new Table({
      id: "bookmarks",
      app_id: APP,
      source: { kind: "stored" },
      columns: [{ name: "url", type: URL_T }],
    }),
  );

  const op = new Operation({
    id: "computed_bookmarks",
    app_id: APP,
    name: "Computed bookmarks",
    description: "A read-only code operation.",
    input: { type: "record", fields: {} },
    output: { kind: "object", schema: { type: "object", properties: {} } },
    affects: { mutations: [], adapter_writes: [], reads_only: true, destructive: false },
    handler: { kind: "code", ref: handlerRef },
  });

  const policy = new PolicySet({ app_id: APP });
  policy.addRule({
    id: "allow-computed",
    allow: [Subjects.anyone(), Subjects.anonymous()],
    do: ["invoke"],
    on: Resources.operation(op.id),
  });

  const events = new EventStream(APP, new InMemoryEventSink(), new InMemoryEventSink());
  const handlers = new HandlerRegistry();
  const executor = new OperationExecutor(
    new PolicyEvaluator(policy.compile()),
    events,
    storage,
    handlers,
  );
  const ctx = buildRootContext({
    app_id: APP,
    invoked_via: "agent",
    user: { id: "agent", attrs: {}, roles: [] },
  });

  return { storage, handlers, executor, op, ctx };
}

describe("OperationExecutor · reads_only code handler isolation", () => {
  test("blocks saveRow from reads_only code handlers", async () => {
    const { storage, handlers, executor, op, ctx } = await readonlyHarness("./ops/save.ts");
    handlers.registerHandler("./ops/save.ts", async ({ storage: handlerStorage }) => {
      await handlerStorage.saveRow(new Row({
        id: "bookmark-write",
        app_id: APP,
        table_id: "bookmarks",
        cells: { url: "https://example.com/write" },
      }));
      return { ok: true };
    });

    await expect(executor.invoke(op, {}, ctx)).rejects.toMatchObject({
      kind: "read_only_storage_write",
    });
    expect(await storage.getRow("bookmark-write")).toBeUndefined();
  });

  test("blocks deleteRow from reads_only code handlers", async () => {
    const { storage, handlers, executor, op, ctx } = await readonlyHarness("./ops/delete.ts");
    await storage.saveRow(new Row({
      id: "bookmark-existing",
      app_id: APP,
      table_id: "bookmarks",
      cells: { url: "https://example.com/existing" },
    }));
    handlers.registerHandler("./ops/delete.ts", async ({ storage: handlerStorage }) => {
      await handlerStorage.deleteRow("bookmark-existing");
      return { ok: true };
    });

    await expect(executor.invoke(op, {}, ctx)).rejects.toMatchObject({
      kind: "read_only_storage_write",
    });
    expect(await storage.getRow("bookmark-existing")).toBeDefined();
  });
});
