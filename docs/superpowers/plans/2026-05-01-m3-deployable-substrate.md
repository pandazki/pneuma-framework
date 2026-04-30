# M3 Deployable App Substrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real deployable pneuma-app substrate: Bun backend, unified SQLite persistence, migrations, release artifact, Docker packaging, and restart-persistent Builder-created capabilities.

**Architecture:** M3 keeps Pneuma primitives independent from Bun, SQLite, Drizzle, and Docker by placing those choices behind persistence adapters, lifecycle scripts, and release manifests. The first implementation uses one SQLite app database for rows, definition rows, app history, and permission ledger events, with Drizzle-backed physical migrations and a Docker-first release path. App definition changes remain governed runtime data; they do not become physical database DDL.

**Tech Stack:** Bun, TypeScript, `bun:sqlite`, Drizzle ORM + drizzle-kit, Docker, existing Pneuma runtime/core-domain/core packages, `templates/bookmarks-core-domain` as the reference app.

---

## Scope / 范围

English:

- M3 proves a real substrate, not production enterprise security.
- The reference backend stays Bun/TypeScript, but the framework contract stays protocol-first.
- SQLite and Docker are first adapters, not permanent semantic boundaries.
- Builder/Agent app-definition changes remain rows in system-owned definition tables.
- Qdrant, Postgres, Python, worker daemons, and production IAM are reserved extension points.

中文：

- M3 证明真实 substrate，而不是继续把企业安全做到生产级。
- 第一版 backend 用 Bun/TypeScript，但 framework contract 仍然以协议为边界。
- SQLite 和 Docker 是第一组 adapter，不是 framework 语义本身。
- Builder/Agent 修改 app definition 仍然是 system-owned definition rows，不生成物理 DDL。
- Qdrant、Postgres、Python、worker daemon、生产 IAM 都只保留扩展边界，不在 M3 实现。

## File Map / 文件边界

- Create `packages/core-domain/src/persistence/sqlite/database.ts`
  - Opens one SQLite app database, applies baseline PRAGMAs, and exposes a small close helper.
- Create `packages/core-domain/src/persistence/sqlite/schema.ts`
  - Drizzle physical schema declarations for framework-owned SQLite tables only.
- Create `packages/core-domain/src/persistence/sqlite/migrations.ts`
  - Idempotent migration runner used by runtime boot, `migrate.sh`, and tests.
- Create `packages/core-domain/test/persistence/sqlite-database.test.ts`
  - Contract tests for opening one migrated app database.
- Create `packages/core-domain/test/persistence/sqlite-migrations.test.ts`
  - Migration tests for fresh DB, idempotency, and schema metadata.
- Modify `packages/core-domain/src/repositories/bun-sqlite.ts`
  - Stop owning schema creation; consume an already-open migrated app DB.
- Modify `packages/core-domain/src/lifecycle/bun-sqlite-app-history.ts`
  - Stop owning schema creation; consume an already-open migrated app DB.
- Modify `packages/core-domain/src/index.ts`
  - Export SQLite substrate helpers needed by runtime and templates.
- Modify `packages/runtime/src/types.ts`
  - Add `persistence: { kind: "sqlite"; path: string }` while keeping old `storage` and `history` fields working.
- Modify `packages/runtime/src/runtime.ts`
  - Wire unified SQLite persistence into row storage and app history, with unique-handle close semantics.
- Create `packages/runtime/test/deployable-substrate.test.ts`
  - Runtime-level persistence tests: rows, definition rows, app history survive restart through one DB.
- Create `packages/core/src/permission-ledger-sqlite.ts`
  - SQLite implementation of `PermissionLedgerStore`.
- Modify `packages/core/src/index.ts`
  - Export the SQLite permission ledger store.
- Create `packages/core/test/permission-ledger-sqlite.test.ts`
  - Permission ledger survives reopening the same SQLite app DB.
- Modify `packages/core/src/types.ts`
  - Extend `BuildManifest` with release `processes`, `data`, `migrations`, and `healthcheck` fields.
- Modify `packages/core/src/artifact.ts`
  - Validate the added release manifest fields.
- Modify `packages/core/test/artifact.test.ts`
  - Tests for the release manifest contract.
- Modify `templates/bookmarks-core-domain/server/config.ts`
  - Use one `app.db` through `config.persistence`.
- Modify `templates/bookmarks-core-domain/server/app.ts`
  - Add `/healthz` if missing and ensure server boot runs SQLite migrations before runtime boot.
- Modify `templates/bookmarks-core-domain/manifest.json`
  - Add `migrate` and `deploy` scripts.
- Create `templates/bookmarks-core-domain/scripts/migrate.sh`
  - Runs the framework SQLite migration command for the workspace DB.
- Create `templates/bookmarks-core-domain/scripts/deploy.sh`
  - First Docker deployment adapter script for the reference app.
- Modify `templates/bookmarks-core-domain/scripts/build.sh`
  - Emit a schemaVersion 1 `build.manifest.json` that passes `validateBuildManifest`.
- Create `templates/bookmarks-core-domain/Dockerfile`
  - Docker-first release artifact.
- Create `templates/bookmarks-core-domain/docker-compose.yml`
  - Local mounted-volume release run.
- Create `templates/bookmarks-core-domain/test/deployable-substrate.test.ts`
  - Template-level lifecycle/build artifact checks.
- Create `examples/m3-deployable-substrate/README.md`
  - Team-readable demo runbook for M3.
- Create `examples/m3-deployable-substrate/smoke.test.ts`
  - Scripted smoke test for dev-to-release persistence without requiring Docker on every machine.

## Execution Rule / 执行规则

Every behavior-changing task below must follow this order:

```text
RED: write focused failing test
RED VERIFY: run that test and confirm the failure is about the missing feature
GREEN: implement the smallest code that passes
GREEN VERIFY: run focused test
REGRESSION VERIFY: run the affected package test set
COMMIT: commit the slice
```

### Task 1: Unified SQLite App Database Contract

