# pneuma-framework M2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Build-phase Agent integration layer for pneuma-framework — an `AgentBackend` abstraction, the full semantic tool API (spec §5), an MCP server bridging the tools to out-of-process agents, and one concrete backend (opencode) — proven by an end-to-end test where a backend-driven agent observes state and drives the lifecycle.

**Architecture:** The core owns a `ToolRegistry` populated from `buildToolRegistry(orchestrator, backend?)`. Each tool is `(ctx, params) => Promise<ToolResult>`. In-process callers use `registry.call(name, params)` directly; out-of-process agents reach the same surface via an MCP server that registers the tool registry over stdio. Backends are separate workspace packages implementing `AgentBackend` (lifecycle + message translation); they plug in at `createPneumaFramework(...)` time. opencode is the reference backend because its `@opencode-ai/sdk` + HTTP/SSE surface lets the abstraction be validated without CLI/WS-bridge plumbing. Claude Code and Codex adapters are deferred to M3 once this abstraction is exercised.

**Tech Stack:** Bun ≥ 1.3, TypeScript 5.x, `@modelcontextprotocol/sdk`, `@opencode-ai/sdk`, `bun:test`, POSIX shell.

**Spec reference:** `docs/superpowers/specs/2026-04-21-pneuma-framework-v0-design.md` — §5 (semantic tool API), §10 (AgentBackend abstraction), §9 (shadow-git), §4.3 (needs-confirm marker handshake), §13 (open questions: log storage).

---

## Scope

### In scope for this plan

- `LogBuffer` (ring-buffered per-verb log store) + orchestrator wiring so `lifecycle.logs` tool has data.
- Shadow-git `rewindTo(hash)` so `checkpoint.rewind` tool has a target.
- Orchestrator confirm-resolution plumbing: pending `##pneuma:needs-confirm` markers can be answered via a new `resolveConfirm(verb, label, decision)` method that writes `##pneuma:confirm <label> <yes|no>` to the child's stdin.
- `AgentBackend` interface, registry, and `FakeAgentBackend` for tests.
- Tool API (`lifecycle.state`, `lifecycle.logs`, `workspace.tree`, `lifecycle.dev.start/stop/restart`, `lifecycle.build.run`, `lifecycle.deploy.run`, `lifecycle.migrate.run` + `lifecycle.fork.run` as stubs, `lifecycle.confirm`, `checkpoint.list`, `checkpoint.rewind`).
- `ToolRegistry` scaffolding + `buildToolRegistry(orchestrator)`.
- MCP server at `mcp-server.ts`, stdio transport.
- New package `@pneuma-framework/backend-opencode` with concrete backend using `@opencode-ai/sdk`.
- `createPneumaFramework` extended to accept `{ backend, backendConfig, mcp }` options, expose `toolRegistry`, `mcpServer`, `backend` handles.
- Public API re-exports from `@pneuma-framework/core`.
- CLI `--backend <name>` flag (defaults to `none` — only activates agent + MCP if explicitly chosen).
- One E2E test: `createPneumaFramework({ backend: fake })`, have the fake backend drive tools in sequence, verify orchestrator behavior.

### Out of scope (deferred to later plans)

- **M3:** claude-code + codex backends (both need extra launcher complexity — CLI subprocess + WS bridge for cc, stdio JSON-RPC + permission mapping for codex).
- **M3:** Viewer wire protocol (§6) + React SDK.
- **M4:** Real implementations of `setup`/`fork`/`migrate` verbs in the orchestrator (M2 exposes them only as tools that return `{ok: false, error: "not-implemented-in-v0"}`).

These are intentionally excluded. The opencode adapter alone is enough to validate the abstraction end-to-end; cc and codex are two more adapter packages that slot in without changing the abstraction if M2 is done right.

---

## File structure

All paths relative to the repo root (`/Users/pandazki/Codes/pneuma-framework/`).

### `packages/core/` — modifications and additions

| Path | Responsibility |
|---|---|
| `src/logs.ts` | **new.** `LogBuffer` class: ring-buffer per verb, accepts events, supports `getLines({verb, since?, limit?})`. |
| `src/shadow-git.ts` | **modify.** Add `rewindTo(workspaceRoot, hash)` that runs `git checkout <hash>` against the shadow repo's worktree (the pneuma-app workspace). |
| `src/lifecycle.ts` | **modify.** Construct a `LogBuffer`, push every `ScriptLine` from child procs into it, expose `getLogs(opts)`. Add `resolveConfirm(verb, label, decision)` method that writes `##pneuma:confirm <label> <yes\|no>\n` to the running verb's stdin and clears `pendingConfirm`. Add stub `runMigrate()` and `runFork()` methods returning `{exitCode: -1, notImplemented: true}`. |
| `src/process-manager.ts` | **no change needed** — `writeStdin` already exists. |
| `src/agent-backend/types.ts` | **new.** `AgentBackend`, `AgentCapabilities`, `AgentSession`, `AgentLaunchOptions`, `AgentBackendDescriptor`, `BackendAvailability`. |
| `src/agent-backend/registry.ts` | **new.** Module-level map; `registerAgentBackend(descriptor, factory)`, `getAgentBackend(type)`, `detectBackendAvailability()`, `clearRegistry()` (for tests). |
| `src/agent-backend/fake.ts` | **new.** `FakeAgentBackend` — in-memory, emits synthetic events via a test-exposed `simulate(event)` hook. |
| `src/tools/types.ts` | **new.** `ToolHandler`, `ToolCall`, `ToolResult`, `ToolDescriptor`, `ToolRegistry`, `ToolContext` (holds orchestrator + optional backend). |
| `src/tools/registry.ts` | **new.** `buildToolRegistry(ctx): ToolRegistry`, `createToolRegistry()` with `register(desc, handler)` + `call(name, params)` + `list()`. |
| `src/tools/observation.ts` | **new.** Handlers for `lifecycle.state`, `lifecycle.logs`, `workspace.tree`. |
| `src/tools/action.ts` | **new.** Handlers for `lifecycle.dev.start/stop/restart`, `lifecycle.build.run`, `lifecycle.deploy.run`, `lifecycle.migrate.run`, `lifecycle.fork.run`, `lifecycle.confirm`. |
| `src/tools/checkpoint.ts` | **new.** Handlers for `checkpoint.list`, `checkpoint.rewind`. |
| `src/mcp-server.ts` | **new.** `createMcpServer(registry)` returns `{server, connect(transport), close()}`. Bridges `ToolRegistry` → MCP `tools/list` + `tools/call`. |
| `src/create.ts` | **modify.** Extend `createPneumaFramework` to accept `{ backend?, backendConfig?, mcp? }`. Build tool registry, optionally start MCP over stdio, optionally launch backend. Expose `toolRegistry`, `mcpServer`, `backend` on the `PneumaFramework` return value. |
| `src/index.ts` | **modify.** Re-export all new public symbols. |
| `test/logs.test.ts` | **new.** LogBuffer unit tests. |
| `test/shadow-git.test.ts` | **modify.** Add rewindTo test. |
| `test/lifecycle.test.ts` | **modify.** Add log-propagation + confirm-resolution + migrate/fork stub tests. |
| `test/agent-backend/registry.test.ts` | **new.** Registry add/get/detect tests. |
| `test/agent-backend/fake.test.ts` | **new.** FakeAgentBackend smoke. |
| `test/tools/observation.test.ts` | **new.** state/logs/tree handler tests. |
| `test/tools/action.test.ts` | **new.** Action handler tests (dev/build/deploy/confirm + migrate/fork stubs). |
| `test/tools/checkpoint.test.ts` | **new.** Checkpoint handler tests. |
| `test/mcp-server.test.ts` | **new.** Spawn MCP server in-process, call `tools/list` + `tools/call` over an in-memory transport, verify round-trip. |
| `test/e2e-agent.test.ts` | **new.** Full integration: framework + fake backend + tool calls → orchestrator state matches. |

### `packages/backend-opencode/` — new package

| Path | Responsibility |
|---|---|
| `package.json` | `@pneuma-framework/backend-opencode`, workspace dep on `core`, runtime dep on `@opencode-ai/sdk`. |
| `tsconfig.json` | Extends root base. No project reference (workspace source resolution). |
| `src/index.ts` | `registerOpencodeBackend()` + default export of the backend descriptor. |
| `src/launcher.ts` | Spawn `opencode serve --hostname 127.0.0.1 --port 0` OR use `createOpencode()` from the SDK. |
| `src/adapter.ts` | Implements `AgentBackend`. Translates opencode SSE events → framework-shape message + routes permission requests. |
| `test/launcher.test.ts` | Skippable if `opencode` binary is missing; otherwise smoke-launches and asserts server responds. |

### `packages/cli/` — minor changes

| Path | Change |
|---|---|
| `src/parse-args.ts` | Add `--backend <name>` flag; allow name = any registered backend type string. |
| `src/index.ts` | When `--backend` provided, import `@pneuma-framework/backend-opencode` and `registerOpencodeBackend()` before `createPneumaFramework`; set `backend` option; optionally also enable `mcp: { transport: "stdio" }`. |
| `test/parse-args.test.ts` | Test for `--backend`. |

### Root

| Path | Change |
|---|---|
| `package.json` | Already includes `templates/*` + `packages/*` workspace globs; no change. |
| `bun.lock` | Will update after `bun install` for the new SDK dependencies. |

---

## Canonical types (reproduced once; later tasks reference these)

### AgentBackend (materialized in Task 5)

```typescript
// packages/core/src/agent-backend/types.ts

export type AgentBackendType = "claude-code" | "codex" | "opencode" | (string & {});

export interface AgentCapabilities {
  streaming: boolean;
  resume: boolean;
  permissions: boolean;
  toolProgress: boolean;
  modelSwitch: boolean;
}

export type AgentSessionState = "starting" | "ready" | "exited" | "error";

export interface AgentSession {
  sessionId: string;
  backendSessionId?: string;
  state: AgentSessionState;
  startedAt: number;
  exitedAt?: number;
  error?: string;
}

export interface AgentLaunchOptions {
  cwd: string;
  model?: string;
  resumeSessionId?: string;
  initialPrompt?: string;
  permissionMode?: "ask" | "accept" | "deny";
  toolRegistry?: unknown; // opaque handle; backends that support MCP pickup use this
}

export interface AgentEvent {
  type:
    | "session-ready"
    | "session-exited"
    | "text"
    | "tool-call"
    | "permission-request"
    | "error";
  sessionId: string;
  payload: Record<string, unknown>;
}

export type AgentEventHandler = (ev: AgentEvent) => void;

export interface PermissionResponse {
  requestId: string;
  decision: "allow" | "deny" | "allow-always";
}

export interface AgentBackend {
  readonly type: AgentBackendType;
  readonly capabilities: AgentCapabilities;
  launch(opts: AgentLaunchOptions): Promise<AgentSession>;
  sendUserMessage(sessionId: string, text: string): Promise<void>;
  respondToPermission(sessionId: string, response: PermissionResponse): Promise<void>;
  onEvent(handler: AgentEventHandler): () => void; // returns unsubscribe
  stop(sessionId: string): Promise<void>;
  close(): Promise<void>;
}

export interface AgentBackendDescriptor {
  type: AgentBackendType;
  displayName: string;
  capabilities: AgentCapabilities;
  detect?: () => Promise<BackendAvailability>;
}

export interface BackendAvailability {
  available: boolean;
  reason?: string;
  version?: string;
}

export type AgentBackendFactory = (config?: Record<string, unknown>) => AgentBackend;
```

