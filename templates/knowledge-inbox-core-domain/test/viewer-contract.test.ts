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

  test("offers app and data views for end-user and row-level understanding", () => {
    expect(html).toContain('data-view-toggle="app"');
    expect(html).toContain('data-view-toggle="data"');
    expect(html).toContain('data-view-panel="app"');
    expect(html).toContain('data-view-panel="data"');
    expect(html).toContain('data-testid="data-panel"');
    expect(html).toContain('id="data-table-body"');
    expect(html).toContain('id="data-empty-state"');
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

  test("includes the M5 Builder evolution scenario surface", () => {
    expect(html).toContain("builder-evolution");
    expect(html).toContain('data-testid="builder-evolution-panel"');
    expect(html).toContain("Builder Request");
    expect(html).toContain("Agent Proposal");
    expect(html).toContain("Governance Timeline");
    expect(html).toContain("Substrate Delta");
    expect(html).toContain("list_priority_queue");
    expect(html).toContain("priority_queue");
    expect(html).toContain("anyone-read-priority-queue");
  });
});