**Files:**
- Create: `packages/core-domain/src/persistence/sqlite/database.ts`
- Create: `packages/core-domain/test/persistence/sqlite-database.test.ts`
- Modify: `packages/runtime/src/types.ts`
- Modify: `packages/runtime/src/runtime.ts`
- Modify: `packages/core-domain/src/index.ts`
- Test: `packages/runtime/test/deployable-substrate.test.ts`

- [x] **Step 1: Write the failing core-domain database test**

Add this test to `packages/core-domain/test/persistence/sqlite-database.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openPneumaSqliteDatabase } from "../../src/persistence/sqlite/database.js";

describe("openPneumaSqliteDatabase", () => {
  test("opens a concrete app database path and enables durability pragmas", () => {
    const dir = mkdtempSync(join(tmpdir(), "pneuma-sqlite-db-"));
    try {
      const dbPath = join(dir, "app.db");
      const db = openPneumaSqliteDatabase(dbPath);
      try {
        expect(existsSync(dbPath)).toBe(true);
        expect(db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get()!.journal_mode.toLowerCase()).toBe("wal");
        expect(db.query<{ foreign_keys: number }, []>("PRAGMA foreign_keys").get()!.foreign_keys).toBe(1);
      } finally {
        db.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [x] **Step 2: Verify RED**

Run:

```bash
bun test packages/core-domain/test/persistence/sqlite-database.test.ts
```

Expected: FAIL because `../../src/persistence/sqlite/database.js` does not exist.

- [x] **Step 3: Implement the smallest database helper**

Create `packages/core-domain/src/persistence/sqlite/database.ts`:

```ts
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openPneumaSqliteDatabase(path: string): Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  return db;
}
```

Export it from `packages/core-domain/src/index.ts`:

```ts
export { openPneumaSqliteDatabase } from "./persistence/sqlite/database.js";
```

- [x] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/core-domain/test/persistence/sqlite-database.test.ts
```

Expected: PASS.

- [x] **Step 5: Write the failing runtime unified persistence test**

Add this test to `packages/runtime/test/deployable-substrate.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PolicySet,
  Row,
  Table,
  pneumaTableColumnEntryToRow,
  type CellType,
} from "@pneuma-framework/core-domain";
import { bootAppRuntime } from "../src/runtime.js";
import { handleHttp, type HttpRequestContext } from "../src/http.js";
import type { AppConfig } from "../src/types.js";

function bookmarks(appId: string): Table {
  return new Table({
    id: "bookmarks",
    app_id: appId,
    source: { kind: "stored" },
    columns: [
      { name: "url", type: { kind: "primitive", of: "URL" } },
      { name: "title", type: { kind: "primitive", of: "Text" }, nullable: true },
    ],
  });
}

function cfg(appId: string, dbPath: string): AppConfig {
  return {
    app_id: appId,
    persistence: { kind: "sqlite", path: dbPath },
    tables: [bookmarks(appId)],
    operations: [],
    handlers: {},
    policy: new PolicySet({ app_id: appId }),
  };
}

function req(method: string, pathname: string): HttpRequestContext {
  return {
    method,
    pathname,
    searchParams: new URLSearchParams(),
    headers: new Headers(),
    readBody: async () => undefined,
  };
}

describe("M3 deployable substrate runtime persistence", () => {
  test("one SQLite app database preserves data rows and definition rows across runtime restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pneuma-m3-runtime-"));
    try {
      const dbPath = join(dir, "app.db");
      const appId = "m3-runtime-persistence";

      const r1 = await bootAppRuntime(cfg(appId, dbPath));
      await r1.storage.saveRow(new Row({
        id: "bookmark-1",
        app_id: appId,
        table_id: "bookmarks",
        cells: { url: "https://example.com", title: "Persisted" },
      }));
      await r1.storage.saveRow(pneumaTableColumnEntryToRow({
        id: "ptc-tags",
        app_id: appId,
        table_id: "bookmarks",
        column_name: "tags",
        cell_type: { kind: "primitive", of: "Text" } as CellType,
        nullable: true,
        created_by: "builder-1",
        created_by_kind: "builder",
        definition_version: 1,
      }));
      await r1.close();

      const r2 = await bootAppRuntime(cfg(appId, dbPath));
      const rows = await r2.storage.listRowsByTable("bookmarks");
      expect(rows.map((row) => row.id)).toEqual(["bookmark-1"]);
      expect(rows[0]!.getCell("title")).toBe("Persisted");

      const config = await handleHttp(r2, req("GET", "/api/config"));
      expect(config.status).toBe(200);
      const body = config.body as { tables: Array<{ id: string; columns: Array<{ name: string }> }> };
      const table = body.tables.find((item) => item.id === "bookmarks")!;
      expect(table.columns.map((column) => column.name)).toContain("tags");
      await r2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [x] **Step 6: Verify RED**

Run:

```bash
bun test packages/runtime/test/deployable-substrate.test.ts
```

Expected: FAIL because `AppConfig` does not yet accept `persistence`.

- [x] **Step 7: Implement runtime unified persistence wiring**

Modify `packages/runtime/src/types.ts`:

```ts
export interface AppConfig {
  readonly app_id: string;
  readonly persistence?: {
    readonly kind: "sqlite";
    readonly path: string;
  };
  readonly storage?: {
    readonly sqlite_path?: string;
  };
  readonly history?: {
    readonly sqlite_path?: string;
  };
  // keep the existing fields below unchanged
}
```

Modify `packages/runtime/src/runtime.ts` so `bootAppRuntime` opens one database when `config.persistence?.kind === "sqlite"`:

```ts
const unifiedDb = config.persistence?.kind === "sqlite"
  ? openPneumaSqliteDatabase(config.persistence.path)
  : undefined;
