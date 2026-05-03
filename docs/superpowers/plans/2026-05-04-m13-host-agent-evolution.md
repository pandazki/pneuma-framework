# M13 Host Agent Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move governed backend-agent evolution into the Reference Creation Host so one Builder intent becomes one approval prompt, one governed change-set, and durable host transcript evidence.

**Architecture:** Build `examples/m13-host-agent-evolution/` as a host-level example on top of M12's project/version store. M13 starts a framework-managed preview runtime for the generated app, exposes host APIs for evolution sessions, records transcript evidence under the generated-app version workspace, and shows approval/result state in the Builder workbench. Keep this example-local; do not promote Host concepts into `packages/core`.

**Tech Stack:** Bun TypeScript, Bun tests, `@pneuma-framework/core`, `@pneuma-framework/backend-opencode`, existing Knowledge Inbox template, M12 host store/profile helpers, M7/M6 priority capability fixtures, framework tool HTTP proxy, static HTML/CSS/JS.

---

## Boundary

M13 proves this flow:

```text
Creation Host
  -> Builder creates team-knowledge-inbox@v0
  -> Host starts framework-managed preview runtime
  -> Builder asks to add Priority Queue
  -> backend agent proposes one definition.apply_change_set
  -> Host shows one approval prompt for the intent
  -> allow path applies the whole governed change-set
  -> deny path leaves the app unchanged
  -> transcript preserves request / prompt / approval / tool call / result / after state
```

M13 does not claim production model reliability, arbitrary code generation, publish, monitor, rollback, stable End User URL, production IAM, multi-tenant isolation, or Runtime Agent.

The central correction from M7 remains mandatory: **one user intent gets one approval**. The Builder is not approving `add_table_column`, `add_operation`, `add_view`, and `add_policy_rule` separately.

## File Structure

- Create `examples/m13-host-agent-evolution/package.json`  
  Example workspace metadata and scripts.
- Create `examples/m13-host-agent-evolution/README.md`  
  Explains what M13 proves and how to run fake/opencode paths.
- Create `examples/m13-host-agent-evolution/transcript.ts`  
  Durable transcript model scoped to Host + Generated Application project/version.
- Create `examples/m13-host-agent-evolution/transcript.test.ts`  
  Tests transcript creation, append, approval, completion, and file path.
- Create `examples/m13-host-agent-evolution/host-evolution.ts`  
  Starts framework-managed preview runtime, fake/opencode backend, permission bridge, evolution session, allow/deny finalization.
- Create `examples/m13-host-agent-evolution/host-evolution.test.ts`  
  Tests deterministic allow and deny paths without browser.
- Create `examples/m13-host-agent-evolution/host-server.ts`  
  Bun HTTP host server with M12-like project APIs plus M13 evolution APIs.
- Create `examples/m13-host-agent-evolution/run.ts`  
  CLI wrapper with smoke mode and live browser mode.
- Create `examples/m13-host-agent-evolution/run.test.ts`  
  Tests host API allow/deny and smoke CLI.
- Create `examples/m13-host-agent-evolution/static/index.html`  
  Host workbench shell.
- Create `examples/m13-host-agent-evolution/static/app.js`  
  Browser behavior for create, preview, inspect, start evolution, allow/deny, transcript tabs.
- Create `examples/m13-host-agent-evolution/static/styles.css`  
  Product UI styling consistent with M12 but with M13 approval runway.
- Create `docs/architecture/milestone-13-snapshot.md` and `.zh-CN.md` after implementation verification.
- Modify `docs/architecture/roadmap.md` only when M13 closes.

Use imports from M12 where they are already stable for the host substrate:

```ts
import { createHostStore } from "../m12-reference-creation-host/host-store.js";
import { STACK_PROFILES, getStackProfile } from "../m12-reference-creation-host/profiles.js";
import type { GeneratedAppProject, GeneratedAppVersion } from "../m12-reference-creation-host/types.js";
```

Do not modify M12 host behavior for M13.

## Host API Contract

