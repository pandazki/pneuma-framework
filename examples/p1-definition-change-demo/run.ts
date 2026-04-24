#!/usr/bin/env bun
// P1 definition-change demo — see README.md.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Table,
  Row,
  PolicySet,
  buildRootContext,
  type CellType,
} from "@pneuma-framework/core-domain";
import {
  bootAppRuntime,
  ADD_TABLE_COLUMN_OP_ID,
  type AppConfig,
} from "@pneuma-framework/runtime";

async function main() {
  const app_id = "p1-demo";
  const dir = mkdtempSync(join(tmpdir(), "p1-demo-"));
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

  console.log(`📁 Workspace: ${dir}`);

  // ---- Act 1: Process 1 ----
  console.log(`\n🔹 Process 1: boot, invoke add_table_column("bookmarks", "tags")`);
  {
    const runtime = await bootAppRuntime(makeConfig());
    const before = (await runtime.tables.get("bookmarks"))!;
    console.log(`   before: bookmarks has ${before.columns.length} columns -> ${before.columns.map((c) => c.name).join(", ")}`);

    const op = runtime.getOperation(ADD_TABLE_COLUMN_OP_ID)!;
    const ctx = buildRootContext({
      app_id,
      invoked_via: "agent",
      user: { id: "agent:demo", attrs: {}, roles: [] },
    });
    const result = await runtime.executor.invoke(
      op,
      {
        table_id: "bookmarks",
        column_name: "tags",
        cell_type: { kind: "primitive", of: "Text" } as CellType,
        nullable: true,
      },
      ctx,
    );
    const output = result.output as { entry_id: string; definition_version: number };
    console.log(`   → add_table_column returned ${JSON.stringify(output)}`);

    const histEntries = await runtime.history.listEntries(app_id, { direction: "desc", limit: 1 });
    const latest = histEntries[0];
    console.log(`   → app_history latest: v${latest?.version} ${latest?.actor_kind}/${latest?.description}`);

    const after = (await runtime.tables.get("bookmarks"))!;
    console.log(`   after (same process): bookmarks has ${after.columns.length} columns -> ${after.columns.map((c) => c.name).join(", ")}`);
    console.log(`   ℹ️  In-process Table is intentionally unchanged (P1 no-restart). Next boot picks it up.`);

    await runtime.close();
  }

  // ---- Act 2: Process 2 ----
  console.log(`\n🔹 Process 2: re-boot from the same SQLite file`);
  {
    const runtime = await bootAppRuntime(makeConfig());
    const base = (await runtime.tables.get("bookmarks"))!;
    console.log(`   bookmarks now has ${base.columns.length} columns -> ${base.columns.map((c) => c.name).join(", ")}`);
    if (!base.hasColumn("tags")) {
      throw new Error("overlay did not apply: 'tags' missing on bookmarks");
    }

    const row = new Row({
      id: "bm-demo",
      table_id: "bookmarks",
      app_id,
      cells: {
        url: "https://example.com/demo",
        tags: "p1,demo",
      },
    });
    await runtime.storage.saveRow(row);
    const back = await runtime.storage.getRow("bm-demo");
    console.log(`   ✅ saved + read-back: ${back?.getCell("url")} tags='${back?.getCell("tags")}'`);

    await runtime.close();
  }

  console.log(`\n🎉 P1 demo complete. Cleanup (manual): rm -rf ${dir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
