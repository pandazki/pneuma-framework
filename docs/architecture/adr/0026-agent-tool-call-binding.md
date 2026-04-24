# ADR-0026: Agent Tool-Call Binding via MCP Bridge

**Status**: Accepted
**Date**: 2026-04-25
**Deciders**: Pandazki
**Tags**: `agent, mcp, operation, integration`

---

## Context

CLAUDE.md's first design principle states: *"Agent operates on framework state via semantic tools — never on scripts directly."* [ADR-0018](./0018-operations-as-primitive.md) formalised the companion principle: an Operation is *dual-bindable* — it is simultaneously the wire behind a UI action and an agent tool. The two invariants together demand that whatever the Builder can do in the viewer, the Build-phase Agent can also do through a tool call, and vice versa.

Pre-Day-3 reality broke this promise in a concrete way. The framework's `LifecycleOrchestrator` already exposed framework-level agent tools (`lifecycle.dev.start`, `workspace.tree`, `checkpoint.*`, etc.) that matched CLAUDE.md's semantic-tool mandate. But *template-level* Operations — `add_bookmark`, `search_bookmarks`, `delete_bookmark` — were invisible to the agent. The gap was structural, not incidental:

1. **Template isolation**: Templates run as independent `Bun.serve` subprocesses. The framework's orchestrator process cannot import a template's `config.ts` without violating template self-containment.
2. **Protocol mismatch**: Templates speak REST (`POST /api/operations/:id`). Our reference agent backend, opencode, speaks MCP (Model Context Protocol) for tool invocation. There was no translation layer.
3. **Dynamic catalog**: The set of Operations is not static — it is defined per template, per session. The framework cannot hold a centralised tool catalogue without becoming aware of each template's domain, which would break template sovereignty.

The result: you could run `pneuma dev ai-bookmarks-core-domain` and start a conversation, but the agent could discover nothing about `add_bookmark` and had no path to invoke it. Day 3 closed this gap. This ADR records the architectural choices made.

Cross-references:
- See [ADR-0018](./0018-operations-as-primitive.md) — Operation dual-binding principle; this ADR is the concrete wire.
- See [ADR-0004](./0004-adapter-protocol.md) — Adapter Protocol is distinct; Adapters connect external systems, the MCP Bridge connects agents.
- See [ADR-0012](./0012-agent-permissions.md) — Build-phase Agent is an owner; this ADR is the tool-call binding for that ownership.
- See [ADR-0025](./0025-agent-conversation-persistence.md) — complementary concern (session state / conversation resume); this ADR is about tool *invocation*, not session identity.
- See ADR-0027 (being written in parallel) — Live Event Stream; agents observing real-time Operation results complements the invocation path defined here.

---

## Options considered

### Option A — Template imports framework, statically registers tools at startup

Template code calls a framework-provided function (`framework.registerTools([add_bookmark, ...])`) during its boot sequence. The orchestrator's process-local `ToolRegistry` is populated before the agent launches.

- **Pro**: Simplest mental model — single process, no HTTP hop, tools known at startup before any agent message is sent.
- **Con**: Requires every template to take a compile-time dependency on `@pneuma-framework/core`, which directly violates CLAUDE.md Core Design Principle #1 ("Template self-containment — the template owns all tech stack decisions"). A Python template, a Go template, or a shell-script-only template becomes impossible. The framework API surface becomes a template ABI, creating breakage risk across every template on every framework upgrade.

### Option B — Framework parses template's config.ts directly in the orchestrator process

The `LifecycleOrchestrator` imports `templates/*/server/config.ts` at startup, reads `AppConfig.operations`, and registers tools without any template code change.

- **Pro**: No template code changes needed; operations are known at framework boot before any HTTP exchange occurs.
- **Con**: Hard-binds the framework to TypeScript/Bun as the universal template runtime. Any non-Bun template is excluded. Creates a two-source-of-truth problem: the template defines an Operation in its `config.ts`, and the framework has its own parsed copy — if the template hot-reloads or modifies Operations, the framework copy silently stales. Also bypasses the "template is the source of truth about its own domain" principle — the framework would be reading template internals rather than a contract surface.

