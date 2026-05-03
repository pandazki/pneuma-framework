#!/usr/bin/env bun

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startM14HostPublishRolloutServer } from "./host-server.js";

interface RunArgs {
  readonly workspace: string;
  readonly port: number;
  readonly smokeExit: boolean;
}

function usage(): string {
  return [
    "usage: bun run examples/m14-host-publish-rollout/run.ts [--workspace <dir>] [--port <port>] [--smoke-exit]",
    "",
    "Starts the M14 Host Publish Rollout workbench.",
    "--workspace   Reuse or create a specific host workspace directory.",
    "--port        Host port. Use 0 for a random port.",
    "--smoke-exit  Create demo versions, publish v0/v1, restart active, rollback, and exit.",
  ].join("\n");
}

export function parseArgs(argv: string[]): RunArgs {
  let workspace: string | undefined;
  let port = 8881;
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
    workspace: workspace ?? mkdtempSync(join(tmpdir(), "pneuma-m14-host-publish-")),
    port,
    smokeExit,
  };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const server = await startM14HostPublishRolloutServer({
    workspace: args.workspace,
    port: args.port,
  });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  process.stdout.write(`M14 Host Publish Rollout ready: ${baseUrl}\n`);
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
  const created = await fetchJson<{ versions: Array<{ version_id: string }> }>(
    `${baseUrl}/api/host/demo/create`,
    { method: "POST" },
  );
  const versionIds = created.versions.map((version) => version.version_id);
  if (versionIds.join(",") !== "v0,v1") throw new Error(`expected v0/v1 versions, got ${versionIds.join(",")}`);
  process.stdout.write(`created demo versions: ${versionIds.join(", ")}\n`);

  const v0 = await fetchJson<{ summary: { active_candidate_id: string } }>(
    `${baseUrl}/api/host/projects/team-knowledge-inbox/publish`,
    { method: "POST", body: JSON.stringify({ version_id: "v0" }) },
  );
  if (v0.summary.active_candidate_id !== "team-knowledge-inbox-v0") {
    throw new Error(`expected active v0, got ${v0.summary.active_candidate_id}`);
  }
  process.stdout.write(`publish v0: active ${v0.summary.active_candidate_id}\n`);

  const v1 = await fetchJson<{ summary: { active_candidate_id: string; previous_candidate_id?: string } }>(
    `${baseUrl}/api/host/projects/team-knowledge-inbox/publish`,
    { method: "POST", body: JSON.stringify({ version_id: "v1" }) },
  );
  if (v1.summary.active_candidate_id !== "team-knowledge-inbox-v1") {
    throw new Error(`expected active v1, got ${v1.summary.active_candidate_id}`);
  }
  if (v1.summary.previous_candidate_id !== "team-knowledge-inbox-v0") {
    throw new Error(`expected previous v0, got ${v1.summary.previous_candidate_id ?? "none"}`);
  }
  process.stdout.write(
    `publish v1: active ${v1.summary.active_candidate_id} previous ${v1.summary.previous_candidate_id}\n`,
  );

  const restarted = await fetchJson<{ health: { ok: boolean }; summary: { active_candidate_id: string } }>(
    `${baseUrl}/api/host/projects/team-knowledge-inbox/restart-active`,
    { method: "POST" },
  );
  if (restarted.summary.active_candidate_id !== "team-knowledge-inbox-v1") {
    throw new Error(`expected restart to keep active v1, got ${restarted.summary.active_candidate_id}`);
  }
  if (!restarted.health.ok) throw new Error("restart health check failed");
  process.stdout.write("restart active: healthy\n");

  const rolledBack = await fetchJson<{ summary: { active_candidate_id: string; previous_candidate_id?: string } }>(
    `${baseUrl}/api/host/projects/team-knowledge-inbox/rollback`,
    { method: "POST" },
  );
  if (rolledBack.summary.active_candidate_id !== "team-knowledge-inbox-v0") {
    throw new Error(`expected rollback active v0, got ${rolledBack.summary.active_candidate_id}`);
  }
  if (rolledBack.summary.previous_candidate_id !== "team-knowledge-inbox-v1") {
    throw new Error(`expected rollback previous v1, got ${rolledBack.summary.previous_candidate_id ?? "none"}`);
  }
  process.stdout.write(`rollback: active ${rolledBack.summary.active_candidate_id}\n`);
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
