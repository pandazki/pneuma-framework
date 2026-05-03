import { join } from "node:path";
import { seedKnowledgeInboxDemo } from "../m4-knowledge-inbox/seed-demo.js";
import { getM15StackProfile } from "./profiles.js";
import type {
  M15GeneratedAppProject,
  M15GeneratedAppVersion,
  M15PreviewInspection,
  M15PreviewRuntimeHandle,
} from "./types.js";

export interface StartM15PreviewRuntimeInput {
  readonly project: M15GeneratedAppProject;
  readonly version: M15GeneratedAppVersion;
  readonly port: number;
  readonly now?: () => number;
}

export async function startM15PreviewRuntime(
  input: StartM15PreviewRuntimeInput,
): Promise<M15PreviewRuntimeHandle> {
  const profile = getM15StackProfile(input.version.profile_id);
  const appEntry = join(profile.template_dir, "server", "app.ts");
  const logs: string[] = [];
  const proc = Bun.spawn({
    cmd: ["bun", "run", appEntry],
    cwd: profile.template_dir,
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
    await seedDemoData(input.version.profile_id, previewUrl, logs);
    return {
      preview_id: `${input.project.app_id}:${input.version.version_id}`,
      app_id: input.project.app_id,
      version_id: input.version.version_id,
      profile_id: input.version.profile_id,
      preview_url: previewUrl,
      started_at_ms: input.now?.() ?? Date.now(),
      status: "running",
      proc,
      logs,
      wait_until_exit: waitUntilExit,
    };
  } catch (err) {
    await stopPreviewProcess(proc, waitUntilExit);
    throw err;
  }
}

export async function stopM15PreviewRuntime(preview: M15PreviewRuntimeHandle): Promise<void> {
  await stopPreviewProcess(preview.proc, preview.wait_until_exit);
}

export async function inspectM15PreviewRuntime(preview: M15PreviewRuntimeHandle): Promise<M15PreviewInspection> {
  const profile = getM15StackProfile(preview.profile_id);
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
  profileId: M15GeneratedAppVersion["profile_id"],
  previewUrl: string,
  logs: string[],
): Promise<void> {
  if (profileId === "knowledge-inbox-bun-sqlite") {
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
      title: "Pressure-test a second app shape",
      context: "M15 generality gate",
      decision: "Use Team Decision Log to prove the Host is not Knowledge Inbox-specific.",
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
        const text = decoder.decode(chunk.value, { stream: true });
        buffer += text;
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

async function stopPreviewProcess(proc: ReturnType<typeof Bun.spawn>, exited: Promise<number>): Promise<void> {
  if (proc.exitCode !== null) return;
  proc.kill("SIGTERM");
  await Promise.race([exited, wait(3_000)]);
  if (proc.exitCode === null) {
    proc.kill("SIGKILL");
    await exited;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function builderHeaders(): Record<string, string> {
  return { "x-pneuma-user-id": "builder-alice" };
}
