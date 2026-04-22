# pneuma-framework M3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Viewer wire protocol + React SDK + first real pneuma-app-template (`doc`), so a Builder can chat with the Build-phase Agent in a browser sidebar and see a live markdown document update as the agent edits it — validating the framework end-to-end as a co-creation tool. Close with `claude-code` and `codex` backend adapters as a final subtask.

**Architecture:** Core owns a single HTTP+WS server (via `Bun.serve`) that routes `/ws/viewer/:sid` upgrades to a `SessionRegistry`. Each session bridges its registered `AgentBackend` to any number of connected viewer sockets through a small envelope protocol (`WireEnvelope`). A file watcher pushes `.md` changes to viewers as `a2v state` envelopes. A new `@pneuma-framework/viewer-react` package wraps the WS client in a `<PneumaViewer>` context + hooks. `templates/doc` is the first real template: one-file markdown WYSIWYG with a collapsible side chat, skill-as-AGENTS.md auto-install, and scaffold-on-first-run. `claude-code` and `codex` adapter packages land last as independent workspace packages that slot into the M2 `AgentBackend` registry.

**Tech Stack:** Bun ≥ 1.3, TypeScript 5.x, React 19, `bun --hot` for the viewer dev stack (zero bundler config), `marked` for markdown, `@modelcontextprotocol/sdk` (already in core), `@opencode-ai/sdk` (already wired), `bun:test`, POSIX shell.

**Spec reference:** `docs/superpowers/specs/2026-04-21-pneuma-framework-v0-design.md` — §4.2 (env var contract, extended here with `PNEUMA_SESSION_ID` + `PNEUMA_WS_URL`), §6 (viewer wire protocol), §10 (backend abstraction), §11 (repo structure), §12 M3 + M5 roadmap entries.

---

## Scope

### In scope

**Phase A — Wire protocol foundation (core)**
- `WireEnvelope` + `Focus` + `Action` + `ViewerRequest` + `PermissionPrompt`/`PermissionResponse` types.
- `SessionRegistry` with one active session per framework instance (the session id is a UUID the framework assigns).
- `Bun.serve`-based HTTP+WS server handling `/ws/viewer/:sid` upgrades, with origin-permissive for localhost (v0).
- Backend → WS bridge: translate `AgentBackend` events (`text`, `permission-request`, `error`) into `a2v` envelopes, with per-`partId` delta computation for streaming text.
- WS → backend bridge: handle `v2a` envelopes (`focus` → session state; `action: user-message` → inject focus context + `backend.sendUserMessage`; `permission-response` → `backend.respondToPermission`).
- `createPneumaFramework(opts)` extended with `{wire: {enabled, port?, autoAcceptPermissions?}}`; exposes `wireServer` handle.

**Phase B — File-watch state push**
- Recursive watcher over workspace-root (bounded to `.md` + text-like files, ignoring `.pneuma`/`node_modules`/`.git`).
- On change, broadcast `a2v state` envelope carrying `{path, content}` to the session's viewer sockets.

**Phase C — `@pneuma-framework/viewer-react` SDK**
- New workspace package.
- `<PneumaViewer>` React context provider handling WS open/close/reconnect with exponential backoff.
- Hooks: `useFocus()`, `useAction()`, `usePneumaState()`, `useWireConnection()`.

**Phase D — `templates/doc` — minimum-viable WYSIWYG markdown template**
- Template manifest + `scripts/dev.sh` that runs the viewer with `bun --hot` and copies `scaffold/doc.md` + `skill/SKILL.md` → `$PNEUMA_WORKSPACE/AGENTS.md` on first run.
- React viewer that renders `doc.md` via `marked`, with clickable headings / paragraphs posting `focus` envelopes.
- Collapsible side chat panel (input + streaming assistant text), wired through `@pneuma-framework/viewer-react`.
- Agent-edit-then-render loop: backend uses its built-in Read/Write/Edit tools inside `$PNEUMA_WORKSPACE`; file watcher pushes the new content; viewer re-renders.

**Phase E — CLI integration**
- `pneuma-framework dev <template> [--backend opencode]` starts the wire server, prints the viewer URL (with `?sid=` + `&ws=` query params embedded) to stdout, keeps running until SIGINT.
- Auto-accept permissions is the default in this CLI path (`autoAcceptPermissions: true`), matching the decision for v0 doc mode.

**Phase F — E2E validation + docs**
- A `bun:test` integration test that connects a fake WS viewer to a real framework + `FakeAgentBackend`, exercises the full envelope round-trip.
- `examples/doc-mode/` walkthrough README — no new code, just the run recipe.

**Phase G — `claude-code` + `codex` adapter packages (LAST)**
- `packages/backend-claude-code` — subprocess launcher for the `claude-code` CLI + stdio JSON message mapping + MCP tool-bridge plumbing. Detect via `which claude-code`.
- `packages/backend-codex` — subprocess launcher for the `codex` CLI + stdio JSON-RPC mapping. Detect via `which codex`.
- Registry + detection wired into the CLI's `--backend <name>` path so `--backend claude-code` and `--backend codex` Just Work.

### Out of scope (deferred)

- **Multi-file / file-tree UI / diff animations** — pneuma-skills' doc viewer has 1241 LOC of UI polish. M3 ships single-document only (`workspace/doc.md`); multi-file is M4 bundled with `template-procfile-fullstack`.
- **Permission prompt UI** — v0 auto-accepts all permission requests; a real prompt UI lands alongside `template-gridboard` (also M4) where it matters.
- **Viewer-request types beyond `toast`** — `navigate` / `highlight` are typed for forward-compat but no-op in M3's doc viewer.
- **Viewer-vanilla SDK** — deferred. React covers the first canonical template; vanilla SDK lands when a second template needs it (M4+).
- **`template-gridboard`** — deferred to M4 per spec §12.
- **Builder-confirmation gate for `deploy` / `migrate` via the viewer** — M2 orchestrator supports `##pneuma:needs-confirm`; M3 doesn't surface it in the viewer UI.
- **Multiple concurrent sessions per framework instance** — the registry is coded to support it but the CLI launches exactly one. Host apps can instantiate multiple `createPneumaFramework`s if they need it.

---

## File structure

All paths relative to repo root (`/Users/pandazki/Codes/pneuma-framework/`).

### `packages/core/` — additions

| Path | Responsibility |
|---|---|
| `src/wire-protocol/types.ts` | **new.** Canonical `WireEnvelope`, `Focus`, `Action`, `ViewerRequest`, `PermissionPrompt`, `PermissionResponse`, `SessionId`. |
| `src/wire-protocol/session-registry.ts` | **new.** `SessionRegistry` class with `createSession` / `getSession` / `removeSession` / `listSessions`. Each `Session` carries `{sid, orchestrator, backend?, viewerSockets, currentFocus?, textDeltaState}`. |
| `src/wire-protocol/server.ts` | **new.** `createWireServer(registry, opts): WireServer` using `Bun.serve` with WS upgrade routing. Handles `/ws/viewer/:sid`. |
| `src/wire-protocol/bridge.ts` | **new.** `attachBackendBridge(session, backend)` + `handleViewerEnvelope(session, env)`. Owns text delta computation, focus context formatting, permission auto-accept hook. |
| `src/wire-protocol/file-watcher.ts` | **new.** `watchFiles(root, patterns, onChange)` using `fs.watch` (recursive) with `.pneuma`/`node_modules`/`.git` exclusion + debounce. |
| `src/wire-protocol/file-state-push.ts` | **new.** Wires the file watcher to the wire server — pushes `a2v state` envelopes with file contents on change. |
| `src/create.ts` | **modify.** Add `wire?: { enabled; port?; autoAcceptPermissions? }` to `PneumaFrameworkOptions`; construct `SessionRegistry` + wire server when enabled; expose `wireServer`, `sessionId` on the returned framework handle; teardown in `close()`. |
| `src/index.ts` | **modify.** Re-export the wire-protocol types, `SessionRegistry`, `createWireServer`. |
| `src/env.ts` | **modify.** Accept + forward two new env vars: `PNEUMA_SESSION_ID`, `PNEUMA_WS_URL`. |
| `test/wire-protocol/types.test.ts` | **new.** Static compile smoke for the envelope types. |
| `test/wire-protocol/session-registry.test.ts` | **new.** Registry roundtrip. |
| `test/wire-protocol/server.test.ts` | **new.** Boots server, opens a WS client, roundtrips an envelope. |
| `test/wire-protocol/bridge.test.ts` | **new.** Backend→envelope + envelope→backend behavior with stubs. |
| `test/wire-protocol/file-watcher.test.ts` | **new.** Writes a file, callback fires. |
| `test/create-wire.test.ts` | **new.** `createPneumaFramework({wire: {enabled: true}})` path. |
| `test/env.test.ts` | **modify.** Extra assertions on the two new env keys. |

### `packages/viewer-react/` — new package

| Path | Responsibility |
|---|---|
| `package.json` | `@pneuma-framework/viewer-react`, peer-dep React 19, workspace dep on `core`. |
| `tsconfig.json` | Extends root base, `"jsx": "react-jsx"`. |
| `src/index.ts` | Barrel re-export. |
| `src/PneumaViewer.tsx` | React context provider + WS lifecycle + reconnect. |
| `src/context.ts` | Context definition + internal types. |
| `src/useFocus.ts` | Hook: post `v2a focus` envelope. |
| `src/useAction.ts` | Hook: post `v2a action` envelope. |
| `src/usePneumaState.ts` | Hook: subscribe to `a2v state` + `a2v text` streams. |
| `src/useWireConnection.ts` | Hook: report connection status + reconnect trigger. |
| `test/PneumaViewer.test.tsx` | `happy-dom` + mock `WebSocket` → verify connect / reconnect / envelope dispatch. |

### `templates/doc/` — new template

| Path | Responsibility |
|---|---|
| `manifest.json` | schemaVersion 1; backends supported: `opencode`, `claude-code`, `codex`; runtimeAgent: `none`; scripts.dev declared. |
| `scripts/dev.sh` | Copies `scaffold/doc.md` + `skill/SKILL.md`→`AGENTS.md` into workspace on first run; runs `bun --hot viewer/index.html` on `$PNEUMA_PORT_HINT` inside the template dir. |
| `skill/SKILL.md` | Doc-mode guidance adapted from `pneuma-skills/modes/doc/skill/SKILL.md`. |
| `scaffold/doc.md` | Initial seed document. |
| `viewer/index.html` | Mounts the React app; reads `sid` + `ws` from URL query params. |
| `viewer/package.json` | Viewer-local deps (`react`, `marked`, `@pneuma-framework/viewer-react`). |
| `viewer/tsconfig.json` | Extends root base, jsx enabled. |
| `viewer/src/main.tsx` | React 19 `createRoot` mount. |
| `viewer/src/App.tsx` | Top-level shell: `<PneumaViewer>` provider, `<MarkdownPreview>` + `<ChatPanel>`. |
| `viewer/src/MarkdownPreview.tsx` | Renders `workspace/doc.md` via `marked`; delegates heading/paragraph clicks to `useFocus()`. |
| `viewer/src/ChatPanel.tsx` | Collapsible side chat — input at the bottom, streaming assistant text above; uses `useAction()` + `usePneumaState()`. |
| `viewer/src/useWorkspaceDoc.ts` | Derived hook: returns current `doc.md` text via `usePneumaState()`. |

### `examples/doc-mode/` — walkthrough

| Path | Responsibility |
|---|---|
| `README.md` | Run recipe + what to expect end-to-end. |

### `packages/cli/` — modification

| Path | Change |
|---|---|
| `src/index.ts` | When `--backend` is set in `dev` mode, pass `wire: {enabled: true, autoAcceptPermissions: true}` to `createPneumaFramework`. Print the viewer URL with `?sid=` and `&ws=` query params after `service-ready` marker is observed for the template. |

### `packages/backend-claude-code/` — new package (Phase G)

| Path | Responsibility |
|---|---|
| `package.json` | `@pneuma-framework/backend-claude-code`, workspace dep on `core`. |
| `tsconfig.json` | Extends root base. |
| `src/index.ts` | `registerClaudeCodeBackend()` + descriptor/factory. `detect()` via `which claude-code`. |
| `src/adapter.ts` | `ClaudeCodeBackend` implements `AgentBackend`. Spawns `claude-code` CLI with `--output-format stream-json --input-format stream-json`, bridges JSON event stream → `AgentEvent`s. |
| `test/registration.test.ts` | Registry install smoke. |
| `test/adapter.test.ts` | Fake-subprocess test of the JSON event mapping. |

### `packages/backend-codex/` — new package (Phase G)

| Path | Responsibility |
|---|---|
| `package.json` | `@pneuma-framework/backend-codex`, workspace dep on `core`. |
| `tsconfig.json` | Extends root base. |
| `src/index.ts` | `registerCodexBackend()` + descriptor/factory. `detect()` via `which codex`. |
| `src/adapter.ts` | `CodexBackend` implements `AgentBackend`. Spawns `codex exec --json` (stdio JSON-RPC-ish), bridges events. |
| `test/registration.test.ts` | Registry install smoke. |
| `test/adapter.test.ts` | Fake-subprocess test of the JSON event mapping. |

### Root

| Path | Change |
|---|---|
| `package.json` | Typecheck script extended to cover `viewer-react`, `backend-claude-code`, `backend-codex`. `workspaces` already includes `packages/*` + `templates/*` + `examples/*`. |
| `bun.lock` | Auto-updated on `bun install`. |

---

## Canonical types (reproduced once; later tasks reference these)

### Wire envelope (materialized in Task A1)

```typescript
// packages/core/src/wire-protocol/types.ts

/** Session identifier — a UUID v4 generated by the framework. */
export type SessionId = string;

export interface FocusElement {
  kind: "heading" | "paragraph" | "code-block" | "list-item";
  /** Index among siblings of the same kind in the file (0-based). */
  index: number;
  /** Truncated snippet (≤120 chars) for context. */
  text?: string;
  /** Slug or anchor id when kind === "heading". */
  anchor?: string;
  /** Nesting level — only meaningful for "heading". */
  level?: number;
}

export interface Focus {
  /** Workspace-relative path of the file the builder is viewing. */
  file?: string;
  element?: FocusElement;
}

export type Action =
  | { kind: "user-message"; text: string }
  | { kind: "click"; target: string; meta?: Record<string, unknown> };

export type ViewerRequest =
  | { kind: "navigate"; url: string }
  | { kind: "highlight"; selector: string }
  | { kind: "toast"; message: string; level?: "info" | "warn" | "error" };

export interface PermissionPrompt {
  id: string;
  tool: string;
  detail: Record<string, unknown>;
}

export interface PermissionResponse {
  id: string;
  decision: "allow" | "deny" | "allow-always";
}

/** Discriminated union; `dir` names the direction (viewer→agent / agent→viewer). */
export type WireEnvelope =
  | { dir: "v2a"; kind: "focus"; focus: Focus }
  | { dir: "v2a"; kind: "action"; action: Action }
  | { dir: "v2a"; kind: "permission-response"; response: PermissionResponse }
  | { dir: "a2v"; kind: "text"; turnId: string; partId: string; delta: string; done?: boolean }
  | { dir: "a2v"; kind: "viewer-request"; req: ViewerRequest }
  | { dir: "a2v"; kind: "permission-prompt"; prompt: PermissionPrompt }
  | { dir: "a2v"; kind: "state"; state: WorkspaceStateUpdate };

export interface WorkspaceStateUpdate {
  /** Workspace-relative path. */
  path: string;
  /** UTF-8 content. For v0 we only push text files; binary files are skipped. */
  content: string;
  /** Unix millis. */
  ts: number;
}
```

### Session (materialized in Task A2)

```typescript
// packages/core/src/wire-protocol/session-registry.ts

import type { LifecycleOrchestrator } from "../lifecycle.js";
import type { AgentBackend } from "../agent-backend/types.js";
import type { Focus, SessionId } from "./types.js";
import type { ServerWebSocket } from "bun";

export interface Session {
  sid: SessionId;
  orchestrator: LifecycleOrchestrator;
  backend?: AgentBackend;
  viewerSockets: Set<ServerWebSocket<{ sid: SessionId }>>;
  currentFocus?: Focus;
  /** Per-partId last-emitted text length, for delta computation. */
  textDeltaState: Map<string, number>;
  /** Unsubscribe handles for backend event subscriptions. */
  disposers: Array<() => void>;
}

export interface SessionRegistry {
  createSession(sid: SessionId, deps: { orchestrator: LifecycleOrchestrator; backend?: AgentBackend }): Session;
  getSession(sid: SessionId): Session | undefined;
  removeSession(sid: SessionId): void;
  listSessions(): Session[];
}
```

---

## Tasks

### Task A1: Wire envelope types

**Files:**
- Create: `packages/core/src/wire-protocol/types.ts`
- Create: `packages/core/test/wire-protocol/types.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/core/test/wire-protocol/types.test.ts`:

