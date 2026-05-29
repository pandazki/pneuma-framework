# 构建 pneuma Creation Host —— 给 code agent 的指南

**读者:** 在 `pneuma-framework` 上构建或扩展 Creation Host 的 LLM / code agent。
**英文版本:** [host-builder-agent-guide.md](./host-builder-agent-guide.md)

本文刻意采用契约优先、祈使语气。写 Host 代码前先读它。拿不准时,**以这里的不变量
优先于你的直觉**——它们编码了框架存在的理由。在产出 proposal 或宣称任务完成前,先跑
最后一节的**自检**。

---

## 0. 唯一的心智模型

```
pneuma-framework  →  Creation Host  →  Generated Application  →  Published Application
   (原语、治理、        (你构建/扩展的         (应用定义、数据、          (End User 打开的
    契约)               Builder 面向产品)      版本、构建记录)            已发布版本)
```

三种角色可坍缩为一人:**Developer** 构建 Host;**Builder** 通过与 **Build-phase
Agent**(你就在这条 lane 上)对话来创建/演进 Generated App;**End User** 使用
Published App。

永远不要坍缩这四层。任务说"那个 pneuma app"时,先判定它指 Creation Host、Generated
Application 还是 Published Application,再动手。

## 1. 边界判据(用它决定任何东西归谁)

> 它碰不碰 **栈 / 领域 / UI / 数据形状 / 部署目标 / 身份**?

- **碰 → 归 Host 或 profile。** 框架只给契约或插槽,绝不给实现;别把它塞进框架包。
- **不碰(纯时序 / 治理 / 机制) → 可归框架**,你应当伸手去用框架的契约/helper,而非
  重新实现。

举例——Host 拥有:Bun/Hono/React/Drizzle 选型、业务领域、产品 UI、持久化后端、鉴权、
部署 provider。框架拥有:生命周期状态机、fail-closed gating、回执/证据 shape、
code-agent lane 协议、工作区/版本/diff 机制。

## 2. 治理主心骨 = 这条循环(遵守这个状态机)

```
从 profile 创建 → (预览) → code-agent 改 draft → VERIFY 门禁
  → proposal → 批准/应用 (vNext) → publish (+回执) → (rollback)
```

不变量——不可协商:

1. **从 profile 创建即得到完整 `v0`。** Agent 工作是*可选演进*,绝非首次预览/发布的
   前置。
2. **scaffold 自带的 `verify` 是提案前门禁。** draft 只有 verify 通过才成为 Builder
   可见的 proposal。无例外。
3. **处处 fail-closed。** 缺失/含糊的信号(agent 超时、某检查没跑、碰了 protected
   文件)必须**阻断**而非放行。超时**不是**成功——kill、verify,只有检查仍通过才继续。
4. **批准守护变更。** 只有显式批准后才 apply;拒绝发生在任何变更**之前**,绝不之后。
5. **迁移是 additive / forward-only / 幂等**(`ADD COLUMN IF NOT EXISTS`、
   `CREATE TABLE IF NOT EXISTS`)。绝不把破坏性 down-migration 写进 rollback。
6. **rollback 只回代码/版本。** 它不回退数据库、不重新部署。回退线上部署需**重新
   publish** 回滚后的版本;回退数据(若真要)是一次**显式的纠正性 proposal**——绝不
   自动 drop。
7. **preview 即用即弃,且不得写生产数据。** 用内存副本,或在隔离的数据库分支上预演。

## 3. 你必须遵守的契约

填这些 shape,别另造平行的(名称即 canonical 词汇,见 `CONTEXT.md`):

- **Proposal** —— `{ changedPaths, diff, verifyTail, appSchemaSignature 前/后,
  bundle 前/后, agentNote }`。相对*active 版本*计算,展示完整累计 delta。
- **Publish / Deploy 回执** —— `{ target, versionId, url, persistence,
  deploymentId?, files?, dbSchema, migrateTail }`。publish 必须返回结构化证据,含
  访问路径;"已部署" ≠ "可访问"。
- **Runtime/Data 回执** —— 已批准变更后对运行时/provider 数据发生了什么的证据。当
  发布数据被携带或演进时必需。
