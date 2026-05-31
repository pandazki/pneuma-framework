# Milestone 29 Snapshot 中文版 — AgentBackend runTurn Contract

**日期：** 2026-05-08  
**状态：** 作为 post-RC stabilization milestone 关闭。它不是 `pneuma-rc-0.1.4` release tag。  
**输入：** DevBoard Studio 下游压力：BuildThread 已经被接受为 semantic transcript，但每个 Host 仍然需要自己把 turns 翻译成 backend prompt、管理 thread/session 复用，并手写 decision/receipt turns。

## M29 证明了什么

M29 把一个 Builder follow-up turn 变成 framework-level backend operation：

```text
Builder message
  -> AgentBackend.runTurn
  -> append BuildThread user turn
  -> pack semantic transcript
  -> launch or reuse backend-native session by thread_id
  -> send backend prompt
```

核心规则延续 ADR-0032：

```text
BuildThread 是 source of truth。
backend-native sessions 是 cache / optimization。
```

## 关闭的反馈

| 反馈 | M29 结果 |
|---|---|
| Host 需要自己 replay BuildThread 并构造 backend prompt | 新增 `AgentBackend.runTurn` 和 `runAgentTurnThroughLaunchSend`。 |
| backend-native session 复用是 Host-specific | fake 和 opencode backend 现在按 BuildThread `thread_id` 缓存一个 backend session。 |
| proposal / decision / receipt context 可能在不同 Host 中编码不一致 | `runTurn` 使用 `packBuildTurnsForRoleContent`，保留 canonical `pneuma:` tags。 |
| decision + execution receipt append 容易被手写得不一致 | 新增 `recordBuildThreadExecutionOutcome`。 |

## 边界决定

M29 不把 opencode、Anthropic 或任何 provider 变成 core semantic dependency。core 仍然导出 backend-neutral role/content packing。provider-native message optimization 属于 backend adapter。

M29 也不解决 read-only iterative tool-result replay 或 provider-native event normalization。这些仍然是独立 pressure lanes。

## Developer-facing 变化

更新的 guide：

- [BuildThread Guide](../developer/build-thread.md) / [中文版](../developer/build-thread.zh-CN.md)

新的 ADR：

- [ADR-0036: AgentBackend runTurn Contract](../architecture/adr/0036-agent-backend-run-turn.md)

新的或变化的 core exports：

- `AgentBackend.runTurn`
- `AgentRunTurnOptions`
- `AgentRunTurnResult`
- `AgentRunTurnSessionCache`
- `AgentRunTurnTransport`
- `runAgentTurnThroughLaunchSend`
- `formatAgentRunTurnPrompt`
- `recordBuildThreadExecutionOutcome`

## 验证

在 M29 worktree 中运行：

```bash
bun test packages/core/test/agent-backend/run-turn.test.ts
bun test packages/core/test/agent-backend/types.test.ts packages/core/test/agent-backend/fake.test.ts packages/backend-opencode/test/adapter.test.ts
bun test packages/core/test/build-thread.test.ts
bun test packages/core/test/agent-backend/run-turn.test.ts packages/core/test/agent-backend/types.test.ts packages/core/test/agent-backend/fake.test.ts packages/core/test/build-thread.test.ts packages/backend-opencode/test/adapter.test.ts
bun run typecheck
tmp_config=$(mktemp -d) && printf '{"auths":{}}\n' > "$tmp_config/config.json" && DOCKER_CONFIG="$tmp_config" bun test
```

最终结果：

- `runAgentTurnThroughLaunchSend` targeted test：`1 pass`，`0 fail`，`16 expect() calls`。
- Backend implementation targeted tests：`14 pass`，`0 fail`，`46 expect() calls`。
- BuildThread targeted tests：`10 pass`，`0 fail`，`33 expect() calls`。
- M29 combined targeted suite：`25 pass`，`0 fail`，`95 expect() calls`。
- Typecheck：通过。
- 使用临时 Docker config 的 full suite：`1242 pass`，`0 fail`，`4637 expect() calls`，覆盖 `187 files`。
- Touched docs 的 markdown relative-link check：通过。
- `git diff --check`：通过。

## 下一步

建议的下一个 milestone：

1. M30 — 根据下游 integration friction，决定优先 pressure provider-native event normalization、read-only tool-result replay，或 Host chat-client helper。

M29 刻意保持 backend loop 很窄。它让一个 Builder turn 可移植；它不把 framework 变成完整 chat UI SDK。