```typescript
import { test, expect } from "bun:test";
import type {
  WireEnvelope,
  Focus,
  Action,
  ViewerRequest,
  PermissionPrompt,
  PermissionResponse,
  SessionId,
} from "../../src/wire-protocol/types.js";

test("WireEnvelope discriminates v2a vs a2v", () => {
  const focus: WireEnvelope = { dir: "v2a", kind: "focus", focus: { file: "a.md" } };
  const text: WireEnvelope = {
    dir: "a2v", kind: "text", turnId: "t1", partId: "p1", delta: "hi",
  };
  expect(focus.dir).toBe("v2a");
  expect(text.dir).toBe("a2v");
});

test("Focus.element supports heading kind with anchor + level", () => {
  const f: Focus = {
    file: "doc.md",
    element: { kind: "heading", index: 0, text: "Intro", anchor: "intro", level: 2 },
  };
  expect(f.element?.level).toBe(2);
});

test("Action union covers user-message and click", () => {
  const u: Action = { kind: "user-message", text: "hello" };
  const c: Action = { kind: "click", target: "save", meta: { x: 1 } };
  expect(u.kind).toBe("user-message");
  expect(c.kind).toBe("click");
});

test("SessionId is a bare string alias", () => {
  const sid: SessionId = "abc-123";
  expect(sid).toBe("abc-123");
});

test("PermissionResponse decision is a closed union", () => {
  const r: PermissionResponse = { id: "p1", decision: "allow" };
  expect(r.decision).toBe("allow");
});

test("ViewerRequest includes toast with optional level", () => {
  const v: ViewerRequest = { kind: "toast", message: "saved", level: "info" };
  expect(v.kind).toBe("toast");
});

test("PermissionPrompt has id + tool + detail", () => {
  const p: PermissionPrompt = { id: "1", tool: "write", detail: { path: "doc.md" } };
  expect(p.tool).toBe("write");
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
bun test packages/core/test/wire-protocol/types.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the canonical types file**

Copy the full `packages/core/src/wire-protocol/types.ts` content from the "Canonical types" section verbatim.

- [ ] **Step 4: Run to confirm green**

```bash
bun test packages/core/test/wire-protocol/types.test.ts
bun test
```
Expected: 7 new tests pass. Full suite: was 112 → now 119.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/wire-protocol/types.ts packages/core/test/wire-protocol/types.test.ts
git commit -m "feat(core): wire-protocol envelope types (Focus/Action/ViewerRequest)"
```

---

### Task A2: Session registry

**Files:**
- Create: `packages/core/src/wire-protocol/session-registry.ts`
- Create: `packages/core/test/wire-protocol/session-registry.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/wire-protocol/session-registry.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { createSessionRegistry } from "../../src/wire-protocol/session-registry.js";

const FIXTURE = join(import.meta.dir, "../fixtures/templates/fixture-min");

function mkOrch() {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-sr-"));
  return new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
}

test("createSession stores + returns a live Session", () => {
  const reg = createSessionRegistry();
  const s = reg.createSession("sid-1", { orchestrator: mkOrch() });
  expect(s.sid).toBe("sid-1");
  expect(s.viewerSockets.size).toBe(0);
  expect(s.textDeltaState.size).toBe(0);
  expect(reg.getSession("sid-1")).toBe(s);
});

test("removeSession drops the entry and runs disposers", () => {
  const reg = createSessionRegistry();
  const s = reg.createSession("sid-2", { orchestrator: mkOrch() });
  let disposed = 0;
  s.disposers.push(() => { disposed += 1; });
  reg.removeSession("sid-2");
  expect(reg.getSession("sid-2")).toBeUndefined();
  expect(disposed).toBe(1);
});

test("listSessions returns all live sessions", () => {
  const reg = createSessionRegistry();
  reg.createSession("a", { orchestrator: mkOrch() });
  reg.createSession("b", { orchestrator: mkOrch() });
  expect(reg.listSessions().map((s) => s.sid).sort()).toEqual(["a", "b"]);
});

test("createSession rejects duplicate sid", () => {
  const reg = createSessionRegistry();
  reg.createSession("dup", { orchestrator: mkOrch() });
  expect(() => reg.createSession("dup", { orchestrator: mkOrch() })).toThrow(/already/i);
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
bun test packages/core/test/wire-protocol/session-registry.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/core/src/wire-protocol/session-registry.ts`**

```typescript
import type { LifecycleOrchestrator } from "../lifecycle.js";
import type { AgentBackend } from "../agent-backend/types.js";
import type { Focus, SessionId } from "./types.js";
import type { ServerWebSocket } from "bun";

export interface Session {
  sid: SessionId;
  orchestrator: LifecycleOrchestrator;
  backend?: AgentBackend;
  viewerSockets: Set<ServerWebSocket<{ sid: SessionId }>>;
  currentFocus?: Focus;
  textDeltaState: Map<string, number>;
  disposers: Array<() => void>;
}

export interface SessionRegistry {
  createSession(
    sid: SessionId,
    deps: { orchestrator: LifecycleOrchestrator; backend?: AgentBackend },
  ): Session;
  getSession(sid: SessionId): Session | undefined;
  removeSession(sid: SessionId): void;
  listSessions(): Session[];
}

export function createSessionRegistry(): SessionRegistry {
  const sessions = new Map<SessionId, Session>();
  return {
    createSession(sid, deps) {
      if (sessions.has(sid)) {
        throw new Error(`session ${sid} already exists`);
      }
      const s: Session = {
        sid,
        orchestrator: deps.orchestrator,
        backend: deps.backend,
        viewerSockets: new Set(),
        textDeltaState: new Map(),
        disposers: [],
      };
      sessions.set(sid, s);
      return s;
    },
    getSession(sid) {
      return sessions.get(sid);
    },
    removeSession(sid) {
      const s = sessions.get(sid);
      if (!s) return;
      for (const d of s.disposers) {
        try { d(); } catch { /* best-effort teardown */ }
      }
      sessions.delete(sid);
    },
    listSessions() {
      return [...sessions.values()];
    },
  };
}
```

- [ ] **Step 4: Run to confirm green**

```bash
bun test packages/core/test/wire-protocol/session-registry.test.ts
bun test
```
Expected: 4 pass. Full suite 119 → 123.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/wire-protocol/session-registry.ts packages/core/test/wire-protocol/session-registry.test.ts
git commit -m "feat(core): SessionRegistry for wire-protocol sessions"
```

---

### Task A3: HTTP + WS server

**Files:**
- Create: `packages/core/src/wire-protocol/server.ts`
- Create: `packages/core/test/wire-protocol/server.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/wire-protocol/server.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { createSessionRegistry } from "../../src/wire-protocol/session-registry.js";
import { createWireServer } from "../../src/wire-protocol/server.js";
import type { WireEnvelope } from "../../src/wire-protocol/types.js";

const FIXTURE = join(import.meta.dir, "../fixtures/templates/fixture-min");

async function waitForEvent<T>(emitter: { once(e: string, cb: (v: T) => void): void }, e: string): Promise<T> {
  return await new Promise<T>((resolve) => emitter.once(e, (v) => resolve(v)));
}

