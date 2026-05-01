#!/usr/bin/env bun

import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DEMO_ITEMS, seedKnowledgeInboxDemo } from "./seed-demo.js";

type RunnerArgs = {
  seed: boolean;
  smokeExit: boolean;
  workspace: string;
  port: string;
};

type TemplateProcess = {
  exitCode: number | null;
  exited: Promise<number>;
  kill(signal?: string): void;
  stdout: ReadableStream<Uint8Array>;
};

function usage(): string {
  return [
    "usage: bun run examples/m4-knowledge-inbox/run.ts [--seed] [--smoke-exit] [--workspace <dir>] [--port <port>]",
    "",
    "Starts the M4 Knowledge Inbox reference app with a real SQLite workspace.",
    "--seed        Insert deterministic demo rows through the public Operation API.",
    "--smoke-exit  Verify the seeded row count, stop the app, and exit.",
    "--workspace   Reuse or create a specific app workspace directory.",
    "--port        Port hint for the template server. Use 0 for a random port.",
  ].join("\n");
}

function parseArgs(argv: string[]): RunnerArgs {
  let seed = false;
  let smokeExit = false;
  let workspace: string | undefined;
  let port = "0";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--seed") {
      seed = true;
    } else if (arg === "--smoke-exit") {
      smokeExit = true;
    } else if (arg === "--workspace") {
      const value = argv[i + 1];
      if (!value) throw new Error("--workspace requires a value");
      workspace = resolve(value);
      i += 1;
    } else if (arg === "--port") {
      const value = argv[i + 1];
      if (!value) throw new Error("--port requires a value");
      if (!/^\d+$/.test(value)) throw new Error("--port must be a number");
      port = value;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  if (smokeExit && !seed) {
    seed = true;
  }
  return {
    seed,
    smokeExit,
    workspace: workspace ?? mkdtempSync(join(tmpdir(), "pneuma-m4-knowledge-inbox-")),
    port,
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function readRows(baseUrl: string): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(`${baseUrl}/api/operations/list_inbox_items`);
  if (!response.ok) {
    throw new Error(`list_inbox_items failed with HTTP ${response.status}: ${await response.text()}`);
  }
  const body = (await response.json()) as { rows?: Array<Record<string, unknown>> };
  return body.rows ?? [];
}

async function stopProcess(proc: TemplateProcess): Promise<void> {
  if (proc.exitCode !== null) return;
  proc.kill("SIGTERM");
  const exited = proc.exited.then(() => undefined);
  await Promise.race([exited, wait(3_000)]);
  if (proc.exitCode === null) {
    proc.kill("SIGKILL");
    await proc.exited;
  }
}

async function waitForReady(proc: TemplateProcess): Promise<{ baseUrl: string; stdoutDone: Promise<void> }> {
  let output = "";
  let settled = false;

  let resolveReady!: (value: string) => void;
  let rejectReady!: (reason: Error) => void;
  const ready = new Promise<string>((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise;
    rejectReady = rejectPromise;
  });

  const stdoutDone = (async () => {
    const decoder = new TextDecoder();
    const reader = proc.stdout.getReader();
    let buffer = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const text = decoder.decode(chunk.value, { stream: true });
      output += text;
      buffer += text;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const match = line.match(/^##pneuma:service-ready api (.+)$/);
        if (match && !settled) {
          settled = true;
          resolveReady(match[1]);
        }
      }
    }
  })();

  const exitBeforeReady = proc.exited.then((code) => {
    if (!settled) {
      settled = true;
      rejectReady(new Error(`template server exited before ready with code ${code}\n${output}`));
    }
  });

  const timeout = wait(10_000).then(() => {
    if (!settled) {
      settled = true;
      rejectReady(new Error(`timed out waiting for template server readiness\n${output}`));
    }
  });

  await Promise.race([ready, exitBeforeReady, timeout]);
  return { baseUrl: await ready, stdoutDone };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const templateDir = resolve(import.meta.dir, "../../templates/knowledge-inbox-core-domain");
  const appEntry = join(templateDir, "server", "app.ts");
  const dataDir = join(args.workspace, "data");
  const sqlitePath = join(dataDir, "app.db");

  if (!existsSync(appEntry)) throw new Error(`template entry not found: ${appEntry}`);
  mkdirSync(dataDir, { recursive: true });

  const proc = Bun.spawn({
    cmd: ["bun", "run", appEntry],
    cwd: templateDir,
    stdout: "pipe",
    stderr: "inherit",
    env: {
      ...process.env,
      PNEUMA_WORKSPACE: args.workspace,
      PNEUMA_DATA_DIR: dataDir,
      PNEUMA_SQLITE_PATH: sqlitePath,
      PNEUMA_PORT_HINT: args.port,
    },
  });

  const { baseUrl, stdoutDone } = await waitForReady(proc);
  process.stdout.write(`Knowledge Inbox ready: ${baseUrl}\n`);
  process.stdout.write(`workspace: ${args.workspace}\n`);
  process.stdout.write(`sqlite: ${sqlitePath}\n`);

  try {
    if (args.seed) {
      const result = await seedKnowledgeInboxDemo({ baseUrl });
      process.stdout.write(
        `seeded: captured=${result.captured} updated=${result.updated} existing=${result.existing}\n`
      );
    }

    if (args.smokeExit) {
      const rows = await readRows(baseUrl);
      if (rows.length < DEMO_ITEMS.length) {
        throw new Error(`expected at least ${DEMO_ITEMS.length} rows, got ${rows.length}`);
      }
      process.stdout.write(`smoke verification: ${rows.length} rows\n`);
      await stopProcess(proc);
      await stdoutDone;
      return 0;
    }

    process.stdout.write("Press Ctrl+C to stop the demo server.\n");
    const shutdown = (): void => {
      void stopProcess(proc);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return await proc.exited;
  } catch (err) {
    await stopProcess(proc);
    await stdoutDone;
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
