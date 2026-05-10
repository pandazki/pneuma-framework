# BuildThread 指南

**读者：** 正在构建 chat-driven Creation Host 的 Developer
**English version:** [build-thread.md](./build-thread.md)

`BuildThread` 是 framework 拥有的 Build-phase conversation 语义 transcript。它记录 Builder 提了什么需求、Agent 提了什么 proposal、Builder 批准或拒绝了什么，以及执行后返回了什么 evidence。

这不同于 backend-native chat history。opencode、Anthropic、Codex 或其他 backend 可以保留自己的 session cache，但 framework transcript 才是可移植的 source of truth。

## 存在哪里

v0 store 是 file-backed：

```text
<creation-host-workspace>/.pneuma/build-threads.json
```

这是 Creation Host workspace state。它不是 Generated Application runtime SQLite，也不是 Published Application data。

## 基本用法

```ts
import {
  createFileBuildThreadStore,
  packBuildTurnsForRoleContent,
  recordBuildThreadExecutionOutcome,
  summarizeBuildThreadTurns,
} from "@pneuma-framework/core";

const conversations = createFileBuildThreadStore({ workspace });

const thread = await conversations.startThread({
  profile_id: "dev-board",
  app_id: "app-123",
  builder_user_id: "bob",
});

await conversations.appendTurn(thread.thread_id, {
  kind: "user",
  text: "Add a priority column to my board.",
});

await conversations.appendTurn(thread.thread_id, {
  kind: "agent_proposal",
  proposal_id: "proposal-1",
  summary: "Add priority support",
  rationale: "The Builder wants triage order.",
  tool_calls: [
    { name: "add_priority_column", arguments: { levels: ["P1", "P2", "P3"] } },
  ],
});

await recordBuildThreadExecutionOutcome(conversations, {
  thread_id: thread.thread_id,
  proposal_id: "proposal-1",
  decision: "approved",
  receipt: {
    status: "completed",
    evidence: { version_id: "v1" },
  },
});

const turns = await conversations.listTurns(thread.thread_id);
const summary = summarizeBuildThreadTurns(turns);
const messages = packBuildTurnsForRoleContent(turns, {
  capTurns: 20,
  alwaysKeepAnchor: true,
});
```

## Turn Kinds

| Kind | 作用 |
|---|---|
| `user` | Builder 文本。 |
| `agent_text` | Agent 叙述文本。 |
| `agent_clarification` | Agent 向 Builder 提澄清问题。 |
| `agent_proposal` | Agent 提出受治理的 change-set 或 Host-domain tool plan。 |
| `user_decision` | Builder 批准或拒绝 proposal。 |
| `host_execution_receipt` | Host 记录 proposal decision 或执行结果。status 是 `completed`、`rejected`、`failed_framework`、`failed_host_rolled_back` 或 `failed_validate_rolled_back` 之一。 |
| `host_event` | Host-owned event 的 escape hatch，但仍进入 transcript。 |

如果某段内容本质上是 proposal、decision 或 receipt evidence，不要塞进 `user` / `agent_text` prose。typed turns 才是 replay 和 inspection 能跨 backend 保持稳定的原因。

## Core Packing

core 保持 backend-agnostic。它提供一个 provider-neutral role/content packer：

- `packBuildTurnsForRoleContent(turns, opts?)`
- `roleContentBuildTurnPacker`

它返回通用 `{ role, content }` messages，并用稳定的 `pneuma:` tags 编码 proposal、decision 和 execution receipt，让 Agent 能看到什么被提议、什么被批准、什么已经执行。

provider-native message shape 属于 backend adapter。`pneumaTurnsToAnthropicMessages` 和 `pneumaTurnsToOpencodeMessages` 只作为早期 RC consumer 的兼容 alias 保留；新的 Host code 应使用 provider-neutral packer。

`capTurns` 限制 replay 的 turns 数量。`alwaysKeepAnchor: true` 会保留第一条 Builder turn，再取最新的 `capTurns - 1` 条。这样既保留原始 app goal，也能限制 prompt 长度。

