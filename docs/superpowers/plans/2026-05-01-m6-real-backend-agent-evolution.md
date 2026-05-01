# M6 Real Backend-Agent Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the M5 deterministic Agent proposal with a real Build-phase Agent backend path that can evolve Knowledge Inbox through governed framework semantic tools.

**Architecture:** Keep M5's Priority Queue capability as the target product slice, but move the initiating path from direct `fw.toolRegistry.call("definition.apply", ...)` into the `AgentBackend` launch/message/event loop. M6 should expose framework semantic tools to the backend agent alongside app `op.*` tools, while preserving M2 governance boundaries: `build_agent` proposes, `framework_system` executes only after approval.

**Tech Stack:** Bun, TypeScript, `@modelcontextprotocol/sdk`, existing `AgentBackend` abstraction, `packages/backend-opencode`, Knowledge Inbox template, SQLite-backed M3/M4 substrate.

---

## Delivery Boundary / 交付边界

M6 closes when a Builder request can reach a backend-agent session, the agent can see and invoke `definition.apply`, the framework approval/ledger/restart path executes, and the resulting Knowledge Inbox app shows the M5 Priority Queue capability.

M6 deliberately defers:

- semantic index / Qdrant;
- hot reload;
- production model reliability claims;
- arbitrary code-handler authoring;
- release-mode Runtime Agent.

## File Map / 文件边界

- Create `docs/superpowers/specs/2026-05-01-m6-real-backend-agent-evolution-design.md`
  - Records the M6 design pressure and the decision to defer semantic index.
- Modify `packages/core/src/mcp-server.ts`
  - Ensure framework `ToolRegistry` tools can be described and invoked through MCP with stable schemas and error envelopes.
- Modify or add `packages/core/bin/framework-mcp-bridge.ts`
  - Standalone stdio bridge for framework semantic tools, if opencode cannot receive the in-process MCP server directly.
- Modify `packages/backend-opencode/src/adapter.ts`
  - Launch opencode with both template app tools and framework semantic tools.
- Add tests under `packages/backend-opencode/test/` and `packages/core/test/`
  - Prove dual MCP wiring, tool list shape, and permission-safe exposure.
- Create `examples/m6-real-agent-evolution/`
  - Real backend-agent evolution runner, deterministic test harness, live runbook.
- Modify `templates/knowledge-inbox-core-domain/viewer/index.html`
  - Add M6 scenario mode only if M5 viewer surface cannot already explain the backend-agent transcript.
- Update `docs/architecture/README.md`, `docs/architecture/roadmap.md`, `AGENTS.md`, `CLAUDE.md`, and `examples/README.md`
  - Mark M6 active; mark the semantic index track deferred.

## Task 0: Status Switch / 文档状态切换

- [ ] **Step 1: Confirm M5 closure tag exists**

Run:

```bash
git tag --list "pneuma-m5-builder-evolution"
```

Expected output:

```text
pneuma-m5-builder-evolution
```

- [ ] **Step 2: Update status docs**

Modify:

- `AGENTS.md`
- `CLAUDE.md`
- `docs/architecture/README.md`
- `docs/architecture/roadmap.md`
- `examples/README.md`

Expected status language:

```text
M6 active - real backend-agent app evolution.
The semantic index track is deferred.
```

- [ ] **Step 3: Verify no stale next-gate text**

Run:

```bash
rg -n "M6-(A|B)|m6-?a|m6-?b|choose M6|M6 next-gate choice" AGENTS.md CLAUDE.md docs/architecture examples
```

Expected: no stale text that presents M6 as a lettered sub-milestone or still undecided.

- [ ] **Step 4: Commit**

Run:

```bash
git add AGENTS.md CLAUDE.md docs/architecture/README.md docs/architecture/roadmap.md examples/README.md docs/superpowers/specs/2026-05-01-m6-real-backend-agent-evolution-design.md docs/superpowers/plans/2026-05-01-m6-real-backend-agent-evolution.md
git commit -m "docs: open M6 real backend-agent evolution"
```

## Task 1: RED - Framework Semantic Tool MCP Contract

- [ ] **Step 1: Write failing MCP contract tests**

