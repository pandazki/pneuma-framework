import { describe, expect, test } from "bun:test";
import {
  agentProposal,
  builderRequest,
  priorityCapabilityChanges,
} from "./capability-plan.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startPriorityEvolutionHarness } from "./builder-evolution.js";

describe("M5 Knowledge Inbox Builder evolution", () => {
  test("describes the priority review capability as five governed definition changes", () => {
    expect(builderRequest).toContain("priority");
    expect(agentProposal.summary).toContain("Priority Queue");
    expect(priorityCapabilityChanges.map((change) => change.kind)).toEqual([
      "add_table_column",
      "add_operation",
      "add_policy_rule",
      "add_policy_rule",
      "add_view",
    ]);
    expect(priorityCapabilityChanges[0]).toMatchObject({
      kind: "add_table_column",
      table_id: "inbox_items",
      column_name: "priority",
    });
    expect(priorityCapabilityChanges[1]).toMatchObject({
      kind: "add_operation",
      operation_id: "list_priority_queue",
      handler: { kind: "query", on: "inbox_items" },
    });
    expect(priorityCapabilityChanges[2]).toMatchObject({
      kind: "add_policy_rule",
      rule_id: "anyone-invoke-list-priority-queue",
      actions: ["invoke"],
      resource: { kind: "operation", id: "list_priority_queue" },
    });
    expect(priorityCapabilityChanges[3]).toMatchObject({
      kind: "add_policy_rule",
      rule_id: "anyone-read-priority-queue",
      actions: ["read"],
      resource: { kind: "view", id: "priority_queue" },
    });
    expect(priorityCapabilityChanges[4]).toMatchObject({
      kind: "add_view",
      view_id: "priority_queue",
      source: { kind: "operation", operation_id: "list_priority_queue" },
    });
  });

  test("applies the priority capability through governed definition.apply and rediscovers it", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m5-builder-evolution-"));
    const harness = await startPriorityEvolutionHarness({ workspace });
    try {
      expect(harness.results).toHaveLength(5);
      for (const result of harness.results) {
        expect(result.ok).toBe(true);
        expect(result.state).toMatchObject({
          status: "applied",
          authorization: {
            requested_principal: { kind: "build_agent" },
            execution_principal: { kind: "framework_system" },
            reason_code: "allowed",
          },
          approval: { required: true, decision: "allow" },
        });
      }

      const config = await harness.readConfig();
      const inbox = config.tables.find((table) => table.id === "inbox_items");
      expect(inbox?.columns.map((column) => column.name)).toContain("priority");
      expect(config.operations.find((op) => op.id === "list_priority_queue")).toMatchObject({
        id: "list_priority_queue",
        handler_kind: "query",
        invocation_method: "GET",
      });
      expect(config.views.find((view) => view.id === "priority_queue")).toMatchObject({
        id: "priority_queue",
        kind: "table",
      });
      expect(config.policy_rules.find((rule) => rule.id === "anyone-read-priority-queue"))
        .toMatchObject({
          id: "anyone-read-priority-queue",
          actions: ["read"],
          resource: { kind: "view", id: "priority_queue" },
        });
      expect(config.policy_rules.find((rule) => rule.id === "anyone-invoke-list-priority-queue"))
        .toMatchObject({
          id: "anyone-invoke-list-priority-queue",
          actions: ["invoke"],
          resource: { kind: "operation", id: "list_priority_queue" },
        });
    } finally {
      await harness.close();
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 60_000);

  test("serves the Builder-created priority queue through the public GET API", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m5-priority-api-"));
    const harness = await startPriorityEvolutionHarness({ workspace, seedDemoRows: true });
    try {
      const response = await fetch(`${harness.baseUrl}/api/operations/list_priority_queue`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { rows: Array<Record<string, unknown>> };
      expect(body.rows).toHaveLength(3);
      expect(body.rows.map((row) => row.priority)).toEqual(["P1", "P2", "P3"]);
      expect(body.rows[0]).toMatchObject({
        title: "Customer escalation memo",
        priority: "P1",
      });
    } finally {
      await harness.close();
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 60_000);
});
