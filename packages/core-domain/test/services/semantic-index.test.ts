import { expect, test } from "bun:test";

import { Row } from "../../src/aggregates/row.js";
import { DeterministicEmbeddingProvider } from "../../src/services/embedding-provider.js";
import {
  InMemorySemanticIndexStore,
  SemanticIndexService,
  semanticSourceFingerprint,
} from "../../src/services/semantic-index.js";
import { buildRootContext } from "../../src/value-objects/permission-context.js";

const CTX = buildRootContext({
  app_id: "knowledge-inbox-core-domain",
  invoked_via: "ui",
});

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
  const service = new SemanticIndexService({
    store,
    embeddingProvider: embeddings,
    model: "local-deterministic",
  });
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
  const source = item("source-1", {
    title: "Original title",
    summary: "First summary",
  });
  await service.rebuild({
    index_id: "knowledge_inbox_items",
    source_rows: [source],
    projection: { fields: ["title", "summary"] },
    permissionContext: CTX,
  });

  const changed = item("source-1", {
    title: "Changed title",
    summary: "First summary",
  });
  const missing = item("source-2", {
    title: "New row",
    summary: "Not indexed yet",
  });
  const stats = await service.explainStaleness({
    index_id: "knowledge_inbox_items",
    source_rows: [changed, missing],
    projection: { fields: ["title", "summary"] },
  });

  expect(stats.status).toBe("stale");
  expect(stats.stale_count).toBe(1);
  expect(stats.missing_count).toBe(1);
  expect(stats.orphaned_count).toBe(0);
  expect(
    semanticSourceFingerprint(source, { fields: ["title", "summary"] }),
  ).not.toBe(
    semanticSourceFingerprint(changed, { fields: ["title", "summary"] }),
  );

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
  expect(withOrphan.status).toBe("orphaned");
});
