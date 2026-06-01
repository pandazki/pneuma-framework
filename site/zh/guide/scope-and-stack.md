# 1 · 范围与选型

*从目标出发的头两个决策。*[目标图](./)展示了一个 Builder 演进 Release Operations Board
并把它发布上线。在任何代码之前,从那张图里落下两个问题:**产品里有什么**,以及**什么栈
来实现它**。把这两个弄明确,余下的构建就是机械的。

## 范围:先把框画出来

范围让 example 保持诚实:小到能端到端地建,真到能演练循环的每一环。

| 在范围内 | 刻意在范围外 |
|---|---|
| 一个能用的 `v0` Release Operations Board(release、状态、流转) | 多租户身份 / 真实鉴权 |
| 一次 agent 驱动的端到端演进(契约 → schema → 迁移 → UI) | 一个 profile 市场 |
| 预览、批准、发布、回滚 | 托管密钥库、组织级 RBAC |
| 真实数据库 + 真实云部署 | 零停机 / 蓝绿部署 |

范围外那一列不是偷懒——它是[边界](/zh/architecture/boundaries)在起作用。身份、密钥库、
零停机部署,归生产 Host 所有,框架刻意不碰。*此刻*就把它们点名为范围外,才挡住了 example
悄悄长成一个托管平台。

## 栈:一串 Host 选择的级联

栈里的一切都是**你的**选择。框架不规定前端、不规定数据库、不规定部署目标。所以"选栈"是
一串独立决策的级联——每一个都是框架留开的一个槽:

![一个自上而下的决策级联:前端 → React;后端 → Bun 上的 Hono;持久化 → Drizzle + Neon Postgres;部署目标 → Vercel + Docker;agent backend → Codex app-server;全部标为 Host/profile 选择,非框架](/diagrams/guide-stack-cascade.png)

| 决策 | 本 example 的选择 | 为什么它*只是*一个示例 |
|---|---|---|
| 前端框架 | React | 框架从不渲染你的 UI。 |
| 后端存在与运行时 | Bun 上的 Hono | Host 可以无后端;这个有。 |
| 契约 | Zod | 唯一真源,推断进客户端。 |
| 持久化 | Drizzle + Neon Postgres | 换成 SQLite、R2、任何东西——它是个槽。 |
| 部署目标 | Vercel(+ Docker) | 参考 adapter;随意 fork 或替换。 |
| Agent backend | Codex app-server | `AgentBackend` 可插拔;opencode 是备选证据。 |

::: tip 这些都不是框架语义
把右列读两遍。Bun、Hono、React、Drizzle、Neon、Vercel、Codex——*每一个*都是这个 profile
做的选择,而非框架要求之物。框架只要求你选的东西被**声明、有界、把关**——这恰是下一阶段
所做的。
:::

## 这两个决策产出什么

范围告诉你 `v0` *必须做什么*。栈告诉你*存在哪些文件*去做。两者一起,定义了 agent 此后被
允许演进的那个面——也因此定义了你必须划界的那个面。那次划界就是 profile 契约,也是
下一阶段。

再下一层 → **[2 · 设计 Generated App](./generated-app)**
