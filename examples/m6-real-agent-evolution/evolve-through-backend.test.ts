import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startM6BackendAgentEvolutionHarness } from "./backend-harness.js";

describe("M6 real backend-agent evolution harness", () => {
  test("evolves Knowledge Inbox through AgentBackend launch/message and framework semantic tools", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m6-backend-agent-"));
    const harness = await startM6BackendAgentEvolutionHarness({ workspace });
    try {
      expect(harness.session.state).toBe("ready");
      expect(harness.agent.launchOptions?.appUrl).toMatch(/^http:\/\/127\.0\.0\.1:/);
      expect(harness.agent.launchOptions?.frameworkToolUrl).toMatch(/^http:\/\/127\.0\.0\.1:/);
      expect(harness.agent.seenFrameworkTools).toContain("definition.apply");

      expect(harness.events.map((event) => event.type)).toContain("tool-call");
      expect(harness.events.filter((event) => event.type === "tool-call").map((event) => event.payload.toolName))
        .toEqual([
          "definition.apply",
          "definition.apply",
          "definition.apply",
          "definition.apply",
        ]);
      expect(harness.results).toHaveLength(4);
      for (const result of harness.results) {
        expect(result.ok).toBe(true);
        expect(result.state).toMatchObject({
          status: "applied",
          approval: { required: true, decision: "allow" },
          authorization: {
            requested_principal: { kind: "build_agent" },
            execution_principal: { kind: "framework_system" },
          },
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
    } finally {
      await harness.close();
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 60_000);
});