### Option C — Template self-describes via HTTP; framework discovers at runtime (CHOSEN)

The template exposes a `GET /api/config` endpoint that returns a full description of its Operations including pre-derived JSON Schemas. After the `##pneuma:service-ready` lifecycle marker fires, the framework's orchestrator fetches `/api/config` once. Operations are then made available to the agent backend via an MCP bridge subprocess.

- **Pro**: Template self-containment is preserved — any language or runtime can serve `/api/config`. No framework imports in template code. The tool list is refreshed per dev-session start, so it naturally tracks template changes across restarts. JSON Schema derivation is done once at the HTTP boundary (runtime package) rather than duplicated across consumers. Forward-compatible: non-Bun templates need only implement two REST endpoints.
- **Con**: Tools are not available until the `service-ready` marker fires; there is a short window after agent launch where `op.*` tools are absent. Adds a subprocess cost (one MCP bridge process per active session with `appUrl` set). If the template adds Operations mid-session via hot-reload, the agent does not see them until the next `dev` restart.

### Option D — MCP server embedded in every template; framework just connects

Each template authors its own MCP server (stdio or HTTP-SSE transport). The agent backend's MCP config points at the template's server directly; the framework has no translation role.

- **Pro**: Zero framework-side translation code; templates could expose non-Operation MCP tools freely (arbitrary domain tools, external service wrappers, etc.).
- **Con**: Every template author must bundle and maintain the MCP SDK. Inconsistency is inevitable across templates. The framework loses observability into what tools the agent sees — the dual-binding invariant from ADR-0018 (agent tools ≡ UI operations) cannot be enforced. The framework's `OperationToolBridge` and any future framework-level tool introspection surface become impossible.

---

## Decision

Option C is adopted with the following specific shapes.

### 1. `/api/config` contract (runtime package boundary)

The `GET /api/config` endpoint in `packages/runtime/src/http.ts` returns:

```ts
// Response body shape (200 OK)
{
  app_id: string,
  operations: Array<{
    id: string,
    action: "read" | "write" | "delete",   // derived from affects.reads_only / destructive
    resource: { kind: "table"; table: string }
             | { kind: "multi"; tables: string[] }
             | { kind: "none" },
    input: InputSchema,           // raw core-domain VO shape (for typed consumers)
    input_schema: JsonSchema,     // JSON Schema (MCP-native; derived by runtime)
    output: OperationOutput,      // raw core-domain VO shape
    affects: AffectDeclaration,   // raw core-domain VO shape
    handler_kind: "code" | "query"
  }>
}
```

Both `input` and `input_schema` are returned. `input` preserves the core-domain Value Object shape for consumers that understand the domain type system. `input_schema` is a pre-derived JSON Schema for consumers — specifically the MCP bridge and any agent backend — that cannot import `@pneuma-framework/core-domain`. The runtime is the only place where the `InputSchema → JsonSchema` translation occurs (`packages/runtime/src/operation-to-jsonschema.ts`), ensuring a single source of truth for tool parameter shapes.

The `inputSchemaToJsonSchema` function handles `CellType` variants: `primitive` types map to standard JSON Schema scalar types; `vector` maps to a fixed-length number array; `ref-row` and `ref-row-list` map to string/string-array with a description; `derived` and unrecognised kinds fall through to `{}` (permissive empty schema). See Follow-ups for known incompleteness.

### 2. LifecycleOrchestrator hook (`packages/core/src/lifecycle.ts`)

On receiving the `##pneuma:service-ready <name> <url>` stdout marker from `dev.sh`, the orchestrator:

