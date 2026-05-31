# Milestone 6 Snapshot: Real Backend-Agent Evolution

**Date:** 2026-05-02
**Status:** Re-closed snapshot after the live opencode completion gate and execution trace drawer
**Audience:** teammates with zero Pneuma context
**Scope:** what M6 proves, what it deliberately does not prove, and what the next milestone should pressure.
**中文版:** [Milestone 6 快照](./milestone-6-snapshot.zh-CN.md)

中文摘要：

> M5 证明 Builder 的需求可以通过 governed `definition.apply` 演进 Knowledge Inbox，但 Agent proposal 仍是 deterministic script。M6 把这条路接到真正的 backend-agent 接入面：agent 通过 `AgentBackend.launch()` / `sendUserMessage()` 进入 session，看到 app `op.*` tools 和 framework semantic tools，并通过 `definition.apply` 完成同一个 Priority Queue evolution。M6 重新收口后，live opencode path 不再只是 wiring smoke：runner 会等待 Priority Queue API 真的出现，写入 execution trace，并让 viewer 展示 before / work / after / diff。

## Executive Summary

M6 closes the gap between a scripted Builder evolution and a backend-agent evolution path.

The important claim is not "a model can reliably invent a priority queue." The important claim is:

> A Build-phase Agent backend can be launched against a running pneuma-app, discover framework semantic tools, call `definition.apply`, pass through approval and restart rediscovery, and leave the app with a new governed capability.

After the first M6 snapshot, we tightened the live path. The manual opencode runner is now a completion-gated acceptance run: it sends an execution-scoped Builder request, waits until the live `list_priority_queue` API exists, seeds three priority rows, verifies the API output, writes a durable execution trace, and exposes that trace in the viewer.

M6 keeps the product slice from M5 but changes the initiating path:

```text
Builder asks for priority review
  -> AgentBackend session starts
  -> backend sees appUrl + frameworkToolUrl
  -> pneuma_app exposes template op.* tools
  -> pneuma_framework exposes framework semantic tools
  -> agent calls definition.apply
  -> Builder approval gates execution
  -> framework_system applies definition rows
  -> dev service restarts and rediscover /api/config
  -> Knowledge Inbox shows Priority Queue
  -> execution trace preserves before / work / after / diff
```

## System At A Glance

```mermaid
flowchart LR
  Builder["Builder request"] --> Backend["AgentBackend session"]
  Backend --> AppTools["pneuma_app MCP\nop.* Operations"]
  Backend --> FrameworkTools["pneuma_framework MCP\nframework semantic tools"]
  FrameworkTools --> Apply["definition.apply"]
  Apply --> Approval["Builder approval\nscoped token"]
  Approval --> System["framework_system execution"]
  System --> DefinitionRows["system-owned definition rows\ncolumn / Operation / View / PolicyRule"]
  DefinitionRows --> Restart["dev restart + rediscovery"]
  Restart --> App["Knowledge Inbox\nPriority Queue"]
  App --> Trace["M6 execution trace\nbefore / work / after / diff"]
```

M6 adds a new example:

```text
examples/m6-real-agent-evolution/
  backend-harness.ts
  evolve-through-backend.test.ts
  run.ts
  run.test.ts
  trace.ts
  trace.test.ts
  README.md
```

The CI path uses a deterministic backend agent. That is intentional. It proves the backend-agent surface and governance path without making CI depend on model planning.

## What Changed

| Area | Result |
|---|---|
| Framework MCP contract | `definition.apply` is explicitly described as a framework semantic tool for app-definition mutation. |
| Framework tool bridge | `packages/core/bin/framework-mcp-bridge.ts` exposes framework tools to out-of-process backends through stdio MCP. |
| HTTP tool proxy | `startFrameworkToolHttpProxy()` exposes `GET /api/framework/tools` and `POST /api/framework/tools/:name` around the in-process `ToolRegistry`. |
| opencode adapter | Launch options now support `frameworkToolUrl`; opencode gets `pneuma_app` and `pneuma_framework` MCP servers when both app and framework URLs are present. |
| M6 harness | `ScriptedPriorityReviewAgentBackend` enters through `AgentBackend.launch()` and `sendUserMessage()`, discovers `definition.apply`, then calls it through the framework tool proxy. |
| M6 runner | `run.ts --backend fake` is deterministic and CI-safe; `run.ts --backend opencode` is now completion-gated: it waits for the live Priority Queue API and verifies three rows. |
| Evolution trace | The runner writes `data/m6-evolution-trace.json` with before snapshot, work log, assistant text, approval events, tool results, after snapshot, and diff. |
| Viewer | `?scenario=real-agent-evolution` adds a Backend Agent Session panel, App/Data views, trace tabs, and an Agent Execution Trace drawer. |

## Tool Surface

