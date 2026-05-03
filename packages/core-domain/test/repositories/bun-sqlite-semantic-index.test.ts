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
    expect(hits.map((hit) => hit.source_row_id)).toEqual([
      "risk",
      "deploy",
    ]);
    expect(hits[0]?.score).toBe(1);

    await store.close();
    const reopened = new BunSqliteSemanticIndexStore(dbPath);
    expect(
      (await reopened.listByIndex("knowledge_inbox_items"))
        .map((doc) => doc.source_row_id)
        .sort(),
    ).toEqual(["deploy", "risk"]);
    await reopened.deleteBySource({
      index_id: "knowledge_inbox_items",
      source_table_id: "inbox_items",
      source_row_id: "risk",
    });
    expect(
      (await reopened.listByIndex("knowledge_inbox_items")).map(
        (doc) => doc.source_row_id,
      ),
    ).toEqual(["deploy"]);
    await reopened.clear("knowledge_inbox_items");
    expect(await reopened.listByIndex("knowledge_inbox_items")).toEqual([]);
    await reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