## Inspection Summary

Host 的 inspection pane、diagnostics 和 demo timeline 可以使用 `summarizeBuildThreadTurns(turns)`：

```ts
const turns = await conversations.listTurns(thread.thread_id);
const summary = summarizeBuildThreadTurns(turns);
```

这个 summary 刻意保持 backend-neutral。它报告 `proposal_turns`、`decision_turns`、`execution_receipt_turns`、`latest_proposal_id` 这些语义计数，不提 Anthropic、opencode、Codex 或任何 provider-native message format。这样 Builder-facing inspection 绑定的是 pneuma 语义，而不是某个当前执行 turn 的 backend。

## AgentBackend.runTurn

M29 把 `AgentBackend.runTurn` 设为一个 Builder follow-up turn 的标准 backend 入口：

```ts
const result = await backend.runTurn({
  cwd: workspace,
  thread_store: conversations,
  thread_id: thread.thread_id,
  new_user_message: "Also add keyboard shortcuts.",
  system_prompt: "You are the build-phase agent for this Creation Host.",
  context_snapshot: { app_id: "app-123", profile_id: "dev-board" },
});
```

契约是：

```text
把 Builder user turn append 到 BuildThread
  -> 把 semantic transcript 打包成 provider-neutral role/content messages
  -> 用 system prompt + context snapshot + transcript 构造一个 backend prompt
  -> 为这个 thread_id 启动或复用 backend-native session
  -> 通过 backend transport 发送 prompt
```

对 legacy backend，`runAgentTurnThroughLaunchSend` 会在现有 `launch` 和 `sendUserMessage` 之上实现这条契约。`FakeAgentBackend` 和 `OpencodeBackend` 都使用这个 helper，并按 `thread_id` 维护 backend session cache。

因此 backend-native session 是 cache/optimization。BuildThread 仍然是 source of truth。Host 如果在同一个 thread 中替换 backend，新 backend 可以从 framework transcript 重建上下文。

## Decision + Receipt Helper

Builder decision 和 Host execution 完成后，用 `recordBuildThreadExecutionOutcome(store, input)`：

```ts
await recordBuildThreadExecutionOutcome(conversations, {
  thread_id: thread.thread_id,
  proposal_id: "proposal-1",
  decision: "approved",
  reason: "Looks correct.",
  receipt: {
    status: "completed",
    evidence: { changed_files: ["src/widget.tsx"] },
  },
});
```

这个 helper 会按 canonical order append `user_decision`，再 append `host_execution_receipt`。它不执行 Host code 或 framework mutation；它只在 Host 已经完成 decision/execution 之后，记录语义 transcript。

## Browser Thread Id 纪律

Creation Host 应把 `thread_id` 当作 durable UI state：

```text
POST /evolution/start
  -> returns / streams thread_id
POST /evolution/:thread_id/message
  -> appends follow-up user turn
POST /evolution/:thread_id/proposals/:proposal_id/approve
  -> appends user_decision and later host_execution_receipt
POST /evolution/:thread_id/proposals/:proposal_id/reject
  -> appends user_decision and rejected host_execution_receipt
```

不要用可能 stale 的 React closure state 计算 follow-up URL。把 `thread_id` 放进明确的 ref 或 state machine；在 initial start response 已经提交 id 之前，不要发送 follow-up。

## 当前限制

- `AgentBackend.runTurn` 不替代 streaming/event APIs。backend 仍然暴露 `onEvent`、permission events 和 stop/close lifecycle。
- `runAgentTurnThroughLaunchSend` 是 launch/send transport 的 compatibility helper。它不做 provider-native event stream normalization。
- `recordBuildThreadExecutionOutcome` 记录 decision+receipt turns，但 Host 仍然拥有 proposal execution、rollback 和 evidence generation。
- 它还不解决单个 model turn 内 read-only iterative tool-result replay。
- packing 基于 turn count，不是 token count。
- v0 store 是本地 file-backed，不是 cloud multi-tenant database。
