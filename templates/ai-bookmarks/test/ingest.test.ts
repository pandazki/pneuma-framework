import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { openDb } from "../server/db.js";

function seedSchema(ws: string): void {
  const template = join(import.meta.dir, "..");
  const sql = readFileSync(join(template, "scaffold", "migrations", "001-init.sql"), "utf8");
  const dbPath = join(ws, ".pneuma-data", "db.sqlite");
  const direct = new Database(dbPath);
  direct.exec(sql);
  direct.close();
}

test("db.insertBookmark + insertInterpretation + listBookmarksWithInterpretations round-trip", () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-bookmarks-"));
  mkdirSync(join(ws, ".pneuma-data"), { recursive: true });
  seedSchema(ws);
  const db = openDb(ws);
  const b = db.insertBookmark({ url: "https://example.com", title: "Example", rawText: "hello world" });
  const vec = Float32Array.from([0.1, 0.2, 0.3]);
  db.insertInterpretation({ bookmarkId: b.id, lensName: "test", body: "analysis", embedding: vec });
  const rows = db.listBookmarksWithInterpretations();
  expect(rows.length).toBe(1);
  expect(rows[0]!.interpretations.length).toBe(1);
  expect(rows[0]!.interpretations[0]!.lens_name).toBe("test");
  db.close();
});

test("db.buildGraph edges above threshold", () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-graph-"));
  mkdirSync(join(ws, ".pneuma-data"), { recursive: true });
  seedSchema(ws);
  const db = openDb(ws);
  const a = db.insertBookmark({ url: "https://a.example", title: "A", rawText: "" });
  const b = db.insertBookmark({ url: "https://b.example", title: "B", rawText: "" });
  const c = db.insertBookmark({ url: "https://c.example", title: "C", rawText: "" });
  db.insertInterpretation({ bookmarkId: a.id, lensName: "l", body: "", embedding: Float32Array.from([1, 0, 0]) });
  db.insertInterpretation({ bookmarkId: b.id, lensName: "l", body: "", embedding: Float32Array.from([0.95, 0.05, 0]) });
  db.insertInterpretation({ bookmarkId: c.id, lensName: "l", body: "", embedding: Float32Array.from([0, 1, 0]) });
  const g = db.buildGraph(0.7);
  // a<->b ≈ 0.998; a<->c = 0; b<->c ≈ 0.05. Only one edge.
  // buildGraph orders by fetched_at DESC and three rows land on the same ms,
  // so the (source, target) tuple orientation is not guaranteed — assert as an undirected pair.
  expect(g.edges.length).toBe(1);
  const edge = g.edges[0]!;
  const pair = new Set([edge.source, edge.target]);
  expect(pair.has(a.id)).toBe(true);
  expect(pair.has(b.id)).toBe(true);
  expect(pair.has(c.id)).toBe(false);
  expect(edge.weight).toBeGreaterThan(0.9);
  db.close();
});
