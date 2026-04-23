import { describe, expect, it, beforeEach } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MockLLMProvider,
  MockEmbeddingProvider,
  Row,
} from "@pneuma-framework/core-domain";
import { bootAppRuntime, handleHttp, type AppRuntime } from "@pneuma-framework/runtime";
import { buildConfig } from "../server/config.js";

const APP_ID = "ai-bookmarks-core-domain";

async function boot() {
  const dir = await mkdtemp(join(tmpdir(), "pneuma-graph-"));
  const llm = new MockLLMProvider();
  llm.defaultResponse = "summary";
  const embed = new MockEmbeddingProvider();
  const base = buildConfig({ llmProvider: llm, embeddingProvider: embed });
  const config = {
    ...base,
    storage: { sqlite_path: join(dir, "rows.db") },
    audit: { ndjson_path: join(dir, "audit.ndjson") },
    history: { sqlite_path: join(dir, "history.db") },
  };
  const runtime = await bootAppRuntime(config);
  return { runtime, dir };
}

// Helper: build a 1536-dim vector with first=a[0], second=a[1], rest 0
function vec(first: number, second = 0): number[] {
  const v = new Array(1536).fill(0);
  v[0] = first;
  v[1] = second;
  return v;
}

// Helper: invoke a POST operation via handleHttp
async function invoke(
  runtime: AppRuntime,
  opId: string,
  input: unknown,
  opts: { confirmed?: boolean } = {}
) {
  const resp = await handleHttp(runtime, {
    method: "POST",
    pathname: `/api/operations/${opId}`,
    searchParams: new URLSearchParams(),
    headers: new Headers(),
    readBody: async () => ({ input, ...(opts.confirmed ? { confirmed: true } : {}) }),
  });
  return resp;
}

async function seedBookmarkWithInterp(
  runtime: AppRuntime,
  bmId: string,
  title: string,
  lensId: string,
  embedding: number[]
) {
  await runtime.storage.saveRow(
    new Row({
      id: bmId,
      table_id: "bookmarks",
      app_id: APP_ID,
      cells: { url: `https://x/${bmId}`, title, body: "b" },
    }),
    { checkRefIntegrity: false }
  );
  await runtime.storage.saveRow(
    new Row({
      id: `itp-${bmId}`,
      table_id: "interpretations",
      app_id: APP_ID,
      cells: {
        bookmark_id: { kind: "row", table: "bookmarks", id: bmId },
        lens_id: { kind: "row", table: "lenses", id: lensId },
        body: "b",
        generated_at: Date.now(),
        embedding,
      },
    }),
    { checkRefIntegrity: false }
  );
}

describe("bookmark_graph Operation", () => {
  let rt: Awaited<ReturnType<typeof boot>>;

  beforeEach(async () => {
    rt = await boot();
  });

  it("emits edges above threshold with correct endpoints", async () => {
    const { runtime } = rt;

    // One lens
    await invoke(runtime, "upsert_lens", {
      slug: "x",
      display_name: "X",
      prompt: "lens x",
    });
    const lenses = await runtime.storage.listRowsByTable("lenses");
    const lensId = lenses[0]!.id;

    // Seed three bookmarks: A & B close, A & C orthogonal
    await seedBookmarkWithInterp(runtime, "bm-a", "A", lensId, vec(1, 0));
    await seedBookmarkWithInterp(runtime, "bm-b", "B", lensId, vec(0.99, 0.01));
    await seedBookmarkWithInterp(runtime, "bm-c", "C", lensId, vec(0, 1));

    const resp = await invoke(runtime, "bookmark_graph", { threshold: 0.5 });
    expect(resp.status).toBe(200);
    const body = (resp.body as { output: unknown }).output as {
      nodes: Array<{ id: string; title: string | null }>;
      edges: Array<{ source: string; target: string; score: number; lens_id: string }>;
    };

    // All three bookmarks should be in nodes (each has an interpretation with embedding)
    expect(body.nodes.map((n) => n.id).sort()).toEqual(["bm-a", "bm-b", "bm-c"]);
    // Only bm-a <-> bm-b has score > 0.5; A/C and B/C are orthogonal (~0)
    const edgeIds = body.edges
      .map((e) => [e.source, e.target].sort().join("-"))
      .sort();
    expect(edgeIds).toEqual(["bm-a-bm-b"]);
    expect(body.edges[0]!.score).toBeGreaterThan(0.5);
  });

  it("returns empty edges if all pairs below threshold", async () => {
    const { runtime } = rt;

    await invoke(runtime, "upsert_lens", {
      slug: "x",
      display_name: "X",
      prompt: "lens x",
    });
    const lenses = await runtime.storage.listRowsByTable("lenses");
    const lensId = lenses[0]!.id;

    // Only 2 orthogonal bookmarks
    await seedBookmarkWithInterp(runtime, "bm-a", "A", lensId, vec(1, 0));
    await seedBookmarkWithInterp(runtime, "bm-c", "C", lensId, vec(0, 1));

    const resp = await invoke(runtime, "bookmark_graph", { threshold: 0.5 });
    expect(resp.status).toBe(200);
    const body = (resp.body as { output: unknown }).output as {
      nodes: Array<{ id: string }>;
      edges: unknown[];
    };
    expect(body.edges.length).toBe(0);
    // Nodes still present: both bookmarks have embedded interpretations
    expect(body.nodes.length).toBe(2);
  });
});
