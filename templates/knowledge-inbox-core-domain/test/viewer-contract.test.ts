import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const html = readFileSync(join(import.meta.dir, "..", "viewer", "index.html"), "utf8");

describe("knowledge-inbox-core-domain viewer contract", () => {
  test("renders a product-shaped capture, queue, detail, and evidence shell", () => {
    expect(html).toContain('data-testid="capture-panel"');
    expect(html).toContain('data-testid="queue-panel"');
    expect(html).toContain('data-testid="detail-panel"');
    expect(html).toContain('data-testid="evidence-panel"');
    expect(html).toContain('data-testid="substrate-panel"');
    expect(html).toContain('data-testid="queue-count"');
  });

  test("exposes status filters and operation-backed actions", () => {
    for (const status of ["pending", "kept", "archived", "all"]) {
      expect(html).toContain(`data-status-filter="${status}"`);
    }
    expect(html).toContain("/api/operations/capture_item");
    expect(html).toContain("/api/operations/list_inbox_items");
    expect(html).toContain("/api/operations/update_item_status");
  });

  test("explains the live substrate through schema, domain service, and api lanes", () => {
    expect(html).toContain('data-substrate-lane="schema"');
    expect(html).toContain('data-substrate-lane="domain-service"');
    expect(html).toContain('data-substrate-lane="api"');
    expect(html).toContain('id="schema-lines"');
    expect(html).toContain('id="operation-lines"');
    expect(html).toContain('id="api-lines"');
    expect(html).toContain("/api/config");
    expect(html).toContain("/healthz");
  });
});
