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

await conversations.appendTurn(thread.thread_id, {
  kind: "user_decision",
  proposal_id: "proposal-1",
  decision: "approved",
});

await conversations.appendTurn(thread.thread_id, {
  kind: "host_execution_receipt",
  proposal_id: "proposal-1",
  status: "completed",
  evidence: { version_id: "v1" },
});

const turns = await conversations.listTurns(thread.thread_id);
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
| `host_execution_receipt` | Host 记录 approved proposal 的执行结果。 |
| `host_event` | Host-owned event 的 escape hatch，但仍进入 transcript。 |

如果某段内容本质上是 proposal、decision 或 receipt evidence，不要塞进 `user` / `agent_text` prose。typed turns 才是 replay 和 inspection 能跨 backend 保持稳定的原因。

## Core Packing

core 保持 backend-agnostic。它提供一个 provider-neutral role/content packer：

- `packBuildTurnsForRoleContent(turns, opts?)`
- `roleContentBuildTurnPacker`

它返回通用 `{ role, content }` messages，并用稳定的 `pneuma:` tags 编码 proposal、decision 和 execution receipt，让 Agent 能看到什么被提议、什么被批准、什么已经执行。

provider-native message shape 属于 backend adapter。`pneumaTurnsToAnthropicMessages` 和 `pneumaTurnsToOpencodeMessages` 只作为早期 RC consumer 的兼容 alias 保留；新的 Host code 应使用 provider-neutral packer。

`capTurns` 限制 replay 的 turns 数量。`alwaysKeepAnchor: true` 会保留第一条 Builder turn，再取最新的 `capTurns - 1` 条。这样既保留原始 app goal，也能限制 prompt 长度。

## Browser Thread Id 纪律

Creation Host 应把 `thread_id` 当作 durable UI state：

```text
POST /evolution/start
  -> returns / streams thread_id
POST /evolution/:thread_id/message
  -> appends follow-up user turn
POST /evolution/:thread_id/proposals/:proposal_id/approve
  -> appends user_decision and later host_execution_receipt
```

不要用可能 stale 的 React closure state 计算 follow-up URL。把 `thread_id` 放进明确的 ref 或 state machine；在 initial start response 已经提交 id 之前，不要发送 follow-up。

## 当前限制

- `BuildThread` 是 additive；它还不替代 `AgentBackend.launch/sendUserMessage/onEvent`。
- 它不会自动记录 Host execution receipt。Host executor 完成后需要主动调用 `appendTurn`。
- packing 基于 turn count，不是 token count。
- v0 store 是本地 file-backed，不是 cloud multi-tenant database。
