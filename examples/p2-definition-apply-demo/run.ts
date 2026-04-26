#!/usr/bin/env bun
// P2 definition.apply demo — a compact milestone script.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PolicySet,
  Row,
  Table,
  type CellType,
} from "@pneuma-framework/core-domain";
import {
  applyDefinitionChange,
  bootAppRuntime,
  type AppConfig,
} from "@pneuma-framework/runtime";

async function main() {
  const app_id = "p2-definition-apply-demo";
  const dir = mkdtempSync(join(tmpdir(), "p2-definition-apply-"));
  const rowPath = join(dir, "rows.db");
  const historyPath = join(dir, "history.db");

  const makeConfig = (): AppConfig => ({
    app_id,
    tables: [
      new Table({
        id: "bookmarks",
        app_id,
        source: { kind: "stored" },
        columns: [{ name: "url", type: { kind: "primitive", of: "URL" } }],
      }),
    ],
    operations: [],
    policy: new PolicySet({ app_id }),
    handlers: {},
    storage: { sqlite_path: rowPath },
    history: { sqlite_path: historyPath },
  });

  console.log(`Workspace: ${dir}`);
  console.log("Step 1: boot app with bookmarks.url only");

  {
    const runtime = await bootAppRuntime(makeConfig());
    const table = (await runtime.tables.get("bookmarks"))!;
    console.log(`  schema before: ${table.columns.map((c) => c.name).join(", ")}`);
    try {
      await runtime.storage.saveRow(new Row({
        id: "bm-before",
        app_id,
        table_id: "bookmarks",
        cells: {
          url: "https://example.com/before",
          tags: "infra,agent",
        },
      }));
      throw new Error("unexpected success: tags should not be accepted before definition.apply");
    } catch (err) {
      console.log(`  expected validation failure: ${err instanceof Error ? err.message : String(err)}`);
    }
    await runtime.close();
  }

  console.log("Step 2: apply definition change via framework orchestration");
  const result = await applyDefinitionChange(makeConfig(), {
    kind: "add_table_column",
    table_id: "bookmarks",
    column_name: "tags",
    cell_type: { kind: "primitive", of: "Text" } as CellType,
    nullable: true,
  });

  const change = result.diff.changed_tables[0]!;
  console.log(`  diff: ${change.table_id} ${change.before_columns.join(", ")} -> ${change.after_columns.join(", ")}`);
  console.log(`  op output: ${JSON.stringify(result.operation_output)}`);

  console.log("Step 3: same row shape now passes normal schema validation");
  await result.runtime.storage.saveRow(new Row({
    id: "bm-after",
    app_id,
    table_id: "bookmarks",
    cells: {
      url: "https://example.com/after",
      tags: "infra,agent",
    },
  }));
  const back = await result.runtime.storage.getRow("bm-after");
  console.log(`  saved row: url=${back?.getCell("url")} tags=${back?.getCell("tags")}`);

  const latest = (await result.runtime.history.listEntries(app_id, {
    direction: "desc",
    limit: 1,
  }))[0]!;
  console.log(`  app_history: v${latest.version} ${latest.actor_kind}/${latest.actor_id} ${latest.description}`);

  await result.runtime.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
