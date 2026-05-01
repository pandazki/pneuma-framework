#!/usr/bin/env bun

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createPneumaFramework,
  getAgentBackendFactory,
  startFrameworkToolHttpProxy,
  type AgentBackend,
  type FrameworkToolHttpProxy,
  type PneumaFramework,
} from "@pneuma-framework/core";
import { registerOpencodeBackend } from "@pneuma-framework/backend-opencode";
import {
  m6BuilderRequest,
  priorityCapabilityChanges,
  seedPriorityDemoRows,
  startM6BackendAgentEvolutionHarness,
  type M6BackendAgentEvolutionHarness,
} from "./backend-harness.js";
import {
  createM6EvolutionTrace,
  recordM6AgentText,
  recordM6Approval,
  recordM6Completion,
  recordM6ToolCall,
  recordM6ToolResult,
  summarizeM6ConfigSnapshot,
  writeM6EvolutionTrace,
  type M6EvolutionTrace,
} from "./trace.js";

type BackendChoice = "fake" | "opencode";

type RunnerArgs = {
  backend: BackendChoice;
  workspace: string;
  port: number;
  smokeExit: boolean;
};

type WaitOptions = {
  timeoutMs?: number;
  intervalMs?: number;
};

type BaseUrlSource = string | (() => string);

function usage(): string {
  return [
    "usage: bun run examples/m6-real-agent-evolution/run.ts [--backend fake|opencode] [--workspace <dir>] [--port <port>] [--smoke-exit]",
    "",
    "Starts the M6 real backend-agent Knowledge Inbox evolution demo.",
    "--backend     fake for deterministic CI path, opencode for manual real-backend path. Default: fake.",
    "--workspace   Reuse or create a specific app workspace directory.",
    "--port        Port hint for the template server. Use 0 for a random port.",
    "--smoke-exit  Verify the Priority Queue API, stop, and exit.",
  ].join("\n");
}

function parseArgs(argv: string[]): RunnerArgs {
  let backend: BackendChoice = "fake";
  let workspace: string | undefined;
  let port = 0;
  let smokeExit = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--backend") {
      const value = argv[i + 1];
      if (value !== "fake" && value !== "opencode") {
        throw new Error("--backend must be fake or opencode");
      }
      backend = value;
      i += 1;
    } else if (arg === "--workspace") {
      const value = argv[i + 1];
      if (!value) throw new Error("--workspace requires a value");
      workspace = resolve(value);
      i += 1;
    } else if (arg === "--port") {
      const value = argv[i + 1];
      if (!value) throw new Error("--port requires a value");
      if (!/^\d+$/.test(value)) throw new Error("--port must be a number");
      port = Number(value);
      i += 1;
    } else if (arg === "--smoke-exit") {
      smokeExit = true;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  return {
    backend,
    workspace: workspace ?? mkdtempSync(join(tmpdir(), "pneuma-m6-real-agent-")),
    port,
    smokeExit,
  };
}

async function readPriorityQueue(baseUrl: string): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(`${baseUrl}/api/operations/list_priority_queue`);
  if (!response.ok) {
    throw new Error(`list_priority_queue failed with HTTP ${response.status}: ${await response.text()}`);
  }
  const body = (await response.json()) as { rows?: Array<Record<string, unknown>> };
  return body.rows ?? [];
}

async function readRuntimeConfig(baseUrl: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl}/api/config`);
  if (!response.ok) {
    throw new Error(`GET /api/config failed with HTTP ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

export function buildM6LiveAgentPrompt(): string {
  const approvedChanges = priorityCapabilityChanges.map((change) => ({
    require_approval: true,
    ...change,
  }));
  return [
    "You are the Build-phase Agent for a running Pneuma Knowledge Inbox app.",
    "",
    "Builder request:",
    m6BuilderRequest,
    "",
    "This is an execution acceptance task, not a design consultation.",
    "The Builder has already approved this concrete Priority Queue design.",
    "Do not ask design questions. Do not edit files. Do not stop after analysis.",
    "Use the framework semantic tool `definition.apply` from `pneuma_framework`.",
    "",
    "Apply these changes one by one, exactly as JSON inputs:",
    JSON.stringify(approvedChanges, null, 2),
    "",
    "After the final `definition.apply` call succeeds, report that the Priority Queue capability is ready.",
  ].join("\n");
}