1. Stores the service status in `execution.services`.
2. Fires `_fetchOperations(execution, svc.url)` exactly once per dev cycle (guarded by `_operationsFetched` flag).
3. `_fetchOperations` calls `new URL(serviceUrl).origin + "/api/config"` — normalising away any path component the template might have emitted.
4. On success, stores the result in `execution.operations: readonly DiscoveredOperation[]` (a structural type in `packages/core/src/types.ts`; no core-domain import).
5. Calls `onOperationsLoaded(operations)` if the callback is set — the escape hatch used by `OperationToolBridge` to register tools without the orchestrator importing tool-layer code.
6. On any failure (non-2xx, network error, JSON parse error), records the error in `execution.operations_fetch_error` and continues — dev mode is non-fatally degraded. This ensures backwards compatibility with templates that predate `/api/config`.

### 3. Dual bridge strategy

Two complementary bridges are implemented. They serve different consumer paths:

**3a. In-process `OperationToolBridge`** (`packages/core/src/operation-tool-bridge.ts`)

Registers `op.<id>` entries in the framework's `ToolRegistry` for each discovered Operation. Each tool handler performs `POST ${appUrl}/api/operations/<id>` with `{ input: args }` as the body — an HTTP round-trip back to the template server. Registration is idempotent (replaces any previous `op.*` tools on restart) and reversible via `clear()`, which is called on dev stop/crash to remove stale tool definitions.

This bridge is a framework-internal investment: CLI harnesses, a future web dashboard, or test infrastructure can introspect available Operations via the `ToolRegistry` without needing MCP. Today it has no active consumers in production paths because opencode cannot see the orchestrator's in-process tool registry.

**3b. Standalone stdio MCP bridge** (`packages/core/bin/template-mcp-bridge.ts`)

A self-contained subprocess with no imports from any `@pneuma-framework/*` workspace package — its only dependency is `@modelcontextprotocol/sdk`. Spawned by opencode as a local MCP server. On startup it:

1. Reads `PNEUMA_APP_URL` from the environment.
2. Calls `GET ${origin}/api/config` itself; exits 1 with a diagnostic message on 404/500 or network failure.
3. Builds a tool list: each Operation becomes an MCP tool named `op.<id>` with description and `inputSchema` derived from `input_schema`.
4. Serves `tools/list` and `tools/call` over stdio MCP transport.
5. On `tools/call` for `op.<id>`: proxies to `POST ${appUrl}/api/operations/<id>` with `{ input: args }` body; returns the response body as MCP tool result text; throws `McpError(InternalError)` on non-2xx or network failure.

This is the path opencode uses to see Operations as tools today.

**Why both:** 3a is a framework-level introspection primitive that pays off when a second consumer appears (dashboard, test harness). 3b is what makes the demo work. The two must be kept consistent: `inputSchemaToJsonSchema` in `packages/runtime` is the single truth for tool parameter shapes; both bridges consume `input_schema` from `/api/config` rather than re-deriving it independently.

### 4. Agent wire-up: `AgentLaunchOptions.appUrl`

The field that connects the orchestrator to the agent backend:

```ts
// packages/core/src/agent-backend/types.ts
interface AgentLaunchOptions {
  cwd: string;
  model?: string;
  resumeSessionId?: string;       // see ADR-0025
  initialPrompt?: string;
  permissionMode?: "ask" | "accept" | "deny";
  appUrl?: string;                // HTTP URL of template's service root, e.g. "http://127.0.0.1:8765"
}
```

`appUrl` is set by the CLI or example harness after `##pneuma:service-ready` fires and `state.dev.services[0].url` is available. The value is the service *root* URL (origin only — no path), so both the orchestrator and the bridge can safely append `/api/config` and `/api/operations/:id`.

The opencode backend adapter (`packages/backend-opencode/src/adapter.ts`) reads `opts.appUrl` in `launch()`. When set, it injects an MCP server entry before calling `createOpencode`:

```ts
const mcpConfig = opts.appUrl ? {
  pneuma: {
    type: "local",
    command: ["bun", "run", resolveBridgePath()],
    environment: { PNEUMA_APP_URL: opts.appUrl },
    enabled: true,
  },
} : undefined;
await this.sdk.createOpencode(mcpConfig ? { config: { mcp: mcpConfig } } : undefined);
```

`resolveBridgePath()` resolves the bridge binary relative to the adapter's own file path, surviving both source (monorepo `src/`) and built (`dist/`) layouts.

