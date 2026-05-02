# M10 Design: Derived Semantic Index

**Date:** 2026-05-02  
**Status:** Draft design direction after M9 closure  
**Scope:** return to a visible product capability without weakening the M1-M9 correctness spine.

中文摘要：

> M10 把项目从 M7-M9 的 correctness plumbing 拉回到可感知产品能力：Knowledge Inbox 可以按语义搜索和发现相关资料。但 semantic index 必须是 derived infrastructure，不是新的 source of truth；SQLite rows 仍然是事实来源，向量索引可以删除、重建、替换为 Qdrant 或 Postgres，而不改变 app data model。

## Why M10 Now

M1-M9 established the core creation loop:

```text
app definition is governed data
  -> enterprise governance evidence exists
  -> real SQLite/Docker substrate exists
  -> Knowledge Inbox is a real reference app
  -> Builder/Agent can evolve it through approval
  -> release packaging and recovery evidence are credible
```

After M9, continuing with only release/deploy correctness would make the project feel like infrastructure for infrastructure's sake. M10 should deliberately add a visible AI-native app capability while preserving the architectural line already agreed in M3:

> relational app rows are source of truth; semantic/vector index is derived and rebuildable.

中文：

M10 的价值不是“终于加向量库”，而是验证一个更重要的抽象：当 app 需要语义能力时，framework 如何让它成为可治理、可重建、可替换的 derived capability，而不是偷偷把 source of truth 分裂成两份。

## M10 Thesis

M10 should prove:

> Knowledge Inbox can gain semantic retrieval through a derived index that is rebuildable from SQLite app rows, testable without network embeddings, and replaceable by a future vector backend without changing app semantics.

Milestone name:

```text
M10 — Derived Semantic Index
```

## Product Story

The end-user story should be simple:

```text
User captures several Knowledge Inbox items
  -> framework/template derives searchable text from rows
  -> semantic index rebuilds from source rows
  -> user searches "release risk from customer escalation"
  -> app returns relevant items even when exact words differ
  -> user opens related items from the same stored row source
```

The Builder/Agent story should be:

```text
Builder asks for better recall across saved knowledge
  -> Agent can explain that semantic index is rebuildable cache
  -> Agent can trigger rebuild/search operations
  -> evidence shows source row count, indexed document count, and stale/missing index status
```

中文：

团队 demo 时不要先讲 cosine 或 Qdrant。先讲用户痛点：“我存了很多资料，但不知道该找什么关键词。” 然后讲系统保证：“语义搜索结果来自同一批 SQLite rows；index 坏了可以 rebuild，不会改变数据事实。”

## Approaches Considered

### Option A: Store Embeddings Directly On Business Rows

This is close to the older `ai-bookmarks-core-domain` pattern where `interpretations.embedding` is a nullable vector cell.

Pros:

- small implementation surface;
- easy to query in app code;
- matches existing vector `CellType`.

Cons:

- makes embeddings look like product data instead of derived cache;
- couples source row schema to the first embedding model and vector dimension;
- makes Qdrant/Postgres replacement harder because migration now touches business tables;
- violates the M3 rule that vector DB is derived infrastructure, not source of truth.

Decision: do not use this as M10 architecture.

### Option B: Local Derived Semantic Index Store First

Add a framework/domain-level derived index store backed by SQLite for the first implementation. It stores index entries separately from app rows:

```text
semantic_index_entries
  index_id
  source_table_id
  source_row_id
  source_fingerprint
  text
  vector_json
  metadata_json
  indexed_at_ms
```

Pros:

- preserves app rows as source of truth;
- can be dropped/rebuilt without data loss;
- gives a stable interface for future Qdrant/Postgres/vector extensions;
- can be tested deterministically with a local/mock embedding provider;
- fits Knowledge Inbox without introducing a daemon or cloud service.

Cons:

- requires a small new persistence surface;
- local cosine search is not production-scale;
- rebuild has to be explicit in M10, not automatic background maintenance.

Decision: **recommended**.

### Option C: Qdrant First

Use Qdrant as the first semantic index backend and demonstrate real vector search.

Pros:

- closer to a production vector stack;
- exercises external service dependency and deployment shape.

Cons:

- turns M10 into infrastructure integration instead of semantic boundary proof;
- adds Docker/service orchestration noise before the app contract is stable;
- makes tests slower and more brittle;
- risks teaching the team that Qdrant is the semantic primitive.

Decision: defer. Qdrant should be a later adapter once the local derived-index contract is stable.

## Architecture Shape

M10 should add a small derived-index abstraction:

```text
EmbeddingProvider
  text -> vector

SemanticIndexStore
  upsert(doc)
  deleteBySource(row)
  search(queryVector, filter, limit)
  stats(index_id)
  clear(index_id)

SemanticIndexService
  buildDocument(row, projection)
  rebuild(index_id, rows)
  search(index_id, query)
  explainStaleness(index_id, sourceRows)
```

`EmbeddingProvider` already exists in `packages/core-domain`. M10 should reuse it, not invent a parallel provider shape.

First implementation:

- `BunSqliteSemanticIndexStore` or equivalent local SQLite store;
- vector stored as JSON in SQLite;
- cosine similarity computed in TypeScript;
- deterministic test embedding provider for CI;
- optional OpenRouter provider remains available but not required for M10 tests.

中文：

M10 的本质是抽象边界，不是向量库选型。第一版可以用 SQLite + JSON vector + TS cosine，只要接口清楚、证据完整、可替换。

## Knowledge Inbox Capability

M10 should add two Knowledge Inbox operations:

### `rebuild_semantic_index`

Purpose:

