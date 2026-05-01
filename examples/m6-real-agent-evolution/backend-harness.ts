import {
  createPneumaFramework,
  startFrameworkToolHttpProxy,
  type AgentBackend,
  type AgentCapabilities,
  type AgentEvent,
  type AgentEventHandler,
  type AgentLaunchOptions,
  type AgentSession,
  type FrameworkToolHttpProxy,
  type PneumaFramework,
  type PermissionResponse,
  type ToolResult,
} from "@pneuma-framework/core";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { bootAppRuntime, type AppConfig } from "@pneuma-framework/runtime";
import { config as baseKnowledgeInboxConfig } from "../../templates/knowledge-inbox-core-domain/server/config.js";
import {
  agentProposal,
  builderRequest,
  priorityCapabilityChanges,
} from "../m5-knowledge-inbox-builder-evolution/capability-plan.js";
import {
  callFrameworkTool,
  fetchFrameworkTools,
} from "../../packages/core/bin/framework-mcp-bridge.js";

const SCRIPTED_AGENT_CAPABILITIES: AgentCapabilities = {
  streaming: true,
  resume: false,
  permissions: true,
  toolProgress: true,
  modelSwitch: false,
};

export const m6BuilderRequest =
  `${builderRequest} Use framework definition tools rather than editing files.`;

export { priorityCapabilityChanges };

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

export type M6BackendAgentEvolutionHarness = {
  framework: PneumaFramework;
  agent: ScriptedPriorityReviewAgentBackend;
  session: AgentSession;
  events: AgentEvent[];
  results: ToolResult[];
  initialBaseUrl: string;
  baseUrl: string;
  readConfig(): Promise<RuntimeConfig>;
  close(): Promise<void>;
};

export type StartM6BackendAgentEvolutionHarnessOptions = {
  workspace: string;
  portHint?: number;
  seedDemoRows?: boolean;
};

export const PRIORITY_DEMO_ITEMS = [
  {
    url: "https://pneuma.local/m6/customer-escalation",
    title: "Customer escalation memo",
    source: "support review",
    summary: "A high-priority customer note that should rise above the general reading queue.",
    priority: "P1",
  },
  {
    url: "https://pneuma.local/m6/pricing-research",
    title: "Pricing research follow-up",
    source: "market notes",
    summary: "Useful commercial signal for the next planning session.",
    priority: "P2",
  },
  {
    url: "https://pneuma.local/m6/product-inspiration",
    title: "Product inspiration backlog",
    source: "reading list",
    summary: "Interesting but not urgent material for later synthesis.",
    priority: "P3",
  },
] as const;

export class ScriptedPriorityReviewAgentBackend implements AgentBackend {
  readonly type = "scripted-m6-priority-agent" as const;
  readonly capabilities = SCRIPTED_AGENT_CAPABILITIES;
  readonly userMessages: Array<{ sessionId: string; text: string }> = [];
  readonly permissionDecisions: PermissionResponse[] = [];
  readonly results: ToolResult[] = [];
  readonly seenFrameworkTools: string[] = [];
  launchOptions?: AgentLaunchOptions;

  private readonly handlers = new Set<AgentEventHandler>();
  private readonly sessions = new Map<string, AgentSession>();
  private seq = 0;

  async launch(opts: AgentLaunchOptions): Promise<AgentSession> {
    this.launchOptions = opts;
    this.seq += 1;
    const session: AgentSession = {
      sessionId: `scripted-m6-${this.seq}`,
      backendSessionId: `scripted-m6-${this.seq}`,
      state: "ready",
      startedAt: Date.now(),
    };
    this.sessions.set(session.sessionId, session);
    this.emit({ type: "session-ready", sessionId: session.sessionId, payload: {} });
    return session;
  }

  async sendUserMessage(sessionId: string, text: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`unknown session: ${sessionId}`);
    this.userMessages.push({ sessionId, text });
    this.emitText(sessionId, `Builder request received: ${text}`);

    const frameworkToolUrl = this.launchOptions?.frameworkToolUrl;
    if (!frameworkToolUrl) {
      throw new Error("scripted M6 agent requires frameworkToolUrl");
    }

    const frameworkTools = await fetchFrameworkTools(frameworkToolUrl);
    this.seenFrameworkTools.splice(0, this.seenFrameworkTools.length, ...frameworkTools.map((tool) => tool.name));
    if (!this.seenFrameworkTools.includes("definition.apply")) {
      throw new Error("scripted M6 agent could not see definition.apply");
    }