const rowDb = unifiedDb ?? openRowDatabase(config.storage?.sqlite_path ?? ":memory:");
const historyDb = unifiedDb ?? new Database(config.history?.sqlite_path ?? ":memory:");
```

Change runtime close logic so the same DB handle is closed once:

```ts
const closeRuntimeDatabases = () => {
  rowDb.close();
  if (historyDb !== rowDb) historyDb.close();
};
```

Use `closeRuntimeDatabases()` in `AppRuntime.close()`.

- [x] **Step 8: Verify GREEN**

Run:

```bash
bun test packages/runtime/test/deployable-substrate.test.ts packages/core-domain/test/persistence/sqlite-database.test.ts
```

Expected: PASS.

- [x] **Step 9: Regression verify**

Run:

```bash
bun test packages/runtime/test/definition-loader.test.ts packages/runtime/test/runtime.test.ts packages/core-domain/test/repositories/bun-sqlite.test.ts
```

Expected: PASS.

- [x] **Step 10: Commit Task 1**

Run:

```bash
git add packages/core-domain/src/persistence/sqlite/database.ts packages/core-domain/src/index.ts packages/core-domain/test/persistence/sqlite-database.test.ts packages/runtime/src/types.ts packages/runtime/src/runtime.ts packages/runtime/test/deployable-substrate.test.ts
git commit -m "feat: add unified sqlite app database wiring"
```

### Task 2: Drizzle-Backed Physical Migration Runner

**Files:**
- Modify: `packages/core-domain/package.json`
- Modify: `package.json`
- Create: `packages/core-domain/src/persistence/sqlite/schema.ts`
- Create: `packages/core-domain/src/persistence/sqlite/migrations.ts`
- Create: `packages/core-domain/test/persistence/sqlite-migrations.test.ts`
- Modify: `packages/core-domain/src/persistence/sqlite/database.ts`
- Modify: `packages/core-domain/src/index.ts`

- [x] **Step 1: Add package dependencies**

Run:

```bash
bun add drizzle-orm --cwd packages/core-domain
bun add --dev drizzle-kit
```

Expected: `packages/core-domain/package.json`, root `package.json`, and `bun.lock` are updated.

- [x] **Step 2: Write the failing migration test**

Create `packages/core-domain/test/persistence/sqlite-migrations.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openPneumaSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runPneumaSqliteMigrations } from "../../src/persistence/sqlite/migrations.js";

function tableNames(db: ReturnType<typeof openPneumaSqliteDatabase>): string[] {
  return db
    .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
}

