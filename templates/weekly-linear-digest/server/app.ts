// weekly-linear-digest / app.ts — dev entry.
//
// 1. 读 env: LINEAR_API_KEY + OPENROUTER_API_KEY (都必填; 缺任一直接报错退出)
// 2. 造 LinearClient + LinearAdapterImpl + OpenRouterLLMProvider
// 3. buildConfig(...) 返回 AppConfig, bootAppRuntime, serve

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { LinearAdapterImpl, LinearClient } from "@pneuma-framework/adapter-linear";
import { OpenRouterLLMProvider } from "@pneuma-framework/provider-openrouter";
import { asBunFetch, bootAppRuntime } from "@pneuma-framework/runtime";
import { buildConfig } from "./config.js";

// ---------- required env ----------

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

const linearKey = requireEnv("LINEAR_API_KEY");
const openrouterKey = requireEnv("OPENROUTER_API_KEY");

// ---------- wire dependencies ----------

const linearClient = new LinearClient({ apiKey: linearKey });
const linearAdapterImpl = new LinearAdapterImpl(linearClient);
const llmProvider = new OpenRouterLLMProvider({
  apiKey: openrouterKey,
  temperature: 0.4,
  maxTokens: 4096, // enough for ~2500 Chinese chars of digest across 50+ issues
});

const config = buildConfig({
  linearClient,
  linearAdapterImpl,
  llmProvider,
  linearApiKey: linearKey,
});

// ---------- ensure storage dirs ----------

const ensureDir = (path: string): void => {
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    // ignore
  }
};
if (config.storage?.sqlite_path) ensureDir(config.storage.sqlite_path);
if (config.audit?.ndjson_path) ensureDir(config.audit.ndjson_path);
if (config.history?.sqlite_path) ensureDir(config.history.sqlite_path);

// ---------- boot ----------

const runtime = await bootAppRuntime(config);

const port = Number(process.env.PNEUMA_PORT_HINT ?? "8765");
const apiFetch = asBunFetch(runtime);

const viewerDir = join(import.meta.dir, "..", "viewer");

const server = Bun.serve({
  port,
  fetch: async (req): Promise<Response> => {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      return apiFetch(req);
    }
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
process.stdout.write(`weekly-linear-digest up at ${base}  — ${runtime.listOperations().length} operations\n`);

// ---------- graceful shutdown ----------

let stopping = false;
const shutdown = async (): Promise<void> => {
  if (stopping) return;
  stopping = true;
  process.stdout.write("##pneuma:stopping\n");
  try {
    server.stop(true);
  } catch {}
  try {
    await runtime.close();
  } catch {}
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
