import { Database } from "bun:sqlite";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import type { BookmarkRow, BookmarkWithInterpretations, GraphEdge, GraphNode, InterpretationRow } from "./api-types.js";

/**
 * Apply migrations idempotently. The host's `migrate.sh` handles this in dev
 * (via the sqlite3 CLI against `$WS/migrations/`), but the release container
 * has no shell migrator — so the server needs to be able to bring a fresh
 * `/data/db.sqlite` up to schema on its own.
 *
 * Resolution order for the migrations directory:
 *   1. `$workspaceRoot/migrations/`      — user-added migrations (dev path)
 *   2. `<template>/scaffold/migrations/` — baked initial schema (container path)
 *
 * Each .sql file is expected to be idempotent (CREATE … IF NOT EXISTS) so
 * re-executing a known migration is a no-op. The _migrations table tracks
 * applied names and skips them the second time through.
 */
export function ensureSchema(workspaceRoot: string): void {
  const dbDir = join(workspaceRoot, ".pneuma-data");
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
  const dbPath = join(dbDir, "db.sqlite");
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);");

    const candidates = [
      join(workspaceRoot, "migrations"),
      join(import.meta.dir, "..", "scaffold", "migrations"),
    ];
    const migrationsDir = candidates.find((p) => existsSync(p));
    if (!migrationsDir) return;

    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
    const seen = new Set(
      db.query<{ name: string }, []>("SELECT name FROM _migrations").all().map((r) => r.name),
    );
    for (const name of files) {
      if (seen.has(name)) continue;
      const sql = readFileSync(join(migrationsDir, name), "utf8");
      db.exec(sql);
      db.run("INSERT INTO _migrations(name, applied_at) VALUES(?, ?)", [name, Date.now()]);
    }
  } finally {
    db.close();
  }
}

export interface DbHandle {
  readonly path: string;
  insertBookmark(b: { url: string; title: string | null; rawText: string }): BookmarkRow;
  getBookmark(id: number): BookmarkRow | undefined;
  insertInterpretation(i: {
    bookmarkId: number;
    lensName: string;
    body: string;
    embedding: Float32Array;
  }): InterpretationRow;
  listBookmarksWithInterpretations(limit?: number): BookmarkWithInterpretations[];
  buildGraph(threshold: number): { nodes: GraphNode[]; edges: GraphEdge[] };
  close(): void;
}

export function openDb(workspaceRoot: string): DbHandle {
  const dbDir = join(workspaceRoot, ".pneuma-data");
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
  const path = join(dbDir, "db.sqlite");
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

  return {
    path,
    insertBookmark({ url, title, rawText }) {
      const now = Date.now();
      db.run(
        "INSERT OR IGNORE INTO bookmarks(url, title, fetched_at, raw_text) VALUES(?, ?, ?, ?)",
        [url, title, now, rawText],
      );
      const row = db.query("SELECT id, url, title, fetched_at FROM bookmarks WHERE url = ?").get(url) as BookmarkRow;
      return row;
    },
    getBookmark(id) {
      return db.query("SELECT id, url, title, fetched_at FROM bookmarks WHERE id = ?").get(id) as BookmarkRow | undefined;
    },
    insertInterpretation({ bookmarkId, lensName, body, embedding }) {
      const now = Date.now();
      const blob = new Uint8Array(embedding.buffer, embedding.byteOffset, embedding.byteLength);
      db.run(
        `INSERT OR REPLACE INTO interpretations(bookmark_id, lens_name, body, embedding, created_at)
         VALUES(?, ?, ?, ?, ?)`,
        [bookmarkId, lensName, body, blob, now],
      );
      const row = db.query(
        "SELECT id, bookmark_id, lens_name, body, created_at FROM interpretations WHERE bookmark_id = ? AND lens_name = ?",
      ).get(bookmarkId, lensName) as InterpretationRow;
      return row;
    },
    listBookmarksWithInterpretations(limit = 50) {
      const bookmarks = db.query<BookmarkRow, [number]>(
        "SELECT id, url, title, fetched_at FROM bookmarks ORDER BY fetched_at DESC LIMIT ?",
      ).all(limit);
      const out: BookmarkWithInterpretations[] = [];
      const ipStmt = db.query<InterpretationRow, [number]>(
        "SELECT id, bookmark_id, lens_name, body, created_at FROM interpretations WHERE bookmark_id = ?",
      );
      for (const b of bookmarks) out.push({ ...b, interpretations: ipStmt.all(b.id) });
      return out;
    },
    buildGraph(threshold) {
      const bookmarks = db.query<BookmarkRow, []>(
        "SELECT id, url, title, fetched_at FROM bookmarks ORDER BY fetched_at DESC",
      ).all();
      const embStmt = db.query<{ bookmark_id: number; embedding: Uint8Array }, [number]>(
        "SELECT bookmark_id, embedding FROM interpretations WHERE bookmark_id = ? LIMIT 1",
      );
      const vecs: Map<number, Float32Array> = new Map();
      for (const b of bookmarks) {
        const row = embStmt.get(b.id);
        if (!row) continue;
        const buf = row.embedding.buffer.slice(row.embedding.byteOffset, row.embedding.byteOffset + row.embedding.byteLength);
        vecs.set(b.id, new Float32Array(buf as ArrayBuffer));
      }
      const nodes: GraphNode[] = bookmarks.map((b) => ({ id: b.id, url: b.url, title: b.title }));
      const edges: GraphEdge[] = [];
      const ids = [...vecs.keys()];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = vecs.get(ids[i]!);
          const b = vecs.get(ids[j]!);
          if (!a || !b) continue;
          const w = cosine(a, b);
          if (w > threshold) edges.push({ source: ids[i]!, target: ids[j]!, weight: w });
        }
      }
      return { nodes, edges };
    },
    close() { db.close(); },
  };
}

function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]!; }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
