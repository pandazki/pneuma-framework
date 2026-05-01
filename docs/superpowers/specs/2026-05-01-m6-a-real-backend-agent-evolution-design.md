# M6-A Design Input: Real Backend-Agent App Evolution

> 中文版穿插在每节后面。M6-A 的目标是把 M5 的 deterministic Agent proposal 换成真实 backend-agent session，同时保持同一套 framework semantic tool contract。

## Thesis

M5 proved the governed Builder evolution loop with a deterministic proposal:

```text
Builder request
  -> scripted Agent proposal
  -> definition.apply
  -> approval
  -> restart rediscovery
  -> Priority Queue appears
```

M6-A should prove the next, sharper claim:

> A real Build-phase Agent backend can receive a Builder request, inspect the running app, choose the same semantic app-definition changes, call framework tools, survive approval/restart boundaries, and report the result back in a way the Builder can understand.

中文：

> M6-A 要证明的不是“LLM 会不会聪明地想出 priority queue”，而是：真实 backend agent 能不能被接入 framework loop，使用 semantic tools 演进 app，并让 Builder 看懂它做了什么、为什么能做、哪里被治理拦住。

## Why M6-A Before Semantic Index

Derived semantic index is important, but it pressures storage extensibility. M6-A pressures the core vision directly:

```text
the app is shaped by conversation
```

If we cannot make the Builder/Agent loop real, semantic search risks becoming a normal app feature rather than proof of an AI-native creation framework.

中文：

Semantic index 可以后放，因为它更多验证 substrate 的扩展性；M6-A 验证的是 Pneuma 最核心的产品叙事：Builder 通过对话塑造 app。

## Current Gap

The existing opencode bridge can expose app Operations as `op.*` tools by reading template `/api/config`.

That is not enough for M6-A.

M6-A needs the Build-phase Agent to also see framework semantic tools:

- `definition.apply`
- lifecycle observation / restart state where needed
- permission prompt and result events
- app config / definition inspection context

Without that, a real backend agent can call `op.capture_item`, but cannot create the Priority Queue capability that M5 proved through direct `fw.toolRegistry.call("definition.apply", ...)`.

中文：

当前 MCP bridge 暴露的是 template Operation，不是 framework tool API。所以 M6-A 的第一性问题不是 prompt，而是 tool surface：真实 agent 必须通过 semantic framework tools 改 definition，而不是改代码或直接碰脚本。

## First Backend Choice

Use opencode as the first real backend path because:

- `packages/backend-opencode` already exists;
- it can spawn MCP config from launch options;
- `examples/opencode-tools-demo` already proves app `op.*` calls;
- it matches the existing dogfood path without adding a second backend integration.

Keep CI deterministic by separating:

- **contract tests** with fake backend / mocked SDK;
- **manual or smoke-gated live opencode demo** for real model execution.

中文：

CI 不应该押注模型稳定性。自动化测试证明协议和工具路径；真实 opencode demo 证明端到端体验。

## Target Proof

```text
Builder says: "Add priority review to this inbox."
  -> backend agent session starts with app context and framework tools
  -> agent inspects current app definition / config
  -> agent calls definition.apply for column / Operation / View / PolicyRule
  -> framework asks Builder for approval
  -> approved mutation executes as framework_system
  -> dev service restarts and rediscover definition rows
  -> agent receives or observes completion state
  -> Builder sees a concise result and the app shows Priority Queue
```

## Non-Goals

M6-A does not claim:

- production-grade LLM planning reliability;
- semantic/vector index;
- hot reload;
- Builder-authored code handlers;
- arbitrary schema design;
- production IAM/admin workflow;
- release-mode Runtime Agent.

## Acceptance Gate

M6-A closes only when:

- framework MCP exposure includes the semantic tools required for app evolution;
- backend launch can attach both app operation tools and framework tools, or one combined tool server with both surfaces;
- tests prove the agent-facing tool list contains `definition.apply` but does not expose raw framework-internal operations as unsafe `op.*`;
- a deterministic backend-agent harness performs the M5 priority evolution through the same public backend path used by opencode;
- a live opencode run is documented as optional/manual, including required credentials and expected transcript shape;
- the M6-A demo clearly distinguishes agent proposal, framework approval, tool execution, restart rediscovery, and final app state;
- full focused tests, typecheck, review, and browser e2e pass before any M6-A snapshot.