Other agent backends (future claude-code adapter, codex adapter) plug in by implementing the same `appUrl` handling — opencode's approach is the reference pattern, not a lock-in.

### 5. Service-URL normalisation

A Day-3 bug: the original `##pneuma:service-ready` marker emitted `/api/health` as its URL. Both the orchestrator's `_fetchOperations` and the bridge's `fetchOperations` now call `new URL(appUrl).origin` before appending any path. Templates MUST emit the service root URL in their `service-ready` marker, and both consumers normalise defensively regardless.

### 6. End-to-end round-trip (Day 3 demo: `examples/opencode-tools-demo`)

The architecture produces a 5-boundary round-trip with zero hardcoded wiring:

```
Builder types "add this URL" in CLI
  → opencode session.prompt
    → MCP tool call op.add_bookmark (stdio bridge)
      → POST /api/operations/add_bookmark (HTTP)
        → Jina fetch + LLM tag + embedding + SQLite write (template handler)
          → HTTP 200 { output, impact, events }
        → MCP tool result (JSON text)
      → opencode assistant response
    → AgentEvent("text", delta) → CLI prints
```

---

## Consequences

### Positive

- **Template self-containment preserved.** No framework import is required in template code. Any language can serve `/api/config` + `/api/operations/:id`. The HTTP surface is the complete and only contract.
- **ADR-0018 parity invariant upheld.** Agent tools and UI Operations are the *same* set, accessed via the *same* HTTP handlers. It is structurally impossible to expose a tool the UI cannot access or vice versa — they share identical `POST /api/operations/:id` paths and permission checks.
- **Pluggable agent backends.** New backends add `appUrl` handling in their `launch()` implementation to gain `op.*` tool support. The MCP bridge subprocess is backend-agnostic; any MCP-capable agent backend can consume it.
- **Single schema derivation point.** `inputSchemaToJsonSchema` in `packages/runtime` translates `InputSchema → JsonSchema` exactly once. Both bridges consume `input_schema` from `/api/config`; neither re-derives it. Schema drift between agent-visible and UI-visible tool shapes is structurally prevented.
- **Non-Bun / non-TypeScript templates are first-class.** A Python FastAPI template, a Go template, or a shell-script template need only implement two REST endpoints to participate fully in the agent tool-binding system.
- **Non-fatal degradation.** If a template does not expose `/api/config` (pre-Day-3 templates, or templates without Operations), `_fetchOperations` silently records an error and dev mode continues. No breaking change for existing templates.

### Negative / Risks

- **Two bridges risk schema drift.** `OperationToolBridge` (3a) and the stdio bridge (3b) both build tool descriptors from `input_schema`. If either starts re-deriving schema independently instead of consuming the `/api/config` field, agents and framework-internal consumers would see different tool shapes. Mitigation: `inputSchemaToJsonSchema` must remain the single derivation point in `packages/runtime`; neither bridge may import or call it directly.
- **MCP subprocess cost.** Every `backend.launch()` call with `appUrl` set spawns a second Bun process for the stdio bridge. For a single interactive session the overhead is negligible. For a framework hosting multiple concurrent sessions (future multi-Builder or cloud mode), bridge process count scales linearly with session count. No mitigation today; accept for MVP.
- **Bridge failure is silent to the UI.** If the bridge cannot reach the template server (port mismatch, template crash after agent launch), the agent simply sees no `op.*` tools but the viewer shows no error. The only diagnostic surface is the bridge's stderr, which opencode may or may not surface to the user. Mitigation deferred: a future `agent.bridge.status` framework event should surface this (see Follow-ups).
- **Static snapshot at dev-start.** `/api/config` is fetched once when `service-ready` fires. If the template adds or modifies Operations mid-session (hot-reload), the agent's tool list is stale until the next `dev` restart. The `_operationsFetched` guard prevents redundant fetches but also prevents re-discovery.
- **`CellType → JsonSchema` translation is incomplete.** `derived` cells, `json` cells without an explicit schema, and any future `CellType` variants fall through to `{}` (permissive empty schema). Agents can invoke Operations with structurally invalid inputs; validation failure surfaces only at the template's handler level as a runtime error. Acceptable MVP; see Follow-ups.
- **`destructive: true` confirmation is not wired for agent callers.** Operation descriptions in both bridges mention destructiveness but do not trigger a confirmation flow. An agent can invoke a destructive Operation without Builder confirmation; the template's HTTP layer may emit `428 ConfirmationRequiredError` but the bridge will surface this as a tool error rather than a structured permission prompt. See Follow-ups.

