# M10 Derived Semantic Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add semantic retrieval to Knowledge Inbox through a derived, rebuildable semantic index while keeping SQLite app rows as the source of truth.

**Architecture:** Add a core-domain semantic index contract and local SQLite implementation first. Then wire Knowledge Inbox Operations to rebuild/search the derived index, add a deterministic milestone runner/viewer path, and verify the capability through release/restart. Qdrant and network embeddings stay out of M10.

**Tech Stack:** Bun tests, TypeScript, core-domain `EmbeddingProvider`, SQLite via `bun:sqlite`, Knowledge Inbox template, Docker release smoke.

---

## File Structure

- `packages/core-domain/src/services/semantic-index.ts`  
  Owns semantic index types, cosine similarity, source fingerprinting, staleness classification, and `SemanticIndexService`.
- `packages/core-domain/src/repositories/bun-sqlite-semantic-index.ts`  
  Owns the local SQLite derived index store and `semantic_index_entries` table.
- `packages/core-domain/src/services/embedding-provider.ts`  
  Adds a deterministic local embedding provider for tests and demos.
- `packages/core-domain/src/index.ts`  
  Exports the semantic index and deterministic embedding APIs.
- `packages/core-domain/test/services/semantic-index.test.ts`  
  Unit tests for document building, deterministic search, and staleness.
- `packages/core-domain/test/repositories/bun-sqlite-semantic-index.test.ts`  
  Persistence tests for upsert/search/clear/delete and restart reopening.
- `templates/knowledge-inbox-core-domain/server/config.ts`  
  Adds `rebuild_semantic_index` and `semantic_search_items` Operations without adding embedding columns to `inbox_items`.
- `templates/knowledge-inbox-core-domain/test/semantic-index.test.ts`  
  Template-level operation tests for ready/missing/stale states.
- `templates/knowledge-inbox-core-domain/viewer/index.html`  
  Adds a compact semantic search panel and index status display.
- `templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts`  
  Verifies the viewer exposes semantic search affordances.
- `examples/m10-derived-semantic-index/`  
  Milestone runner, package metadata, README, and release smoke.
- `docs/archive/milestone-10-snapshot.md` and `.zh-CN.md`  
  Team-facing M10 snapshot after verification.

---

### Task 1: Core Derived Semantic Index Contract

**Files:**
- Create: `packages/core-domain/src/services/semantic-index.ts`
- Create: `packages/core-domain/src/repositories/bun-sqlite-semantic-index.ts`
- Modify: `packages/core-domain/src/services/embedding-provider.ts`
- Modify: `packages/core-domain/src/index.ts`
- Create: `packages/core-domain/test/services/semantic-index.test.ts`
- Create: `packages/core-domain/test/repositories/bun-sqlite-semantic-index.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `packages/core-domain/test/services/semantic-index.test.ts`:

```ts
import { expect, test } from "bun:test";
import { Row } from "../../src/aggregates/row.js";
import { buildRootContext } from "../../src/value-objects/permission-context.js";
import { DeterministicEmbeddingProvider } from "../../src/services/embedding-provider.js";
import {
  InMemorySemanticIndexStore,
  SemanticIndexService,
  semanticSourceFingerprint,
} from "../../src/services/semantic-index.js";

const CTX = buildRootContext({ app_id: "knowledge-inbox-core-domain", invoked_via: "ui" });

function item(id: string, cells: Record<string, unknown>): Row {
  return new Row({
    id,
    app_id: "knowledge-inbox-core-domain",
    table_id: "inbox_items",
    cells: {
      status: "pending",
      created_at_cell: 1,
      url: `https://pneuma.local/${id}`,
      ...cells,
    },
  });
}

test("SemanticIndexService rebuilds source rows into derived documents and searches semantically", async () => {
  const store = new InMemorySemanticIndexStore();
  const embeddings = new DeterministicEmbeddingProvider({
    dim: 24,
    aliases: {
      release: "launch",
      deployment: "deploy",
      escalation: "customer",
      risk: "blocking",
      alignment: "team",
    },
  });
  const service = new SemanticIndexService({ store, embeddingProvider: embeddings, model: "local-deterministic" });
  const rows = [
    item("risk", {
      title: "Critical customer signal",
      source: "customer calls",
      summary: "Blocking launch risk from a customer escalation.",
    }),
    item("deploy", {
      title: "Docker release evidence",
      source: "release notes",
      summary: "Container restart and deploy confidence from mounted SQLite.",
    }),
    item("team", {
      title: "Milestone snapshot",
      source: "team share",
      summary: "Shared understanding and alignment for the project.",
    }),
  ];

  const rebuild = await service.rebuild({
    index_id: "knowledge_inbox_items",
    source_rows: rows,
    projection: { fields: ["title", "source", "summary"] },
    permissionContext: CTX,
  });
  expect(rebuild.indexed_count).toBe(3);
  expect(rebuild.status).toBe("ready");

  const result = await service.search({
    index_id: "knowledge_inbox_items",
    query: "release risk from customer escalation",
    limit: 2,
    source_rows: rows,
    projection: { fields: ["title", "source", "summary"] },
    permissionContext: CTX,
  });
  expect(result.index_status).toBe("ready");
  expect(result.rows[0]?.source_row_id).toBe("risk");
  expect(result.rows[0]?.score).toBeGreaterThan(0.5);
});

