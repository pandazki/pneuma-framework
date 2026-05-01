#!/usr/bin/env bun

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startPriorityEvolutionHarness, type PriorityEvolutionHarness } from "./builder-evolution.js";

type RunnerArgs = {
  workspace: string;
  port: number;
  smokeExit: boolean;
};

function usage(): string {
  return [
    "usage: bun run examples/m5-knowledge-inbox-builder-evolution/run.ts [--workspace <dir>] [--port <port>] [--smoke-exit]",
    "",
    "Starts the M5 Knowledge Inbox Builder evolution demo.",
    "--workspace   Reuse or create a specific app workspace directory.",
    "--port        Port hint for the template server. Use 0 for a random port.",
    "--smoke-exit  Apply the capability, verify the Priority Queue API, stop, and exit.",
  ].join("\n");
}

function parseArgs(argv: string[]): RunnerArgs {
  let workspace: string | undefined;
  let port = 0;
  let smokeExit = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--workspace") {
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
    workspace: workspace ?? mkdtempSync(join(tmpdir(), "pneuma-m5-builder-evolution-")),
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

async function waitForShutdown(harness: PriorityEvolutionHarness): Promise<number> {
  let closing = false;
  const close = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    await harness.close();
  };
  process.on("SIGINT", () => {
    void close().then(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void close().then(() => process.exit(0));
  });
  await new Promise(() => undefined);
  return 0;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const harness = await startPriorityEvolutionHarness({
    workspace: args.workspace,
    portHint: args.port,
    seedDemoRows: true,
  });

  try {
    process.stdout.write(`M5 Knowledge Inbox Builder evolution ready: ${harness.baseUrl}\n`);
    process.stdout.write(`scenario: ${harness.baseUrl}/?scenario=builder-evolution\n`);
    process.stdout.write(`workspace: ${args.workspace}\n`);
    process.stdout.write(`definition changes: ${harness.results.length} applied\n`);

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
    return await waitForShutdown(harness);
  } catch (err) {
    await harness.close();
    throw err;
  }
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
      process.exit(1);
    }
  );
}