test("wire server accepts /ws/viewer/:sid upgrades and routes envelopes", async () => {
  const registry = createSessionRegistry();
  const ws = mkdtempSync(join(tmpdir(), "pneuma-wire-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  const sess = registry.createSession("sid-a", { orchestrator: orch });

  const received: WireEnvelope[] = [];
  const server = createWireServer(registry, {
    port: 0,
    onViewerEnvelope: (_s, env) => { received.push(env); },
  });

  // Connect a raw WebSocket client.
  const client = new WebSocket(`${server.url.replace(/^http/, "ws")}/ws/viewer/sid-a`);
  await new Promise<void>((r) => client.addEventListener("open", () => r(), { once: true }));
  expect(sess.viewerSockets.size).toBe(1);

  client.send(JSON.stringify({ dir: "v2a", kind: "focus", focus: { file: "x.md" } } satisfies WireEnvelope));
  // Allow the server event loop to flush.
  await new Promise((r) => setTimeout(r, 50));
  expect(received.at(-1)?.kind).toBe("focus");

  client.close();
  await new Promise((r) => setTimeout(r, 50));
  expect(sess.viewerSockets.size).toBe(0);
  await server.close();
});

test("wire server rejects upgrade for unknown sid with 404", async () => {
  const registry = createSessionRegistry();
  const server = createWireServer(registry, { port: 0, onViewerEnvelope: () => {} });

  const res = await fetch(`${server.url}/ws/viewer/nope`, {
    headers: { Upgrade: "websocket", Connection: "Upgrade" },
  });
  expect(res.status).toBe(404);
  await server.close();
});

test("wire server broadcast() reaches every connected viewer for a session", async () => {
  const registry = createSessionRegistry();
  const ws = mkdtempSync(join(tmpdir(), "pneuma-wire-bcast-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  registry.createSession("sid-b", { orchestrator: orch });
  const server = createWireServer(registry, { port: 0, onViewerEnvelope: () => {} });

  const mkClient = async () => {
    const c = new WebSocket(`${server.url.replace(/^http/, "ws")}/ws/viewer/sid-b`);
    await new Promise<void>((r) => c.addEventListener("open", () => r(), { once: true }));
    return c;
  };
  const [c1, c2] = await Promise.all([mkClient(), mkClient()]);
  const received: string[] = [];
  c1.addEventListener("message", (e) => received.push(`c1:${e.data}`));
  c2.addEventListener("message", (e) => received.push(`c2:${e.data}`));

  const env: WireEnvelope = { dir: "a2v", kind: "viewer-request", req: { kind: "toast", message: "hi" } };
  server.broadcast("sid-b", env);
  await new Promise((r) => setTimeout(r, 50));
  expect(received.filter((m) => m.includes("toast")).length).toBe(2);

  c1.close();
  c2.close();
  await server.close();
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
bun test packages/core/test/wire-protocol/server.test.ts
```
Expected: module not found.

- [ ] **Step 3: Implement `packages/core/src/wire-protocol/server.ts`**

```typescript
import type { SessionId, WireEnvelope } from "./types.js";
import type { SessionRegistry, Session } from "./session-registry.js";
import type { Server, ServerWebSocket } from "bun";

export interface WireServerOptions {
  /** 0 lets the OS pick; otherwise use the given port. */
  port: number;
  /** Callback fired for every valid v2a envelope received. */
  onViewerEnvelope: (session: Session, env: WireEnvelope) => void;
}

export interface WireServer {
  /** e.g. "http://127.0.0.1:39281" — always 127.0.0.1 for v0. */
  readonly url: string;
  /** Broadcast an a2v envelope to every viewer connected to the given session. */
  broadcast(sid: SessionId, env: WireEnvelope): void;
  close(): Promise<void>;
}

interface SocketData {
  sid: SessionId;
}

const VIEWER_PATH_RE = /^\/ws\/viewer\/([a-zA-Z0-9_-]+)$/;

export function createWireServer(registry: SessionRegistry, opts: WireServerOptions): WireServer {
  const server: Server = Bun.serve<SocketData, undefined>({
    hostname: "127.0.0.1",
    port: opts.port,
    fetch(req, srv) {
      const url = new URL(req.url);
      const m = VIEWER_PATH_RE.exec(url.pathname);
      if (!m) return new Response("not found", { status: 404 });
      const sid = m[1]!;
      if (!registry.getSession(sid)) return new Response("unknown session", { status: 404 });
      const upgraded = srv.upgrade<SocketData>(req, { data: { sid } });
      if (!upgraded) return new Response("upgrade failed", { status: 500 });
      return undefined;
    },
    websocket: {
      open(ws) {
        const session = registry.getSession(ws.data.sid);
        if (!session) { ws.close(1008, "unknown session"); return; }
        session.viewerSockets.add(ws);
      },
      close(ws) {
        const session = registry.getSession(ws.data.sid);
        session?.viewerSockets.delete(ws);
      },
      message(ws, raw) {
        const session = registry.getSession(ws.data.sid);
        if (!session) return;
        let env: WireEnvelope;
        try {
          env = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)) as WireEnvelope;
        } catch {
          // drop silently — malformed frames aren't fatal, just ignored.
          return;
        }
        if (env?.dir !== "v2a") return;
        opts.onViewerEnvelope(session, env);
      },
    },
  });

  return {
    get url() { return `http://127.0.0.1:${server.port}`; },
    broadcast(sid, env) {
      const session = registry.getSession(sid);
      if (!session) return;
      const payload = JSON.stringify(env);
      for (const ws of session.viewerSockets) ws.send(payload);
    },
    async close() {
      server.stop(true);
    },
  };
}
```

- [ ] **Step 4: Run to confirm green**

```bash
bun test packages/core/test/wire-protocol/server.test.ts
bun test
```
Expected: 3 pass. Full suite 123 → 126.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/wire-protocol/server.ts packages/core/test/wire-protocol/server.test.ts
git commit -m "feat(core): Bun.serve-backed wire-protocol HTTP+WS server"
```

---

### Task A4: Backend → WS bridge (events + text deltas)

**Files:**
- Create: `packages/core/src/wire-protocol/bridge.ts`
- Create: `packages/core/test/wire-protocol/bridge-backend.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/core/test/wire-protocol/bridge-backend.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { FakeAgentBackend } from "../../src/agent-backend/fake.js";
import { createSessionRegistry } from "../../src/wire-protocol/session-registry.js";
import { attachBackendBridge } from "../../src/wire-protocol/bridge.js";
import type { WireEnvelope } from "../../src/wire-protocol/types.js";

const FIXTURE = join(import.meta.dir, "../fixtures/templates/fixture-min");

test("backend text events become a2v text envelopes with per-part deltas", async () => {
  const registry = createSessionRegistry();
  const orch = new LifecycleOrchestrator({
    templateDir: FIXTURE,
    workspace: mkdtempSync(join(tmpdir(), "pneuma-b2w-")),
  });
  const backend = new FakeAgentBackend();
  const session = registry.createSession("s1", { orchestrator: orch, backend });

  const sent: WireEnvelope[] = [];
  attachBackendBridge(session, backend, {
    broadcast: (sid, env) => { if (sid === "s1") sent.push(env); },
    autoAcceptPermissions: false,
  });

  const sess = await backend.launch({ cwd: "/tmp" });
  // Cumulative text growing across three ticks on the same partId.
  backend.simulate({
    type: "text", sessionId: sess.sessionId,
    payload: { part: { id: "p1", type: "text", text: "Hello" }, messageID: "m1" },
  });
  backend.simulate({
    type: "text", sessionId: sess.sessionId,
    payload: { part: { id: "p1", type: "text", text: "Hello, world" }, messageID: "m1" },
  });
  backend.simulate({
    type: "text", sessionId: sess.sessionId,
    payload: { part: { id: "p1", type: "text", text: "Hello, world!" }, messageID: "m1" },
  });

  const texts = sent.filter((e) => e.kind === "text");
  expect(texts.length).toBe(3);
  expect(texts.map((e) => e.kind === "text" && e.delta)).toEqual(["Hello", ", world", "!"]);
});

test("permission-request becomes a2v permission-prompt (no auto-accept)", async () => {
  const registry = createSessionRegistry();
  const orch = new LifecycleOrchestrator({
    templateDir: FIXTURE,
    workspace: mkdtempSync(join(tmpdir(), "pneuma-perm-")),
  });
  const backend = new FakeAgentBackend();
  const session = registry.createSession("s2", { orchestrator: orch, backend });

  const sent: WireEnvelope[] = [];
  attachBackendBridge(session, backend, {
    broadcast: (sid, env) => { if (sid === "s2") sent.push(env); },
    autoAcceptPermissions: false,
  });

  const sess = await backend.launch({ cwd: "/tmp" });
  backend.simulate({
    type: "permission-request", sessionId: sess.sessionId,
    payload: { requestId: "p42", toolName: "write", input: { path: "doc.md" } },
  });
  const prompt = sent.find((e) => e.kind === "permission-prompt");
  expect(prompt?.kind === "permission-prompt" && prompt.prompt.id).toBe("p42");
});

test("autoAcceptPermissions short-circuits: respondToPermission called immediately, no viewer envelope emitted", async () => {
  const registry = createSessionRegistry();
  const orch = new LifecycleOrchestrator({
    templateDir: FIXTURE,
    workspace: mkdtempSync(join(tmpdir(), "pneuma-auto-")),
  });
  const backend = new FakeAgentBackend();
  const session = registry.createSession("s3", { orchestrator: orch, backend });

  const sent: WireEnvelope[] = [];
  attachBackendBridge(session, backend, {
    broadcast: (sid, env) => { if (sid === "s3") sent.push(env); },
    autoAcceptPermissions: true,
  });

  const sess = await backend.launch({ cwd: "/tmp" });
  backend.simulate({
    type: "permission-request", sessionId: sess.sessionId,
    payload: { requestId: "p7", toolName: "write" },
  });
  await new Promise((r) => setTimeout(r, 10));
  expect(sent.find((e) => e.kind === "permission-prompt")).toBeUndefined();
  expect(backend.permissionDecisions).toEqual([{ requestId: "p7", decision: "allow" }]);
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
bun test packages/core/test/wire-protocol/bridge-backend.test.ts
```

- [ ] **Step 3: Implement `packages/core/src/wire-protocol/bridge.ts`**

```typescript
import type { Session } from "./session-registry.js";
import type { AgentBackend } from "../agent-backend/types.js";
import type { WireEnvelope, SessionId, PermissionResponse } from "./types.js";

export interface BridgeOptions {
  broadcast: (sid: SessionId, env: WireEnvelope) => void;
  autoAcceptPermissions: boolean;
}

export function attachBackendBridge(
  session: Session,
  backend: AgentBackend,
  opts: BridgeOptions,
): void {
  const unsubscribe = backend.onEvent((ev) => {
    if (ev.type === "text") {
      const part = (ev.payload as { part?: { id?: string; type?: string; text?: string } }).part;
      if (!part?.id || part.type !== "text" || typeof part.text !== "string") return;
      // Only stream parts that are actually the assistant's generated text.
      // opencode emits the user's own message as a text part too; those carry
      // no time.start. Consumers that want to filter further do it themselves.
      const prev = session.textDeltaState.get(part.id) ?? 0;
      if (part.text.length <= prev) return;
      const delta = part.text.slice(prev);
      session.textDeltaState.set(part.id, part.text.length);
      opts.broadcast(session.sid, {
        dir: "a2v", kind: "text",
        turnId: ((ev.payload as { messageID?: string }).messageID) ?? "turn",
        partId: part.id,
        delta,
      });
      return;
    }
    if (ev.type === "permission-request") {
      const p = ev.payload as { requestId?: string; toolName?: string; input?: unknown };
      const id = p.requestId ?? `req-${Date.now()}`;
      if (opts.autoAcceptPermissions) {
        const resp: PermissionResponse = { id, decision: "allow" };
        void backend.respondToPermission(ev.sessionId, { requestId: id, decision: "allow" });
        // Drop without broadcasting — viewer doesn't need to see allowed prompts in v0.
        void resp;
        return;
      }
      opts.broadcast(session.sid, {
        dir: "a2v", kind: "permission-prompt",
        prompt: { id, tool: p.toolName ?? "unknown", detail: (p.input as Record<string, unknown>) ?? {} },
      });
      return;
    }
    if (ev.type === "error") {
      opts.broadcast(session.sid, {
        dir: "a2v", kind: "viewer-request",
        req: { kind: "toast", message: String((ev.payload as { message?: string }).message ?? "agent error"), level: "error" },
      });
      return;
    }
    // session-ready / session-exited / tool-call: ignored in v0 viewer.
  });

  session.disposers.push(unsubscribe);
}
```

- [ ] **Step 4: Run to confirm green**

```bash
bun test packages/core/test/wire-protocol/bridge-backend.test.ts
bun test
```
Expected: 3 pass. Full suite 126 → 129.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/wire-protocol/bridge.ts packages/core/test/wire-protocol/bridge-backend.test.ts
git commit -m "feat(core): backend→WS bridge with per-part text deltas + permission auto-accept"
```

---

### Task A5: Viewer → backend envelope handler

**Files:**
- Modify: `packages/core/src/wire-protocol/bridge.ts` (append)
- Create: `packages/core/test/wire-protocol/bridge-viewer.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/core/test/wire-protocol/bridge-viewer.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { FakeAgentBackend } from "../../src/agent-backend/fake.js";
import { createSessionRegistry } from "../../src/wire-protocol/session-registry.js";
import { handleViewerEnvelope } from "../../src/wire-protocol/bridge.js";

const FIXTURE = join(import.meta.dir, "../fixtures/templates/fixture-min");

function mkSession() {
  const registry = createSessionRegistry();
  const orch = new LifecycleOrchestrator({
    templateDir: FIXTURE,
    workspace: mkdtempSync(join(tmpdir(), "pneuma-v2b-")),
  });
  const backend = new FakeAgentBackend();
  const session = registry.createSession("s", { orchestrator: orch, backend });
  return { session, backend };
}

test("focus envelope stores on session.currentFocus", async () => {
  const { session, backend } = mkSession();
  const sess = await backend.launch({ cwd: "/tmp" });
  handleViewerEnvelope(session, {
    dir: "v2a", kind: "focus",
    focus: { file: "doc.md", element: { kind: "heading", index: 0, text: "Intro", level: 2 } },
  });
  expect(session.currentFocus?.file).toBe("doc.md");
  expect(session.currentFocus?.element?.kind).toBe("heading");
  void sess;
});

test("user-message action sends to backend, prefixed with focus context when present", async () => {
  const { session, backend } = mkSession();
  const sess = await backend.launch({ cwd: "/tmp" });
  handleViewerEnvelope(session, {
    dir: "v2a", kind: "focus",
    focus: { file: "doc.md", element: { kind: "heading", index: 1, text: "API" } },
  });
  handleViewerEnvelope(session, {
    dir: "v2a", kind: "action",
    action: { kind: "user-message", text: "rename this section" },
  });
  await new Promise((r) => setTimeout(r, 10));
  const msg = backend.userMessages.at(-1);
  expect(msg?.sessionId).toBe(sess.sessionId);
  expect(msg?.text).toContain("rename this section");
  expect(msg?.text).toMatch(/\[Context: file "doc\.md"\]/);
  expect(msg?.text).toMatch(/\[User selected: heading.*"API"\]/);
});

test("user-message without focus sends the text as-is (no bracket prefix)", async () => {
  const { session, backend } = mkSession();
  await backend.launch({ cwd: "/tmp" });
  handleViewerEnvelope(session, {
    dir: "v2a", kind: "action",
    action: { kind: "user-message", text: "hello" },
  });
  await new Promise((r) => setTimeout(r, 10));
  const msg = backend.userMessages.at(-1);
  expect(msg?.text).toBe("hello");
});

test("permission-response is routed to backend.respondToPermission", async () => {
  const { session, backend } = mkSession();
  await backend.launch({ cwd: "/tmp" });
  handleViewerEnvelope(session, {
    dir: "v2a", kind: "permission-response",
    response: { id: "p9", decision: "deny" },
  });
  await new Promise((r) => setTimeout(r, 10));
  expect(backend.permissionDecisions).toEqual([{ requestId: "p9", decision: "deny" }]);
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
bun test packages/core/test/wire-protocol/bridge-viewer.test.ts
```

- [ ] **Step 3: Extend `packages/core/src/wire-protocol/bridge.ts`** — append at the bottom:

```typescript
import type { WireEnvelope as _WE } from "./types.js";

function formatFocusContext(session: Session): string {
  const f = session.currentFocus;
  if (!f) return "";
  const lines: string[] = [];
  if (f.file) lines.push(`[Context: file "${f.file}"]`);
  if (f.element) {
    const { kind, level, text } = f.element;
    const levelPart = kind === "heading" && typeof level === "number" ? ` (level ${level})` : "";
    const textPart = text ? ` "${text}"` : "";
    lines.push(`[User selected: ${kind}${levelPart}${textPart}]`);
  }
  return lines.length > 0 ? lines.join("\n") + "\n\n" : "";
}

export function handleViewerEnvelope(session: Session, env: _WE): void {
  if (env.dir !== "v2a") return;
  switch (env.kind) {
    case "focus":
      session.currentFocus = env.focus;
      return;
    case "action": {
      if (env.action.kind !== "user-message") {
        // click actions have no v0 meaning; store-last-click is future work.
        return;
      }
      const backend = session.backend;
      if (!backend) return;
      // Find an active session on the backend. v0 assumes the backend has
      // exactly one. Future multi-session: track backendSessionId on Session.
      const backendSessionId = findActiveBackendSessionId(backend);
      if (!backendSessionId) return;
      const prefix = formatFocusContext(session);
      void backend.sendUserMessage(backendSessionId, `${prefix}${env.action.text}`);
      return;
    }
    case "permission-response": {
      const backend = session.backend;
      if (!backend) return;
      const backendSessionId = findActiveBackendSessionId(backend);
      if (!backendSessionId) return;
      void backend.respondToPermission(backendSessionId, {
        requestId: env.response.id,
        decision: env.response.decision,
      });
      return;
    }
  }
}

function findActiveBackendSessionId(backend: AgentBackend): string | undefined {
  // Probe the backend via a well-known accessor. Since AgentBackend doesn't
  // expose a "current session" getter in v0, callers of attachBackendBridge
  // are expected to annotate the session when launching. As a fallback, we
  // check if the backend is a FakeAgentBackend-like with a sessions map, or
  // stash the id on the session via a convention (see Task A6).
  const anyB = backend as unknown as { sessions?: Map<string, unknown>; currentSessionId?: string };
  if (anyB.currentSessionId) return anyB.currentSessionId;
  if (anyB.sessions && anyB.sessions.size > 0) {
    const first = anyB.sessions.keys().next();
    return first.value as string | undefined;
  }
  return undefined;
}
```

Note: the `findActiveBackendSessionId` helper is temporary — Task A6 replaces it with an explicit `session.backendSessionId` field set at launch time. Keep the helper for this task only.

- [ ] **Step 4: Run to confirm green**

```bash
bun test packages/core/test/wire-protocol/bridge-viewer.test.ts
bun test
```
Expected: 4 pass. Full suite 129 → 133.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/wire-protocol/bridge.ts packages/core/test/wire-protocol/bridge-viewer.test.ts
git commit -m "feat(core): viewer→backend envelope handler with focus context injection"
```

---

### Task A6: Framework integration (createPneumaFramework wires it all up)

**Files:**
- Modify: `packages/core/src/create.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/wire-protocol/session-registry.ts` (add `backendSessionId?: string` to `Session`; update `bridge.ts`'s `findActiveBackendSessionId` to check it first)
- Modify: `packages/core/src/wire-protocol/bridge.ts`
- Create: `packages/core/test/create-wire.test.ts`

- [ ] **Step 1: Add `backendSessionId?` to `Session`**

In `packages/core/src/wire-protocol/session-registry.ts`, add one field:

```typescript
export interface Session {
  sid: SessionId;
  orchestrator: LifecycleOrchestrator;
  backend?: AgentBackend;
  /** Backend-assigned session id (e.g. opencode "ses_..."), once the backend has launched. */
  backendSessionId?: string;
  viewerSockets: Set<ServerWebSocket<{ sid: SessionId }>>;
  currentFocus?: Focus;
  textDeltaState: Map<string, number>;
  disposers: Array<() => void>;
}
```

No behavior change to `createSessionRegistry()` itself — the field is optional and set by callers.

- [ ] **Step 2: Update `findActiveBackendSessionId` in `bridge.ts`**

Replace:
```typescript
function findActiveBackendSessionId(backend: AgentBackend): string | undefined {
```
with:
```typescript
function findActiveBackendSessionId(session: Session): string | undefined {
  if (session.backendSessionId) return session.backendSessionId;
  const anyB = session.backend as unknown as { sessions?: Map<string, unknown>; currentSessionId?: string } | undefined;
  if (anyB?.currentSessionId) return anyB.currentSessionId;
  if (anyB?.sessions && anyB.sessions.size > 0) {
    const first = anyB.sessions.keys().next();
    return first.value as string | undefined;
  }
  return undefined;
}
```

Update the two call sites in `handleViewerEnvelope` to pass `session` instead of `backend`.

- [ ] **Step 3: Write the failing test** — `packages/core/test/create-wire.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPneumaFramework, FakeAgentBackend } from "../src/index.js";
import type { WireEnvelope } from "../src/index.js";

const FIXTURE = join(import.meta.dir, "fixtures/templates/fixture-min");

test("wire: { enabled } starts a wire server and exposes its URL", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-cw-"));
  const fw = createPneumaFramework({
    templateDir: FIXTURE,
    workspace: ws,
    wire: { enabled: true },
  });
  expect(fw.wireServer).toBeDefined();
  expect(fw.wireServer?.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(fw.sessionId).toMatch(/^[a-f0-9-]{8,}$/);
  await fw.close();
});

test("no wire option means no wire server", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-cw-none-"));
  const fw = createPneumaFramework({ templateDir: FIXTURE, workspace: ws });
  expect(fw.wireServer).toBeUndefined();
  expect(fw.sessionId).toBeUndefined();
  await fw.close();
});

test("end-to-end: viewer WS → focus+action → backend.sendUserMessage", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-cw-e2e-"));
  const backend = new FakeAgentBackend();
  const fw = createPneumaFramework({
    templateDir: FIXTURE,
    workspace: ws,
    backend,
    wire: { enabled: true, autoAcceptPermissions: true },
  });
  const sess = await backend.launch({ cwd: ws });
  // Annotate the framework session with the backend-assigned id.
  fw.annotateBackendSession(sess.sessionId);

  const client = new WebSocket(
    `${fw.wireServer!.url.replace(/^http/, "ws")}/ws/viewer/${fw.sessionId}`,
  );
  await new Promise<void>((r) => client.addEventListener("open", () => r(), { once: true }));

  const focus: WireEnvelope = {
    dir: "v2a", kind: "focus",
    focus: { file: "doc.md", element: { kind: "heading", index: 0, text: "Hello" } },
  };
  const action: WireEnvelope = {
    dir: "v2a", kind: "action",
    action: { kind: "user-message", text: "rewrite this" },
  };
  client.send(JSON.stringify(focus));
  client.send(JSON.stringify(action));
  await new Promise((r) => setTimeout(r, 80));

  const last = backend.userMessages.at(-1);
  expect(last?.text).toMatch(/\[Context: file "doc\.md"\]/);
  expect(last?.text).toContain("rewrite this");

  client.close();
  await fw.close();
});
```

- [ ] **Step 4: Run to confirm fail**

```bash
bun test packages/core/test/create-wire.test.ts
```
Expected: fail — `wire` option not in `PneumaFrameworkOptions`, `fw.wireServer` undefined, `annotateBackendSession` missing, etc.

- [ ] **Step 5: Modify `packages/core/src/create.ts`**

Replace the current file contents with:

```typescript
import { randomUUID } from "node:crypto";
import { LifecycleOrchestrator, type OrchestratorOptions } from "./lifecycle.js";
import { buildToolRegistry } from "./tools/registry.js";
import type { ToolRegistry } from "./tools/types.js";
import { createMcpServer, type McpServerHandle } from "./mcp-server.js";
import type { LifecycleState } from "./types.js";
import type { AgentBackend } from "./agent-backend/types.js";
import { createSessionRegistry, type Session, type SessionRegistry } from "./wire-protocol/session-registry.js";
import { createWireServer, type WireServer } from "./wire-protocol/server.js";
import { attachBackendBridge, handleViewerEnvelope } from "./wire-protocol/bridge.js";
import type { SessionId } from "./wire-protocol/types.js";

export interface PneumaFrameworkOptions extends OrchestratorOptions {
  backend?: AgentBackend;
  mcp?: { enabled: boolean };
  wire?: { enabled: boolean; port?: number; autoAcceptPermissions?: boolean };
}

export interface PneumaFramework {
  orchestrator: LifecycleOrchestrator;
  state: LifecycleState;
  toolRegistry: ToolRegistry;
  backend?: AgentBackend;
  mcpServer?: McpServerHandle;
  sessionRegistry?: SessionRegistry;
  wireServer?: WireServer;
  sessionId?: SessionId;
  /**
   * Record the backend-assigned session id on the framework session so
   * v2a envelope routing can target the right backend session. Call after
   * `backend.launch(...)`.
   */
  annotateBackendSession: (backendSessionId: string) => void;
  close: () => Promise<void>;
}

export function createPneumaFramework(opts: PneumaFrameworkOptions): PneumaFramework {
  const orchestrator = new LifecycleOrchestrator(opts);
  const toolRegistry = buildToolRegistry({ orchestrator, backend: opts.backend });
  const mcpServer = opts.mcp?.enabled ? createMcpServer(toolRegistry) : undefined;

  let sessionRegistry: SessionRegistry | undefined;
  let wireServer: WireServer | undefined;
  let sessionId: SessionId | undefined;
  let frameworkSession: Session | undefined;

  if (opts.wire?.enabled) {
    sessionId = randomUUID();
    sessionRegistry = createSessionRegistry();
    frameworkSession = sessionRegistry.createSession(sessionId, {
      orchestrator,
      backend: opts.backend,
    });
    wireServer = createWireServer(sessionRegistry, {
      port: opts.wire.port ?? 0,
      onViewerEnvelope: (session, env) => handleViewerEnvelope(session, env),
    });
    if (opts.backend) {
      attachBackendBridge(frameworkSession, opts.backend, {
        broadcast: (sid, env) => wireServer!.broadcast(sid, env),
        autoAcceptPermissions: opts.wire.autoAcceptPermissions ?? false,
      });
    }
  }

  return {
    orchestrator,
    state: orchestrator.state,
    toolRegistry,
    backend: opts.backend,
    mcpServer,
    sessionRegistry,
    wireServer,
    sessionId,
    annotateBackendSession(backendSessionId) {
      if (frameworkSession) frameworkSession.backendSessionId = backendSessionId;
    },
    close: async () => {
      if (orchestrator.state.dev !== undefined && !orchestrator.stopInvoked) {
        try { await orchestrator.runStop(); } catch { /* best-effort */ }
      }
      // Framework owns mcpServer + wireServer + sessionRegistry entries.
      // Caller-injected backend stays their responsibility.
      if (mcpServer) {
        try { await mcpServer.close(); } catch { /* best-effort */ }
      }
      if (wireServer) {
        try { await wireServer.close(); } catch { /* best-effort */ }
      }
      if (sessionRegistry && sessionId) {
        sessionRegistry.removeSession(sessionId);
      }
    },
  };
}
```

- [ ] **Step 6: Update `packages/core/src/index.ts`** — append:

```typescript
export { createSessionRegistry } from "./wire-protocol/session-registry.js";
export type { Session, SessionRegistry } from "./wire-protocol/session-registry.js";
export { createWireServer } from "./wire-protocol/server.js";
export type { WireServer, WireServerOptions } from "./wire-protocol/server.js";
export { attachBackendBridge, handleViewerEnvelope } from "./wire-protocol/bridge.js";
export type { BridgeOptions } from "./wire-protocol/bridge.js";
export type {
  Focus,
  FocusElement,
  Action,
  ViewerRequest,
  PermissionPrompt,
  PermissionResponse,
  WireEnvelope,
  WorkspaceStateUpdate,
  SessionId,
} from "./wire-protocol/types.js";
```

- [ ] **Step 7: Run to confirm green**

```bash
bun test packages/core/test/create-wire.test.ts
bun test
bun run typecheck
```
Expected: 3 new tests pass. Full suite 133 → 136. Typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/create.ts packages/core/src/index.ts packages/core/src/wire-protocol/session-registry.ts packages/core/src/wire-protocol/bridge.ts packages/core/test/create-wire.test.ts
git commit -m "feat(core): createPneumaFramework { wire } wires registry + server + backend bridge"
```

---

### Task B1: File watcher with debounce

**Files:**
- Create: `packages/core/src/wire-protocol/file-watcher.ts`
- Create: `packages/core/test/wire-protocol/file-watcher.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/wire-protocol/file-watcher.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { watchFiles } from "../../src/wire-protocol/file-watcher.js";

test("watchFiles fires callback on .md writes", async () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-fw-"));
  writeFileSync(join(root, "doc.md"), "hello");
  const events: string[] = [];
  const stop = watchFiles(root, { extensions: [".md"], debounceMs: 20 }, (path) => {
    events.push(path);
  });
  // Give Bun's fs.watch a tick to attach.
  await new Promise((r) => setTimeout(r, 50));
  writeFileSync(join(root, "doc.md"), "hello world");
  await new Promise((r) => setTimeout(r, 120));
  expect(events.some((p) => p.endsWith("doc.md"))).toBe(true);
  stop();
});

test("watchFiles skips .pneuma / node_modules / .git", async () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-fw-skip-"));
  mkdirSync(join(root, ".pneuma"));
  mkdirSync(join(root, "node_modules"));
  const events: string[] = [];
  const stop = watchFiles(root, { extensions: [".md"], debounceMs: 20 }, (p) => events.push(p));
  await new Promise((r) => setTimeout(r, 50));
  writeFileSync(join(root, ".pneuma/ignored.md"), "nope");
  writeFileSync(join(root, "node_modules/ignored.md"), "nope");
  await new Promise((r) => setTimeout(r, 120));
  expect(events.length).toBe(0);
  stop();
});

test("watchFiles debounces rapid-fire writes to the same file", async () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-fw-deb-"));
  const events: string[] = [];
  const stop = watchFiles(root, { extensions: [".md"], debounceMs: 50 }, (p) => events.push(p));
  await new Promise((r) => setTimeout(r, 50));
  writeFileSync(join(root, "x.md"), "1");
  writeFileSync(join(root, "x.md"), "2");
  writeFileSync(join(root, "x.md"), "3");
  await new Promise((r) => setTimeout(r, 150));
  expect(events.length).toBe(1);
  stop();
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
bun test packages/core/test/wire-protocol/file-watcher.test.ts
```

- [ ] **Step 3: Implement `packages/core/src/wire-protocol/file-watcher.ts`**

```typescript
import { watch } from "node:fs";
import { extname, join, relative, sep } from "node:path";

export interface WatchOptions {
  /** File extensions to emit events for (lowercase, with leading dot). */
  extensions: string[];
  /** Coalesce events for the same path within this window (ms). */
  debounceMs: number;
}

const SKIPPED_DIRS = new Set([".pneuma", ".pneuma-build", "node_modules", ".git"]);

export function watchFiles(
  root: string,
  opts: WatchOptions,
  onChange: (absolutePath: string) => void,
): () => void {
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const watcher = watch(root, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;
    const rel = typeof filename === "string" ? filename : filename.toString();
    // Skip if the path starts with any excluded directory segment.
    const parts = rel.split(sep);
    if (parts.some((p) => SKIPPED_DIRS.has(p))) return;
    const ext = extname(rel).toLowerCase();
    if (!opts.extensions.includes(ext)) return;
    const abs = join(root, rel);
    const prev = pending.get(abs);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      pending.delete(abs);
      try { onChange(abs); } catch { /* observer errors don't crash the watcher */ }
    }, opts.debounceMs);
    pending.set(abs, t);
  });
  return () => {
    for (const t of pending.values()) clearTimeout(t);
    pending.clear();
    watcher.close();
  };
  // relative used only for future filtering — keep import alive
  void relative;
}
```

- [ ] **Step 4: Run to confirm green**

```bash
bun test packages/core/test/wire-protocol/file-watcher.test.ts
bun test
```
Expected: 3 pass. Full suite 136 → 139.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/wire-protocol/file-watcher.ts packages/core/test/wire-protocol/file-watcher.test.ts
git commit -m "feat(core): recursive file watcher with debounce + dir exclusions"
```

---

### Task B2: State push — file changes → a2v state envelopes

**Files:**
- Create: `packages/core/src/wire-protocol/file-state-push.ts`
- Modify: `packages/core/src/create.ts` (wire it up when `wire.enabled`)
- Create: `packages/core/test/wire-protocol/file-state-push.test.ts`

- [ ] **Step 1: Write the failing test** — `packages/core/test/wire-protocol/file-state-push.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPneumaFramework } from "../../src/index.js";
import type { WireEnvelope } from "../../src/index.js";

const FIXTURE = join(import.meta.dir, "../fixtures/templates/fixture-min");

test("writing a .md file in the workspace pushes a2v state to the viewer", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-fsp-"));
  const fw = createPneumaFramework({
    templateDir: FIXTURE,
    workspace: ws,
    wire: { enabled: true },
  });
  const client = new WebSocket(
    `${fw.wireServer!.url.replace(/^http/, "ws")}/ws/viewer/${fw.sessionId}`,
  );
  await new Promise<void>((r) => client.addEventListener("open", () => r(), { once: true }));

  const received: WireEnvelope[] = [];
  client.addEventListener("message", (e) => {
    received.push(JSON.parse(typeof e.data === "string" ? e.data : "") as WireEnvelope);
  });

  writeFileSync(join(ws, "doc.md"), "# hello");
  await new Promise((r) => setTimeout(r, 200));
  const state = received.find((e) => e.kind === "state");
  expect(state?.kind === "state" && state.state.path).toMatch(/doc\.md$/);
  expect(state?.kind === "state" && state.state.content).toBe("# hello");

  client.close();
  await fw.close();
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
bun test packages/core/test/wire-protocol/file-state-push.test.ts
```

- [ ] **Step 3: Implement `packages/core/src/wire-protocol/file-state-push.ts`**

```typescript
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import type { WireServer } from "./server.js";
import type { Session } from "./session-registry.js";
import { watchFiles } from "./file-watcher.js";

export interface StatePushOptions {
  /** File extensions to push. Default: .md */
  extensions?: string[];
  debounceMs?: number;
}

export function startFileStatePush(
  session: Session,
  workspaceRoot: string,
  wireServer: WireServer,
  opts: StatePushOptions = {},
): () => void {
  const exts = opts.extensions ?? [".md"];
  const debounce = opts.debounceMs ?? 50;
  return watchFiles(workspaceRoot, { extensions: exts, debounceMs: debounce }, (abs) => {
    let content: string;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      return;
    }
    wireServer.broadcast(session.sid, {
      dir: "a2v", kind: "state",
      state: {
        path: relative(workspaceRoot, abs),
        content,
        ts: Date.now(),
      },
    });
  });
}
```

- [ ] **Step 4: Wire it in `packages/core/src/create.ts`**

At the end of the `if (opts.wire?.enabled) { ... }` block (after `attachBackendBridge`), add:

```typescript
// File-watch → a2v state push for live viewer updates.
const stopFileWatch = (await import("./wire-protocol/file-state-push.js")).startFileStatePush(
  frameworkSession, this.workspace /* orchestrator.workspace */, wireServer,
);
frameworkSession.disposers.push(stopFileWatch);
```

**Correction**: since `createPneumaFramework` isn't `async`, do NOT await the dynamic import. Use a static import at the top of `create.ts`:

```typescript
import { startFileStatePush } from "./wire-protocol/file-state-push.js";
```

and in the block:

```typescript
const stopFileWatch = startFileStatePush(frameworkSession, orchestrator.workspace, wireServer);
frameworkSession.disposers.push(stopFileWatch);
```

- [ ] **Step 5: Run to confirm green**

```bash
bun test packages/core/test/wire-protocol/file-state-push.test.ts
bun test
```
Expected: 1 new pass. Full suite 139 → 140.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/wire-protocol/file-state-push.ts packages/core/src/create.ts packages/core/test/wire-protocol/file-state-push.test.ts
git commit -m "feat(core): push workspace .md changes to viewers as a2v state envelopes"
```

---

### Task C1: `@pneuma-framework/viewer-react` package scaffold

**Files:**
- Create: `packages/viewer-react/package.json`
- Create: `packages/viewer-react/tsconfig.json`
- Create: `packages/viewer-react/src/index.ts` (barrel re-export, empty initially)
- Modify: `package.json` (add to typecheck)
- Create: `packages/viewer-react/test/smoke.test.ts`

- [ ] **Step 1: Create `packages/viewer-react/package.json`**

```json
{
  "name": "@pneuma-framework/viewer-react",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "peerDependencies": {
    "react": "^19.0.0"
  },
  "dependencies": {
    "@pneuma-framework/core": "workspace:*"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "react": "^19.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/viewer-react/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **Step 3: Create placeholder `packages/viewer-react/src/index.ts`**

```typescript
// Populated by later tasks.
export {};
```

- [ ] **Step 4: Extend root typecheck**

Edit `package.json` script:

```json
"typecheck": "tsc --noEmit -p packages/core/tsconfig.json && tsc --noEmit -p packages/cli/tsconfig.json && tsc --noEmit -p packages/backend-opencode/tsconfig.json && tsc --noEmit -p packages/viewer-react/tsconfig.json"
```

- [ ] **Step 5: Write a smoke test** — `packages/viewer-react/test/smoke.test.ts`:

```typescript
import { test, expect } from "bun:test";
import * as viewer from "../src/index.js";

test("@pneuma-framework/viewer-react resolves", () => {
  expect(typeof viewer).toBe("object");
});
```

- [ ] **Step 6: Run install + tests + typecheck**

```bash
bun install
bun test packages/viewer-react
bun run typecheck
```
Expected: smoke test passes; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/viewer-react package.json bun.lock
git commit -m "feat(viewer-react): package scaffold (peer React 19, workspace dep on core)"
```

---

### Task C2: `<PneumaViewer>` context provider with WS lifecycle

**Files:**
- Create: `packages/viewer-react/src/context.ts`
- Create: `packages/viewer-react/src/PneumaViewer.tsx`
- Modify: `packages/viewer-react/src/index.ts`
- Create: `packages/viewer-react/test/PneumaViewer.test.tsx`

- [ ] **Step 1: Write the failing test**

`packages/viewer-react/test/PneumaViewer.test.tsx`:

```typescript
import { test, expect, beforeAll } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

beforeAll(() => {
  if (!("window" in globalThis)) GlobalRegistrator.register();
});

// Dynamic imports after DOM registration so React picks up window/document.
test("PneumaViewer opens a WebSocket to the given wsUrl/sid and exposes status=open", async () => {
  const { render, act } = await import("@testing-library/react");
  const { PneumaViewer, useWireConnection } = await import("../src/index.js");
  const React = await import("react");

  const opened: string[] = [];
  class FakeWS extends EventTarget {
    static instances: FakeWS[] = [];
    readyState = 0;
    url: string;
    constructor(url: string) {
      super();
      this.url = url;
      opened.push(url);
      FakeWS.instances.push(this);
      queueMicrotask(() => {
        this.readyState = 1;
        this.dispatchEvent(new Event("open"));
      });
    }
    send(_data: string): void { /* noop */ }
    close(): void {
      this.readyState = 3;
      this.dispatchEvent(new Event("close"));
    }
  }
  (globalThis as unknown as { WebSocket: typeof FakeWS }).WebSocket = FakeWS;

  function Status() {
    const conn = useWireConnection();
    return React.createElement("div", { "data-testid": "status" }, conn.status);
  }
  const { findByTestId } = render(
    React.createElement(
      PneumaViewer,
      { wsUrl: "ws://127.0.0.1:1/ws/viewer/abc", sid: "abc" },
      React.createElement(Status),
    ),
  );
  const el = await findByTestId("status");
  // allow microtask + first frame
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  expect(opened.at(0)).toBe("ws://127.0.0.1:1/ws/viewer/abc");
  expect(el.textContent).toBe("open");
});
```

Install dev deps upfront (one-time):

```bash
bun add -d @happy-dom/global-registrator @testing-library/react
```

Add to `packages/viewer-react/package.json` `devDependencies` so `bun install` tracks them at the workspace level.

- [ ] **Step 2: Run to confirm fail**

```bash
bun test packages/viewer-react/test/PneumaViewer.test.tsx
```
Expected: module not found for `PneumaViewer`.

- [ ] **Step 3: Implement `packages/viewer-react/src/context.ts`**

```typescript
import { createContext } from "react";
import type { WireEnvelope } from "@pneuma-framework/core";

export type WireStatus = "connecting" | "open" | "closed" | "error";

export interface WireContextValue {
  status: WireStatus;
  /** Last connection error, if any. */
  error?: Error;
  /** Send a v2a envelope. Returns false if the socket isn't open. */
  send: (env: WireEnvelope) => boolean;
  /** Subscribe to a2v envelopes. Returns an unsubscribe. */
  subscribe: (cb: (env: WireEnvelope) => void) => () => void;
}

export const WireContext = createContext<WireContextValue | null>(null);
```

- [ ] **Step 4: Implement `packages/viewer-react/src/PneumaViewer.tsx`**

```typescript
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WireEnvelope } from "@pneuma-framework/core";
import { WireContext, type WireContextValue, type WireStatus } from "./context.js";

export interface PneumaViewerProps {
  wsUrl: string;
  sid: string;
  /**
   * Initial backoff (ms) for reconnect attempts. Doubles up to 10s.
   * @default 500
   */
  reconnectMinMs?: number;
  /** @default 10000 */
  reconnectMaxMs?: number;
  children: ReactNode;
}

export function PneumaViewer({
  wsUrl, sid, reconnectMinMs = 500, reconnectMaxMs = 10_000, children,
}: PneumaViewerProps) {
  const [status, setStatus] = useState<WireStatus>("connecting");
  const [error, setError] = useState<Error | undefined>(undefined);
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef(new Set<(env: WireEnvelope) => void>());
  const backoffRef = useRef(reconnectMinMs);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;
    const connect = (): void => {
      if (stoppedRef.current) return;
      setStatus("connecting");
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.addEventListener("open", () => {
        backoffRef.current = reconnectMinMs;
        setStatus("open");
      });
      ws.addEventListener("message", (e) => {
        try {
          const env = JSON.parse(typeof e.data === "string" ? e.data : "") as WireEnvelope;
          for (const cb of listenersRef.current) cb(env);
        } catch {
          /* skip malformed frames */
        }
      });
      ws.addEventListener("error", (e) => {
        setError(new Error((e as ErrorEvent).message ?? "websocket error"));
        setStatus("error");
      });
      ws.addEventListener("close", () => {
        setStatus("closed");
        if (stoppedRef.current) return;
        const delay = Math.min(backoffRef.current, reconnectMaxMs);
        backoffRef.current = Math.min(backoffRef.current * 2, reconnectMaxMs);
        setTimeout(connect, delay);
      });
    };
    connect();
    return () => {
      stoppedRef.current = true;
      wsRef.current?.close();
    };
  }, [wsUrl, reconnectMinMs, reconnectMaxMs]);

  const value = useMemo<WireContextValue>(() => ({
    status, error,
    send(env) {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== 1) return false;
      ws.send(JSON.stringify(env));
      return true;
    },
    subscribe(cb) {
      listenersRef.current.add(cb);
      return () => { listenersRef.current.delete(cb); };
    },
  }), [status, error]);

  // sid exposed on the provider as a data attribute so DOM assertions can verify it.
  return (
    <WireContext.Provider value={value}>
      <div data-pneuma-sid={sid} style={{ display: "contents" }}>
        {children}
      </div>
    </WireContext.Provider>
  );
}
```

- [ ] **Step 5: Implement `useWireConnection` hook** — `packages/viewer-react/src/useWireConnection.ts`:

```typescript
import { useContext } from "react";
import { WireContext, type WireContextValue } from "./context.js";

export function useWireConnection(): WireContextValue {
  const ctx = useContext(WireContext);
  if (!ctx) throw new Error("useWireConnection must be used inside <PneumaViewer>");
  return ctx;
}
```

- [ ] **Step 6: Update `packages/viewer-react/src/index.ts`**

```typescript
export { PneumaViewer } from "./PneumaViewer.js";
export type { PneumaViewerProps } from "./PneumaViewer.js";
export { useWireConnection } from "./useWireConnection.js";
export { WireContext } from "./context.js";
export type { WireStatus, WireContextValue } from "./context.js";
```

- [ ] **Step 7: Run green**

```bash
bun test packages/viewer-react/test/PneumaViewer.test.tsx
bun test
bun run typecheck
```
Expected: 1 new pass. Full suite 140 → 141. Typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add packages/viewer-react bun.lock
git commit -m "feat(viewer-react): <PneumaViewer> context provider with WS reconnect + useWireConnection"
```

---

### Task C3: `useFocus` / `useAction` / `usePneumaState` hooks

**Files:**
- Create: `packages/viewer-react/src/useFocus.ts`
- Create: `packages/viewer-react/src/useAction.ts`
- Create: `packages/viewer-react/src/usePneumaState.ts`
- Modify: `packages/viewer-react/src/index.ts`
- Create: `packages/viewer-react/test/hooks.test.tsx`

- [ ] **Step 1: Write failing tests**

`packages/viewer-react/test/hooks.test.tsx`:

```typescript
import { test, expect, beforeAll } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

beforeAll(() => {
  if (!("window" in globalThis)) GlobalRegistrator.register();
});

test("useFocus sends a v2a focus envelope", async () => {
  const { render, act } = await import("@testing-library/react");
  const { PneumaViewer, useFocus } = await import("../src/index.js");
  const React = await import("react");

  const sent: unknown[] = [];
  class FakeWS extends EventTarget {
    readyState = 1;
    constructor(_url: string) { super(); queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
    send(data: string) { sent.push(JSON.parse(data)); }
    close() { this.dispatchEvent(new Event("close")); }
  }
  (globalThis as unknown as { WebSocket: typeof FakeWS }).WebSocket = FakeWS;

  function Clicker() {
    const setFocus = useFocus();
    React.useEffect(() => {
      setFocus({ file: "doc.md", element: { kind: "heading", index: 0, text: "Hi" } });
    }, [setFocus]);
    return null;
  }
  render(React.createElement(PneumaViewer, { wsUrl: "ws://x/a", sid: "a" }, React.createElement(Clicker)));
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  expect(sent.some((e) => (e as { kind?: string }).kind === "focus")).toBe(true);
});

test("useAction sends user-message as v2a action", async () => {
  const { render, act } = await import("@testing-library/react");
  const { PneumaViewer, useAction } = await import("../src/index.js");
  const React = await import("react");

  const sent: unknown[] = [];
  class FakeWS extends EventTarget {
    readyState = 1;
    constructor(_url: string) { super(); queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
    send(d: string) { sent.push(JSON.parse(d)); }
    close() { this.dispatchEvent(new Event("close")); }
  }
  (globalThis as unknown as { WebSocket: typeof FakeWS }).WebSocket = FakeWS;

  function Sender() {
    const sendAction = useAction();
    React.useEffect(() => {
      sendAction({ kind: "user-message", text: "hello" });
    }, [sendAction]);
    return null;
  }
  render(React.createElement(PneumaViewer, { wsUrl: "ws://x/b", sid: "b" }, React.createElement(Sender)));
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  const action = sent.find((e) => (e as { kind?: string }).kind === "action") as {
    action: { kind: string; text: string };
  } | undefined;
  expect(action?.action.text).toBe("hello");
});

test("usePneumaState accumulates text deltas by turnId and exposes latestDocState", async () => {
  const { render, act } = await import("@testing-library/react");
  const { PneumaViewer, usePneumaState } = await import("../src/index.js");
  const React = await import("react");

  class FakeWS extends EventTarget {
    static instance: FakeWS | undefined;
    readyState = 1;
    constructor(_url: string) { super(); FakeWS.instance = this; queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
    send(_: string) {}
    close() { this.dispatchEvent(new Event("close")); }
    inject(env: unknown) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(env) })); }
  }
  (globalThis as unknown as { WebSocket: typeof FakeWS }).WebSocket = FakeWS;

  function Consumer() {
    const { turns, docs } = usePneumaState();
    return React.createElement("pre", {},
      JSON.stringify({ turns, docs }),
    );
  }
  const { container } = render(
    React.createElement(PneumaViewer, { wsUrl: "ws://x/c", sid: "c" }, React.createElement(Consumer)),
  );
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  FakeWS.instance!.inject({ dir: "a2v", kind: "text", turnId: "t1", partId: "p1", delta: "Hello" });
  FakeWS.instance!.inject({ dir: "a2v", kind: "text", turnId: "t1", partId: "p1", delta: " world" });
  FakeWS.instance!.inject({
    dir: "a2v", kind: "state",
    state: { path: "doc.md", content: "# hi", ts: 1 },
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  const out = JSON.parse(container.querySelector("pre")!.textContent!);
  expect(out.turns.t1).toBe("Hello world");
  expect(out.docs["doc.md"]).toBe("# hi");
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
bun test packages/viewer-react/test/hooks.test.tsx
```

- [ ] **Step 3: Implement `packages/viewer-react/src/useFocus.ts`**

```typescript
import { useCallback } from "react";
import type { Focus } from "@pneuma-framework/core";
import { useWireConnection } from "./useWireConnection.js";

export function useFocus(): (focus: Focus) => boolean {
  const conn = useWireConnection();
  return useCallback((focus) => conn.send({ dir: "v2a", kind: "focus", focus }), [conn]);
}
```

- [ ] **Step 4: Implement `packages/viewer-react/src/useAction.ts`**

```typescript
import { useCallback } from "react";
import type { Action } from "@pneuma-framework/core";
import { useWireConnection } from "./useWireConnection.js";

export function useAction(): (action: Action) => boolean {
  const conn = useWireConnection();
  return useCallback((action) => conn.send({ dir: "v2a", kind: "action", action }), [conn]);
}
```

- [ ] **Step 5: Implement `packages/viewer-react/src/usePneumaState.ts`**

```typescript
import { useEffect, useState } from "react";
import type { WireEnvelope } from "@pneuma-framework/core";
import { useWireConnection } from "./useWireConnection.js";

export interface PneumaViewerState {
  /** Accumulated assistant text keyed by turnId. */
  turns: Record<string, string>;
  /** Current content of workspace files keyed by workspace-relative path. */
  docs: Record<string, string>;
  /** Toasts emitted via a2v viewer-request; newest last. */
  toasts: Array<{ message: string; level: "info" | "warn" | "error"; ts: number }>;
}

const empty: PneumaViewerState = { turns: {}, docs: {}, toasts: [] };

export function usePneumaState(): PneumaViewerState {
  const conn = useWireConnection();
  const [state, setState] = useState<PneumaViewerState>(empty);
  useEffect(() => {
    return conn.subscribe((env: WireEnvelope) => {
      if (env.dir !== "a2v") return;
      if (env.kind === "text") {
        setState((s) => ({
          ...s,
          turns: { ...s.turns, [env.turnId]: (s.turns[env.turnId] ?? "") + env.delta },
        }));
        return;
      }
      if (env.kind === "state") {
        setState((s) => ({ ...s, docs: { ...s.docs, [env.state.path]: env.state.content } }));
        return;
      }
      if (env.kind === "viewer-request" && env.req.kind === "toast") {
        setState((s) => ({
          ...s,
          toasts: [...s.toasts, { message: env.req.message, level: env.req.level ?? "info", ts: Date.now() }].slice(-20),
        }));
        return;
      }
    });
  }, [conn]);
  return state;
}
```

- [ ] **Step 6: Update `packages/viewer-react/src/index.ts`**

```typescript
export { PneumaViewer } from "./PneumaViewer.js";
export type { PneumaViewerProps } from "./PneumaViewer.js";
export { useWireConnection } from "./useWireConnection.js";
export { useFocus } from "./useFocus.js";
export { useAction } from "./useAction.js";
export { usePneumaState } from "./usePneumaState.js";
export type { PneumaViewerState } from "./usePneumaState.js";
export { WireContext } from "./context.js";
export type { WireStatus, WireContextValue } from "./context.js";
```

- [ ] **Step 7: Run green**

```bash
bun test packages/viewer-react/test/hooks.test.tsx
bun test
bun run typecheck
```
Expected: 3 new tests pass. Full suite 141 → 144.

- [ ] **Step 8: Commit**

```bash
git add packages/viewer-react/src packages/viewer-react/test/hooks.test.tsx
git commit -m "feat(viewer-react): useFocus / useAction / usePneumaState hooks"
```

---

### Task D1: `templates/doc` manifest + skill + scaffold

**Files:**
- Create: `templates/doc/manifest.json`
- Create: `templates/doc/skill/SKILL.md`
- Create: `templates/doc/scaffold/doc.md`
- Create: `packages/core/test/templates-doc-manifest.test.ts`

- [ ] **Step 1: Create `templates/doc/manifest.json`**

```json
{
  "schemaVersion": 1,
  "name": "doc",
  "version": "0.1.0",
  "displayName": "Doc",
  "description": "Minimum-viable pneuma-app template: single markdown document, live preview, side chat.",
  "backends": {
    "supported": ["opencode", "claude-code", "codex"],
    "defaultConfig": {}
  },
  "runtimeAgent": "none",
  "scripts": {
    "dev": "scripts/dev.sh"
  }
}
```

- [ ] **Step 2: Create `templates/doc/skill/SKILL.md`**

Adapted from `pneuma-skills/modes/doc/skill/SKILL.md` (keep the agent guidance but remove pneuma-skills-specific bits):

```markdown
---
name: pneuma-doc
description: >
  Pneuma Doc Mode workspace guidelines. Use for ANY task in this workspace:
  writing, editing, creating documents, reports, articles, READMEs, notes,
  outlines, summaries, translations, restructuring, formatting, or any markdown
  content. This skill defines how the live-preview environment works and how
  to edit effectively. Consult before your first edit in a new conversation.
---

# Pneuma Doc Mode — Document Editing Skill

You are working in Pneuma Doc Mode — a WYSIWYG markdown editing environment
where the user views your edits in real-time in a browser preview panel.

## Core Principles

1. **Act, don't ask**: For straightforward edits, just do them. Only ask for
   clarification on ambiguous requests.
2. **Incremental edits**: Make focused changes — the user sees each edit live
   as you make it.
3. **Preserve structure**: Don't reorganize content unless explicitly asked.
4. **Quality markdown**: Use proper GFM conventions consistently.

## File Convention

- The active document is `doc.md` at the workspace root.
- Edit `doc.md` in place. Do not create sibling `.md` files in v0 — the viewer
  only renders `doc.md`.
- Use standard GitHub-Flavored Markdown (GFM).

## Editing Guidelines

- Use your `Edit` tool (preferred) for surgical changes to existing content.
- Use your `Write` tool only for creating new content or full rewrites.
- Make focused, incremental edits — the user sees changes live, so each edit
  should leave the document in a valid state.
- Preserve existing content structure unless asked to reorganize.

## Context Format

When the user sends a message, the runtime may prepend context lines like:

- `[Context: file "doc.md"]` — which file the user is viewing.
- `[User selected: heading (level 2) "Installation"]` — which element they
  clicked in the viewer.

Use this to resolve references like "this section", "here", "that heading", etc.

## Constraints

- Do not create non-markdown files unless explicitly asked.
- Do not modify `.pneuma/` — it is runtime state.
- Do not ask for confirmation before simple edits — the user sees edits live
  and can course-correct.
```

- [ ] **Step 3: Create `templates/doc/scaffold/doc.md`**

```markdown
# Welcome to Pneuma Doc Mode

Start a conversation in the chat panel on the right — tell the agent what
document you want to build.

Examples:
- "Write a short README for a TypeScript library called **phlox**."
- "Draft an outline for a 3-section blog post on co-routines."
- "Replace this file with a one-page pitch for a pomodoro app."
```

- [ ] **Step 4: Write the failing test** — `packages/core/test/templates-doc-manifest.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { join } from "node:path";
import { parseTemplateManifest } from "../src/manifest.js";

const TPL = join(import.meta.dir, "../../../templates/doc");

test("templates/doc has a valid manifest", () => {
  const m = parseTemplateManifest(TPL);
  expect(m.name).toBe("doc");
  expect(m.scripts?.dev).toBe("scripts/dev.sh");
  expect(m.backends?.supported).toContain("opencode");
});
```

- [ ] **Step 5: Run**

```bash
bun test packages/core/test/templates-doc-manifest.test.ts
```
Expected: fail (dev.sh missing) OR pass once manifest parser doesn't require the script to exist. If parseTemplateManifest validates script existence, this test needs dev.sh first — proceed to Task D2 and run this test at the end of D2 instead. In that case: skip Step 5 here.

- [ ] **Step 6: Commit**

```bash
git add templates/doc/manifest.json templates/doc/skill/SKILL.md templates/doc/scaffold/doc.md packages/core/test/templates-doc-manifest.test.ts
git commit -m "feat(templates/doc): scaffold — manifest, skill, initial doc.md"
```

---

### Task D2: `templates/doc/scripts/dev.sh` — viewer dev server + scaffold + AGENTS.md install

**Files:**
- Create: `templates/doc/scripts/dev.sh`

- [ ] **Step 1: Implement `templates/doc/scripts/dev.sh`**

```bash
#!/bin/sh
set -eu

: "${PNEUMA_WORKSPACE:?PNEUMA_WORKSPACE is required}"
: "${PNEUMA_SESSION_ID:?PNEUMA_SESSION_ID is required}"
: "${PNEUMA_WS_URL:?PNEUMA_WS_URL is required}"

PORT="${PNEUMA_PORT_HINT:-5173}"

# First-run scaffold: seed doc.md and AGENTS.md into the workspace.
if [ ! -f "$PNEUMA_WORKSPACE/doc.md" ]; then
  cp "$(dirname "$0")/../scaffold/doc.md" "$PNEUMA_WORKSPACE/doc.md"
fi
if [ ! -f "$PNEUMA_WORKSPACE/AGENTS.md" ]; then
  cp "$(dirname "$0")/../skill/SKILL.md" "$PNEUMA_WORKSPACE/AGENTS.md"
fi

# Trap: graceful shutdown. The viewer process group dies with the shell.
trap 'echo "##pneuma:stopping"; exit 0' TERM INT

VIEWER_DIR="$(dirname "$0")/../viewer"

cd "$VIEWER_DIR"
echo "##pneuma:service-ready viewer http://127.0.0.1:${PORT}/?sid=${PNEUMA_SESSION_ID}&ws=$(printf '%s' "$PNEUMA_WS_URL" | sed 's|/|%2F|g; s|:|%3A|g')"
echo "##pneuma:ready"

exec bun --hot src/main.tsx --port "$PORT" 1>&2 &
SERVER_PID=$!

# Simple idle wait on the server.
wait "$SERVER_PID"
```

Make executable:

```bash
chmod +x templates/doc/scripts/dev.sh
```

**Note on `bun --hot` + HTML**: Bun 1.3 natively serves `.tsx` + `.html` with hot module reload. The entrypoint here is `src/main.tsx`; the HTML is mounted via Bun's built-in HTML serving by placing `index.html` alongside the entry. Task D3 creates the HTML.

- [ ] **Step 2: Commit (dev.sh but no viewer yet — verified in later tasks)**

```bash
git add templates/doc/scripts/dev.sh
git commit -m "feat(templates/doc): dev.sh — scaffold workspace + launch viewer with bun --hot"
```

---

### Task D3: Viewer HTML + React mount + URL param parsing

**Files:**
- Create: `templates/doc/viewer/package.json`
- Create: `templates/doc/viewer/tsconfig.json`
- Create: `templates/doc/viewer/index.html`
- Create: `templates/doc/viewer/src/main.tsx`
- Create: `templates/doc/viewer/src/App.tsx`

- [ ] **Step 1: Create `templates/doc/viewer/package.json`**

```json
{
  "name": "pneuma-template-doc-viewer",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@pneuma-framework/viewer-react": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "marked": "^14.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 2: Create `templates/doc/viewer/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

- [ ] **Step 3: Create `templates/doc/viewer/index.html`** (Bun serves this via `bun --hot` entry rewrite)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pneuma Doc</title>
    <style>
      html, body, #root { margin: 0; height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      body { background: #fafaf9; color: #1c1917; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `templates/doc/viewer/src/main.tsx`**

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const container = document.getElementById("root");
if (!container) throw new Error("no #root element");
createRoot(container).render(<StrictMode><App /></StrictMode>);
```

- [ ] **Step 5: Create `templates/doc/viewer/src/App.tsx`**

```typescript
import { PneumaViewer } from "@pneuma-framework/viewer-react";

export function App() {
  const params = new URLSearchParams(window.location.search);
  const sid = params.get("sid");
  const ws = params.get("ws");
  if (!sid || !ws) {
    return (
      <div style={{ padding: 32, fontFamily: "monospace" }}>
        <h1>Pneuma Doc Viewer</h1>
        <p>Missing <code>?sid</code> or <code>&amp;ws</code> query parameter.</p>
        <p>Open the URL printed by <code>pneuma-framework dev</code>.</p>
      </div>
    );
  }
  const wsUrl = `${ws}/ws/viewer/${sid}`;
  return (
    <PneumaViewer wsUrl={wsUrl} sid={sid}>
      <div style={{ padding: 24 }}>
        <h1>Pneuma Doc</h1>
        <p>Connected. Chat panel + preview land in Tasks D4/D5.</p>
      </div>
    </PneumaViewer>
  );
}
```

- [ ] **Step 6: Install + smoke**

```bash
bun install
# Smoke: Bun should compile the entry without running the viewer (it still
# needs the workspace envs to start properly).
bun build --target=browser templates/doc/viewer/src/main.tsx --outfile /tmp/pneuma-doc-main.js 2>&1 | tail -5
test -s /tmp/pneuma-doc-main.js && echo OK
```
Expected: `OK` printed. (No test runner assertion; compile-check only.)

- [ ] **Step 7: Commit**

```bash
git add templates/doc/viewer bun.lock
git commit -m "feat(templates/doc/viewer): React mount + URL param parsing + PneumaViewer wiring"
```

---

### Task D4: `MarkdownPreview` — renders `doc.md` with clickable headings/paragraphs

**Files:**
- Create: `templates/doc/viewer/src/MarkdownPreview.tsx`
- Modify: `templates/doc/viewer/src/App.tsx`

- [ ] **Step 1: Implement `MarkdownPreview.tsx`**

```typescript
import { useMemo } from "react";
import { marked, type Tokens } from "marked";
import { useFocus, usePneumaState } from "@pneuma-framework/viewer-react";

/**
 * Renders doc.md as HTML and wires heading + paragraph clicks to `useFocus`.
 * Element indices are computed per-kind, matching FocusElement.index semantics.
 */
export function MarkdownPreview() {
  const { docs } = usePneumaState();
  const setFocus = useFocus();
  const raw = docs["doc.md"] ?? "";

  const blocks = useMemo(() => {
    const tokens = marked.lexer(raw);
    const headingIdx = { next: 0 };
    const paragraphIdx = { next: 0 };
    const codeIdx = { next: 0 };
    return tokens.map((tok, i) => renderToken(tok, i, headingIdx, paragraphIdx, codeIdx, setFocus));
  }, [raw, setFocus]);

  if (!raw) {
    return (
      <div style={{ padding: 24, color: "#78716c" }}>
        Waiting for <code>doc.md</code>…
      </div>
    );
  }
  return <article style={{ maxWidth: 720, margin: "0 auto", padding: 32, lineHeight: 1.6 }}>{blocks}</article>;
}

type IdxRef = { next: number };
type SetFocus = ReturnType<typeof useFocus>;

function renderToken(
  tok: Tokens.Generic,
  key: number,
  h: IdxRef,
  p: IdxRef,
  c: IdxRef,
  setFocus: SetFocus,
): JSX.Element | null {
  if (tok.type === "heading") {
    const idx = h.next++;
    const level = (tok as Tokens.Heading).depth;
    const text = (tok as Tokens.Heading).text;
    const Tag = (`h${level}` as unknown) as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    return (
      <Tag
        key={key}
        style={{ cursor: "pointer" }}
        onClick={() => setFocus({
          file: "doc.md",
          element: { kind: "heading", index: idx, text, level, anchor: slug(text) },
        })}
      >
        {text}
      </Tag>
    );
  }
  if (tok.type === "paragraph") {
    const idx = p.next++;
    const text = (tok as Tokens.Paragraph).text;
    return (
      <p
        key={key}
        style={{ cursor: "pointer" }}
        onClick={() => setFocus({
          file: "doc.md",
          element: { kind: "paragraph", index: idx, text: text.slice(0, 120) },
        })}
        dangerouslySetInnerHTML={{ __html: marked.parseInline(text) as string }}
      />
    );
  }
  if (tok.type === "code") {
    const idx = c.next++;
    const text = (tok as Tokens.Code).text;
    return (
      <pre
        key={key}
        style={{
          cursor: "pointer",
          background: "#f5f5f4", padding: 12, borderRadius: 4, overflowX: "auto",
        }}
        onClick={() => setFocus({
          file: "doc.md",
          element: { kind: "code-block", index: idx, text: text.slice(0, 120) },
        })}
      ><code>{text}</code></pre>
    );
  }
  if (tok.type === "list") {
    const items = (tok as Tokens.List).items;
    return (
      <ul key={key}>
        {items.map((it, j) => (
          <li key={j} dangerouslySetInnerHTML={{ __html: marked.parseInline(it.text) as string }} />
        ))}
      </ul>
    );
  }
  if (tok.type === "space") return null;
  // Fallback: render raw via marked.parser for unknown types.
  return <div key={key} dangerouslySetInnerHTML={{ __html: marked.parser([tok as Tokens.Generic]) as string }} />;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
```

- [ ] **Step 2: Update `App.tsx`** to include `<MarkdownPreview>`:

```typescript
import { PneumaViewer } from "@pneuma-framework/viewer-react";
import { MarkdownPreview } from "./MarkdownPreview.js";

export function App() {
  const params = new URLSearchParams(window.location.search);
  const sid = params.get("sid");
  const ws = params.get("ws");
  if (!sid || !ws) {
    return (
      <div style={{ padding: 32, fontFamily: "monospace" }}>
        <h1>Pneuma Doc Viewer</h1>
        <p>Missing <code>?sid</code> or <code>&amp;ws</code> query parameter.</p>
      </div>
    );
  }
  const wsUrl = `${ws}/ws/viewer/${sid}`;
  return (
    <PneumaViewer wsUrl={wsUrl} sid={sid}>
      <MarkdownPreview />
    </PneumaViewer>
  );
}
```

- [ ] **Step 3: Compile-check**

```bash
bun build --target=browser templates/doc/viewer/src/main.tsx --outfile /tmp/pneuma-doc-mp.js 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add templates/doc/viewer/src/MarkdownPreview.tsx templates/doc/viewer/src/App.tsx
git commit -m "feat(templates/doc/viewer): MarkdownPreview with clickable heading/paragraph/code focus"
```

---

### Task D5: `ChatPanel` — collapsible side chat with stream display

**Files:**
- Create: `templates/doc/viewer/src/ChatPanel.tsx`
- Modify: `templates/doc/viewer/src/App.tsx`

- [ ] **Step 1: Implement `ChatPanel.tsx`**

```typescript
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAction, usePneumaState, useWireConnection } from "@pneuma-framework/viewer-react";

/**
 * Collapsible right-edge chat sidebar. Click the tab to toggle.
 */
export function ChatPanel() {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [sentMessages, setSentMessages] = useState<string[]>([]);
  const sendAction = useAction();
  const conn = useWireConnection();
  const { turns, toasts } = usePneumaState();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const turnIds = Object.keys(turns);
  const latestTurn = turnIds.at(-1);
  const latestReply = latestTurn ? turns[latestTurn] : "";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [latestReply, sentMessages.length]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const ok = sendAction({ kind: "user-message", text });
    if (!ok) return;
    setSentMessages((prev) => [...prev, text]);
    setDraft("");
  }

  return (
    <>
      <button
        aria-label={open ? "Collapse chat" : "Expand chat"}
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed", right: open ? 360 : 0, top: 16, zIndex: 2,
          border: "1px solid #e7e5e4", borderRight: open ? "none" : "1px solid #e7e5e4",
          background: "#fff", padding: "6px 10px", cursor: "pointer",
          borderRadius: open ? "4px 0 0 4px" : "4px 0 0 4px",
          transition: "right 150ms ease",
        }}
      >{open ? "→" : "←"}</button>
      <aside
        style={{
          position: "fixed", top: 0, right: open ? 0 : -360, bottom: 0, width: 360,
          background: "#fff", borderLeft: "1px solid #e7e5e4",
          display: "flex", flexDirection: "column",
          transition: "right 150ms ease", zIndex: 1,
        }}
      >
        <header style={{ padding: "12px 16px", borderBottom: "1px solid #e7e5e4", fontSize: 14 }}>
          <strong>Chat</strong>
          <span style={{ marginLeft: 12, color: conn.status === "open" ? "#16a34a" : "#dc2626", fontSize: 12 }}>
            {conn.status}
          </span>
        </header>
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "12px 16px", fontSize: 14 }}>
          {sentMessages.map((m, i) => (
            <div key={`u-${i}`} style={{ margin: "8px 0", color: "#1c1917" }}>
              <strong>You:</strong> {m}
            </div>
          ))}
          {latestReply && (
            <div style={{ margin: "8px 0", color: "#0c4a6e", whiteSpace: "pre-wrap" }}>
              <strong>Agent:</strong> {latestReply}
            </div>
          )}
          {toasts.map((t, i) => (
            <div key={`t-${i}`} style={{ color: t.level === "error" ? "#dc2626" : "#78716c", fontSize: 12 }}>
              {t.message}
            </div>
          ))}
        </div>
        <form onSubmit={submit} style={{ display: "flex", borderTop: "1px solid #e7e5e4" }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message…"
            style={{ flex: 1, border: "none", padding: 12, outline: "none", fontSize: 14 }}
          />
          <button type="submit" style={{ border: "none", background: "#0ea5e9", color: "#fff", padding: "0 16px", cursor: "pointer" }}>
            Send
          </button>
        </form>
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Update `App.tsx`** to include the chat panel:

```typescript
import { PneumaViewer } from "@pneuma-framework/viewer-react";
import { MarkdownPreview } from "./MarkdownPreview.js";
import { ChatPanel } from "./ChatPanel.js";

export function App() {
  const params = new URLSearchParams(window.location.search);
  const sid = params.get("sid");
  const ws = params.get("ws");
  if (!sid || !ws) {
    return (
      <div style={{ padding: 32, fontFamily: "monospace" }}>
        <h1>Pneuma Doc Viewer</h1>
        <p>Missing <code>?sid</code> or <code>&amp;ws</code> query parameter.</p>
      </div>
    );
  }
  const wsUrl = `${ws}/ws/viewer/${sid}`;
  return (
    <PneumaViewer wsUrl={wsUrl} sid={sid}>
      <MarkdownPreview />
      <ChatPanel />
    </PneumaViewer>
  );
}
```

- [ ] **Step 3: Compile-check**

```bash
bun build --target=browser templates/doc/viewer/src/main.tsx --outfile /tmp/pneuma-doc-chat.js 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add templates/doc/viewer/src/ChatPanel.tsx templates/doc/viewer/src/App.tsx
git commit -m "feat(templates/doc/viewer): collapsible ChatPanel with streaming assistant text"
```

---

### Task D6: Seed state on connect — push initial doc.md to the viewer

**Problem:** `usePneumaState().docs["doc.md"]` starts empty. The file watcher only fires on CHANGES. A fresh viewer reload sees nothing until the first edit.

**Files:**
- Modify: `packages/core/src/wire-protocol/server.ts` (callback hook on open)
- Modify: `packages/core/src/wire-protocol/file-state-push.ts` (expose "seed" helper)
- Modify: `packages/core/src/create.ts` (wire the seed)
- Create: `packages/core/test/wire-protocol/seed-on-open.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/wire-protocol/seed-on-open.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPneumaFramework } from "../../src/index.js";
import type { WireEnvelope } from "../../src/index.js";

const FIXTURE = join(import.meta.dir, "../fixtures/templates/fixture-min");

test("a viewer connecting after doc.md exists receives an initial a2v state envelope", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-seed-"));
  writeFileSync(join(ws, "doc.md"), "# preexisting");
  const fw = createPneumaFramework({
    templateDir: FIXTURE, workspace: ws, wire: { enabled: true },
  });
  const client = new WebSocket(
    `${fw.wireServer!.url.replace(/^http/, "ws")}/ws/viewer/${fw.sessionId}`,
  );
  const received: WireEnvelope[] = [];
  client.addEventListener("message", (e) => {
    received.push(JSON.parse(typeof e.data === "string" ? e.data : "") as WireEnvelope);
  });
  await new Promise<void>((r) => client.addEventListener("open", () => r(), { once: true }));
  await new Promise((r) => setTimeout(r, 100));

  const state = received.find((e) => e.kind === "state");
  expect(state?.kind === "state" && state.state.path).toBe("doc.md");
  expect(state?.kind === "state" && state.state.content).toBe("# preexisting");

  client.close();
  await fw.close();
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
bun test packages/core/test/wire-protocol/seed-on-open.test.ts
```

- [ ] **Step 3: Extend `server.ts`** — add `onViewerOpen` option:

```typescript
export interface WireServerOptions {
  port: number;
  onViewerEnvelope: (session: Session, env: WireEnvelope) => void;
  /** Fires when a viewer WebSocket opens. Use to push seed envelopes. */
  onViewerOpen?: (session: Session, send: (env: WireEnvelope) => void) => void;
}
```

In the `open(ws)` handler, after `session.viewerSockets.add(ws)`:

```typescript
opts.onViewerOpen?.(session, (env) => {
  ws.send(JSON.stringify(env));
});
```

- [ ] **Step 4: Extend `file-state-push.ts`** — add a `seedInitialState` helper:

```typescript
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { WireEnvelope } from "./types.js";
// ... keep startFileStatePush ...

export function seedInitialState(
  workspaceRoot: string,
  extensions: string[] = [".md"],
): WireEnvelope[] {
  const out: WireEnvelope[] = [];
  if (!existsSync(workspaceRoot)) return out;
  const skip = new Set([".pneuma", ".pneuma-build", "node_modules", ".git"]);
  const walk = (dir: string): void => {
    let names: string[] = [];
    try { names = readdirSync(dir); } catch { return; }
    for (const name of names) {
      if (skip.has(name)) continue;
      const abs = join(dir, name);
      let st;
      try { st = statSync(abs); } catch { continue; }
      if (st.isDirectory()) { walk(abs); continue; }
      const ext = name.toLowerCase().slice(name.lastIndexOf("."));
      if (!extensions.includes(ext)) continue;
      let content = "";
      try { content = readFileSync(abs, "utf8"); } catch { continue; }
      out.push({
        dir: "a2v", kind: "state",
        state: { path: relative(workspaceRoot, abs), content, ts: Date.now() },
      });
    }
  };
  walk(workspaceRoot);
  return out;
}
```

- [ ] **Step 5: Wire the seed in `create.ts`**

In the `if (opts.wire?.enabled)` block, pass `onViewerOpen` to `createWireServer`:

```typescript
wireServer = createWireServer(sessionRegistry, {
  port: opts.wire.port ?? 0,
  onViewerEnvelope: (session, env) => handleViewerEnvelope(session, env),
  onViewerOpen: (_session, send) => {
    for (const env of seedInitialState(orchestrator.workspace)) send(env);
  },
});
```

Add import:

```typescript
import { startFileStatePush, seedInitialState } from "./wire-protocol/file-state-push.js";
```

- [ ] **Step 6: Run green**

```bash
bun test packages/core/test/wire-protocol/seed-on-open.test.ts
bun test
```
Expected: 1 new pass. Full suite 144 → 145.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/wire-protocol/server.ts packages/core/src/wire-protocol/file-state-push.ts packages/core/src/create.ts packages/core/test/wire-protocol/seed-on-open.test.ts
git commit -m "feat(core): seed initial workspace state to viewers on WS open"
```

---

### Task E1: Extend env contract with PNEUMA_SESSION_ID + PNEUMA_WS_URL

**Files:**
- Modify: `packages/core/src/env.ts`
- Modify: `packages/core/test/env.test.ts`

- [ ] **Step 1: Append failing tests to `packages/core/test/env.test.ts`**

```typescript
test("buildLifecycleEnv forwards sessionId and wsUrl when provided", () => {
  const env = buildLifecycleEnv({
    workspace: "/ws",
    verb: "dev",
    mode: "dev",
    sessionId: "sid-123",
    wsUrl: "http://127.0.0.1:40000",
    parentEnv: {},
  });
  expect(env.PNEUMA_SESSION_ID).toBe("sid-123");
  expect(env.PNEUMA_WS_URL).toBe("http://127.0.0.1:40000");
});

test("buildLifecycleEnv omits sessionId / wsUrl when undefined", () => {
  const env = buildLifecycleEnv({
    workspace: "/ws", verb: "dev", mode: "dev", parentEnv: {},
  });
  expect(env.PNEUMA_SESSION_ID).toBeUndefined();
  expect(env.PNEUMA_WS_URL).toBeUndefined();
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
bun test packages/core/test/env.test.ts
```

- [ ] **Step 3: Extend `packages/core/src/env.ts`**

Find the existing `buildLifecycleEnv` signature and its `options` interface. Add two optional fields: `sessionId?: string` and `wsUrl?: string`. In the returned env object, conditionally set `PNEUMA_SESSION_ID` and `PNEUMA_WS_URL` only when provided (do not set undefined values — keeps env clean for templates that don't use wire).

Sketch of the changes:

```typescript
export interface BuildLifecycleEnvOptions {
  workspace: string;
  verb: LifecycleVerb;
  mode: "dev" | "release";
  buildDir?: string;
  artifactManifestPath?: string;
  portHint?: number;
  sessionId?: string;       // NEW
  wsUrl?: string;            // NEW
  parentEnv: NodeJS.ProcessEnv;
}

export function buildLifecycleEnv(opts: BuildLifecycleEnvOptions): Record<string, string> {
  // ...existing filter preserving non-PNEUMA_* parent env...
  const out: Record<string, string> = { /* existing */ };
  // ...existing assignments for workspace/verb/mode/buildDir/artifactManifestPath/portHint...
  if (opts.sessionId) out.PNEUMA_SESSION_ID = opts.sessionId;
  if (opts.wsUrl) out.PNEUMA_WS_URL = opts.wsUrl;
  return out;
}
```

- [ ] **Step 4: Update the orchestrator to forward them**

In `packages/core/src/lifecycle.ts`, the `spawnVerb` method already calls `buildLifecycleEnv(...)`. Extend its `OrchestratorOptions` to accept `sessionId?`, `wsUrl?` AND pass them through. Then extend `runDev(portHint?)` similarly, or more simply: accept these as class fields on the orchestrator and use them in every `buildLifecycleEnv` call.

Change the class:

```typescript
export interface OrchestratorOptions {
  templateDir: string;
  workspace: string;
  portHint?: number;
  stopScriptTimeoutMs?: number;
  stopSigtermTimeoutMs?: number;
  sessionId?: string;  // NEW
  wsUrl?: string;       // NEW
}
```

Add fields + forward in `spawnVerb`'s `buildLifecycleEnv` and in `runStop`'s stop-script env.

- [ ] **Step 5: Wire in `create.ts`**

In `createPneumaFramework`, after constructing the wire server but BEFORE returning, if `wireServer` exists:

```typescript
// Propagate the session id + ws URL to the orchestrator so lifecycle
// scripts receive them as env vars.
orchestrator.setSessionContext({ sessionId: sessionId!, wsUrl: wireServer.url });
```

Add the setter to `LifecycleOrchestrator`:

```typescript
setSessionContext(ctx: { sessionId?: string; wsUrl?: string }): void {
  if (ctx.sessionId !== undefined) this.sessionId = ctx.sessionId;
  if (ctx.wsUrl !== undefined) this.wsUrl = ctx.wsUrl;
}
```

- [ ] **Step 6: Run green**

```bash
bun test
bun run typecheck
```
Expected: 2 new env tests pass. Full suite 145 → 147. Typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/env.ts packages/core/src/lifecycle.ts packages/core/src/create.ts packages/core/test/env.test.ts
git commit -m "feat(core): lifecycle env forwards PNEUMA_SESSION_ID + PNEUMA_WS_URL to scripts"
```

---

### Task E2: CLI prints the viewer URL and enables wire for `dev`

**Files:**
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Modify `packages/cli/src/index.ts`**

Change the framework construction (inside the verb switch for `dev`) to always enable wire + auto-accept permissions when the CLI is used. After the service-ready listing, print the viewer URL derived from `fw.sessionId` + `fw.wireServer.url`:

Replace the existing `createPneumaFramework({...})` call with:

```typescript
const fw = createPneumaFramework({
  templateDir, workspace,
  portHint: parsed.port,
  backend,
  wire: parsed.verb === "dev" ? { enabled: true, autoAcceptPermissions: true } : undefined,
});
```

After the `log("ready")` and service listing, add:

```typescript
if (fw.wireServer && fw.sessionId) {
  const viewerService = fw.orchestrator.state.dev?.services.find((s) => s.name === "viewer");
  if (viewerService) {
    const viewerUrl = appendSidAndWs(viewerService.url, fw.sessionId, fw.wireServer.url);
    console.log(`\n  Builder URL: ${viewerUrl}\n  (copy to browser)\n`);
  }
}
```

Add helper at the bottom of the file:

```typescript
function appendSidAndWs(url: string, sid: string, wsUrl: string): string {
  const u = new URL(url);
  u.searchParams.set("sid", sid);
  u.searchParams.set("ws", wsUrl);
  return u.toString();
}
```

After `backend` launch, call `fw.annotateBackendSession(sess.sessionId)` so v2a actions route to the right backend session:

```typescript
// (wherever backend.launch was called)
if (backend) {
  // ...existing launch...
  const sess = /* however we captured it — if not captured, create an explicit session here */;
  fw.annotateBackendSession(sess.sessionId);
}
```

**Note:** the existing CLI calls `backend.launch` but doesn't retain the session id. Keep the returned `AgentSession` in a local variable and use it for `annotateBackendSession`.

- [ ] **Step 2: Smoke test manually — launch templates/doc + opus 4.7**

Run once to make sure nothing blows up (not a bun:test). Pipe to `head` to kill quickly:

```bash
timeout-run() { bun packages/cli/src/index.ts dev templates/doc --backend opencode & P=$!; sleep 3; kill "$P" 2>/dev/null || true; wait "$P" 2>/dev/null || true; }
# Or without timeout — inspect logs and Ctrl-C.
```

Expected in the output: a line like `Builder URL: http://127.0.0.1:5173/?sid=...&ws=http%3A%2F%2F127.0.0.1%3A...`.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "feat(cli): dev mode enables wire + prints Builder URL with sid+ws params"
```

---

### Task F1: End-to-end integration test — framework + fake viewer + FakeAgentBackend

**Files:**
- Create: `packages/core/test/e2e-wire-flow.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPneumaFramework, FakeAgentBackend } from "../src/index.js";
import type { WireEnvelope } from "../src/index.js";

const FIXTURE = join(import.meta.dir, "fixtures/templates/fixture-min");

test("E2E wire flow: state seed + focus + user-message → backend; text event → viewer", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-e2e-wire-"));
  writeFileSync(join(ws, "doc.md"), "# Hello");

  const backend = new FakeAgentBackend();
  const fw = createPneumaFramework({
    templateDir: FIXTURE, workspace: ws, backend,
    wire: { enabled: true, autoAcceptPermissions: true },
  });
  const sess = await backend.launch({ cwd: ws });
  fw.annotateBackendSession(sess.sessionId);

  const client = new WebSocket(
    `${fw.wireServer!.url.replace(/^http/, "ws")}/ws/viewer/${fw.sessionId}`,
  );
  const received: WireEnvelope[] = [];
  client.addEventListener("message", (e) => {
    received.push(JSON.parse(typeof e.data === "string" ? e.data : "") as WireEnvelope);
  });
  await new Promise<void>((r) => client.addEventListener("open", () => r(), { once: true }));
  await new Promise((r) => setTimeout(r, 80));

  // 1. Seed envelope arrived with doc.md content.
  const seeded = received.find((e) => e.kind === "state");
  expect(seeded?.kind === "state" && seeded.state.content).toBe("# Hello");

  // 2. Viewer sends focus + user-message; backend sees prefixed prompt.
  client.send(JSON.stringify({
    dir: "v2a", kind: "focus",
    focus: { file: "doc.md", element: { kind: "heading", index: 0, text: "Hello", level: 1 } },
  } satisfies WireEnvelope));
  client.send(JSON.stringify({
    dir: "v2a", kind: "action",
    action: { kind: "user-message", text: "rename this" },
  } satisfies WireEnvelope));
  await new Promise((r) => setTimeout(r, 80));
  const msg = backend.userMessages.at(-1);
  expect(msg?.text).toContain("rename this");
  expect(msg?.text).toMatch(/\[Context: file "doc\.md"\]/);
  expect(msg?.text).toMatch(/\[User selected: heading.*"Hello"\]/);

  // 3. Backend emits text event → viewer receives a2v text envelopes with deltas.
  backend.simulate({
    type: "text", sessionId: sess.sessionId,
    payload: { part: { id: "p1", type: "text", text: "Got" }, messageID: "m1" },
  });
  backend.simulate({
    type: "text", sessionId: sess.sessionId,
    payload: { part: { id: "p1", type: "text", text: "Got it" }, messageID: "m1" },
  });
  await new Promise((r) => setTimeout(r, 80));
  const deltas = received.filter((e) => e.kind === "text").map((e) => e.kind === "text" && e.delta);
  expect(deltas).toEqual(["Got", " it"]);

  // 4. Editing doc.md fires state envelope.
  writeFileSync(join(ws, "doc.md"), "# Renamed");
  await new Promise((r) => setTimeout(r, 200));
  const states = received.filter((e) => e.kind === "state");
  expect(states.at(-1)?.kind === "state" && states.at(-1)!.state.content).toBe("# Renamed");

  client.close();
  await fw.close();
});
```

- [ ] **Step 2: Run green**

```bash
bun test packages/core/test/e2e-wire-flow.test.ts
bun test
```
Expected: 1 new pass. Full suite 147 → 148.

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/e2e-wire-flow.test.ts
git commit -m "test(core): end-to-end wire flow — seed + focus + action + text delta + file-watch"
```

---

### Task F2: `examples/doc-mode/` walkthrough README

**Files:**
- Create: `examples/doc-mode/package.json`
- Create: `examples/doc-mode/README.md`

- [ ] **Step 1: Create `examples/doc-mode/package.json`**

```json
{
  "name": "example-doc-mode",
  "version": "0.0.0",
  "private": true,
  "type": "module"
}
```

No code — this example is purely a run-recipe README.

- [ ] **Step 2: Create `examples/doc-mode/README.md`**

```markdown
# doc-mode — full-stack E2E walkthrough

This example is run-by-hand only; no script. It exercises every M3 moving part:
lifecycle orchestrator + opencode backend + wire protocol + React viewer + live
markdown preview.

## Prereqs

1. `opencode` on `$PATH` (same as the `opencode-chat` example).
2. OpenRouter credential registered with opencode (`opencode auth login`).

## Run

From the repo root:

```sh
bun packages/cli/src/index.ts dev templates/doc --backend opencode
```

The terminal prints something like:

```
[pneuma:starting dev]
[pneuma:ready]
  service viewer: http://127.0.0.1:5173/?sid=<uuid>&ws=...

  Builder URL: http://127.0.0.1:5173/?sid=<uuid>&ws=http%3A%2F%2F127.0.0.1%3A40123
  (copy to browser)
```

Copy the **Builder URL** into a browser.

## What to try

- **Chat →**: in the right-side chat panel, type "write a 3-paragraph intro
  about the framework" and hit Send. Watch `doc.md` populate live.
- **Click a heading**: click an H1/H2 in the preview. The next chat message you
  send arrives at the agent with a `[User selected: heading ...]` context line.
- **Edit `doc.md` on disk**: open `$PNEUMA_WORKSPACE/doc.md` in your editor,
  save. The preview re-renders.
- **Collapse the chat**: click the arrow tab.

## Knobs

- `OPENCODE_MODEL=openrouter/anthropic/claude-haiku-4.5 bun packages/cli/src/index.ts dev templates/doc --backend opencode` — cheaper model.
- `--port 6173` on the CLI — pick a different viewer port.
- `--workspace /path/to/persistent/dir` — persist the workspace so your doc
  stays across runs. (Without this, a throwaway `$TMPDIR/pneuma-ws-...` is used.)

## What's out of scope for M3

- Multi-file editing (only `doc.md` is rendered).
- Permission prompt UI (everything auto-accepts in v0).
- Diff animation / version history UI (checkpoints exist but are not surfaced).
- `claude-code` / `codex` backends (Phase G of the plan).
```

- [ ] **Step 3: Commit**

```bash
git add examples/doc-mode
git commit -m "docs(examples/doc-mode): E2E walkthrough README for templates/doc"
```

---

### Task G1: `@pneuma-framework/backend-claude-code` package

**Goal:** Spawn the `claude-code` CLI with stream-json IO, map its events to `AgentEvent`s, respect `AgentBackend` contract. Reuse the ownership pattern of `backend-opencode` (caller owns launch/close; framework doesn't auto-close).

**Files:**
- Create: `packages/backend-claude-code/package.json`
- Create: `packages/backend-claude-code/tsconfig.json`
- Create: `packages/backend-claude-code/src/index.ts`
- Create: `packages/backend-claude-code/src/adapter.ts`
- Create: `packages/backend-claude-code/test/registration.test.ts`
- Create: `packages/backend-claude-code/test/adapter.test.ts`
- Modify: `package.json` (extend typecheck)

- [ ] **Step 1: Create `packages/backend-claude-code/package.json`**

```json
{
  "name": "@pneuma-framework/backend-claude-code",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@pneuma-framework/core": "workspace:*"
  }
}
```

- [ ] **Step 2: Create `packages/backend-claude-code/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Implement `packages/backend-claude-code/src/adapter.ts`**

```typescript
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type {
  AgentBackend,
  AgentCapabilities,
  AgentEvent,
  AgentEventHandler,
  AgentLaunchOptions,
  AgentSession,
  PermissionResponse,
} from "@pneuma-framework/core";

export const CLAUDE_CODE_CAPS: AgentCapabilities = {
  streaming: true,
  resume: true,
  permissions: true,
  toolProgress: true,
  modelSwitch: true,
};

export interface ClaudeCodeBackendConfig {
  /** Path or command name for claude-code. Defaults to "claude-code". */
  command?: string;
  /** Extra args to forward. */
  extraArgs?: string[];
  /** Default model (e.g. "claude-opus-4-7"). */
  defaultModel?: string;
}

interface LiveSession {
  id: string;
  proc: ChildProcessWithoutNullStreams;
  /** Pending permission request id → resolver for respondToPermission. */
  pendingPerm: Map<string, (decision: PermissionResponse["decision"]) => void>;
}

export class ClaudeCodeBackend implements AgentBackend {
  readonly type = "claude-code" as const;
  readonly capabilities = CLAUDE_CODE_CAPS;

  private readonly handlers = new Set<AgentEventHandler>();
  private readonly sessions = new Map<string, LiveSession>();
  private seq = 0;

  constructor(private readonly config: ClaudeCodeBackendConfig = {}) {}

  async launch(opts: AgentLaunchOptions): Promise<AgentSession> {
    this.seq += 1;
    const id = `cc-${this.seq}`;
    const args = [
      "--output-format", "stream-json",
      "--input-format", "stream-json",
      "--permission-mode", opts.permissionMode === "accept" ? "acceptEdits" : "default",
      ...(opts.model || this.config.defaultModel ? ["--model", opts.model ?? this.config.defaultModel!] : []),
      ...(opts.resumeSessionId ? ["--resume", opts.resumeSessionId] : []),
      ...(this.config.extraArgs ?? []),
    ];
    const proc = spawn(this.config.command ?? "claude-code", args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;

    const live: LiveSession = { id, proc, pendingPerm: new Map() };
    this.sessions.set(id, live);

    this.attachReader(live);

    if (opts.initialPrompt) {
      proc.stdin.write(JSON.stringify({
        type: "user",
        message: { role: "user", content: [{ type: "text", text: opts.initialPrompt }] },
      }) + "\n");
    }

    const sess: AgentSession = {
      sessionId: id,
      state: "ready",
      startedAt: Date.now(),
    };
    this.emit({ type: "session-ready", sessionId: id, payload: {} });
    return sess;
  }

  async sendUserMessage(sessionId: string, text: string): Promise<void> {
    const live = this.sessions.get(sessionId);
    if (!live) throw new Error(`unknown session ${sessionId}`);
    live.proc.stdin.write(JSON.stringify({
      type: "user",
      message: { role: "user", content: [{ type: "text", text }] },
    }) + "\n");
  }

  async respondToPermission(sessionId: string, response: PermissionResponse): Promise<void> {
    const live = this.sessions.get(sessionId);
    if (!live) throw new Error(`unknown session ${sessionId}`);
    // claude-code stream-json accepts a "permission_response" message. Shape:
    // { type: "permission_response", request_id, decision: "allow"|"deny"|"allow_always" }
    live.proc.stdin.write(JSON.stringify({
      type: "permission_response",
      request_id: response.requestId,
      decision: response.decision === "allow-always" ? "allow_always" : response.decision,
    }) + "\n");
  }

  onEvent(handler: AgentEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async stop(sessionId: string): Promise<void> {
    const live = this.sessions.get(sessionId);
    if (!live) return;
    live.proc.kill("SIGTERM");
    this.sessions.delete(sessionId);
    this.emit({ type: "session-exited", sessionId, payload: {} });
  }

  async close(): Promise<void> {
    for (const id of [...this.sessions.keys()]) await this.stop(id);
    this.handlers.clear();
  }

  private attachReader(live: LiveSession): void {
    let buf = "";
    live.proc.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        this.dispatchJsonLine(live.id, line);
      }
    });
    live.proc.on("exit", () => {
      this.sessions.delete(live.id);
      this.emit({ type: "session-exited", sessionId: live.id, payload: {} });
    });
  }

  private dispatchJsonLine(sessionId: string, line: string): void {
    let obj: { type?: string; [k: string]: unknown };
    try { obj = JSON.parse(line); } catch { return; }
    if (!obj.type) return;
    switch (obj.type) {
      case "assistant": {
        // Claude-code emits assistant text as { type: "assistant", message: { content: [{type:"text",text:...}] } }
        const msg = (obj.message as { content?: Array<{ type: string; text?: string }> } | undefined);
        for (const part of msg?.content ?? []) {
          if (part.type === "text" && typeof part.text === "string") {
            this.emit({
              type: "text", sessionId,
              payload: { part: { id: `${sessionId}-t`, type: "text", text: part.text }, messageID: "turn" },
            });
          }
        }
        return;
      }
      case "permission_request": {
        this.emit({
          type: "permission-request", sessionId,
          payload: {
            requestId: obj.request_id as string,
            toolName: obj.tool_name as string,
            input: obj.input as Record<string, unknown>,
          },
        });
        return;
      }
      case "error":
        this.emit({ type: "error", sessionId, payload: obj });
        return;
      default:
        return;
    }
  }

  private emit(ev: AgentEvent): void {
    for (const h of this.handlers) h(ev);
  }
}
```

- [ ] **Step 4: Implement `packages/backend-claude-code/src/index.ts`**

```typescript
import { registerAgentBackend, type AgentBackendFactory } from "@pneuma-framework/core";
import { ClaudeCodeBackend, CLAUDE_CODE_CAPS, type ClaudeCodeBackendConfig } from "./adapter.js";

export { ClaudeCodeBackend, CLAUDE_CODE_CAPS, type ClaudeCodeBackendConfig };

const factory: AgentBackendFactory = (cfg) =>
  new ClaudeCodeBackend((cfg as ClaudeCodeBackendConfig) ?? {});

export function registerClaudeCodeBackend(): void {
  registerAgentBackend(
    {
      type: "claude-code",
      displayName: "Claude Code",
      capabilities: CLAUDE_CODE_CAPS,
      detect: async () => {
        const found = await hasBinary("claude-code");
        return found ? { available: true } : { available: false, reason: "claude-code binary not found on PATH" };
      },
    },
    factory,
  );
}

async function hasBinary(name: string): Promise<boolean> {
  try {
    const proc = Bun.spawn({ cmd: ["which", name], stdout: "pipe", stderr: "ignore" });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    return out.trim().length > 0;
  } catch { return false; }
}
```

- [ ] **Step 5: Write `packages/backend-claude-code/test/registration.test.ts`**

```typescript
import { test, expect, beforeEach } from "bun:test";
import {
  clearAgentBackendRegistry,
  getAgentBackendDescriptor,
  listAgentBackends,
} from "@pneuma-framework/core";
import { registerClaudeCodeBackend } from "../src/index.js";

beforeEach(() => clearAgentBackendRegistry());

test("registerClaudeCodeBackend installs a claude-code descriptor", () => {
  registerClaudeCodeBackend();
  const d = getAgentBackendDescriptor("claude-code");
  expect(d?.displayName).toBe("Claude Code");
  expect(listAgentBackends().map((x) => x.type)).toContain("claude-code");
});
```

- [ ] **Step 6: Write `packages/backend-claude-code/test/adapter.test.ts`**

Use a tiny bash fake for the claude-code binary so the test doesn't need the real one. The fake reads one line of JSON from stdin and echoes a structured response.

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeCodeBackend } from "../src/adapter.js";

function writeFake(dir: string): string {
  const fake = join(dir, "fake-claude-code.sh");
  writeFileSync(
    fake,
    `#!/bin/sh
# Skip flags until the first non-flag arg, then echo a canned assistant response.
echo '{"type":"assistant","message":{"content":[{"type":"text","text":"Hi"}]}}'
# Keep alive briefly to let the reader flush.
sleep 0.2
`,
    "utf8",
  );
  chmodSync(fake, 0o755);
  return fake;
}

test("ClaudeCodeBackend maps assistant JSON line to a text AgentEvent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pneuma-cc-"));
  const cmd = writeFake(dir);
  const b = new ClaudeCodeBackend({ command: cmd });
  const events: string[] = [];
  b.onEvent((ev) => events.push(ev.type));
  const sess = await b.launch({ cwd: dir, initialPrompt: "hi" });
  await new Promise((r) => setTimeout(r, 400));
  expect(events).toContain("text");
  await b.stop(sess.sessionId);
  await b.close();
});
```

- [ ] **Step 7: Extend root typecheck**

Add `tsc --noEmit -p packages/backend-claude-code/tsconfig.json` to the root `typecheck` script.

- [ ] **Step 8: Run green**

```bash
bun install
bun test packages/backend-claude-code
bun test
bun run typecheck
```
Expected: 2 new tests pass. Full suite 148 → 150.

- [ ] **Step 9: Commit**

```bash
git add packages/backend-claude-code package.json bun.lock
git commit -m "feat(backend-claude-code): AgentBackend adapter over claude-code stream-json CLI"
```

---

### Task G2: `@pneuma-framework/backend-codex` package

**Files:**
- Create: `packages/backend-codex/package.json`
- Create: `packages/backend-codex/tsconfig.json`
- Create: `packages/backend-codex/src/index.ts`
- Create: `packages/backend-codex/src/adapter.ts`
- Create: `packages/backend-codex/test/registration.test.ts`
- Create: `packages/backend-codex/test/adapter.test.ts`
- Modify: `package.json` (extend typecheck)

- [ ] **Step 1: Create `packages/backend-codex/package.json`**

```json
{
  "name": "@pneuma-framework/backend-codex",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "@pneuma-framework/core": "workspace:*"
  }
}
```

- [ ] **Step 2: Create `packages/backend-codex/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Implement `packages/backend-codex/src/adapter.ts`**

Codex CLI invocation: `codex exec --json <prompt>` for one-shot; for interactive, `codex proto` speaks a JSON-RPC-over-stdio protocol. We use `codex proto` for session continuity.

```typescript
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type {
  AgentBackend,
  AgentCapabilities,
  AgentEvent,
  AgentEventHandler,
  AgentLaunchOptions,
  AgentSession,
  PermissionResponse,
} from "@pneuma-framework/core";

export const CODEX_CAPS: AgentCapabilities = {
  streaming: true,
  resume: false,     // codex proto sessions don't resume across invocations
  permissions: true,
  toolProgress: true,
  modelSwitch: true,
};

export interface CodexBackendConfig {
  command?: string;
  extraArgs?: string[];
  defaultModel?: string;
}

interface LiveSession {
  id: string;
  proc: ChildProcessWithoutNullStreams;
}

export class CodexBackend implements AgentBackend {
  readonly type = "codex" as const;
  readonly capabilities = CODEX_CAPS;

  private readonly handlers = new Set<AgentEventHandler>();
  private readonly sessions = new Map<string, LiveSession>();
  private seq = 0;

  constructor(private readonly config: CodexBackendConfig = {}) {}

  async launch(opts: AgentLaunchOptions): Promise<AgentSession> {
    this.seq += 1;
    const id = `codex-${this.seq}`;
    const args = ["proto", ...(this.config.extraArgs ?? [])];
    const env = {
      ...process.env,
      ...(opts.model || this.config.defaultModel
        ? { CODEX_MODEL: opts.model ?? this.config.defaultModel! }
        : {}),
    };
    const proc = spawn(this.config.command ?? "codex", args, {
      cwd: opts.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;
    const live: LiveSession = { id, proc };
    this.sessions.set(id, live);
    this.attachReader(live);
    if (opts.initialPrompt) {
      proc.stdin.write(JSON.stringify({
        method: "user_message",
        params: { text: opts.initialPrompt },
      }) + "\n");
    }
    this.emit({ type: "session-ready", sessionId: id, payload: {} });
    return { sessionId: id, state: "ready", startedAt: Date.now() };
  }

  async sendUserMessage(sessionId: string, text: string): Promise<void> {
    const live = this.sessions.get(sessionId);
    if (!live) throw new Error(`unknown session ${sessionId}`);
    live.proc.stdin.write(JSON.stringify({ method: "user_message", params: { text } }) + "\n");
  }

  async respondToPermission(sessionId: string, response: PermissionResponse): Promise<void> {
    const live = this.sessions.get(sessionId);
    if (!live) throw new Error(`unknown session ${sessionId}`);
    live.proc.stdin.write(JSON.stringify({
      method: "permission_response",
      params: { id: response.requestId, decision: response.decision },
    }) + "\n");
  }

  onEvent(handler: AgentEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async stop(sessionId: string): Promise<void> {
    const live = this.sessions.get(sessionId);
    if (!live) return;
    live.proc.kill("SIGTERM");
    this.sessions.delete(sessionId);
    this.emit({ type: "session-exited", sessionId, payload: {} });
  }

  async close(): Promise<void> {
    for (const id of [...this.sessions.keys()]) await this.stop(id);
    this.handlers.clear();
  }

  private attachReader(live: LiveSession): void {
    let buf = "";
    live.proc.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        this.dispatchJsonLine(live.id, line);
      }
    });
    live.proc.on("exit", () => {
      this.sessions.delete(live.id);
      this.emit({ type: "session-exited", sessionId: live.id, payload: {} });
    });
  }

  private dispatchJsonLine(sessionId: string, line: string): void {
    let obj: { method?: string; params?: Record<string, unknown> };
    try { obj = JSON.parse(line); } catch { return; }
    switch (obj.method) {
      case "assistant_text": {
        const text = String(obj.params?.text ?? "");
        this.emit({
          type: "text", sessionId,
          payload: { part: { id: `${sessionId}-t`, type: "text", text }, messageID: "turn" },
        });
        return;
      }
      case "permission_request": {
        this.emit({
          type: "permission-request", sessionId,
          payload: {
            requestId: String(obj.params?.id ?? ""),
            toolName: String(obj.params?.tool ?? ""),
            input: (obj.params?.input as Record<string, unknown>) ?? {},
          },
        });
        return;
      }
      case "error":
        this.emit({ type: "error", sessionId, payload: obj.params ?? {} });
        return;
      default:
        return;
    }
  }

  private emit(ev: AgentEvent): void {
    for (const h of this.handlers) h(ev);
  }
}
```

- [ ] **Step 4: Implement `packages/backend-codex/src/index.ts`**

```typescript
import { registerAgentBackend, type AgentBackendFactory } from "@pneuma-framework/core";
import { CodexBackend, CODEX_CAPS, type CodexBackendConfig } from "./adapter.js";

export { CodexBackend, CODEX_CAPS, type CodexBackendConfig };

const factory: AgentBackendFactory = (cfg) => new CodexBackend((cfg as CodexBackendConfig) ?? {});

export function registerCodexBackend(): void {
  registerAgentBackend(
    {
      type: "codex",
      displayName: "Codex",
      capabilities: CODEX_CAPS,
      detect: async () => {
        try {
          const proc = Bun.spawn({ cmd: ["which", "codex"], stdout: "pipe", stderr: "ignore" });
          const out = await new Response(proc.stdout).text();
          await proc.exited;
          return out.trim().length > 0
            ? { available: true }
            : { available: false, reason: "codex binary not found on PATH" };
        } catch { return { available: false, reason: "detection failed" }; }
      },
    },
    factory,
  );
}
```

- [ ] **Step 5: Write `packages/backend-codex/test/registration.test.ts`**

```typescript
import { test, expect, beforeEach } from "bun:test";
import {
  clearAgentBackendRegistry,
  getAgentBackendDescriptor,
  listAgentBackends,
} from "@pneuma-framework/core";
import { registerCodexBackend } from "../src/index.js";

beforeEach(() => clearAgentBackendRegistry());

test("registerCodexBackend installs a codex descriptor", () => {
  registerCodexBackend();
  const d = getAgentBackendDescriptor("codex");
  expect(d?.displayName).toBe("Codex");
  expect(listAgentBackends().map((x) => x.type)).toContain("codex");
});
```

- [ ] **Step 6: Write `packages/backend-codex/test/adapter.test.ts`** (fake binary like G1)

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexBackend } from "../src/adapter.js";

function writeFake(dir: string): string {
  const fake = join(dir, "fake-codex.sh");
  writeFileSync(
    fake,
    `#!/bin/sh
echo '{"method":"assistant_text","params":{"text":"Hello from codex fake"}}'
sleep 0.2
`,
    "utf8",
  );
  chmodSync(fake, 0o755);
  return fake;
}

test("CodexBackend maps assistant_text JSON-RPC to a text AgentEvent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pneuma-codex-"));
  const cmd = writeFake(dir);
  const b = new CodexBackend({ command: cmd });
  const events: string[] = [];
  b.onEvent((ev) => events.push(ev.type));
  const sess = await b.launch({ cwd: dir });
  await new Promise((r) => setTimeout(r, 400));
  expect(events).toContain("text");
  await b.stop(sess.sessionId);
  await b.close();
});
```

- [ ] **Step 7: Extend root typecheck**

Add `tsc --noEmit -p packages/backend-codex/tsconfig.json` to the root `typecheck` script.

- [ ] **Step 8: Run green**

```bash
bun install
bun test packages/backend-codex
bun test
bun run typecheck
```
Expected: 2 new tests pass. Full suite 150 → 152.

- [ ] **Step 9: Commit**

```bash
git add packages/backend-codex package.json bun.lock
git commit -m "feat(backend-codex): AgentBackend adapter over codex proto stdio JSON-RPC"
```

---

### Task G3: Wire cc + codex into the CLI `--backend` path

**Files:**
- Modify: `packages/cli/package.json` (add workspace deps)
- Modify: `packages/cli/src/index.ts` (auto-register both adapters)

- [ ] **Step 1: Add workspace deps to `packages/cli/package.json`**

```json
{
  "dependencies": {
    "@pneuma-framework/core": "workspace:*",
    "@pneuma-framework/backend-opencode": "workspace:*",
    "@pneuma-framework/backend-claude-code": "workspace:*",
    "@pneuma-framework/backend-codex": "workspace:*"
  }
}
```

Run `bun install`.

- [ ] **Step 2: Extend the backend-registration switch in `packages/cli/src/index.ts`**

Replace the existing `if (parsed.backend === "opencode") { ... }` block with:

```typescript
if (parsed.backend) {
  if (parsed.backend === "opencode") {
    const mod = await import("@pneuma-framework/backend-opencode");
    mod.registerOpencodeBackend();
  } else if (parsed.backend === "claude-code") {
    const mod = await import("@pneuma-framework/backend-claude-code");
    mod.registerClaudeCodeBackend();
  } else if (parsed.backend === "codex") {
    const mod = await import("@pneuma-framework/backend-codex");
    mod.registerCodexBackend();
  }
  const factory = getAgentBackendFactory(parsed.backend);
  if (!factory) {
    console.error(`pneuma-framework: backend "${parsed.backend}" is not registered`);
    return 2;
  }
  backend = factory();
  try {
    const sess = await backend.launch({ cwd: workspace });
    fwRef = sess.sessionId; // defer annotation until fw is constructed
  } catch (err) {
    try { await backend.close(); } catch { /* best-effort */ }
    console.error(`pneuma-framework: backend "${parsed.backend}" failed to launch: ${(err as Error).message}`);
    return 1;
  }
}
```

And where `fw` is constructed, call `fw.annotateBackendSession(fwRef!)` if `fwRef` is set.

- [ ] **Step 3: Update `printUsage`** to list all three backends

```typescript
function printUsage(): void {
  console.error(`
Usage: pneuma-framework <verb> <templateDir> [--workspace <path>] [--port <n>] [--backend <name>]
Verbs: dev | build | deploy | stop
Backends: opencode | claude-code | codex
`);
}
```

- [ ] **Step 4: Run — smoke**

```bash
bun install
bun test
bun run typecheck
```
Expected: full suite still green (no new tests added here). Typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/package.json packages/cli/src/index.ts bun.lock
git commit -m "feat(cli): --backend claude-code / --backend codex auto-register adapters"
```

---

### Task G4: M3 closeout — tag + full typecheck + test

- [ ] **Step 1: Run the full suite + typecheck**

```bash
bun test
bun run typecheck
```
Expected: all tests pass. Typecheck clean. If anything fails, fix before tagging.

- [ ] **Step 2: Tag**

```bash
git tag m3-complete -m "M3: viewer wire protocol + React SDK + template-doc + claude-code/codex backends"
```

- [ ] **Step 3: Closeout commit (optional)**

If any M3 notes or TODO items surfaced during execution, commit them here. Otherwise skip.

---

## Self-review notes

Ran spec §6 + §12 M3 line + §10 backend abstraction + user's 5 pre-planning answers against the task list:

- **§6.1 wire protocol.** `WireEnvelope` covers the 6 canonical payload types (focus / action / permission-response on v2a; text / viewer-request / permission-prompt / state on a2v). The `state` kind is a pneuma-framework addition — pneuma-skills pushes file state via a separate channel; we unified it into the envelope for simplicity.
- **§6.2 built-in SDKs.** `viewer-react` covered in Phase C. `viewer-vanilla` is explicitly deferred (see Out of scope) — will land when a second template needs it. The extension protocol (§6.3) is unchanged — unknown envelope kinds are ignored by consumers, which `usePneumaState` already does by falling through the switch.
- **§12 M3 roadmap.** Spec names `template-gridboard` as M3's canonical template; we substituted `template-doc` at the user's explicit request ("至少得是 主库的 pneuma doc mode"). Task D1's manifest declares `backends.supported: [opencode, claude-code, codex]` so the template is interoperable once Phase G lands.
- **§10 AgentBackend.** M2's abstraction + registry pattern is reused without change. cc/codex adapters (Phase G) follow the same shape as `backend-opencode`, including the "caller owns launch/close" ownership — see Task G1 `.close()` teardown.
- **User answer 1 (React viewer).** Phase C + D use React 19 via `bun --hot` for zero-config dev. No Vite / webpack.
- **User answer 2 (minimum viable, single doc).** Task D's scope is strictly `workspace/doc.md`. Multi-file tabs and file tree are explicitly Out of scope.
- **User answer 3 (collapsible side chat).** Task D5's `ChatPanel` is fixed-right, 360px, toggled via an inline tab button. No floating bubble, no Discord-style chrome.
- **User answer 4 (manual URL copy).** Task E2 prints the URL to stdout; no auto-`open`. CI-friendly and matches what user asked for.
- **User answer 5 (auto-accept).** Task A4/A6 implement auto-accept in the bridge; Task E2 always enables it for the CLI's `dev` mode. A future prompt UI plugs into the same `permission-prompt` envelope (already defined in Task A1) when we need it.

**Placeholder scan.** Each code step ships full source. No "implement similar to ..." references. Canonical types reproduced once in the Canonical types section; later tasks reference them by name.

**Type consistency.** Key cross-task names checked: `WireEnvelope`, `Focus`, `Session`, `SessionRegistry`, `WireServer`, `WireServerOptions`, `BridgeOptions`, `attachBackendBridge`, `handleViewerEnvelope`, `startFileStatePush`, `seedInitialState`, `PneumaViewer`, `PneumaViewerProps`, `WireStatus`, `useFocus`, `useAction`, `usePneumaState`, `useWireConnection`, `PneumaFrameworkOptions` extension, `ClaudeCodeBackend`, `CodexBackend`. All match.

**Known fragilities.**

- Task D2's `bun --hot src/main.tsx --port $PORT` assumes Bun 1.3's HTML-entry dev server. If the local Bun is older, this fails — the fix is to `bun add -d bun@^1.3` at the workspace root, but the constraint is already implicit in `tsconfig.base.json`.
- Task G1's claude-code stream-json shape mirrors Anthropic's public `--output-format stream-json` docs as of 2025-Q4; the real shape may have drifted. If the adapter test's fake shape diverges from the real binary, patch `dispatchJsonLine` and re-run.
- Task G2's codex `proto` method names (`assistant_text`, `permission_request`) are best-guess based on pneuma-skills' codex adapter. Adjust on first real run against a live codex binary.
- File watcher on macOS: `fs.watch` `recursive: true` is supported on Darwin + Windows; on Linux ≤ 5.x it may need fallback polling. In v0 we rely on Bun ≥ 1.3 which ships a polyfill. Not blocking for local dev.
