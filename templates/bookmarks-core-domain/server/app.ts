// bookmarks-core-domain / app.ts — dev 入口.
// 读 config.ts → boot runtime → Bun.serve → emit pneuma markers.
//
// 由 scripts/dev.sh 拉起; 收到 SIGTERM/SIGINT 时 graceful shutdown.

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { asBunFetch, bootAppRuntime } from "@pneuma-framework/runtime";
import { config } from "./config.js";

// ensure storage dirs exist
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

const runtime = await bootAppRuntime(config);

const port = Number(process.env.PNEUMA_PORT_HINT ?? "8765");
const server = Bun.serve({
  port,
  fetch: asBunFetch(runtime),
});

const base = `http://127.0.0.1:${server.port}`;

// pneuma markers: tell lifecycle orchestrator we're up
process.stdout.write(`##pneuma:service-ready api ${base}/api/health\n`);
process.stdout.write(`##pneuma:ready\n`);
process.stdout.write(`bookmarks-core-domain up at ${base}  — ${runtime.listOperations().length} operations\n`);

// --- graceful shutdown ---
let stopping = false;
const shutdown = async (): Promise<void> => {
  if (stopping) return;
  stopping = true;
  process.stdout.write("##pneuma:stopping\n");
  try {
    server.stop(true);
  } catch {
    // ignore
  }
  try {
    await runtime.close();
  } catch {
    // ignore
  }
  process.exit(0);
};
process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});
