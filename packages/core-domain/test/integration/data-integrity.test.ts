// 数据完整性边界场景组:
//   1. 级联删除穿透 ref-row 链 (A→B→C)
//   2. saveRow 时 ref-row 目标不存在 → 拒绝
//   3. saveRow 时 required column 缺失 → 拒绝
//   4. saveRow 时 cell 值类型不匹配 schema → 拒绝
//   5. system-owned Table 拒绝 dropColumn / addColumn
//   6. Query 空结果正常返回 { rows: [] }
//   7. Operation 失败时 audit "operation.failed" 事件带 error

import { describe, test, expect } from "bun:test";
import { Table } from "../../src/aggregates/table.js";
import { Row } from "../../src/aggregates/row.js";
import { Operation } from "../../src/aggregates/operation.js";
import {
  PolicySet,
  Subjects,
  Resources,
} from "../../src/aggregates/policy-set.js";
import {
  EventStream,
  InMemoryEventSink,
} from "../../src/aggregates/event-stream.js";
import { Adapter } from "../../src/aggregates/adapter.js";
import { InMemoryRepository } from "../../src/repositories/types.js";
import {
  StorageService,
  StorageError,
} from "../../src/services/storage-service.js";
import { PolicyEvaluator } from "../../src/services/policy-evaluator.js";
import {
  OperationExecutor,
  HandlerRegistry,
  type HandlerFn,
} from "../../src/services/operation-executor.js";
import {
  AdapterInvoker,
  InMemoryCredentialStore,
} from "../../src/services/adapter-invoker.js";
import { QueryExecutor } from "../../src/services/query-executor.js";
import { TableInvariantViolation } from "../../src/aggregates/table.js";
import { buildRootContext } from "../../src/value-objects/permission-context.js";
import type { CellType } from "../../src/value-objects/cell-type.js";
import type { Ref } from "../../src/value-objects/ref.js";
import {
  createIdentitySystemTables,
} from "../../src/services/identity-registry.js";

const APP = "data-integrity";
const TEXT: CellType = { kind: "primitive", of: "Text" };

async function baseHarness() {
  const tables = new InMemoryRepository<Table>((t) => t.id);
  const rows = new InMemoryRepository<Row>((r) => r.id);
  const adapters = new InMemoryRepository<Adapter>((a) => a.id);
  const credentials = new InMemoryCredentialStore();
  const invoker = new AdapterInvoker(credentials, new Map());
  const storage = new StorageService(tables, rows);
  const queryExec = new QueryExecutor(storage, invoker, adapters);
  const debug = new InMemoryEventSink();
  const audit = new InMemoryEventSink();
  const events = new EventStream(APP, debug, audit);
  return { tables, rows, storage, queryExec, events, audit, debug, adapters };
}

