# 下游项目升级到 pneuma-rc-0.1.2

**读者：** 当前使用 `pneuma-rc-0.1.1` 的下游 Creation Host 项目
**English version:** [upgrading-to-rc-0.1.2.md](./upgrading-to-rc-0.1.2.md)

`pneuma-rc-0.1.2` 是一个 additive BuildThread patch。它把 Builder conversation、Agent proposal、Builder decision、Host execution receipt 这些语义 transcript 收进 framework。

它不替代 `AgentBackend.launch/sendUserMessage/onEvent`，不改变 Generated Application runtime SQLite，也不改变 Published Application data。

## 1. 更新本地 framework 路径

如果下游项目在 `package.json` 中引用本地 RC checkout，把所有 `@pneuma-framework/*` 路径从：

```json
"file:/Users/pandazki/Codes/pneuma-framework-rc-0.1.1/packages/core"
```

改成：

```json
"file:/Users/pandazki/Codes/pneuma-framework-rc-0.1.2/packages/core"
```

每个 package 使用对应目录：

```text
/Users/pandazki/Codes/pneuma-framework-rc-0.1.2/packages/core
/Users/pandazki/Codes/pneuma-framework-rc-0.1.2/packages/core-domain
/Users/pandazki/Codes/pneuma-framework-rc-0.1.2/packages/runtime
/Users/pandazki/Codes/pneuma-framework-rc-0.1.2/packages/cli
/Users/pandazki/Codes/pneuma-framework-rc-0.1.2/packages/viewer-react
```

然后重新安装：

```bash
bun install
```

## 2. 加入 BuildThread Store

如果下游 Host 当前有 `host_conversations`、`evolution_conversations` 或类似表，可以开始迁移到 framework store：

```ts
import { createFileBuildThreadStore } from "@pneuma-framework/core";

const conversations = createFileBuildThreadStore({
  workspace: hostWorkspaceDir,
});
```

v0 store 写入：

```text
<creation-host-workspace>/.pneuma/build-threads.json
```

这是 Creation Host workspace state。不要把它放进 Generated Application runtime SQLite，也不要默认打进 Published Application data。

## 3. 追加语义 Turn

推荐 Host route mapping：

```text
POST /evolution/start
  -> startThread()
  -> appendTurn(kind: "user")

POST /evolution/:thread_id/message
  -> appendTurn(kind: "user")

Agent proposes a plan
  -> appendTurn(kind: "agent_proposal")

Builder approves or rejects
  -> appendTurn(kind: "user_decision")

Host executor finishes
  -> appendTurn(kind: "host_execution_receipt")
```

用 typed turns 表达治理状态，不要把这些信息藏进 `agent_text` prose：

```ts
await conversations.appendTurn(thread.thread_id, {
  kind: "agent_proposal",
  proposal_id,
  summary,
  rationale,
  tool_calls,
});

await conversations.appendTurn(thread.thread_id, {
  kind: "user_decision",
  proposal_id,
  decision: "approved",
});

await conversations.appendTurn(thread.thread_id, {
  kind: "host_execution_receipt",
  proposal_id,
  status: "completed",
  evidence,
});
```

如果 Host 已经有 proposal table 和 two-phase Host executor，可以保留。BuildThread 记录语义 transcript；它不负责执行 Host-owned artifact changes。

## 4. 把 Turns Replay 给 Backend

如果 Host 现在自己把 conversation rows 翻译成 model messages，可以改用 framework helper：

```ts
import { pneumaTurnsToAnthropicMessages } from "@pneuma-framework/core";

const turns = await conversations.listTurns(threadId);
const messages = pneumaTurnsToAnthropicMessages(turns, {
  capTurns: 20,
  alwaysKeepAnchor: true,
});
```

如果需要 opencode-shaped replay：

```ts
import { pneumaTurnsToOpencodeMessages } from "@pneuma-framework/core";
```

backend-native session 仍然可以作为 cache 或 resume optimization。BuildThread transcript 才是可移植 source of truth。

## 5. Browser 中保留 Thread Id

把 `thread_id` 当作 durable UI state。不要从 stale React closure 里计算 follow-up URL。

安全模式：

```text
1. Start request opens a new thread.
2. The server streams or returns thread_id.
3. The browser commits thread_id into explicit state/ref.
4. Follow-up messages are disabled until thread_id exists.
5. Follow-up requests always target /evolution/:thread_id/message.
```

这正是为了避免那种每次 follow-up 都意外创建新 evolution thread、Agent 只能看到最新一句 Builder message 的失败模式。

## 6. 暂时不要迁移什么

这个 RC patch 暂时不提供：

- 新的 `AgentBackend.runTurn` interface；
- 自动 Host execution receipt recording；
- token-budget packing；
- cloud multi-tenant transcript storage；
- browser chat client package。

这些是后续 lane。RC 0.1.2 的目标是先落 primitive，不强制 backend-interface break。

## 7. 运行下游验证

建议最低验证：

```bash
bun install
bun run typecheck
bun test
```

如果迁移 Host conversation table，建议补这些 regression tests：

- follow-up message 复用原始 `thread_id`；
- proposal / decision / receipt turns 按顺序 append；
- backend replay 包含最初 Builder anchor 和最新 turns；
- reject path 只记录 `user_decision`，不记录 execution receipt；
- approve 成功路径记录 `host_execution_receipt`。

## 8. 预期影响

预期会发生：

- Host-owned transcript storage code 变少；
- backend-specific turn translation code 变少；
- proposal / approval / execution 的 inspection evidence 更清楚；
- 未来迁移 backend 更容易。

不预期发生：

- 不需要 Generated Application data migration；
- 不改变 Published Application behavior；
- 不要求重写 Host proposal/executor logic；
- 不改变四层产品模型。
