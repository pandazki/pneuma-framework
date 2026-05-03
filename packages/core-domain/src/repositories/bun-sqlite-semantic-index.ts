import { Database } from "bun:sqlite";

import {
  searchDocuments,
  type SemanticIndexDocument,
  type SemanticIndexSearchResult,
  type SemanticIndexStore,
} from "../services/semantic-index.js";

interface SemanticIndexRow {
  readonly index_id: string;
  readonly source_table_id: string;
  readonly source_row_id: string;
  readonly source_fingerprint: string;
  readonly text: string;
  readonly vector_json: string;
  readonly metadata_json: string;
  readonly indexed_at_ms: number;
}

export class BunSqliteSemanticIndexStore implements SemanticIndexStore {
  private readonly db: Database;
  private readonly ownsDb: boolean;

  constructor(pathOrDb: string | Database) {
    if (typeof pathOrDb === "string") {
      this.db = new Database(pathOrDb);
      this.ownsDb = true;
    } else {
      this.db = pathOrDb;
      this.ownsDb = false;
    }
    ensureSemanticIndexSchema(this.db);
  }

  async upsert(document: SemanticIndexDocument): Promise<void> {
    this.db
      .query(
        `INSERT INTO semantic_index_entries
          (index_id, source_table_id, source_row_id, source_fingerprint, text, vector_json, metadata_json, indexed_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(index_id, source_table_id, source_row_id) DO UPDATE SET
          source_fingerprint = excluded.source_fingerprint,
          text = excluded.text,
          vector_json = excluded.vector_json,
          metadata_json = excluded.metadata_json,
          indexed_at_ms = excluded.indexed_at_ms`
      )
      .run(
        document.index_id,
        document.source_table_id,
        document.source_row_id,
        document.source_fingerprint,
        document.text,
        JSON.stringify(document.vector),
        JSON.stringify(document.metadata),
        document.indexed_at_ms
      );
  }

  async listByIndex(indexId: string): Promise<readonly SemanticIndexDocument[]> {
    const rows = this.db
      .query<SemanticIndexRow, [string]>(
        `SELECT index_id, source_table_id, source_row_id, source_fingerprint, text,
                vector_json, metadata_json, indexed_at_ms
         FROM semantic_index_entries
         WHERE index_id = ?
         ORDER BY source_table_id, source_row_id`
      )
      .all(indexId);
    return rows.map(rowToDocument);
  }

  async search(input: {
    readonly index_id: string;
    readonly vector: readonly number[];
    readonly limit: number;
    readonly source_table_id?: string;
  }): Promise<readonly SemanticIndexSearchResult[]> {
    return searchDocuments(await this.listByIndex(input.index_id), input);
  }

  async deleteBySource(input: {
    readonly index_id: string;
    readonly source_table_id: string;
    readonly source_row_id: string;
  }): Promise<void> {
    this.db
      .query(
        `DELETE FROM semantic_index_entries
         WHERE index_id = ? AND source_table_id = ? AND source_row_id = ?`
      )
      .run(input.index_id, input.source_table_id, input.source_row_id);
  }

  async clear(indexId: string): Promise<void> {
    this.db
      .query("DELETE FROM semantic_index_entries WHERE index_id = ?")
      .run(indexId);
  }

  async close(): Promise<void> {
    if (this.ownsDb) this.db.close();
  }
}

export function ensureSemanticIndexSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS semantic_index_entries (
      index_id TEXT NOT NULL,
      source_table_id TEXT NOT NULL,
      source_row_id TEXT NOT NULL,
      source_fingerprint TEXT NOT NULL,
      text TEXT NOT NULL,
      vector_json TEXT NOT NULL CHECK(json_valid(vector_json)),
      metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
      indexed_at_ms INTEGER NOT NULL,
      PRIMARY KEY(index_id, source_table_id, source_row_id)
    );
    CREATE INDEX IF NOT EXISTS idx_semantic_index_entries_index
      ON semantic_index_entries(index_id);
    CREATE INDEX IF NOT EXISTS idx_semantic_index_entries_source
      ON semantic_index_entries(index_id, source_table_id, source_row_id);
  `);
}

function rowToDocument(row: SemanticIndexRow): SemanticIndexDocument {
  return {
    index_id: row.index_id,
    source_table_id: row.source_table_id,
    source_row_id: row.source_row_id,
    source_fingerprint: row.source_fingerprint,
    text: row.text,
    vector: parseJsonArray(row.vector_json),
    metadata: parseJsonObject(row.metadata_json),
    indexed_at_ms: row.indexed_at_ms,
  };
}

function parseJsonArray(value: string): readonly number[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => (typeof item === "number" ? item : 0));
}

function parseJsonObject(value: string): Readonly<Record<string, unknown>> {
  const parsed = JSON.parse(value) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}