test("SemanticIndexService exposes missing, stale, and orphaned index state", async () => {
  const store = new InMemorySemanticIndexStore();
  const service = new SemanticIndexService({
    store,
    embeddingProvider: new DeterministicEmbeddingProvider({ dim: 16 }),
    model: "local-deterministic",
  });
  const source = item("source-1", { title: "Original title", summary: "First summary" });
  await service.rebuild({
    index_id: "knowledge_inbox_items",
    source_rows: [source],
    projection: { fields: ["title", "summary"] },
    permissionContext: CTX,
  });

  const changed = item("source-1", { title: "Changed title", summary: "First summary" });
  const missing = item("source-2", { title: "New row", summary: "Not indexed yet" });
  const stats = await service.explainStaleness({
    index_id: "knowledge_inbox_items",
    source_rows: [changed, missing],
    projection: { fields: ["title", "summary"] },
  });

  expect(stats.status).toBe("stale");
  expect(stats.stale_count).toBe(1);
  expect(stats.missing_count).toBe(1);
  expect(stats.orphaned_count).toBe(0);
  expect(semanticSourceFingerprint(source, { fields: ["title", "summary"] }))
    .not.toBe(semanticSourceFingerprint(changed, { fields: ["title", "summary"] }));

  await store.upsert({
    index_id: "knowledge_inbox_items",
    source_table_id: "inbox_items",
    source_row_id: "orphan",
    source_fingerprint: "orphan-fingerprint",
    text: "orphan text",
    vector: [1, 0, 0],
    metadata: {},
    indexed_at_ms: 1,
  });
  const withOrphan = await service.explainStaleness({
    index_id: "knowledge_inbox_items",
    source_rows: [changed, missing],
    projection: { fields: ["title", "summary"] },
  });
  expect(withOrphan.orphaned_count).toBe(1);
});
```

- [ ] **Step 2: Write failing SQLite store tests**

Create `packages/core-domain/test/repositories/bun-sqlite-semantic-index.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BunSqliteSemanticIndexStore } from "../../src/repositories/bun-sqlite-semantic-index.js";