export async function waitForPriorityQueueOperationReady(
  baseUrlSource: BaseUrlSource,
  options: WaitOptions = {},
): Promise<Array<Record<string, unknown>>> {
  const timeoutMs = options.timeoutMs ?? 300_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;
  let lastError = "not checked";

  while (Date.now() <= deadline) {
    const baseUrl = typeof baseUrlSource === "function" ? baseUrlSource() : baseUrlSource;
    try {
      return await readPriorityQueue(baseUrl);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(`priority queue operation did not become ready within ${timeoutMs}ms; last error: ${lastError}`);
}

async function waitForShutdown(close: () => Promise<void>): Promise<number> {
  let closing = false;
  const shutdown = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    await close();
  };
  process.on("SIGINT", () => {
    void shutdown().then(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void shutdown().then(() => process.exit(0));
  });
  await new Promise(() => undefined);
  return 0;
}

async function runFake(args: RunnerArgs): Promise<number> {
  const harness = await startM6BackendAgentEvolutionHarness({
    workspace: args.workspace,
    portHint: args.port,
    seedDemoRows: true,
  });

  try {
    process.stdout.write(`M6 Real Backend-Agent Evolution ready: ${harness.baseUrl}\n`);
    process.stdout.write(`scenario: ${harness.baseUrl}/?scenario=real-agent-evolution\n`);
    process.stdout.write(`workspace: ${args.workspace}\n`);
    process.stdout.write("backend: fake\n");
    process.stdout.write(`framework tools: ${harness.agent.seenFrameworkTools.includes("definition.apply") ? "definition.apply" : "missing"}\n`);
    process.stdout.write(`agent tool calls: ${harness.events.filter((event) => event.type === "tool-call").length}\n`);

    const rows = await readPriorityQueue(harness.baseUrl);
    process.stdout.write(`priority queue smoke: ${rows.length} rows\n`);
    if (rows.length !== 3) {
      throw new Error(`expected 3 priority queue rows, got ${rows.length}`);
    }

    if (args.smokeExit) {
      await harness.close();
      return 0;
    }

    process.stdout.write("Press Ctrl+C to stop the demo server.\n");
    return await waitForShutdown(() => harness.close());
  } catch (err) {
    await harness.close();
    throw err;
  }
}

async function runOpencode(args: RunnerArgs): Promise<number> {
  registerOpencodeBackend();
  const factory = getAgentBackendFactory("opencode");
  if (!factory) throw new Error("opencode backend failed to register");

  const model = process.env["OPENCODE_MODEL"] ?? "openrouter/anthropic/claude-opus-4.7";
  const backend: AgentBackend = factory({ defaultModel: model });
  const framework = createPneumaFramework({
    templateDir: resolve(import.meta.dir, "../../templates/knowledge-inbox-core-domain"),
    workspace: args.workspace,
    portHint: args.port,
    backend,
    authorization: {
      appId: "knowledge-inbox-core-domain",
      workspaceId: args.workspace,
    },
  });
  let frameworkToolProxy: FrameworkToolHttpProxy | undefined;
  let trace: M6EvolutionTrace | undefined;

  const close = async (): Promise<void> => {
    frameworkToolProxy?.close();
    await backend.close();
    await framework.close();
  };

  try {
    framework.orchestrator.setPermissionPromptPushHook((env) => {
      process.stdout.write(`[approval] auto-allowing ${env.prompt.tool} ${env.prompt.id}\n`);
      if (trace) {
        const detail = env.prompt.detail as { change?: unknown } | undefined;
        recordM6ToolCall(trace, env.prompt.tool, detail?.change ?? env.prompt.detail);
        recordM6Approval(trace, env.prompt.tool, env.prompt.id);
        writeM6EvolutionTrace(args.workspace, trace);
      }
      queueMicrotask(() => {
        framework.orchestrator.handleFrameworkPermissionResponse(env.prompt.id, "allow");
      });
    });

    const start = await framework.toolRegistry.call("lifecycle.dev.start", {});
    if (!start.ok) throw new Error(`lifecycle.dev.start failed: ${JSON.stringify(start)}`);
    const appUrl = currentBaseUrl(framework);
    frameworkToolProxy = startFrameworkToolHttpProxy(framework.toolRegistry, { port: 0 });
    trace = createM6EvolutionTrace({
      backend: "opencode",
      model,
      appUrl,
      frameworkToolUrl: frameworkToolProxy.url,
      workspace: args.workspace,
      builderRequest: m6BuilderRequest,
      before: summarizeM6ConfigSnapshot(await readRuntimeConfig(appUrl)),
    });
    writeM6EvolutionTrace(args.workspace, trace);

    backend.onEvent((event) => {
      if (event.type === "text") {
        const delta = event.payload.delta;
        const text = event.payload.text;
        if (typeof delta === "string") {
          process.stdout.write(delta);
          if (trace) {
            recordM6AgentText(trace, delta, {
              kind: "delta",
              messageId: String(event.payload.messageID ?? "message"),
              partId: String(event.payload.partId ?? "part"),
            });
            writeM6EvolutionTrace(args.workspace, trace);
          }
        } else if (typeof text === "string") {
          process.stdout.write(`${text}\n`);
          if (trace) {
            const part = event.payload.part as { id?: unknown } | undefined;
            recordM6AgentText(trace, text, {
              kind: "message",
              messageId: String(event.payload.messageID ?? "message"),
              partId: String(part?.id ?? event.payload.partId ?? "part"),
            });
            writeM6EvolutionTrace(args.workspace, trace);
          }
        }
      } else if (event.type === "error") {
        process.stderr.write(`[agent error] ${JSON.stringify(event.payload)}\n`);
      } else if (process.env["DEBUG_EVENTS"]) {
        process.stderr.write(`[event] ${event.type} ${JSON.stringify(event.payload).slice(0, 300)}\n`);
      }
    });

    const session = await backend.launch({
      cwd: args.workspace,
      appUrl,
      frameworkToolUrl: frameworkToolProxy.url,
    });
    framework.annotateBackendSession(session.backendSessionId ?? session.sessionId);

    process.stdout.write(`M6 Real Backend-Agent Evolution ready: ${appUrl}\n`);
    process.stdout.write(`scenario: ${appUrl}/?scenario=real-agent-evolution\n`);
    process.stdout.write(`workspace: ${args.workspace}\n`);
    process.stdout.write("backend: opencode\n");
    process.stdout.write(`model: ${model}\n`);
    process.stdout.write(`framework tool URL: ${frameworkToolProxy.url}\n`);
    const prompt = buildM6LiveAgentPrompt();
    process.stdout.write(`prompt: ${m6BuilderRequest}\n`);
    process.stdout.write("--------------------------------\n");
    await backend.sendUserMessage(session.sessionId, prompt);
    process.stdout.write("\n--------------------------------\n");
    process.stdout.write("Waiting for live opencode completion gate: /api/operations/list_priority_queue\n");
    await waitForPriorityQueueOperationReady(() => currentBaseUrl(framework), {
      timeoutMs: Number(process.env["M6_COMPLETION_TIMEOUT_MS"] ?? 300_000),
      intervalMs: 1_000,
    });
    process.stdout.write("priority queue operation: ready\n");

    const seededBaseUrl = await seedPriorityDemoRows(framework, args.workspace, currentBaseUrl(framework));
    const rows = await readPriorityQueue(seededBaseUrl);
    process.stdout.write(`priority queue smoke: ${rows.length} rows\n`);
    if (rows.length !== 3) {
      throw new Error(`expected 3 priority queue rows, got ${rows.length}`);
    }
    if (trace) {
      for (const entry of trace.workLog.filter((item) => item.kind === "tool_call")) {
        recordM6ToolResult(trace, entry.label, { ok: true, source: "live_completion_gate", call: entry.detail });
      }
      recordM6Completion(trace, {
        after: summarizeM6ConfigSnapshot(await readRuntimeConfig(currentBaseUrl(framework))),
        rows,
      });
      const tracePath = writeM6EvolutionTrace(args.workspace, trace);
      process.stdout.write(`evolution trace: ${tracePath}\n`);
    }
    process.stdout.write("live opencode completion: PASS\n");

    if (args.smokeExit) {
      await close();
      return 0;
    }

    process.stdout.write("Manual opencode run is model-dependent; inspect the app and press Ctrl+C to stop.\n");
    return await waitForShutdown(close);
  } catch (err) {
    await close();
    throw err;
  }
}

function currentBaseUrl(framework: PneumaFramework): string {
  const service = framework.state.dev?.services?.[0]?.url;
  if (!service) throw new Error("M6 runner expected a running Knowledge Inbox service");
  return new URL(service).origin;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.backend === "opencode") return runOpencode(args);
  return runFake(args);
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}
