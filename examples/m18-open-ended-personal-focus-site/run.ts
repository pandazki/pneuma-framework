#!/usr/bin/env bun

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startM18PersonalFocusHostServer } from "./host-server.js";

export interface RunArgs {
  readonly workspace: string;
  readonly port: number;
  readonly smokeExit: boolean;
}

function usage(): string {
  return [
    "usage: bun run examples/m18-open-ended-personal-focus-site/run.ts [--workspace <dir>] [--port <port>] [--smoke-exit]",
    "",
    "Starts the M18 Personal Focus Site Creation Host.",
  ].join("\n");
}

export function parseArgs(argv: string[]): RunArgs {
  let workspace: string | undefined;
  let port = 8884;
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
    workspace: workspace ?? mkdtempSync(join(tmpdir(), "pneuma-m18-focus-host-")),
    port,
    smokeExit,
  };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const server = await startM18PersonalFocusHostServer({
    workspace: args.workspace,
    port: args.port,
  });
  const baseUrl = `http://127.0.0.1:${server.port}`;
  process.stdout.write(`M18 Personal Focus Site Creation Host ready: ${baseUrl}\n`);
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
  await post(`${baseUrl}/api/host/projects`, {
    app_id: "pandazki-focus-site",
    display_name: "Pandazki Focus Site",
    profile_id: "personal-focus-site-bun-sqlite",
  });
  process.stdout.write("created generated app: pandazki-focus-site\n");

  const preview = await post<{ preview: { preview_url: string } }>(
    `${baseUrl}/api/host/projects/pandazki-focus-site/preview/start`,
    {},
  );
  const site = await get<{
    site_definition: { version: string };
    github_attention: { ranked: unknown[] };
  }>(`${preview.preview.preview_url}/api/site`);
  if (site.site_definition.version !== "v0") throw new Error("expected v0 site definition");
  if (site.github_attention.ranked.length !== 3) throw new Error("expected 3 ranked GitHub attention items");
  process.stdout.write("preview + GitHub attention: passed\n");

  const inspection = await get<{
    inspection: { ui_definition: { summary: { primary_shape: string } } };
  }>(`${baseUrl}/api/host/projects/pandazki-focus-site/inspect`);
  if (inspection.inspection.ui_definition.summary.primary_shape !== "open-ended-site") {
    throw new Error("expected open-ended-site inspection");
  }
  process.stdout.write("inspect UI definition: passed\n");

  const evolution = await post<{ evolution: { status: string } }>(
    `${baseUrl}/api/host/projects/pandazki-focus-site/evolution/start`,
    {
      builder_user_id: "builder-alice",
      builder_request: "Make GitHub attention more useful and highlight the top 3 things I should handle.",
    },
  );
  if (evolution.evolution.status !== "awaiting_approval") throw new Error("expected awaiting approval");
  process.stdout.write("evolution proposal: awaiting approval\n");

  const approved = await post<{ site: { site_definition: { version: string } } }>(
    `${baseUrl}/api/host/projects/pandazki-focus-site/evolution/approve`,
    {},
  );
  if (approved.site.site_definition.version !== "v1") throw new Error("expected v1 after approval");
  process.stdout.write("evolution approval: completed\n");

  const v0 = await publish(baseUrl, "v0");
  process.stdout.write(`publish v0: active ${v0.summary.active_candidate_id}\n`);
  const v1 = await publish(baseUrl, "v1");
  process.stdout.write(`publish v1: active ${v1.summary.active_candidate_id} previous ${v1.summary.previous_candidate_id}\n`);

  const restarted = await post<{ health: { ok: boolean } }>(
    `${baseUrl}/api/host/projects/pandazki-focus-site/restart-active`,
    {},
  );
  if (!restarted.health.ok) throw new Error("restart health check failed");
  process.stdout.write("restart active: healthy\n");

  const rolledBack = await post<{ summary: { active_candidate_id: string } }>(
    `${baseUrl}/api/host/projects/pandazki-focus-site/rollback`,
    {},
  );
  process.stdout.write(`rollback: active ${rolledBack.summary.active_candidate_id}\n`);
}

async function publish(
  baseUrl: string,
  versionId: string,
): Promise<{ summary: { active_candidate_id: string; previous_candidate_id?: string } }> {
  return await post(`${baseUrl}/api/host/projects/pandazki-focus-site/publish`, {
    version_id: versionId,
  });
}

async function get<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} failed with HTTP ${response.status}: ${await response.text()}`);
  return await response.json() as T;
}

async function post<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`POST ${url} failed with HTTP ${response.status}: ${await response.text()}`);
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