describe("runPneumaSqliteMigrations", () => {
  test("creates the framework physical schema and records migration metadata", () => {
    const dir = mkdtempSync(join(tmpdir(), "pneuma-migrate-"));
    try {
      const db = openPneumaSqliteDatabase(join(dir, "app.db"));
      try {
        runPneumaSqliteMigrations(db);
        expect(tableNames(db)).toEqual(expect.arrayContaining([
          "app_history",
          "permission_ledger_events",
          "pneuma_migrations",
          "rows",
        ]));
        const migrations = db.query<{ name: string }, []>("SELECT name FROM pneuma_migrations ORDER BY name").all();
        expect(migrations.map((row) => row.name)).toEqual(["0001_framework_base"]);
      } finally {
        db.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("is idempotent on an already migrated database", () => {
    const dir = mkdtempSync(join(tmpdir(), "pneuma-migrate-idempotent-"));
    try {
      const db = openPneumaSqliteDatabase(join(dir, "app.db"));
      try {
        runPneumaSqliteMigrations(db);
        runPneumaSqliteMigrations(db);
        const count = db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM pneuma_migrations").get()!.count;
        expect(count).toBe(1);
      } finally {
        db.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [x] **Step 3: Verify RED**

Run:

```bash
bun test packages/core-domain/test/persistence/sqlite-migrations.test.ts
```

Expected: FAIL because `runPneumaSqliteMigrations` does not exist.

- [x] **Step 4: Add Drizzle schema declarations**

Create `packages/core-domain/src/persistence/sqlite/schema.ts`:

```ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const pneumaMigrations = sqliteTable("pneuma_migrations", {
  name: text("name").primaryKey(),
  applied_at: integer("applied_at").notNull(),
});

export const rows = sqliteTable("rows", {
  id: text("id").primaryKey(),
  table_id: text("table_id").notNull(),
  app_id: text("app_id").notNull(),
  cells: text("cells").notNull(),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
  owner_id: text("owner_id"),
});

export const appHistory = sqliteTable("app_history", {
  id: text("id").primaryKey(),
  app_id: text("app_id").notNull(),
  version: integer("version").notNull(),
  history_type: text("history_type").notNull(),
  payload: text("payload").notNull(),
  parent_snapshot_version: integer("parent_snapshot_version"),
  is_ai_generated: integer("is_ai_generated").notNull(),
  actor_id: text("actor_id").notNull(),
  actor_kind: text("actor_kind").notNull(),
  description: text("description"),
  operation_scope: text("operation_scope"),
  created_at: integer("created_at").notNull(),
});

export const permissionLedgerEvents = sqliteTable("permission_ledger_events", {
  event_id: text("event_id").primaryKey(),
  prompt_id: text("prompt_id").notNull(),
  app_id: text("app_id").notNull(),
  workspace_id: text("workspace_id").notNull(),
  event_type: text("event_type").notNull(),
  at_ms: integer("at_ms").notNull(),
  event_json: text("event_json").notNull(),
});
```

- [x] **Step 5: Add the migration runner**

Create `packages/core-domain/src/persistence/sqlite/migrations.ts`:

```ts
import type { Database } from "bun:sqlite";

export function runPneumaSqliteMigrations(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pneuma_migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const name = "0001_framework_base";
  const applied = db.query<{ name: string }, [string]>(
    "SELECT name FROM pneuma_migrations WHERE name = ? LIMIT 1",
  ).get(name);
  if (applied) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS rows (
      id TEXT PRIMARY KEY,
      table_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      cells TEXT NOT NULL CHECK(json_valid(cells)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      owner_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_rows_table ON rows(table_id);
    CREATE INDEX IF NOT EXISTS idx_rows_owner ON rows(owner_id);

    CREATE TABLE IF NOT EXISTS app_history (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      history_type TEXT NOT NULL
        CHECK (history_type IN ('snapshot', 'delta')),
      payload TEXT NOT NULL
        CHECK (json_valid(payload)),
      parent_snapshot_version INTEGER,
      is_ai_generated INTEGER NOT NULL CHECK (is_ai_generated IN (0, 1)),
      actor_id TEXT NOT NULL,
      actor_kind TEXT NOT NULL
        CHECK (actor_kind IN ('builder', 'agent', 'framework')),
      description TEXT,
      operation_scope TEXT CHECK (operation_scope IS NULL OR json_valid(operation_scope)),
      created_at INTEGER NOT NULL,
      UNIQUE (app_id, version),
      CHECK (
        (history_type = 'snapshot' AND json_type(payload) = 'object' AND parent_snapshot_version IS NULL)
        OR
        (history_type = 'delta' AND json_type(payload) = 'array' AND parent_snapshot_version IS NOT NULL)
      )
    );
    CREATE INDEX IF NOT EXISTS idx_app_history_app_version ON app_history(app_id, version);
    CREATE INDEX IF NOT EXISTS idx_app_history_created ON app_history(created_at);

    CREATE TABLE IF NOT EXISTS permission_ledger_events (
      event_id TEXT PRIMARY KEY,
      prompt_id TEXT NOT NULL,
      app_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      at_ms INTEGER NOT NULL,
      event_json TEXT NOT NULL CHECK(json_valid(event_json))
    );
    CREATE INDEX IF NOT EXISTS idx_permission_ledger_prompt ON permission_ledger_events(prompt_id, at_ms);
    CREATE INDEX IF NOT EXISTS idx_permission_ledger_workspace ON permission_ledger_events(workspace_id, at_ms);
  `);

  db.run("INSERT INTO pneuma_migrations(name, applied_at) VALUES(?, ?)", [name, Date.now()]);
}
```

- [x] **Step 6: Run migrations from database open**

Update `packages/core-domain/src/persistence/sqlite/database.ts`:

```ts
import { runPneumaSqliteMigrations } from "./migrations.js";

export function openPneumaSqliteDatabase(path: string): Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  runPneumaSqliteMigrations(db);
  return db;
}
```

Export both files from `packages/core-domain/src/index.ts`:

```ts
export { openPneumaSqliteDatabase } from "./persistence/sqlite/database.js";
export { runPneumaSqliteMigrations } from "./persistence/sqlite/migrations.js";
```

- [x] **Step 7: Verify GREEN**

Run:

```bash
bun test packages/core-domain/test/persistence/sqlite-migrations.test.ts packages/core-domain/test/persistence/sqlite-database.test.ts
```

Expected: PASS.

- [x] **Step 8: Regression verify**

Run:

```bash
bun test packages/core-domain/test/repositories/bun-sqlite.test.ts packages/runtime/test/deployable-substrate.test.ts
```

Expected: PASS.

- [x] **Step 9: Commit Task 2**

Run:

```bash
git add package.json bun.lock packages/core-domain/package.json packages/core-domain/src/persistence/sqlite packages/core-domain/src/index.ts packages/core-domain/test/persistence
git commit -m "feat: add sqlite migration substrate"
```

### Task 3: Runtime Restart Persistence For Rows, Definition Rows, And App History

**Files:**
- Modify: `packages/core-domain/src/repositories/bun-sqlite.ts`
- Modify: `packages/core-domain/src/lifecycle/bun-sqlite-app-history.ts`
- Modify: `packages/core-domain/test/persistence/sqlite-migrations.test.ts`
- Modify: `packages/core-domain/test/lifecycle/app-history.test.ts`
- Modify: `packages/runtime/test/framework-operations.test.ts`
- Modify: `packages/runtime/test/deployable-substrate.test.ts`
- Modify: `packages/runtime/src/runtime.ts`

- [x] **Step 1: Add failing migrated-open helper assertion**

Add this assertion to `packages/core-domain/test/persistence/sqlite-migrations.test.ts`:

```ts
import { openRowDatabase } from "../../src/repositories/bun-sqlite.js";

test("legacy openRowDatabase returns the same migrated app database shape", () => {
  const db = openRowDatabase(":memory:");
  try {
    expect(tableNames(db)).toEqual(
      expect.arrayContaining([
        "app_history",
        "permission_ledger_events",
        "pneuma_migrations",
        "rows",
      ])
    );
  } finally {
    db.close();
  }
});
```

- [x] **Step 2: Verify RED**

Run:

```bash
bun test packages/core-domain/test/persistence/sqlite-migrations.test.ts
```

Expected: FAIL because `openRowDatabase(":memory:")` returns a raw SQLite database with no framework tables.

- [x] **Step 3: Delegate old SQLite opener to the migrated opener**

In `packages/core-domain/src/repositories/bun-sqlite.ts`, make `openRowDatabase` delegate to `openPneumaSqliteDatabase`:

```ts
export function openRowDatabase(path: string = ":memory:"): Database {
  return openPneumaSqliteDatabase(path);
}
```

- [x] **Step 4: Remove duplicated schema ownership from stores**

In `packages/core-domain/src/repositories/bun-sqlite.ts`, keep CRUD behavior but delete constructor-owned rows DDL. In `packages/core-domain/src/lifecycle/bun-sqlite-app-history.ts`, keep append/list/restore/prune behavior but delete constructor-owned app_history DDL.

- [x] **Step 5: Add restart assertion for app_history**

Extend `packages/runtime/test/deployable-substrate.test.ts` before closing the first runtime:

```ts
await r1.history.append({
  app_id: appId,
  history_type: "snapshot",
  payload: { definition: "tags column added" },
  is_ai_generated: true,
  actor_id: "builder-1",
  actor_kind: "builder",
  description: "add tags column",
});
```

After reboot, add:

```ts
const history = await r2.history.listEntries(appId);
expect(history.map((entry) => entry.description)).toContain("add tags column");
expect(history[0]!.payload).toEqual({ definition: "tags column added" });
```

- [x] **Step 6: Update direct app_history callers to use migrated DB helper**

In `packages/core-domain/test/lifecycle/app-history.test.ts` and `packages/runtime/test/framework-operations.test.ts`, replace direct `new Database(":memory:")` app_history handles with:

```ts
openPneumaSqliteDatabase(":memory:")
```

In `packages/runtime/src/runtime.ts`, make legacy `config.history.sqlite_path` also use `openPneumaSqliteDatabase(...)`.

- [x] **Step 7: Verify GREEN**

```bash
bun test packages/core-domain/test/persistence/sqlite-migrations.test.ts packages/core-domain/test/lifecycle/app-history.test.ts packages/core-domain/test/repositories/bun-sqlite.test.ts packages/runtime/test/deployable-substrate.test.ts packages/runtime/test/framework-operations.test.ts
```

Expected: PASS.

- [x] **Step 8: Typecheck affected packages**

Run:

```bash
tsc --noEmit -p packages/core-domain/tsconfig.json && tsc --noEmit -p packages/runtime/tsconfig.json
```

Expected: PASS.

- [x] **Step 9: Commit Task 3**

Run:

```bash
git add docs/superpowers/plans/2026-05-01-m3-deployable-substrate.md packages/core-domain/src/repositories/bun-sqlite.ts packages/core-domain/src/lifecycle/bun-sqlite-app-history.ts packages/core-domain/test/persistence/sqlite-migrations.test.ts packages/core-domain/test/lifecycle/app-history.test.ts packages/runtime/test/framework-operations.test.ts packages/runtime/src/runtime.ts packages/runtime/test/deployable-substrate.test.ts
git commit -m "feat: persist runtime substrate state in unified sqlite"
```

### Task 4: SQLite Permission Ledger Store

**Files:**
- Create: `packages/core/src/permission-ledger-sqlite.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/permission-ledger-sqlite.test.ts`

- [x] **Step 1: Write the failing permission ledger SQLite test**

Create `packages/core/test/permission-ledger-sqlite.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openPneumaSqliteDatabase } from "@pneuma-framework/core-domain";
import {
  BunSqlitePermissionLedgerStore,
  type PermissionLedgerEvent,
} from "../src/index.js";

const event: PermissionLedgerEvent = {
  schema_version: 1,
  event_id: "permission-1",
  event_type: "permission_requested",
  at_ms: 1000,
  prompt_id: "prompt-1",
  app_id: "app-1",
  workspace_id: "workspace-1",
  tool: "definition.apply",
  capability: "definition:apply",
  target: { kind: "definition", id: "definition.apply:add_table_column:bookmarks:tags" },
  target_fingerprint: "definition.apply:add_table_column:bookmarks:tags",
  requested_principal: { kind: "build_agent", id: "agent-1" },
  detail: { summary: "Add tags column" },
};

describe("BunSqlitePermissionLedgerStore", () => {
  test("persists ledger events and derived requests across store reopen", () => {
    const dir = mkdtempSync(join(tmpdir(), "pneuma-ledger-sqlite-"));
    try {
      const dbPath = join(dir, "app.db");
      const db1 = openPneumaSqliteDatabase(dbPath);
      new BunSqlitePermissionLedgerStore(db1).append(event);
      db1.close();

      const db2 = openPneumaSqliteDatabase(dbPath);
      try {
        const store = new BunSqlitePermissionLedgerStore(db2);
        expect(store.list().map((item) => item.event_id)).toEqual(["permission-1"]);
        const requests = store.listRequests({ tool: "definition.apply" });
        expect(requests).toHaveLength(1);
        expect(requests[0]!.prompt_id).toBe("prompt-1");
        expect(requests[0]!.status).toBe("pending");
      } finally {
        db2.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [x] **Step 2: Verify RED**

Run:

```bash
bun test packages/core/test/permission-ledger-sqlite.test.ts
```

Expected: FAIL because `BunSqlitePermissionLedgerStore` does not exist.

- [x] **Step 3: Implement SQLite ledger store**

Create `packages/core/src/permission-ledger-sqlite.ts`:

```ts
import type { Database } from "bun:sqlite";
import {
  derivePermissionLedgerRequests,
  type PermissionLedgerEvent,
  type PermissionLedgerListOptions,
  type PermissionLedgerRequestListOptions,
  type PermissionLedgerRequestRecord,
  type PermissionLedgerStore,
} from "./permission-ledger.js";

export class BunSqlitePermissionLedgerStore implements PermissionLedgerStore {
  constructor(private readonly db: Database) {}

  append(event: PermissionLedgerEvent): void {
    this.db.run(
      `INSERT OR REPLACE INTO permission_ledger_events(
        event_id, prompt_id, app_id, workspace_id, event_type, at_ms, event_json
      ) VALUES(?, ?, ?, ?, ?, ?, ?)`,
      [
        event.event_id,
        event.prompt_id,
        event.app_id,
        event.workspace_id,
        event.event_type,
        event.at_ms,
        JSON.stringify(event),
      ],
    );
  }

  list(options: PermissionLedgerListOptions = {}): readonly PermissionLedgerEvent[] {
    const limit = options.limit ?? 1000;
    const rows = this.db.query<{ event_json: string }, [number]>(
      "SELECT event_json FROM permission_ledger_events ORDER BY at_ms ASC, event_id ASC LIMIT ?",
    ).all(limit);
    return rows.map((row) => JSON.parse(row.event_json) as PermissionLedgerEvent);
  }

  listRequests(options: PermissionLedgerRequestListOptions = {}): readonly PermissionLedgerRequestRecord[] {
    return derivePermissionLedgerRequests(this.list(), options);
  }

  getRequest(promptId: string, options: PermissionLedgerRequestListOptions = {}): PermissionLedgerRequestRecord | undefined {
    return this.listRequests(options).find((record) => record.prompt_id === promptId);
  }
}
```

Export it from `packages/core/src/index.ts`:

```ts
export { BunSqlitePermissionLedgerStore } from "./permission-ledger-sqlite.js";
```

- [x] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/core/test/permission-ledger-sqlite.test.ts packages/core/test/permission-ledger.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit Task 4**

Run:

```bash
git add packages/core/src/permission-ledger-sqlite.ts packages/core/src/index.ts packages/core/test/permission-ledger-sqlite.test.ts
git commit -m "feat: persist permission ledger in sqlite"
```

### Task 5: Release Manifest Contract

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/artifact.ts`
- Modify: `packages/core/test/artifact.test.ts`
- Modify: `templates/bookmarks-core-domain/scripts/build.sh`

- [x] **Step 1: Write failing manifest validation tests**

Add tests to `packages/core/test/artifact.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { validateBuildManifest } from "../src/artifact.js";

describe("validateBuildManifest release substrate fields", () => {
  test("accepts process, data, migration, and healthcheck metadata", () => {
    const manifest = validateBuildManifest({
      schemaVersion: 1,
      kind: "bookmarks-core-domain",
      entrypoint: "server/app.ts",
      produced: ["server/app.ts", "viewer/index.html"],
      processes: {
        web: {
          command: "bun server/app.ts",
          health: "/healthz",
        },
      },
      data: {
        volume: "/data",
        sqlite: "/data/app.db",
      },
      migrations: {
        command: "scripts/migrate.sh",
        direction: "up",
      },
      healthcheck: "/healthz",
    });

    expect(manifest.processes!.web.health).toBe("/healthz");
    expect(manifest.data!.sqlite).toBe("/data/app.db");
  });

  test("rejects a process without a command", () => {
    expect(() => validateBuildManifest({
      schemaVersion: 1,
      kind: "bad",
      entrypoint: "server/app.ts",
      produced: [],
      processes: {
        web: { health: "/healthz" },
      },
    })).toThrow("build manifest.processes.web.command must be a non-empty string");
  });
});
```

- [x] **Step 2: Verify RED**

Run:

```bash
bun test packages/core/test/artifact.test.ts
```

Expected: FAIL because `BuildManifest` and `validateBuildManifest` do not accept the new fields.

- [x] **Step 3: Extend `BuildManifest`**

Modify `packages/core/src/types.ts`:

```ts
export interface BuildManifest {
  schemaVersion: 1;
  kind: string;
  entrypoint: string;
  produced: string[];
  env?: Record<string, string>;
  notes?: string;
  deployHints?: {
    requiresMigration?: boolean;
    runtimeAgent?: "embedded" | "none";
  };
  processes?: Record<string, {
    command: string;
    health?: string;
    optional?: boolean;
  }>;
  data?: {
    volume?: string;
    sqlite?: string;
  };
  migrations?: {
    command: string;
    direction?: "up" | "down";
  };
  healthcheck?: string;
}
```

- [x] **Step 4: Extend manifest validation**

In `packages/core/src/artifact.ts`, add explicit validation for:

```ts
if (m.processes !== undefined) {
  if (!m.processes || typeof m.processes !== "object" || Array.isArray(m.processes)) {
    throw new Error("build manifest.processes must be an object");
  }
  for (const [name, proc] of Object.entries(m.processes as Record<string, unknown>)) {
    if (!proc || typeof proc !== "object") {
      throw new Error(`build manifest.processes.${name} must be an object`);
    }
    const p = proc as Record<string, unknown>;
    if (typeof p.command !== "string" || p.command.length === 0) {
      throw new Error(`build manifest.processes.${name}.command must be a non-empty string`);
    }
    if (p.health !== undefined && typeof p.health !== "string") {
      throw new Error(`build manifest.processes.${name}.health must be a string`);
    }
  }
}
```

Also validate `data.sqlite`, `data.volume`, `migrations.command`, `migrations.direction`, and `healthcheck` as strings when present.

- [x] **Step 5: Update reference template build manifest**

Change `templates/bookmarks-core-domain/scripts/build.sh` so the generated manifest uses the existing schema:

```json
{
  "schemaVersion": 1,
  "kind": "bookmarks-core-domain",
  "entrypoint": "server/app.ts",
  "produced": ["server/app.ts", "viewer/index.html", "manifest.json"],
  "processes": {
    "web": {
      "command": "bun server/app.ts",
      "health": "/healthz"
    }
  },
  "data": {
    "volume": "/data",
    "sqlite": "/data/app.db"
  },
  "migrations": {
    "command": "scripts/migrate.sh",
    "direction": "up"
  },
  "healthcheck": "/healthz",
  "deployHints": {
    "requiresMigration": true,
    "runtimeAgent": "none"
  }
}
```

- [x] **Step 6: Verify GREEN**

Run:

```bash
bun test packages/core/test/artifact.test.ts
tmpdir=$(mktemp -d) && PNEUMA_BUILD_DIR="$tmpdir" PNEUMA_ARTIFACT_MANIFEST_PATH="$tmpdir/build.manifest.json" templates/bookmarks-core-domain/scripts/build.sh
```

Expected: PASS and build script emits a valid manifest.

- [x] **Step 7: Commit Task 5**

Run:

```bash
git add packages/core/src/types.ts packages/core/src/artifact.ts packages/core/test/artifact.test.ts templates/bookmarks-core-domain/scripts/build.sh
git commit -m "feat: describe deployable release manifests"
```

### Task 6: Reference Template Lifecycle Over The Real Substrate

**Files:**
- Modify: `templates/bookmarks-core-domain/server/config.ts`
- Modify: `templates/bookmarks-core-domain/server/app.ts`
- Modify: `templates/bookmarks-core-domain/manifest.json`
- Create: `templates/bookmarks-core-domain/scripts/migrate.sh`
- Create: `templates/bookmarks-core-domain/scripts/deploy.sh`
- Create: `templates/bookmarks-core-domain/test/deployable-substrate.test.ts`

- [x] **Step 1: Write failing template lifecycle test**

Create `templates/bookmarks-core-domain/test/deployable-substrate.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const templateRoot = join(import.meta.dir, "..");

describe("bookmarks-core-domain deployable substrate", () => {
  test("migrate creates one app.db and build emits a schemaVersion 1 release manifest", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-bookmarks-m3-"));
    try {
      await $`PNEUMA_WORKSPACE=${workspace} ${templateRoot}/scripts/migrate.sh`;
      expect(existsSync(join(workspace, "data", "app.db"))).toBe(true);

      const buildDir = join(workspace, ".pneuma-build", "test");
      const manifestPath = join(buildDir, "build.manifest.json");
      await $`PNEUMA_BUILD_DIR=${buildDir} PNEUMA_ARTIFACT_MANIFEST_PATH=${manifestPath} ${templateRoot}/scripts/build.sh`;
      const manifest = await Bun.file(manifestPath).json();
      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.entrypoint).toBe("server/app.ts");
      expect(manifest.data.sqlite).toBe("/data/app.db");
      expect(manifest.processes.web.health).toBe("/healthz");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
```

- [x] **Step 2: Verify RED**

Run:

```bash
bun test templates/bookmarks-core-domain/test/deployable-substrate.test.ts
```

Expected: FAIL because `scripts/migrate.sh` is missing and `build.sh` still emits the old manifest shape.

- [x] **Step 3: Move template config to one SQLite app database**

In `templates/bookmarks-core-domain/server/config.ts`, set:

```ts
const workspaceRoot = process.env.PNEUMA_WORKSPACE ?? join(process.cwd(), ".pneuma-workspace");
const dataDir = process.env.PNEUMA_DATA_DIR ?? join(workspaceRoot, "data");
const appDbPath = process.env.PNEUMA_SQLITE_PATH ?? join(dataDir, "app.db");
```

In the exported `AppConfig`, use:

```ts
persistence: { kind: "sqlite", path: appDbPath },
audit: { ndjson_path: join(dataDir, "audit.ndjson") },
```

Remove template-level `storage.sqlite_path` and `history.sqlite_path` once `persistence` is present.

- [x] **Step 4: Add migrate script**

Create `templates/bookmarks-core-domain/scripts/migrate.sh`:

```sh
#!/bin/sh
set -eu

HERE="$(dirname "$0")/.."
WS="${PNEUMA_WORKSPACE:-$HERE/.pneuma-workspace}"
DB="${PNEUMA_SQLITE_PATH:-$WS/data/app.db}"

mkdir -p "$(dirname "$DB")"
PNEUMA_SQLITE_PATH="$DB" bun --cwd "$HERE" -e '
  const { openPneumaSqliteDatabase } = await import("@pneuma-framework/core-domain");
  const db = openPneumaSqliteDatabase(process.env.PNEUMA_SQLITE_PATH);
  db.close();
'

echo "##pneuma:progress 100 migrated"
```

Set executable bit:

```bash
chmod +x templates/bookmarks-core-domain/scripts/migrate.sh
```

- [x] **Step 5: Add deploy script**

Create `templates/bookmarks-core-domain/scripts/deploy.sh`:

```sh
#!/bin/sh
set -eu

HERE="$(dirname "$0")/.."
IMAGE="${PNEUMA_DOCKER_IMAGE:-pneuma-bookmarks-core-domain:m3}"

docker build -f "$HERE/Dockerfile" -t "$IMAGE" "$(cd "$HERE/../.." && pwd)"
echo "pneuma: built docker image $IMAGE"
```

Set executable bit:

```bash
chmod +x templates/bookmarks-core-domain/scripts/deploy.sh
```

- [x] **Step 6: Update manifest scripts**

In `templates/bookmarks-core-domain/manifest.json`, set:

```json
"scripts": {
  "setup": "scripts/setup.sh",
  "dev": "scripts/dev.sh",
  "stop": "scripts/stop.sh",
  "build": "scripts/build.sh",
  "migrate": "scripts/migrate.sh",
  "deploy": "scripts/deploy.sh"
}
```

- [x] **Step 7: Ensure server health route**

In `templates/bookmarks-core-domain/server/app.ts`, make `/healthz` return:

```ts
return new Response(JSON.stringify({ ok: true, app_id: config.app_id }), {
  status: 200,
  headers: { "content-type": "application/json" },
});
```

Keep `/api/health` delegated to runtime.

- [x] **Step 8: Verify GREEN**

Run:

```bash
bun test templates/bookmarks-core-domain/test/deployable-substrate.test.ts
bun run --cwd templates/bookmarks-core-domain build
```

Expected: PASS.

- [x] **Step 9: Regression verify**

Run:

```bash
bun test templates/bookmarks-core-domain/test/operation-declarations.test.ts packages/cli/test/e2e.test.ts packages/core/test/lifecycle-migrate.test.ts
```

Expected: PASS.

- [x] **Step 10: Commit Task 6**

Run:

```bash
git add templates/bookmarks-core-domain/server/config.ts templates/bookmarks-core-domain/server/app.ts templates/bookmarks-core-domain/manifest.json templates/bookmarks-core-domain/scripts/migrate.sh templates/bookmarks-core-domain/scripts/deploy.sh templates/bookmarks-core-domain/scripts/build.sh templates/bookmarks-core-domain/test/deployable-substrate.test.ts
git commit -m "feat: wire bookmarks template to deployable substrate"
```

### Task 7: Docker-First Release Artifact

**Files:**
- Create: `templates/bookmarks-core-domain/Dockerfile`
- Create: `templates/bookmarks-core-domain/docker-compose.yml`
- Create: `examples/m3-deployable-substrate/smoke.test.ts`
- Create: `examples/m3-deployable-substrate/README.md`

- [x] **Step 1: Write failing artifact inspection smoke test**

Create `examples/m3-deployable-substrate/smoke.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templateRoot = join(import.meta.dir, "..", "..", "templates", "bookmarks-core-domain");

describe("M3 deployable substrate artifact", () => {
  test("reference template includes Docker release files", () => {
    expect(existsSync(join(templateRoot, "Dockerfile"))).toBe(true);
    expect(existsSync(join(templateRoot, "docker-compose.yml"))).toBe(true);
  });
});
```

- [x] **Step 2: Verify RED**

Run:

```bash
bun test examples/m3-deployable-substrate/smoke.test.ts
```

Expected: FAIL because Docker files do not exist.

- [x] **Step 3: Add Dockerfile**

Create `templates/bookmarks-core-domain/Dockerfile`:

```Dockerfile
FROM oven/bun:1 AS build
WORKDIR /repo
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/core-domain ./packages/core-domain
COPY packages/runtime ./packages/runtime
COPY templates/bookmarks-core-domain ./templates/bookmarks-core-domain
WORKDIR /repo/templates/bookmarks-core-domain
RUN bun install
RUN bun x tsc --noEmit -p tsconfig.json

FROM oven/bun:1-slim AS runtime
ENV NODE_ENV=production PNEUMA_WORKSPACE=/data PNEUMA_PORT_HINT=3000
WORKDIR /app
COPY --from=build /repo /app
WORKDIR /app/templates/bookmarks-core-domain
VOLUME /data
EXPOSE 3000
CMD ["bun", "server/app.ts"]
```

- [x] **Step 4: Add docker-compose**

Create `templates/bookmarks-core-domain/docker-compose.yml`:

```yaml
services:
  bookmarks:
    build:
      context: ../..
      dockerfile: templates/bookmarks-core-domain/Dockerfile
    environment:
      PNEUMA_WORKSPACE: /data
      PNEUMA_PORT_HINT: "3000"
    ports:
      - "3000:3000"
    volumes:
      - bookmarks-data:/data
    healthcheck:
      test: ["CMD", "bun", "-e", "const r = await fetch('http://127.0.0.1:3000/healthz'); process.exit(r.ok ? 0 : 1)"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  bookmarks-data:
```

- [x] **Step 5: Write M3 runbook**

Create `examples/m3-deployable-substrate/README.md` with this structure:

```md
# M3 Deployable Substrate Demo

## What This Proves

An app capability created through Pneuma primitives survives real persistence, release packaging, Docker runtime, and restart.

## Run

```bash
bun test packages/runtime/test/deployable-substrate.test.ts packages/core/test/permission-ledger-sqlite.test.ts
bun test templates/bookmarks-core-domain/test/deployable-substrate.test.ts
docker compose -f templates/bookmarks-core-domain/docker-compose.yml up --build
```

## Inspect

```bash
sqlite3 <workspace>/data/app.db ".tables"
sqlite3 <workspace>/data/app.db "select id, table_id from rows;"
sqlite3 <workspace>/data/app.db "select version, description from app_history;"
sqlite3 <workspace>/data/app.db "select event_type, prompt_id from permission_ledger_events;"
```

## Story

1. Dev mode creates data and definition rows.
2. Build emits a release manifest with web process, healthcheck, migrations, and volume contract.
3. Docker image runs the same app against `/data/app.db`.
4. Restart keeps rows, app definition, history, and permission ledger.
```

- [x] **Step 6: Verify GREEN**

Run:

```bash
bun test examples/m3-deployable-substrate/smoke.test.ts
```

Expected: PASS.

- [x] **Step 7: Optional Docker smoke when Docker is available**

Run:

```bash
docker --version
docker compose -f templates/bookmarks-core-domain/docker-compose.yml config
```

Expected if Docker is installed: both commands exit 0.

- [x] **Step 8: Regression verify**

Run:

```bash
bun test packages/runtime/test/deployable-substrate.test.ts packages/core/test/permission-ledger-sqlite.test.ts templates/bookmarks-core-domain/test/deployable-substrate.test.ts examples/m3-deployable-substrate/smoke.test.ts
bun run typecheck
git diff --check
```

Expected: PASS.

- [x] **Step 9: Commit Task 7**

Run:

```bash
git add templates/bookmarks-core-domain/Dockerfile templates/bookmarks-core-domain/docker-compose.yml examples/m3-deployable-substrate
git commit -m "feat: add docker-first deployable substrate demo"
```

### Task 8: Real Docker Runtime Smoke

**Files:**
- Create: `examples/m3-deployable-substrate/docker-smoke.test.ts`
- Create: `examples/m3-deployable-substrate/docker-smoke.sh`
- Modify: `examples/m3-deployable-substrate/README.md`
- Modify: `templates/bookmarks-core-domain/Dockerfile`
- Modify: `templates/bookmarks-core-domain/docker-compose.yml`

- [x] **Step 1: Write failing Docker smoke test**

Create a Bun test that expects `examples/m3-deployable-substrate/docker-smoke.sh`
to exist and execute successfully. First run failed because the script did not exist.

- [x] **Step 2: Add Docker smoke script**

Add a script that builds the reference image, starts a container with a mounted
volume, waits for `/healthz`, writes a bookmark through the real HTTP Operation
API, verifies `/data/app.db`, restarts the container, re-reads the mapped host
port, and verifies `/healthz`, `/data/app.db`, and the persisted bookmark again.

- [x] **Step 3: Align Docker release env with manifest volume contract**

Set `PNEUMA_DATA_DIR=/data` and `PNEUMA_SQLITE_PATH=/data/app.db` in both the
Dockerfile and docker-compose config so release runtime uses the same DB path
that the release manifest advertises.

- [x] **Step 4: Verify GREEN**

Run:

```bash
bun test examples/m3-deployable-substrate/docker-smoke.test.ts
```

Expected: PASS.

- [x] **Step 5: Regression verify**

Run:

```bash
bun test packages/core-domain/test/persistence/sqlite-database.test.ts packages/core-domain/test/persistence/sqlite-migrations.test.ts packages/runtime/test/deployable-substrate.test.ts packages/core/test/permission-ledger-sqlite.test.ts templates/bookmarks-core-domain/test/deployable-substrate.test.ts examples/m3-deployable-substrate/smoke.test.ts examples/m3-deployable-substrate/docker-smoke.test.ts
docker compose -f templates/bookmarks-core-domain/docker-compose.yml config
bun run typecheck
git diff --check
```

Expected: PASS.

## Milestone Exit Check / 里程碑验收

M3 can close when these commands pass:

```bash
bun test packages/core-domain/test/persistence/sqlite-database.test.ts packages/core-domain/test/persistence/sqlite-migrations.test.ts packages/runtime/test/deployable-substrate.test.ts packages/core/test/permission-ledger-sqlite.test.ts templates/bookmarks-core-domain/test/deployable-substrate.test.ts examples/m3-deployable-substrate/smoke.test.ts
bun test packages/runtime/test/definition-loader.test.ts packages/runtime/test/definition-apply.test.ts packages/core/test/permission-ledger.test.ts packages/core/test/artifact.test.ts
bun run typecheck
git diff --check
```

And this manual Docker check has been run on a machine with Docker:

```bash
docker compose -f templates/bookmarks-core-domain/docker-compose.yml config
docker compose -f templates/bookmarks-core-domain/docker-compose.yml up --build
```

Success sentence:

```text
A Builder/Agent-created capability survives real SQLite persistence, release manifest generation, Docker packaging, container restart, and remains inspectable through Pneuma primitives.
```
