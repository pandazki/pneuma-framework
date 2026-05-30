# 4 · 跑通循环

*一切就绪——现在驱动它。* 这是回报:整条循环通过 studio 驱动,对着真实服务——真实
代码代理、真实数据库分支、真实云部署。没有 mock。

![受治理循环成环:创建 → 预览 → agent 改 draft → verify 门禁 → proposal → 批准并应用 → 发布 → 回滚](/diagrams/governed-loop.png)

## 流程

```text
从 profile 创建          → 一个完整的 v0
用真实 Codex 演进         → 一次端到端改动(契约 + schema + 迁移 + 仓储 + UI),经门禁
在 Neon 分支上预演        → 在真实数据上预览改动,生产不受影响
批准并应用               → vNext,观察 schema + bundle 增量
发布到 Vercel            → 先 Neon 迁移,再真实部署
线上验证                 → 演进后的应用,Neon 支撑,可达
回滚                     → 回到上一个代码版本
```

## 实际发生了什么

对着线上服务正是跑这条流程,对一次改动(端到端加一个 `environment` 字段)产生了:

- **真实 Codex** 跨 8 个文件改了 draft(Zod 契约、Drizzle schema、一个新的幂等迁移、
  两个仓储、React UI、测试),且 draft 在任何 proposal 出现之前就通过了 `verify`。
- **studio 在应用时记录了增量**——app schema 签名 `…risk,owner…` →
  `…risk,environment,owner…`,客户端 bundle `211.4 kB` → `211.8 kB`。
- **Neon 分支预演**在一个携带真实生产行的分支上展示了新列,而生产本身仍没有它——随后
  分支在停止时被删除。
- **发布**对 Neon 跑了迁移(把列加进生产)并创建了一个报告 `READY` 的 Vercel 部署;
  线上应用以 `persistence: neon` 服务,且新字段存在。
- **回滚**把 active 版本移回;additive 列留在数据库里(前向兼容),重新发布上一个版本
  即让线上部署回退——这就是实践中的[回滚语义](/zh/concepts/rollback)。

::: tip 一个被捕获的真实教训
在一次较长的回合里,Codex 改完了代码,但 host 匹配的完成事件始终没到;运行撞上了超时。
这正是 fail-closed 值回票价之时——host kill 了进程、跑 `verify`、通过了,于是建出了
正确的 proposal。(该 lane 现在也会在 backend 的 `idle` 信号上判完成,并用宽裕的超时,
所以正常回合很快结束。)
:::

## 自己跑一遍

先安装一次(example 用本地依赖链接,所以测试任何 example 前需在仓库根跑 `bun install`):

```bash
bun install
```

单独的 Generated App:

```bash
bun run --cwd examples/clean-room-release-board verify
```

Creation Host studio —— 确定性 lane,完全离线,无需凭证:

```bash
bun test --cwd examples/clean-room-release-host
bun run --cwd examples/clean-room-release-host build
PORT=8870 bun run --cwd examples/clean-room-release-host serve   # → http://127.0.0.1:8870
```

完整真实流程 —— Codex 代码代理、Neon 分支、Vercel 部署 —— 通过环境变量(凭证放在已
gitignore 的 `.env`):

```bash
DATABASE_URL=…  \
VERCEL_TOKEN=…  VERCEL_PROJECT=…  \
NEON_API_KEY=…  NEON_PROJECT_ID=…  \
PORT=8870 PNEUMA_AGENT=codex-app-server \
  bun run --cwd examples/clean-room-release-host serve
```

然后打开 studio 走一遍管线:**从 profile 创建 → 运行/Refine agent → Preview draft 或
Rehearse on Neon branch → 批准并应用 → 发布 → 回滚。**

## 你证明了什么

一个 Builder 通过与 agent 对话创建并演进了一个真实应用——而让这成为可能的 Host,大多
是接到框架契约与 opt-in adapter 上的闭包。这就是框架承诺的兑现:你得到受治理循环;你
保留你的产品。