```mermaid
flowchart TB
  subgraph "opencode / backend agent"
    Agent["Build-phase Agent"]
  end

  subgraph "template app surface"
    AppMcp["pneuma_app MCP"]
    AppOps["op.capture_item\nop.list_inbox_items\nop.update_item_status\nop.list_priority_queue"]
  end

  subgraph "framework surface"
    FrameworkMcp["pneuma_framework MCP"]
    SemanticTools["definition.apply\nlifecycle.*\nworkspace.*"]
    Governance["Authorization Kernel\nApproval Token\nPermission Ledger"]
  end

  Agent --> AppMcp --> AppOps
  Agent --> FrameworkMcp --> SemanticTools
  SemanticTools --> Governance
```

The boundary matters: app Operations stay app-facing; framework mutation stays semantic and governed. Raw framework-internal runtime Operations still do not become public `op.*` tools.

## Demo Surface

Canonical deterministic demo:

```bash
bun run examples/m6-real-agent-evolution/run.ts --backend fake --port 0
```

Open the printed scenario URL:

```text
http://127.0.0.1:<port>/?scenario=real-agent-evolution
```

Manual opencode path:

```bash
OPENCODE_MODEL=openrouter/anthropic/claude-opus-4.7 \
bun run examples/m6-real-agent-evolution/run.ts --backend opencode --port 8877
```

Completion-gated live smoke:

```bash
M6_COMPLETION_TIMEOUT_MS=300000 \
bun run examples/m6-real-agent-evolution/run.ts --backend opencode --port 8877 --smoke-exit
```

The M6 surface is split deliberately:

- **Left side:** end-user Knowledge Inbox, with App/Data tabs and Priority Queue rows.
- **Right side:** Builder request, Backend Agent Session, Agent proposal, Governance timeline, Substrate delta, and M6 Evolution Trace.
- **Trace drawer:** Builder request, framework activity (`tool_call` / `approval` / `tool_result`), and merged opencode assistant messages.

This lets zero-context teammates see why M6 matters: the app changed, and the initiating actor is now a backend-agent session using framework semantic tools.

## Approval Semantics

M6's live opencode demo uses **auto-approval by the runner**. That is a deliberate demo harness choice, not the final product interaction.

The real governance chain is still exercised:

```text
agent calls definition.apply
  -> framework raises a permission prompt
  -> demo runner records tool_call + approval
  -> demo runner responds allow
  -> framework_system executes with scoped authority
```

What this proves: the agent cannot silently mutate app definition through the framework surface. The framework still owns the approval gate and execution authority.

What this does not yet prove: a human-visible chat approval card. The intended product shape is:

```text
Agent requests definition.apply
  -> conversation shows impact disclosure
  -> Builder clicks Approve or Deny
  -> framework records the response and proceeds or blocks
```

## What Is Proven

| Capability | Current proof |
|---|---|
| Framework semantic tool exposure | MCP tests prove `definition.apply` is agent-facing with stable object input schema. |
| Out-of-process bridge | `framework-mcp-bridge.test.ts` proves list/call proxy behavior and failure semantics. |
| HTTP tool proxy | `framework-tool-http.test.ts` proves `/api/framework/tools` list/call contract. |
| opencode dual tool wiring | `backend-opencode/test/adapter.test.ts` proves `pneuma_app` + `pneuma_framework` MCP config. |
| Backend-agent entry path | `evolve-through-backend.test.ts` launches an `AgentBackend`, sends a Builder prompt, captures four `definition.apply` tool calls. |
| Governance preserved | Each apply result still proves Builder approval, `build_agent` requester, and `framework_system` execution. |
| Restart rediscovery | The same Priority Queue definition rows are rediscovered through `/api/config`. |
| Live opencode completion gate | `run.ts --backend opencode --smoke-exit` waits until the live Priority Queue API exists and returns three rows. |
| Evolution trace | `trace.test.ts` proves before/after snapshots, streaming text merge, tool call, approval, tool result, and completion records. |
| Public API | `run.test.ts` verifies `GET /api/operations/list_priority_queue -> 3 rows`. |
| Viewer narrative | `viewer-contract.test.ts` covers the M6 backend-agent scenario surface and execution trace drawer. |
| Browser e2e | Live browser check verified M6 scenario, Data view, P1/P2/P3 rows, and 0 console errors. |

## Evidence Matrix

```mermaid
flowchart LR
  Contract["Tool contracts\nMCP + HTTP proxy"] --> Harness["Backend-agent harness\nAgentBackend launch/message"]
  Harness --> Governance["Approval + framework_system\nexecution evidence"]
  Governance --> Runtime["Restart rediscovery\n/api/config"]
  Runtime --> Demo["Runner + viewer\nPriority Queue rows"]
  Demo --> Snapshot["Team snapshot\nknown boundaries"]
```

