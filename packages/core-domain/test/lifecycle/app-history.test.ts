import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  AppHistoryError,
  SNAPSHOT_FREQUENCY,
  RETENTION_BUFFER_LIMIT,
} from "../../src/lifecycle/app-history.js";
import { BunSqliteAppHistoryStore } from "../../src/lifecycle/bun-sqlite-app-history.js";

const APP = "test-app";

describe("BunSqliteAppHistoryStore · append + version", () => {
  let store: BunSqliteAppHistoryStore;
  beforeEach(() => {
    store = new BunSqliteAppHistoryStore(new Database(":memory:"));
  });

  test("first append gets version 1, subsequent monotonic", async () => {
    const e1 = await store.append({
      app_id: APP,
      history_type: "snapshot",
      payload: { state: "v1" },
      is_ai_generated: false,
      actor_id: "alice",
      actor_kind: "builder",
      description: "initial schema",
    });
    const e2 = await store.append({
      app_id: APP,
      history_type: "snapshot",
      payload: { state: "v2" },
      is_ai_generated: true,
      actor_id: "agent-1",
      actor_kind: "agent",
    });
    expect(e1.version).toBe(1);
    expect(e2.version).toBe(2);
    expect(await store.latestVersion(APP)).toBe(2);
  });

  test("different apps have independent version sequences", async () => {
    await store.append({
      app_id: "a1",
      history_type: "snapshot",
      payload: { n: 1 },
      is_ai_generated: false,
      actor_id: "x",
      actor_kind: "builder",
    });
    const entryB = await store.append({
      app_id: "a2",
      history_type: "snapshot",
      payload: { n: 2 },
      is_ai_generated: false,
      actor_id: "y",
      actor_kind: "builder",
    });
    expect(entryB.version).toBe(1);
    expect(await store.latestVersion("a1")).toBe(1);
    expect(await store.latestVersion("a2")).toBe(1);
  });

  test("latestVersion returns undefined for unknown app", async () => {
    expect(await store.latestVersion("nope")).toBeUndefined();
  });

  test("id auto-generated, timestamps populated, all optional fields round-trip", async () => {
    const e = await store.append({
      app_id: APP,
      history_type: "snapshot",
      payload: { x: "y" },
      is_ai_generated: true,
      actor_id: "agent-42",
      actor_kind: "agent",
      description: "added column foo",
      operation_scope: ["table:bookmarks", "operation:create_bookmark"],
    });
    expect(e.id.startsWith("ah_")).toBe(true);
    expect(e.created_at).toBeGreaterThan(0);
    expect(e.description).toBe("added column foo");
    expect(e.operation_scope).toEqual(["table:bookmarks", "operation:create_bookmark"]);
  });
});

describe("BunSqliteAppHistoryStore · CHECK constraints (DB-level enforcement)", () => {
  let store: BunSqliteAppHistoryStore;
  beforeEach(() => {
    store = new BunSqliteAppHistoryStore(new Database(":memory:"));
  });

  test("snapshot with array payload → AppHistoryError (code-level check)", async () => {
    await expect(
      store.append({
        app_id: APP,
        history_type: "snapshot",
        payload: [1, 2, 3], // array, not object
        is_ai_generated: false,
        actor_id: "x",
        actor_kind: "builder",
      })
    ).rejects.toBeInstanceOf(AppHistoryError);
  });

  test("snapshot with parent_snapshot_version → AppHistoryError", async () => {
    await expect(
      store.append({
        app_id: APP,
        history_type: "snapshot",
        payload: { a: 1 },
        parent_snapshot_version: 5,
        is_ai_generated: false,
        actor_id: "x",
        actor_kind: "builder",
      })
    ).rejects.toBeInstanceOf(AppHistoryError);
  });

  test("delta without parent_snapshot_version → AppHistoryError", async () => {
    await expect(
      store.append({
        app_id: APP,
        history_type: "delta",
        payload: [{ op: "replace", path: "/a", value: 2 }],
        is_ai_generated: false,
        actor_id: "x",
        actor_kind: "builder",
      })
    ).rejects.toBeInstanceOf(AppHistoryError);
  });

  test("delta with object payload → AppHistoryError", async () => {
    await expect(
      store.append({
        app_id: APP,
        history_type: "delta",
        payload: { fake: "patch" }, // must be array
        parent_snapshot_version: 1,
        is_ai_generated: false,
        actor_id: "x",
        actor_kind: "builder",
      })
    ).rejects.toBeInstanceOf(AppHistoryError);
  });

  test("valid delta (array payload + parent) accepted (even though MVP restore doesn't yet apply)", async () => {
    // First write a snapshot as parent
    await store.append({
      app_id: APP,
      history_type: "snapshot",
      payload: { state: "v1" },
      is_ai_generated: false,
      actor_id: "x",
      actor_kind: "builder",
    });
    // Then a delta pointing at it
    const d = await store.append({
      app_id: APP,
      history_type: "delta",
      payload: [{ op: "replace", path: "/state", value: "v2" }],
      parent_snapshot_version: 1,
      is_ai_generated: true,
      actor_id: "agent",
      actor_kind: "agent",
    });
    expect(d.history_type).toBe("delta");
    expect(d.parent_snapshot_version).toBe(1);
  });
});

