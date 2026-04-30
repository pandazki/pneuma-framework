import type { Database } from "bun:sqlite";

const BASE_MIGRATION = "0001_framework_base";

export function runPneumaSqliteMigrations(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pneuma_migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = db
    .query<{ name: string }, [string]>(
      "SELECT name FROM pneuma_migrations WHERE name = ? LIMIT 1"
    )
    .get(BASE_MIGRATION);
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

  db.run("INSERT INTO pneuma_migrations(name, applied_at) VALUES(?, ?)", [
    BASE_MIGRATION,
    Date.now(),
  ]);
}