test("BunSqliteSemanticIndexStore upserts, searches, deletes, clears, and reopens", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pneuma-semantic-index-"));
  const dbPath = join(dir, "app.db");
  try {
    const store = new BunSqliteSemanticIndexStore(dbPath);
    await store.upsert({
      index_id: "knowledge_inbox_items",
      source_table_id: "inbox_items",
      source_row_id: "risk",
      source_fingerprint: "fp-risk",
      text: "customer escalation blocking launch",
      vector: [1, 0, 0],
      metadata: { title: "Risk" },
      indexed_at_ms: 10,
    });
    await store.upsert({
      index_id: "knowledge_inbox_items",
      source_table_id: "inbox_items",
      source_row_id: "deploy",
      source_fingerprint: "fp-deploy",
      text: "docker restart release confidence",
      vector: [0, 1, 0],
      metadata: { title: "Deploy" },
      indexed_at_ms: 11,
    });

    const hits = await store.search({
      index_id: "knowledge_inbox_items",
      vector: [1, 0, 0],
      limit: 2,
    });
    expect(hits.map((hit) => hit.source_row_id)).toEqual(["risk", "deploy"]);
    expect(hits[0]?.score).toBe(1);

    await store.close();
    const reopened = new BunSqliteSemanticIndexStore(dbPath);
    expect((await reopened.listByIndex("knowledge_inbox_items")).map((doc) => doc.source_row_id).sort())
      .toEqual(["deploy", "risk"]);
    await reopened.deleteBySource({
      index_id: "knowledge_inbox_items",
      source_table_id: "inbox_items",
      source_row_id: "risk",
    });
    expect((await reopened.listByIndex("knowledge_inbox_items")).map((doc) => doc.source_row_id))
      .toEqual(["deploy"]);
    await reopened.clear("knowledge_inbox_items");
    expect(await reopened.listByIndex("knowledge_inbox_items")).toEqual([]);
    await reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Run RED verification**

Run:

```bash
bun test packages/core-domain/test/services/semantic-index.test.ts \
  packages/core-domain/test/repositories/bun-sqlite-semantic-index.test.ts
```

Expected: fails because the semantic index modules and deterministic provider do not exist.

- [ ] **Step 4: Implement deterministic embeddings**

Modify `packages/core-domain/src/services/embedding-provider.ts` by adding:

```ts
export interface DeterministicEmbeddingProviderConfig {
  readonly dim?: number;
  readonly aliases?: Record<string, string>;
}

export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  private readonly dim: number;
  private readonly aliases: Record<string, string>;

  constructor(config: DeterministicEmbeddingProviderConfig = {}) {
    this.dim = config.dim ?? 24;
    this.aliases = config.aliases ?? {};
  }

  async embed(input: EmbedInput, _ctx: PermissionContext): Promise<number[]> {
    const out = new Array(this.dim).fill(0) as number[];
    for (const token of tokenizeForDeterministicEmbedding(input.text, this.aliases)) {
      const bucket = positiveHash(token) % this.dim;
      out[bucket] += 1;
    }
    const norm = Math.sqrt(out.reduce((sum, value) => sum + value * value, 0));
    if (norm === 0) return out;
    return out.map((value) => value / norm);
  }
}
```

Also add local helper functions in the same file:

```ts
function tokenizeForDeterministicEmbedding(text: string, aliases: Record<string, string>): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => aliases[token] ?? token);
}

function positiveHash(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
```

- [ ] **Step 5: Implement semantic index service**

Create `packages/core-domain/src/services/semantic-index.ts` with:

```ts
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
    this.docs.set(documentKey(document), { ...document, vector: [...document.vector], metadata: { ...document.metadata } });
  }
  async listByIndex(indexId: string): Promise<readonly SemanticIndexDocument[]> {
    return [...this.docs.values()].filter((doc) => doc.index_id === indexId).map(cloneDocument);
  }
  async search(input: { index_id: string; vector: readonly number[]; limit: number; source_table_id?: string }): Promise<readonly SemanticIndexSearchResult[]> {
    return searchDocuments(await this.listByIndex(input.index_id), input);
  }
  async deleteBySource(input: { index_id: string; source_table_id: string; source_row_id: string }): Promise<void> {
    this.docs.delete(`${input.index_id}\0${input.source_table_id}\0${input.source_row_id}`);
  }
  async clear(indexId: string): Promise<void> {
    for (const key of [...this.docs.keys()]) {
      if (key.startsWith(`${indexId}\0`)) this.docs.delete(key);
    }
  }
}

export class SemanticIndexService {
  constructor(private readonly deps: {
    readonly store: SemanticIndexStore;
    readonly embeddingProvider: EmbeddingProvider;
    readonly model: string;
  }) {}

  async rebuild(input: {
    readonly index_id: string;
    readonly source_rows: readonly Row[];
    readonly projection: SemanticProjection;
    readonly permissionContext: PermissionContext;
  }): Promise<SemanticIndexStats> {
    await this.deps.store.clear(input.index_id);
    for (const row of input.source_rows) {
      const text = semanticDocumentText(row, input.projection);
      const vector = await this.deps.embeddingProvider.embed({ model: this.deps.model, text }, input.permissionContext);
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
  }): Promise<SemanticIndexStats & { readonly rows: readonly SemanticIndexSearchResult[]; readonly index_status: SemanticIndexStatus }> {
    const stats = await this.explainStaleness(input);
    const vector = await this.deps.embeddingProvider.embed({ model: this.deps.model, text: input.query }, input.permissionContext);
    const rows = await this.deps.store.search({ index_id: input.index_id, vector, limit: input.limit });
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
```

Add these helper exports in the same file:

```ts
export function semanticDocumentText(row: Row, projection: SemanticProjection): string;
export function semanticDocumentMetadata(row: Row, projection: SemanticProjection): Readonly<Record<string, unknown>>;
export function semanticSourceFingerprint(row: Row, projection: SemanticProjection): string;
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number;
export function searchDocuments(
  documents: readonly SemanticIndexDocument[],
  input: { readonly vector: readonly number[]; readonly limit: number; readonly source_table_id?: string },
): readonly SemanticIndexSearchResult[];
export function semanticIndexStats(
  indexId: string,
  sourceRows: readonly Row[],
  projection: SemanticProjection,
  documents: readonly SemanticIndexDocument[],
): SemanticIndexStats;
```

Use stable JSON over projected field values for fingerprints. `semanticIndexStats` should classify:

- `missing_count`: source rows with no matching doc;
- `stale_count`: source rows with doc but fingerprint mismatch;
- `orphaned_count`: docs whose source row id is absent;
- `status`: `ready` only when all three counts are zero; otherwise prefer `orphaned`, then `stale`, then `missing`.

- [ ] **Step 6: Implement SQLite store**

Create `packages/core-domain/src/repositories/bun-sqlite-semantic-index.ts` with:

```ts
import { Database } from "bun:sqlite";
import {
  cosineSimilarity,
  searchDocuments,
  type SemanticIndexDocument,
  type SemanticIndexSearchResult,
  type SemanticIndexStore,
} from "../services/semantic-index.js";

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
    this.db.run(
      `INSERT INTO semantic_index_entries
        (index_id, source_table_id, source_row_id, source_fingerprint, text, vector_json, metadata_json, indexed_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(index_id, source_table_id, source_row_id) DO UPDATE SET
        source_fingerprint = excluded.source_fingerprint,
        text = excluded.text,
        vector_json = excluded.vector_json,
        metadata_json = excluded.metadata_json,
        indexed_at_ms = excluded.indexed_at_ms`,
      [
        document.index_id,
        document.source_table_id,
        document.source_row_id,
        document.source_fingerprint,
        document.text,
        JSON.stringify(document.vector),
        JSON.stringify(document.metadata),
        document.indexed_at_ms,
      ],
    );
  }

  async listByIndex(indexId: string): Promise<readonly SemanticIndexDocument[]> {
    const rows = this.db.query<SemanticIndexRow, [string]>(
      `SELECT * FROM semantic_index_entries WHERE index_id = ? ORDER BY source_table_id, source_row_id`,
    ).all(indexId);
    return rows.map(rowToDocument);
  }

  async search(input: { index_id: string; vector: readonly number[]; limit: number; source_table_id?: string }): Promise<readonly SemanticIndexSearchResult[]> {
    return searchDocuments(await this.listByIndex(input.index_id), input);
  }

  async deleteBySource(input: { index_id: string; source_table_id: string; source_row_id: string }): Promise<void> {
    this.db.run(
      `DELETE FROM semantic_index_entries WHERE index_id = ? AND source_table_id = ? AND source_row_id = ?`,
      [input.index_id, input.source_table_id, input.source_row_id],
    );
  }

  async clear(indexId: string): Promise<void> {
    this.db.run(`DELETE FROM semantic_index_entries WHERE index_id = ?`, [indexId]);
  }

  async close(): Promise<void> {
    if (this.ownsDb) this.db.close();
  }
}
```

Also define:

```ts
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
```

- [ ] **Step 7: Export APIs**

Modify `packages/core-domain/src/index.ts`:

```ts
export * from "./services/semantic-index.js";
export * from "./repositories/bun-sqlite-semantic-index.js";
```

- [ ] **Step 8: Run GREEN verification and commit**

Run:

```bash
bun test packages/core-domain/test/services/semantic-index.test.ts \
  packages/core-domain/test/repositories/bun-sqlite-semantic-index.test.ts
bun run typecheck
git diff --check
```

Expected: all pass.

Commit:

```bash
git add packages/core-domain/src/services/embedding-provider.ts \
  packages/core-domain/src/services/semantic-index.ts \
  packages/core-domain/src/repositories/bun-sqlite-semantic-index.ts \
  packages/core-domain/src/index.ts \
  packages/core-domain/test/services/semantic-index.test.ts \
  packages/core-domain/test/repositories/bun-sqlite-semantic-index.test.ts
git commit -m "feat: add derived semantic index core"
```

---

### Task 2: Knowledge Inbox Semantic Operations

**Files:**
- Modify: `templates/knowledge-inbox-core-domain/server/config.ts`
- Create: `templates/knowledge-inbox-core-domain/test/semantic-index.test.ts`

- [ ] **Step 1: Write failing template operation tests**

Create `templates/knowledge-inbox-core-domain/test/semantic-index.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Row } from "@pneuma-framework/core-domain";
import { bootAppRuntime } from "@pneuma-framework/runtime";

async function boot(workspace: string) {
  process.env.PNEUMA_WORKSPACE = workspace;
  process.env.PNEUMA_DATA_DIR = join(workspace, "data");
  process.env.PNEUMA_SQLITE_PATH = join(workspace, "data", "app.db");
  const mod = await import(`../server/config.ts?semantic=${Date.now()}-${Math.random()}`);
  return await bootAppRuntime(mod.config);
}

function row(id: string, cells: Record<string, unknown>): Row {
  return new Row({
    id,
    app_id: "knowledge-inbox-core-domain",
    table_id: "inbox_items",
    cells: {
      url: `https://pneuma.local/${id}`,
      status: "pending",
      created_at_cell: Date.now(),
      ...cells,
    },
  });
}

