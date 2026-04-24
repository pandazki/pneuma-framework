// ai-bookmarks-core-domain / app.ts
//
// 1. 读 env (OPENROUTER_API_KEY)
// 2. 构造 LLMProvider → buildConfig → bootAppRuntime
// 3. 如 lenses 表为空, 从 scaffold/lenses.json seed 几条默认 lens 进去
// 4. Bun.serve (api + 静态 viewer), emit markers

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  OpenRouterLLMProvider,
  OpenRouterEmbeddingProvider,
} from "@pneuma-framework/provider-openrouter";
import { asBunFetch, bootAppRuntime } from "@pneuma-framework/runtime";
import { Row } from "@pneuma-framework/core-domain";
import { APP_ID, buildConfig } from "./config.js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    process.stderr.write(
      `ERROR: missing env var "${name}". See template README for setup.\n`
    );
    process.exit(1);
  }
  return v;
}

const apiKey = requireEnv("OPENROUTER_API_KEY");

const llmProvider = new OpenRouterLLMProvider({
  apiKey,
  temperature: 0.4,
  maxTokens: 2048,
});
const embeddingProvider = new OpenRouterEmbeddingProvider({ apiKey });

const config = buildConfig({ llmProvider, embeddingProvider });

// ensure storage dirs
const ensureDir = (p: string): void => {
  try {
    mkdirSync(dirname(p), { recursive: true });
  } catch {}
};
if (config.storage?.sqlite_path) ensureDir(config.storage.sqlite_path);
if (config.audit?.ndjson_path) ensureDir(config.audit.ndjson_path);
if (config.history?.sqlite_path) ensureDir(config.history.sqlite_path);

const runtime = await bootAppRuntime(config);

// --- seed lenses from scaffold/lenses.json if DB empty ---
await seedLensesIfEmpty();

const port = Number(process.env.PNEUMA_PORT_HINT ?? "8765");
const apiFetch = asBunFetch(runtime);
const viewerDir = join(import.meta.dir, "..", "viewer");

const server = Bun.serve({
  port,
  fetch: async (req): Promise<Response> => {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return apiFetch(req);
    let rel = url.pathname;
    if (rel === "/") rel = "/index.html";
    if (rel.includes("..")) return new Response("forbidden", { status: 403 });
    const f = Bun.file(join(viewerDir, rel));
    if (await f.exists()) return new Response(f);
    return new Response("not found", { status: 404 });
  },
});

const base = `http://127.0.0.1:${server.port}`;
process.stdout.write(`##pneuma:service-ready api ${base}\n`);
process.stdout.write(`##pneuma:ready\n`);
process.stdout.write(`ai-bookmarks-core-domain up at ${base}  — ${runtime.listOperations().length} operations\n`);

// --- graceful shutdown ---
let stopping = false;
const shutdown = async (): Promise<void> => {
  if (stopping) return;
  stopping = true;
  process.stdout.write("##pneuma:stopping\n");
  try { server.stop(true); } catch {}
  try { await runtime.close(); } catch {}
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

// ---------- helpers ----------

async function seedLensesIfEmpty(): Promise<void> {
  const existing = await runtime.storage.listRowsByTable("lenses");
  if (existing.length > 0) {
    process.stdout.write(`[seed] lenses table has ${existing.length} row(s); skip seeding\n`);
    return;
  }
  const seedPath = join(import.meta.dir, "..", "scaffold", "lenses.json");
  if (!existsSync(seedPath)) {
    process.stdout.write("[seed] no scaffold/lenses.json — lenses table stays empty\n");
    return;
  }
  const raw = readFileSync(seedPath, "utf8");
  const parsed = JSON.parse(raw) as {
    lenses: Array<{ slug: string; display_name: string; prompt: string }>;
  };
  const now = Date.now();
  for (const lens of parsed.lenses) {
    const row = new Row({
      id: `lens-${lens.slug}`,
      table_id: "lenses",
      app_id: APP_ID,
      cells: {
        slug: lens.slug,
        display_name: lens.display_name,
        prompt: lens.prompt,
      },
      created_at: now,
      updated_at: now,
    });
    await runtime.storage.saveRow(row, { checkRefIntegrity: false });
  }
  process.stdout.write(`[seed] inserted ${parsed.lenses.length} lens(es) from scaffold\n`);
}
