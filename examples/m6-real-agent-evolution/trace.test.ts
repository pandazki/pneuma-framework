import { describe, expect, test } from "bun:test";
import {
  buildM6EvolutionTraceDiff,
  createM6EvolutionTrace,
  recordM6AgentText,
  recordM6Approval,
  recordM6Completion,
  recordM6ToolCall,
  recordM6ToolResult,
  summarizeM6ConfigSnapshot,
} from "./trace.js";

describe("M6 evolution trace", () => {
  test("summarizes before and after app definition snapshots for demo comparison", () => {
    const before = summarizeM6ConfigSnapshot({
      tables: [
        {
          id: "inbox_items",
          columns: [{ name: "url" }, { name: "title" }],
        },
      ],
      operations: [{ id: "capture_item" }, { id: "list_inbox_items" }],
      views: [],
      policy_rules: [],
    });
    const after = summarizeM6ConfigSnapshot({
      tables: [
        {
          id: "inbox_items",
          columns: [{ name: "url" }, { name: "title" }, { name: "priority" }],
        },
      ],
      operations: [{ id: "capture_item" }, { id: "list_inbox_items" }, { id: "list_priority_queue" }],
      views: [{ id: "priority_queue" }],
      policy_rules: [
        { id: "anyone-invoke-list-priority-queue", actions: ["invoke"], resource: { kind: "operation", id: "list_priority_queue" } },
        { id: "anyone-read-priority-queue", actions: ["read"], resource: { kind: "view", id: "priority_queue" } },
      ],
    });

    expect(before.hasPriorityColumn).toBe(false);
    expect(before.hasPriorityOperation).toBe(false);
    expect(before.hasPriorityView).toBe(false);
    expect(after.hasPriorityColumn).toBe(true);
    expect(after.hasPriorityOperation).toBe(true);
    expect(after.hasPriorityView).toBe(true);
    expect(after.hasPriorityInvokePolicy).toBe(true);
    expect(after.hasPriorityReadPolicy).toBe(true);
    expect(buildM6EvolutionTraceDiff(before, after)).toEqual([
      "+ schema: inbox_items.priority",
      "+ domain service: list_priority_queue",
      "+ api: GET /api/operations/list_priority_queue",
      "+ view: priority_queue",
      "+ policy: anyone/anonymous invoke list_priority_queue",
      "+ policy: anyone/anonymous read priority_queue",
    ]);
  });

  test("merges streaming text deltas into readable assistant messages", () => {
    const trace = createM6EvolutionTrace({
      backend: "opencode",
      model: "openrouter/test-model",
      appUrl: "http://127.0.0.1:8877",
      frameworkToolUrl: "http://127.0.0.1:5555",
      workspace: "/tmp/m6",
      builderRequest: "Add priority review.",
      before: summarizeM6ConfigSnapshot({ tables: [], operations: [], views: [], policy_rules: [] }),
    });

    recordM6AgentText(trace, "I'll apply ", { kind: "delta", messageId: "m1", partId: "p1" });
    recordM6AgentText(trace, "these changes.", { kind: "delta", messageId: "m1", partId: "p1" });
    recordM6AgentText(trace, "Done.", { kind: "delta", messageId: "m2", partId: "p1" });

    expect(trace.summary.agentMessages).toBe(2);
    expect(trace.summary.agentTextEvents).toBe(3);
    expect(trace.agentConversation).toEqual([
      { role: "assistant", kind: "text", messageId: "m1", partId: "p1", text: "I'll apply these changes." },
      { role: "assistant", kind: "text", messageId: "m2", partId: "p1", text: "Done." },
    ]);
  });

  test("records tool calls, approvals, results, and completion separately from conversation", () => {
    const trace = createM6EvolutionTrace({
      backend: "opencode",
      model: "openrouter/test-model",
      appUrl: "http://127.0.0.1:8877",
      frameworkToolUrl: "http://127.0.0.1:5555",
      workspace: "/tmp/m6",
      builderRequest: "Add priority review.",
      before: summarizeM6ConfigSnapshot({ tables: [], operations: [], views: [], policy_rules: [] }),
    });

    recordM6ToolCall(trace, "definition.apply", { kind: "add_table_column", table_id: "inbox_items" });
    recordM6Approval(trace, "definition.apply", "pneuma:definition-apply:def-123");
    recordM6ToolResult(trace, "definition.apply", { ok: true, stage: "applied" });
    recordM6Completion(trace, {
      rows: [
        { priority: "P1", title: "Customer escalation memo" },
        { priority: "P2", title: "Pricing research follow-up" },
      ],
      after: summarizeM6ConfigSnapshot({
        tables: [{ id: "inbox_items", columns: [{ name: "priority" }] }],
        operations: [{ id: "list_priority_queue" }],
        views: [{ id: "priority_queue" }],
        policy_rules: [
          { id: "anyone-invoke-list-priority-queue" },
          { id: "anyone-read-priority-queue" },
        ],
      }),
    });

    expect(trace.summary.status).toBe("completed");
    expect(trace.summary.toolCalls).toBe(1);
    expect(trace.summary.approvals).toBe(1);
    expect(trace.summary.toolResults).toBe(1);
    expect(trace.summary.priorityRows).toBe(2);
    expect(trace.workLog.map((entry) => entry.kind)).toEqual([
      "session",
      "tool_call",
      "approval",
      "tool_result",
      "completion",
    ]);
    expect(trace.diff).toContain("+ schema: inbox_items.priority");
  });
});