describe("Knowledge Inbox semantic index Operations", () => {
  test("rebuild_semantic_index and semantic_search_items return semantic hits without adding embedding columns", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-ki-semantic-"));
    try {
      const runtime = await boot(workspace);
      try {
        await runtime.storage.saveRow(row("risk", {
          title: "Critical customer signal",
          source: "customer calls",
          summary: "Blocking launch risk from a customer escalation.",
        }));
        await runtime.storage.saveRow(row("deploy", {
          title: "Docker release evidence",
          source: "release notes",
          summary: "Container restart and deploy confidence from mounted SQLite.",
        }));

        const rebuild = await runtime.executeOperation("rebuild_semantic_index", {}, {
          app_id: "knowledge-inbox-core-domain",
          invoked_via: "ui",
          principal: { kind: "anonymous" },
        });
        expect(rebuild.output).toMatchObject({ index_status: "ready", indexed_count: 2 });

        const search = await runtime.executeOperation("semantic_search_items", {
          query: "release risk from customer escalation",
          limit: 1,
        }, {
          app_id: "knowledge-inbox-core-domain",
          invoked_via: "ui",
          principal: { kind: "anonymous" },
        });
        expect(search.output).toMatchObject({ index_status: "ready" });
        const rows = (search.output as { rows: Array<{ item_id: string; score: number }> }).rows;
        expect(rows[0]?.item_id).toBe("risk");
        expect(rows[0]?.score).toBeGreaterThan(0.5);

        const inbox = runtime.config.tables.find((table) => table.id === "inbox_items");
        expect(inbox?.columns.some((column) => column.name === "embedding")).toBe(false);
      } finally {
        await runtime.close();
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("semantic_search_items exposes missing and stale index state", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-ki-semantic-stale-"));
    try {
      const runtime = await boot(workspace);
      try {
        await runtime.storage.saveRow(row("risk", {
          title: "Critical customer signal",
          source: "customer calls",
          summary: "Blocking launch risk from a customer escalation.",
        }));
        const missing = await runtime.executeOperation("semantic_search_items", {
          query: "customer risk",
          limit: 5,
        }, {
          app_id: "knowledge-inbox-core-domain",
          invoked_via: "ui",
          principal: { kind: "anonymous" },
        });
        expect(missing.output).toMatchObject({ index_status: "missing", missing_count: 1 });

        await runtime.executeOperation("rebuild_semantic_index", {}, {
          app_id: "knowledge-inbox-core-domain",
          invoked_via: "ui",
          principal: { kind: "anonymous" },
        });
        const changed = await runtime.storage.getRow("risk");
        changed?.setCell("summary", "Updated wording after the index was built.");
        if (changed) await runtime.storage.saveRow(changed);

        const stale = await runtime.executeOperation("semantic_search_items", {
          query: "customer risk",
          limit: 5,
        }, {
          app_id: "knowledge-inbox-core-domain",
          invoked_via: "ui",
          principal: { kind: "anonymous" },
        });
        expect(stale.output).toMatchObject({ index_status: "stale", stale_count: 1 });
      } finally {
        await runtime.close();
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run RED verification**

Run:

```bash
bun test templates/knowledge-inbox-core-domain/test/semantic-index.test.ts
```

Expected: fails because the Operations do not exist.

- [ ] **Step 3: Add semantic index dependencies and constants**

Modify imports in `templates/knowledge-inbox-core-domain/server/config.ts`:

```ts
import {
  BunSqliteSemanticIndexStore,
  DeterministicEmbeddingProvider,
  Operation,
  PolicySet,
  Resources,
  Row,
  SemanticIndexService,
  Subjects,
  Table,
  type CellType,
  type HandlerFn,
} from "@pneuma-framework/core-domain";
```

Add constants after storage paths:

```ts
const SEMANTIC_INDEX_ID = "knowledge_inbox_items";
const SEMANTIC_MODEL = "local-deterministic";
const semanticProjection = { fields: ["title", "source", "summary"] } as const;
const semanticEmbeddingProvider = new DeterministicEmbeddingProvider({
  dim: 24,
  aliases: {
    release: "launch",
    deployment: "deploy",
    escalation: "customer",
    risk: "blocking",
    confidence: "evidence",
    alignment: "team",
  },
});
```

- [ ] **Step 4: Add Operations**

Add `rebuildSemanticIndexOp` and `semanticSearchItemsOp` near existing Operations:

```ts
export const rebuildSemanticIndexOp = new Operation({
  id: "rebuild_semantic_index",
  app_id: APP_ID,
  name: "Rebuild semantic index",
  description: "Rebuild the derived semantic index from current Knowledge Inbox rows.",
  input: { type: "record", fields: {} },
  output: {
    kind: "object",
    schema: {
      type: "object",
      properties: {
        index_status: { type: "string" },
        source_count: { type: "number" },
        indexed_count: { type: "number" },
        missing_count: { type: "number" },
        stale_count: { type: "number" },
        orphaned_count: { type: "number" },
      },
      required: ["index_status", "source_count", "indexed_count"],
      additionalProperties: true,
    },
  },
  affects: {
    mutations: [],
    adapter_writes: ["semantic_index_entries"],
    reads_only: false,
    destructive: false,
  },
  handler: { kind: "code", ref: "./ops/rebuild_semantic_index.ts" },
});

export const semanticSearchItemsOp = new Operation({
  id: "semantic_search_items",
  app_id: APP_ID,
  name: "Semantic search items",
  description: "Search Knowledge Inbox items through a rebuildable derived semantic index.",
  input: {
    type: "record",
    fields: {
      query: { type: TEXT, required: true },
      limit: { type: { kind: "primitive", of: "Number" }, default: 5 },
    },
  },
  output: {
    kind: "derived-list",
    item_schema: {
      type: "object",
      properties: {
        item_id: { type: "string" },
        title: { type: "string", nullable: true },
        source: { type: "string", nullable: true },
        summary: { type: "string", nullable: true },
        score: { type: "number" },
        source_fingerprint: { type: "string" },
      },
      required: ["item_id", "score", "source_fingerprint"],
    },
  },
  affects: {
    mutations: [],
    adapter_writes: [],
    reads_only: true,
    destructive: false,
  },
  handler: { kind: "code", ref: "./ops/semantic_search_items.ts" },
});
```

Update:

```ts
export const operations = [
  captureItemOp,
  listInboxItemsOp,
  updateItemStatusOp,
  rebuildSemanticIndexOp,
  semanticSearchItemsOp,
];
```

- [ ] **Step 5: Add handlers**

Add helpers near handlers:

```ts
function semanticService(): SemanticIndexService {
  return new SemanticIndexService({
    store: new BunSqliteSemanticIndexStore(appDbPath),
    embeddingProvider: semanticEmbeddingProvider,
    model: SEMANTIC_MODEL,
  });
}

async function listInboxRows(storage: Parameters<HandlerFn>[0]["storage"]) {
  return await storage.listRowsByTable("inbox_items");
}
```

Add handlers:

```ts
const rebuildSemanticIndexHandler: HandlerFn = async ({ storage, ctx }) => {
  const service = semanticService();
  const stats = await service.rebuild({
    index_id: SEMANTIC_INDEX_ID,
    source_rows: await listInboxRows(storage),
    projection: semanticProjection,
    permissionContext: ctx,
  });
  return {
    index_status: stats.status,
    ...stats,
  };
};

const semanticSearchItemsHandler: HandlerFn = async ({ input, storage, ctx }) => {
  const i = input as { query?: string; limit?: number };
  const query = typeof i.query === "string" ? i.query.trim() : "";
  if (!query) throw new Error("semantic_search_items requires query");
  const limit = typeof i.limit === "number" && Number.isFinite(i.limit) ? Math.max(1, Math.min(20, i.limit)) : 5;
  const sourceRows = await listInboxRows(storage);
  const service = semanticService();
  const result = await service.search({
    index_id: SEMANTIC_INDEX_ID,
    query,
    limit,
    source_rows: sourceRows,
    projection: semanticProjection,
    permissionContext: ctx,
  });
  const byId = new Map(sourceRows.map((row) => [row.id, row]));
  return {
    index_status: result.index_status,
    source_count: result.source_count,
    indexed_count: result.indexed_count,
    ready_count: result.ready_count,
    missing_count: result.missing_count,
    stale_count: result.stale_count,
    orphaned_count: result.orphaned_count,
    rows: result.rows
      .map((hit) => {
        const row = byId.get(hit.source_row_id);
        if (!row) return undefined;
        return {
          item_id: row.id,
          title: row.getCell("title") ?? null,
          source: row.getCell("source") ?? null,
          summary: row.getCell("summary") ?? null,
          score: hit.score,
          source_fingerprint: hit.source_fingerprint,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== undefined),
  };
};
```

Register handlers:

```ts
handlers: {
  "./ops/capture_item.ts": captureItemHandler,
  "./ops/update_item_status.ts": updateItemStatusHandler,
  "./ops/rebuild_semantic_index.ts": rebuildSemanticIndexHandler,
  "./ops/semantic_search_items.ts": semanticSearchItemsHandler,
}
```

- [ ] **Step 6: Run GREEN verification and commit**

Run:

```bash
bun test templates/knowledge-inbox-core-domain/test/semantic-index.test.ts
bun run typecheck
git diff --check
```

Expected: all pass.

Commit:

```bash
git add templates/knowledge-inbox-core-domain/server/config.ts \
  templates/knowledge-inbox-core-domain/test/semantic-index.test.ts
git commit -m "feat: add Knowledge Inbox semantic operations"
```

---

### Task 3: M10 Example Runner And Viewer

**Files:**
- Create: `examples/m10-derived-semantic-index/package.json`
- Create: `examples/m10-derived-semantic-index/run.ts`
- Create: `examples/m10-derived-semantic-index/run.test.ts`
- Create: `examples/m10-derived-semantic-index/README.md`
- Modify: `templates/knowledge-inbox-core-domain/viewer/index.html`
- Modify: `templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts`
- Modify: `examples/README.md`

- [ ] **Step 1: Write failing runner test**

Create `examples/m10-derived-semantic-index/run.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function runM10(workspace: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn({
    cmd: ["bun", "run", join(import.meta.dir, "run.ts"), "--workspace", workspace],
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("M10 derived semantic index runner", () => {
  test("rebuilds index, searches semantic queries, and writes evidence", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m10-"));
    try {
      const result = await runM10(workspace);
      const evidencePath = join(workspace, ".pneuma", "m10", "semantic-index-evidence.json");
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("M10 Derived Semantic Index ready:");
      expect(result.stdout).toContain("release risk from customer escalation -> risk");
      expect(result.stdout).toContain("deployment confidence -> deploy");
      expect(result.stdout).toContain("team alignment -> team");
      expect(existsSync(evidencePath)).toBe(true);
      const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
      expect(evidence.final_status).toBe("semantic_index_ready");
      expect(evidence.index_status).toBe("ready");
      expect(evidence.source_rows_have_embedding_column).toBe(false);
      expect(evidence.queries.map((query: { top_item_id: string }) => query.top_item_id))
        .toEqual(["risk", "deploy", "team"]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});
```

- [ ] **Step 2: Run RED verification**

Run:

```bash
bun test examples/m10-derived-semantic-index/run.test.ts
```

Expected: fails because the example does not exist.

- [ ] **Step 3: Add example package metadata**

Create `examples/m10-derived-semantic-index/package.json`:

```json
{
  "name": "pneuma-example-m10-derived-semantic-index",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "dependencies": {
    "@pneuma-framework/core": "workspace:*",
    "@pneuma-framework/core-domain": "workspace:*",
    "@pneuma-framework/runtime": "workspace:*"
  }
}
```

Run:

```bash
bun install
```

Expected: `bun.lock` adds the M10 example workspace.

- [ ] **Step 4: Implement runner**

Create `examples/m10-derived-semantic-index/run.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Row } from "@pneuma-framework/core-domain";
import { createPneumaFramework } from "@pneuma-framework/core";

const ROOT = resolve(import.meta.dir, "../..");
const TEMPLATE = join(ROOT, "templates/knowledge-inbox-core-domain");

const ITEMS = [
  {
    id: "risk",
    title: "Critical customer signal",
    source: "customer calls",
    summary: "Blocking launch risk from a customer escalation.",
  },
  {
    id: "deploy",
    title: "Docker release evidence",
    source: "release notes",
    summary: "Container restart and deploy confidence from mounted SQLite.",
  },
  {
    id: "team",
    title: "Milestone snapshot",
    source: "team share",
    summary: "Shared understanding and team alignment for the project.",
  },
] as const;

const QUERIES = [
  { query: "release risk from customer escalation", expected: "risk" },
  { query: "deployment confidence", expected: "deploy" },
  { query: "team alignment", expected: "team" },
] as const;

function workspaceArg(): string {
  const index = process.argv.indexOf("--workspace");
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value) throw new Error("--workspace is required");
  return resolve(value);
}

async function main(): Promise<void> {
  const workspace = workspaceArg();
  mkdirSync(join(workspace, "data"), { recursive: true });
  const framework = createPneumaFramework({ templateDir: TEMPLATE, workspace, portHint: 0 });
  try {
    const start = await framework.toolRegistry.call("lifecycle.dev.start", {});
    if (!start.ok) throw new Error(`lifecycle.dev.start failed: ${JSON.stringify(start)}`);
    for (const item of ITEMS) {
      await framework.runtime?.storage.saveRow(new Row({
        id: item.id,
        app_id: "knowledge-inbox-core-domain",
        table_id: "inbox_items",
        cells: {
          url: `https://pneuma.local/m10/${item.id}`,
          status: "pending",
          created_at_cell: Date.now(),
          title: item.title,
          source: item.source,
          summary: item.summary,
        },
      }));
    }
    const baseUrl = new URL(framework.state.dev?.services[0]?.url ?? "").origin;
    await postOperation(baseUrl, "rebuild_semantic_index", {});
    const queries = [];
    for (const q of QUERIES) {
      const result = await postOperation(baseUrl, "semantic_search_items", { query: q.query, limit: 1 });
      const top = result.rows?.[0]?.item_id;
      if (top !== q.expected) throw new Error(`${q.query} expected ${q.expected}, got ${top}`);
      queries.push({ query: q.query, expected: q.expected, top_item_id: top, score: result.rows[0].score });
      console.log(`${q.query} -> ${top}`);
    }
    const config = await (await fetch(`${baseUrl}/api/config`)).json();
    const inbox = config.tables.find((table: { id: string }) => table.id === "inbox_items");
    const evidence = {
      schema_version: 1,
      final_status: "semantic_index_ready",
      index_status: "ready",
      source_rows_have_embedding_column: inbox.columns.some((column: { name: string }) => column.name === "embedding"),
      queries,
    };
    const out = join(workspace, ".pneuma", "m10", "semantic-index-evidence.json");
    mkdirSync(join(workspace, ".pneuma", "m10"), { recursive: true });
    writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log("M10 Derived Semantic Index ready:");
    console.log(`evidence: ${out}`);
  } finally {
    await framework.close();
  }
}

async function postOperation(baseUrl: string, operationId: string, input: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${baseUrl}/api/operations/${operationId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input }),
  });
  if (!response.ok) throw new Error(`${operationId} failed with HTTP ${response.status}: ${await response.text()}`);
  return await response.json();
}

