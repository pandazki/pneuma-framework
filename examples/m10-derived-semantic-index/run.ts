import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  Row,
  buildRootContext,
  type Operation,
} from "@pneuma-framework/core-domain";
import { bootAppRuntime, type AppRuntime } from "@pneuma-framework/runtime";

const APP_ID = "knowledge-inbox-core-domain";

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
  const dataDir = join(workspace, "data");
  mkdirSync(dataDir, { recursive: true });
  process.env.PNEUMA_WORKSPACE = workspace;
  process.env.PNEUMA_DATA_DIR = dataDir;
  process.env.PNEUMA_SQLITE_PATH = join(dataDir, "app.db");

  const mod = await import(
    `../../templates/knowledge-inbox-core-domain/server/config.ts?m10=${Date.now()}`
  );
  const runtime = await bootAppRuntime(mod.config);
  try {
    for (const item of ITEMS) {
      await runtime.storage.saveRow(
        new Row({
          id: item.id,
          app_id: APP_ID,
          table_id: "inbox_items",
          cells: {
            url: `https://pneuma.local/m10/${item.id}`,
            status: "pending",
            created_at_cell: Date.now(),
            title: item.title,
            source: item.source,
            summary: item.summary,
          },
        }),
      );
    }

    const rebuild = await invoke(runtime, "rebuild_semantic_index", {});
    const rebuildOutput = rebuild.output as { index_status: string };
    if (rebuildOutput.index_status !== "ready") {
      throw new Error(`semantic index rebuild not ready: ${JSON.stringify(rebuild.output)}`);
    }

    const queries = [];
    for (const q of QUERIES) {
      const result = await invoke(runtime, "semantic_search_items", {
        query: q.query,
        limit: 1,
      });
      const output = result.output as {
        index_status: string;
        rows: Array<{ item_id: string; score: number }>;
      };
      const top = output.rows[0];
      if (output.index_status !== "ready") {
        throw new Error(`${q.query} expected ready index, got ${output.index_status}`);
      }
      if (top?.item_id !== q.expected) {
        throw new Error(`${q.query} expected ${q.expected}, got ${top?.item_id ?? "none"}`);
      }
      queries.push({
        query: q.query,
        expected: q.expected,
        top_item_id: top.item_id,
        score: top.score,
      });
      console.log(`${q.query} -> ${top.item_id}`);
    }

    const inbox = runtime.config.tables.find((table) => table.id === "inbox_items");
    const evidence = {
      schema_version: 1,
      final_status: "semantic_index_ready",
      index_status: "ready",
      source_rows_have_embedding_column:
        inbox?.columns.some((column) => column.name === "embedding") ?? false,
      queries,
    };
    const out = join(workspace, ".pneuma", "m10", "semantic-index-evidence.json");
    mkdirSync(join(workspace, ".pneuma", "m10"), { recursive: true });
    writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log("M10 Derived Semantic Index ready:");
    console.log(`evidence: ${out}`);
  } finally {
    await runtime.close();
  }
}

async function invoke(
  runtime: AppRuntime,
  operationId: string,
  input: unknown,
) {
  const op = runtime.getOperation(operationId) as Operation | undefined;
  if (!op) throw new Error(`operation not found: ${operationId}`);
  return await runtime.executor.invoke(
    op,
    input,
    buildRootContext({
      app_id: APP_ID,
      invoked_via: "ui",
    }),
  );
}

await main();
