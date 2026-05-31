# M12 Reference Creation Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first reference Creation Host substrate: a Builder-facing host can create a Generated Application project, start a preview, inspect schema/data/logs, and show the generated app as an app rather than as a primitive demo.

**Architecture:** Keep M12 example-local. The host owns generated-app identity, stack profile choice, version directories, preview child-process lifecycle, inspection endpoints, and the Builder-facing web workbench. It reuses the existing Knowledge Inbox runtime as the first stack profile, but the host model must stay separate from the generated app model.

**Tech Stack:** Bun TypeScript, Bun tests, `@pneuma-framework/runtime`, existing Knowledge Inbox template, JSON host state, version directories, child-process preview, static HTML/CSS/JS for the reference host UI.

---

## Boundary

M12 proves this flow:

```text
Developer runs Reference Creation Host
  -> Builder creates a Generated Application from a declared stack profile
  -> Host creates app identity + v0 version directory
  -> Host starts a preview runtime for that version
  -> Builder inspects schema, data, operations, and logs from the host
  -> Builder sees the generated app preview and the host workbench side by side
```

M12 does not include a real backend-agent session, governed evolution, publish, monitor, rollback, second app domain, or release-candidate snapshot. Those are M13-M16.

The critical modeling rule:

```text
pneuma-framework -> Creation Host -> Generated Application -> Published Application
```

Do not add host-level concepts to `packages/core` in M12. Promote them only after a second host/example needs the same semantics.

## File Structure

- Create `examples/m12-reference-creation-host/package.json`  
  Workspace package metadata and scripts for the example.
- Create `examples/m12-reference-creation-host/README.md`  
  Zero-context explanation of how to run the host and what M12 proves.
- Create `examples/m12-reference-creation-host/types.ts`  
  Example-local types for generated app identity, stack profile, versions, sessions, previews, and inspection.
- Create `examples/m12-reference-creation-host/profiles.ts`  
  Declares `knowledge-inbox-bun-sqlite` as the first stack profile and points to the existing template.
- Create `examples/m12-reference-creation-host/host-store.ts`  
  JSON-backed host store under a workspace directory. Owns projects, versions, sessions, and durable preview records.
- Create `examples/m12-reference-creation-host/host-store.test.ts`  
  TDD coverage for project creation, v0 version layout, sessions, reload, and duplicate rejection.
- Create `examples/m12-reference-creation-host/preview-runtime.ts`  
  Starts/stops the generated app preview child process, seeds deterministic demo data, and captures logs.
- Create `examples/m12-reference-creation-host/preview-runtime.test.ts`  
  TDD coverage for preview readiness, `/api/config`, inspection data, and clean shutdown.
- Create `examples/m12-reference-creation-host/host-server.ts`  
  Bun HTTP server for Builder workbench static assets and host APIs.
- Create `examples/m12-reference-creation-host/run.ts`  
  CLI wrapper around `host-server.ts`; supports live browser mode and smoke mode.
- Create `examples/m12-reference-creation-host/run.test.ts`  
  TDD coverage for end-to-end host APIs and smoke CLI.
- Create `examples/m12-reference-creation-host/static/index.html`  
  Static host shell.
- Create `examples/m12-reference-creation-host/static/app.js`  
  Browser-side Builder workbench behavior.
- Create `examples/m12-reference-creation-host/static/styles.css`  
  Polished split-screen host UI.

## Workspace Layout

The host workspace must be deterministic and easy to inspect:

```text
<workspace>/
  .pneuma-host/
    host-state.json
  generated-apps/
    <app_id>/
      project.json
      sessions/
        <session_id>.json
      versions/
        v0/
          version.json
          workspace/
            data/
              app.db
              audit.ndjson
```

`v0/version.json` records the stack profile and source template reference. M12 does not copy template source into the version directory because this milestone is not release packaging; the version directory is the previewable state unit.

## Host API Contract

The M12 server exposes:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/host/profiles` | List stack profiles a Builder can choose. |
| `POST` | `/api/host/projects` | Create a Generated Application project and `v0`. |
| `GET` | `/api/host/projects` | List generated projects. |
| `GET` | `/api/host/projects/:appId` | Return project, versions, sessions, and preview state. |
| `POST` | `/api/host/projects/:appId/preview/start` | Start preview for the selected version. |
| `POST` | `/api/host/projects/:appId/preview/stop` | Stop preview process. |
| `GET` | `/api/host/projects/:appId/inspect` | Return schema, operations, views, policies, seeded sample data, and logs. |
| `GET` | `/api/host/status` | Return host workspace and running preview count. |

The preview app remains a separate process and keeps its own runtime API at `preview_url`, including `/api/config` and `/api/operations/list_inbox_items`.

## Task 1: Host Store Failing Tests

**Files:**
- Create: `examples/m12-reference-creation-host/types.ts`
- Create: `examples/m12-reference-creation-host/host-store.test.ts`

- [ ] **Step 1: Create `types.ts` with the public shapes used by tests**

```ts
export type StackProfileId = "knowledge-inbox-bun-sqlite";