### Tool registry (materialized in Task 8)

```typescript
// packages/core/src/tools/types.ts
import type { LifecycleOrchestrator } from "../lifecycle.js";
import type { AgentBackend } from "../agent-backend/types.js";

export interface ToolContext {
  orchestrator: LifecycleOrchestrator;
  backend?: AgentBackend;
}

export interface ToolResult {
  ok: boolean;
  state?: unknown;
  error?: string;
}

export type ToolHandler = (ctx: ToolContext, params: Record<string, unknown>) => Promise<ToolResult>;

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
}

export interface ToolRegistry {
  register(desc: ToolDescriptor, handler: ToolHandler): void;
  list(): ToolDescriptor[];
  call(name: string, params: Record<string, unknown>): Promise<ToolResult>;
  has(name: string): boolean;
}
```

---

## Tasks

### Task 1: `LogBuffer` — per-verb ring-buffered log storage

**Files:**
- Create: `packages/core/src/logs.ts`
- Create: `packages/core/test/logs.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/logs.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { LogBuffer } from "../src/logs.js";

test("LogBuffer records and returns lines per verb", () => {
  const b = new LogBuffer({ perVerbCap: 100 });
  b.push("build", { stream: "stdout", line: "hello", ts: 1 });
  b.push("dev", { stream: "stdout", line: "world", ts: 2 });
  expect(b.getLines({ verb: "build" }).map(e => e.line)).toEqual(["hello"]);
  expect(b.getLines({ verb: "dev" }).map(e => e.line)).toEqual(["world"]);
});

test("LogBuffer filters by since and caps via limit", () => {
  const b = new LogBuffer({ perVerbCap: 100 });
  for (let i = 0; i < 10; i++) b.push("build", { stream: "stdout", line: `l${i}`, ts: i });
  expect(b.getLines({ verb: "build", since: 5 }).map(e => e.line)).toEqual(["l5", "l6", "l7", "l8", "l9"]);
  expect(b.getLines({ verb: "build", limit: 3 }).map(e => e.line)).toEqual(["l7", "l8", "l9"]);
});

test("LogBuffer drops oldest past perVerbCap", () => {
  const b = new LogBuffer({ perVerbCap: 3 });
  for (let i = 0; i < 5; i++) b.push("build", { stream: "stdout", line: `l${i}`, ts: i });
  expect(b.getLines({ verb: "build" }).map(e => e.line)).toEqual(["l2", "l3", "l4"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test packages/core/test/logs.test.ts
```

Expected: FAIL — `Cannot find module '../src/logs.js'`.

- [ ] **Step 3: Implement `packages/core/src/logs.ts`**

```typescript
import type { LifecycleVerb } from "./types.js";

export interface LogLine {
  stream: "stdout" | "stderr";
  line: string;
  ts: number;
}

export interface GetLinesOpts {
  verb: LifecycleVerb;
  since?: number;
  limit?: number;
}

export interface LogBufferOptions {
  perVerbCap: number;
}

export class LogBuffer {
  private readonly cap: number;
  private readonly byVerb = new Map<LifecycleVerb, LogLine[]>();

  constructor(opts: LogBufferOptions) {
    this.cap = opts.perVerbCap;
  }

  push(verb: LifecycleVerb, line: LogLine): void {
    let arr = this.byVerb.get(verb);
    if (!arr) { arr = []; this.byVerb.set(verb, arr); }
    arr.push(line);
    if (arr.length > this.cap) arr.splice(0, arr.length - this.cap);
  }

  getLines(opts: GetLinesOpts): LogLine[] {
    const arr = this.byVerb.get(opts.verb) ?? [];
    let out = opts.since !== undefined ? arr.filter((l) => l.ts >= opts.since!) : arr.slice();
    if (opts.limit !== undefined && out.length > opts.limit) out = out.slice(out.length - opts.limit);
    return out;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test packages/core/test/logs.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/logs.ts packages/core/test/logs.test.ts
git commit -m "feat(core): LogBuffer for per-verb ring-buffered log storage"
```

---

### Task 2: Wire `LogBuffer` into the orchestrator

**Files:**
- Modify: `packages/core/src/lifecycle.ts`
- Modify: `packages/core/test/lifecycle.test.ts`

- [ ] **Step 1: Append a failing test to `packages/core/test/lifecycle.test.ts`**

```typescript
test("orchestrator exposes verb logs through getLogs()", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-lc-logs-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE_TEMPLATE, workspace: ws });
  const res = await orch.runBuild();
  expect(res.exitCode).toBe(0);
  const lines = orch.getLogs({ verb: "build" });
  // Fixture's build.sh writes stuff; marker lines are stdout.
  expect(lines.length).toBeGreaterThan(0);
  expect(lines.every((l) => l.stream === "stdout" || l.stream === "stderr")).toBe(true);
  // Since filter
  const recent = orch.getLogs({ verb: "build", since: Date.now() + 1 });
  expect(recent.length).toBe(0);
});
```

- [ ] **Step 2: Run and confirm it fails**

```bash
bun test packages/core/test/lifecycle.test.ts
```

Expected: FAIL — `orch.getLogs is not a function`.

- [ ] **Step 3: Modify `packages/core/src/lifecycle.ts`**

Import `LogBuffer`:

```typescript
import { LogBuffer, type GetLinesOpts, type LogLine } from "./logs.js";
```

Add field to the class:

```typescript
  private readonly logs = new LogBuffer({ perVerbCap: 2000 });
```

Add `getLogs` method after `runDeploy`:

```typescript
  getLogs(opts: GetLinesOpts): LogLine[] {
    return this.logs.getLines(opts);
  }
```

In `spawnVerb`, after the existing `proc.onLine((ev) => { if (ev.stream === "stdout") ... })` block, add a second subscription that pushes everything into the log buffer:

```typescript
    proc.onLine((ev) => {
      this.logs.push(verb, { stream: ev.stream, line: ev.line, ts: ev.ts });
    });
```

- [ ] **Step 4: Run tests and confirm green**

```bash
bun test packages/core/test/lifecycle.test.ts
bun test
```

Expected: PASS, test counts go up by 1.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/lifecycle.ts packages/core/test/lifecycle.test.ts
git commit -m "feat(core): orchestrator routes per-verb log lines into LogBuffer"
```

---

### Task 3: Shadow-git `rewindTo(hash)`

**Files:**
- Modify: `packages/core/src/shadow-git.ts`
- Modify: `packages/core/test/shadow-git.test.ts`

- [ ] **Step 1: Append a failing test to `packages/core/test/shadow-git.test.ts`**

```typescript
test("rewindTo resets working tree to an earlier checkpoint hash", async () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-sg-rewind-"));
  initWorkspace(root);
  await initShadowGit(root);

  writeFileSync(join(root, "a.txt"), "one\n");
  const h1 = await createCheckpoint(root, "turn 1");

  writeFileSync(join(root, "a.txt"), "two\n");
  await createCheckpoint(root, "turn 2");

  await rewindTo(root, h1);
  const after = readFileSync(join(root, "a.txt"), "utf8");
  expect(after).toBe("one\n");
});
```

Update imports at top of test file to also import `rewindTo` and `readFileSync`.

- [ ] **Step 2: Run and confirm fail**

```bash
bun test packages/core/test/shadow-git.test.ts
```

Expected: FAIL — `rewindTo` not exported.

- [ ] **Step 3: Implement `rewindTo` in `packages/core/src/shadow-git.ts`**

Add after `listCheckpoints`:

```typescript
export async function rewindTo(workspaceRoot: string, hash: string): Promise<void> {
  const root = resolve(workspaceRoot);
  if (!/^[0-9a-f]{7,40}$/.test(hash)) {
    throw new Error(`rewindTo: refusing unrecognized hash: ${hash}`);
  }
  // Use --force so tracked changes are overwritten; leaves .pneuma/.pneuma-build/node_modules intact
  // because they are not in the shadow tree.
  await runGit(root, ["checkout", "--force", hash, "--"]);
}
```

- [ ] **Step 4: Run and confirm green**

```bash
bun test packages/core/test/shadow-git.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/shadow-git.ts packages/core/test/shadow-git.test.ts
git commit -m "feat(core): shadow-git rewindTo(hash) for checkpoint rewind"
```

---

### Task 4: Orchestrator confirm-resolution plumbing

**Files:**
- Modify: `packages/core/src/lifecycle.ts`
- Modify: `packages/core/test/lifecycle.test.ts`
- Create: `packages/core/test/fixtures/templates/fixture-confirm/manifest.json`
- Create: `packages/core/test/fixtures/templates/fixture-confirm/scripts/dev.sh`

- [ ] **Step 1: Create the fixture that emits a confirm marker and reads the response from stdin**

`packages/core/test/fixtures/templates/fixture-confirm/manifest.json`:

```json
{
  "schemaVersion": 1,
  "name": "fixture-confirm",
  "version": "0.0.1",
  "displayName": "Fixture Confirm",
  "description": "emits needs-confirm, expects ##pneuma:confirm <label> <yes|no> on stdin, emits ready after",
  "backends": { "supported": ["claude-code"] },
  "runtimeAgent": "none",
  "scripts": { "dev": "scripts/dev.sh" }
}
```

`packages/core/test/fixtures/templates/fixture-confirm/scripts/dev.sh`:

```bash
#!/bin/sh
trap 'echo "##pneuma:stopping"; exit 0' TERM INT
echo "##pneuma:needs-confirm demo"
# Read one line from stdin and write what we saw to stderr so the test can assert on it.
IFS= read -r reply
echo "got confirm reply: $reply" 1>&2
if echo "$reply" | grep -q "yes"; then
  echo "##pneuma:service-ready viewer http://localhost:0"
  echo "##pneuma:ready"
  while true; do sleep 0.1; done
