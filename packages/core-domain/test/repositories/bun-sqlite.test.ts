// BunSqliteRowRepository — persistence 等价性测试.
// 1. 基本 CRUD (get / list / save / delete) 行为跟 InMemoryRepository 一致
// 2. cell 值 round-trip (Uint8Array / Ref / json 结构)
// 3. 插入 StorageService 仍然通过已有的 ref 完整性 / cascade 路径

import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { Row } from "../../src/aggregates/row.js";
import { Table } from "../../src/aggregates/table.js";
import {
  BunSqliteRowRepository,
  openRowDatabase,
} from "../../src/repositories/bun-sqlite.js";
import { InMemoryRepository } from "../../src/repositories/types.js";
import { StorageService } from "../../src/services/storage-service.js";
import type { CellType } from "../../src/value-objects/cell-type.js";
import type { Ref } from "../../src/value-objects/ref.js";

const TEXT: CellType = { kind: "primitive", of: "Text" };
const APP = "sqlite-test";

describe("BunSqliteRowRepository · CRUD", () => {
  let db: Database;
  let repo: BunSqliteRowRepository;

  beforeEach(() => {
    db = openRowDatabase(":memory:");
    repo = new BunSqliteRowRepository(db);
  });

  test("save + get preserves basic row", async () => {
    const r = new Row({
      id: "r1",
      table_id: "bookmarks",
      app_id: APP,
      cells: { title: "Hi", note: "there" },
      created_at: 1000,
      updated_at: 2000,
      owner_id: "alice",
    });
    await repo.save(r);

    const got = await repo.get("r1");
    expect(got).toBeDefined();
    expect(got!.id).toBe("r1");
    expect(got!.table_id).toBe("bookmarks");
    expect(got!.app_id).toBe(APP);
    expect(got!.created_at).toBe(1000);
    expect(got!.updated_at).toBe(2000);
    expect(got!.owner_id).toBe("alice");
    expect(got!.getCell("title")).toBe("Hi");
    expect(got!.getCell("note")).toBe("there");
  });

  test("owner_id null survives round-trip as undefined", async () => {
    const r = new Row({
      id: "r1",
      table_id: "t",
      app_id: APP,
      cells: {},
    });
    await repo.save(r);
    const got = await repo.get("r1");
    expect(got!.owner_id).toBeUndefined();
  });

  test("get returns undefined for missing id", async () => {
    expect(await repo.get("nope")).toBeUndefined();
  });

  test("list returns all saved rows in id order", async () => {
    await repo.save(
      new Row({ id: "r1", table_id: "t", app_id: APP, cells: {} })
    );
    await repo.save(
      new Row({ id: "r2", table_id: "t", app_id: APP, cells: {} })
    );
    await repo.save(
      new Row({ id: "r3", table_id: "t", app_id: APP, cells: {} })
    );
    const all = await repo.list();
    expect(all.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
  });

  test("save overwrites existing row (INSERT OR REPLACE)", async () => {
    await repo.save(
      new Row({ id: "r1", table_id: "t", app_id: APP, cells: { v: "v1" } })
    );
    await repo.save(
      new Row({ id: "r1", table_id: "t", app_id: APP, cells: { v: "v2" } })
    );
    const got = await repo.get("r1");
    expect(got!.getCell("v")).toBe("v2");
    expect(repo.size()).toBe(1);
  });

  test("delete removes row and returns true; missing returns false", async () => {
    await repo.save(
      new Row({ id: "r1", table_id: "t", app_id: APP, cells: {} })
    );
    expect(await repo.delete("r1")).toBe(true);
    expect(await repo.get("r1")).toBeUndefined();
    expect(await repo.delete("r1")).toBe(false);
  });

  test("persists across repo re-instantiation on same db", async () => {
    await repo.save(
      new Row({ id: "r1", table_id: "t", app_id: APP, cells: { x: "alpha" } })
    );
    const repo2 = new BunSqliteRowRepository(db);
    const got = await repo2.get("r1");
    expect(got!.getCell("x")).toBe("alpha");
  });
});

describe("BunSqliteRowRepository · cell value round-trip", () => {
  let repo: BunSqliteRowRepository;
  beforeEach(() => {
    repo = new BunSqliteRowRepository(openRowDatabase(":memory:"));
  });

  test("Ref<row> cell round-trips", async () => {
    const ref: Ref = { kind: "row", table: "users", id: "u1" };
    const r = new Row({
      id: "r1",
      table_id: "memberships",
      app_id: APP,
      cells: { user_id: ref },
    });
    await repo.save(r);
    const got = (await repo.get("r1"))!;
    const back = got.getCell("user_id");
    expect(back).toEqual(ref);
  });

  test("Ref<external> cell round-trips", async () => {
    const ref: Ref = {
      kind: "external",
      adapter: "linear",
      externalType: "Issue",
      external_id: "LIN-1",
    };
    const r = new Row({
      id: "r1",
      table_id: "issues_cached",
      app_id: APP,
      cells: { linear_ref: ref },
    });
    await repo.save(r);
    const got = (await repo.get("r1"))!;
    expect(got.getCell("linear_ref")).toEqual(ref);
  });

  test("ref-row-list cell (array of Refs) round-trips", async () => {
    const refs: Ref[] = [
      { kind: "row", table: "tags", id: "t-a" },
      { kind: "row", table: "tags", id: "t-b" },
    ];
    const r = new Row({
      id: "r1",
      table_id: "posts",
      app_id: APP,
      cells: { tag_refs: refs },
    });
    await repo.save(r);
    const got = (await repo.get("r1"))!;
    expect(got.getCell("tag_refs")).toEqual(refs);
  });

  test("Uint8Array blob cell round-trips bytewise", async () => {
    const blob = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0, 255, 127]);
    const r = new Row({
      id: "r1",
      table_id: "attachments",
      app_id: APP,
      cells: { blob },
    });
    await repo.save(r);
    const got = (await repo.get("r1"))!;
    const back = got.getCell("blob") as Uint8Array;
    expect(back).toBeInstanceOf(Uint8Array);
    expect(Array.from(back)).toEqual(Array.from(blob));
  });

  test("json cell (nested structures) round-trips", async () => {
    const attrs = {
      linear_user_id: "LIN-alice",
      prefs: { lang: "zh", density: "compact" },
      tags: ["admin", "beta"],
    };
    const r = new Row({
      id: "alice",
      table_id: "users",
      app_id: APP,
      cells: { email: "alice@co", attrs },
    });
    await repo.save(r);
    const got = (await repo.get("alice"))!;
    expect(got.getCell("attrs")).toEqual(attrs);
  });

  test("vector cell (array of numbers) round-trips", async () => {
    const vec = [0.1, 0.2, 0.3, -0.5];
    const r = new Row({
      id: "r1",
      table_id: "embeddings",
      app_id: APP,
      cells: { vec },
    });
    await repo.save(r);
    const got = (await repo.get("r1"))!;
    expect(got.getCell("vec")).toEqual(vec);
  });
});