### Follow-ups

- **ADR-TBD: Operation destructive-confirmation across agent wire.** Define a wire-protocol event for "agent proposes destructive op → Builder confirms in viewer → bridge retries with `confirmed: true`". Today the `428` response propagates as a tool error; the confirmation UX is undefined.
- **ADR-TBD: Template hot-reload re-discovery.** Template source watcher detects Operation changes → orchestrator re-fetches `/api/config` → bridge is signalled to reload its tool list. Requires clarifying MCP client reconnect behaviour: does opencode support dynamic tool-list updates without a full bridge restart?
- **ADR-TBD: `CellType → JsonSchema` completeness.** Handle `derived` (exclude from agent-visible input), validate `json.schema` fields, support deeply nested record types. Today's `{}` fallback is permissive but silent about expected input shape.
- **Amendment to ADR-0018**: add an `agent_hint` metadata field in Operation distinct from `ui_binding`. The two audiences want different affordances — agents benefit from example inputs and disambiguation hints that would be redundant in a UI button label.
- **Integration with ADR-0025 (conversation persistence)**: log which session invoked each Operation (session-scoped audit trail). Feeds into ADR-0014 audit event `actor_id` binding and ADR-0017 `app_history` attribution.
- **Integration with ADR-0027 (Live Event Stream)**: agent observing SSE events from the template post-invocation closes the perception loop — agent calls `op.add_bookmark`, template emits `resource.changed`, agent sees confirmation without needing to query. The invocation path (this ADR) and the observation path (ADR-0027) are complementary halves.
- **进 OPEN-QUESTIONS.md**: should `OperationToolBridge` (in-process, 3a) be merged with the stdio bridge (3b) once a second framework-internal consumer appears? Today 3a has effectively zero consumers in live sessions. The two could collapse into a single implementation if the framework gains an in-process MCP server capability.

---

## Amendments

### 2026-04-24 — `output_schema` symmetry with `input_schema`

**Triggered by:** P0 of the [Phase 3 priority plan](../../superpowers/plans/2026-04-24-phase-3-priority-plan.md). The original §Follow-ups item "CellType → JsonSchema completeness" called out incompleteness on the input side. P0 addresses the symmetric issue on the output side.

**Changes:**

1. `/api/config` per-operation entry now includes `output_schema: JsonSchema` alongside the existing `input_schema`.
2. `packages/runtime/src/output-schema-to-jsonschema.ts` is the single derivation point, mirroring `operation-to-jsonschema.ts`.
3. Both bridges consume `output_schema` from `/api/config` rather than re-deriving it:
   - `template-mcp-bridge.ts` attaches `outputSchema` to MCP tool descriptors (forward-compatible; older MCP clients ignore unknown fields).
   - `OperationToolBridge` adds the output kind to the tool description string.
4. `DiscoveredOperation` in `packages/core/src/types.ts` and `DiscoveredOperationLike` in `operation-tool-bridge.ts` both gain optional `output` and `output_schema` fields (optional for pre-P0 template compatibility).

**Updated Follow-ups:**

- The original "CellType → JsonSchema completeness" follow-up narrows to `derived` cells and deeply-nested record-of-record types. The new output kinds (`derived-list`, `graph`, `object`) have their schemas supplied by the template, so framework-side incompleteness no longer silently blocks them.
- Template hot-reload re-discovery and destructive-confirmation-across-agent-wire remain open. P1 and P3b of the Phase 3 plan will address those.