- **观察证据** —— 每次 apply 后采集 `{ appSchemaSignature, bundleManifest,
  dbSchema }`,让演进的效果具体可见而非口头断言。
- **editable vs protected roots** —— profile 同时声明两者。改了 protected 路径
  (部署/基础设施/契约文件)的 draft 在 verify **之前**就被拒。对 `changedPaths`
  强制,而非信 agent 的口头承诺。
- **code-agent lane** —— 对*draft 工作区*(副本,绝非 active 源)跑一个 turn;用
  backend 特定的**信号集合**判完成;超时则 kill → verify → fail-closed。

## 4. 规则

DO:
- 把版本物化为 `vN` 目录;`v0` 保持原始。
- 按内容(sha)算 diff,在 diff 上强制 protected roots。
- 把"回合结束"当作 backend 信号的*集合*;留一个宽裕、可配置的超时作 fail-closed 兜底。
- 即使某步是 no-op 也返回类型化回执/证据。
- 让前向兼容代码忽略多余的 DB 列/表(只 select 已知列)。

NEVER:
- 把栈/领域/UI/数据塞进框架包。
- 让 code agent 直接改 active 源——永远走 draft + 批准。
- 信 agent transcript 胜过通过的 `verify`。
- rollback 时自动 drop schema 或自动回退数据。
- 在 published 运行时按请求即时 seed/伪造行(在 migrate 时、且仅当空表才 seed)。
- 静默截断/跳过某检查却报告成功。

## 5. 真实世界的坑(你会撞,提前防)

- **code-agent 完成事件漂移。** 某 backend(如 `codex app-server` 0.128)可能用
  `thread/status/changed` → `idle` 表示完成,只是有时才发 `turn/completed`。匹配一个
  信号*集合*(且 `idle` 仅在 `active` 之后才算)。fail-closed verify 让漏检变安全。
- **回合时长波动。** 同一 prompt 可能一次约 360s、另一次超过 600s。用宽裕上限(如
  900s);真超限是真超时、不是事件 bug——fail-closed 仍产出正确 proposal。
- **云部署保护。** 全新部署目标可能把所有 URL 挡在鉴权后(如 Vercel Deployment
  Protection → 401),于是 `READY` 的部署并不可达。回执需要访问/bypass 概念,而非只有
  URL。
- **provider 控制平面 ≠ 连接串。** Postgres 连接串驱动不了分支/管理(如 Neon 需 API
  key;org 级 key 列不出用户项目、需显式 project id)。
- **用数据库分支做预演。** 分支是从生产 copy-on-write(真实数据);对*分支*跑草稿
  迁移;据此预览;停止时删分支。数据从不回灌——只有验证过的 forward 迁移在 publish 时
  进入生产。
- **端口分配。** 给临时运行时选真正空闲的端口;固定计数器会撞上孤儿进程,残留进程会
  应答你的 health check。

## 6. 自检(产出 proposal 或宣称完成前跑一遍)

1. scaffold 的 `verify` 在 draft 上**真的**通过了吗?(不是"agent 说通过了"。)
2. 改动只碰了 editable roots 吗?(看 diff。)
3. schema 变更是 additive/幂等、带 forward 迁移吗?
4. 我采集了前后的 schema + bundle 证据吗?
5. preview/预演与生产数据隔离吗?
6. 任何新的"已部署"声明是否带**可达**检查,而非只有 URL?
7. 我是否在把任何 栈/领域/UI/数据形状 的东西塞进框架?(若是,停——改成 Host 契约。)
8. 若有失败或跳过,我有没有**坦白说出**(fail-closed),而非报告成功?

## 7. 应当拒绝的反模式

- "直接改 active app 更快。" → 不;draft + verify + 批准。
- "rollback 顺手把新列删了。" → 不;additive + 显式纠正性 proposal。
- "部署返回了 ID,就算已发布。" → 不;smoke 一个可达端点。
- "给框架加个 Vercel/Neon/Bun 依赖。" → 不;reference adapter、opt-in、core 永不依赖。
- "为了用真实数据,直接对生产库预览。" → 不;分支或内存预演。

---

吃透第 1–2 节(边界判据 + 循环不变量),你基本不会出错;其余是细节。**框架拥有时序与
治理;你通过闭包与 adapter 拥有一切副作用。** 始终让四层可见。