- read all `inbox_items`;
- derive text from `title`, `source`, and `summary`;
- embed each text;
- upsert derived index entries;
- return counts and stale-source information.

Semantics:

- mutates derived index only, not app rows;
- not destructive to app data;
- may require Builder approval if invoked by Build-phase Agent as part of app evolution, but end-user invocation can be governed by normal app policy;
- failure must not change `inbox_items`.

### `semantic_search_items`

Purpose:

- input: `{ query, limit? }`;
- embed query;
- search derived index;
- join results back to current source rows;
- return item rows with scores and match explanations.

Semantics:

- reads app rows and derived index;
- does not write app rows;
- if index is missing/stale, return a clear `index_status` rather than silently pretending search is complete.

Suggested output:

```json
{
  "index_status": "ready",
  "rows": [
    {
      "item_id": "ki-...",
      "title": "...",
      "summary": "...",
      "score": 0.82,
      "source_fingerprint": "..."
    }
  ]
}
```

## Derived Index Staleness

M10 should not hide staleness. Each indexed document records a `source_fingerprint` derived from the source row's searchable fields.

Staleness states:

```text
missing       no entry exists for source row
stale         entry exists but source_fingerprint differs
orphaned      entry points to a row that no longer exists
ready         entries match current source rows
```

`semantic_search_items` may still return ready entries when some rows are stale, but it must expose status:

```json
{
  "index_status": "stale",
  "stale_count": 2,
  "missing_count": 1,
  "orphaned_count": 0,
  "rows": [...]
}
```

中文：

语义索引最危险的不是“不准”，而是“不知道自己不准”。M10 第一版必须让 index status 可见：缺失、过期、孤儿 entry 都要能解释。

## Deterministic Embeddings For Tests

M10 tests should not require network embeddings or paid providers.

Use a deterministic local embedding provider for tests and demo:

- maps normalized tokens into a fixed-size vector;
- semantically related demo words can be intentionally mapped close enough for stable assertions;
- dimensions can be small for tests, e.g. 16 or 32;
- OpenRouter remains a real provider option but is not part of CI acceptance.

This keeps M10 focused on framework semantics and product behavior, not provider reliability.

## Demo Narrative

M10 demo should start from a human problem:

```text
I saved several notes. I remember one was about launch risk, but not its title.
```

Demo data should include items where exact keyword search is insufficient:

| Query | Expected semantic hit |
|---|---|
| "release risk from customer escalation" | item about "critical customer signal blocking launch" |
| "deployment confidence" | item about "Docker release artifact and restart evidence" |
| "team alignment" | item about "milestone snapshot and shared project understanding" |

The UI does not need to become a full search product in M10, but the live app should show:

- a semantic search input;
- result scores;
- index status;
- a rebuild button or visible rebuild state;
- Data/Substrate view should make it clear that source rows did not gain business `embedding` cells.

## Scope

### P1: Core Derived Index Contract

Add tests and implementation for:

- `SemanticIndexDocument`
- `SemanticIndexStore`
- local SQLite store or equivalent first implementation
- cosine search
- staleness stats
- deterministic embedding provider if existing mock is insufficient

### P2: Knowledge Inbox Semantic Operations

Add:

- `rebuild_semantic_index`
- `semantic_search_items`
- policy rules for invoke/read;
- tests for ready, missing, stale, and no-result states.

### P3: Live App And Example Runner

Extend the Knowledge Inbox viewer and example:

- semantic search panel;
- index status display;
- deterministic demo seed;
- M10 runner that rebuilds index, runs queries, and verifies expected hits.

### P4: Release Regression

Verify semantic index survives release artifact boundary:

- build/restart with SQLite volume;
- semantic search still works after restart;
- if index is deleted, rebuild restores behavior from source rows.

### P5: Snapshot

Close with English and Chinese snapshots:

- explain source-of-truth vs derived index;
- show demo query examples;
- document why Qdrant is intentionally deferred.

## Testing Strategy

M10 should be test-first:

```text
bun test packages/core-domain/test/semantic-index*.test.ts
bun test templates/knowledge-inbox-core-domain/test/*semantic*.test.ts
bun test examples/m10-derived-semantic-index/*.test.ts
bun test examples/m8-release-packaging-hardening/release-packaging-smoke.test.ts
bun run typecheck
git diff --check
```

The M8 smoke remains a regression because M10 touches the releaseable Knowledge Inbox template.

## Boundaries

M10 does not claim:

- Qdrant integration;
- production-scale ANN search;
- background daemon indexing;
- streaming index updates;
- multi-runtime concurrency safety for index writes;
- semantic index governance UI;
- model/provider reliability;
- cross-app search;
- Runtime Agent in release mode;
- hot reload.

## Acceptance Criteria

M10 closes when:

- app rows remain source of truth and do not gain embedding business columns;
- derived index entries can be rebuilt from current SQLite rows;
- Knowledge Inbox supports semantic search through an Operation;
- stale/missing/orphaned index states are observable;
- deterministic CI tests prove semantic hits without network providers;
- release/restart verification shows semantic search survives mounted-volume release;
- English and Chinese milestone snapshots explain source-of-truth vs derived index clearly.

## Recommended Follow-Up After M10

If M10 closes cleanly, the next choices become clearer:

1. **Qdrant adapter:** now that the semantic index interface exists, add an external vector backend.
2. **Rollout adapter v0:** return to release/deploy correctness with M9 release candidates.
3. **Runtime Agent boundary:** let end users ask the finished app to use semantic search.

My recommendation after M10: choose Qdrant adapter only if the local index abstraction feels stable; otherwise do rollout adapter v0 to keep product and deployment confidence balanced.