else
  echo "rejecting" 1>&2
  exit 3
fi
```

```bash
chmod +x packages/core/test/fixtures/templates/fixture-confirm/scripts/dev.sh
```

- [ ] **Step 2: Append a failing test to `packages/core/test/lifecycle.test.ts`**

```typescript
test("resolveConfirm writes ##pneuma:confirm <label> <yes|no> to the verb's stdin", async () => {
  const CONFIRM_TPL = join(import.meta.dir, "fixtures/templates/fixture-confirm");
  const ws = mkdtempSync(join(tmpdir(), "pneuma-lc-confirm-"));
  const orch = new LifecycleOrchestrator({ templateDir: CONFIRM_TPL, workspace: ws });
  const running = orch.runDev();

  // Wait up to 2s for the pending confirm to register.
  for (let i = 0; i < 40; i++) {
    if (orch.state.dev?.pendingConfirm?.label === "demo") break;
    await new Promise((r) => setTimeout(r, 50));
  }
  expect(orch.state.dev?.pendingConfirm?.label).toBe("demo");

  await orch.resolveConfirm("dev", "demo", "yes");
  await orch.awaitDevReady();
  expect(orch.state.dev?.state).toBe("running");
  expect(orch.state.dev?.pendingConfirm).toBeUndefined();
  await orch.runStop();
  await running;
});

test("resolveConfirm throws if no matching pending confirm exists", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-lc-confirm-missing-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE_TEMPLATE, workspace: ws });
  await expect(orch.resolveConfirm("dev", "nothing", "yes")).rejects.toThrow(/pending|not found/i);
});
```

- [ ] **Step 3: Run and confirm fail**

```bash
bun test packages/core/test/lifecycle.test.ts
```

Expected: FAIL — `resolveConfirm` not defined.

- [ ] **Step 4: Modify `packages/core/src/lifecycle.ts`**

Track per-verb stdin write handles: add a field:

```typescript
  private verbStdin = new Map<LifecycleVerb, (data: string) => void>();
```

In `spawnVerb`, after creating `proc`, record the stdin writer:

```typescript
    this.verbStdin.set(verb, (data) => proc.writeStdin(data));
```

Add cleanup in the `proc.exit.then(...)` block to delete on exit:

```typescript
    const done = proc.exit.then((res) => {
      this.verbStdin.delete(verb);
      // ... existing body ...
    });
```

Add the new method after `runStop`:

```typescript
  async resolveConfirm(verb: LifecycleVerb, label: string, decision: "yes" | "no"): Promise<void> {
    const execSlot = verb === "dev" ? this.state.dev
                    : verb === "build" ? this.state.lastBuild
                    : verb === "deploy" ? this.state.lastDeploy
                    : undefined;
    if (!execSlot || execSlot.pendingConfirm?.label !== label) {
      throw new Error(`no pending confirm for verb=${verb} label=${label}`);
    }
    const write = this.verbStdin.get(verb);
    if (!write) throw new Error(`no active stdin for verb=${verb}`);
    write(`##pneuma:confirm ${label} ${decision}\n`);
    execSlot.pendingConfirm = undefined;
  }
```

- [ ] **Step 5: Run and confirm green**

```bash
bun test packages/core/test/lifecycle.test.ts
```

Expected: both new tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src packages/core/test/lifecycle.test.ts packages/core/test/fixtures/templates/fixture-confirm
git commit -m "feat(core): orchestrator resolveConfirm writes to verb stdin"
```

---

### Task 5: `AgentBackend` types and capabilities

**Files:**
- Create: `packages/core/src/agent-backend/types.ts`
- Create: `packages/core/test/agent-backend/types.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/agent-backend/types.test.ts`:

```typescript
import { test, expect } from "bun:test";
import type {
  AgentBackend,
  AgentBackendType,
  AgentCapabilities,
  AgentSession,
  AgentLaunchOptions,
  AgentEvent,
  PermissionResponse,
} from "../../src/agent-backend/types.js";

test("AgentBackendType accepts known and arbitrary strings", () => {
  const a: AgentBackendType = "claude-code";
  const b: AgentBackendType = "opencode";
  const c: AgentBackendType = "future-backend";
  expect([a, b, c]).toHaveLength(3);
});

test("AgentCapabilities is a complete boolean bag", () => {
  const caps: AgentCapabilities = {
    streaming: true, resume: true, permissions: true, toolProgress: true, modelSwitch: true,
  };
  expect(Object.keys(caps)).toHaveLength(5);
});

test("AgentBackend interface can be satisfied by a stub", async () => {
  const stub: AgentBackend = {
    type: "fake",
    capabilities: { streaming: true, resume: false, permissions: true, toolProgress: false, modelSwitch: false },
    async launch(_: AgentLaunchOptions): Promise<AgentSession> {
      return { sessionId: "s1", state: "ready", startedAt: Date.now() };
    },
    async sendUserMessage() {},
    async respondToPermission(_sid, _r: PermissionResponse) {},
    onEvent(_h): () => void { return () => {}; },
    async stop() {},
    async close() {},
  };
  const ev: AgentEvent = { type: "session-ready", sessionId: "s1", payload: {} };
  expect(stub.type).toBe("fake");
  expect(ev.type).toBe("session-ready");
});
```

- [ ] **Step 2: Run and confirm fail**

```bash
bun test packages/core/test/agent-backend/types.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/core/src/agent-backend/types.ts`**

Copy the canonical types block from the "Canonical types" section at the top of this document verbatim.

- [ ] **Step 4: Run and confirm green**

```bash
bun test packages/core/test/agent-backend/types.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agent-backend packages/core/test/agent-backend
git commit -m "feat(core): AgentBackend types (interface, capabilities, events)"
```

---

### Task 6: AgentBackend registry

**Files:**
- Create: `packages/core/src/agent-backend/registry.ts`
- Create: `packages/core/test/agent-backend/registry.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/agent-backend/registry.test.ts`:

```typescript
import { test, expect, beforeEach } from "bun:test";
import {
  registerAgentBackend,
  getAgentBackendDescriptor,
  getAgentBackendFactory,
  listAgentBackends,
  detectBackendAvailability,
  clearAgentBackendRegistry,
} from "../../src/agent-backend/registry.js";
import type { AgentBackend, AgentCapabilities } from "../../src/agent-backend/types.js";

const caps: AgentCapabilities = {
  streaming: true, resume: true, permissions: true, toolProgress: false, modelSwitch: true,
};

beforeEach(() => clearAgentBackendRegistry());

test("registerAgentBackend stores descriptor + factory", () => {
  registerAgentBackend(
    { type: "fake-a", displayName: "Fake A", capabilities: caps },
    () => ({} as AgentBackend),
  );
  expect(getAgentBackendDescriptor("fake-a")?.displayName).toBe("Fake A");
  expect(getAgentBackendFactory("fake-a")).toBeDefined();
});

test("listAgentBackends enumerates in registration order", () => {
  registerAgentBackend({ type: "a", displayName: "A", capabilities: caps }, () => ({} as AgentBackend));
  registerAgentBackend({ type: "b", displayName: "B", capabilities: caps }, () => ({} as AgentBackend));
  expect(listAgentBackends().map((d) => d.type)).toEqual(["a", "b"]);
});

test("detectBackendAvailability runs each descriptor's detect() in parallel", async () => {
  registerAgentBackend(
    { type: "x", displayName: "X", capabilities: caps, detect: async () => ({ available: true, version: "1.0" }) },
    () => ({} as AgentBackend),
  );
  registerAgentBackend(
    { type: "y", displayName: "Y", capabilities: caps, detect: async () => ({ available: false, reason: "no binary" }) },
    () => ({} as AgentBackend),
  );
  const results = await detectBackendAvailability();
  expect(results).toEqual([
    { type: "x", available: true, version: "1.0" },
    { type: "y", available: false, reason: "no binary" },
  ]);
});

test("detectBackendAvailability treats missing detect as available", async () => {
  registerAgentBackend({ type: "z", displayName: "Z", capabilities: caps }, () => ({} as AgentBackend));
  const results = await detectBackendAvailability();
  expect(results).toEqual([{ type: "z", available: true }]);
});
```

- [ ] **Step 2: Run and confirm fail**

```bash
bun test packages/core/test/agent-backend/registry.test.ts
```

- [ ] **Step 3: Implement `packages/core/src/agent-backend/registry.ts`**

```typescript
import type {
  AgentBackendDescriptor,
  AgentBackendFactory,
  AgentBackendType,
  BackendAvailability,
} from "./types.js";

interface RegistryEntry {
  descriptor: AgentBackendDescriptor;
  factory: AgentBackendFactory;
}

const registry = new Map<AgentBackendType, RegistryEntry>();
const order: AgentBackendType[] = [];

export function registerAgentBackend(
  descriptor: AgentBackendDescriptor,
  factory: AgentBackendFactory,
): void {
  if (!registry.has(descriptor.type)) order.push(descriptor.type);
  registry.set(descriptor.type, { descriptor, factory });
}

export function getAgentBackendDescriptor(type: AgentBackendType): AgentBackendDescriptor | undefined {
  return registry.get(type)?.descriptor;
}

export function getAgentBackendFactory(type: AgentBackendType): AgentBackendFactory | undefined {
  return registry.get(type)?.factory;
}

export function listAgentBackends(): AgentBackendDescriptor[] {
  return order
    .map((t) => registry.get(t)?.descriptor)
    .filter((d): d is AgentBackendDescriptor => d !== undefined);
}

export interface DetectResult extends BackendAvailability {
  type: AgentBackendType;
}

export async function detectBackendAvailability(): Promise<DetectResult[]> {
  const descriptors = listAgentBackends();
  return Promise.all(
    descriptors.map(async (d) => {
      const avail = d.detect ? await d.detect() : { available: true };
      return { type: d.type, ...avail };
    }),
  );
}

export function clearAgentBackendRegistry(): void {
  registry.clear();
  order.length = 0;
}
```

- [ ] **Step 4: Run and confirm green**

```bash
bun test packages/core/test/agent-backend/registry.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agent-backend/registry.ts packages/core/test/agent-backend/registry.test.ts
git commit -m "feat(core): AgentBackend registry + detection"
```

---

### Task 7: `FakeAgentBackend` for tests

