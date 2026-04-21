# pneuma-framework v0 — Design Spec

- **Date:** 2026-04-21
- **Status:** DRAFT — pending Builder (user) review
- **Origin:** Brainstormed from `pneuma-skills` (Pneuma 2.x) — see `../../../CLAUDE.md` for conceptual foundation and `../../../CLAUDE.local.md` for reference-project pointers.

---

## 1. Goals and non-goals

### 1.1 Goals

- **Ship a library/runtime** that lets a Developer build a **pneuma-app** — an application whose content is co-created in-session by a Builder via dialogue with a Build-phase Agent.
- **Support two reference shapes** without special-casing: a *constrained* construction experience (à la `gridboard`) and an *open-ended* one (à la `webcraft`).
- **First-class backend + persistence support** for pneuma-apps. Today's `pneuma-skills` punts this to the agent; the framework must treat server-side code and data migration as part of the construction lifecycle.
- **Cross-stack template authoring.** A template author should be free to pick any front-end stack, any back-end stack (or none), any persistence (or none), any deployment target (desktop, container, edge, CLI).
- **Dogfoodable.** Pneuma 3.0 (a rebuilt `pneuma-skills`) must be expressible as a set of templates + a meta-app on top of the framework. That rebuilding is the primary design-validation test.

### 1.2 Non-goals for v0