Add tests in `packages/core/test/mcp-server.test.ts` or a focused new file `packages/core/test/framework-mcp-server.test.ts`.

Test cases:

```ts
test("framework MCP lists definition.apply as a semantic tool", async () => {
  // Create a ToolRegistry with a registered definition.apply-like tool.
  // Connect createMcpServer(registry) to an in-memory test transport.
  // Send tools/list.
  // Assert one listed tool has name "definition.apply" and an object inputSchema.
});

test("framework MCP returns tool execution results as JSON text", async () => {
  // Register a tool that returns { ok: true, state: { applied: true } }.
  // Send tools/call for that tool.
  // Assert content[0].text parses to the same JSON.
});
```

Expected RED: current tests may need reusable MCP test transport helpers before they can express this cleanly.

- [ ] **Step 2: Implement minimal test helper or reuse existing MCP tests**

Use existing patterns from:

```text
packages/core/test/mcp-server.test.ts
packages/core/test/template-mcp-bridge.test.ts
```

Expected GREEN:

```bash
bun test packages/core/test/mcp-server.test.ts packages/core/test/template-mcp-bridge.test.ts
```

## Task 2: RED/GREEN - Backend Launch Exposes Framework Tools

- [ ] **Step 1: Add opencode adapter test for dual MCP config**

Modify `packages/backend-opencode/test/adapter.test.ts`.

Expected assertion shape:

```ts
test("launch wires both app operation tools and framework semantic tools when both URLs are provided", async () => {
  // Launch OpencodeBackend with appUrl and frameworkToolUrl or framework bridge config.
  // Assert sdk.createOpencode receives mcp config entries for app operations and framework tools.
  // Assert app bridge still receives PNEUMA_APP_URL.
  // Assert framework bridge receives the framework endpoint or bridge command env it needs.
});
```

Expected RED: `AgentLaunchOptions` currently only has `appUrl`, so there is no framework-tool surface to pass into the adapter.

- [ ] **Step 2: Add a narrow launch option**

Modify `packages/core/src/agent-backend/types.ts`:

```ts
export interface AgentLaunchOptions {
  cwd: string;
  model?: string;
  resumeSessionId?: string;
  initialPrompt?: string;
  permissionMode?: "ask" | "accept" | "deny";
  toolRegistry?: unknown;
  appUrl?: string;
  frameworkToolUrl?: string;
}
```

If a URL is not enough after implementation review, use a small structured object instead:

```ts
frameworkTools?: {
  command: string[];
  environment: Record<string, string>;
};
```

Choose one representation before writing adapter code; do not support both.

- [ ] **Step 3: Implement dual MCP config**

Modify `packages/backend-opencode/src/adapter.ts` so opencode receives two tool servers:

```ts
const mcpConfig = {
  ...(opts.appUrl ? { pneuma_app: { /* existing template bridge */ } } : {}),
  ...(opts.frameworkToolUrl ? { pneuma_framework: { /* framework bridge */ } } : {}),
};
```

Expected GREEN:

```bash
bun test packages/backend-opencode/test/adapter.test.ts
```

## Task 3: RED/GREEN - M6 Deterministic Backend-Agent Harness

- [ ] **Step 1: Create failing example test**

Create `examples/m6-real-agent-evolution/evolve-through-backend.test.ts`.

The test should:

- start Knowledge Inbox with `createPneumaFramework`;
- launch an `AgentBackend` through the same interface opencode uses;
- send the Builder prompt:

```text
Add priority review to this inbox. Use framework definition tools rather than editing files.
```

- simulate or capture agent tool calls that invoke `definition.apply`;
- assert the final `/api/config` has `priority`, `list_priority_queue`, and `priority_queue`.

Expected RED: no M6 harness exists.

- [ ] **Step 2: Implement a deterministic backend harness**

Create `examples/m6-real-agent-evolution/backend-harness.ts`.

The harness should use `FakeAgentBackend` or a thin test backend to emit the same event sequence a real backend will produce:

```text
session-ready
text: inspecting app definition
tool-call: definition.apply(add_table_column)
tool-call: definition.apply(add_operation)
tool-call: definition.apply(add_view)
tool-call: definition.apply(add_policy_rule)
text: Priority Queue is ready
```