await main();
```

If `createPneumaFramework` does not expose `runtime`, seed rows by stopping dev, booting `bootAppRuntime(config)`, writing rows, and restarting dev as in M8. Do not add a framework runtime property only for this runner.

- [ ] **Step 5: Update viewer contract test first**

Modify `templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts` to assert:

```ts
expect(html).toContain("semantic-search-form");
expect(html).toContain("semantic-search-input");
expect(html).toContain("semantic-rebuild-button");
expect(html).toContain("semantic-index-status");
```

Run:

```bash
bun test templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts
```

Expected: fails until viewer is updated.

- [ ] **Step 6: Update viewer**

Modify `templates/knowledge-inbox-core-domain/viewer/index.html`:

- add a compact semantic search panel near the review queue controls;
- form id: `semantic-search-form`;
- input id: `semantic-search-input`;
- rebuild button id: `semantic-rebuild-button`;
- status element id: `semantic-index-status`;
- POST `/api/operations/rebuild_semantic_index` for rebuild;
- POST `/api/operations/semantic_search_items` for search;
- render score and title/source/summary for results;
- show stale/missing status text visibly.

Keep the UI consistent with the existing Knowledge Inbox aesthetic; do not add a marketing hero or a card-inside-card layout.

- [ ] **Step 7: Add example README and index entry**

Create `examples/m10-derived-semantic-index/README.md`:

```md
# M10 Derived Semantic Index

