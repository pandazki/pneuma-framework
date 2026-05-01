# M6 Real Backend-Agent Evolution

M6 turns the M5 Priority Queue capability into a backend-agent flow. The deterministic path still uses a scripted backend for CI, but it enters through `AgentBackend.launch()` and `sendUserMessage()`, discovers framework semantic tools over HTTP, and calls `definition.apply` through the same tool proxy used by the opencode bridge.

中文：M6 验证的不是模型规划能力，而是真实 backend-agent 接入点是否成立：Builder 发起需求，agent 看到 framework semantic tools，通过 `definition.apply` 触发审批、执行、重启、重新发现，最后 Knowledge Inbox 出现 Priority Queue。

## Test

```bash
bun test examples/m6-real-agent-evolution/evolve-through-backend.test.ts examples/m6-real-agent-evolution/run.test.ts
```

## Deterministic Demo

```bash
bun run examples/m6-real-agent-evolution/run.ts --backend fake
```

Useful smoke mode:

```bash
bun run examples/m6-real-agent-evolution/run.ts --backend fake --smoke-exit --port 0
```

Expected proof points:

- backend session is launched through `AgentBackend`;
- framework tool URL exposes `definition.apply`;
- agent emits four `definition.apply` tool calls;
- approval is still required and auto-allowed only by the harness;
- `GET /api/operations/list_priority_queue` returns three demo rows.

## Live Opencode Path

```bash
bun run examples/m6-real-agent-evolution/run.ts --backend opencode
```

Completion-gated smoke mode:

```bash
M6_COMPLETION_TIMEOUT_MS=300000 \
bun run examples/m6-real-agent-evolution/run.ts --backend opencode --port 8877 --smoke-exit
```

Set `OPENCODE_MODEL` to override the default model. This path is model-dependent and not part of CI, but it is now a live acceptance gate: the runner sends an execution-scoped prompt, waits until `GET /api/operations/list_priority_queue` becomes available, seeds three demo rows, and exits only after the Priority Queue API returns those rows. The runner attaches two MCP tool servers to opencode:

- `pneuma_app` for template `op.*` Operations;
- `pneuma_framework` for framework semantic tools such as `definition.apply`.

中文：`opencode` 路径不是 CI 测试，但现在是 live acceptance gate。它要求真实 code agent 连续调用 `definition.apply`，runner 等到 live app 的 Priority Queue API 真的出现，并验证三条 demo rows 后才通过。

## Evolution Trace

The runner writes an inspectable trace to:

```text
<workspace>/data/m6-evolution-trace.json
```

The Knowledge Inbox dev server exposes the same trace at:

```text
GET /api/evolution-trace
```

The viewer uses that endpoint for the M6 trace tabs and the Agent Execution Trace drawer. The trace is intentionally split into:

- `session`: backend, model, app URL, framework tool URL, workspace, and Builder request;
- `before` / `after`: summarized app-definition snapshots;
- `workLog`: framework activity such as `tool_call`, `approval`, `tool_result`, and completion;
- `agentConversation`: merged assistant text, with streaming deltas collapsed into readable messages;
- `diff`: the visible app-definition changes.

Approval note: the live opencode demo auto-approves permission prompts in the runner so the acceptance run can complete unattended. That still exercises the framework approval gate; it does not yet provide a human-clickable approval card in the chat UI.

中文：trace 用来让团队同时看到 agent 开始前的 app definition、agent 的 framework 活动、opencode 对话文本，以及结束后的 app definition。这里的 approval 是 runner 自动批准，用于演示和验收链路；未来产品形态应当把 permission prompt 作为对话里的 approval card 交给 Builder 点击。