    this.emitText(sessionId, `Inspected framework tools and selected ${agentProposal.title}.`);
    for (const change of priorityCapabilityChanges) {
      const input = { require_approval: true, ...change };
      this.emit({
        type: "tool-call",
        sessionId,
        payload: { toolName: "definition.apply", input },
      });
      const result = await callFrameworkTool(frameworkToolUrl, "definition.apply", input);
      this.results.push(result as ToolResult);
      if (!(result as ToolResult).ok) {
        this.emit({ type: "error", sessionId, payload: { toolName: "definition.apply", result } });
        throw new Error(`definition.apply failed: ${JSON.stringify(result)}`);
      }
      this.emitText(sessionId, `Applied ${change.kind} through definition.apply.`);
    }

    this.emitText(sessionId, "Priority Queue is ready after governed restart rediscovery.");
  }

  async respondToPermission(_sessionId: string, response: PermissionResponse): Promise<void> {
    this.permissionDecisions.push(response);
  }

  onEvent(handler: AgentEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async stop(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.state === "exited") return;
    session.state = "exited";
    session.exitedAt = Date.now();
    this.emit({ type: "session-exited", sessionId, payload: {} });
  }

  async close(): Promise<void> {
    for (const sessionId of [...this.sessions.keys()]) {
      await this.stop(sessionId);
    }
    this.handlers.clear();
  }

  private emitText(sessionId: string, text: string): void {
    this.emit({ type: "text", sessionId, payload: { text } });
  }

  private emit(event: AgentEvent): void {
    for (const handler of this.handlers) handler(event);
  }
}

export async function startM6BackendAgentEvolutionHarness(
  options: StartM6BackendAgentEvolutionHarnessOptions,
): Promise<M6BackendAgentEvolutionHarness> {
  const templateDir = resolve(import.meta.dir, "../../templates/knowledge-inbox-core-domain");
  const agent = new ScriptedPriorityReviewAgentBackend();
  const events: AgentEvent[] = [];
  agent.onEvent((event) => events.push(event));

  const framework = createPneumaFramework({
    templateDir,
    workspace: options.workspace,
    portHint: options.portHint ?? 0,
    backend: agent,
    authorization: {
      appId: "knowledge-inbox-core-domain",
      workspaceId: options.workspace,
    },
  });

  let frameworkToolProxy: FrameworkToolHttpProxy | undefined;
  try {
    framework.orchestrator.setPermissionPromptPushHook((env) => {
      queueMicrotask(() => {
        framework.orchestrator.handleFrameworkPermissionResponse(env.prompt.id, "allow");
      });
    });

    const start = await framework.toolRegistry.call("lifecycle.dev.start", {});
    if (!start.ok) {
      throw new Error(`lifecycle.dev.start failed: ${JSON.stringify(start)}`);
    }
    const initialBaseUrl = currentBaseUrl(framework);
    frameworkToolProxy = startFrameworkToolHttpProxy(framework.toolRegistry, { port: 0 });

    const session = await agent.launch({
      cwd: options.workspace,
      appUrl: initialBaseUrl,
      frameworkToolUrl: frameworkToolProxy.url,
    });
    framework.annotateBackendSession(session.backendSessionId ?? session.sessionId);
    await agent.sendUserMessage(session.sessionId, m6BuilderRequest);
    let baseUrl = currentBaseUrl(framework);
    if (options.seedDemoRows) {
      baseUrl = await seedPriorityDemoRows(framework, options.workspace, baseUrl);
    }

    return {
      framework,
      agent,
      session,
      events,
      results: agent.results,
      initialBaseUrl,
      baseUrl,
      async readConfig() {
        const response = await fetch(`${currentBaseUrl(framework)}/api/config`);
        if (!response.ok) {
          throw new Error(`GET /api/config failed with HTTP ${response.status}: ${await response.text()}`);
        }
        return (await response.json()) as RuntimeConfig;
      },
      close: async () => {
        frameworkToolProxy?.close();
        await agent.close();
        await framework.close();
      },
    };
  } catch (err) {
    frameworkToolProxy?.close();
    await agent.close();
    await framework.close();
    throw err;
  }
}

function currentBaseUrl(framework: PneumaFramework): string {
  const service = framework.state.dev?.services?.[0]?.url;
  if (!service) throw new Error("M6 harness expected a running Knowledge Inbox service");
  return new URL(service).origin;
}

export async function seedPriorityDemoRows(
  framework: PneumaFramework,
  workspace: string,
  baseUrl: string,
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
      throw new Error(`capture_item failed while seeding M6 rows: ${response.status} ${await response.text()}`);
    }
  }

  const stop = await framework.toolRegistry.call("lifecycle.dev.stop", {});
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

  const restart = await framework.toolRegistry.call("lifecycle.dev.start", {});
  if (!restart.ok) throw new Error(`lifecycle.dev.start failed after seeding priorities: ${JSON.stringify(restart)}`);
  return currentBaseUrl(framework);
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