M10 proves that Knowledge Inbox can gain semantic search through a derived index.

Run:

```bash
bun test examples/m10-derived-semantic-index/run.test.ts
```

The example rebuilds a local semantic index from SQLite source rows, runs three semantic queries, and verifies that `inbox_items` did not gain an `embedding` business column.
```
```

Modify `examples/README.md` to add the M10 example as canonical.

- [ ] **Step 8: Run GREEN verification and commit**

Run:

```bash
bun test examples/m10-derived-semantic-index/run.test.ts
bun test templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts
bun run typecheck
git diff --check
```

Expected: all pass.

Commit:

```bash
git add examples/m10-derived-semantic-index templates/knowledge-inbox-core-domain/viewer/index.html \
  templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts examples/README.md bun.lock
git commit -m "feat: add M10 semantic index demo"
```

---

### Task 4: Release Regression For Semantic Index

**Files:**
- Create: `examples/m10-derived-semantic-index/release-smoke.test.ts`
- Create: `examples/m10-derived-semantic-index/release-smoke.sh`
- Create: `examples/m10-derived-semantic-index/assert-release-semantic-search.ts`

- [ ] **Step 1: Write failing release smoke test**

Create `examples/m10-derived-semantic-index/release-smoke.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";

const scriptPath = join(import.meta.dir, "release-smoke.sh");

describe("M10 derived semantic index release smoke", () => {
  test("semantic search survives Docker release restart with mounted SQLite volume", async () => {
    expect(existsSync(scriptPath)).toBe(true);
    const output = await $`${scriptPath}`.text();
    expect(output).toContain("m10-release-smoke: semantic search survived release restart");
  }, 240_000);
});
```

