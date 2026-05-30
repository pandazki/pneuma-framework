# 边界与所有权

框架只有不挡你的路才有价值。本页是判断什么归框架、什么归你 Host 的判据。

## 判据

对任何一块功能,问一个问题:

> **它碰不碰 栈、领域、UI、数据形状、部署目标、身份?**

- **碰 → 归 Host 或 profile。** 框架给你*契约或插槽*,绝不给实现;别塞进框架包。
- **不碰(纯时序 / 治理 / 机制) → 可归框架**,你应当伸手去用框架的 helper 而非重新
  实现。

| 框架拥有 | Host 拥有 |
|---|---|
| 生命周期状态机与时序 | 栈(Bun/Hono/React/Drizzle…) |
| fail-closed 门禁、verify 作门禁 | 业务领域 |
| Proposal / 回执 / 证据形状 | 产品 UI |
| 工作区 / 版本 / diff 机制 | 持久化后端 |
| code-agent-lane 契约 | 身份 / 鉴权 / 多租户 |
| (reference)adapter——opt-in | 部署目标与凭证 |

## "有价值却不绑架"的三层

并非所有有用的东西都该放同一处。框架在三层交付价值:

1. **import-as-library(纯机制)。** 你会重写、且重写得很烦、对栈零意见的东西:受治理
   循环主心骨、工作区/版本/diff 机制、fail-closed 提案构造器、类型化的回执/观察契约。
   它们在 **Host Kit**(`@pneuma-framework/host-kit`)。
2. **opt-in reference adapter。** 真实世界的管道税——某 code-agent backend 的怪癖、某
   部署 provider 的上传协议、某数据库的分支 API。它们是*你能 fork 或换的独立包*,框架
   core 永不依赖:`@pneuma-framework/backend-codex`、`@pneuma-framework/adapter-vercel`、
   `@pneuma-framework/adapter-neon`。
3. **只给契约 / 插槽(绝不给实现)。** 栈、领域、UI、数据形状、身份、部署目标。框架
   定义插槽;你带来实现。

## 价值如何交付

最有用的基础设施是被*消费*的,不是被重新推导的。框架倚重:

- **契约 + 测试面**胜过"帮你跑应用的运行时"。
- **à la carte 模块**——只拿版本/diff 机制而不要 agent 循环;只拿提案门禁而不带对栈的
  意见。
- **reference adapter 是你拥有、能读的代码**——opt-in 的包,不是黑盒。

::: warning 分发是 Bun-source,有意为之
框架以 Bun 直接消费的 TypeScript 源码分发(经 `file:`/git),而非发布到 npm 的构建
`dist`。`main`/`types` 有意指向 `src/*.ts`。这使它 **Bun-only**,Host 须声明此点。
收敛已发布的包面与一个 CI 门禁,是今天到 1.0 之间的工作。
:::

## 什么留在外面

一个真实 Creation Host 会需要框架有意不拥有的东西——多租户身份、托管密钥保险库、
分布式并发控制、零停机部署、合规审计后端。框架给你*词汇与 reference helper*;生产
实现归 Host。把这当作特性而非缺口:正是它让框架不至于变成一个绑架你产品的托管平台。
