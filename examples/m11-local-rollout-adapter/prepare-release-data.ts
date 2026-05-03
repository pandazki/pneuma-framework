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

type SemanticMode = "missing" | "ready";

async function main(): Promise<void> {
  const workspace = resolve(requiredArg("--workspace"));
  const semantic = semanticModeArg();
  const dataDir = join(workspace, "data");
  mkdirSync(dataDir, { recursive: true });
  process.env.PNEUMA_WORKSPACE = workspace;
  process.env.PNEUMA_DATA_DIR = dataDir;
  process.env.PNEUMA_SQLITE_PATH = join(dataDir, "app.db");

  const mod = await import(
    `../../templates/knowledge-inbox-core-domain/server/config.ts?m11=${Date.now()}-${Math.random()}`
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
            url: `https://pneuma.local/m11/${item.id}`,
            status: "pending",
            created_at_cell: Date.now(),
            title: item.title,
            source: item.source,
            summary: item.summary,
          },
        }),
      );
    }

    if (semantic === "ready") {
      const rebuild = await invoke(runtime, "rebuild_semantic_index", {});
      const output = rebuild.output as { index_status?: string };
      if (output.index_status !== "ready") {
        throw new Error(`expected ready semantic index after rebuild, got ${JSON.stringify(rebuild.output)}`);
      }
    }

    const search = await invoke(runtime, "semantic_search_items", {
      query: "release risk from customer escalation",
      limit: 1,
    });
    const output = search.output as {
      index_status?: string;
      rows?: Array<{ item_id?: string }>;
    };
    if (output.index_status !== semantic) {
      throw new Error(`expected semantic index ${semantic}, got ${JSON.stringify(search.output)}`);
    }
    if (semantic === "ready" && output.rows?.[0]?.item_id !== "risk") {
      throw new Error(`expected risk top hit, got ${JSON.stringify(search.output)}`);
    }

    const evidence = {
      schema_version: 1,
      semantic,
      index_status: output.index_status,
      row_count: ITEMS.length,
      top_item_id: output.rows?.[0]?.item_id,
    };
    const out = join(workspace, ".pneuma", "m11", "release-data-evidence.json");
    mkdirSync(join(workspace, ".pneuma", "m11"), { recursive: true });
    writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(`m11 release data prepared: semantic=${semantic} evidence=${out}`);
  } finally {
    await runtime.close();
  }
}

async function invoke(runtime: AppRuntime, operationId: string, input: unknown) {
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

function semanticModeArg(): SemanticMode {
  const raw = requiredArg("--semantic");
  if (raw !== "missing" && raw !== "ready") {
    throw new Error("--semantic must be missing or ready");
  }
  return raw;
}

function requiredArg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

await main();
