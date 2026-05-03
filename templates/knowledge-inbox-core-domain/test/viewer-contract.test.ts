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

  test("exposes the M10 semantic search and derived index controls", () => {
    expect(html).toContain('data-testid="semantic-search-panel"');
    expect(html).toContain('id="semantic-search-form"');
    expect(html).toContain('id="semantic-search-input"');
    expect(html).toContain('id="semantic-rebuild-button"');
    expect(html).toContain('id="semantic-index-status"');
    expect(html).toContain('id="semantic-results"');
    expect(html).toContain("/api/operations/rebuild_semantic_index");
    expect(html).toContain("/api/operations/semantic_search_items");
    expect(html).toContain("semantic_index_entries");
    expect(html).toContain("derived index");
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

  test("includes the M6 real backend-agent evolution surface", () => {
    expect(html).toContain("real-agent-evolution");
    expect(html).toContain('data-testid="backend-agent-session-panel"');
    expect(html).toContain('data-testid="evolution-trace-panel"');
    expect(html).toContain('data-testid="agent-conversation-drawer"');
    expect(html).toContain('data-testid="agent-execution-timeline"');
    expect(html).toContain('data-testid="agent-conversation-messages"');
    expect(html).toContain("Builder Request");
    expect(html).toContain("Framework Activity");
    expect(html).toContain("tool_call");
    expect(html).toContain("approval");
    expect(html).toContain("tool_result");
    expect(html).toContain('data-trace-tab="before"');
    expect(html).toContain('data-trace-tab="work"');
    expect(html).toContain('data-trace-tab="after"');
    expect(html).toContain('data-trace-tab="diff"');
    expect(html).toContain("/api/evolution-trace");
    expect(html).toContain("AgentBackend + MCP tools");
    expect(html).toContain("frameworkToolUrl");
    expect(html).toContain("pneuma_framework");
    expect(html).toContain("definition.apply over the framework tool proxy");
    expect(html).toContain("restart rediscovery");
  });

  test("includes the M7 live Builder approval surface", () => {
    expect(html).toContain("live-approval");
    expect(html).toContain("/api/agent-execution-transcript");
    expect(html).toContain("/api/framework-session");
    expect(html).toContain("new WebSocket");
    expect(html).toContain("permission-response");
    expect(html).toContain('data-testid="live-approval-card"');
    expect(html).toContain('data-testid="allow-live-approval"');
    expect(html).toContain('data-testid="deny-live-approval"');
    expect(html).toContain('data-testid="agent-transcript-drawer"');
    expect(html).toContain("Live Builder approval");
    expect(html).toContain("Before");
    expect(html).toContain("After");
    expect(html).toContain("definition.apply_change_set prompt");
    expect(html).toContain("one capability proposal");
  });
});