- [ ] **Step 2: Run RED verification**

Run:

```bash
bun test examples/m10-derived-semantic-index/release-smoke.test.ts
```

Expected: fails because `release-smoke.sh` does not exist.

- [ ] **Step 3: Implement release smoke script**

Create `examples/m10-derived-semantic-index/release-smoke.sh` modeled after M8:

```sh
#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${PNEUMA_M10_DOCKER_IMAGE:-pneuma-knowledge-inbox-core-domain:m10-semantic-smoke}"
CONTAINER="pneuma-m10-semantic-smoke-$$"
WORKSPACE="$(mktemp -d "$ROOT/.pneuma-m10-semantic-XXXXXX")"
BUILD_DIR="$WORKSPACE/.pneuma-build/m10"
MANIFEST_PATH="$BUILD_DIR/build.manifest.json"
TEMPLATE="$ROOT/templates/knowledge-inbox-core-domain"
DATA_DIR="$WORKSPACE/data"
DB_PATH="$DATA_DIR/app.db"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORKSPACE"
}
trap cleanup EXIT INT TERM

PNEUMA_WORKSPACE="$WORKSPACE" \
PNEUMA_DATA_DIR="$DATA_DIR" \
PNEUMA_SQLITE_PATH="$DB_PATH" \
  "$TEMPLATE/scripts/migrate.sh" >/dev/null

bun --cwd "$ROOT" examples/m10-derived-semantic-index/run.ts --workspace "$WORKSPACE" >/dev/null

PNEUMA_BUILD_DIR="$BUILD_DIR" \
PNEUMA_ARTIFACT_MANIFEST_PATH="$MANIFEST_PATH" \
  "$TEMPLATE/scripts/build.sh" >/dev/null

docker build -f "$TEMPLATE/Dockerfile" -t "$IMAGE" "$ROOT" >/dev/null

docker run \
  --detach \
  --name "$CONTAINER" \
  --env PNEUMA_WORKSPACE=/data \
  --env PNEUMA_DATA_DIR=/data \
  --env PNEUMA_SQLITE_PATH=/data/app.db \
  --env PNEUMA_PORT_HINT=3000 \
  --publish 127.0.0.1::3000 \
  --volume "$DATA_DIR":/data \
  "$IMAGE" >/dev/null

HOST_PORT="$(docker port "$CONTAINER" 3000/tcp | sed 's/.*://')"

wait_health() {
  i=0
  while [ "$i" -lt 60 ]; do
    if bun -e "const r = await fetch('http://127.0.0.1:${HOST_PORT}/healthz'); process.exit(r.ok ? 0 : 1)" >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  docker logs "$CONTAINER" >&2 || true
  return 1
}

assert_semantic_search() {
  M10_RELEASE_URL="http://127.0.0.1:${HOST_PORT}" \
    bun --cwd "$ROOT" examples/m10-derived-semantic-index/assert-release-semantic-search.ts
}

wait_health
assert_semantic_search
docker restart "$CONTAINER" >/dev/null
HOST_PORT="$(docker port "$CONTAINER" 3000/tcp | sed 's/.*://')"
wait_health
assert_semantic_search

echo "m10-release-smoke: semantic search survived release restart"
```

