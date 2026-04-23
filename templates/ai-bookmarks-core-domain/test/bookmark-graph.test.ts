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
    // Pin lex ordering explicitly (source < target)
    expect(body.edges[0]!.source).toBe("bm-a");
    expect(body.edges[0]!.target).toBe("bm-b");
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

  it("emits one edge per lens when a pair is close under multiple lenses", async () => {
    const { runtime } = rt;

    // Two lenses
    await invoke(runtime, "upsert_lens", {
      slug: "lx",
      display_name: "LX",
      prompt: "lens x",
    });
    await invoke(runtime, "upsert_lens", {
      slug: "ly",
      display_name: "LY",
      prompt: "lens y",
    });
    const lenses = await runtime.storage.listRowsByTable("lenses");
    const lensX = lenses.find((r) => r.cells.get("slug") === "lx")!.id;
    const lensY = lenses.find((r) => r.cells.get("slug") === "ly")!.id;

    // Seed bm-a and bm-b, each with interps under BOTH lenses, all close vectors
    // (so both lens pairs produce edges above threshold)
    await seedBookmarkWithInterp(runtime, "bm-a", "A", lensX, vec(1, 0));
    await seedBookmarkWithInterp(runtime, "bm-b", "B", lensX, vec(0.99, 0.01));

    // The seed helper only makes one interp per bookmark. Add the second interps
    // for both bookmarks under lensY directly via runtime.storage.saveRow.
    // Use the same Row shape as seedBookmarkWithInterp's interpretation saveRow.
    await runtime.storage.saveRow(
      new Row({
        id: "itp-bm-a-ly",
        table_id: "interpretations",
        app_id: APP_ID,
        cells: {
          bookmark_id: { kind: "row", table: "bookmarks", id: "bm-a" },
          lens_id: { kind: "row", table: "lenses", id: lensY },
          body: "b",
          generated_at: Date.now(),
          embedding: vec(1, 0),
        },
      }),
      { checkRefIntegrity: false }
    );
    await runtime.storage.saveRow(
      new Row({
        id: "itp-bm-b-ly",
        table_id: "interpretations",
        app_id: APP_ID,
        cells: {
          bookmark_id: { kind: "row", table: "bookmarks", id: "bm-b" },
          lens_id: { kind: "row", table: "lenses", id: lensY },
          body: "b",
          generated_at: Date.now(),
          embedding: vec(0.99, 0.01),
        },
      }),
      { checkRefIntegrity: false }
    );

    const resp = await invoke(runtime, "bookmark_graph", { threshold: 0.5 });
    expect(resp.status).toBe(200);
    const body = (resp.body as { output: unknown }).output as {
      nodes: Array<{ id: string }>;
      edges: Array<{ source: string; target: string; lens_id: string; score: number }>;
    };

    // Two edges: one per lens, both with source="bm-a", target="bm-b"
    expect(body.edges.length).toBe(2);
    const lensSet = new Set(body.edges.map((e) => e.lens_id));
    expect(lensSet.has(lensX)).toBe(true);
    expect(lensSet.has(lensY)).toBe(true);
    for (const e of body.edges) {
      expect(e.source).toBe("bm-a");
      expect(e.target).toBe("bm-b");
      expect(e.score).toBeGreaterThan(0.9);
    }
  });
});
