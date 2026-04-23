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
  const dir = await mkdtemp(join(tmpdir(), "pneuma-rel-"));
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

describe("related_bookmarks Operation", () => {
  let rt: Awaited<ReturnType<typeof boot>>;

  beforeEach(async () => {
    rt = await boot();
  });

  it("returns top-K candidates by cosine similarity", async () => {
    const { runtime } = rt;

    // Upsert a lens and get its id
    await invoke(runtime, "upsert_lens", {
      slug: "x",
      display_name: "X",
      prompt: "lens x",
    });
    const lenses = await runtime.storage.listRowsByTable("lenses");
    const lensId = lenses[0]!.id;

    // bm-a: target, bm-b: most similar (vec(0.99, 0.01)), bm-c: least similar (vec(0, 1))
    await seedBookmarkWithInterp(runtime, "bm-a", "A", lensId, vec(1, 0));
    await seedBookmarkWithInterp(runtime, "bm-b", "B", lensId, vec(0.99, 0.01));
    await seedBookmarkWithInterp(runtime, "bm-c", "C", lensId, vec(0, 1));

    const resp = await invoke(runtime, "related_bookmarks", {
      bookmark_id: "bm-a",
      limit: 2,
    });
    expect(resp.status).toBe(200);
    const body = resp.body as { output: { rows: Array<{ bookmark_id: string; score: number }> } };
    const rows = body.output.rows;
    expect(rows.length).toBe(2);
    expect(rows[0]!.bookmark_id).toBe("bm-b");
    expect(rows[0]!.score).toBeGreaterThan(rows[1]!.score);
  });

  it("skips bookmarks whose interpretations lack embedding", async () => {
    const { runtime } = rt;

    await invoke(runtime, "upsert_lens", {
      slug: "x",
      display_name: "X",
      prompt: "lens x",
    });
    const lenses = await runtime.storage.listRowsByTable("lenses");
    const lensId = lenses[0]!.id;

    await seedBookmarkWithInterp(runtime, "bm-target", "T", lensId, vec(1));

    // Candidate bookmark WITHOUT embedding — manually insert interpretation without embedding cell
    await runtime.storage.saveRow(
      new Row({
        id: "bm-no-emb",
        table_id: "bookmarks",
        app_id: APP_ID,
        cells: { url: "https://y", title: "NoEmb", body: "b" },
      }),
      { checkRefIntegrity: false }
    );
    await runtime.storage.saveRow(
      new Row({
        id: "itp-no-emb",
        table_id: "interpretations",
        app_id: APP_ID,
        cells: {
          bookmark_id: { kind: "row", table: "bookmarks", id: "bm-no-emb" },
          lens_id: { kind: "row", table: "lenses", id: lensId },
          body: "b",
          generated_at: Date.now(),
          // no embedding cell
        },
      }),
      { checkRefIntegrity: false }
    );

    const resp = await invoke(runtime, "related_bookmarks", {
      bookmark_id: "bm-target",
    });
    expect(resp.status).toBe(200);
    const body = resp.body as { output: { rows: unknown[] } };
    expect(body.output.rows.length).toBe(0);
  });
});
