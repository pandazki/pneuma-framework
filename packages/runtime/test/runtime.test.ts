import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bootAppRuntime,
  asBunFetch,
  handleHttp,
  type AppConfig,
  type HttpRequestContext,
} from "../src/index.js";
import {
  Table,
  Operation,
  PolicySet,
  Subjects,
  Resources,
  type HandlerFn,
  type ImpactComputeFn,
  type CellType,
  type Ref,
} from "@pneuma-framework/core-domain";

const APP = "runtime-test";
const TEXT: CellType = { kind: "primitive", of: "Text" };
const URL_T: CellType = { kind: "primitive", of: "URL" };

// ---------- minimal AppConfig ----------

function minimalConfig(override: Partial<AppConfig> = {}): AppConfig {
  const bookmarks = new Table({
    id: "bookmarks",
    app_id: APP,
    columns: [
      { name: "url", type: URL_T },
      { name: "title", type: TEXT, nullable: true },
    ],
    source: { kind: "stored" },
  });

  const addBookmark = new Operation({
    id: "add_bookmark",
    app_id: APP,
    name: "Add bookmark",
    description: "Creates a new bookmark row",
    input: {
      type: "record",
      fields: {
        url: { type: URL_T, required: true },
        title: { type: TEXT },
      },
    },
    output: { kind: "void" },
    affects: {
      mutations: ["bookmarks"],
      adapter_writes: [],
      reads_only: false,
      destructive: false,
    },
    handler: { kind: "code", ref: "./ops/add_bookmark.ts" },
  });

  const deleteBookmark = new Operation({
    id: "delete_bookmark",
    app_id: APP,
    name: "Delete bookmark",
    description: "Removes a bookmark",
    input: {
      type: "record",
      fields: {
        bookmark_id: {
          type: { kind: "ref-row", table: "bookmarks" },
          required: true,
        },
      },
    },
    output: { kind: "void" },
    affects: {
      mutations: ["bookmarks"],
      adapter_writes: [],
      reads_only: false,
      destructive: true,
    },
    handler: { kind: "code", ref: "./ops/delete_bookmark.ts" },
    impact: {
      compute: { kind: "code", ref: "./ops/delete_bookmark.impact.ts" },
      disclosure_template: "Will permanently delete bookmark {{id}}",
    },
  });

  const listBookmarks = new Operation({
    id: "list_bookmarks",
    app_id: APP,
    name: "List bookmarks",
    description: "Returns all bookmarks",
    input: { type: "record", fields: {} },
    output: { kind: "row-list", row_type: "bookmarks" },
    affects: {
      mutations: [],
      adapter_writes: [],
      reads_only: true,
      destructive: false,
    },
    handler: {
      kind: "query",
      on: "bookmarks",
      sort: [{ column: "url", dir: "asc" }],
      pagination: { kind: "cursor", size: 25 },
    },
  });

  const policy = new PolicySet({ app_id: APP });
  policy.addRule({
    id: "anyone-add",
    allow: [Subjects.anyone(), Subjects.anonymous()],
    do: ["invoke"],
    on: Resources.operation("add_bookmark"),
  });
  policy.addRule({
    id: "anyone-list",
    allow: [Subjects.anyone(), Subjects.anonymous()],
    do: ["invoke"],
    on: Resources.operation("list_bookmarks"),
  });
  // delete only for authenticated users
  policy.addRule({
    id: "auth-delete",
    allow: [Subjects.anyone()],
    do: ["invoke"],
    on: Resources.operation("delete_bookmark"),
  });

  const handlers: Record<string, HandlerFn> = {
    "./ops/add_bookmark.ts": async ({ input, storage }) => {
      const i = input as { url: string; title?: string };
      const id = `bm-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
      const { Row } = await import("@pneuma-framework/core-domain");
      const row = new Row({
        id,
        table_id: "bookmarks",
        app_id: APP,
        cells: { url: i.url, ...(i.title !== undefined ? { title: i.title } : {}) },
      });
      await storage.saveRow(row);
      return { id };
    },
    "./ops/delete_bookmark.ts": async ({ input, storage }) => {
      const i = input as { bookmark_id: Ref };
      const id =
        typeof i.bookmark_id === "object" && "id" in i.bookmark_id
          ? (i.bookmark_id as Extract<Ref, { kind: "row" }>).id
          : String(i.bookmark_id);
      const result = await storage.deleteRow(id);
      return { deleted: result.deleted };
    },
  };

  const impacts: Record<string, ImpactComputeFn> = {
    "./ops/delete_bookmark.impact.ts": async ({ input, storage }) => {
      const i = input as { bookmark_id: Ref };
      const id =
        typeof i.bookmark_id === "object" && "id" in i.bookmark_id
          ? (i.bookmark_id as Extract<Ref, { kind: "row" }>).id
          : String(i.bookmark_id);
      const row = await storage.getRow(id);
      const title = row?.getCell("title");
      return {
        disclosure: `Will delete bookmark "${title ?? id}"`,
        details: { id, title },
      };
    },
  };

  return {
    app_id: APP,
    tables: [bookmarks],
    operations: [addBookmark, deleteBookmark, listBookmarks],
    policy,
    handlers,
    impacts,
    ...override,
  };
}

// ---------- helper: sim HTTP request ----------

function mkReq(
  method: string,
  pathname: string,
  opts: {
    search?: string;
    body?: unknown;
    userId?: string;
  } = {}
): HttpRequestContext {
  const headers = new Headers();
  if (opts.userId) headers.set("x-pneuma-user-id", opts.userId);
  const params = new URLSearchParams(opts.search ?? "");
  return {
    method,
    pathname,
    searchParams: params,
    headers,
    readBody: async () => opts.body,
  };
}

// ---------- tests ----------

describe("AppRuntime · boot + introspection", () => {
  test("boots with in-memory defaults + exposes services", async () => {
    const runtime = await bootAppRuntime(minimalConfig());
    expect(runtime.app_id).toBe(APP);
    // 3 template ops + 5 framework-injected definition operations.
    expect(runtime.listOperations()).toHaveLength(8);
    expect(runtime.getOperation("add_bookmark")).toBeDefined();
    expect(runtime.getOperation("add_table")).toBeDefined();
    expect(runtime.getOperation("add_table_column")).toBeDefined();
    expect(runtime.getOperation("add_operation")).toBeDefined();
    expect(runtime.getOperation("definition.rollback.validate")).toBeDefined();
    expect(runtime.getOperation("definition.rollback.execute")).toBeDefined();
    expect(runtime.getOperation("nope")).toBeUndefined();
    await runtime.close();
  });

  test("GET /api/health returns metadata", async () => {
    const runtime = await bootAppRuntime(minimalConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/health"));
    expect(resp.status).toBe(200);
    const body = resp.body as { ok: boolean; app_id: string; operation_count: number };
    expect(body.ok).toBe(true);
    expect(body.app_id).toBe(APP);
    // 3 template ops + 5 framework-injected definition operations.
    expect(body.operation_count).toBe(8);
    await runtime.close();
  });

  test("GET /api/operations lists all", async () => {
    const runtime = await bootAppRuntime(minimalConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/operations"));
    expect(resp.status).toBe(200);
    const body = resp.body as { operations: Array<{ id: string; reads_only: boolean; destructive: boolean }> };
    const ids = body.operations.map((o) => o.id).sort();
    // framework-injected definition operations join the template ops
    expect(ids).toEqual([
      "add_bookmark",
      "add_operation",
      "add_table",
      "add_table_column",
      "definition.rollback.execute",
      "definition.rollback.validate",
      "delete_bookmark",
      "list_bookmarks",
    ]);
    const del = body.operations.find((o) => o.id === "delete_bookmark")!;
    expect(del.destructive).toBe(true);
    await runtime.close();
  });

  test("Unknown path → 404", async () => {
    const runtime = await bootAppRuntime(minimalConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/mystery"));
    expect(resp.status).toBe(404);
    await runtime.close();
  });
});

describe("AppRuntime · POST /api/operations/:id (mutation)", () => {
  test("add_bookmark with anonymous user succeeds (policy allows)", async () => {
    const runtime = await bootAppRuntime(minimalConfig());
    const resp = await handleHttp(
      runtime,
      mkReq("POST", "/api/operations/add_bookmark", {
        body: { input: { url: "https://bun.sh", title: "Bun" } },
      })
    );
    expect(resp.status).toBe(200);
    const rows = await runtime.storage.listRowsByTable("bookmarks");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.getCell("url")).toBe("https://bun.sh");
    await runtime.close();
  });

  test("delete_bookmark without confirmed → 428", async () => {
    const runtime = await bootAppRuntime(minimalConfig());
    // seed a bookmark first
    await handleHttp(
      runtime,
      mkReq("POST", "/api/operations/add_bookmark", {
        body: { input: { url: "https://x", title: "X" } },
        userId: "alice",
      })
    );
    const rows = await runtime.storage.listRowsByTable("bookmarks");
    const bmId = rows[0]!.id;

    const resp = await handleHttp(
      runtime,
      mkReq("POST", "/api/operations/delete_bookmark", {
        body: {
          input: { bookmark_id: { kind: "row", table: "bookmarks", id: bmId } },
        },
        userId: "alice",
      })
    );
    expect(resp.status).toBe(428);
    const body = resp.body as { error: string; impact: { disclosure: string } };
    expect(body.error).toBe("confirmation_required");
    expect(body.impact.disclosure).toContain("X");
    // row still present
    expect(await runtime.storage.getRow(bmId)).toBeDefined();
    await runtime.close();
  });

  test("delete_bookmark with confirmed=true deletes", async () => {
    const runtime = await bootAppRuntime(minimalConfig());
    await handleHttp(
      runtime,
      mkReq("POST", "/api/operations/add_bookmark", {
        body: { input: { url: "https://y" } },
        userId: "alice",
      })
    );
    const rows = await runtime.storage.listRowsByTable("bookmarks");
    const bmId = rows[0]!.id;
    const resp = await handleHttp(
      runtime,
      mkReq("POST", "/api/operations/delete_bookmark", {
        body: {
          input: { bookmark_id: { kind: "row", table: "bookmarks", id: bmId } },
          confirmed: true,
        },
        userId: "alice",
      })
    );
    expect(resp.status).toBe(200);
    expect(await runtime.storage.getRow(bmId)).toBeUndefined();
    await runtime.close();
  });

  test("delete_bookmark by anonymous user → 403 (not allowed by rule)", async () => {
    const runtime = await bootAppRuntime(minimalConfig());
    const resp = await handleHttp(
      runtime,
      mkReq("POST", "/api/operations/delete_bookmark", {
        body: {
          input: { bookmark_id: { kind: "row", table: "bookmarks", id: "any" } },
          confirmed: true,
        },
        // no userId → anonymous
      })
    );
    expect(resp.status).toBe(403);
    const body = resp.body as { error: string };
    expect(body.error).toBe("policy_denied");
    await runtime.close();
  });

  test("unknown operation id → 404", async () => {
    const runtime = await bootAppRuntime(minimalConfig());
    const resp = await handleHttp(
      runtime,
      mkReq("POST", "/api/operations/mystery", { body: { input: {} } })
    );
    expect(resp.status).toBe(404);
    await runtime.close();
  });

  test("POST on reads_only op → 405 (must use GET)", async () => {
    const runtime = await bootAppRuntime(minimalConfig());
    const resp = await handleHttp(
      runtime,
      mkReq("POST", "/api/operations/list_bookmarks", { body: { input: {} } })
    );
    expect(resp.status).toBe(405);
    await runtime.close();
  });
});

describe("AppRuntime · GET /api/operations/:id (query)", () => {
  test("list_bookmarks returns rows", async () => {
    const runtime = await bootAppRuntime(minimalConfig());
    for (const u of ["https://a", "https://b"]) {
      await handleHttp(
        runtime,
        mkReq("POST", "/api/operations/add_bookmark", {
          body: { input: { url: u } },
        })
      );
    }
    const resp = await handleHttp(runtime, mkReq("GET", "/api/operations/list_bookmarks"));
    expect(resp.status).toBe(200);
    const body = resp.body as { rows: Array<{ url: string }> };
    expect(body.rows).toHaveLength(2);
    // sort asc by url
    expect(body.rows.map((r) => r.url)).toEqual(["https://a", "https://b"]);
    await runtime.close();
  });

  test("GET on non-query op → 405", async () => {
    const runtime = await bootAppRuntime(minimalConfig());
    const resp = await handleHttp(runtime, mkReq("GET", "/api/operations/add_bookmark"));
    expect(resp.status).toBe(405);
    const body = resp.body as { error: string; hint: string };
    expect(body.error).toBe("method_not_allowed");
    expect(body.hint).toContain("not query-backed");
    expect(body.hint).toContain("use POST");
    await runtime.close();
  });
});

describe("AppRuntime · persistence across restart", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pneuma-runtime-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("SQLite Row repo: add in run 1 → visible in run 2 on same file", async () => {
    const dbPath = join(dir, "rows.db");

    const r1 = await bootAppRuntime(
      minimalConfig({ storage: { sqlite_path: dbPath } })
    );
    await handleHttp(
      r1,
      mkReq("POST", "/api/operations/add_bookmark", {
        body: { input: { url: "https://persistent", title: "Persisted" } },
      })
    );
    await r1.close();

    // fresh runtime, same file
    const r2 = await bootAppRuntime(
      minimalConfig({ storage: { sqlite_path: dbPath } })
    );
    const resp = await handleHttp(r2, mkReq("GET", "/api/operations/list_bookmarks"));
    const body = resp.body as { rows: Array<{ url: string; title: string }> };
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]!.url).toBe("https://persistent");
    expect(body.rows[0]!.title).toBe("Persisted");
    await r2.close();
  });

  test("NDJSON audit: /api/events returns past operation audit trail", async () => {
    const ndjson = join(dir, "audit.ndjson");

    const runtime = await bootAppRuntime(
      minimalConfig({ audit: { ndjson_path: ndjson } })
    );

    // generate some audit activity
    await handleHttp(
      runtime,
      mkReq("POST", "/api/operations/add_bookmark", {
        body: { input: { url: "https://a" } },
        userId: "alice",
      })
    );
    await handleHttp(
      runtime,
      mkReq("POST", "/api/operations/add_bookmark", {
        body: { input: { url: "https://b" } },
        userId: "bob",
      })
    );

    const all = await handleHttp(runtime, mkReq("GET", "/api/events"));
    expect(all.status).toBe(200);
    const body = all.body as { events: Array<{ payload: { operation_id?: string } }> };
    const opEvents = body.events.filter((e) => e.payload.operation_id !== undefined);
    expect(opEvents.length).toBeGreaterThanOrEqual(4); // 2 ops × (started + completed)

    // filter by user_id
    const aliceEvents = await handleHttp(
      runtime,
      mkReq("GET", "/api/events", { search: "user_id=alice" })
    );
    const aliceBody = aliceEvents.body as { events: Array<{ ctx: { user?: { id: string } } }> };
    for (const e of aliceBody.events) {
      expect(e.ctx.user?.id).toBe("alice");
    }

    await runtime.close();
  });

  test("GET /api/events without ndjson path → 501", async () => {
    const runtime = await bootAppRuntime(minimalConfig()); // no audit path
    const resp = await handleHttp(runtime, mkReq("GET", "/api/events"));
    expect(resp.status).toBe(501);
    const body = resp.body as { error: string };
    expect(body.error).toBe("audit_sink_not_persistent");
    await runtime.close();
  });
});

describe("AppRuntime · Bun.serve adapter", () => {
  test("asBunFetch wraps handleHttp for Bun.serve-compatible use", async () => {
    const runtime = await bootAppRuntime(minimalConfig());
    const fetcher = asBunFetch(runtime);

    const resp = await fetcher(new Request("http://localhost/api/health"));
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    const bad = await fetcher(new Request("http://localhost/api/nope"));
    expect(bad.status).toBe(404);

    await runtime.close();
  });

  test("Bun.serve end-to-end: real HTTP roundtrip on a port", async () => {
    const runtime = await bootAppRuntime(minimalConfig());
    const server = Bun.serve({
      port: 0, // random
      fetch: asBunFetch(runtime),
    });

    try {
      const url = `http://localhost:${server.port}`;
      const health = await fetch(`${url}/api/health`).then((r) => r.json());
      expect(health.ok).toBe(true);

      // POST add_bookmark
      const post = await fetch(`${url}/api/operations/add_bookmark`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: { url: "https://real-http" } }),
      });
      expect(post.status).toBe(200);

      // GET list
      const list = await fetch(`${url}/api/operations/list_bookmarks`).then((r) =>
        r.json()
      );
      expect(list.rows).toHaveLength(1);
      expect(list.rows[0].url).toBe("https://real-http");
    } finally {
      server.stop(true);
      await runtime.close();
    }
  });
});
