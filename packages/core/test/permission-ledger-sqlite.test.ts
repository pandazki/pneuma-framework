import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openPneumaSqliteDatabase } from "@pneuma-framework/core-domain";
import {
  BunSqlitePermissionLedgerStore,
  type PermissionLedgerEvent,
} from "../src/index.js";

const event: PermissionLedgerEvent = {
  schema_version: 1,
  event_id: "permission-1",
  event_type: "permission_requested",
  at_ms: 1000,
  prompt_id: "prompt-1",
  app_id: "app-1",
  workspace_id: "workspace-1",
  tool: "definition.apply",
  capability: "definition:apply",
  target: {
    kind: "definition",
    id: "definition.apply:add_table_column:bookmarks:tags",
  },
  target_fingerprint: "definition.apply:add_table_column:bookmarks:tags",
  requested_principal: { kind: "build_agent", id: "agent-1" },
  detail: { summary: "Add tags column" },
};

describe("BunSqlitePermissionLedgerStore", () => {
  test("persists ledger events and derived requests across store reopen", () => {
    const dir = mkdtempSync(join(tmpdir(), "pneuma-ledger-sqlite-"));
    try {
      const dbPath = join(dir, "app.db");
      const db1 = openPneumaSqliteDatabase(dbPath);
      new BunSqlitePermissionLedgerStore(db1).append(event);
      db1.close();

      const db2 = openPneumaSqliteDatabase(dbPath);
      try {
        const store = new BunSqlitePermissionLedgerStore(db2);
        expect(store.list().map((item) => item.event_id)).toEqual([
          "permission-1",
        ]);
        const requests = store.listRequests({ tool: "definition.apply" });
        expect(requests).toHaveLength(1);
        expect(requests[0]!.prompt_id).toBe("prompt-1");
        expect(requests[0]!.status).toBe("pending");
      } finally {
        db2.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
