# 受治理循环

受治理循环是框架的中心原语——把对话变成对 Generated Application 安全、可审查改动的
主心骨。

![创建 → 预览 → agent 改 draft → verify 门禁(fail-closed)→ proposal → 批准并应用 → 发布 → 回滚,成环](/diagrams/governed-loop.png)

```text
从 profile 创建 → 预览 → code-agent 改 draft → VERIFY 门禁
  → proposal → 批准 / 应用 (vNext) → 发布 (+回执) → 回滚
```

## 步骤

1. **从 profile 创建。** 实例化 profile 即得到一个完整的 `v0`。可立即预览或发布——
   agent 工作是*可选演进*,绝非前置。
2. **预览。** 用于检视当前(或待定)版本的一次性运行时。绝不写生产数据——用内存副本或
   隔离的数据库分支(*Preview Data Rehearsal*)。
3. **code-agent 改 draft。** Build-phase Agent 编辑一个 **draft 工作区**——active
   源的副本,绝非线上应用——且只在 profile 声明的 editable roots 内。
4. **verify 门禁。** scaffold 自带的 `verify`(typecheck + 测试 + 构建)是提案前门禁。
   draft **只有 verify 通过**才成为 Builder 可见的提案。
5. **proposal。** 一次受检的、单意图的披露:changed paths、schema 与 bundle 增量、
   verify 尾部。"proposal"意味着*已检查、可供人决策*,而非"agent 猜了点什么"。
6. **批准 / 应用。** 批准后,draft 被物化为 `vNext`。
7. **发布。** 跑迁移,然后服务或部署 active 版本,返回**结构化回执**(url、deployment
   id、persistence、schema)。
8. **回滚。** 恢复上一个**代码**版本。

## 不变量(不可协商)

这些是框架强制执行的,使你无法在细节上搞错:

1. **scaffold 的 `verify` 是门禁。** 没通过 verify 就没有 proposal。
2. **处处 fail-closed。** 缺失或含糊的信号——agent 超时、某检查没跑、碰了 protected
   文件——必须*阻断*而非放行。超时**不是**成功:kill agent、verify 工作区,只有检查仍
   通过才继续。
3. **批准守护变更。** 只有显式批准后才应用;拒绝发生在任何变更*之前*。
4. **迁移是 additive / forward-only / 幂等。** 绝不把破坏性 down-migration 写进回滚。
5. **回滚只回代码。** 不回退数据库、不重新部署。回退线上部署是对回滚后版本的重新发布;
   回退数据(若真要)是一次*显式的纠正性 proposal*——绝不自动 drop。(前向兼容的代码
   会直接忽略多余的列或表。)
6. **code agent 编辑 draft,绝非 active 源。**

::: tip 为什么 fail-closed 值回票价
在一次真实运行里,Codex backend 改完了代码,但 host 等待的完成事件始终没来,运行
撞上了超时。fail-closed 兜住了:host kill 了进程、跑 `verify`、通过了,于是仍建出了
正确的 proposal。fail-closed 正是让*漏检*变安全而非变错的保障。
:::

## 你要填的契约

框架定义*形状*;Host 来填。这是词汇表——别另造平行的:

- **Proposal** —— `{ changedPaths, diff, verifyTail, schema 前/后,
  bundle 前/后, agentNote }`,相对 active 版本计算,展示完整累计增量。
- **Publish / Deploy 回执** —— `{ target, versionId, url, persistence,
  deploymentId?, files?, dbSchema, migrateTail }`。发布返回含*访问路径*的结构化证据
  ——"已部署" ≠ "可访问"。
- **Runtime / Data 回执** —— 已批准变更后运行时/provider 数据发生了什么的证据。
- **观察证据** —— 每次应用后采集 `{ appSchemaSignature, bundleManifest, dbSchema }`,
  让演进的效果具体可见而非口头断言。
- **editable vs protected roots** —— profile 同时声明两者;改了 protected 路径的 draft
  在 verify *之前*就被拒,对 diff 强制。

## 它在代码里在哪

闭包驱动的主心骨在 Host Kit 里:`@pneuma-framework/host-kit/governed-change` 暴露
`buildGovernedProposal`——你把 `runAgent` / `isAgentTimeout` / `verify` / `observe`
作为闭包传入,它拥有时序与 fail-closed 门禁。用法见
**[构建 Host](/zh/guide/creation-host)**。