describe("BunSqliteAppHistoryStore · restore", () => {
  let store: BunSqliteAppHistoryStore;
  beforeEach(() => {
    store = new BunSqliteAppHistoryStore(new Database(":memory:"));
  });

  test("restoreStateAt returns snapshot payload", async () => {
    const snapshot = { tables: { bookmarks: { cols: ["url", "title"] } } };
    await store.append({
      app_id: APP,
      history_type: "snapshot",
      payload: snapshot,
      is_ai_generated: false,
      actor_id: "alice",
      actor_kind: "builder",
    });
    const restored = await store.restoreStateAt(APP, 1);
    expect(restored).toEqual(snapshot);
  });

  test("restoreStateAt on missing version → AppHistoryError(entry_not_found)", async () => {
    await expect(
      store.restoreStateAt(APP, 99)
    ).rejects.toBeInstanceOf(AppHistoryError);
  });

  test("restoreStateAt on a delta entry → AppHistoryError(delta_restore_not_implemented)", async () => {
    await store.append({
      app_id: APP,
      history_type: "snapshot",
      payload: { s: "v1" },
      is_ai_generated: false,
      actor_id: "x",
      actor_kind: "builder",
    });
    await store.append({
      app_id: APP,
      history_type: "delta",
      payload: [{ op: "replace", path: "/s", value: "v2" }],
      parent_snapshot_version: 1,
      is_ai_generated: false,
      actor_id: "x",
      actor_kind: "builder",
    });
    try {
      await store.restoreStateAt(APP, 2);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AppHistoryError);
      expect((err as AppHistoryError).kind).toBe("delta_restore_not_implemented");
    }
  });
});

describe("BunSqliteAppHistoryStore · listEntries", () => {
  let store: BunSqliteAppHistoryStore;
  beforeEach(() => {
    store = new BunSqliteAppHistoryStore(new Database(":memory:"));
  });

  test("asc by default", async () => {
    for (const v of [1, 2, 3]) {
      await store.append({
        app_id: APP,
        history_type: "snapshot",
        payload: { v },
        is_ai_generated: false,
        actor_id: "x",
        actor_kind: "builder",
      });
    }
    const entries = await store.listEntries(APP);
    expect(entries.map((e) => e.version)).toEqual([1, 2, 3]);
  });

  test("desc returns newest first", async () => {
    for (const v of [1, 2, 3]) {
      await store.append({
        app_id: APP,
        history_type: "snapshot",
        payload: { v },
        is_ai_generated: false,
        actor_id: "x",
        actor_kind: "builder",
      });
    }
    const entries = await store.listEntries(APP, { direction: "desc" });
    expect(entries.map((e) => e.version)).toEqual([3, 2, 1]);
  });

  test("limit caps result size", async () => {
    for (let v = 1; v <= 5; v++) {
      await store.append({
        app_id: APP,
        history_type: "snapshot",
        payload: { v },
        is_ai_generated: false,
        actor_id: "x",
        actor_kind: "builder",
      });
    }
    const top2 = await store.listEntries(APP, { direction: "desc", limit: 2 });
    expect(top2).toHaveLength(2);
    expect(top2.map((e) => e.version)).toEqual([5, 4]);
  });
});

