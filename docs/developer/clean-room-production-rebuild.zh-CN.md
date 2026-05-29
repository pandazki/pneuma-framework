# 净室生产重建 —— 证据与发现

**日期:** 2026-05-29
**英文版本:** [clean-room-production-rebuild.md](./clean-room-production-rebuild.md)

对 M53「production profile」练习的独立净室重建:相同目标、相同技术栈(Bun + Hono
+ React + Drizzle + Zod + Neon + Vercel + Codex),仅依据 *目标* 重新推导并实现,
不阅读现有 example 的产品代码。它同时也是对 1.0 问题「框架的核心承诺能否从目标
重建出来?」的一次真实检验。

产物:

- `examples/clean-room-release-board/` —— Generated Application 脚手架(Release
  Operations Board),深色「flight deck」产品 UI。
- `examples/clean-room-release-host/` —— Creation Host studio,浅色运维控制台 UI。

仅 Codex app-server 传输与 Vercel REST 部署适配器被允许参考现有 example —— 且只取
*集成机制*(协议、端点、env),不取产品逻辑。

## 用真实服务端到端证明了什么

通过浏览器 studio(`http://127.0.0.1:8870`)驱动:

1. **从 profile 创建** → 一个完整的 `v0` Release Operations Board。
2. **真实 Codex 演进** → `codex app-server` 编辑 draft 工作区,**端到端** 加入
   `environment` 字段(production / staging / development):Zod 契约、Drizzle
   schema、新的幂等迁移、两个仓储、React UI(状态 chip + 新的创建表单下拉)、以及
   测试 —— 共 8 个文件。
3. **提案前 verify 门禁** → scaffold 自带的 `bun run verify` 即门禁;只有通过的
   draft 才成为 Builder 可见的提案。
4. **应用 v1** → studio 记录观察到的增量:
   - 应用契约 schema 签名:`…risk,owner…` → `…risk,environment,owner…`
   - 打包客户端 bundle:211.4 kB · `4d0ce8d8f5f4` → 211.8 kB · `c1efd5cee3e4`
5. **发布 v1 到 Vercel** → 先跑 Neon 迁移(向真实 `release_board.release_items`
   表新增 `environment` 列),再做真实 Vercel REST 部署(`dpl_…`,27 文件,READY)
   并 smoke。
6. **线上、Neon 支撑、已演进** → 发布的 Vercel 应用报告 `persistence: neon`、含
   `environment` 的 schema 签名,并返回带 `environment: production` 的真实 Neon
   行。Codex 的 UI 改动(`env` chip 与 ENVIRONMENT 下拉)已在生产环境上线。

schema 与 bundle 的变化在 **每次应用后** 都被观察(studio「版本历史」+「提案」
卡片),发布后的 Neon 列增量也被记录(回执高亮新增的 `release_items.environment`)。

## 反馈给 1.0 评审的发现

这次重建确认了框架形态可从目标复现,并暴露了三个具体的真实缺口,值得记录:

1. **代码代理回合完成事件漂移(已定位根因并加修复)。** `codex` CLI 0.128 对短
   回合会发 `turn/completed`,但对较长回合只通过 `thread/status/changed` 的
   `status.type === "idle"` 表示结束。本 lane 起初只匹配 `turn/completed`,于是
   长运行检测不到完成、等满 600s 超时才由 **fail-closed** 验证路径接管——结果正确
   但慢约 10 分钟。协议探针拿到精确 payload(回合开始 `{type:"active"}`、结束
   `{type:"idle"}`)后,lane 现在在 `turn/completed` **或** 同一 thread 先 active
   后 idle 时即判定完成,并保留 fail-closed 超时作兜底。还有第二个因素:codex 回合
   时长是**波动的**,中等复杂改动正好贴着上限(同一 prompt 一次 363s 完成、另一次
   超过 600s),因此把上限从 600s 提到 **900s** 以吸收波动。一次带时序的运行端到端
   确认了路径:回合开始 `status=active`、结束 `status=idle`(约 353s),经
   "turn completed via thread/status idle" resolve,`agentNote: "codex turn
   completed"`。给框架的教训:代码代理 lane 契约应把「回合结束」当作一组 backend
   特定信号、配一个宽裕且可配置的上限,而 fail-closed 超时是让漏检(或真正超大回合)
   变安全(而非变错)的保障。

2. **云部署保护是真实存在的。** 全新的 Vercel 项目默认开启 Deployment Protection,
   所以部署虽 `READY`,却对发布后的 smoke 返回 `401`。一个 publish/deploy 回执契约
   需要把访问/bypass 凭证作为一等概念,而不仅是一个 URL —— 否则「已部署」与「可
   访问」会分叉。

3. **Host 状态恢复是真实的 UX 需求。** studio 首版在刷新时没有重新加载活动项目,
   于是刷新看起来像「没有项目」。任何真实 Creation Host 都需要持久的项目/会话恢复,
   而不只是内存态。

## 后续:把最大的发现付诸行动

这次重建最强的信号是:Host harness 是**没有消费框架包**搭起来的——框架给了思路,
没给"伸手就用的代码"。作为补缺口的第一步,把与栈无关的主心骨提升进了
`@pneuma-framework/host-kit`:

- `@pneuma-framework/host-kit/workspace` —— copy / list / hash / `diffTrees` /
  `isProtected` 树机制。
- `@pneuma-framework/host-kit/governed-change` —— `buildGovernedProposal`,一个
  闭包驱动、fail-closed 的提案骨架(Host 提供 `runAgent` / `isAgentTimeout` /
  `verify` / `observe`;框架拥有时序与门禁)。已对 no-change / protected-root /
  verify-failed / fail-closed-超时 等不变量做单测。

`examples/clean-room-release-host` 现在**消费** `host-kit/workspace` 而非自带副本——
证明路径是**消费**而非**重写**。更深的机制(code-agent debug loop、publish/rollback、
Preview Data Rehearsal)Host Kit 里**已存在**(`runHostKitCodeAgentDebugLoop`、
`publishVerifiedVersion`、`runPreviewDataRehearsal`),是 Host 下一步自然要采用的。

## 如何复现

```bash
bun install   # 仓库根

# 单独的 Generated App(Neon 可选)
bun run --cwd examples/clean-room-release-board verify

# Creation Host studio,确定性 lane(离线)
bun test --cwd examples/clean-room-release-host

# 完整真实流程:构建 studio,带 Codex + Neon + Vercel 启动,在浏览器驱动
bun run --cwd examples/clean-room-release-host build
DATABASE_URL=… VERCEL_TOKEN=… VERCEL_PROJECT=… \
PORT=8870 PNEUMA_AGENT=codex-app-server \
  bun run --cwd examples/clean-room-release-host serve
```

完整界面与边界说明见两个 example 的 README:
[`examples/clean-room-release-board/README.md`](../../examples/clean-room-release-board/README.md)、
[`examples/clean-room-release-host/README.md`](../../examples/clean-room-release-host/README.md)。

## 边界

框架应学习这次重建演练的 *形态* —— 生命周期词汇、scaffold `verify` 作为提案前
门禁、fail-closed 代码代理超时、结构化 publish/deploy 回执(含访问凭证)、以及
schema/bundle 观察。它不应吸收 release-operations 业务域、Bun/Hono/React/Drizzle/
Zod 技术栈,或把 Neon/Vercel 作为必选项。