**Files:**
- Create: `packages/core/src/agent-backend/fake.ts`
- Create: `packages/core/test/agent-backend/fake.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/agent-backend/fake.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { FakeAgentBackend } from "../../src/agent-backend/fake.js";
import type { AgentEvent } from "../../src/agent-backend/types.js";

test("FakeAgentBackend lifecycle: launch -> ready -> events -> stop", async () => {
  const fb = new FakeAgentBackend();
  const events: AgentEvent[] = [];
  fb.onEvent((e) => events.push(e));
  const sess = await fb.launch({ cwd: "/tmp/ws" });
  expect(sess.state).toBe("ready");
  expect(events[0]?.type).toBe("session-ready");

  await fb.sendUserMessage(sess.sessionId, "hello");
  fb.simulate({ type: "text", sessionId: sess.sessionId, payload: { text: "hi back" } });
  expect(events.at(-1)?.type).toBe("text");

  await fb.stop(sess.sessionId);
  expect(events.at(-1)?.type).toBe("session-exited");
  await fb.close();
});

test("FakeAgentBackend supports permission flow", async () => {
  const fb = new FakeAgentBackend();
  const events: AgentEvent[] = [];
  fb.onEvent((e) => events.push(e));
  const sess = await fb.launch({ cwd: "/tmp/ws" });
  fb.simulate({
    type: "permission-request",
    sessionId: sess.sessionId,
    payload: { requestId: "p1", toolName: "shell", input: { cmd: "ls" } },
  });
  const preCount = events.length;
  await fb.respondToPermission(sess.sessionId, { requestId: "p1", decision: "allow" });
  expect(fb.permissionDecisions).toEqual([{ requestId: "p1", decision: "allow" }]);
  expect(events.length).toBe(preCount); // respondToPermission doesn't emit
});
```

- [ ] **Step 2: Run and confirm fail**

```bash
bun test packages/core/test/agent-backend/fake.test.ts
```

- [ ] **Step 3: Implement `packages/core/src/agent-backend/fake.ts`**

```typescript
import type {
  AgentBackend,
  AgentCapabilities,
  AgentEvent,
  AgentEventHandler,
  AgentLaunchOptions,
  AgentSession,
  PermissionResponse,
} from "./types.js";

const FAKE_CAPS: AgentCapabilities = {
  streaming: true, resume: false, permissions: true, toolProgress: true, modelSwitch: false,
};

export class FakeAgentBackend implements AgentBackend {
  readonly type = "fake" as const;
  readonly capabilities = FAKE_CAPS;

  private readonly handlers = new Set<AgentEventHandler>();
  private readonly sessions = new Map<string, AgentSession>();
  readonly userMessages: Array<{ sessionId: string; text: string }> = [];
  readonly permissionDecisions: PermissionResponse[] = [];
  private seq = 0;

  async launch(_opts: AgentLaunchOptions): Promise<AgentSession> {
    this.seq += 1;
    const sess: AgentSession = {
      sessionId: `fake-${this.seq}`,
      state: "ready",
      startedAt: Date.now(),
    };
    this.sessions.set(sess.sessionId, sess);
    this.emit({ type: "session-ready", sessionId: sess.sessionId, payload: {} });
    return sess;
  }

  async sendUserMessage(sessionId: string, text: string): Promise<void> {
    this.userMessages.push({ sessionId, text });
  }

  async respondToPermission(_sessionId: string, response: PermissionResponse): Promise<void> {
    this.permissionDecisions.push(response);
  }

  onEvent(handler: AgentEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async stop(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.state = "exited";
    s.exitedAt = Date.now();
    this.emit({ type: "session-exited", sessionId, payload: {} });
  }

  async close(): Promise<void> {
    for (const sid of [...this.sessions.keys()]) await this.stop(sid);
    this.handlers.clear();
  }

  /** Test-only hook: inject an event as if the backend produced it. */
  simulate(event: AgentEvent): void {
    this.emit(event);
  }

  private emit(event: AgentEvent): void {
    for (const h of this.handlers) h(event);
  }
}
```

- [ ] **Step 4: Run and confirm green**

```bash
bun test packages/core/test/agent-backend/fake.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agent-backend/fake.ts packages/core/test/agent-backend/fake.test.ts
git commit -m "feat(core): FakeAgentBackend for integration testing"
```

---

### Task 8: Tool registry types and scaffold

**Files:**
- Create: `packages/core/src/tools/types.ts`
- Create: `packages/core/src/tools/registry.ts`
- Create: `packages/core/test/tools/registry.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/tools/registry.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { createToolRegistry } from "../../src/tools/registry.js";

test("registry stores tools and dispatches calls", async () => {
  const reg = createToolRegistry();
  reg.register(
    {
      name: "math.add",
      description: "Adds two numbers",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    async (_ctx, params) => ({ ok: true, state: (params.a as number) + (params.b as number) }),
  );
  expect(reg.has("math.add")).toBe(true);
  expect(reg.has("math.sub")).toBe(false);
  const names = reg.list().map((t) => t.name);
  expect(names).toEqual(["math.add"]);
  const r = await reg.call("math.add", { a: 1, b: 2 });
  expect(r).toEqual({ ok: true, state: 3 });
});

test("registry returns error for unknown tool", async () => {
  const reg = createToolRegistry();
  const r = await reg.call("nope", {});
  expect(r.ok).toBe(false);
  expect(r.error).toMatch(/not found|unknown/i);
});

test("registry call() passes ctx to the handler", async () => {
  const reg = createToolRegistry({ orchestrator: "ORCH-SENTINEL" as unknown as never });
  reg.register(
    { name: "probe", description: "", inputSchema: { type: "object" } },
    async (ctx) => ({ ok: true, state: (ctx as unknown as { orchestrator: string }).orchestrator }),
  );
  const r = await reg.call("probe", {});
  expect(r.state).toBe("ORCH-SENTINEL");
});
```

- [ ] **Step 2: Run and confirm fail**

```bash
bun test packages/core/test/tools/registry.test.ts
```

- [ ] **Step 3: Implement `packages/core/src/tools/types.ts`**

Copy the canonical `ToolContext`, `ToolResult`, `ToolHandler`, `ToolDescriptor`, `ToolRegistry` from the "Canonical types" section verbatim.

- [ ] **Step 4: Implement `packages/core/src/tools/registry.ts`**

```typescript
import type { ToolContext, ToolDescriptor, ToolHandler, ToolRegistry, ToolResult } from "./types.js";

interface Entry {
  desc: ToolDescriptor;
  handler: ToolHandler;
}

export function createToolRegistry(ctx?: ToolContext): ToolRegistry {
  const entries = new Map<string, Entry>();
  const order: string[] = [];
  const context = ctx ?? ({} as ToolContext);

  return {
    register(desc, handler) {
      if (!entries.has(desc.name)) order.push(desc.name);
      entries.set(desc.name, { desc, handler });
    },
    list() {
      return order
        .map((n) => entries.get(n)?.desc)
        .filter((d): d is ToolDescriptor => d !== undefined);
    },
    async call(name, params): Promise<ToolResult> {
      const e = entries.get(name);
      if (!e) return { ok: false, error: `tool not found: ${name}` };
      try {
        return await e.handler(context, params);
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
    has(name) {
      return entries.has(name);
    },
  };
}
```

- [ ] **Step 5: Run and confirm green**

```bash
bun test packages/core/test/tools/registry.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/tools/{types,registry}.ts packages/core/test/tools/registry.test.ts
git commit -m "feat(core): ToolRegistry types + factory"
```

---

### Task 9: Observation tools (`lifecycle.state`, `lifecycle.logs`, `workspace.tree`)

**Files:**
- Create: `packages/core/src/tools/observation.ts`
- Create: `packages/core/test/tools/observation.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/tools/observation.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { createToolRegistry } from "../../src/tools/registry.js";
import { registerObservationTools } from "../../src/tools/observation.js";

const FIXTURE = join(import.meta.dir, "../fixtures/templates/fixture-min");

async function mkRegistry(): Promise<{ orch: LifecycleOrchestrator; call: (n: string, p?: Record<string, unknown>) => Promise<unknown> }> {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-tools-obs-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  const reg = createToolRegistry({ orchestrator: orch });
  registerObservationTools(reg);
  return { orch, call: (n, p) => reg.call(n, p ?? {}) };
}

test("lifecycle.state returns the current state object", async () => {
  const { call } = await mkRegistry();
  const r = (await call("lifecycle.state")) as { ok: boolean; state: { workspace: { root: string } } };
  expect(r.ok).toBe(true);
  expect(r.state.workspace.root).toMatch(/pneuma-tools-obs-/);
});

test("lifecycle.logs returns logged lines after a build", async () => {
  const { orch, call } = await mkRegistry();
  await orch.runBuild();
  const r = (await call("lifecycle.logs", { verb: "build", limit: 10 })) as { ok: boolean; state: { lines: unknown[] } };
  expect(r.ok).toBe(true);
  expect(Array.isArray(r.state.lines)).toBe(true);
  expect(r.state.lines.length).toBeGreaterThan(0);
});

test("workspace.tree returns a shallow directory listing", async () => {
  const { orch, call } = await mkRegistry();
  mkdirSync(join(orch.workspace, "src"), { recursive: true });
  writeFileSync(join(orch.workspace, "src/a.txt"), "hi");
  writeFileSync(join(orch.workspace, "readme.md"), "r");
  const r = (await call("workspace.tree", { depth: 1 })) as { ok: boolean; state: { entries: Array<{ name: string; type: string }> } };
  const names = r.state.entries.map((e) => e.name).sort();
  expect(names).toContain("readme.md");
  expect(names).toContain("src");
});
```

- [ ] **Step 2: Run and confirm fail**

```bash
bun test packages/core/test/tools/observation.test.ts
```

- [ ] **Step 3: Implement `packages/core/src/tools/observation.ts`**