- A launcher / session registry / mode marketplace — those are **meta-app** concerns, not framework.
- User preference systems that span pneuma-apps.
- Windows support (`.sh` only; WSL acceptable).
- Specific deploy providers (Vercel / CF Pages / etc.) — those are plugins a meta-app or template can add.
- Specific persistence drivers.
- A built-in authentication system for pneuma-apps (template's choice).
- Mobile runtime.

### 1.3 Success criteria

1. A Developer can scaffold a new template with a handful of shell scripts, a manifest file, and a viewer component — and get a working Dev-mode pneuma-app where a Builder can drive construction by chatting.
2. `pneuma-skills`' `gridboard` mode and `webcraft` mode can each be re-expressed as a template running on the framework with no framework-level special-casing.
3. The framework's code size is **dramatically smaller** than `pneuma-skills`' `server/index.ts` + `bin/pneuma.ts` (target: <25% of the equivalent surface area), because scope is narrower.

---

## 2. Conceptual model (short)

For the canonical terminology see `../../../CLAUDE.md`. Abbreviated here:

- **Developer** → integrates `pneuma-framework` once to produce a **pneuma-app-template**.
- **Builder** → uses a pneuma-app in Dev mode, dialogues with the **Build-phase Agent** to shape it.
- **End User** → consumes the released pneuma-app (which may or may not embed a **Runtime Agent**).
- **pneuma-app** → a full deployable unit (front-end + optional back-end + optional persistence); has **Dev mode** and **Release mode**.
- **Lifecycle verbs** → `setup.sh` / `dev.sh` / `stop.sh` / `build.sh` / `deploy.sh` / `migrate.sh` / `fork.sh`.
- **Two-axis Agent interop** → Viewer (focus + action wire protocol) and Framework (semantic tool API).

---

## 3. Architecture — three candidates

All three candidates share the same conceptual model and lifecycle contract. They differ in **how the framework is packaged and how the Build-phase Agent reaches its tools.**

### 3.A Thin core + MCP-first

A small daemon. Lifecycle orchestration + process management + wire-protocol relay + shadow-git. The Build-phase Agent reaches the framework via an **MCP server** the daemon exposes. Viewer SDKs are thin wrappers over a WebSocket endpoint the daemon runs. No library facade — integrators interact via the CLI or the MCP endpoint.

- **Pros:** Unix-minimal. Forces a clean protocol boundary. Agent-agnostic (any MCP-capable agent works).
- **Cons:** A host who wants in-process integration (an Electron main, a Node service) must still talk over MCP + WebSocket. Heavier integration ceremony.

### 3.B Runtime library facade + CLI wrapper

Framework shipped as a Node/Bun library exposing `createPneumaFramework({...})`. Integrators instantiate it in-process and get back programmatic handles to lifecycle, tool bus, viewer bridge. A bundled CLI wraps the library for standalone use. Build-phase Agent reaches tools either via MCP (bridged by the library) or via a direct in-process tool registry.

- **Pros:** Best DX for programmatic hosts (Electron main, Node services). Easy to test — tools are just functions.
- **Cons:** Locks the **integration** language to Node/Bun. Templates' scripts stay shell, but the host code is not free.

### 3.C Hybrid: core library + CLI + SDK packages *(recommended)*

A deliberate two-layer split:

- **Core** (`@pneuma-framework/core`) — Node/Bun library exposing `createPneumaFramework(...)` for in-process use. Also ships a CLI (`pneuma-framework dev / build / deploy ...`) that is simply a thin wrapper over the library — no hidden behavior.
- **Agent bridge** — the core exposes its semantic tool API over **both** in-process (for programmatic hosts) **and** an MCP server (for out-of-process agents). The MCP endpoint is always available when the core is running; in-process callers can skip the MCP hop.
- **Viewer SDKs** — separate packages: `@pneuma-framework/viewer-react`, `@pneuma-framework/viewer-vanilla`. Both talk the same wire protocol to the core. Third parties can add more (`@pneuma-framework/viewer-vue`, etc.) without changes to the core.

**Recommended.** Rationale:

1. Solves both the "I want to embed this" host use-case (pomodoro Electron widget) and the "I want to plug into an agent I already have" use-case (a CI bot that uses the MCP endpoint).
2. Keeps the protocol honest — the MCP endpoint exists even when the host is in-process, which prevents the library facade from growing private backchannels.
3. Cleanly matches the way `pneuma-skills` already partitions concerns internally, so extraction is mechanical rather than design-new.

The rest of this spec assumes candidate **3.C**.

---

## 4. Lifecycle script spec

### 4.1 Verb set

| Verb | Required? | Purpose |
|---|---|---|
| `setup.sh` | Optional | One-time preparation. Install deps, seed DB, generate default config. Runs on first instantiation, after `fork.sh`, or when the user explicitly asks. |
| `dev.sh` | **Required** | Start the Dev-mode process group: frontend dev server, backend dev server, any workers. Expected to be long-running / blocking. |
| `stop.sh` | Optional | Clean shutdown hook. Framework will call it before SIGTERM'ing any surviving processes. If absent, framework process-group kills. |
| `build.sh` | Optional | Produce a Release-mode artifact. Writes everything under `$PNEUMA_BUILD_DIR` (set by the framework; by default `$PNEUMA_WORKSPACE/.pneuma-build/<timestamp>/`) with a `build.manifest.json` inside. |
| `deploy.sh` | Optional | Consume a built artifact and send it somewhere. Internals free: push container, Vercel deploy, scp, rsync, zip upload, blue-green flip. |
| `migrate.sh` | Optional | Data migration. Typically called from inside `deploy.sh` but may also be run alone. |
| `fork.sh` | Optional | Produce a new Dev workspace cloned from an existing (deployed or otherwise) pneuma-app's state. Used for "modify in prod-basis" flow. |

Every script lives at the template root and is the template's sovereign code. Framework never inspects internals; only runs them.

### 4.2 Environment variables (framework → script)

| Variable | Set for | Meaning |
|---|---|---|
| `PNEUMA_WORKSPACE` | All | Absolute path to the pneuma-app's working directory. Scripts must cwd-relative or use this. |
| `PNEUMA_VERB` | All | One of `setup` / `dev` / `stop` / `build` / `deploy` / `migrate` / `fork`. |
| `PNEUMA_MODE` | All | `dev` or `release`. Some scripts (e.g. `build.sh`) may be called in either mode. |
| `PNEUMA_ENV_FILE` | All | Absolute path to a `.env` the framework has prepared with secrets/config (may be empty). |
| `PNEUMA_BUILD_DIR` | `build`, `deploy` | Absolute path to a dedicated output directory. Scripts must not write outside it. |
| `PNEUMA_ARTIFACT_MANIFEST` | `deploy` | Absolute path to the `build.manifest.json` produced by a prior `build.sh`. |
| `PNEUMA_PORT_HINT` | `dev` | A suggested free port. Script is free to ignore and report its actual port via marker. |
| `PNEUMA_FORK_SOURCE` | `fork` | Path or URI of the source state being forked from. |
| `PNEUMA_LOG_DIR` | `dev` | Where framework would like auxiliary logs. Scripts are not required to write here — the framework captures stdout/stderr regardless. |

### 4.3 Standard stdout markers (script → framework)

Ordinary stdout/stderr is streamed to the UI and to the Build-phase Agent as log. Lines that begin with `##pneuma:` are parsed by the framework as machine messages. Unknown markers must be logged and ignored (forward-compatible).

| Marker | Emitted by | Meaning |
|---|---|---|
| `##pneuma:service-ready <name> <url>` | `dev.sh` | A service is ready to receive requests. Multiple allowed. |
| `##pneuma:ready` | `dev.sh` | All services the script manages are up. Framework can now attach the Build-phase Agent. |
| `##pneuma:stopping` | `dev.sh` | Script has received a stop signal and is winding down. |
| `##pneuma:needs-confirm <label>` | Any | Pause execution and ask for a human confirmation with the given label. Execution resumes when the framework sends the confirmation (via stdin line `##pneuma:confirm <label> <yes\|no>`). |
| `##pneuma:progress <pct> <label>` | Long-running scripts | UI-only progress hint. |
| `##pneuma:artifact <path>` | `build.sh` | Report an artifact. Can be emitted multiple times for multi-artifact builds. |

### 4.4 Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Generic failure (log to user, Build-phase Agent can inspect) |
| 2 | Configuration error (framework should surface prominently — something about env vars or template config is wrong) |
| 42 | Reserved: "needs out-of-band attention" — framework treats same as 1 but tags specially |
| other | Treated as generic failure |

### 4.5 Artifact handoff: `build.manifest.json`

`build.sh` writes — at the path `$PNEUMA_BUILD_DIR/build.manifest.json` — a JSON file matching this schema (example values shown):

```json
{
  "schemaVersion": 1,
  "kind": "docker-image",
  "entrypoint": "./image.tar",
  "produced": ["image.tar", "sbom.json"],
  "env": { "SUGGESTED_RUNTIME_VAR": "value" },
  "notes": "free-form template-defined metadata",
  "deployHints": {
    "requiresMigration": true,
    "runtimeAgent": "embedded"
  }
}
```

Field descriptions:

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | integer | Currently `1`. Framework rejects unknown versions. |
| `kind` | string | Template-defined label (e.g. `docker-image`, `static-site`, `electron-bundle`, `binary`, `tarball`, or any `custom:<label>`). Framework does not interpret it — `deploy.sh` does. |
| `entrypoint` | string | Path relative to `$PNEUMA_BUILD_DIR` pointing at the primary artifact. |
| `produced` | string[] | All files/dirs the build produced, relative to `$PNEUMA_BUILD_DIR`. |
| `env` | object | Suggested runtime env hints — `deploy.sh`'s choice whether to honor. |
| `notes` | string | Free-form template metadata. |
| `deployHints.requiresMigration` | boolean | If true, UI and Build-phase Agent surface a "migration step" before deploy is confirmed. |
| `deployHints.runtimeAgent` | `"embedded" \| "none"` | Whether the Release artifact embeds a Runtime Agent (affects UI / permission prompts on deploy). |

### 4.6 Process management

The framework runs each script inside its own **process group** (`setsid` / `posix_spawn` with new session). On teardown:

1. Invoke `stop.sh` if it exists; wait up to a configurable timeout (default 10s).
2. SIGTERM the process group.
3. After another timeout (default 5s), SIGKILL.

Build-phase Agent **cannot** kill processes directly. It can request a stop via the semantic tool API (see §5).

---

## 5. Semantic tool API for the Build-phase Agent

The framework exposes tools to the Build-phase Agent. This is the *only* way the agent affects or observes lifecycle — the agent does not see scripts as first-class objects.

Tools are published over both:

- **In-process** (the core's host can register them into whatever tool-call dispatcher the host is using — e.g. Claude Code's `AgentProtocolAdapter`).
- **MCP** server the core runs, addressable by any MCP-capable agent.

The same semantic surface, two transports.

### 5.1 Observation tools

| Tool | Returns |
|---|---|
| `lifecycle.state` | `{ dev: { running, services: [{name, url, health, pid?}], startedAt, lastError? }, lastBuild: { success, manifestPath, duration, at }?, lastDeploy: { success, durationSec, at, notes }?, workspace: { root, recentTurns: [...] } }` |
| `lifecycle.logs` | `{ lines: [{ ts, stream: "stdout"\|"stderr", line }] }` — takes `{ verb, since?, limit? }` |
| `workspace.tree` | Shallow directory tree snapshot, bounded depth. For heavy reads, agent uses its native filesystem tools. |

### 5.2 Action tools

| Tool | Effect |
|---|---|
| `lifecycle.dev.start` | Runs `dev.sh`. No-op (returns current state) if already running. |
| `lifecycle.dev.stop` | Stops Dev-mode group (uses `stop.sh` path described in §4.6). |
| `lifecycle.dev.restart` | Convenience: stop then start. |
| `lifecycle.build.run` | Runs `build.sh`. Returns manifest path. |
| `lifecycle.deploy.run` | Runs `deploy.sh`. Takes optional `{ manifestPath }`; defaults to the most recent build. |
| `lifecycle.migrate.run` | Runs `migrate.sh` with optional `{ direction, target }`. |
| `lifecycle.fork.run` | Runs `fork.sh` with `{ source }`. |
| `lifecycle.confirm` | Responds to a pending `##pneuma:needs-confirm` prompt with yes/no. |
| `checkpoint.rewind` | Rewind the shadow-git workspace to a previous turn. |
| `checkpoint.list` | Enumerate recent checkpoints. |

All action tools return a compact result (`{ ok: bool, state?, error? }`); full detail is obtained via `lifecycle.state` or `lifecycle.logs`.

### 5.3 Crash handling

If `dev.sh` exits non-zero while "running", framework marks it `crashed` in `lifecycle.state`, stops streaming, and does **not** auto-restart. Re-launch is the Build-phase Agent's decision (typically after suggesting or applying a fix). This is deliberate — repeated auto-restart during mid-edit causes crash-loops that hurt more than they help.

### 5.4 Rate limits / safety

- `lifecycle.deploy.run` triggers a framework-issued Builder confirmation (rendered in the viewer) *before* `deploy.sh` is invoked, unless the template has declared `unattendedDeploy: true` in its manifest. This is framework-level gating, distinct from the in-script `##pneuma:needs-confirm` marker (§4.3) which a running script can use to pause mid-execution.
- `lifecycle.migrate.run` is gated identically to `deploy.run` (migrations are destructive by default).
- `lifecycle.fork.run` refuses with an error if the target would overwrite an active Dev workspace.

---

## 6. Build-phase Agent ↔ Viewer: wire protocol and SDKs

The minimal payload is summarized as "give the Builder's *focus* and *action* to the Agent, and let the Agent send text + viewer requests back."

### 6.1 Wire protocol (JSON-over-WebSocket)

Two endpoints served by the core:

- `GET /ws/viewer/:sessionId` — for the viewer's use (both for SDK and custom implementations).
- `GET /ws/agent/:sessionId` — for the agent backend (internal).

Messages on the viewer channel, both directions, share a small envelope:

```ts
type WireEnvelope =
  | { dir: "v2a"; kind: "focus"; focus: Focus }              // viewer → agent: builder's current selection / viewport / file
  | { dir: "v2a"; kind: "action"; action: Action }            // viewer → agent: command click, text message, triggered event
  | { dir: "a2v"; kind: "text"; turnId: string; delta: string }  // agent → viewer: stream text chunk
  | { dir: "a2v"; kind: "viewer-request"; req: ViewerRequest }   // agent → viewer: navigate / highlight / execute action
  | { dir: "a2v"; kind: "permission-prompt"; prompt: PermissionPrompt }
  | { dir: "v2a"; kind: "permission-response"; response: PermissionResponse };
```

Exact field shapes for `Focus`, `Action`, `ViewerRequest`, `PermissionPrompt` are defined by adapting the existing shapes in `pneuma-skills`' `core/types/viewer-contract.ts` (`ViewerSelectionContext`, `ViewerActionDescriptor`, `ViewerActionRequest`, etc.). The v0 spec inherits these with minimal renames; refinements happen in the implementation plan.

### 6.2 Built-in SDKs

- **`@pneuma-framework/viewer-react`** — a React package exposing `<PneumaViewer>`, `useFocus()`, `useAction()`, `usePneumaState()`. Handles WebSocket lifecycle, reconnect, envelope encoding.
- **`@pneuma-framework/viewer-vanilla`** — a dependency-free module exposing `createPneumaViewer(element, opts)` with DOM-level event binding helpers. Targets plain HTML / non-React stacks.

Both SDKs are thin over the wire protocol. Template authors whose stack is neither can skip the SDK and talk the wire protocol directly.

### 6.3 Extension protocol

Custom SDKs / adapters register themselves to the core via standard WebSocket upgrade — no central registration. Forward-compatible: unknown envelope kinds must be ignored.

---

## 7. Template contract

### 7.1 Required layout

```
<template root>/
  manifest.json           # metadata, declared scripts, viewer config, backend config
  scripts/                # lifecycle scripts (.sh)
    dev.sh
    build.sh               # optional
    ...
  skill/                  # agent-facing knowledge (markdown, matching today's pneuma-skill format)
  viewer/                 # source code for the Builder-facing UI, whatever stack
  assets/                 # static assets (optional)
```

Only `manifest.json`, `scripts/dev.sh`, and `skill/` are required.

### 7.2 Manifest schema (sketch)

```json
{
  "schemaVersion": 1,
  "name": "gridboard",
  "version": "0.1.0",
  "displayName": "Grid Board",
  "description": "...",
  "backends": {
    "supported": ["claude-code", "codex"],
    "defaultConfig": { "permissionMode": "bypassPermissions" }
  },
  "runtimeAgent": "none" | "embedded" | "optional",
  "scripts": {
    "dev": "scripts/dev.sh",
    "build": "scripts/build.sh",
    "deploy": "scripts/deploy.sh",
    "stop": "scripts/stop.sh",
    "setup": "scripts/setup.sh",
    "fork": "scripts/fork.sh",
    "migrate": "scripts/migrate.sh"
  },
  "skill": {
    "sourceDir": "skill",
    "installName": "pneuma-gridboard",
    "envMapping": { "OPENAI_API_KEY": "openaiKey" }
  },
  "viewer": {
    "entry": "viewer/index.tsx",
    "sdk": "react" | "vanilla" | "custom",
    "actions": [ { "id": "...", "label": "...", "params": { ... } } ],
    "commands": [ { "id": "...", "label": "..." } ]
  },
  "initParams": [
    { "name": "gridColumns", "type": "number", "defaultValue": 12, "label": "Grid columns" }
  ],
  "unattendedDeploy": false
}
```

This is a **v0 sketch**; many fields are inherited straight from `pneuma-skills`' `ModeManifest` and will be refined in the implementation plan.

### 7.3 Template authoring DX

Three canonical starter templates ship alongside v0 for showcase and validation:

1. **`template-minimal`** — a "hello-world" template: static HTML viewer, `dev.sh` runs `python -m http.server`, no backend, no persistence. Demonstrates the lifecycle protocol with zero tech-stack commitment.
2. **`template-procfile-fullstack`** — a React + Node + SQLite example showing Procfile-style multi-service dev and a SQLite `migrate.sh`. Demonstrates real back-end support.
3. **`template-gridboard`** — a rebuild of `pneuma-skills`' `gridboard` mode on the framework. Demonstrates dogfooding and constrained construction.

The `webcraft`-equivalent template is left as a follow-up; it's broader in scope but uses no additional framework capability beyond what the three above exercise.

---

## 8. Dev mode and Release mode

### 8.1 Dev mode lifecycle

1. Core spawns the host process (if standalone) or runs in-process (if embedded).
2. Core verifies template manifest + `dev.sh` presence.
3. Core prepares `.pneuma/` state directory: session id, shadow-git init, env file materialized from init params.
4. Core invokes `setup.sh` if it exists and state indicates first-run / post-fork.
5. Core invokes `dev.sh`, streams stdout/stderr.
6. On `##pneuma:ready`, core launches Build-phase Agent via `AgentBackend.launch(...)`.
7. Core opens Viewer WebSocket endpoint. Viewer (in-app or in a host iframe) connects.
8. Co-creation loop runs until Builder exits.
9. On exit, core invokes `stop.sh`, then tears down process group and agent backend.

### 8.2 Release mode lifecycle

1. Core invokes `build.sh` with `$PNEUMA_BUILD_DIR` pointing to a fresh directory.
2. On success, core reads `build.manifest.json` and records `lastBuild` in framework state.
3. Core invokes `deploy.sh` with `$PNEUMA_ARTIFACT_MANIFEST`, if and when the Builder (or the agent via `lifecycle.deploy.run`) asks.
4. Deployment result is surfaced via `lifecycle.state`; deploy logs are streamed.

### 8.3 Fork-modify-redeploy flow

1. Builder (or agent) calls `lifecycle.fork.run({ source })`.
2. Core resolves `source` (local path or URI — template's `fork.sh` interprets) and invokes `fork.sh` with `$PNEUMA_FORK_SOURCE` set.
3. On success, new Dev workspace exists locally; core pivots its session to it.
4. Normal Dev mode resumes.
5. Eventual redeploy uses the same build/deploy path. `deploy.sh` is responsible for blue-green / migration / traffic switch.

---

## 9. Construction hygiene — shadow-git and checkpoints

Lifted with minimal change from `pneuma-skills`' `server/shadow-git.ts`:

- Every agent turn is committed to a shadow bare git repo at `$PNEUMA_WORKSPACE/.pneuma/shadow.git`.
- A `checkpoints.jsonl` indexes turn → hash.
- `checkpoint.list` and `checkpoint.rewind` are exposed as semantic tools (§5).
- Shadow-git is intentionally separate from any template-level VCS so templates can use git themselves without collision.

---

## 10. Agent backend abstraction

Reuse `pneuma-skills`' `core/types/agent-backend.ts` with renames:

- `AgentBackend` → same.
- `AgentBackendType` → opens to `"claude-code" | "codex" | string` (string allowed for third-party backends).
- `AgentProtocolAdapter` → same.
- Core exposes a backend registry: `registerAgentBackend(descriptor, factory)`.

Templates declare supported backends; framework picks one at session start, with the integrating host free to override via init options.

---

## 11. Repo structure (initial)

```
pneuma-framework/
  CLAUDE.md                        # canonical concepts
  CLAUDE.local.md                  # local-only pointer (gitignored)
  README.md                        # user-facing overview (later)
  package.json                     # workspaces root
  packages/
    core/                          # @pneuma-framework/core — lifecycle, process mgr, MCP server, tool bus, shadow-git
    viewer-react/                  # @pneuma-framework/viewer-react
    viewer-vanilla/                # @pneuma-framework/viewer-vanilla
    cli/                           # @pneuma-framework/cli — thin wrapper over core
    backend-claude-code/           # adapter
    backend-codex/                 # adapter
  templates/
    minimal/
    procfile-fullstack/
    gridboard/
  docs/
    superpowers/specs/             # design specs
    reference/                     # protocol reference
  examples/                        # end-to-end examples of apps built with templates (not templates themselves)
```

Package manager: **Bun workspaces** (matches `pneuma-skills`' toolchain; revisit in implementation plan if another host-language is warranted).

---

## 12. Implementation roadmap (high level)

Full plan belongs in `writing-plans`. High-level milestones:

1. **Milestone 0 — Skeleton.** Monorepo scaffolding, package stubs, CI, shared TypeScript config. No functionality.
2. **Milestone 1 — Lifecycle core.** `@pneuma-framework/core` implements process manager, env var contract, marker parser, artifact manifest handoff, shadow-git. CLI can run `dev`/`build`/`deploy` against `template-minimal`. No agent yet.
3. **Milestone 2 — Agent + tools.** Plug in `backend-claude-code`. Core exposes the semantic tool API over in-process + MCP. Build-phase Agent can observe state and trigger lifecycle tools.
4. **Milestone 3 — Viewer wire protocol + React SDK.** `viewer-react` + the agent ↔ viewer WS endpoint; `template-gridboard` works end-to-end.
5. **Milestone 4 — `template-procfile-fullstack`.** Exercise real back-end + SQLite + `migrate.sh` + fork flow.
6. **Milestone 5 — Vanilla SDK + Codex backend.** Breadth.
7. **Milestone 6 — Pneuma 3.0 dogfood.** Begin migrating `pneuma-skills` modes onto the framework, validate completeness.

---

## 13. Open questions

1. **Package manager for the framework itself.** Bun (follow `pneuma-skills`) vs Node (broader ecosystem). Scripts run via plain `sh` either way, so this only affects who can `import` the core library in-process. Leaning Bun for v0; revisit for v1.
2. **Permission model granularity.** §5.4 gates `deploy` and `migrate` behind framework-level Builder confirmation, gated by a single `unattendedDeploy` flag in the manifest. Do we need per-verb flags (e.g. `unattendedMigrate: false` while `unattendedDeploy: true`)? Likely yes, but deferring until a concrete template needs the split.
3. **Viewer-SDK cross-origin.** When a host embeds the viewer via iframe on a different origin, the WebSocket endpoint needs an explicit origin allowlist configurable via manifest or host options. Tracking; not design-blocking.
4. **Should `build.manifest.json` be chain-able?** A `deploy.sh` sometimes wants to consume *multiple* prior build outputs (e.g. frontend + backend built separately). v0: one manifest per build. v1 may introduce manifest references.
5. **Log storage and retention.** Today spec says stdout/stderr streamed. For `lifecycle.logs` agent tool to work well, we need some amount of buffering. Default: ring buffer of N MB per verb-run, plus on-disk archive under `$PNEUMA_LOG_DIR`. Size: TBD during implementation.
6. **Runtime Agent config when `runtimeAgent: "embedded"`.** If a pneuma-app embeds an agent for End Users, how are its credentials & skill installed into the Release artifact? Likely delegated to `build.sh` (template's choice), but the framework may want to standardize an inner-manifest. Defer to v1 unless one of the v0 templates needs it.

---

## 14. Appendix — glossary

| Term | Meaning |
|---|---|
| **pneuma-framework** | This repo. The library/runtime. |
| **pneuma-app** | An instance of a template, deployable as a full app. |
| **pneuma-app-template** | A Developer-authored starting point: scripts + skill + viewer + manifest. |
| **Developer** | Author of a template. |
| **Builder** | End-user who constructs a pneuma-app instance by talking to the Build-phase Agent. |
| **End User** | Consumer of the finished pneuma-app. |
| **Build-phase Agent** | Agent present during Dev mode; framework always provides. |
| **Runtime Agent** | Optional agent embedded in the released app. |
| **Dev mode / Release mode** | Lifecycle phases. |
| **Lifecycle verb** | `setup` / `dev` / `stop` / `build` / `deploy` / `migrate` / `fork`. |
| **Semantic tool API** | The agent-facing API the core exposes (§5). |
| **Wire protocol** | The JSON-over-WebSocket protocol connecting viewer and agent (§6). |
| **`##pneuma:` marker** | Out-of-band machine message on a script's stdout. |
| **`build.manifest.json`** | Per-build artifact descriptor handed from `build.sh` to `deploy.sh`. |