Latest verification before snapshot:

```text
M6 focused suite: 55 pass, 0 fail
M5 + definition.apply regression: 61 pass, 0 fail
Operation bridge / agent backend contract subset: 18 pass, 0 fail
Typecheck: pass
Diff check: pass
Live opencode completion gate:
  backend: opencode
  model: openrouter/anthropic/claude-opus-4.7
  completion: PASS
  trace summary: 5 assistant messages, 4 tool calls, 4 approvals, 4 tool results, 3 priority rows
Browser e2e:
  /?scenario=real-agent-evolution App view: Backend Agent Session visible, definition.apply proxy narrative visible
  /?scenario=real-agent-evolution Data view: P1/P2/P3 rows visible, definition evidence visible
  Agent Execution Trace drawer: Builder request, tool_call, approval, tool_result, assistant messages
```

Copy-paste verification set:

```bash
bun test packages/core/test/mcp-server.test.ts packages/core/test/template-mcp-bridge.test.ts packages/core/test/framework-mcp-bridge.test.ts packages/core/test/framework-tool-http.test.ts packages/backend-opencode/test/adapter.test.ts examples/m6-real-agent-evolution/evolve-through-backend.test.ts examples/m6-real-agent-evolution/run.test.ts examples/m6-real-agent-evolution/trace.test.ts templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts

bun test examples/m5-knowledge-inbox-builder-evolution/evolve.test.ts examples/m5-knowledge-inbox-builder-evolution/run.test.ts templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts packages/core/test/tools/definition-apply.test.ts

bun test packages/core/test/operation-tool-bridge.test.ts packages/core/test/agent-backend/types.test.ts

bun run typecheck

git diff --check
```

## What This Does Not Prove Yet

| Not proven | Why it matters |
|---|---|
| Production LLM planning reliability | CI uses a deterministic backend agent; opencode is manual because model output is not deterministic. |
| Human-visible approval UX | M6 auto-approves permission prompts in the runner. The future product should surface the permission card in the Builder conversation. |
| Raw opencode MCP transcript persistence | M6 captures assistant text, framework approval prompts, and completion-gate tool results. It does not yet persist the backend's raw MCP tool-event stream end to end. |
| Dynamic app MCP refresh after random-port restart | `pneuma_app` is configured at launch time. Use a fixed port for manual live demos; future protocol work should refresh app service URLs after restart. |
| Hot reload | Definition changes still depend on restart rediscovery. |
| Builder-authored code handlers | The Priority Queue still uses safe query-backed Operations. |
| Production enterprise security | M2 governance is exercised, but production IAM/admin workflow remains future work. |
| Semantic/vector index | Still deferred. Relational rows remain source of truth; vector search should be a derived index later. |
| Release-mode Runtime Agent | M6 is Build-phase Agent only. |

## Strategic Read

M6 closes the most important caveat in M5 and then tightens it once more:

```text
M5: A deterministic Agent proposal can evolve a real app.
M6 first cut: A backend-agent session can reach the same governed evolution path.
M6 re-closure: A real opencode run can complete that path and leave inspectable evidence.
```

This is the first milestone where the project can honestly say the app-evolution loop is no longer just a script around framework primitives. The framework now has an agent-facing semantic tool surface that a real backend can attach to, and a trace surface that lets teammates inspect what happened before, during, and after the agent run.

## Next Gate

M6 suggests a narrower next decision than "more enterprise security" or "semantic index immediately."

| Direction | Why |
|---|---|
| **Protocol / live-agent hardening** | Recommended next pressure if the team wants the opencode path to become product-grade: human approval cards, raw tool transcript replay, completion events, restart URL refresh, permission prompt continuity. |
| **Semantic index track** | Still important, but should remain derived infrastructure over the now-real app substrate. |
| **Hot reload / custom code handlers** | Powerful, but higher blast radius. Better after live-agent continuity is less brittle. |

## Evidence

M6 implementation commits before this snapshot:

```text
f2d75f4 test: expose definition apply as framework MCP tool
5c15a75 feat: wire framework tools into opencode MCP
5eba725 test: evolve knowledge inbox through backend agent
f8a3d7a feat: add M6 backend agent runner
aae5cd3 feat: add M6 backend agent viewer narrative
1177b37 fix: make framework bridge helper fail without exiting
4bb3079 feat: gate M6 opencode completion
```

Reading path for zero-context teammates:

1. [Architecture README](../architecture/README.md) for the current map.
2. [Milestone 5 Snapshot](./milestone-5-snapshot.md) for Builder-evolved app capability.
3. This M6 snapshot for backend-agent evolution.
4. [M6 Real Backend-Agent Evolution README](../../examples/m6-real-agent-evolution/README.md) for the runnable demo.