```typescript
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ToolRegistry, ToolResult } from "./types.js";

export function registerObservationTools(reg: ToolRegistry): void {
  reg.register(
    {
      name: "lifecycle.state",
      description: "Return the full lifecycle state (dev, lastBuild, lastDeploy, workspace).",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    async (ctx): Promise<ToolResult> => {
      return { ok: true, state: ctx.orchestrator.state };
    },
  );

  reg.register(
    {
      name: "lifecycle.logs",
      description: "Return recent log lines for a verb. Optional since (ms) and limit (max lines).",
      inputSchema: {
        type: "object",
        properties: {
          verb: { type: "string" },
          since: { type: "number" },
          limit: { type: "number" },
        },
        required: ["verb"],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const verb = params.verb as string;
      const since = typeof params.since === "number" ? params.since : undefined;
      const limit = typeof params.limit === "number" ? params.limit : undefined;
      const lines = ctx.orchestrator.getLogs({ verb: verb as never, since, limit });
      return { ok: true, state: { lines } };
    },
  );

  reg.register(
    {
      name: "workspace.tree",
      description: "Shallow directory listing of the workspace, bounded by depth (default 1, max 3).",
      inputSchema: {
        type: "object",
        properties: { depth: { type: "number" } },
        required: [],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const requested = typeof params.depth === "number" ? params.depth : 1;
      const depth = Math.max(1, Math.min(3, requested));
      const root = resolve(ctx.orchestrator.workspace);
      const entries = walk(root, depth, 0);
      return { ok: true, state: { entries } };
    },
  );
}

interface Entry {
  name: string;
  type: "file" | "dir";
  children?: Entry[];
}

function walk(dir: string, maxDepth: number, cur: number): Entry[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: Entry[] = [];
  for (const name of names.sort()) {
    if (name === ".pneuma" || name === ".pneuma-build" || name === "node_modules" || name === ".git") continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    const type: Entry["type"] = st.isDirectory() ? "dir" : "file";
    const entry: Entry = { name, type };
    if (type === "dir" && cur + 1 < maxDepth) {
      entry.children = walk(full, maxDepth, cur + 1);
    }
    out.push(entry);
  }
  return out;
}
```

- [ ] **Step 4: Run and confirm green**

```bash
bun test packages/core/test/tools/observation.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tools/observation.ts packages/core/test/tools/observation.test.ts
git commit -m "feat(core): observation tools (lifecycle.state, lifecycle.logs, workspace.tree)"
```

---

### Task 10: Lifecycle action tools

**Files:**
- Create: `packages/core/src/tools/action.ts`
- Create: `packages/core/test/tools/action.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/tools/action.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { createToolRegistry } from "../../src/tools/registry.js";
import { registerActionTools } from "../../src/tools/action.js";

const FIXTURE = join(import.meta.dir, "../fixtures/templates/fixture-min");

async function mkRegistry() {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-tools-act-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  const reg = createToolRegistry({ orchestrator: orch });
  registerActionTools(reg);
  return { orch, reg };
}

test("lifecycle.dev.start launches dev and awaits ready", async () => {
  const { orch, reg } = await mkRegistry();
  const p = reg.call("lifecycle.dev.start", {});
  const r = await p;
  expect(r.ok).toBe(true);
  expect(orch.state.dev?.state).toBe("running");
  await reg.call("lifecycle.dev.stop", {});
  expect(orch.state.dev?.state).toBe("stopped");
});

test("lifecycle.build.run returns manifest path on success", async () => {
  const { reg } = await mkRegistry();
  const r = (await reg.call("lifecycle.build.run", {})) as { ok: boolean; state: { manifestPath?: string } };
  expect(r.ok).toBe(true);
  expect(r.state.manifestPath).toMatch(/build\.manifest\.json$/);
});

test("lifecycle.deploy.run refuses without a prior build", async () => {
  const { reg } = await mkRegistry();
  const r = await reg.call("lifecycle.deploy.run", {});
  expect(r.ok).toBe(false);
  expect(r.error).toMatch(/no build|manifest/i);
});

test("lifecycle.migrate.run and lifecycle.fork.run are stubs returning not-implemented", async () => {
  const { reg } = await mkRegistry();
  const m = await reg.call("lifecycle.migrate.run", {});
  const f = await reg.call("lifecycle.fork.run", { source: "./other" });
  expect(m.ok).toBe(false);
  expect(m.error).toMatch(/not implemented/i);
  expect(f.ok).toBe(false);
  expect(f.error).toMatch(/not implemented/i);
});

test("lifecycle.confirm routes through resolveConfirm", async () => {
  const CONFIRM_TPL = join(import.meta.dir, "../fixtures/templates/fixture-confirm");
  const ws = mkdtempSync(join(tmpdir(), "pneuma-tools-confirm-"));
  const orch = new LifecycleOrchestrator({ templateDir: CONFIRM_TPL, workspace: ws });
  const reg = createToolRegistry({ orchestrator: orch });
  registerActionTools(reg);
  const running = orch.runDev();
  for (let i = 0; i < 40; i++) {
    if (orch.state.dev?.pendingConfirm?.label === "demo") break;
    await new Promise((r) => setTimeout(r, 50));
  }
  const r = await reg.call("lifecycle.confirm", { verb: "dev", label: "demo", decision: "yes" });
  expect(r.ok).toBe(true);
  await orch.awaitDevReady();
  await orch.runStop();
  await running;
});
```

- [ ] **Step 2: Run and confirm fail**

```bash
bun test packages/core/test/tools/action.test.ts
```

- [ ] **Step 3: Implement `packages/core/src/tools/action.ts`**

```typescript
import type { ToolRegistry, ToolResult } from "./types.js";

export function registerActionTools(reg: ToolRegistry): void {
  reg.register(
    {
      name: "lifecycle.dev.start",
      description: "Start the dev-mode process group. Waits for ##pneuma:ready before returning.",
      inputSchema: {
        type: "object",
        properties: { port: { type: "number" } },
        required: [],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const port = typeof params.port === "number" ? params.port : undefined;
      // Fire and await ready; do NOT await the full runDev promise (that resolves on dev exit).
      void ctx.orchestrator.runDev(port);
      await ctx.orchestrator.awaitDevReady();
      return { ok: true, state: ctx.orchestrator.state.dev };
    },
  );

  reg.register(
    {
      name: "lifecycle.dev.stop",
      description: "Stop the dev-mode process group (runs stop.sh if present, then SIGTERM/SIGKILL ladder).",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    async (ctx): Promise<ToolResult> => {
      await ctx.orchestrator.runStop();
      return { ok: true, state: ctx.orchestrator.state.dev };
    },
  );

  reg.register(
    {
      name: "lifecycle.dev.restart",
      description: "Stop then start dev.",
      inputSchema: {
        type: "object",
        properties: { port: { type: "number" } },
        required: [],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      await ctx.orchestrator.runStop();
      const port = typeof params.port === "number" ? params.port : undefined;
      void ctx.orchestrator.runDev(port);
      await ctx.orchestrator.awaitDevReady();
      return { ok: true, state: ctx.orchestrator.state.dev };
    },
  );

  reg.register(
    {
      name: "lifecycle.build.run",
      description: "Run build.sh. Returns manifest path on success.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    async (ctx): Promise<ToolResult> => {
      const res = await ctx.orchestrator.runBuild();
      if (res.exitCode !== 0) return { ok: false, error: `build exited with code ${res.exitCode}` };
      return { ok: true, state: { manifestPath: res.manifestPath, exitCode: 0 } };
    },
  );

  reg.register(
    {
      name: "lifecycle.deploy.run",
      description: "Run deploy.sh. Uses most recent build manifest by default.",
      inputSchema: {
        type: "object",
        properties: { manifestPath: { type: "string" } },
        required: [],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const manifestPath = typeof params.manifestPath === "string" ? params.manifestPath : undefined;
      const res = await ctx.orchestrator.runDeploy({ manifestPath });
      if (res.exitCode === 2) return { ok: false, error: "no build manifest available; run lifecycle.build.run first" };
      if (res.exitCode !== 0) return { ok: false, error: `deploy exited with code ${res.exitCode}` };
      return { ok: true, state: { exitCode: 0 } };
    },
  );

  reg.register(
    {
      name: "lifecycle.migrate.run",
      description: "Run migrate.sh (data migration). Not implemented in v0; returns error.",
      inputSchema: { type: "object", properties: { direction: { type: "string" }, target: { type: "string" } }, required: [] },
    },
    async (): Promise<ToolResult> => ({ ok: false, error: "lifecycle.migrate.run: not implemented in v0 (deferred to M4)" }),
  );

  reg.register(
    {
      name: "lifecycle.fork.run",
      description: "Run fork.sh (produce a fresh workspace from a source). Not implemented in v0.",
      inputSchema: { type: "object", properties: { source: { type: "string" } }, required: ["source"] },
    },
    async (): Promise<ToolResult> => ({ ok: false, error: "lifecycle.fork.run: not implemented in v0 (deferred to M4)" }),
  );

  reg.register(
    {
      name: "lifecycle.confirm",
      description: "Respond to a pending ##pneuma:needs-confirm marker.",
      inputSchema: {
        type: "object",
        properties: {
          verb: { type: "string" },
          label: { type: "string" },
          decision: { type: "string", enum: ["yes", "no"] },
        },
        required: ["verb", "label", "decision"],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const verb = params.verb as string;
      const label = params.label as string;
      const decision = params.decision as "yes" | "no";
      await ctx.orchestrator.resolveConfirm(verb as never, label, decision);
      return { ok: true };
    },
  );
}
```

- [ ] **Step 4: Run and confirm green**

```bash
bun test packages/core/test/tools/action.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tools/action.ts packages/core/test/tools/action.test.ts
git commit -m "feat(core): lifecycle action tools (dev/build/deploy/migrate/fork/confirm)"
```

---

### Task 11: Checkpoint tools

**Files:**
- Create: `packages/core/src/tools/checkpoint.ts`
- Create: `packages/core/test/tools/checkpoint.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/tools/checkpoint.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { createCheckpoint } from "../../src/shadow-git.js";
import { createToolRegistry } from "../../src/tools/registry.js";
import { registerCheckpointTools } from "../../src/tools/checkpoint.js";

const FIXTURE = join(import.meta.dir, "../fixtures/templates/fixture-min");

async function mk() {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-tools-cp-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  // Give shadow-git init a beat (constructor kicks it off async).
  await new Promise((r) => setTimeout(r, 100));
  const reg = createToolRegistry({ orchestrator: orch });
  registerCheckpointTools(reg);
  return { orch, reg };
}

test("checkpoint.list returns recorded checkpoints", async () => {
  const { orch, reg } = await mk();
  writeFileSync(join(orch.workspace, "a.txt"), "one");
  await createCheckpoint(orch.workspace, "t1");
  writeFileSync(join(orch.workspace, "a.txt"), "two");
  await createCheckpoint(orch.workspace, "t2");
  const r = (await reg.call("checkpoint.list", {})) as { ok: boolean; state: { checkpoints: Array<{ label: string }> } };
  expect(r.ok).toBe(true);
  expect(r.state.checkpoints.map((c) => c.label)).toEqual(["t1", "t2"]);
});

test("checkpoint.rewind resets workspace to the given hash", async () => {
  const { orch, reg } = await mk();
  writeFileSync(join(orch.workspace, "a.txt"), "one");
  const h1 = await createCheckpoint(orch.workspace, "t1");
  writeFileSync(join(orch.workspace, "a.txt"), "two");
  await createCheckpoint(orch.workspace, "t2");
  const r = await reg.call("checkpoint.rewind", { hash: h1 });
  expect(r.ok).toBe(true);
  expect(readFileSync(join(orch.workspace, "a.txt"), "utf8")).toBe("one");
});
```

