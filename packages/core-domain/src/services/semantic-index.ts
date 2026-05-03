import { createHash } from "node:crypto";

import type { Row } from "../aggregates/row.js";
import type { PermissionContext } from "../value-objects/permission-context.js";
import type { EmbeddingProvider } from "./embedding-provider.js";

export type SemanticIndexStatus = "ready" | "missing" | "stale" | "orphaned";

export interface SemanticProjection {
  readonly fields: readonly string[];
}

export interface SemanticIndexDocument {
  readonly index_id: string;
  readonly source_table_id: string;
  readonly source_row_id: string;
  readonly source_fingerprint: string;
  readonly text: string;
  readonly vector: readonly number[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly indexed_at_ms: number;
}

export interface SemanticIndexSearchResult extends SemanticIndexDocument {
  readonly score: number;
}

export interface SemanticIndexStats {
  readonly index_id: string;
  readonly status: SemanticIndexStatus;
  readonly source_count: number;
  readonly indexed_count: number;
  readonly ready_count: number;
  readonly missing_count: number;
  readonly stale_count: number;
  readonly orphaned_count: number;
}

export interface SemanticIndexStore {
  upsert(document: SemanticIndexDocument): Promise<void>;
  listByIndex(indexId: string): Promise<readonly SemanticIndexDocument[]>;
  search(input: {
    readonly index_id: string;
    readonly vector: readonly number[];
    readonly limit: number;
    readonly source_table_id?: string;
  }): Promise<readonly SemanticIndexSearchResult[]>;
  deleteBySource(input: {
    readonly index_id: string;
    readonly source_table_id: string;
    readonly source_row_id: string;
  }): Promise<void>;
  clear(indexId: string): Promise<void>;
}

export class InMemorySemanticIndexStore implements SemanticIndexStore {
  private readonly docs = new Map<string, SemanticIndexDocument>();

  async upsert(document: SemanticIndexDocument): Promise<void> {
    this.docs.set(documentKey(document), cloneDocument(document));
  }

  async listByIndex(indexId: string): Promise<readonly SemanticIndexDocument[]> {
    return [...this.docs.values()]
      .filter((doc) => doc.index_id === indexId)
      .map(cloneDocument);
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
    this.docs.delete(sourceKey(input));
  }

  async clear(indexId: string): Promise<void> {
    for (const key of [...this.docs.keys()]) {
      if (key.startsWith(`${indexId}\0`)) this.docs.delete(key);
    }
  }
}

export class SemanticIndexService {
  constructor(
    private readonly deps: {
      readonly store: SemanticIndexStore;
      readonly embeddingProvider: EmbeddingProvider;
      readonly model: string;
    }
  ) {}

  async rebuild(input: {
    readonly index_id: string;
    readonly source_rows: readonly Row[];
    readonly projection: SemanticProjection;
    readonly permissionContext: PermissionContext;
  }): Promise<SemanticIndexStats> {
    await this.deps.store.clear(input.index_id);
    for (const row of input.source_rows) {
      const text = semanticDocumentText(row, input.projection);
      const vector = await this.deps.embeddingProvider.embed(
        { model: this.deps.model, text },
        input.permissionContext
      );
      await this.deps.store.upsert({
        index_id: input.index_id,
        source_table_id: row.table_id,
        source_row_id: row.id,
        source_fingerprint: semanticSourceFingerprint(row, input.projection),
        text,
        vector,
        metadata: semanticDocumentMetadata(row, input.projection),
        indexed_at_ms: Date.now(),
      });
    }
    return await this.explainStaleness(input);
  }

  async search(input: {
    readonly index_id: string;
    readonly query: string;
    readonly limit: number;
    readonly source_rows: readonly Row[];
    readonly projection: SemanticProjection;
    readonly permissionContext: PermissionContext;
  }): Promise<
    SemanticIndexStats & {
      readonly rows: readonly SemanticIndexSearchResult[];
      readonly index_status: SemanticIndexStatus;
    }
  > {
    const stats = await this.explainStaleness(input);
    const vector = await this.deps.embeddingProvider.embed(
      { model: this.deps.model, text: input.query },
      input.permissionContext
    );
    const sourceTableId = input.source_rows[0]?.table_id;
    const rows = await this.deps.store.search({
      index_id: input.index_id,
      vector,
      limit: input.limit,
      source_table_id: sourceTableId,
    });
    return { ...stats, index_status: stats.status, rows };
  }