describe("Integrity · ref-row target existence (ADR-0002)", () => {
  test("saveRow with ref-row to non-existent target → StorageError", async () => {
    const { tables, storage } = await baseHarness();
    const t = new Table({
      id: "posts",
      app_id: APP,
      columns: [
        { name: "title", type: TEXT },
        {
          name: "author",
          type: { kind: "ref-row", table: "authors" },
        },
      ],
      source: { kind: "stored" },
    });
    // no 'authors' table, no author rows
    await tables.save(t);
    // authors table doesn't exist → resolving ref-row target will fail
    const authorsTable = new Table({
      id: "authors",
      app_id: APP,
      columns: [{ name: "name", type: TEXT }],
      source: { kind: "stored" },
    });
    await tables.save(authorsTable);

    const post = new Row({
      id: "p1",
      table_id: "posts",
      app_id: APP,
      cells: {
        title: "Hi",
        author: { kind: "row", table: "authors", id: "ghost" } satisfies Ref,
      },
    });
    await expect(storage.saveRow(post)).rejects.toBeInstanceOf(StorageError);
  });

  test("saveRow with checkRefIntegrity=false skips check (useful for bulk import)", async () => {
    const { tables, storage } = await baseHarness();
    const posts = new Table({
      id: "posts",
      app_id: APP,
      columns: [
        { name: "title", type: TEXT },
        { name: "author", type: { kind: "ref-row", table: "authors" } },
      ],
      source: { kind: "stored" },
    });
    const authors = new Table({
      id: "authors",
      app_id: APP,
      columns: [{ name: "name", type: TEXT }],
      source: { kind: "stored" },
    });
    await tables.save(posts);
    await tables.save(authors);

    const post = new Row({
      id: "p1",
      table_id: "posts",
      app_id: APP,
      cells: {
        title: "Hi",
        author: { kind: "row", table: "authors", id: "ghost" } satisfies Ref,
      },
    });
    // skip check — no throw
    await expect(
      storage.saveRow(post, { checkRefIntegrity: false })
    ).resolves.toBeUndefined();
  });

  test("ref-row target must match declared table", async () => {
    const { tables, storage } = await baseHarness();
    const posts = new Table({
      id: "posts",
      app_id: APP,
      columns: [
        { name: "author", type: { kind: "ref-row", table: "authors" } },
      ],
      source: { kind: "stored" },
    });
    const authors = new Table({
      id: "authors",
      app_id: APP,
      columns: [{ name: "name", type: TEXT }],
      source: { kind: "stored" },
    });
    const otherTable = new Table({
      id: "pages",
      app_id: APP,
      columns: [{ name: "slug", type: TEXT }],
      source: { kind: "stored" },
    });
    await tables.save(posts);
    await tables.save(authors);
    await tables.save(otherTable);

    const pageRow = new Row({
      id: "page1",
      table_id: "pages",
      app_id: APP,
      cells: { slug: "/hi" },
    });
    await storage.saveRow(pageRow);

    // Post's author cell says table:authors but Ref.table says pages — invalid at cell level first,
    // but even if we managed to pass the cell validator, ensureRefExists would catch it:
    // here cell type is ref-row<authors>, Ref.table=pages → isValidCellValue returns false (table mismatch)
    const post = new Row({
      id: "p1",
      table_id: "posts",
      app_id: APP,
      cells: {
        author: { kind: "row", table: "pages", id: "page1" } satisfies Ref,
      },
    });
    await expect(storage.saveRow(post)).rejects.toBeInstanceOf(StorageError);
  });
});

describe("Integrity · required columns + cell type (ADR-0002)", () => {
  test("required column (nullable=false) missing → reject", async () => {
    const { tables, storage } = await baseHarness();
    const t = new Table({
      id: "items",
      app_id: APP,
      columns: [
        { name: "name", type: TEXT }, // nullable undefined → required
        { name: "note", type: TEXT, nullable: true },
      ],
      source: { kind: "stored" },
    });
    await tables.save(t);

    const r = new Row({
      id: "r1",
      table_id: "items",
      app_id: APP,
      cells: { note: "only optional filled" },
    });
    await expect(storage.saveRow(r)).rejects.toBeInstanceOf(StorageError);
  });

  test("cell value type mismatch → reject (number in Text column)", async () => {
    const { tables, storage } = await baseHarness();
    const t = new Table({
      id: "items",
      app_id: APP,
      columns: [{ name: "label", type: TEXT }],
      source: { kind: "stored" },
    });
    await tables.save(t);

    const r = new Row({
      id: "r1",
      table_id: "items",
      app_id: APP,
      cells: { label: 42 }, // number into Text
    });
    await expect(storage.saveRow(r)).rejects.toBeInstanceOf(StorageError);
  });

  test("unknown cell (not in columns) → reject", async () => {
    const { tables, storage } = await baseHarness();
    const t = new Table({
      id: "items",
      app_id: APP,
      columns: [{ name: "label", type: TEXT }],
      source: { kind: "stored" },
    });
    await tables.save(t);

    const r = new Row({
      id: "r1",
      table_id: "items",
      app_id: APP,
      cells: { label: "ok", mystery: "unknown column" },
    });
    await expect(storage.saveRow(r)).rejects.toBeInstanceOf(StorageError);
  });
});