Make it executable:

```bash
chmod +x examples/m10-derived-semantic-index/release-smoke.sh
```

- [ ] **Step 4: Implement release assertion helper**

Create `examples/m10-derived-semantic-index/assert-release-semantic-search.ts`:

```ts
const baseUrl = process.env.M10_RELEASE_URL;
if (!baseUrl) throw new Error("M10_RELEASE_URL is required");

const config = await (await fetch(`${baseUrl}/api/config`)).json() as {
  tables?: Array<{ id?: string; columns?: Array<{ name?: string }> }>;
  operations?: Array<{ id?: string }>;
};

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const inbox = config.tables?.find((table) => table.id === "inbox_items");
assert(inbox, "release config missing inbox_items");
assert(!inbox?.columns?.some((column) => column.name === "embedding"), "inbox_items must not contain embedding column");
assert(config.operations?.some((operation) => operation.id === "semantic_search_items"), "missing semantic_search_items Operation");

const response = await fetch(`${baseUrl}/api/operations/semantic_search_items`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ input: { query: "release risk from customer escalation", limit: 1 } }),
});
assert(response.ok, `semantic_search_items failed with HTTP ${response.status}: ${await response.text()}`);
const body = await response.json() as { rows?: Array<{ item_id?: string }>; index_status?: string };
assert(body.index_status === "ready", `expected ready index, got ${JSON.stringify(body)}`);
assert(body.rows?.[0]?.item_id === "risk", `expected risk top hit, got ${JSON.stringify(body)}`);
```

- [ ] **Step 5: Run GREEN verification and commit**

Run:

```bash
bun test examples/m10-derived-semantic-index/release-smoke.test.ts
bun run typecheck
git diff --check
```

Expected: all pass when Docker is available.

Commit:

```bash
git add examples/m10-derived-semantic-index/release-smoke.test.ts \
  examples/m10-derived-semantic-index/release-smoke.sh \
  examples/m10-derived-semantic-index/assert-release-semantic-search.ts
git commit -m "test: add M10 semantic release smoke"
```

---

### Task 5: M10 Snapshot And Navigation

**Files:**
- Create: `docs/archive/milestone-10-snapshot.md`
- Create: `docs/archive/milestone-10-snapshot.zh-CN.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/roadmap.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Run full milestone verification**

Run:

```bash
bun test packages/core-domain/test/services/semantic-index.test.ts \
  packages/core-domain/test/repositories/bun-sqlite-semantic-index.test.ts
bun test templates/knowledge-inbox-core-domain/test/semantic-index.test.ts
bun test examples/m10-derived-semantic-index/*.test.ts
bun test examples/m8-release-packaging-hardening/release-packaging-smoke.test.ts
bun run typecheck
git diff --check
```

Expected: all pass. If Docker is unavailable, record the Docker failure explicitly instead of marking M10 closed.

- [ ] **Step 2: Write English snapshot**

Create `docs/archive/milestone-10-snapshot.md` with:

- executive summary: M10 returns to visible product capability after M9;
- source-of-truth diagram: app rows -> derived index -> semantic search;
- what changed: core semantic index, Knowledge Inbox Operations, viewer, runner, release smoke;
- verification report;
- what is proven;
- what is not proven;
- recommended next options: Qdrant adapter, rollout adapter v0, Runtime Agent boundary.

- [ ] **Step 3: Write Chinese snapshot**

Create `docs/archive/milestone-10-snapshot.zh-CN.md` as a full Chinese version, not a short summary. It must explain:

- 为什么 embedding 不写进 `inbox_items`;
- semantic index 为什么是可重建 cache/materialized view;
- Qdrant 为什么后置。

- [ ] **Step 4: Update navigation**

Update `docs/architecture/README.md`:

- add M10 snapshot links to canonical docs table;
- add M10 under current status;
- add M10 files to directory structure;
- update process-doc sentence from `M5-M9` to `M5-M10`.

Update `docs/architecture/roadmap.md`:

- add `M10 Derived semantic index ✅ Closed` to overview;
- add an M10 section before Stage 7;
- update recommended next pressure.

Update `AGENTS.md`:

- status becomes post-M10 planning;
- starting read order starts with M10 snapshot;
- decided list includes M10;
- next pressure options mention Qdrant adapter vs rollout adapter v0.

- [ ] **Step 5: Commit, tag, and report**

Run:

```bash
git add docs/archive/milestone-10-snapshot.md \
  docs/archive/milestone-10-snapshot.zh-CN.md \
  docs/architecture/README.md docs/architecture/roadmap.md AGENTS.md
git commit -m "docs: close M10 derived semantic index"
git tag pneuma-m10-derived-semantic-index
git status --short --branch
```

Expected: clean worktree on the current branch.
