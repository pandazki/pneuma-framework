#!/usr/bin/env bun

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  startM13HostAgentEvolutionServer,
} from "./host-server.js";
import type {
  M13AutoDecision,
  M13BackendChoice,
} from "./host-evolution.js";

interface RunArgs {
  readonly workspace: string;
  readonly port: number;
  readonly backend: M13BackendChoice;
  readonly autoDecision: M13AutoDecision;
  readonly smokeExit: boolean;
}

function usage(): string {
  return [
    "usage: bun run examples/m13-host-agent-evolution/run.ts [--backend fake|opencode] [--auto-decision allow|deny|none] [--workspace <dir>] [--port <port>] [--smoke-exit]",
    "",
    "Starts the M13 Host Agent Evolution demo.",
    "--backend        fake for deterministic CI path, opencode for manual real-backend path. Default: fake.",
    "--auto-decision  allow/deny for deterministic smoke mode, none for live browser approval. Default: none.",
    "--workspace      Reuse or create a specific host workspace directory.",
    "--port           Host port. Use 0 for a random port.",
    "--smoke-exit     Create one generated app, evolve it, verify Priority Queue, and exit.",
  ].join("\n");
}

export function parseArgs(argv: string[]): RunArgs {
  let workspace: string | undefined;
  let port = 8880;
  let backend: M13BackendChoice = "fake";
  let autoDecision: M13AutoDecision = "none";
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
    } else if (arg === "--backend") {
      const value = argv[i + 1];
      if (value !== "fake" && value !== "opencode") throw new Error("--backend must be fake or opencode");
      backend = value;
      i += 1;
    } else if (arg === "--auto-decision") {
      const value = argv[i + 1];
      if (value !== "allow" && value !== "deny" && value !== "none") {
        throw new Error("--auto-decision must be allow, deny, or none");
      }
      autoDecision = value;
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
    workspace: workspace ?? mkdtempSync(join(tmpdir(), "pneuma-m13-host-evolution-")),
    port,
    backend,
    autoDecision,
    smokeExit,
  };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const server = await startM13HostAgentEvolutionServer({
    workspace: args.workspace,
    port: args.port,
    backend: args.backend,
    autoDecision: args.autoDecision,
  });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  process.stdout.write(`M13 Host Agent Evolution ready: ${baseUrl}\n`);
  process.stdout.write(`workspace: ${server.workspace}\n`);
  process.stdout.write(`backend: ${args.backend}\n`);
  process.stdout.write(`auto-decision: ${args.autoDecision}\n`);

  if (args.smokeExit) {
    try {
      await runSmoke(baseUrl, args.autoDecision);
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

async function runSmoke(baseUrl: string, autoDecision: M13AutoDecision): Promise<void> {
  const created = await fetchJson<{
    project: { app_id: string; current_version_id: string };
  }>(`${baseUrl}/api/host/projects`, {
    method: "POST",
    body: JSON.stringify({
      app_id: "team-knowledge-inbox",
      display_name: "Team Knowledge Inbox",
      profile_id: "knowledge-inbox-bun-sqlite",
      builder_user_id: "builder-alice",
      builder_request: "Create a shared inbox for team knowledge.",
    }),
  });
  process.stdout.write(`created generated app: ${created.project.app_id}@${created.project.current_version_id}\n`);

  await fetchJson(`${baseUrl}/api/host/projects/team-knowledge-inbox/preview/start`, {
    method: "POST",
    body: JSON.stringify({ version_id: "v0" }),
  });
  process.stdout.write("preview: running\n");

  const started = await fetchJson<{ status: string }>(
    `${baseUrl}/api/host/projects/team-knowledge-inbox/evolution/start`,
    {
      method: "POST",
      body: JSON.stringify({
        builder_user_id: "builder-alice",
        builder_request: "Add a Priority Queue for urgent inbox items.",
      }),
    },
  );

  let finalStatus = started.status;
  if (started.status === "awaiting_approval") {
    if (autoDecision === "deny") {
      finalStatus = (await fetchJson<{ status: string }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/evolution/deny`,
        { method: "POST" },
      )).status;
    } else {
      finalStatus = (await fetchJson<{ status: string }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/evolution/approve`,
        { method: "POST" },
      )).status;
    }
  }
  process.stdout.write(`evolution: ${finalStatus}\n`);

  if (finalStatus === "denied") {
    const response = await fetch(`${baseUrl}/api/host/projects/team-knowledge-inbox/priority-queue`);
    if (response.ok) throw new Error("denied smoke unexpectedly exposed priority queue");
    process.stdout.write("priority queue smoke: denied path left operation absent\n");
    return;
  }

  const queue = await fetchJson<{ rows: Array<Record<string, unknown>> }>(
    `${baseUrl}/api/host/projects/team-knowledge-inbox/priority-queue`,
  );
  if (queue.rows.length !== 3) throw new Error(`expected 3 priority queue rows, got ${queue.rows.length}`);
  process.stdout.write(`priority queue smoke: ${queue.rows.length} rows\n`);
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
  return (await response.json()) as T;
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