M13 host server exposes M12-equivalent APIs:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/host/profiles` | List stack profiles. |
| `POST` | `/api/host/projects` | Create `team-knowledge-inbox@v0`. |
| `GET` | `/api/host/projects` | List generated projects. |
| `GET` | `/api/host/projects/:appId` | Return project, versions, sessions, preview, and current evolution. |
| `POST` | `/api/host/projects/:appId/preview/start` | Start framework-managed preview runtime. |
| `POST` | `/api/host/projects/:appId/preview/stop` | Stop preview runtime and backend/proxy resources. |
| `GET` | `/api/host/projects/:appId/inspect` | Return schema, operations, data, logs, and transcript summary. |

M13 adds:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/host/projects/:appId/evolution/start` | Start backend-agent evolution for one Builder request. |
| `GET` | `/api/host/projects/:appId/evolution` | Return current evolution state and transcript. |
| `POST` | `/api/host/projects/:appId/evolution/approve` | Allow the pending one-intent proposal. |
| `POST` | `/api/host/projects/:appId/evolution/deny` | Deny the pending proposal. |
| `GET` | `/api/host/projects/:appId/priority-queue` | Return rows from `list_priority_queue` after allow path. |

## Task 1: Transcript Red/Green

**Files:**
- Create: `examples/m13-host-agent-evolution/transcript.test.ts`
- Create: `examples/m13-host-agent-evolution/transcript.ts`

- [ ] **Step 1: Write failing transcript tests**

Create `transcript.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHostAgentTranscript,
  recordApprovalPrompt,
  recordApprovalResponse,
  recordAgentMessage,
  recordCompletion,
  recordToolCall,
  recordToolResult,
  transcriptPath,
  writeHostAgentTranscript,
} from "./transcript.js";

describe("M13 host agent transcript", () => {
  test("records one Builder intent, one approval, one tool call, and completion", () => {
    const transcript = createHostAgentTranscript({
      runId: "m13-run-1",
      appId: "team-knowledge-inbox",
      versionId: "v0",
      builderUserId: "builder-alice",
      builderRequest: "Add Priority Queue.",
      before: { operations: ["list_inbox_items"] },
    });

    recordAgentMessage(transcript, "I will propose one governed change-set.");
    recordToolCall(transcript, {
      callId: "call-1",
      tool: "definition.apply_change_set",
      input: { summary: "Add Priority Queue" },
    });
    recordApprovalPrompt(transcript, {
      promptId: "prompt-1",
      tool: "definition.apply_change_set",
      summary: "Add Priority Queue",
      detail: { impact: "adds priority queue capability" },
    });
    recordApprovalResponse(transcript, {
      promptId: "prompt-1",
      tool: "definition.apply_change_set",
      decision: "allow",
    });
    recordToolResult(transcript, {
      callId: "call-1",
      tool: "definition.apply_change_set",
      ok: true,
      result: { ok: true },
    });
    recordCompletion(transcript, {
      status: "completed",
      after: { operations: ["list_inbox_items", "list_priority_queue"] },
      summary: "Priority Queue is ready.",
    });

    expect(transcript.status).toBe("completed");
    expect(transcript.app_id).toBe("team-knowledge-inbox");
    expect(transcript.version_id).toBe("v0");
    expect(transcript.events.map((event) => event.kind)).toEqual([
      "builder_message",
      "agent_message",
      "tool_call",
      "approval_prompt",
      "approval_response",
      "tool_result",
      "completion",
    ]);
    expect(transcript.events.filter((event) => event.kind === "approval_prompt")).toHaveLength(1);
    expect(transcript.events.filter((event) => event.kind === "approval_response")).toHaveLength(1);
  });

  test("writes transcript under the generated app version workspace", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m13-transcript-"));
    try {
      const transcript = createHostAgentTranscript({
        runId: "m13-run-2",
        appId: "team-knowledge-inbox",
        versionId: "v0",
        builderUserId: "builder-alice",
        builderRequest: "Add Priority Queue.",
        before: {},
      });
      const path = writeHostAgentTranscript(workspace, transcript);

      expect(path).toBe(join(workspace, ".pneuma-host", "agent-transcripts", "m13-run-2.json"));
      expect(transcriptPath(workspace, "m13-run-2")).toBe(path);
      expect(existsSync(path)).toBe(true);
      const persisted = JSON.parse(readFileSync(path, "utf8"));
      expect(persisted.run_id).toBe("m13-run-2");
      expect(persisted.builder_request).toBe("Add Priority Queue.");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run red transcript test**

Run:

```bash
bun test examples/m13-host-agent-evolution/transcript.test.ts
```

Expected:

```text
error: Cannot find module './transcript.js'
```

- [ ] **Step 3: Implement transcript model**

Create `transcript.ts` with:

```ts
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type HostAgentEvolutionStatus = "running" | "awaiting_approval" | "completed" | "denied" | "failed";
export type HostAgentEventKind =
  | "builder_message"
  | "agent_message"
  | "tool_call"
  | "approval_prompt"
  | "approval_response"
  | "tool_result"
  | "framework_restart"
  | "completion";
