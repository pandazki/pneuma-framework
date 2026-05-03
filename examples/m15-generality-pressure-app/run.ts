#!/usr/bin/env bun

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startM15GeneralityHostServer } from "./host-server.js";

interface RunArgs {
  readonly workspace: string;
  readonly port: number;
  readonly smokeExit: boolean;
}

function usage(): string {
  return [
    "usage: bun run examples/m15-generality-pressure-app/run.ts [--workspace <dir>] [--port <port>] [--smoke-exit]",
    "",
    "Starts the M15 Generality Pressure Host.",
    "--workspace   Reuse or create a specific host workspace directory.",
    "--port        Host port. Use 0 for a random port.",
    "--smoke-exit  Create, preview, inspect both demo apps, and exit.",
  ].join("\n");
}

export function parseArgs(argv: string[]): RunArgs {
  let workspace: string | undefined;
  let port = 8882;
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
    workspace: workspace ?? mkdtempSync(join(tmpdir(), "pneuma-m15-generality-")),
    port,
    smokeExit,
  };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const server = await startM15GeneralityHostServer({
    workspace: args.workspace,
    port: args.port,
  });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  process.stdout.write(`M15 Generality Pressure Host ready: ${baseUrl}\n`);
  process.stdout.write(`workspace: ${server.workspace}\n`);

  if (args.smokeExit) {
    try {
      await runSmoke(baseUrl);
      process.stdout.write("smoke verification: passed\n");
      return 0;
    } finally {
      await server.stop();
    }
  }

  process.stdout.write("Press Ctrl+C to stop the host.\n");
  const shutdown = (): void => {
    void server.stop().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await new Promise(() => undefined);
  return 0;
}

async function runSmoke(baseUrl: string): Promise<void> {
  const created = await fetchJson<{ projects: Array<{ app_id: string }> }>(
    `${baseUrl}/api/host/demo/create`,
    { method: "POST" },
  );
  process.stdout.write(`created apps: ${created.projects.map((project) => project.app_id).join(", ")}\n`);

  for (const appId of ["team-knowledge-inbox", "team-decision-log"]) {
    await fetchJson(`${baseUrl}/api/host/projects/${appId}/preview/start`, { method: "POST" });
    const inspection = await fetchJson<{
      inspection: {
        schema: { tables: Array<{ id: string }> };
        operations: Array<{ id: string }>;
      };
    }>(`${baseUrl}/api/host/projects/${appId}/inspect`);
    process.stdout.write(
      `${appId}: tables=${inspection.inspection.schema.tables.map((table) => table.id).join(",")} operations=${inspection.inspection.operations.map((op) => op.id).join(",")}\n`,
    );
  }
}

async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${url} failed with HTTP ${response.status}: ${await response.text()}`);
  }
  return await response.json() as T;
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
