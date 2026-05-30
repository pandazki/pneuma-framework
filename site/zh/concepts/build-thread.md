# BuildThread

一个 Creation Host 是一段产出真实、受治理变更的长对话。问题是:**这段对话到底住在
哪?** 朴素的答案——"在 agent backend 的 session 里"——是错的,而修好它正是
**BuildThread** 的用途。

![BuildThread 作为框架拥有的记录,由类型化的 turn(user、proposal、decision、receipt)组成,坐在可替换的 agent backend 之上](/diagrams/build-thread.png)

## 问题:backend session 不是事实源

每个 agent backend——Codex、opencode、Anthropic——都有自己的原生 session。如果你把
*那个*当作发生了什么的记录,你就把系统里最重要的资产(proposal、decision、execution
receipt 的历史)绑死在了某一家厂商的 session 格式上。换 backend,历史就没了。检视历史,
你受制于一个你并不拥有的缓存。

BuildThread 反转了这点。**ADR-0032** 钉死规则:

> 框架在 Creation Host 工作区里存一份规范的语义记录。backend adapter 仍可为性能保留
> 原生 session,但它们从框架记录重建或续接。

记录是事实源;backend session 是缓存。记录住在 *Host 工作区*(v0 里是
`<workspace>/.pneuma/build-threads.json`),而非某个 Generated Application 的运行时
数据库,也不在厂商的服务器上。

## 一个 thread 由什么组成

一个 `BuildThread` 是有序的、类型化的 `BuildTurn` 列表。turn 的*种类*就是一段受治理
对话的词汇:

| turn 种类 | 含义 |
|---|---|
| `user` | Builder 说了点什么。 |
| `agent_text` | agent 的叙述。 |
| `agent_clarification` | agent 向 Builder 提问。 |
| `agent_proposal` | agent 提议一个 change-set 或工具计划。 |
| `user_decision` | Builder 批准或拒绝(`approved` \| `rejected`)。 |
| `host_execution_receipt` | 实际发生了什么。 |
| `host_event` | Host 拥有的逃生口。 |

`host_execution_receipt` 的 status 取值,就是循环其余部分用的同一套 fail-closed 词汇——
`completed`、`rejected`、`failed_framework`、`failed_host_rolled_back`、
`failed_validate_rolled_back`。记录不只记"我们试了";它精确记下一个 turn *如何*收场,
包括一次被回滚的 apply。

这正是两种[变更模型](./change-models)都写在这里的原因:一个代码 lane proposal 追加一个
`agent_proposal` turn;Builder 的点击追加一个 `user_decision`;apply 追加一个
`host_execution_receipt`。整个受治理循环单从 thread 就可读。

## 为什么可移植是回报

因为记录是框架拥有、backend 中立的,三件厂商 session 给不了的事成为可能:

- **thread 中途换 backend。** 一个新 backend 从框架记录重建上下文——*"若一个 Host 在
  thread 中途换 backend 实现,新 backend 能从框架记录重建上下文。"*
- **检视与审计**完整的 proposal/decision/receipt 历史,从一个你拥有的文件,而非一个
  远端 session API。
- **回放** —— 记录是 Host 的时间旅行与 checkpoint 机制所建之上的持久记录。

## `runTurn`:backend 如何使用 thread

**ADR-0036** 标准化了 backend 入口。要处理一个 Builder 的追问,框架追加 Builder 的
`user` turn,把相关的先前 turn **打包**成 role content(`packBuildTurnsForRoleContent`),
经由 `AgentBackend.runTurn` 交给 backend,再把结果的 decision 与 receipt turn 记回 thread。
backend 可以按 `thread_id` 复用它的原生 session 作为优化——但框架从不*依赖*它这么做过。
遗留的 launch/send 传输经由一个共享 helper 实现同一个契约,所以无论 backend 如何接线,
thread 都是脊柱。

## 一句话版本

> 建一个 app 的对话太重要,不能存在别人的 session 里。BuildThread 让它框架拥有、类型化、
> fail-closed、可移植——整个[受治理循环](/zh/architecture/governed-loop)写入的持久脊柱。

这就结束了领域模型的深入。要看这一切被一个真实 agent 对着真实栈端到端驱动,就建一个:
**[构建 Host](/zh/guide/)**。
