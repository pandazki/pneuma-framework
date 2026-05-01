import { createPneumaFramework, type PneumaFramework, type ToolResult } from "@pneuma-framework/core";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { bootAppRuntime, type AppConfig } from "@pneuma-framework/runtime";
import { config as baseKnowledgeInboxConfig } from "../../templates/knowledge-inbox-core-domain/server/config.js";
import { priorityCapabilityChanges } from "./capability-plan.js";

export type RuntimeConfig = {
  tables: Array<{
    id: string;
    columns: Array<{ name: string }>;
  }>;
  operations: Array<{
    id: string;
    handler_kind?: string;
    invocation_method?: string;
  }>;
  views: Array<{
    id: string;
    kind: string;
  }>;
  policy_rules: Array<{
    id: string;
    actions: string[];
    resource: unknown;
  }>;
};

export type PriorityEvolutionHarness = {
  framework: PneumaFramework;
  baseUrl: string;
  results: ToolResult[];
  readConfig(): Promise<RuntimeConfig>;
  close(): Promise<void>;
};

export type StartPriorityEvolutionHarnessOptions = {
  workspace: string;
  portHint?: number;
  seedDemoRows?: boolean;
};

const PRIORITY_DEMO_ITEMS = [
  {
    url: "https://pneuma.local/m5/customer-escalation",
    title: "Customer escalation memo",
    source: "support review",
    summary: "A high-priority customer note that should rise above the general reading queue.",
    priority: "P1",
  },
  {
    url: "https://pneuma.local/m5/pricing-research",
    title: "Pricing research follow-up",
    source: "market notes",
    summary: "Useful commercial signal for the next planning session.",
    priority: "P2",
  },
  {
    url: "https://pneuma.local/m5/product-inspiration",
    title: "Product inspiration backlog",
    source: "reading list",
    summary: "Interesting but not urgent material for later synthesis.",
    priority: "P3",
  },
] as const;

export async function startPriorityEvolutionHarness(
  options: StartPriorityEvolutionHarnessOptions
): Promise<PriorityEvolutionHarness> {
  const templateDir = resolve(import.meta.dir, "../../templates/knowledge-inbox-core-domain");
  const fw = createPneumaFramework({
    templateDir,
    workspace: options.workspace,
    portHint: options.portHint ?? 0,
    authorization: {
      appId: "knowledge-inbox-core-domain",
      workspaceId: options.workspace,
    },
  });

  fw.orchestrator.setPermissionPromptPushHook((env) => {
    queueMicrotask(() => {
      fw.orchestrator.handleFrameworkPermissionResponse(env.prompt.id, "allow");
    });
  });

  try {
    const start = await fw.toolRegistry.call("lifecycle.dev.start", {});
    if (!start.ok) {
      throw new Error(`lifecycle.dev.start failed: ${JSON.stringify(start)}`);
    }

    const results: ToolResult[] = [];
    for (const change of priorityCapabilityChanges) {
      const result = await fw.toolRegistry.call("definition.apply", {
        require_approval: true,
        ...change,
      });
      results.push(result);
      if (!result.ok) {
        throw new Error(`definition.apply failed: ${JSON.stringify(result)}`);
      }
    }

    let baseUrl = currentBaseUrl(fw);
    if (options.seedDemoRows) {
      baseUrl = await seedPriorityDemoRows(fw, options.workspace, baseUrl);
    }
    return {
      framework: fw,
      baseUrl,
      results,
      async readConfig() {
        const response = await fetch(`${baseUrl}/api/config`);
        if (!response.ok) {
          throw new Error(`GET /api/config failed with HTTP ${response.status}: ${await response.text()}`);
        }
        return (await response.json()) as RuntimeConfig;
      },
      close: async () => {
        await fw.close();
      },
    };
  } catch (err) {
    await fw.close();
    throw err;
  }
}

function currentBaseUrl(fw: PneumaFramework): string {
  const service = fw.state.dev?.services?.[0]?.url;
  if (!service) throw new Error("M5 harness expected a running Knowledge Inbox service");
  return new URL(service).origin;
}

async function seedPriorityDemoRows(
  fw: PneumaFramework,
  workspace: string,
  baseUrl: string
): Promise<string> {
  for (const item of PRIORITY_DEMO_ITEMS) {
    const response = await fetch(`${baseUrl}/api/operations/capture_item`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: {
          url: item.url,
          title: item.title,
          source: item.source,
          summary: item.summary,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`capture_item failed while seeding M5 rows: ${response.status} ${await response.text()}`);
    }
  }

  const stop = await fw.toolRegistry.call("lifecycle.dev.stop", {});
  if (!stop.ok) throw new Error(`lifecycle.dev.stop failed before seeding priorities: ${JSON.stringify(stop)}`);

  const runtime = await bootAppRuntime(configForWorkspace(workspace));
  try {
    const prioritiesByUrl = new Map(PRIORITY_DEMO_ITEMS.map((item) => [item.url, item.priority]));
    const rows = await runtime.storage.listRowsByTable("inbox_items");
    for (const row of rows) {
      const priority = prioritiesByUrl.get(row.getCell("url") as string);
      if (!priority) continue;
      row.setCell("priority", priority);
      await runtime.storage.saveRow(row);
    }
  } finally {
    await runtime.close();
  }

  const restart = await fw.toolRegistry.call("lifecycle.dev.start", {});
  if (!restart.ok) throw new Error(`lifecycle.dev.start failed after seeding priorities: ${JSON.stringify(restart)}`);
  return currentBaseUrl(fw);
}

function configForWorkspace(workspace: string): AppConfig {
  const dataDir = join(workspace, "data");
  mkdirSync(dataDir, { recursive: true });
  return {
    ...baseKnowledgeInboxConfig,
    persistence: { kind: "sqlite", path: join(dataDir, "app.db") },
    audit: { ndjson_path: join(dataDir, "audit.ndjson") },
  };
}
