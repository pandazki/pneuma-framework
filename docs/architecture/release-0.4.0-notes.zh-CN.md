# 发布说明:pneuma-framework 0.4.0

**状态:** 已发布
**日期:** 2026-05-31
**English version:** [release-0.4.0-notes.md](./release-0.4.0-notes.md)
**上一列车:** [pneuma-rc-0.3.0 快照](./release-candidate-0.3.0-snapshot.zh-CN.md)
**变更日志:** [CHANGELOG.md](../../CHANGELOG.md)

`0.4.0` 是第一个以正式 release(而非 release-candidate)发布的版本。0.1–0.3 钉死了
开发者契约、assurance 通道与最小企业治理词汇;**0.4.0 是实现框架列车**:一个真实的
全栈 Creation Host 现在*消费*框架,而非重新推导受治理循环——且整条循环对着真实代码
代理、真实数据库、真实云部署端到端跑通。

## 决定

把 `0.4.0` 作为实现框架版本发布:

- 保持四层产品模型与每一条边界不变;
- 把受治理循环主心骨与工作区机制提升为可消费的 **Host Kit** 包,使 Host 接闭包而非
  重新实现时序;
- 把真实世界管道(代码代理、部署、数据库分支)作为**可选 reference adapter** 交付,
  core 永不依赖它们;
- 用两个 clean-room example 对着真实服务端到端证明;
- 钉死一个面向开发者的文档站作为规范入口。

## 0.4.0 交付什么

| 领域 | 现在属于 0.4.0 的内容 |
|---|---|
| Host Kit | `@pneuma-framework/host-kit` —— 工作区机制 + `buildGovernedProposal` fail-closed 受治理变更主心骨(M45)。 |
| Reference adapter | `backend-codex`、`adapter-vercel`、`adapter-neon` —— 可选、开箱即用、与 core 独立。 |
| 生产 profile | Developer 编写的 Bun/Hono/React/Drizzle/Zod 脚手架 profile,带 Neon + Docker/Vercel 目标(M52)。 |
| 生产 Host 集成 | 创建 → 预览 → code-agent 改 draft → verify 门禁 → proposal → 批准/应用 → 发布(Neon + Vercel)→ 回滚,确定性与真实 Codex 两条 lane(M53)。 |
| 工作流 studio + 调试循环 | Workflow App Studio 参考线(M48)与提案前的 Agent Debug Loop(M49)。 |
| 文档站 | `site/` —— 双语 VitePress:架构、概念深入、目标驱动的构建 Host、agent 路由器、`llms.txt`。 |
| Clean-room example | `examples/clean-room-release-board` + `examples/clean-room-release-host`。 |

## 验证

- 全量包测试绿;根 typecheck 绿;`bun run docs:build` 绿。
- 生产 Host 循环对着**真实**服务跑了一次端到端改动(加一个 `environment` 字段):
  真实 Codex 在 `verify` 门禁后跨多个文件改了 draft;apply 采集了 schema + bundle 增量;
  一个 Neon copy-on-write 分支在真实形状数据上预演了迁移;发布跑了 Neon 迁移与一次
  Vercel 部署并服务了新字段;回滚回到了 active 代码版本,而 additive 列持久保留。

## 消费说明

- 发行按设计是 **Bun 源码**:包经由 `file:`/git 消费,`main`/`types` 指向 `src/*.ts`。
  Host 必须声明这条 Bun-only 约束。
- example 用本地依赖链接、不提交 `node_modules`:在任何 example 上跑 `bun test`/`verify`
  前,先在仓库根 `bun install`,否则 harness 会以 "dependencies are missing" fail-closed。

## 仍归 Host / 推迟到 0.4.0 之后

边界完好:多租户身份、托管密钥库、零停机部署、合规审计后端仍归 Host。Vercel/Neon 与
结构化部署回执仍是 Host/example 本地的;把结构化 publish/deploy-receipt 契约提升进框架
包,是 0.4.0 之后的候选通道,而非 0.4.0 的缺口。前路见
[1.0 就绪评审](./release-1.0-readiness-review.zh-CN.md)。