describe("Integrity · cascade chain (ref-row cascade_on_target_delete)", () => {
  test("deleting A cascades through B to C (3-level chain)", async () => {
    const { tables, storage } = await baseHarness();

    const a = new Table({
      id: "a",
      app_id: APP,
      columns: [{ name: "name", type: TEXT }],
      source: { kind: "stored" },
    });
    const b = new Table({
      id: "b",
      app_id: APP,
      columns: [
        {
          name: "a_ref",
          type: { kind: "ref-row", table: "a" },
          cascade_on_target_delete: true,
        },
      ],
      source: { kind: "stored" },
    });
    const c = new Table({
      id: "c",
      app_id: APP,
      columns: [
        {
          name: "b_ref",
          type: { kind: "ref-row", table: "b" },
          cascade_on_target_delete: true,
        },
      ],
      source: { kind: "stored" },
    });
    await tables.save(a);
    await tables.save(b);
    await tables.save(c);

    const a1 = new Row({ id: "a1", table_id: "a", app_id: APP, cells: { name: "A1" } });
    await storage.saveRow(a1);
    const b1 = new Row({
      id: "b1",
      table_id: "b",
      app_id: APP,
      cells: { a_ref: { kind: "row", table: "a", id: "a1" } satisfies Ref },
    });
    await storage.saveRow(b1);
    const c1 = new Row({
      id: "c1",
      table_id: "c",
      app_id: APP,
      cells: { b_ref: { kind: "row", table: "b", id: "b1" } satisfies Ref },
    });
    await storage.saveRow(c1);

    const result = await storage.deleteRow("a1");
    expect(result.deleted.sort()).toEqual(["a1", "b1", "c1"].sort());

    expect(await storage.getRow("a1")).toBeUndefined();
    expect(await storage.getRow("b1")).toBeUndefined();
    expect(await storage.getRow("c1")).toBeUndefined();
  });

  test("cascade_on_target_delete=false: deleting target leaves orphan intact", async () => {
    const { tables, storage } = await baseHarness();

    const parent = new Table({
      id: "parent",
      app_id: APP,
      columns: [{ name: "name", type: TEXT }],
      source: { kind: "stored" },
    });
    const child = new Table({
      id: "child",
      app_id: APP,
      columns: [
        {
          name: "parent_ref",
          type: { kind: "ref-row", table: "parent" },
          // cascade_on_target_delete NOT set (undefined = false)
        },
      ],
      source: { kind: "stored" },
    });
    await tables.save(parent);
    await tables.save(child);

    const p = new Row({ id: "p1", table_id: "parent", app_id: APP, cells: { name: "P" } });
    await storage.saveRow(p);
    const c = new Row({
      id: "c1",
      table_id: "child",
      app_id: APP,
      cells: { parent_ref: { kind: "row", table: "parent", id: "p1" } satisfies Ref },
    });
    await storage.saveRow(c);

    const result = await storage.deleteRow("p1");
    expect(result.deleted).toEqual(["p1"]); // only parent deleted; child orphaned
    expect(await storage.getRow("c1")).toBeDefined();
  });

  test("ref-row-list cascade: any list item pointing to deleted row → child row deleted", async () => {
    const { tables, storage } = await baseHarness();

    const tag = new Table({
      id: "tags",
      app_id: APP,
      columns: [{ name: "name", type: TEXT }],
      source: { kind: "stored" },
    });
    const post = new Table({
      id: "posts",
      app_id: APP,
      columns: [
        {
          name: "tag_refs",
          type: { kind: "ref-row-list", table: "tags" },
          cascade_on_target_delete: true,
        },
      ],
      source: { kind: "stored" },
    });
    await tables.save(tag);
    await tables.save(post);

    const tagA = new Row({ id: "tag-a", table_id: "tags", app_id: APP, cells: { name: "A" } });
    const tagB = new Row({ id: "tag-b", table_id: "tags", app_id: APP, cells: { name: "B" } });
    await storage.saveRow(tagA);
    await storage.saveRow(tagB);

    const p1 = new Row({
      id: "p1",
      table_id: "posts",
      app_id: APP,
      cells: {
        tag_refs: [
          { kind: "row", table: "tags", id: "tag-a" } satisfies Ref,
          { kind: "row", table: "tags", id: "tag-b" } satisfies Ref,
        ],
      },
    });
    await storage.saveRow(p1);

    // delete tag-a → p1 cascades (since tag_refs list contains a ref to tag-a)
    const result = await storage.deleteRow("tag-a");
    expect(result.deleted.sort()).toEqual(["p1", "tag-a"].sort());
  });
});

