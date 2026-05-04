import { join } from "node:path";
import type {
  CreationHostProfile,
  CreationHostProject,
  CreationHostVersion,
} from "@pneuma-framework/core";
import { seedKnowledgeInboxDemo } from "../m4-knowledge-inbox/seed-demo.js";

export interface M16PreviewRuntimeHandle {
  readonly preview_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly profile_id: string;
  readonly preview_url: string;
  readonly started_at_ms: number;
  readonly status: "running";
  readonly proc: ReturnType<typeof Bun.spawn>;
  readonly wait_until_exit: Promise<number>;
  readonly logs: string[];
}

export interface M16PreviewInspection {
  readonly schema: {
    readonly tables: readonly Record<string, unknown>[];
    readonly views: readonly Record<string, unknown>[];
    readonly policy_rules: readonly Record<string, unknown>[];
  };
  readonly operations: readonly Record<string, unknown>[];
  readonly data: Readonly<Record<string, readonly Record<string, unknown>[]>>;
  readonly logs: readonly string[];
}

export async function startM16PreviewRuntime(input: {
  readonly project: CreationHostProject;
  readonly version: CreationHostVersion;
  readonly profile: CreationHostProfile;
  readonly port: number;
}): Promise<M16PreviewRuntimeHandle> {
  const appEntry = join(input.profile.template_dir, "server", "app.ts");
  const logs: string[] = [];
  const proc = Bun.spawn({
    cmd: ["bun", "run", appEntry],
    cwd: input.profile.template_dir,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      PNEUMA_WORKSPACE: input.version.app_workspace_dir,
      PNEUMA_DATA_DIR: join(input.version.app_workspace_dir, "data"),
      PNEUMA_SQLITE_PATH: input.version.sqlite_path,
      PNEUMA_PORT_HINT: String(input.port),
    },
  });
  const waitUntilExit = proc.exited;

  try {
    const previewUrl = await waitForServiceReady(proc, logs);
    consumeStream(proc.stderr, logs, "stderr");
    await seedDemoData(input.profile, previewUrl, logs);
    return {
      preview_id: `${input.project.app_id}:${input.version.version_id}`,
      app_id: input.project.app_id,
      version_id: input.version.version_id,
      profile_id: input.version.profile_id,
      preview_url: previewUrl,
      started_at_ms: Date.now(),
      status: "running",
      proc,
      wait_until_exit: waitUntilExit,
      logs,
    };
  } catch (err) {
    await stopM16PreviewRuntime({ proc, wait_until_exit: waitUntilExit } as M16PreviewRuntimeHandle);
    throw err;
  }
}

export async function stopM16PreviewRuntime(preview: M16PreviewRuntimeHandle): Promise<void> {
  if (preview.proc.exitCode !== null) return;
  preview.proc.kill("SIGTERM");
  await Promise.race([preview.wait_until_exit, wait(3_000)]);
  if (preview.proc.exitCode === null) {
    preview.proc.kill("SIGKILL");
    await preview.wait_until_exit;
  }
}

export async function inspectM16PreviewRuntime(
  preview: M16PreviewRuntimeHandle,
  profile: CreationHostProfile,
): Promise<M16PreviewInspection> {
  const configResponse = await fetch(`${preview.preview_url}/api/config`, {
    headers: builderHeaders(),
  });
  if (!configResponse.ok) {
    throw new Error(`GET /api/config failed with HTTP ${configResponse.status}: ${await configResponse.text()}`);
  }
  const config = (await configResponse.json()) as {
    tables?: Record<string, unknown>[];
    operations?: Record<string, unknown>[];
    views?: Record<string, unknown>[];
    policy_rules?: Record<string, unknown>[];
  };

  const rowsResponse = await fetch(`${preview.preview_url}/api/operations/${profile.read_operation_id}`, {
    headers: builderHeaders(),
  });
  if (!rowsResponse.ok) {
    throw new Error(
      `GET /api/operations/${profile.read_operation_id} failed with HTTP ${rowsResponse.status}: ${await rowsResponse.text()}`,
    );
  }
  const rowsBody = (await rowsResponse.json()) as { rows?: Record<string, unknown>[] };

  return {
    schema: {
      tables: config.tables ?? [],
      views: config.views ?? [],
      policy_rules: config.policy_rules ?? [],
    },
    operations: config.operations ?? [],
    data: {
      [profile.data_table_id]: rowsBody.rows ?? [],
    },
    logs: [...preview.logs],
  };
}

async function seedDemoData(
  profile: CreationHostProfile,
  previewUrl: string,
  logs: string[],
): Promise<void> {
  if (profile.id === "knowledge-inbox-bun-sqlite") {
    const seedResult = await seedKnowledgeInboxDemo({ baseUrl: previewUrl });
    logs.push(
      `seeded knowledge inbox: captured=${seedResult.captured} updated=${seedResult.updated} existing=${seedResult.existing}`,
    );
    return;
  }

  const rows = [
    {
      title: "Choose SQLite for the local prototype",
      context: "M3 substrate tradeoff",
      decision: "Use SQLite with a mounted data directory until production pressure demands Postgres.",
      owner_user_id: "builder-alice",
      status: "accepted",
    },
    {
      title: "Keep semantic vectors derived",
      context: "M10 semantic index",
      decision: "Do not add embedding columns to business tables; rebuild semantic_index_entries.",
      owner_user_id: "builder-alice",
      status: "accepted",
    },
    {
      title: "Integrate the Creation Host path",
      context: "M16 integration gate",
      decision: "Unify create, inspect, evolve, publish, restart, and rollback before RC.",
      owner_user_id: "builder-alice",
      status: "open",
    },
  ];

  for (const row of rows) {
    const response = await fetch(`${previewUrl}/api/operations/record_decision`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...builderHeaders(),
      },
      body: JSON.stringify({ input: row }),
    });
    if (!response.ok) {
      throw new Error(`seed record_decision failed with HTTP ${response.status}: ${await response.text()}`);
    }
  }
  logs.push(`seeded team decision log: decisions=${rows.length}`);
}

async function waitForServiceReady(proc: ReturnType<typeof Bun.spawn>, logs: string[]): Promise<string> {
  const decoder = new TextDecoder();
  const reader = proc.stdout.getReader();
  let buffer = "";
  let settled = false;

  return await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`timed out waiting for preview readiness\n${logs.join("\n")}`));
      }
    }, 10_000);

    proc.exited.then((code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`preview exited before ready with code ${code}\n${logs.join("\n")}`));
      }
    });

    void (async () => {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          logs.push(line);
          const match = line.match(/^##pneuma:service-ready api (.+)$/);
          if (match && !settled) {
            settled = true;
            clearTimeout(timeout);
            resolve(match[1]);
          }
        }
      }
    })().catch((err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  });
}

function consumeStream(stream: ReadableStream<Uint8Array>, logs: string[], label: string): void {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = "";
  void (async () => {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line) logs.push(`${label}: ${line}`);
      }
    }
  })();
}

function builderHeaders(): Record<string, string> {
  return { "x-pneuma-user-id": "builder-alice" };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
