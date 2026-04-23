import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FileAdapterImpl,
  FileAdapterError,
} from "../../src/adapters/file-adapter.js";
import type {
  AdapterInvocationContext,
  PushableQuery,
} from "../../src/services/adapter-invoker.js";
import { buildRootContext } from "../../src/value-objects/permission-context.js";

function mkInvCtx(): AdapterInvocationContext {
  return {
    credential_mode: "shared",
    credential: "token",
    pneuma_ctx: buildRootContext({ app_id: "test", invoked_via: "ui" }),
  };
}

describe("FileAdapterImpl · CRUD roundtrip", () => {
  let dir: string;
  let impl: FileAdapterImpl;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pneuma-file-adapter-"));
    impl = new FileAdapterImpl({ directory: dir });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("list on empty dir → []", async () => {
    const rows = await impl.list({ where: [] }, mkInvCtx());
    expect(rows).toEqual([]);
  });

  test("insert creates a file and returns id", async () => {
    const id = await impl.insert(
      { id: "r1", title: "hello", priority: 3 },
      mkInvCtx()
    );
    expect(id).toBe("r1");
    const raw = readFileSync(join(dir, "r1.json"), "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.title).toBe("hello");
    expect(parsed.priority).toBe(3);
  });

  test("insert rejects missing id field", async () => {
    await expect(
      impl.insert({ title: "no id" }, mkInvCtx())
    ).rejects.toBeInstanceOf(FileAdapterError);
  });

  test("insert rejects duplicate id", async () => {
    await impl.insert({ id: "r1", v: 1 }, mkInvCtx());
    await expect(
      impl.insert({ id: "r1", v: 2 }, mkInvCtx())
    ).rejects.toBeInstanceOf(FileAdapterError);
  });

  test("get fetches single row; missing throws row_not_found", async () => {
    await impl.insert({ id: "r1", title: "x" }, mkInvCtx());
    const got = await impl.get("r1", mkInvCtx());
    expect(got.title).toBe("x");
    await expect(impl.get("nope", mkInvCtx())).rejects.toBeInstanceOf(FileAdapterError);
  });

  test("update merges patch", async () => {
    await impl.insert({ id: "r1", title: "A", flag: true }, mkInvCtx());
    await impl.update("r1", { title: "A2" }, mkInvCtx());
    const got = await impl.get("r1", mkInvCtx());
    expect(got.title).toBe("A2");
    expect(got.flag).toBe(true); // preserved
  });

  test("update rejects non-existent row", async () => {
    await expect(
      impl.update("ghost", { x: 1 }, mkInvCtx())
    ).rejects.toBeInstanceOf(FileAdapterError);
  });

  test("delete removes file", async () => {
    await impl.insert({ id: "r1" }, mkInvCtx());
    await impl.delete("r1", mkInvCtx());
    const rows = await impl.list({ where: [] }, mkInvCtx());
    expect(rows).toEqual([]);
  });

  test("delete on missing throws", async () => {
    await expect(impl.delete("ghost", mkInvCtx())).rejects.toBeInstanceOf(FileAdapterError);
  });

  test("auto-creates parent directory if missing", async () => {
    const newDir = join(dir, "nested", "fresh");
    const freshImpl = new FileAdapterImpl({ directory: newDir });
    await freshImpl.insert({ id: "r1" }, mkInvCtx());
    const rows = await freshImpl.list({ where: [] }, mkInvCtx());
    expect(rows).toHaveLength(1);
  });

  test("row missing id field in existing file → infers from filename stem", async () => {
    // Simulate Builder-edited file on disk without id field
    writeFileSync(join(dir, "external-id-5.json"), JSON.stringify({ title: "outside-pneuma-write" }));
    const rows = await impl.list({ where: [] }, mkInvCtx());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("external-id-5");
    expect(rows[0]!.title).toBe("outside-pneuma-write");
  });
});

describe("FileAdapterImpl · filter pushdown", () => {
  let dir: string;
  let impl: FileAdapterImpl;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "pneuma-file-filter-"));
    impl = new FileAdapterImpl({ directory: dir });
    // Seed 5 rows
    const ctx = mkInvCtx();
    await impl.insert({ id: "r1", state: "pending", pri: 1 }, ctx);
    await impl.insert({ id: "r2", state: "closed", pri: 2 }, ctx);
    await impl.insert({ id: "r3", state: "closed", pri: 3 }, ctx);
    await impl.insert({ id: "r4", state: "archived", pri: 1 }, ctx);
    await impl.insert({ id: "r5", state: "pending", pri: 4 }, ctx);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("eq filter", async () => {
    const q: PushableQuery = {
      where: [{ column: "state", op: "eq", value: "closed" }],
    };
    const rows = await impl.list(q, mkInvCtx());
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.state).toBe("closed");
  });

  test("neq filter", async () => {
    const q: PushableQuery = {
      where: [{ column: "state", op: "neq", value: "closed" }],
    };
    const rows = await impl.list(q, mkInvCtx());
    expect(rows).toHaveLength(3);
  });

  test("in filter", async () => {
    const q: PushableQuery = {
      where: [{ column: "state", op: "in", value: ["pending", "archived"] }],
    };
    const rows = await impl.list(q, mkInvCtx());
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual(["r1", "r4", "r5"]);
  });

  test("multiple leaves combined AND-style", async () => {
    const q: PushableQuery = {
      where: [
        { column: "state", op: "eq", value: "closed" },
        { column: "pri", op: "eq", value: 3 },
      ],
    };
    const rows = await impl.list(q, mkInvCtx());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("r3");
  });

  test("sort + limit applied locally", async () => {
    const q: PushableQuery = {
      where: [],
      sort: [{ column: "pri", dir: "desc" }],
      limit: 2,
    };
    const rows = await impl.list(q, mkInvCtx());
    expect(rows).toHaveLength(2);
    expect(rows[0]!.pri).toBe(4); // r5
    expect(rows[1]!.pri).toBe(3); // r3
  });

  test("fields projection trims to selected columns", async () => {
    const q: PushableQuery = {
      where: [{ column: "state", op: "eq", value: "closed" }],
      fields: ["id", "state"],
    };
    const rows = await impl.list(q, mkInvCtx());
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(["id", "state"]);
      expect(r.pri).toBeUndefined();
    }
  });
});