Important: the harness must enter through `AgentBackend.launch()` and `sendUserMessage()`, not through direct example code that calls `fw.toolRegistry.call()` first.

- [ ] **Step 3: Wire tool execution through framework registry**

Add a small M6 coordinator in the example:

```text
backend tool-call event
  -> framework ToolRegistry call
  -> permission prompt auto-allow in test
  -> result returned to backend transcript
```

Expected GREEN:

```bash
bun test examples/m6-real-agent-evolution/evolve-through-backend.test.ts
```

## Task 4: RED/GREEN - Live Runner and Manual Opencode Path

- [ ] **Step 1: Add live runner test**

Create `examples/m6-real-agent-evolution/run.test.ts`.

Expected smoke behavior:

```text
bun run examples/m6-real-agent-evolution/run.ts --smoke-exit
```

Assertions:

- runner starts Knowledge Inbox;
- backend-agent harness applies the Priority Queue capability;
- public GET `/api/operations/list_priority_queue` returns rows;
- process exits cleanly.

- [ ] **Step 2: Implement `run.ts`**

Create `examples/m6-real-agent-evolution/run.ts` with two modes:

```text
--backend fake      deterministic CI path
--backend opencode  manual real-backend path
```

The default should be `fake` unless the required opencode credentials are present.

- [ ] **Step 3: Add README runbook**

Create `examples/m6-real-agent-evolution/README.md`.

Include:

```bash
bun test examples/m6-real-agent-evolution/evolve-through-backend.test.ts examples/m6-real-agent-evolution/run.test.ts
bun run examples/m6-real-agent-evolution/run.ts --backend fake
bun run examples/m6-real-agent-evolution/run.ts --backend opencode
```

Document that opencode is manual/smoke-gated because model output is not deterministic.

## Task 5: Viewer Narrative Hardening

- [ ] **Step 1: Decide whether M5 viewer can carry M6**

If M5's `?scenario=builder-evolution` can show a backend-agent transcript without clutter, reuse it.

If not, add:

```text
?scenario=real-agent-evolution
```

to `templates/knowledge-inbox-core-domain/viewer/index.html`.

- [ ] **Step 2: Add viewer contract test**

Modify `templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts`.

Expected test intent:

```ts
test("includes the M6 real backend-agent evolution surface", () => {
  // Assert viewer contains scenario copy for backend-agent session,
  // framework semantic tools, approval, restart rediscovery, and final app state.
});
```

- [ ] **Step 3: Browser e2e**

Run the M6 runner, open the printed URL, and verify:

- default Knowledge Inbox remains clean;
- M6 scenario shows backend-agent transcript;
- Data view still shows priority rows;
- console warning/error count is zero.

## Task 6: Full Gate Before M6 Snapshot

- [ ] **Step 1: Focused tests**

Run:

```bash
bun test packages/core/test/mcp-server.test.ts packages/core/test/template-mcp-bridge.test.ts packages/backend-opencode/test/adapter.test.ts examples/m6-real-agent-evolution/evolve-through-backend.test.ts examples/m6-real-agent-evolution/run.test.ts
```

- [ ] **Step 2: Regression tests**

Run:

```bash
bun test examples/m5-knowledge-inbox-builder-evolution/evolve.test.ts examples/m5-knowledge-inbox-builder-evolution/run.test.ts templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts packages/core/test/tools/definition-apply.test.ts
```

- [ ] **Step 3: Typecheck and diff hygiene**

Run:

```bash
bun run typecheck
git diff --check
```

- [ ] **Step 4: Review**

Review for these risks:

- agent cannot see `definition.apply`;
- raw framework operations leak as unsafe `op.*`;
- approval token is bypassed;
- restart breaks backend-agent continuity;
- fake harness proves a different path than opencode uses;
- viewer overclaims real LLM reliability.

## Task 7: Snapshot Paperwork

Only after Task 6 passes:

- create `docs/architecture/milestone-6-snapshot.md`;
- create `docs/architecture/milestone-6-snapshot.zh-CN.md`;
- add diagrams for backend-agent tool surfaces and approval/restart continuity;
- update architecture README and roadmap;
- tag the closure commit as `pneuma-m6-real-backend-agent-evolution`.