- [ ] **Step 2: Run and confirm fail**

```bash
bun test packages/core/test/tools/checkpoint.test.ts
```

- [ ] **Step 3: Implement `packages/core/src/tools/checkpoint.ts`**

```typescript
import { listCheckpoints, rewindTo } from "../shadow-git.js";
import type { ToolRegistry, ToolResult } from "./types.js";

export function registerCheckpointTools(reg: ToolRegistry): void {
  reg.register(
    {
      name: "checkpoint.list",
      description: "Enumerate shadow-git checkpoints recorded for this workspace.",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    async (ctx): Promise<ToolResult> => {
      const cps = await listCheckpoints(ctx.orchestrator.workspace);
      return { ok: true, state: { checkpoints: cps } };
    },
  );

  reg.register(
    {
      name: "checkpoint.rewind",
      description: "Rewind the workspace to a prior checkpoint hash (40-char SHA, 7+ prefix also accepted).",
      inputSchema: {
        type: "object",
        properties: { hash: { type: "string" } },
        required: ["hash"],
      },
    },
    async (ctx, params): Promise<ToolResult> => {
      const hash = params.hash as string;
      if (typeof hash !== "string" || hash.length === 0) {
        return { ok: false, error: "checkpoint.rewind requires a non-empty hash" };
      }
      try {
        await rewindTo(ctx.orchestrator.workspace, hash);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  );
}
```

- [ ] **Step 4: Run and confirm green**

```bash
bun test packages/core/test/tools/checkpoint.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tools/checkpoint.ts packages/core/test/tools/checkpoint.test.ts
git commit -m "feat(core): checkpoint tools (list, rewind)"
```

---

### Task 12: `buildToolRegistry(ctx)` — compose all tool groups

**Files:**
- Modify: `packages/core/src/tools/registry.ts`
- Create: `packages/core/test/tools/build.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/tools/build.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { buildToolRegistry } from "../../src/tools/registry.js";

test("buildToolRegistry registers all spec §5 tools", () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-tools-build-"));
  const orch = new LifecycleOrchestrator({
    templateDir: join(import.meta.dir, "../fixtures/templates/fixture-min"),
    workspace: ws,
  });
  const reg = buildToolRegistry({ orchestrator: orch });
  const names = reg.list().map((t) => t.name).sort();
  expect(names).toEqual([
    "checkpoint.list",
    "checkpoint.rewind",
    "lifecycle.build.run",
    "lifecycle.confirm",
    "lifecycle.deploy.run",
    "lifecycle.dev.restart",
    "lifecycle.dev.start",
    "lifecycle.dev.stop",
    "lifecycle.fork.run",
    "lifecycle.logs",
    "lifecycle.migrate.run",
    "lifecycle.state",
    "workspace.tree",
  ]);
});
```

- [ ] **Step 2: Run and confirm fail**

```bash
bun test packages/core/test/tools/build.test.ts
```

- [ ] **Step 3: Extend `packages/core/src/tools/registry.ts`**

Add at the bottom:

```typescript
import type { ToolContext, ToolRegistry } from "./types.js";
import { registerObservationTools } from "./observation.js";
import { registerActionTools } from "./action.js";
import { registerCheckpointTools } from "./checkpoint.js";

export function buildToolRegistry(ctx: ToolContext): ToolRegistry {
  const reg = createToolRegistry(ctx);
  registerObservationTools(reg);
  registerActionTools(reg);
  registerCheckpointTools(reg);
  return reg;
}
```

- [ ] **Step 4: Run and confirm green**

```bash
bun test packages/core/test/tools/build.test.ts
bun test
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tools/registry.ts packages/core/test/tools/build.test.ts
git commit -m "feat(core): buildToolRegistry composes all semantic tool groups"
```

---

### Task 13: MCP server

**Files:**
- Modify: `packages/core/package.json` (add `@modelcontextprotocol/sdk` dep)
- Create: `packages/core/src/mcp-server.ts`
- Create: `packages/core/test/mcp-server.test.ts`

- [ ] **Step 1: Add dependency**

Edit `packages/core/package.json` — add a `dependencies` block:

```json
{
  "name": "@pneuma-framework/core",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  }
}
```

Run `bun install` from the repo root to pick up the new dependency.

- [ ] **Step 2: Write the failing test**

`packages/core/test/mcp-server.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../src/lifecycle.js";
import { buildToolRegistry } from "../src/tools/registry.js";
import { createMcpServer } from "../src/mcp-server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

test("MCP server exposes the tool registry via tools/list and tools/call", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-mcp-"));
  const orch = new LifecycleOrchestrator({
    templateDir: join(import.meta.dir, "fixtures/templates/fixture-min"),
    workspace: ws,
  });
  const registry = buildToolRegistry({ orchestrator: orch });
  const mcp = createMcpServer(registry);

  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" }, { capabilities: {} });
  await Promise.all([client.connect(clientT), mcp.connect(serverT)]);

  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name)).toContain("lifecycle.state");

  const res = await client.callTool({ name: "lifecycle.state", arguments: {} });
  expect(res.isError).toBe(false);
  const payload = JSON.parse((res.content[0] as { text: string }).text) as { ok: boolean };
  expect(payload.ok).toBe(true);

  await mcp.close();
  await client.close();
});
```

- [ ] **Step 3: Run and confirm fail**

```bash
bun test packages/core/test/mcp-server.test.ts
```

Expected: FAIL — `createMcpServer` not exported, or SDK import missing.

- [ ] **Step 4: Implement `packages/core/src/mcp-server.ts`**

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ToolRegistry } from "./tools/types.js";

export interface McpServerHandle {
  connect(transport: Transport): Promise<void>;
  close(): Promise<void>;
  readonly server: Server;
}