describe("BunSqliteAppHistoryStore · retention pruning", () => {
  let store: BunSqliteAppHistoryStore;
  beforeEach(() => {
    store = new BunSqliteAppHistoryStore(new Database(":memory:"));
  });

  test("prune keeps SNAPSHOT_FREQUENCY * RETENTION_BUFFER_LIMIT = 110 rows", async () => {
    const total = SNAPSHOT_FREQUENCY * RETENTION_BUFFER_LIMIT + 15; // 125
    for (let i = 0; i < total; i++) {
      await store.append({
        app_id: APP,
        history_type: "snapshot",
        payload: { i },
        is_ai_generated: false,
        actor_id: "x",
        actor_kind: "builder",
      });
    }
    const { pruned } = await store.prune(APP);
    expect(pruned).toBe(15);
    const all = await store.listEntries(APP);
    expect(all).toHaveLength(SNAPSHOT_FREQUENCY * RETENTION_BUFFER_LIMIT);
    // oldest kept should have version = 16 (prune cut versions 1-15)
    expect(all[0]!.version).toBe(16);
  });

  test("prune is a no-op when under threshold", async () => {
    for (let i = 0; i < 5; i++) {
      await store.append({
        app_id: APP,
        history_type: "snapshot",
        payload: { i },
        is_ai_generated: false,
        actor_id: "x",
        actor_kind: "builder",
      });
    }
    const { pruned } = await store.prune(APP);
    expect(pruned).toBe(0);
    expect(await store.listEntries(APP)).toHaveLength(5);
  });

  test("prune only touches the target app_id", async () => {
    for (let i = 0; i < 120; i++) {
      await store.append({
        app_id: "a1",
        history_type: "snapshot",
        payload: { i },
        is_ai_generated: false,
        actor_id: "x",
        actor_kind: "builder",
      });
    }
    for (let i = 0; i < 3; i++) {
      await store.append({
        app_id: "a2",
        history_type: "snapshot",
        payload: { i },
        is_ai_generated: false,
        actor_id: "y",
        actor_kind: "builder",
      });
    }
    await store.prune("a1");
    expect((await store.listEntries("a1")).length).toBe(110);
    expect((await store.listEntries("a2")).length).toBe(3);
  });
});

describe("BunSqliteAppHistoryStore · is_ai_generated + actor_kind", () => {
  let store: BunSqliteAppHistoryStore;
  beforeEach(() => {
    store = new BunSqliteAppHistoryStore(new Database(":memory:"));
  });

  test("boolean round-trips (0/1 in DB, boolean in domain)", async () => {
    const e1 = await store.append({
      app_id: APP,
      history_type: "snapshot",
      payload: { x: 1 },
      is_ai_generated: true,
      actor_id: "agent",
      actor_kind: "agent",
    });
    const e2 = await store.append({
      app_id: APP,
      history_type: "snapshot",
      payload: { x: 2 },
      is_ai_generated: false,
      actor_id: "alice",
      actor_kind: "builder",
    });
    expect(e1.is_ai_generated).toBe(true);
    expect(e2.is_ai_generated).toBe(false);
    const back1 = await store.getByVersion(APP, 1);
    const back2 = await store.getByVersion(APP, 2);
    expect(back1!.is_ai_generated).toBe(true);
    expect(back2!.is_ai_generated).toBe(false);
  });

  test("all 3 actor_kinds accepted; arbitrary string rejected by CHECK", async () => {
    for (const kind of ["builder", "agent", "framework"] as const) {
      await store.append({
        app_id: APP,
        history_type: "snapshot",
        payload: { kind },
        is_ai_generated: false,
        actor_id: "x",
        actor_kind: kind,
      });
    }
    // Direct SQL injection path: simulate a bad actor_kind by casting
    await expect(
      store.append({
        app_id: APP,
        history_type: "snapshot",
        payload: { x: 1 },
        is_ai_generated: false,
        actor_id: "x",
        actor_kind: "intruder" as unknown as "builder",
      })
    ).rejects.toBeInstanceOf(AppHistoryError);
  });
});