describe("Integrity · system_owned protection (ADR-0002 + decision 3)", () => {
  test("createIdentitySystemTables produces system_owned Tables", async () => {
    const { users, roles, memberships } = createIdentitySystemTables(APP);
    expect(users.system_owned).toBe(true);
    expect(roles.system_owned).toBe(true);
    expect(memberships.system_owned).toBe(true);
  });

  test("dropColumn on system_owned rejected", async () => {
    const { users } = createIdentitySystemTables(APP);
    expect(() => users.dropColumn("email")).toThrow(TableInvariantViolation);
  });

  test("addColumn on system_owned rejected", async () => {
    const { users } = createIdentitySystemTables(APP);
    expect(() =>
      users.addColumn({ name: "extra", type: TEXT })
    ).toThrow(TableInvariantViolation);
  });

  test("changeColumn on system_owned rejected", async () => {
    const { users } = createIdentitySystemTables(APP);
    expect(() =>
      users.changeColumn("email", { type: { kind: "primitive", of: "RichText" } })
    ).toThrow(TableInvariantViolation);
  });
});

describe("Integrity · empty query result", () => {
  test("Query with no matching rows returns { rows: [] } (not throw)", async () => {
    const { tables, storage, queryExec } = await baseHarness();
    const t = new Table({
      id: "items",
      app_id: APP,
      columns: [{ name: "status", type: TEXT }],
      source: { kind: "stored" },
    });
    await tables.save(t);
    // store some items but none matching
    const r1 = new Row({ id: "r1", table_id: "items", app_id: APP, cells: { status: "done" } });
    const r2 = new Row({ id: "r2", table_id: "items", app_id: APP, cells: { status: "done" } });
    await storage.saveRow(r1);
    await storage.saveRow(r2);

    const op = new Operation({
      id: "pending_items",
      app_id: APP,
      name: "pending",
      description: "x",
      input: { type: "record", fields: {} },
      output: { kind: "row-list", row_type: "items" },
      affects: { mutations: [], adapter_writes: [], reads_only: true, destructive: false },
      handler: {
        kind: "query",
        on: "items",
        filter: {
          kind: "leaf",
          subject: { ns: "row", path: ["status"] },
          op: "eq",
          value: "pending", // no matches
        },
        pagination: { kind: "cursor", size: 25 },
      },
    });

    const ctx = buildRootContext({ app_id: APP, invoked_via: "ui" });
    const result = await queryExec.run(op, {}, ctx);
    expect(result.rows).toEqual([]);
  });
});

describe("Integrity · operation failure audit", () => {
  test("handler throws → audit 'operation.failed' event + re-throws", async () => {
    const { storage, events, audit } = await baseHarness();

    const op = new Operation({
      id: "boomie",
      app_id: APP,
      name: "boom",
      description: "always throws",
      input: { type: "record", fields: {} },
      output: { kind: "void" },
      affects: { mutations: [], adapter_writes: [], reads_only: false, destructive: false },
      handler: { kind: "code", ref: "./ops/boom.ts" },
    });
    const handlers = new HandlerRegistry();
    handlers.registerHandler("./ops/boom.ts", (async () => {
      throw new Error("kaboom");
    }) as HandlerFn);

    const policy = new PolicySet({ app_id: APP });
    policy.addRule({
      id: "allow-all",
      allow: [Subjects.any()],
      do: ["invoke"],
      on: Resources.operation("boomie"),
    });
    const executor = new OperationExecutor(
      new PolicyEvaluator(policy.compile()),
      events,
      storage,
      handlers
    );

    const ctx = buildRootContext({ app_id: APP, invoked_via: "ui" });
    await expect(executor.invoke(op, {}, ctx)).rejects.toThrow(/kaboom/);

    const failed = audit.events.find(
      (e) => (e.payload as { phase?: string }).phase === "failed"
    );
    expect(failed).toBeDefined();
    expect((failed!.payload as { error: string }).error).toContain("kaboom");
  });
});
