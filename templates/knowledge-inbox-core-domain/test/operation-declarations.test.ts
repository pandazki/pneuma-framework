import { describe, expect, test } from "bun:test";
import { config, operations } from "../server/config.js";

type ObjectOutput = {
  readonly kind: "object";
  readonly schema: {
    readonly type: "object";
    readonly properties: Record<string, unknown>;
    readonly required?: readonly string[];
  };
};

function objectOutput(id: string): ObjectOutput {
  const op = operations.find((candidate) => candidate.id === id);
  if (!op) throw new Error(`Operation "${id}" not found`);
  expect(op.output.kind).toBe("object");
  return op.output as ObjectOutput;
}

describe("knowledge-inbox-core-domain - Operation declarations", () => {
  test("declares the Knowledge Inbox app id and inbox_items table", () => {
    expect(config.app_id).toBe("knowledge-inbox-core-domain");
    expect(config.tables.map((table) => table.id)).toEqual(["inbox_items"]);
  });

  test("declares the minimum capture/list/status operation set", () => {
    expect(operations.map((op) => op.id).sort()).toEqual([
      "capture_item",
      "list_inbox_items",
      "rebuild_semantic_index",
      "semantic_search_items",
      "update_item_status",
    ]);
    expect(operations.find((op) => op.id === "list_inbox_items")?.affects.reads_only).toBe(true);
    expect(operations.find((op) => op.id === "semantic_search_items")?.affects.reads_only).toBe(true);
    expect(operations.find((op) => op.id === "rebuild_semantic_index")?.affects.reads_only).toBe(false);
  });

  test("capture_item declares the payload returned by its handler", () => {
    const out = objectOutput("capture_item");
    expect(Object.keys(out.schema.properties).sort()).toEqual(["id", "status", "url"]);
    expect(out.schema.required?.slice().sort()).toEqual(["id", "status", "url"]);
  });

  test("update_item_status declares the updated status payload returned by its handler", () => {
    const out = objectOutput("update_item_status");
    expect(Object.keys(out.schema.properties).sort()).toEqual(["id", "status"]);
    expect(out.schema.required?.slice().sort()).toEqual(["id", "status"]);
  });

  test("semantic operations expose index status and search result contract", () => {
    const rebuild = objectOutput("rebuild_semantic_index");
    expect(Object.keys(rebuild.schema.properties).sort()).toEqual([
      "index_status",
      "indexed_count",
      "missing_count",
      "orphaned_count",
      "ready_count",
      "source_count",
      "stale_count",
    ]);

    const search = objectOutput("semantic_search_items");
    expect(Object.keys(search.schema.properties).sort()).toEqual([
      "index_status",
      "indexed_count",
      "missing_count",
      "orphaned_count",
      "ready_count",
      "rows",
      "source_count",
      "stale_count",
    ]);
  });
});
