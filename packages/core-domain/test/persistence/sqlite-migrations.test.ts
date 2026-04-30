import { describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openPneumaSqliteDatabase } from "../../src/persistence/sqlite/database.js";
import { runPneumaSqliteMigrations } from "../../src/persistence/sqlite/migrations.js";
import { openRowDatabase } from "../../src/repositories/bun-sqlite.js";

function tableNames(db: Database): string[] {
  return db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    )
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
        expect(tableNames(db)).toEqual(
          expect.arrayContaining([
            "app_history",
            "permission_ledger_events",
            "pneuma_migrations",
            "rows",
          ])
        );
        const migrations = db
          .query<{ name: string }, []>(
            "SELECT name FROM pneuma_migrations ORDER BY name"
          )
          .all();
        expect(migrations.map((row) => row.name)).toEqual([
          "0001_framework_base",
        ]);
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
        const count = db
          .query<{ count: number }, []>(
            "SELECT COUNT(*) AS count FROM pneuma_migrations"
          )
          .get()!.count;
        expect(count).toBe(1);
      } finally {
        db.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

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
});
