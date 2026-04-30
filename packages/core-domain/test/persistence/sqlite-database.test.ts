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
        expect(
          db
            .query<{ journal_mode: string }, []>("PRAGMA journal_mode")
            .get()!
            .journal_mode.toLowerCase()
        ).toBe("wal");
        expect(
          db
            .query<{ foreign_keys: number }, []>("PRAGMA foreign_keys")
            .get()!
            .foreign_keys
        ).toBe(1);
      } finally {
        db.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
