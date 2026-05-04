#!/usr/bin/env bun

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startM16ReferenceCreationHostServer } from "./host-server.js";

interface RunArgs {
  readonly workspace: string;
  readonly port: number;
  readonly smokeExit: boolean;
}

function usage(): string {
  return [
    "usage: bun run examples/m16-reference-creation-host/run.ts [--workspace <dir>] [--port <port>] [--smoke-exit]",
    "",
    "Starts the M16 integrated Reference Creation Host.",
  ].join("\n");
}

export function parseArgs(argv: string[]): RunArgs {
  let workspace: string | undefined;
  let port = 8883;
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
    workspace: workspace ?? mkdtempSync(join(tmpdir(), "pneuma-m16-reference-host-")),
    port,
    smokeExit,
  };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const server = await startM16ReferenceCreationHostServer({
    workspace: args.workspace,
    port: args.port,
  });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  process.stdout.write(`M16 Reference Creation Host ready: ${baseUrl}\n`);
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
  await createProject(baseUrl, "team-knowledge-inbox", "Team Knowledge Inbox", "knowledge-inbox-bun-sqlite");
  await fetchJson(`${baseUrl}/api/host/projects/team-knowledge-inbox/preview/start`, { method: "POST" });
  const inspected = await fetchJson<{ inspection: { data: { inbox_items?: unknown[] } } }>(
    `${baseUrl}/api/host/projects/team-knowledge-inbox/inspect`,
  );
  if (inspected.inspection.data.inbox_items?.length !== 3) throw new Error("expected 3 Knowledge Inbox rows");
  process.stdout.write("knowledge inbox preview + inspect: passed\n");

  const v0 = await publish(baseUrl, "team-knowledge-inbox", "v0");
  process.stdout.write(`publish v0: active ${v0.summary.active_candidate_id}\n`);

  const evolution = await fetchJson<{ evolution: { status: string; version_id: string } }>(
    `${baseUrl}/api/host/projects/team-knowledge-inbox/evolution/start`,
    {
      method: "POST",
      body: JSON.stringify({
        builder_user_id: "builder-alice",
        builder_request: "Add a Priority Queue for urgent inbox items.",
      }),
    },
  );
  if (evolution.evolution.status !== "awaiting_approval") {
    throw new Error(`expected awaiting approval, got ${evolution.evolution.status}`);
  }
  process.stdout.write(`evolution proposal: ${evolution.evolution.version_id} awaiting approval\n`);

  const approved = await fetchJson<{ priority_rows: unknown[] }>(
    `${baseUrl}/api/host/projects/team-knowledge-inbox/evolution/approve`,
    { method: "POST" },
  );
  if (approved.priority_rows.length !== 3) throw new Error(`expected 3 priority rows, got ${approved.priority_rows.length}`);
  process.stdout.write("evolution approval: completed with 3 priority rows\n");

  const v1 = await publish(baseUrl, "team-knowledge-inbox", "v1");
  process.stdout.write(`publish v1: active ${v1.summary.active_candidate_id} previous ${v1.summary.previous_candidate_id}\n`);
  const restarted = await fetchJson<{ health: { ok: boolean } }>(
    `${baseUrl}/api/host/projects/team-knowledge-inbox/restart-active`,
    { method: "POST" },
  );
  if (!restarted.health.ok) throw new Error("restart health check failed");
  process.stdout.write("restart active: healthy\n");
  const rolledBack = await fetchJson<{ summary: { active_candidate_id: string } }>(
    `${baseUrl}/api/host/projects/team-knowledge-inbox/rollback`,
    { method: "POST" },
  );
  process.stdout.write(`rollback: active ${rolledBack.summary.active_candidate_id}\n`);

  await createProject(baseUrl, "team-decision-log", "Team Decision Log", "team-decision-log-bun-sqlite");
  await fetchJson(`${baseUrl}/api/host/projects/team-decision-log/preview/start`, { method: "POST" });
  const decisions = await fetchJson<{ inspection: { data: { decisions?: unknown[] } } }>(
    `${baseUrl}/api/host/projects/team-decision-log/inspect`,
  );
  if (decisions.inspection.data.decisions?.length !== 3) throw new Error("expected 3 decision rows");
  process.stdout.write("team decision log preview + inspect: passed\n");
}

async function createProject(
  baseUrl: string,
  appId: string,
  displayName: string,
  profileId: string,
): Promise<void> {
  await fetchJson(`${baseUrl}/api/host/projects`, {
    method: "POST",
    body: JSON.stringify({
      app_id: appId,
      display_name: displayName,
      profile_id: profileId,
    }),
  });
  process.stdout.write(`created generated app: ${appId}\n`);
}

async function publish(
  baseUrl: string,
  appId: string,
  versionId: string,
): Promise<{ summary: { active_candidate_id: string; previous_candidate_id?: string } }> {
  return await fetchJson(`${baseUrl}/api/host/projects/${appId}/publish`, {
    method: "POST",
    body: JSON.stringify({ version_id: versionId }),
  });
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
