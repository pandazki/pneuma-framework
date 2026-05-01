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
  startM6BackendAgentEvolutionHarness,
  type M6BackendAgentEvolutionHarness,
} from "./backend-harness.js";

type BackendChoice = "fake" | "opencode";

type RunnerArgs = {
  backend: BackendChoice;
  workspace: string;
  port: number;
  smokeExit: boolean;
};

function usage(): string {
  return [
    "usage: bun run examples/m6-real-agent-evolution/run.ts [--backend fake|opencode] [--workspace <dir>] [--port <port>] [--smoke-exit]",
    "",
    "Starts the M6 real backend-agent Knowledge Inbox evolution demo.",
    "--backend     fake for deterministic CI path, opencode for manual real-backend path. Default: fake.",
    "--workspace   Reuse or create a specific app workspace directory.",
    "--port        Port hint for the template server. Use 0 for a random port.",
    "--smoke-exit  Verify the deterministic Priority Queue API, stop, and exit.",
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

  const close = async (): Promise<void> => {
    frameworkToolProxy?.close();
    await backend.close();
    await framework.close();
  };

  try {
    framework.orchestrator.setPermissionPromptPushHook((env) => {
      process.stdout.write(`[approval] auto-allowing ${env.prompt.tool} ${env.prompt.id}\n`);
      queueMicrotask(() => {
        framework.orchestrator.handleFrameworkPermissionResponse(env.prompt.id, "allow");
      });
    });

    const start = await framework.toolRegistry.call("lifecycle.dev.start", {});
    if (!start.ok) throw new Error(`lifecycle.dev.start failed: ${JSON.stringify(start)}`);
    const appUrl = currentBaseUrl(framework);
    frameworkToolProxy = startFrameworkToolHttpProxy(framework.toolRegistry, { port: 0 });

    backend.onEvent((event) => {
      if (event.type === "text") {
        const delta = event.payload.delta;
        const text = event.payload.text;
        if (typeof delta === "string") process.stdout.write(delta);
        else if (typeof text === "string") process.stdout.write(`${text}\n`);
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
    process.stdout.write(`prompt: ${m6BuilderRequest}\n`);
    process.stdout.write("--------------------------------\n");
    await backend.sendUserMessage(session.sessionId, m6BuilderRequest);
    process.stdout.write("\n--------------------------------\n");

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