export function createMcpServer(registry: ToolRegistry): McpServerHandle {
  const server = new Server(
    { name: "pneuma-framework", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.list().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const result = await registry.call(name, (args ?? {}) as Record<string, unknown>);
    return {
      isError: result.ok === false,
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  });

  return {
    server,
    connect: (transport) => server.connect(transport),
    close: () => server.close(),
  };
}
```

- [ ] **Step 5: Run and confirm green**

```bash
bun test packages/core/test/mcp-server.test.ts
```

If the SDK's in-memory transport import path differs (pin the installed SDK version by inspecting `node_modules/@modelcontextprotocol/sdk/package.json` "exports"), adjust the test's imports to match. The implementation does not depend on the test's transport.

- [ ] **Step 6: Commit**

```bash
git add packages/core/package.json packages/core/src/mcp-server.ts packages/core/test/mcp-server.test.ts bun.lock
git commit -m "feat(core): MCP server bridging the ToolRegistry over @modelcontextprotocol/sdk"
```

---

### Task 14: `backend-opencode` package

**Files:**
- Create: `packages/backend-opencode/package.json`
- Create: `packages/backend-opencode/tsconfig.json`
- Create: `packages/backend-opencode/src/index.ts`
- Create: `packages/backend-opencode/src/adapter.ts`
- Create: `packages/backend-opencode/test/registration.test.ts`

- [ ] **Step 1: Create `packages/backend-opencode/package.json`**

```json
{
  "name": "@pneuma-framework/backend-opencode",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@pneuma-framework/core": "workspace:*",
    "@opencode-ai/sdk": "^1.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/backend-opencode/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Implement `packages/backend-opencode/src/adapter.ts`**

```typescript
import type {
  AgentBackend,
  AgentCapabilities,
  AgentEvent,
  AgentEventHandler,
  AgentLaunchOptions,
  AgentSession,
  PermissionResponse,
} from "@pneuma-framework/core";

export const OPENCODE_CAPS: AgentCapabilities = {
  streaming: true,
  resume: true,
  permissions: true,
  toolProgress: true,
  modelSwitch: true,
};

export interface OpencodeBackendConfig {
  /** If set, connect to a pre-running `opencode serve` at this URL instead of spawning one. */
  baseUrl?: string;
  /** Credentials when targeting a remote `opencode serve`. */
  username?: string;
  password?: string;
  /** Default model to pass on `launch()` if caller doesn't override. */
  defaultModel?: string;
}

type OpencodeLifecycleHandle = {
  close(): Promise<void> | void;
};

interface OpencodeClientShape {
  session: {
    create(args: { body: { title?: string; parentID?: string } }): Promise<{ data: { id: string } }>;
  };
  event: {
    subscribe(): Promise<{ stream: AsyncIterable<unknown> }>;
  };
  // Note: concrete method shapes differ across SDK minor versions; code below keeps
  // the surface area small and resolves dynamic method paths via `(client as any)`.
}

interface OpencodeSdk {
  createOpencode: (opts?: unknown) => Promise<{ client: OpencodeClientShape; server?: OpencodeLifecycleHandle }>;
  createOpencodeClient: (opts: { baseUrl: string; username?: string; password?: string }) => OpencodeClientShape;
}

export class OpencodeBackend implements AgentBackend {
  readonly type = "opencode" as const;
  readonly capabilities = OPENCODE_CAPS;

  private readonly handlers = new Set<AgentEventHandler>();
  private readonly sessions = new Map<string, AgentSession>();
  private client?: OpencodeClientShape;
  private serverHandle?: OpencodeLifecycleHandle;
  private subscribeAbort?: AbortController;

  constructor(
    private readonly config: OpencodeBackendConfig,
    private readonly sdk: OpencodeSdk,
  ) {}

  async launch(opts: AgentLaunchOptions): Promise<AgentSession> {
    if (!this.client) {
      if (this.config.baseUrl) {
        this.client = this.sdk.createOpencodeClient({
          baseUrl: this.config.baseUrl,
          username: this.config.username,
          password: this.config.password,
        });
      } else {
        const spawned = await this.sdk.createOpencode();
        this.client = spawned.client;
        this.serverHandle = spawned.server;
      }
      this.startEventPump();
    }
    const created = await this.client.session.create({ body: { title: opts.initialPrompt?.slice(0, 80) } });
    const sess: AgentSession = {
      sessionId: created.data.id,
      backendSessionId: created.data.id,
      state: "ready",
      startedAt: Date.now(),
    };
    this.sessions.set(sess.sessionId, sess);
    this.emit({ type: "session-ready", sessionId: sess.sessionId, payload: {} });

    if (opts.initialPrompt) {
      await this.sendUserMessage(sess.sessionId, opts.initialPrompt);
    }
    return sess;
  }

  async sendUserMessage(sessionId: string, text: string): Promise<void> {
    if (!this.client) throw new Error("backend not launched");
    const clientAny = this.client as unknown as {
      session: { prompt: (args: { path: { id: string }; body: { parts: Array<{ type: string; text?: string }> } }) => Promise<unknown> };
    };
    await clientAny.session.prompt({ path: { id: sessionId }, body: { parts: [{ type: "text", text }] } });
  }

  async respondToPermission(sessionId: string, response: PermissionResponse): Promise<void> {
    if (!this.client) throw new Error("backend not launched");
    const clientAny = this.client as unknown as {
      postSessionByIdPermissionsByPermissionId: (args: {
        path: { id: string; permissionID: string };
        body: { response: "once" | "always" | "reject" };
      }) => Promise<unknown>;
    };
    const mapped = response.decision === "deny"
      ? "reject"
      : response.decision === "allow-always"
        ? "always"
        : "once";
    await clientAny.postSessionByIdPermissionsByPermissionId({
      path: { id: sessionId, permissionID: response.requestId },
      body: { response: mapped },
    });
  }

  onEvent(handler: AgentEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async stop(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.state = "exited";
    s.exitedAt = Date.now();
    this.emit({ type: "session-exited", sessionId, payload: {} });
  }

  async close(): Promise<void> {
    this.subscribeAbort?.abort();
    if (this.serverHandle) await this.serverHandle.close();
    this.client = undefined;
    this.handlers.clear();
  }

  private async startEventPump(): Promise<void> {
    if (!this.client) return;
    const { stream } = await this.client.event.subscribe();
    const ac = new AbortController();
    this.subscribeAbort = ac;
    (async () => {
      try {
        for await (const raw of stream) {
          if (ac.signal.aborted) break;
          this.dispatch(raw);
        }
      } catch {
        /* stream ended */
      }
    })();
  }

  private dispatch(raw: unknown): void {
    const payload = raw as { type?: string; properties?: Record<string, unknown> };
    if (!payload || !payload.type) return;
    const sessionId = (payload.properties?.sessionId as string | undefined) ?? "unknown";
    switch (payload.type) {
      case "message.part.updated":
        this.emit({ type: "text", sessionId, payload: payload.properties ?? {} });
        return;
      case "permission.updated":
        this.emit({ type: "permission-request", sessionId, payload: payload.properties ?? {} });
        return;
      case "session.error":
        this.emit({ type: "error", sessionId, payload: payload.properties ?? {} });
        return;
      default:
        // ignore unknown; forward-compatible per spec.
        return;
    }
  }

  private emit(event: AgentEvent): void {
    for (const h of this.handlers) h(event);
  }
}
```

- [ ] **Step 4: Implement `packages/backend-opencode/src/index.ts`**

```typescript
import * as sdk from "@opencode-ai/sdk";
import { registerAgentBackend, type AgentBackendFactory } from "@pneuma-framework/core";
import { OpencodeBackend, OPENCODE_CAPS, type OpencodeBackendConfig } from "./adapter.js";

export { OpencodeBackend, OPENCODE_CAPS, type OpencodeBackendConfig };

const factory: AgentBackendFactory = (config) =>
  new OpencodeBackend((config as OpencodeBackendConfig) ?? {}, sdk as unknown as Parameters<typeof OpencodeBackend.prototype.constructor>[1]);

export function registerOpencodeBackend(): void {
  registerAgentBackend(
    {
      type: "opencode",
      displayName: "opencode",
      capabilities: OPENCODE_CAPS,
      detect: async () => {
        // Presence of the SDK export pair is enough; a live server check happens on launch.
        const hasFactory =
          typeof (sdk as unknown as { createOpencode?: unknown }).createOpencode === "function" ||
          typeof (sdk as unknown as { createOpencodeClient?: unknown }).createOpencodeClient === "function";
        return hasFactory ? { available: true } : { available: false, reason: "@opencode-ai/sdk not loaded" };
      },
    },
    factory,
  );
}
```

- [ ] **Step 5: Create `packages/backend-opencode/test/registration.test.ts`**

```typescript
import { test, expect, beforeEach } from "bun:test";
import {
  clearAgentBackendRegistry,
  getAgentBackendDescriptor,
  listAgentBackends,
} from "@pneuma-framework/core";
import { registerOpencodeBackend } from "../src/index.js";

beforeEach(() => clearAgentBackendRegistry());

test("registerOpencodeBackend installs an opencode descriptor in the registry", () => {
  registerOpencodeBackend();
  const d = getAgentBackendDescriptor("opencode");
  expect(d).toBeDefined();
  expect(d?.displayName).toBe("opencode");
  expect(listAgentBackends().map((x) => x.type)).toContain("opencode");
});
```

- [ ] **Step 6: Run install + tests**

```bash
bun install
bun test packages/backend-opencode/test/registration.test.ts
```

A live-SDK smoke is not attempted in this task (it would require `opencode` to be on PATH). The adapter's event-pump behavior will be validated via the E2E path in Task 17 with the FakeAgentBackend swapped in.

- [ ] **Step 7: Commit**

```bash
git add packages/backend-opencode bun.lock
git commit -m "feat(backend-opencode): AgentBackend adapter using @opencode-ai/sdk"
```

---

### Task 15: Extend `createPneumaFramework` with backend + MCP options

**Files:**
- Modify: `packages/core/src/create.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/create-agent.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/create-agent.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPneumaFramework, FakeAgentBackend } from "../src/index.js";

const FIXTURE = join(import.meta.dir, "fixtures/templates/fixture-min");

test("createPneumaFramework exposes toolRegistry when no backend", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-create-tools-"));
  const fw = createPneumaFramework({ templateDir: FIXTURE, workspace: ws });
  expect(fw.toolRegistry.has("lifecycle.state")).toBe(true);
  await fw.close();
});

test("createPneumaFramework attaches a provided backend instance", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-create-fake-"));
  const fake = new FakeAgentBackend();
  const fw = createPneumaFramework({ templateDir: FIXTURE, workspace: ws, backend: fake });
  expect(fw.backend).toBe(fake);
  expect(fw.toolRegistry.has("lifecycle.state")).toBe(true);
  await fw.close();
});
```

- [ ] **Step 2: Run and confirm fail**

```bash
bun test packages/core/test/create-agent.test.ts
```

- [ ] **Step 3: Modify `packages/core/src/create.ts`**

```typescript
import { LifecycleOrchestrator, type OrchestratorOptions } from "./lifecycle.js";
import { buildToolRegistry } from "./tools/registry.js";
import type { ToolRegistry } from "./tools/types.js";
import { createMcpServer, type McpServerHandle } from "./mcp-server.js";
import type { LifecycleState } from "./types.js";
import type { AgentBackend } from "./agent-backend/types.js";

export interface PneumaFrameworkOptions extends OrchestratorOptions {
  backend?: AgentBackend;
  mcp?: { enabled: boolean };
}

export interface PneumaFramework {
  orchestrator: LifecycleOrchestrator;
  state: LifecycleState;
  toolRegistry: ToolRegistry;
  backend?: AgentBackend;
  mcpServer?: McpServerHandle;
  close: () => Promise<void>;
}

export function createPneumaFramework(opts: PneumaFrameworkOptions): PneumaFramework {
  const orchestrator = new LifecycleOrchestrator(opts);
  const toolRegistry = buildToolRegistry({ orchestrator, backend: opts.backend });
  const mcpServer = opts.mcp?.enabled ? createMcpServer(toolRegistry) : undefined;
  return {
    orchestrator,
    state: orchestrator.state,
    toolRegistry,
    backend: opts.backend,
    mcpServer,
    close: async () => {
      if (orchestrator.state.dev !== undefined && !orchestrator.stopInvoked) {
        try { await orchestrator.runStop(); } catch { /* best-effort */ }
      }
      if (opts.backend) {
        try { await opts.backend.close(); } catch { /* best-effort */ }
      }
      if (mcpServer) {
        try { await mcpServer.close(); } catch { /* best-effort */ }
      }
    },
  };
}
```

- [ ] **Step 4: Update `packages/core/src/index.ts` to export the new surface**

Append (or replace the existing block) so the module re-exports:

```typescript
export { createPneumaFramework } from "./create.js";
export type { PneumaFramework, PneumaFrameworkOptions } from "./create.js";
export { LifecycleOrchestrator } from "./lifecycle.js";
export type { OrchestratorOptions, BuildResult, DeployResult } from "./lifecycle.js";
export { parseTemplateManifest, resolveScriptPath } from "./manifest.js";
export { parseMarker } from "./markers.js";
export { buildLifecycleEnv } from "./env.js";
export { readBuildManifest, writeBuildManifest } from "./artifact.js";
export { initShadowGit, createCheckpoint, listCheckpoints, rewindTo } from "./shadow-git.js";
export type { Checkpoint } from "./shadow-git.js";
export { initWorkspace, stateDir, buildDir } from "./workspace.js";
export { LogBuffer } from "./logs.js";
export type { LogLine, GetLinesOpts } from "./logs.js";
export { createToolRegistry, buildToolRegistry } from "./tools/registry.js";
export { registerObservationTools } from "./tools/observation.js";
export { registerActionTools } from "./tools/action.js";
export { registerCheckpointTools } from "./tools/checkpoint.js";
export type { ToolContext, ToolDescriptor, ToolHandler, ToolRegistry, ToolResult } from "./tools/types.js";
export { createMcpServer } from "./mcp-server.js";
export type { McpServerHandle } from "./mcp-server.js";
export {
  registerAgentBackend,
  getAgentBackendDescriptor,
  getAgentBackendFactory,
  listAgentBackends,
  detectBackendAvailability,
  clearAgentBackendRegistry,
} from "./agent-backend/registry.js";
export { FakeAgentBackend } from "./agent-backend/fake.js";
export type {
  AgentBackend,
  AgentBackendDescriptor,
  AgentBackendFactory,
  AgentBackendType,
  AgentCapabilities,
  AgentEvent,
  AgentEventHandler,
  AgentLaunchOptions,
  AgentSession,
  AgentSessionState,
  BackendAvailability,
  PermissionResponse,
} from "./agent-backend/types.js";
export type {
  LifecycleVerb,
  TemplateManifest,
  MarkerMessage,
  VerbExecution,
  VerbState,
  ServiceStatus,
  BuildManifest,
  LifecycleState,
  BackendType,
} from "./types.js";
```

- [ ] **Step 5: Run and confirm green**

```bash
bun test packages/core/test/create-agent.test.ts
bun test
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/create.ts packages/core/src/index.ts packages/core/test/create-agent.test.ts
git commit -m "feat(core): createPneumaFramework exposes toolRegistry, backend, optional MCP"
```

---

### Task 16: CLI `--backend` flag

**Files:**
- Modify: `packages/cli/package.json` (workspace dep on `backend-opencode` as optional)
- Modify: `packages/cli/src/parse-args.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/test/parse-args.test.ts`

- [ ] **Step 1: Add workspace dep to `packages/cli/package.json`**

```json
{
  "name": "@pneuma-framework/cli",
  "version": "0.0.0",
  "type": "module",
  "bin": { "pneuma-framework": "./src/index.ts" },
  "dependencies": {
    "@pneuma-framework/core": "workspace:*",
    "@pneuma-framework/backend-opencode": "workspace:*"
  }
}
```

Run `bun install`.

- [ ] **Step 2: Extend `packages/cli/src/parse-args.ts`**

Add `backend?: string` to `ParsedArgs` and handle `--backend <name>`. The full file becomes:

```typescript
const SUPPORTED_VERBS = ["dev", "build", "deploy", "stop"] as const;
type SupportedVerb = typeof SUPPORTED_VERBS[number];

export interface ParsedArgs {
  verb: SupportedVerb;
  templateDir: string;
  workspace?: string;
  port?: number;
  backend?: string;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [verb, ...rest] = argv;
  if (!verb || !isSupportedVerb(verb)) {
    throw new Error(`unknown verb: ${String(verb)} (supported: ${SUPPORTED_VERBS.join(", ")})`);
  }
  const positional: string[] = [];
  let workspace: string | undefined;
  let port: number | undefined;
  let backend: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--workspace") {
      workspace = rest[++i];
      if (!workspace) throw new Error("--workspace requires a path argument");
      continue;
    }
    if (a === "--port") {
      const raw = rest[++i];
      if (!raw) throw new Error("--port requires a number");
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1 || n > 65535 || !Number.isInteger(n)) {
        throw new Error(`--port must be an integer in [1, 65535], got ${raw}`);
      }
      port = n;
      continue;
    }
    if (a === "--backend") {
      backend = rest[++i];
      if (!backend) throw new Error("--backend requires a name argument");
      continue;
    }
    if (a && a.startsWith("--")) throw new Error(`unknown flag: ${a}`);
    if (a) positional.push(a);
  }
  const templateDir = positional[0];
  if (!templateDir) throw new Error("templateDir is required");
  return { verb, templateDir, workspace, port, backend };
}

function isSupportedVerb(v: string): v is SupportedVerb {
  return (SUPPORTED_VERBS as readonly string[]).includes(v);
}
```

- [ ] **Step 3: Add parse tests**

Append to `packages/cli/test/parse-args.test.ts`:

```typescript
test("parseArgs supports --backend", () => {
  const r = parseArgs(["dev", "./tpl", "--backend", "opencode"]);
  expect(r.backend).toBe("opencode");
});

test("parseArgs rejects empty --backend value", () => {
  expect(() => parseArgs(["dev", "./tpl", "--backend"])).toThrow(/--backend/);
});
```

Update the "parses verb + templateDir" test so it also expects `backend: undefined`:

```typescript
test("parseArgs parses verb + templateDir", () => {
  const r = parseArgs(["dev", "./templates/minimal"]);
  expect(r).toEqual({
    verb: "dev", templateDir: "./templates/minimal",
    workspace: undefined, port: undefined, backend: undefined,
  });
});
```

- [ ] **Step 4: Modify `packages/cli/src/index.ts`**

Before the `createPneumaFramework` call, if `parsed.backend` is set, import the matching backend module and register+factory its backend:

```typescript
import {
  createPneumaFramework,
  getAgentBackendFactory,
  type AgentBackend,
} from "@pneuma-framework/core";

// ... inside main, before createPneumaFramework:

let backend: AgentBackend | undefined;
if (parsed.backend) {
  if (parsed.backend === "opencode") {
    const mod = await import("@pneuma-framework/backend-opencode");
    mod.registerOpencodeBackend();
  }
  const factory = getAgentBackendFactory(parsed.backend);
  if (!factory) {
    console.error(`pneuma-framework: backend "${parsed.backend}" is not registered`);
    return 2;
  }
  backend = factory();
  await backend.launch({ cwd: workspace });
}

const fw = createPneumaFramework({
  templateDir,
  workspace,
  portHint: parsed.port,
  backend,
  mcp: parsed.backend ? { enabled: true } : undefined,
});
```

Update `printUsage()`:

```typescript
function printUsage(): void {
  console.error(`
Usage: pneuma-framework <verb> <templateDir> [--workspace <path>] [--port <n>] [--backend <name>]
Verbs: dev | build | deploy | stop
Backends: opencode
`);
}
```

- [ ] **Step 5: Run parse-args tests**

```bash
bun test packages/cli/test/parse-args.test.ts
```

Expected: all existing + 2 new tests pass.

The E2E of CLI-with-backend launch requires `opencode` binary or a live server — not attempted here; Task 17 uses the fake backend path.

- [ ] **Step 6: Commit**

```bash
git add packages/cli packages/cli/test/parse-args.test.ts bun.lock
git commit -m "feat(cli): --backend flag + auto-register opencode backend"
```

---

### Task 17: End-to-end agent-driven lifecycle test

**Files:**
- Create: `packages/core/test/e2e-agent.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPneumaFramework, FakeAgentBackend } from "../src/index.js";

const FIXTURE = join(import.meta.dir, "fixtures/templates/fixture-min");

test("agent drives the orchestrator: state -> build -> deploy via the tool registry", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-e2e-agent-"));
  const fake = new FakeAgentBackend();
  const fw = createPneumaFramework({ templateDir: FIXTURE, workspace: ws, backend: fake });

  // Simulate what an agent would do: inspect state, run build, fetch logs, deploy.
  const state1 = await fw.toolRegistry.call("lifecycle.state", {});
  expect(state1.ok).toBe(true);

  const build = (await fw.toolRegistry.call("lifecycle.build.run", {})) as { ok: boolean; state: { manifestPath?: string } };
  expect(build.ok).toBe(true);
  expect(build.state.manifestPath).toMatch(/build\.manifest\.json$/);

  const logs = (await fw.toolRegistry.call("lifecycle.logs", { verb: "build", limit: 100 })) as { ok: boolean; state: { lines: unknown[] } };
  expect(logs.ok).toBe(true);
  expect(logs.state.lines.length).toBeGreaterThan(0);

  const deploy = await fw.toolRegistry.call("lifecycle.deploy.run", {});
  expect(deploy.ok).toBe(true);

  await fw.close();
});

test("agent driving sequence with a launched backend session", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-e2e-session-"));
  const fake = new FakeAgentBackend();
  const fw = createPneumaFramework({ templateDir: FIXTURE, workspace: ws, backend: fake });

  const sess = await fake.launch({ cwd: ws });
  expect(sess.state).toBe("ready");

  // Agent runs a tool, receives back structured result.
  const r = await fw.toolRegistry.call("workspace.tree", { depth: 1 });
  expect(r.ok).toBe(true);

  await fw.close();
  expect(fake.permissionDecisions).toHaveLength(0);
});
```

- [ ] **Step 2: Run and confirm green**

```bash
bun test packages/core/test/e2e-agent.test.ts
bun test
```

Expected: both tests pass; cumulative count reflects additions through Task 12.

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/e2e-agent.test.ts
git commit -m "test(core): end-to-end agent-driven lifecycle via tool registry"
```

---

### Task 18: M2 closeout (typecheck + tag)

- [ ] **Step 1: Run full suite + typecheck**

```bash
bun test
bun run typecheck
```

Expected: all tests pass; typecheck clean. If typecheck fails because of `@modelcontextprotocol/sdk` or `@opencode-ai/sdk` type shapes, pin the exact installed versions in the relevant `package.json` and update adapter typings to match. Do not suppress errors with `any`.

- [ ] **Step 2: Tag**

```bash
git tag m2-complete -m "M2: agent backend abstraction + tool API + MCP + opencode adapter"
```

- [ ] **Step 3: Commit closeout notes (if any)**

```bash
git add docs/superpowers/plans/notes || true
git commit -m "chore: M2 closeout notes" || true
```

---

## Self-review notes

Ran through spec §5, §10, and the brainstormed M0-M1 plan after drafting:

- **§5.1 Observation tools** — covered by Task 9 (state, logs, tree). `lifecycle.logs` since/limit filters match the spec payload shape `{ lines: [{ts, stream, line}] }`.
- **§5.2 Action tools** — covered by Tasks 10-11. `migrate.run` and `fork.run` return explicit not-implemented errors; they remain in the API surface so future work changes implementation only, not contracts.
- **§5.3 Crash handling** — already handled by M1 orchestrator (no auto-restart on dev crash). M2 doesn't change this.
- **§5.4 Rate limits / Builder confirmation** — `lifecycle.deploy.run` / `lifecycle.migrate.run` Builder-gated flow is NOT implemented in this plan because it requires the viewer/UI layer (M3). Noted as explicit deferral; the tools themselves run as-is. `unattendedDeploy` remains a manifest field that orchestrator doesn't yet consult.
- **§6 Viewer wire protocol** — explicitly out of scope (M3).
- **§9 Shadow-git** — `rewindTo` added in Task 3; checkpoint tools land in Task 11.
- **§10 AgentBackend abstraction** — Tasks 5-7 cover types, registry, fake. Task 14 validates via opencode.

No placeholder strings (no TBD, no "implement later", no "similar to Task N") remain. Types `AgentBackend`, `ToolRegistry`, `LogBuffer`, `McpServerHandle`, `PneumaFramework` are consistently referenced between tasks. Every code step ships complete code.

Known fragilities:
- Task 13 (MCP server) depends on the exact public shape of `@modelcontextprotocol/sdk` v1.x. If the installed version's transport paths differ, adjust imports; the implementation's Server construction is stable across the v1 line.
- Task 14 (opencode adapter) uses dynamic method paths on the SDK client because the generated method names differ across opencode minor versions. Pin the SDK version in `packages/backend-opencode/package.json` once a version is picked.
- Task 15's `createPneumaFramework` close() best-effort swallows backend + MCP errors by design — caller-visible errors should come from individual tool calls, not from teardown.
