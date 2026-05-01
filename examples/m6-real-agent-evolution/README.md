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

## Manual Opencode Path

```bash
bun run examples/m6-real-agent-evolution/run.ts --backend opencode
```

Set `OPENCODE_MODEL` to override the default model. This path is manual because model output is not deterministic enough for CI. The runner attaches two MCP tool servers to opencode:

- `pneuma_app` for template `op.*` Operations;
- `pneuma_framework` for framework semantic tools such as `definition.apply`.

中文：`opencode` 路径只作为手动 smoke。它证明真实 backend 可以看到 app tools + framework tools；M6 的自动化正确性仍由 fake backend runner 保证。