export type HostAgentActor = "builder" | "agent" | "framework";
export type HostAgentDecision = "allow" | "deny" | "allow-always";

export interface HostAgentTranscriptEvent {
  readonly id: string;
  readonly at: string;
  readonly actor: HostAgentActor;
  readonly kind: HostAgentEventKind;
  summary: string;
  readonly tool?: string;
  readonly prompt_id?: string;
  readonly call_id?: string;
  readonly decision?: HostAgentDecision;
  readonly ok?: boolean;
  readonly detail?: unknown;
}

export interface HostAgentTranscript {
  readonly schema_version: 1;
  readonly run_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly builder_user_id: string;
  readonly created_at: string;
  status: HostAgentEvolutionStatus;
  readonly builder_request: string;
  readonly before: unknown;
  after: unknown | null;
  readonly events: HostAgentTranscriptEvent[];
}
```

Implement these functions:

```ts
export function createHostAgentTranscript(input: {
  readonly runId: string;
  readonly appId: string;
  readonly versionId: string;
  readonly builderUserId: string;
  readonly builderRequest: string;
  readonly before: unknown;
}): HostAgentTranscript;
export function recordAgentMessage(transcript: HostAgentTranscript, text: string): void;
export function recordToolCall(transcript: HostAgentTranscript, input: { callId: string; tool: string; input: unknown }): void;
export function recordApprovalPrompt(transcript: HostAgentTranscript, input: { promptId: string; tool: string; summary: string; detail: unknown }): void;
export function recordApprovalResponse(transcript: HostAgentTranscript, input: { promptId: string; tool: string; decision: HostAgentDecision }): void;
export function recordToolResult(transcript: HostAgentTranscript, input: { callId: string; tool: string; ok: boolean; result: unknown }): void;
export function recordFrameworkRestart(transcript: HostAgentTranscript, input: { summary: string; detail?: unknown }): void;
export function recordCompletion(transcript: HostAgentTranscript, input: { status: Exclude<HostAgentEvolutionStatus, "running" | "awaiting_approval">; after?: unknown; summary: string; detail?: unknown }): void;
export function transcriptPath(versionWorkspace: string, runId: string): string;
export function writeHostAgentTranscript(versionWorkspace: string, transcript: HostAgentTranscript): string;
```

Use `appendEvent` internally. `recordApprovalPrompt` must set `transcript.status = "awaiting_approval"`. `recordApprovalResponse` must set `transcript.status = "running"` for allow/allow-always and `"denied"` for deny. `recordCompletion` must set final status and `after`.

- [ ] **Step 4: Run green transcript test**

Run:

```bash
bun test examples/m13-host-agent-evolution/transcript.test.ts
```

Expected:

```text
2 pass
```

- [ ] **Step 5: Commit transcript slice**

```bash
git add examples/m13-host-agent-evolution/transcript.ts examples/m13-host-agent-evolution/transcript.test.ts
git commit -m "feat: add m13 host agent transcript"
```

## Task 2: Evolution Runtime Red/Green

**Files:**
- Create: `examples/m13-host-agent-evolution/host-evolution.test.ts`
- Create: `examples/m13-host-agent-evolution/host-evolution.ts`
- Create: `examples/m13-host-agent-evolution/package.json`

- [ ] **Step 1: Write failing evolution tests**

Create `host-evolution.test.ts` with deterministic fake backend coverage:

```ts
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostStore } from "../m12-reference-creation-host/host-store.js";
import {
  createHostEvolutionRuntime,
  readPriorityQueueRows,
} from "./host-evolution.js";

