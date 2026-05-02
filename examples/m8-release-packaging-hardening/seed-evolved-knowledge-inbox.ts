import { createPneumaFramework, type PneumaFramework } from "@pneuma-framework/core";
import { bootAppRuntime } from "@pneuma-framework/runtime";
import { Row } from "@pneuma-framework/core-domain";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { priorityCapabilityChanges } from "../m5-knowledge-inbox-builder-evolution/capability-plan.js";
import { config as knowledgeInboxConfig } from "../../templates/knowledge-inbox-core-domain/server/config.js";

const DEMO_ITEMS = [
  {
    id: "m8-priority-p1",
    url: "https://pneuma.local/m8/security-escalation",
    title: "Security escalation",
    source: "release readiness",
    summary: "Release-blocking note that should stay at the top of the shipped queue.",
    priority: "P1",
    created_at_cell: 1_770_000_003_000,
  },
  {
    id: "m8-priority-p2",
    url: "https://pneuma.local/m8/customer-feedback",
    title: "Customer feedback cluster",
    source: "customer calls",
    summary: "Important product signal for the next release pass.",
    priority: "P2",
    created_at_cell: 1_770_000_002_000,
  },
  {
    id: "m8-priority-p3",
    url: "https://pneuma.local/m8/reading-backlog",
    title: "Reading backlog",
    source: "research",
    summary: "Useful but lower urgency material that should not block release.",
    priority: "P3",
    created_at_cell: 1_770_000_001_000,
  },
] as const;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function currentBaseUrl(framework: PneumaFramework): string {
  const service = framework.state.dev?.services?.[0]?.url;
  if (!service) throw new Error("M8 seed expected a running Knowledge Inbox service");
  return new URL(service).origin;
}

async function assertPriorityQueue(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/operations/list_priority_queue`);
  if (!response.ok) {
    throw new Error(`list_priority_queue failed during M8 seed: HTTP ${response.status} ${await response.text()}`);
  }
  const body = await response.json() as { rows?: Array<Record<string, unknown>> };
  const priorities = new Set((body.rows ?? []).map((row) => row.priority));
  for (const priority of ["P1", "P2", "P3"]) {
    if (!priorities.has(priority)) {
      throw new Error(`seeded priority queue is missing ${priority}: ${JSON.stringify(body)}`);
    }
  }
}

async function main(): Promise<void> {
  const root = requiredEnv("PNEUMA_ROOT");
  const workspace = requiredEnv("PNEUMA_WORKSPACE");
  mkdirSync(join(workspace, "data"), { recursive: true });

  const framework = createPneumaFramework({
    templateDir: resolve(root, "templates/knowledge-inbox-core-domain"),
    workspace,
    portHint: 0,
    authorization: {
      appId: "knowledge-inbox-core-domain",
      workspaceId: workspace,
    },
  });
  framework.orchestrator.setPermissionPromptPushHook((env) => {
    queueMicrotask(() => {
      framework.orchestrator.handleFrameworkPermissionResponse(env.prompt.id, "allow");
    });
  });

  try {
    const start = await framework.toolRegistry.call("lifecycle.dev.start", {});
    if (!start.ok) throw new Error(`lifecycle.dev.start failed: ${JSON.stringify(start)}`);
    const apply = await framework.toolRegistry.call("definition.apply_change_set", {
      intent: "Review inbox items by priority",
      summary: "Add Priority Queue capability for M8 release smoke",
      changes: priorityCapabilityChanges,
      acceptance_checks: [
        "inbox_items.priority exists",
        "list_priority_queue is available",
        "priority_queue view is visible",
      ],
      require_approval: true,
    });
    if (!apply.ok) throw new Error(`definition.apply_change_set failed: ${JSON.stringify(apply)}`);

    const stop = await framework.toolRegistry.call("lifecycle.dev.stop", {});
    if (!stop.ok) throw new Error(`lifecycle.dev.stop failed before row seed: ${JSON.stringify(stop)}`);

    const runtime = await bootAppRuntime(knowledgeInboxConfig);
    try {
      for (const item of DEMO_ITEMS) {
        await runtime.storage.saveRow(new Row({
          id: item.id,
          app_id: "knowledge-inbox-core-domain",
          table_id: "inbox_items",
          cells: {
            url: item.url,
            title: item.title,
            source: item.source,
            summary: item.summary,
            status: "pending",
            priority: item.priority,
            created_at_cell: item.created_at_cell,
          },
        }));
      }
    } finally {
      await runtime.close();
    }

    const restart = await framework.toolRegistry.call("lifecycle.dev.start", {});
    if (!restart.ok) throw new Error(`lifecycle.dev.start failed after row seed: ${JSON.stringify(restart)}`);
    await assertPriorityQueue(currentBaseUrl(framework));
  } finally {
    await framework.close();
  }
}

await main();