describe("FileAdapterImpl · integration with AdapterInvoker", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pneuma-file-int-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("plugs into AdapterInvoker with shared credential mode; filter pushdown works", async () => {
    const { Adapter } = await import("../../src/aggregates/adapter.js");
    const { AdapterInvoker, InMemoryCredentialStore } = await import(
      "../../src/services/adapter-invoker.js"
    );

    const impl = new FileAdapterImpl({ directory: dir });
    // seed
    await impl.insert({ id: "a", status: "open" }, mkInvCtx());
    await impl.insert({ id: "b", status: "closed" }, mkInvCtx());
    await impl.insert({ id: "c", status: "open" }, mkInvCtx());

    const TEXT = { kind: "primitive" as const, of: "Text" as const };
    const adapter = new Adapter({
      id: "local-files",
      app_id: "app",
      externalTypes: [
        {
          name: "Doc",
          columns: [
            { name: "id", type: TEXT },
            { name: "status", type: TEXT },
          ],
        },
      ],
      auth: { kind: "none" },
      credential_mode: "shared",
      capabilities: {
        list: true,
        read: true,
        insert: true,
        update: true,
        delete: true,
        updatableColumns: ["status"],
        filter_pushdown: {
          supported_ops: { status: ["eq"], id: ["eq"] },
        },
      },
    });

    const store = new InMemoryCredentialStore();
    store.setShared("local-files", "no-auth-needed");
    const invoker = new AdapterInvoker(store, new Map([["local-files", impl]]));

    // WhereClause: { ns:row, path:[status], op:eq, value:"open" }
    const result = await invoker.list(adapter, buildRootContext({ app_id: "app", invoked_via: "ui" }), {
      filter: {
        kind: "leaf",
        subject: { ns: "row", path: ["status"] },
        op: "eq",
        value: "open",
      },
    });
    expect(result.rows).toHaveLength(2);
    for (const r of result.rows) expect(r.status).toBe("open");
    expect(result.local_filter).toBeUndefined();
  });
});