describe("BunSqliteRowRepository · StorageService parity", () => {
  test("plug into StorageService: ref integrity + cascade delete still work", async () => {
    const tables = new InMemoryRepository<Table>((t) => t.id);
    const rows = new BunSqliteRowRepository(openRowDatabase(":memory:"));

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
          cascade_on_target_delete: true,
        },
      ],
      source: { kind: "stored" },
    });
    await tables.save(parent);
    await tables.save(child);

    const storage = new StorageService(tables, rows);

    const p = new Row({
      id: "p1",
      table_id: "parent",
      app_id: APP,
      cells: { name: "P" },
    });
    await storage.saveRow(p);

    const c = new Row({
      id: "c1",
      table_id: "child",
      app_id: APP,
      cells: {
        parent_ref: { kind: "row", table: "parent", id: "p1" } satisfies Ref,
      },
    });
    await storage.saveRow(c);

    // ref integrity should kick in for orphan save:
    const orphan = new Row({
      id: "c2",
      table_id: "child",
      app_id: APP,
      cells: {
        parent_ref: { kind: "row", table: "parent", id: "ghost" } satisfies Ref,
      },
    });
    await expect(storage.saveRow(orphan)).rejects.toThrow();

    // cascade delete: delete p1 → c1 goes too
    const result = await storage.deleteRow("p1");
    expect(result.deleted.sort()).toEqual(["c1", "p1"]);
    expect(await storage.getRow("c1")).toBeUndefined();
  });

  test("listRowsByTable filters correctly on SQLite-backed storage", async () => {
    const tables = new InMemoryRepository<Table>((t) => t.id);
    const rows = new BunSqliteRowRepository(openRowDatabase(":memory:"));

    const t1 = new Table({
      id: "bookmarks",
      app_id: APP,
      columns: [{ name: "url", type: TEXT }],
      source: { kind: "stored" },
    });
    const t2 = new Table({
      id: "notes",
      app_id: APP,
      columns: [{ name: "body", type: TEXT }],
      source: { kind: "stored" },
    });
    await tables.save(t1);
    await tables.save(t2);
    const storage = new StorageService(tables, rows);

    await storage.saveRow(
      new Row({ id: "b1", table_id: "bookmarks", app_id: APP, cells: { url: "x" } })
    );
    await storage.saveRow(
      new Row({ id: "b2", table_id: "bookmarks", app_id: APP, cells: { url: "y" } })
    );
    await storage.saveRow(
      new Row({ id: "n1", table_id: "notes", app_id: APP, cells: { body: "hi" } })
    );

    const bookmarks = await storage.listRowsByTable("bookmarks");
    expect(bookmarks.map((r) => r.id).sort()).toEqual(["b1", "b2"]);
    const notes = await storage.listRowsByTable("notes");
    expect(notes.map((r) => r.id)).toEqual(["n1"]);
  });
});