describe("M13 host evolution runtime", () => {
  test("allow path applies one change-set and records completed transcript", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m13-allow-"));
    try {
      const store = createHostStore({ workspace, now: () => 1000 });
      const { project, version } = store.createProject({
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
      });
      const runtime = await createHostEvolutionRuntime({
        project,
        version,
        backend: "fake",
        autoDecision: "allow",
      });
      try {
        await runtime.startPreview();
        const result = await runtime.startEvolution({
          builderUserId: "builder-alice",
          builderRequest: "Add a Priority Queue for urgent inbox items.",
        });

        expect(result.status).toBe("completed");
        expect(result.transcript.status).toBe("completed");
        expect(result.transcript.events.filter((event) => event.kind === "approval_prompt")).toHaveLength(1);
        expect(result.transcript.events.filter((event) => event.kind === "approval_response")).toHaveLength(1);
        expect(result.transcript.events.some((event) =>
          event.kind === "tool_call" && event.tool === "definition.apply_change_set"
        )).toBe(true);
        expect(JSON.stringify(result.transcript.after)).toContain("list_priority_queue");
        expect(existsSync(result.transcript_path)).toBe(true);

        const rows = await readPriorityQueueRows(runtime.previewUrl());
        expect(rows).toHaveLength(3);
        expect(rows.map((row) => row.priority).sort()).toEqual(["P1", "P2", "P3"]);
      } finally {
        await runtime.close();
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);

  test("deny path records denial and leaves Priority Queue absent", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m13-deny-"));
    try {
      const store = createHostStore({ workspace, now: () => 2000 });
      const { project, version } = store.createProject({
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
      });
      const runtime = await createHostEvolutionRuntime({
        project,
        version,
        backend: "fake",
        autoDecision: "deny",
      });
      try {
        await runtime.startPreview();
        const result = await runtime.startEvolution({
          builderUserId: "builder-alice",
          builderRequest: "Add a Priority Queue for urgent inbox items.",
        });

        expect(result.status).toBe("denied");
        expect(result.transcript.status).toBe("denied");
        expect(result.transcript.events.filter((event) => event.kind === "approval_prompt")).toHaveLength(1);
        expect(result.transcript.events.some((event) =>
          event.kind === "approval_response" && event.decision === "deny"
        )).toBe(true);
        await expect(readPriorityQueueRows(runtime.previewUrl())).rejects.toThrow("list_priority_queue failed");
      } finally {
        await runtime.close();
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});
```

- [ ] **Step 2: Run red evolution test**

Run:

```bash
bun test examples/m13-host-agent-evolution/host-evolution.test.ts
```

Expected:

```text
error: Cannot find module './host-evolution.js'
```

- [ ] **Step 3: Create package metadata**

Create `package.json`:

```json
{
  "name": "@pneuma-framework/example-m13-host-agent-evolution",
  "type": "module",
  "private": true,
  "scripts": {
    "start": "bun run run.ts",
    "smoke": "bun run run.ts --smoke-exit"
  },
  "dependencies": {
    "@pneuma-framework/core": "workspace:*",
    "@pneuma-framework/backend-opencode": "workspace:*"
  }
}
```

- [ ] **Step 4: Implement fake backend and runtime**

Create `host-evolution.ts` exporting:

```ts
export type M13BackendChoice = "fake" | "opencode";
export type M13AutoDecision = "allow" | "deny" | "none";

export interface CreateHostEvolutionRuntimeInput {
  readonly project: GeneratedAppProject;
  readonly version: GeneratedAppVersion;
  readonly backend: M13BackendChoice;
  readonly autoDecision: M13AutoDecision;
  readonly portHint?: number;
}

export interface StartHostEvolutionInput {
  readonly builderUserId: string;
  readonly builderRequest: string;
}

export interface HostEvolutionResult {
  readonly status: "completed" | "denied" | "failed" | "awaiting_approval";
  readonly transcript: HostAgentTranscript;
  readonly transcript_path: string;
  readonly preview_url: string;
}

export interface HostEvolutionRuntime {
  startPreview(): Promise<{ preview_url: string }>;
  startEvolution(input: StartHostEvolutionInput): Promise<HostEvolutionResult>;
  approve(): Promise<HostEvolutionResult>;
  deny(): Promise<HostEvolutionResult>;
  inspect(): Promise<{ config: unknown; rows: readonly Record<string, unknown>[]; logs: readonly string[] }>;
  previewUrl(): string;
  currentTranscript(): HostAgentTranscript | null;
  close(): Promise<void>;
}
```

The implementation must:

- create `PneumaFramework` with `templateDir` from `getStackProfile(version.profile_id).template_dir`;
- use `workspace: version.app_workspace_dir`;
- use `authorization.appId = "knowledge-inbox-core-domain"` and `authorization.workspaceId = version.app_workspace_dir`;
- start preview through `framework.toolRegistry.call("lifecycle.dev.start", {})`;
- seed M4 demo rows after preview starts using `seedKnowledgeInboxDemo({ baseUrl })`;
- start `startFrameworkToolHttpProxy(framework.toolRegistry, { port: 0 })`;
- build one prompt that instructs backend agent to call exactly `definition.apply_change_set`;
- record transcript events for builder request, agent text, tool-call, permission prompt, approval response, tool result, framework restart, and completion;
- for `autoDecision: "allow"` or `"deny"`, respond to the permission prompt in a microtask;
- for `autoDecision: "none"`, return `awaiting_approval` after prompt is recorded and let `approve()` / `deny()` finish the session;
- after allow, wait for `list_priority_queue`, seed priority demo rows with `seedPriorityDemoRows(framework, version.app_workspace_dir, currentBaseUrl)`, then verify 3 rows;
- after deny, verify `list_priority_queue` remains unavailable;
- close framework proxy, backend, and framework on `close()`.

Reuse these known helpers from earlier examples:

```ts
import {
  m6BuilderRequest,
  priorityCapabilityChanges,
  seedPriorityDemoRows,
} from "../m6-real-agent-evolution/backend-harness.js";
import { summarizeM6ConfigSnapshot } from "../m6-real-agent-evolution/trace.js";
import { seedKnowledgeInboxDemo } from "../m4-knowledge-inbox/seed-demo.js";
import { callFrameworkTool, fetchFrameworkTools } from "../../packages/core/bin/framework-mcp-bridge.js";
```

The fake backend should be equivalent to M7 but Host-framed:

```text
Agent receives Builder request inside Creation Host.
Agent discovers definition.apply_change_set.
Agent emits one tool-call.
Agent calls definition.apply_change_set with priorityCapabilityChanges.
Agent waits for one Builder approval.
Agent reports ready or denied.
```

- [ ] **Step 5: Run green evolution tests**

Run:

```bash
bun test examples/m13-host-agent-evolution/host-evolution.test.ts
```

Expected:

```text
2 pass
```

- [ ] **Step 6: Commit evolution runtime slice**

```bash
git add examples/m13-host-agent-evolution/package.json examples/m13-host-agent-evolution/host-evolution.ts examples/m13-host-agent-evolution/host-evolution.test.ts
git commit -m "feat: add m13 host evolution runtime"
```

## Task 3: Host Server API Red/Green

**Files:**
- Create: `examples/m13-host-agent-evolution/run.test.ts`
- Create: `examples/m13-host-agent-evolution/host-server.ts`
- Create: `examples/m13-host-agent-evolution/run.ts`

- [ ] **Step 1: Write failing server tests**

Create `run.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startM13HostAgentEvolutionServer } from "./host-server.js";

describe("M13 host agent evolution server", () => {
  test("allow path evolves Generated Application through one Host approval", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m13-server-allow-"));
    const server = await startM13HostAgentEvolutionServer({
      workspace,
      port: 0,
      backend: "fake",
      autoDecision: "none",
    });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    try {
      await createAndStartPreview(baseUrl);
      const started = await fetchJson<{ status: string; transcript: { events: Array<{ kind: string }> } }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/evolution/start`,
        {
          method: "POST",
          body: JSON.stringify({
            builder_user_id: "builder-alice",
            builder_request: "Add a Priority Queue for urgent inbox items.",
          }),
        },
      );
      expect(started.status).toBe("awaiting_approval");
      expect(started.transcript.events.filter((event) => event.kind === "approval_prompt")).toHaveLength(1);

      const approved = await fetchJson<{ status: string; transcript: { status: string } }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/evolution/approve`,
        { method: "POST" },
      );
      expect(approved.status).toBe("completed");
      expect(approved.transcript.status).toBe("completed");

      const queue = await fetchJson<{ rows: Array<{ priority: string }> }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/priority-queue`,
      );
      expect(queue.rows.map((row) => row.priority).sort()).toEqual(["P1", "P2", "P3"]);
    } finally {
      await server.stop();
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);

  test("deny path leaves Priority Queue absent", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m13-server-deny-"));
    const server = await startM13HostAgentEvolutionServer({
      workspace,
      port: 0,
      backend: "fake",
      autoDecision: "none",
    });
    const baseUrl = `http://127.0.0.1:${server.port}`;
    try {
      await createAndStartPreview(baseUrl);
      await fetchJson(`${baseUrl}/api/host/projects/team-knowledge-inbox/evolution/start`, {
        method: "POST",
        body: JSON.stringify({
          builder_user_id: "builder-alice",
          builder_request: "Add a Priority Queue for urgent inbox items.",
        }),
      });
      const denied = await fetchJson<{ status: string; transcript: { status: string } }>(
        `${baseUrl}/api/host/projects/team-knowledge-inbox/evolution/deny`,
        { method: "POST" },
      );
      expect(denied.status).toBe("denied");
      expect(denied.transcript.status).toBe("denied");

      const response = await fetch(`${baseUrl}/api/host/projects/team-knowledge-inbox/priority-queue`);
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("list_priority_queue failed");
    } finally {
      await server.stop();
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});

async function createAndStartPreview(baseUrl: string): Promise<void> {
  await fetchJson(`${baseUrl}/api/host/projects`, {
    method: "POST",
    body: JSON.stringify({
      app_id: "team-knowledge-inbox",
      display_name: "Team Knowledge Inbox",
      profile_id: "knowledge-inbox-bun-sqlite",
      builder_user_id: "builder-alice",
      builder_request: "Create a shared inbox for team knowledge.",
    }),
  });
  await fetchJson(`${baseUrl}/api/host/projects/team-knowledge-inbox/preview/start`, {
    method: "POST",
    body: JSON.stringify({ version_id: "v0" }),
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
```

- [ ] **Step 2: Run red server test**

Run:

```bash
bun test examples/m13-host-agent-evolution/run.test.ts
```

Expected:

```text
error: Cannot find module './host-server.js'
```

- [ ] **Step 3: Implement server and CLI**

`host-server.ts` must mirror M12's project/profile/status routes, but use `createHostEvolutionRuntime` for preview and evolution.

Export:

```ts
export interface StartM13HostAgentEvolutionServerOptions {
  readonly workspace: string;
  readonly port: number;
  readonly backend: M13BackendChoice;
  readonly autoDecision: M13AutoDecision;
}

export interface M13HostAgentEvolutionServer {
  readonly port: number;
  readonly workspace: string;
  stop(): Promise<void>;
}

export async function startM13HostAgentEvolutionServer(
  options: StartM13HostAgentEvolutionServerOptions,
): Promise<M13HostAgentEvolutionServer>;
```

`run.ts` must support:

```text
--backend fake|opencode
--auto-decision allow|deny|none
--workspace <dir>
--port <number>
--smoke-exit
```

Smoke mode with `--auto-decision allow` must:

```text
M13 Host Agent Evolution ready: http://127.0.0.1:<port>
created generated app: team-knowledge-inbox@v0
preview: running
evolution: completed
priority queue smoke: 3 rows
```

Smoke mode with `--auto-decision deny` must:

```text
M13 Host Agent Evolution ready: http://127.0.0.1:<port>
created generated app: team-knowledge-inbox@v0
preview: running
evolution: denied
priority queue smoke: denied path left operation absent
```

- [ ] **Step 4: Run green server tests**

Run:

```bash
bun test examples/m13-host-agent-evolution/run.test.ts
```

Expected:

```text
2 pass
```

- [ ] **Step 5: Commit server slice**

```bash
git add examples/m13-host-agent-evolution/host-server.ts examples/m13-host-agent-evolution/run.ts examples/m13-host-agent-evolution/run.test.ts
git commit -m "feat: add m13 host evolution server"
```

## Task 4: Browser Workbench

**Files:**
- Create: `examples/m13-host-agent-evolution/static/index.html`
- Create: `examples/m13-host-agent-evolution/static/app.js`
- Create: `examples/m13-host-agent-evolution/static/styles.css`

- [ ] **Step 1: Create static UI**

The M13 UI must preserve the M12 split workbench and add:

- `Evolve with agent` button enabled after preview starts;
- approval panel showing one intent-level proposal;
- `Allow` and `Deny` buttons;
- transcript tab showing builder message, agent message, tool call, approval prompt, approval response, tool result, completion;
- Priority Queue tab after allow;
- milestone rail with M13 active and M14 locked.

Use data attributes for stable browser testing:

```html
<button id="start-evolution" data-testid="start-evolution" type="button" disabled>Evolve with agent</button>
<section id="approval-panel" data-testid="approval-panel" hidden></section>
<button id="allow-evolution" data-testid="allow-evolution" type="button">Allow</button>
<button id="deny-evolution" data-testid="deny-evolution" type="button">Deny</button>
```

- [ ] **Step 2: Implement browser behavior**

`static/app.js` must:

- create project;
- start preview;
- start evolution with request text;
- poll `/api/host/projects/team-knowledge-inbox/evolution`;
- render approval panel when status is `awaiting_approval`;
- call approve/deny endpoints;
- render priority queue rows after allow;
- render transcript events.

- [ ] **Step 3: Run server tests**

Run:

```bash
bun test examples/m13-host-agent-evolution/run.test.ts
```

Expected:

```text
2 pass
```

- [ ] **Step 4: Manual browser acceptance**

Run:

```bash
bun run examples/m13-host-agent-evolution/run.ts --backend fake --auto-decision none --port 8880
```

Open:

```text
http://127.0.0.1:8880/
```

Manual acceptance:

- Create v0 creates `team-knowledge-inbox@v0`;
- Start preview loads Knowledge Inbox;
- Evolve with agent shows one approval panel;
- Allow applies Priority Queue and shows P1/P2/P3 rows;
- reload preserves transcript summary;
- Deny path can be tested in a fresh workspace and leaves Priority Queue absent;
- browser console has no errors.

- [ ] **Step 5: Commit browser workbench**

```bash
git add examples/m13-host-agent-evolution/static/index.html examples/m13-host-agent-evolution/static/app.js examples/m13-host-agent-evolution/static/styles.css
git commit -m "feat: add m13 host evolution workbench"
```

## Task 5: Final Verification And Snapshot

**Files:**
- Create: `examples/m13-host-agent-evolution/README.md`
- Create: `docs/architecture/milestone-13-snapshot.md`
- Create: `docs/architecture/milestone-13-snapshot.zh-CN.md`
- Modify: `docs/architecture/roadmap.md`

- [ ] **Step 1: README**

Create `README.md` explaining:

- M13 moves governed backend-agent evolution into Creation Host;
- fake backend is deterministic for tests;
- opencode backend is available for manual real-backend verification;
- one Builder intent maps to one approval prompt;
- publish is M14.

- [ ] **Step 2: Final test suite**

Run:

```bash
bun test examples/m13-host-agent-evolution
bun test examples/m12-reference-creation-host
bun run typecheck
git diff --check
```

Expected:

- M13 tests pass;
- M12 tests remain green;
- typecheck exits 0;
- diff check exits 0.

- [ ] **Step 3: Browser evidence**

Run the M13 host on port `8880`, verify allow path, collect notes:

```text
Create v0 -> visible
Start preview -> running
Evolve with agent -> one approval prompt
Allow -> completed
Priority Queue -> P1/P2/P3 visible
Transcript -> builder/tool/approval/result/completion visible
Console errors -> none
```

- [ ] **Step 4: Snapshot docs**

Write English and Chinese snapshots with:

- executive summary;
- flow diagram;
- what changed;
- one-intent approval explanation;
- verification report;
- what is not proven;
- next step recommendation: M14 host publish / monitor / rollback.

- [ ] **Step 5: Roadmap update**

Change:

```text
M13       Host-level governed evolution    ⏳
```

to:

```text
M13       Host-level governed evolution    ✅  Closed
```

Add snapshot links in M13 section.

- [ ] **Step 6: Commit closure docs**

```bash
git add examples/m13-host-agent-evolution/README.md docs/architecture/milestone-13-snapshot.md docs/architecture/milestone-13-snapshot.zh-CN.md docs/architecture/roadmap.md
git commit -m "docs: add m13 milestone snapshot"
```

## Self-Review Checklist

- [ ] M13 keeps Host concepts example-local.
- [ ] M13 starts a framework-managed preview runtime, not only a raw child-process template.
- [ ] M13 has one approval prompt for the whole Builder intent.
- [ ] Allow path applies `definition.apply_change_set` and verifies Priority Queue rows.
- [ ] Deny path leaves Priority Queue absent.
- [ ] Transcript includes builder request, agent message, tool call, approval prompt, approval response, tool result, and completion.
- [ ] Browser UI makes M13 feel like the next step after M12, not a detached primitive demo.
- [ ] Publish / monitor / rollback remain M14.