  async explainStaleness(input: {
    readonly index_id: string;
    readonly source_rows: readonly Row[];
    readonly projection: SemanticProjection;
  }): Promise<SemanticIndexStats> {
    const docs = await this.deps.store.listByIndex(input.index_id);
    return semanticIndexStats(input.index_id, input.source_rows, input.projection, docs);
  }
}

export function semanticDocumentText(row: Row, projection: SemanticProjection): string {
  return projection.fields
    .map((field) => valueToSearchText(row.getCell(field)))
    .filter((value) => value.length > 0)
    .join("\n");
}

export function semanticDocumentMetadata(
  row: Row,
  projection: SemanticProjection
): Readonly<Record<string, unknown>> {
  const metadata: Record<string, unknown> = {
    source_table_id: row.table_id,
    source_row_id: row.id,
  };
  for (const field of projection.fields) metadata[field] = row.getCell(field);
  return metadata;
}

export function semanticSourceFingerprint(
  row: Row,
  projection: SemanticProjection
): string {
  const projected: Record<string, unknown> = {};
  for (const field of projection.fields) projected[field] = normalizeValue(row.getCell(field));
  return createHash("sha256")
    .update(stableStringify(projected))
    .digest("hex");
}

export function cosineSimilarity(
  a: readonly number[],
  b: readonly number[]
): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    aNorm += av * av;
    bNorm += bv * bv;
  }
  if (aNorm === 0 || bNorm === 0) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

export function searchDocuments(
  documents: readonly SemanticIndexDocument[],
  input: {
    readonly vector: readonly number[];
    readonly limit: number;
    readonly source_table_id?: string;
  }
): readonly SemanticIndexSearchResult[] {
  if (input.limit <= 0) return [];
  return documents
    .filter((doc) => !input.source_table_id || doc.source_table_id === input.source_table_id)
    .map((doc) => ({
      ...cloneDocument(doc),
      score: cosineSimilarity(doc.vector, input.vector),
    }))
    .sort((a, b) => {
      const byScore = b.score - a.score;
      if (byScore !== 0) return byScore;
      return `${a.source_table_id}:${a.source_row_id}`.localeCompare(
        `${b.source_table_id}:${b.source_row_id}`
      );
    })
    .slice(0, input.limit);
}

export function semanticIndexStats(
  indexId: string,
  sourceRows: readonly Row[],
  projection: SemanticProjection,
  documents: readonly SemanticIndexDocument[]
): SemanticIndexStats {
  const sourceKeys = new Set(sourceRows.map((row) => rowKey(row.table_id, row.id)));
  const docsBySource = new Map<string, SemanticIndexDocument>();
  for (const doc of documents) docsBySource.set(rowKey(doc.source_table_id, doc.source_row_id), doc);

  let readyCount = 0;
  let missingCount = 0;
  let staleCount = 0;
  for (const row of sourceRows) {
    const doc = docsBySource.get(rowKey(row.table_id, row.id));
    if (!doc) {
      missingCount += 1;
      continue;
    }
    if (doc.source_fingerprint !== semanticSourceFingerprint(row, projection)) {
      staleCount += 1;
      continue;
    }
    readyCount += 1;
  }

  let orphanedCount = 0;
  for (const doc of documents) {
    if (!sourceKeys.has(rowKey(doc.source_table_id, doc.source_row_id))) {
      orphanedCount += 1;
    }
  }

  const status: SemanticIndexStatus =
    orphanedCount > 0
      ? "orphaned"
      : staleCount > 0
        ? "stale"
        : missingCount > 0
          ? "missing"
          : "ready";

  return {
    index_id: indexId,
    status,
    source_count: sourceRows.length,
    indexed_count: documents.length,
    ready_count: readyCount,
    missing_count: missingCount,
    stale_count: staleCount,
    orphaned_count: orphanedCount,
  };
}

function valueToSearchText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(valueToSearchText).join(" ");
  return stableStringify(normalizeValue(value));
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = normalizeValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

function cloneDocument(document: SemanticIndexDocument): SemanticIndexDocument {
  return {
    ...document,
    vector: [...document.vector],
    metadata: { ...document.metadata },
  };
}

function documentKey(document: {
  readonly index_id: string;
  readonly source_table_id: string;
  readonly source_row_id: string;
}): string {
  return sourceKey(document);
}

function sourceKey(input: {
  readonly index_id: string;
  readonly source_table_id: string;
  readonly source_row_id: string;
}): string {
  return `${input.index_id}\0${input.source_table_id}\0${input.source_row_id}`;
}

function rowKey(tableId: string, rowId: string): string {
  return `\0${tableId}\0${rowId}`;
}