export interface StackProfile {
  readonly id: StackProfileId;
  readonly display_name: string;
  readonly description: string;
  readonly template_dir: string;
  readonly persistence: "sqlite";
  readonly runtime: "bun-typescript";
}

export interface GeneratedAppProject {
  readonly app_id: string;
  readonly display_name: string;
  readonly profile_id: StackProfileId;
  readonly created_at_ms: number;
  readonly current_version_id: string;
}

export interface GeneratedAppVersion {
  readonly app_id: string;
  readonly version_id: string;
  readonly profile_id: StackProfileId;
  readonly status: "previewable";
  readonly created_at_ms: number;
  readonly version_dir: string;
  readonly app_workspace_dir: string;
  readonly sqlite_path: string;
}

export interface CreationSessionRecord {
  readonly session_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly builder_user_id: string;
  readonly builder_request: string;
  readonly created_at_ms: number;
}

export interface HostState {
  readonly schema_version: 1;
  readonly projects: readonly GeneratedAppProject[];
  readonly versions: readonly GeneratedAppVersion[];
  readonly sessions: readonly CreationSessionRecord[];
}
```

- [ ] **Step 2: Write failing tests for durable project, version, and session state**

Create `host-store.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { createHostStore } from "./host-store.js";

describe("M12 host store", () => {
  test("creates a Generated Application project with a v0 version directory", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m12-store-"));
    try {
      const store = createHostStore({ workspace, now: () => 1_000 });

      const result = store.createProject({
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
      });

      expect(result.project.app_id).toBe("team-knowledge-inbox");
      expect(result.project.current_version_id).toBe("v0");
      expect(result.version.version_id).toBe("v0");
      expect(result.version.version_dir).toBe(join(workspace, "generated-apps", "team-knowledge-inbox", "versions", "v0"));
      expect(result.version.sqlite_path).toBe(join(result.version.app_workspace_dir, "data", "app.db"));

      expect(existsSync(join(workspace, ".pneuma-host", "host-state.json"))).toBe(true);
      expect(existsSync(join(workspace, "generated-apps", "team-knowledge-inbox", "project.json"))).toBe(true);
      expect(existsSync(join(result.version.version_dir, "version.json"))).toBe(true);
      expect(existsSync(join(result.version.app_workspace_dir, "data"))).toBe(true);

      const projectJson = JSON.parse(
        readFileSync(join(workspace, "generated-apps", "team-knowledge-inbox", "project.json"), "utf8"),
      );
      expect(projectJson.display_name).toBe("Team Knowledge Inbox");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("persists and reloads projects and creation sessions", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m12-store-reload-"));
    try {
      const store = createHostStore({ workspace, now: () => 2_000 });
      store.createProject({
        app_id: "customer-notes",
        display_name: "Customer Notes",
        profile_id: "knowledge-inbox-bun-sqlite",
      });
      store.recordCreationSession({
        session_id: "session-1",
        app_id: "customer-notes",
        version_id: "v0",
        builder_user_id: "builder-alice",
        builder_request: "Create a small customer-note inbox.",
      });

      const reloaded = createHostStore({ workspace, now: () => 3_000 });
      expect(reloaded.listProjects().map((project) => project.app_id)).toEqual(["customer-notes"]);
      expect(reloaded.listVersions("customer-notes").map((version) => version.version_id)).toEqual(["v0"]);
      expect(reloaded.listSessions("customer-notes")).toEqual([
        {
          session_id: "session-1",
          app_id: "customer-notes",
          version_id: "v0",
          builder_user_id: "builder-alice",
          builder_request: "Create a small customer-note inbox.",
          created_at_ms: 2_000,
        },
      ]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("rejects duplicate app ids", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m12-store-dupe-"));
    try {
      const store = createHostStore({ workspace, now: () => 4_000 });
      store.createProject({
        app_id: "ops-inbox",
        display_name: "Ops Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
      });

      expect(() =>
        store.createProject({
          app_id: "ops-inbox",
          display_name: "Ops Inbox Copy",
          profile_id: "knowledge-inbox-bun-sqlite",
        }),
      ).toThrow("generated app already exists: ops-inbox");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 3: Run the failing tests**

Run:

```bash
bun test examples/m12-reference-creation-host/host-store.test.ts
```

Expected:

```text
error: Cannot find module './host-store.js'
```

## Task 2: Host Store Implementation

**Files:**
- Create: `examples/m12-reference-creation-host/profiles.ts`
- Create: `examples/m12-reference-creation-host/host-store.ts`

- [ ] **Step 1: Create the first stack profile**

Create `profiles.ts`:

```ts
import { resolve } from "node:path";
import type { StackProfile } from "./types.js";

export const KNOWLEDGE_INBOX_PROFILE: StackProfile = {
  id: "knowledge-inbox-bun-sqlite",
  display_name: "Knowledge Inbox",
  description: "Bun TypeScript backend with SQLite persistence and the existing Knowledge Inbox domain.",
  template_dir: resolve(import.meta.dir, "../../templates/knowledge-inbox-core-domain"),
  persistence: "sqlite",
  runtime: "bun-typescript",
};

export const STACK_PROFILES = [KNOWLEDGE_INBOX_PROFILE] as const;

export function getStackProfile(profileId: string): StackProfile {
  const profile = STACK_PROFILES.find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error(`unknown stack profile: ${profileId}`);
  return profile;
}
```

- [ ] **Step 2: Implement the JSON-backed host store**

Create `host-store.ts` with these exported functions and methods:

```ts
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { getStackProfile } from "./profiles.js";
import type {
  CreationSessionRecord,
  GeneratedAppProject,
  GeneratedAppVersion,
  HostState,
  StackProfileId,
} from "./types.js";

export interface HostStoreOptions {
  readonly workspace: string;
  readonly now?: () => number;
}

export interface CreateProjectInput {
  readonly app_id: string;
  readonly display_name: string;
  readonly profile_id: StackProfileId;
}

export interface RecordCreationSessionInput {
  readonly session_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly builder_user_id: string;
  readonly builder_request: string;
}

export interface HostStore {
  readonly workspace: string;
  readonly state_path: string;
  listProjects(): readonly GeneratedAppProject[];
  getProject(appId: string): GeneratedAppProject;
  listVersions(appId: string): readonly GeneratedAppVersion[];
  getVersion(appId: string, versionId: string): GeneratedAppVersion;
  listSessions(appId: string): readonly CreationSessionRecord[];
  createProject(input: CreateProjectInput): {
    readonly project: GeneratedAppProject;
    readonly version: GeneratedAppVersion;
  };
  recordCreationSession(input: RecordCreationSessionInput): CreationSessionRecord;
  readState(): HostState;
}
```

The implementation must:

- normalize `workspace` with `resolve`;
- keep durable state at `<workspace>/.pneuma-host/host-state.json`;
- write `project.json` and `version.json`;
- create `workspace/data` for `v0`;
- validate `app_id` with `/^[a-z][a-z0-9-]{1,62}$/`;
- validate `display_name` is non-empty after trim;
- call `getStackProfile(input.profile_id)` so unknown profiles fail before state mutation;
- write JSON atomically enough for this single-process host by writing `<path>.tmp` then renaming it with `renameSync`.

- [ ] **Step 3: Run host store tests**

Run:

```bash
bun test examples/m12-reference-creation-host/host-store.test.ts
```

Expected:

```text
3 pass
```

- [ ] **Step 4: Commit the host store slice**

```bash
git add examples/m12-reference-creation-host/types.ts examples/m12-reference-creation-host/profiles.ts examples/m12-reference-creation-host/host-store.ts examples/m12-reference-creation-host/host-store.test.ts
git commit -m "feat: add m12 host store"
```

## Task 3: Preview Runtime Failing Tests

**Files:**
- Create: `examples/m12-reference-creation-host/preview-runtime.test.ts`

- [ ] **Step 1: Write tests for child-process preview and inspection**

Create `preview-runtime.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostStore } from "./host-store.js";
import {
  startPreviewRuntime,
  stopPreviewRuntime,
  inspectPreviewRuntime,
} from "./preview-runtime.js";

describe("M12 preview runtime", () => {
  test("starts a generated app preview, reads config/data/logs, and stops cleanly", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m12-preview-"));
    try {
      const store = createHostStore({ workspace, now: () => 10_000 });
      const { version } = store.createProject({
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
      });

      const preview = await startPreviewRuntime({
        project: store.getProject("team-knowledge-inbox"),
        version,
        port: 0,
      });

      expect(preview.status).toBe("running");
      expect(preview.preview_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

      const configResponse = await fetch(`${preview.preview_url}/api/config`);
      expect(configResponse.status).toBe(200);
      const config = await configResponse.json() as {
        app_id: string;
        tables: Array<{ id: string }>;
        operations: Array<{ id: string }>;
      };
      expect(config.app_id).toBe("knowledge-inbox-core-domain");
      expect(config.tables.map((table) => table.id)).toContain("inbox_items");
      expect(config.operations.map((operation) => operation.id)).toContain("list_inbox_items");

      const inspected = await inspectPreviewRuntime(preview);
      expect(inspected.schema.tables.map((table) => table.id)).toContain("inbox_items");
      expect(inspected.operations.map((operation) => operation.id)).toContain("capture_item");
      expect(inspected.data.inbox_items).toHaveLength(3);
      expect(inspected.data.inbox_items.map((row) => row.status).sort()).toEqual(["archived", "kept", "pending"]);
      expect(inspected.logs.join("\n")).toContain("##pneuma:service-ready api");

      await stopPreviewRuntime(preview);
      expect(preview.proc.exitCode).not.toBe(null);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 30_000);
});
```

- [ ] **Step 2: Run the failing preview tests**

Run:

```bash
bun test examples/m12-reference-creation-host/preview-runtime.test.ts
```

Expected:

```text
error: Cannot find module './preview-runtime.js'
```

## Task 4: Preview Runtime Implementation

**Files:**
- Modify: `examples/m12-reference-creation-host/types.ts`
- Create: `examples/m12-reference-creation-host/preview-runtime.ts`

- [ ] **Step 1: Add preview and inspection types**

Append these types to `types.ts`:

```ts
export interface PreviewRuntimeRecord {
  readonly preview_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly preview_url: string;
  readonly started_at_ms: number;
  readonly status: "running";
}

export interface PreviewRuntimeHandle extends PreviewRuntimeRecord {
  readonly proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  readonly logs: string[];
  readonly wait_until_exit: Promise<number>;
}

export interface PreviewInspection {
  readonly schema: {
    readonly tables: readonly Record<string, unknown>[];
    readonly views: readonly Record<string, unknown>[];
    readonly policy_rules: readonly Record<string, unknown>[];
  };
  readonly operations: readonly Record<string, unknown>[];
  readonly data: {
    readonly inbox_items: readonly Record<string, unknown>[];
  };
  readonly logs: readonly string[];
}
```

- [ ] **Step 2: Implement preview runtime**

Create `preview-runtime.ts` with:

```ts
import { join } from "node:path";
import type {
  GeneratedAppProject,
  GeneratedAppVersion,
  PreviewInspection,
  PreviewRuntimeHandle,
} from "./types.js";
import { getStackProfile } from "./profiles.js";
import { seedKnowledgeInboxDemo } from "../m4-knowledge-inbox/seed-demo.js";

export interface StartPreviewRuntimeInput {
  readonly project: GeneratedAppProject;
  readonly version: GeneratedAppVersion;
  readonly port: number;
  readonly now?: () => number;
}

export async function startPreviewRuntime(input: StartPreviewRuntimeInput): Promise<PreviewRuntimeHandle> {
  const profile = getStackProfile(input.version.profile_id);
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

  const wait_until_exit = proc.exited;
  const preview_url = await waitForServiceReady(proc, logs);
  const seedResult = await seedKnowledgeInboxDemo({ baseUrl: preview_url });
  logs.push(
    `seeded demo data: captured=${seedResult.captured} updated=${seedResult.updated} existing=${seedResult.existing}`,
  );
  consumeStream(proc.stderr, logs, "stderr");

  return {
    preview_id: `${input.project.app_id}:${input.version.version_id}`,
    app_id: input.project.app_id,
    version_id: input.version.version_id,
    preview_url,
    started_at_ms: input.now?.() ?? Date.now(),
    status: "running",
    proc,
    logs,
    wait_until_exit,
  };
}
```

Also define these helpers in the same file:

```ts
async function waitForServiceReady(
  proc: Bun.Subprocess<"ignore", "pipe", "pipe">,
  logs: string[],
): Promise<string> {
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
        reject(err);
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

export async function stopPreviewRuntime(preview: PreviewRuntimeHandle): Promise<void> {
  if (preview.proc.exitCode !== null) return;
  preview.proc.kill("SIGTERM");
  await Promise.race([
    preview.wait_until_exit,
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (preview.proc.exitCode === null) {
    preview.proc.kill("SIGKILL");
    await preview.wait_until_exit;
  }
}

export async function inspectPreviewRuntime(preview: PreviewRuntimeHandle): Promise<PreviewInspection> {
  const configResponse = await fetch(`${preview.preview_url}/api/config`);
  if (!configResponse.ok) {
    throw new Error(`GET /api/config failed with HTTP ${configResponse.status}: ${await configResponse.text()}`);
  }
  const config = await configResponse.json() as {
    tables?: Record<string, unknown>[];
    operations?: Record<string, unknown>[];
    views?: Record<string, unknown>[];
    policy_rules?: Record<string, unknown>[];
  };

  const rowsResponse = await fetch(`${preview.preview_url}/api/operations/list_inbox_items`);
  const rowsBody = rowsResponse.ok
    ? await rowsResponse.json() as { rows?: Record<string, unknown>[] }
    : { rows: [] };

  return {
    schema: {
      tables: config.tables ?? [],
      views: config.views ?? [],
      policy_rules: config.policy_rules ?? [],
    },
    operations: config.operations ?? [],
    data: {
      inbox_items: rowsBody.rows ?? [],
    },
    logs: [...preview.logs],
  };
}
```

- [ ] **Step 3: Run preview runtime tests**

Run:

```bash
bun test examples/m12-reference-creation-host/preview-runtime.test.ts
```

Expected:

```text
1 pass
```

- [ ] **Step 4: Commit the preview runtime slice**

```bash
git add examples/m12-reference-creation-host/types.ts examples/m12-reference-creation-host/preview-runtime.ts examples/m12-reference-creation-host/preview-runtime.test.ts
git commit -m "feat: add m12 preview runtime"
```

## Task 5: Host Server Failing Tests

**Files:**
- Create: `examples/m12-reference-creation-host/run.test.ts`

- [ ] **Step 1: Write end-to-end host server tests**

Create `run.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startReferenceCreationHostServer } from "./host-server.js";

describe("M12 Reference Creation Host server", () => {
  test("creates a Generated Application, starts preview, inspects it, and stops preview", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m12-host-"));
    const server = await startReferenceCreationHostServer({ workspace, port: 0 });
    const baseUrl = `http://127.0.0.1:${server.port}`;

    try {
      const profiles = await fetchJson<{ profiles: Array<{ id: string }> }>(`${baseUrl}/api/host/profiles`);
      expect(profiles.profiles.map((profile) => profile.id)).toEqual(["knowledge-inbox-bun-sqlite"]);

      const created = await fetchJson<{ project: { app_id: string; current_version_id: string } }>(
        `${baseUrl}/api/host/projects`,
        {
          method: "POST",
          body: JSON.stringify({
            app_id: "team-knowledge-inbox",
            display_name: "Team Knowledge Inbox",
            profile_id: "knowledge-inbox-bun-sqlite",
            builder_user_id: "builder-alice",
            builder_request: "Create a shared inbox for team knowledge.",
          }),
        },
      );
      expect(created.project).toEqual({
        app_id: "team-knowledge-inbox",
        current_version_id: "v0",
      });

      const preview = await fetchJson<{ preview: { preview_url: string } }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/preview/start`,
        { method: "POST", body: JSON.stringify({ version_id: "v0" }) },
      );
      expect(preview.preview.preview_url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

      const inspect = await fetchJson<{
        project: { app_id: string };
        preview: { preview_url: string };
        inspection: {
          schema: { tables: Array<{ id: string }> };
          operations: Array<{ id: string }>;
          data: { inbox_items: unknown[] };
          logs: string[];
        };
      }>(`${baseUrl}/api/host/projects/team-knowledge-inbox/inspect`);

      expect(inspect.project.app_id).toBe("team-knowledge-inbox");
      expect(inspect.preview.preview_url).toBe(preview.preview.preview_url);
      expect(inspect.inspection.schema.tables.map((table) => table.id)).toContain("inbox_items");
      expect(inspect.inspection.operations.map((operation) => operation.id)).toContain("capture_item");
      expect(inspect.inspection.data.inbox_items).toHaveLength(3);
      expect(inspect.inspection.logs.join("\n")).toContain("##pneuma:service-ready api");
      expect(inspect.inspection.logs.join("\n")).toContain("seeded demo data:");

      const stopped = await fetchJson<{ stopped: boolean }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/preview/stop`,
        { method: "POST" },
      );
      expect(stopped.stopped).toBe(true);
    } finally {
      await server.stop();
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 45_000);

  test("smoke CLI creates and inspects one generated app", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m12-cli-"));
    try {
      const proc = Bun.spawn({
        cmd: [
          "bun",
          "run",
          join(import.meta.dir, "run.ts"),
          "--workspace",
          workspace,
          "--port",
          "0",
          "--smoke-exit",
        ],
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("M12 Reference Creation Host ready:");
      expect(stdout).toContain("created generated app: team-knowledge-inbox@v0");
      expect(stdout).toContain("preview config: inbox_items table, capture_item operation");
      expect(stdout).toContain("smoke verification: passed");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 60_000);
});

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
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
```

- [ ] **Step 2: Run the failing host server tests**

Run:

```bash
bun test examples/m12-reference-creation-host/run.test.ts
```

Expected:

```text
error: Cannot find module './host-server.js'
```

## Task 6: Host Server And CLI Implementation

**Files:**
- Create: `examples/m12-reference-creation-host/host-server.ts`
- Create: `examples/m12-reference-creation-host/run.ts`
- Create: `examples/m12-reference-creation-host/package.json`

- [ ] **Step 1: Create package metadata**

Create `package.json`:

```json
{
  "name": "@pneuma-framework/example-m12-reference-creation-host",
  "type": "module",
  "private": true,
  "scripts": {
    "start": "bun run run.ts",
    "smoke": "bun run run.ts --smoke-exit"
  },
  "dependencies": {
    "@pneuma-framework/runtime": "workspace:*"
  }
}
```

- [ ] **Step 2: Implement host server routing**

Create `host-server.ts` exporting:

```ts
export interface StartReferenceCreationHostServerOptions {
  readonly workspace: string;
  readonly port: number;
}

export interface ReferenceCreationHostServer {
  readonly port: number;
  readonly workspace: string;
  stop(): Promise<void>;
}

export async function startReferenceCreationHostServer(
  options: StartReferenceCreationHostServerOptions,
): Promise<ReferenceCreationHostServer>;
```

The server must:

- create a `HostStore` for `options.workspace`;
- keep `Map<string, PreviewRuntimeHandle>` keyed by `app_id`;
- serve `/` and static assets from `static/`;
- return JSON for the host API contract;
- return `404` JSON `{ "error": "not_found" }` for unknown routes;
- stop all running previews when `server.stop()` is called.

Use explicit route functions:

```ts
async function handleCreateProject(req: Request, store: HostStore): Promise<Response>
async function handleStartPreview(appId: string, req: Request, store: HostStore, previews: Map<string, PreviewRuntimeHandle>): Promise<Response>
async function handleStopPreview(appId: string, previews: Map<string, PreviewRuntimeHandle>): Promise<Response>
async function handleInspect(appId: string, store: HostStore, previews: Map<string, PreviewRuntimeHandle>): Promise<Response>
```

`handleCreateProject` must call `store.recordCreationSession` when `builder_user_id` and `builder_request` are present. Use `session_id: create-${app_id}-v0`.

- [ ] **Step 3: Implement CLI smoke mode**

Create `run.ts` with:

```ts
#!/usr/bin/env bun

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startReferenceCreationHostServer } from "./host-server.js";
```

Support args:

```text
--workspace <dir>
--port <number>
--smoke-exit
--help
```

Default port: `8879`. Default workspace: `mkdtempSync(join(tmpdir(), "pneuma-m12-reference-host-"))`.

When not in smoke mode, print:

```text
M12 Reference Creation Host ready: http://127.0.0.1:<port>
workspace: <workspace>
Press Ctrl+C to stop the host.
```

Smoke mode must:

1. start the host;
2. create `team-knowledge-inbox`;
3. start preview for `v0`;
4. inspect;
5. verify `inbox_items` table and `capture_item` operation;
6. stop preview;
7. stop server;
8. print:

```text
M12 Reference Creation Host ready: http://127.0.0.1:<port>
created generated app: team-knowledge-inbox@v0
preview config: inbox_items table, capture_item operation
smoke verification: passed
```

- [ ] **Step 4: Run host server tests**

Run:

```bash
bun test examples/m12-reference-creation-host/run.test.ts
```

Expected:

```text
2 pass
```

- [ ] **Step 5: Commit the server slice**

```bash
git add examples/m12-reference-creation-host/package.json examples/m12-reference-creation-host/host-server.ts examples/m12-reference-creation-host/run.ts examples/m12-reference-creation-host/run.test.ts
git commit -m "feat: add m12 host server"
```

## Task 7: Builder Workbench UI

**Files:**
- Create: `examples/m12-reference-creation-host/static/index.html`
- Create: `examples/m12-reference-creation-host/static/app.js`
- Create: `examples/m12-reference-creation-host/static/styles.css`

- [ ] **Step 1: Create the static HTML shell**

Create `static/index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>M12 Reference Creation Host</title>
    <link rel="stylesheet" href="/static/styles.css" />
  </head>
  <body>
    <main class="host-shell">
      <section class="preview-pane" aria-label="Generated application preview">
        <header class="pane-header">
          <div>
            <p class="eyebrow">Generated Application</p>
            <h1 id="preview-title">No project yet</h1>
          </div>
          <span id="preview-status" class="status-pill">idle</span>
        </header>
        <iframe id="preview-frame" title="Generated app preview"></iframe>
      </section>

      <section class="builder-pane" aria-label="Builder workbench">
        <header class="pane-header">
          <div>
            <p class="eyebrow">Creation Host</p>
            <h2>Builder Workbench</h2>
          </div>
          <button id="create-project" type="button">Create v0</button>
        </header>

        <section class="request-panel">
          <label for="builder-request">Builder request</label>
          <textarea id="builder-request">Create a shared inbox for team knowledge.</textarea>
        </section>

        <section class="control-grid">
          <button id="start-preview" type="button" disabled>Start preview</button>
          <button id="stop-preview" type="button" disabled>Stop preview</button>
          <button id="refresh-inspect" type="button" disabled>Refresh inspect</button>
          <button id="publish-placeholder" type="button" disabled>Publish in M14</button>
        </section>

        <nav class="tabs" aria-label="Inspection tabs">
          <button class="tab active" type="button" data-tab="schema">Schema</button>
          <button class="tab" type="button" data-tab="data">Data</button>
          <button class="tab" type="button" data-tab="operations">Operations</button>
          <button class="tab" type="button" data-tab="logs">Logs</button>
        </nav>

        <section class="inspect-surface">
          <pre id="inspect-output">{}</pre>
        </section>
      </section>
    </main>
    <script type="module" src="/static/app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create browser behavior**

Create `static/app.js` with functions:

```js
const state = {
  appId: null,
  previewUrl: null,
  inspection: null,
  activeTab: "schema",
};

const $ = (id) => document.getElementById(id);

async function jsonFetch(path, init) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init && init.headers ? init.headers : {}),
    },
  });
  if (!response.ok) throw new Error(`${init && init.method ? init.method : "GET"} ${path} failed: ${await response.text()}`);
  return await response.json();
}
```

Then implement:

- `createProject()` posts to `/api/host/projects` with `team-knowledge-inbox`, `Team Knowledge Inbox`, `knowledge-inbox-bun-sqlite`, `builder-alice`, and the textarea value;
- `startPreview()` posts `/api/host/projects/team-knowledge-inbox/preview/start`, updates iframe `src`, enables inspect and stop;
- `stopPreview()` posts `/api/host/projects/team-knowledge-inbox/preview/stop`, clears iframe `src`, sets status `stopped`;
- `refreshInspect()` calls `/api/host/projects/team-knowledge-inbox/inspect`;
- `renderInspection()` shows JSON for the active tab:
  - `schema`: `inspection.schema`;
  - `data`: `inspection.data`;
  - `operations`: `inspection.operations`;
  - `logs`: `inspection.logs`;
- tab buttons update `state.activeTab` and call `renderInspection()`.

Bind all four primary buttons and all tabs at module load.

- [ ] **Step 3: Create polished CSS**

Create `static/styles.css` with:

```css
:root {
  color-scheme: light;
  --bg: #f4f1ea;
  --ink: #202124;
  --muted: #6b6760;
  --line: #d8d2c7;
  --panel: #fffdf8;
  --panel-strong: #f7efe2;
  --accent: #1f7a68;
  --accent-strong: #135f52;
  --danger: #a13b2f;
  --shadow: 0 18px 50px rgba(38, 31, 22, 0.12);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
}

button {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  color: var(--ink);
  cursor: pointer;
  font: inherit;
  min-height: 40px;
  padding: 0 14px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.host-shell {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(420px, 0.92fr);
  gap: 18px;
  min-height: 100vh;
  padding: 18px;
}

.preview-pane,
.builder-pane {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.pane-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
  background: var(--panel-strong);
}

.eyebrow {
  margin: 0 0 4px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

h1,
h2 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
}

.status-pill {
  border-radius: 999px;
  background: #e7f3ee;
  color: var(--accent-strong);
  font-size: 12px;
  font-weight: 700;
  padding: 6px 10px;
}

#preview-frame {
  display: block;
  width: 100%;
  height: calc(100vh - 91px);
  border: 0;
  background: white;
}

.builder-pane {
  display: flex;
  flex-direction: column;
}

.request-panel,
.control-grid,
.tabs,
.inspect-surface {
  margin: 16px 18px 0;
}

.request-panel label {
  display: block;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
}

textarea {
  width: 100%;
  min-height: 90px;
  resize: vertical;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
  color: var(--ink);
  font: inherit;
}

.control-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.control-grid button:first-child {
  border-color: transparent;
  background: var(--accent);
  color: white;
}

.tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 10px;
}

.tab.active {
  border-color: var(--accent);
  color: var(--accent-strong);
  font-weight: 700;
}

.inspect-surface {
  flex: 1;
  margin-bottom: 18px;
  min-height: 0;
}

pre {
  height: 100%;
  min-height: 280px;
  max-height: calc(100vh - 410px);
  margin: 0;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #171a1c;
  color: #e8f1ef;
  font-size: 12px;
  line-height: 1.55;
  padding: 14px;
}

@media (max-width: 960px) {
  .host-shell {
    grid-template-columns: 1fr;
  }

  #preview-frame {
    height: 58vh;
  }

  .builder-pane {
    min-height: 70vh;
  }
}
```

- [ ] **Step 4: Run server tests after static assets are served**

Run:

```bash
bun test examples/m12-reference-creation-host/run.test.ts
```

Expected:

```text
2 pass
```

- [ ] **Step 5: Commit the UI slice**

```bash
git add examples/m12-reference-creation-host/static/index.html examples/m12-reference-creation-host/static/app.js examples/m12-reference-creation-host/static/styles.css examples/m12-reference-creation-host/host-server.ts
git commit -m "feat: add m12 builder workbench"
```

## Task 8: README And Final Verification

**Files:**
- Create: `examples/m12-reference-creation-host/README.md`

- [ ] **Step 1: Create the example README**

Create `README.md`:

```md
# M12 Reference Creation Host

This example is the first host-level proof after M11.

It is not another generated app demo. It is a Builder-facing Creation Host that can create a Generated Application project, start a preview runtime, and inspect schema/data/logs through host APIs.

## Run

```bash
bun run examples/m12-reference-creation-host/run.ts
```

Open the printed URL, then:

1. click `Create v0`;
2. click `Start preview`;
3. inspect Schema, seeded Data, Operations, and Logs in the Builder Workbench.

## Smoke Test

```bash
bun run examples/m12-reference-creation-host/run.ts --smoke-exit
```

Expected output:

```text
M12 Reference Creation Host ready: http://127.0.0.1:<port>
created generated app: team-knowledge-inbox@v0
preview config: inbox_items table, capture_item operation
smoke verification: passed
```

## What M12 Proves

```text
pneuma-framework -> Creation Host -> Generated Application -> previewable v0
```

The Creation Host owns project identity, profile choice, version directories, preview lifecycle, and inspection surfaces. The Generated Application owns definition, seeded demo data, operations, and runtime behavior.

## What M12 Does Not Prove

Real backend-agent evolution is M13. Publish, monitor, and rollback are M14. A second app domain pressure test is M15. The release-candidate snapshot is M16.
```

- [ ] **Step 2: Run targeted example tests**

Run:

```bash
bun test examples/m12-reference-creation-host
```

Expected:

```text
6 pass
```

The exact test count may be higher if extra assertions are added, but every test in the example must pass.

- [ ] **Step 3: Run monorepo typecheck**

Run:

```bash
bun run typecheck
```

Expected: command exits 0.

- [ ] **Step 4: Start live host for manual browser review**

Run:

```bash
bun run examples/m12-reference-creation-host/run.ts --port 8879
```

Open:

```text
http://127.0.0.1:8879/
```

Manual acceptance:

- `Create v0` creates `team-knowledge-inbox`;
- `Start preview` loads the generated app in the left iframe;
- Schema tab shows `inbox_items`;
- Data tab shows three seeded Knowledge Inbox rows;
- Operations tab shows `capture_item` and `list_inbox_items`;
- Logs tab shows `##pneuma:service-ready api`;
- `Stop preview` stops the child process and disables inspect controls.

- [ ] **Step 5: Commit README and verification fixes**

```bash
git add examples/m12-reference-creation-host/README.md
git commit -m "docs: document m12 reference creation host"
```

## Task 9: M12 Snapshot After Implementation

**Files:**
- Create: `docs/archive/milestone-12-snapshot.md`
- Create: `docs/archive/milestone-12-snapshot.zh-CN.md`
- Modify: `docs/architecture/roadmap.md`

- [ ] **Step 1: Write the English snapshot**

The English snapshot must include:

- one-paragraph milestone result;
- diagram of `Framework -> Creation Host -> Generated Application -> Preview`;
- what was implemented;
- what was deliberately deferred to M13-M16;
- exact verification commands and outcomes;
- browser demo notes with URL and scenario.

- [ ] **Step 2: Write the Chinese snapshot**

The Chinese snapshot must cover the same structure as the English snapshot, with terminology preserved:

- Creation Host = Creation Host;
- Generated Application = Generated Application;
- Published Application = Published Application.

- [ ] **Step 3: Update roadmap status only after M12 verification passes**

In `docs/architecture/roadmap.md`, change:

```text
M12       Reference Creation Host substrate ⏳
```

to:

```text
M12       Reference Creation Host substrate ✅  Closed
```

Add the snapshot links in the M12 section.

- [ ] **Step 4: Run documentation checks**

Run:

```bash
git diff --check
rg -n "M12|Reference Creation Host|Creation Host|Generated Application|Published Application" docs/archive/milestone-12-snapshot.md docs/archive/milestone-12-snapshot.zh-CN.md docs/architecture/roadmap.md
```

Expected:

- `git diff --check` exits 0;
- `rg` shows M12 references in the two snapshots and roadmap.

- [ ] **Step 5: Commit M12 closure docs**

```bash
git add docs/archive/milestone-12-snapshot.md docs/archive/milestone-12-snapshot.zh-CN.md docs/architecture/roadmap.md
git commit -m "docs: add m12 milestone snapshot"
```

## Self-Review Checklist

- [ ] The plan keeps Creation Host concepts example-local for M12.
- [ ] The plan creates a real Generated Application project and `v0` version directory.
- [ ] The plan starts a real preview runtime from the existing Knowledge Inbox template.
- [ ] The plan exposes host-level schema/seeded-data/operations/log inspection.
- [ ] The plan provides a browser workbench where preview and Builder inspection are visible together.
- [ ] The plan does not claim real backend-agent evolution, publish, monitor, rollback, or second-app generality.
- [ ] The plan includes focused tests before each implementation slice.
- [ ] The plan includes final browser review before snapshot.
