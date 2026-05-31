# Milestone 53 快照

**Milestone:** M53, Production Profile Host Integration
**状态：** 已关闭，deterministic browser workbench 和真实 Codex lane 已验证
**日期：** 2026-05-28
**英文版：** [milestone-53-snapshot.md](./milestone-53-snapshot.md)

## 决策

M52 让 production Generated App profile 变得具体。M53 开始把它接回 Creation Host workflow。

第一步先做 test-first harness，现在已经补了一个小型 browser workbench：

```text
Builder 选择 production profile
  -> Host 把 scaffold 复制进 project workspace
  -> 完整 v0 可以立刻 preview 或 publish
  -> Host 准备 draft workspace
  -> deterministic 或真实 Codex code agent 修改 generated source
  -> proposal 前执行 scaffold verify
  -> 通过检查的 draft 进入 proposal
  -> Builder approval apply v1
  -> Host 从 v1 启动本地 published runtime，或创建 Vercel production deployment
```

这样能让后续浏览器工作台更诚实：如果 harness 都跑不通，UI 再漂亮也没有意义。

M53 也修正了产品语义：profile 实例化后得到的是完整的 `v0` Generated Application。Builder 不需要先问 agent，也可以直接 preview 或 publish v0。Agent 工作是后续演进到经过检查的 vNext proposal，不是第一次发布的前置条件。

## 新增内容

新增 example：

```text
examples/production-profile-host/
```

关键文件：

- `src/host.ts`：基于 M52 scaffold 的小型 Creation Host harness。
- `production-profile-host.test.ts`：copy -> draft -> verify -> proposal -> apply -> published runtime 的端到端测试。
- `src/server.ts`：支持 create、agent draft、preview、approve、publish、rollback 的 browser/API server。
- `src/production-codex-agent.ts`：真实修改 generated source 的 Codex app-server lane。
- `src/vercel-api-deploy.ts`：Host-owned Vercel REST API deploy adapter，用于云端 production publish。
- `src/ui/*`：双语浅色产品 UI，用来展示 profile workflow。
- `playwright.config.ts` 和 `e2e/browser-flow.pw.ts`：覆盖 profile lifecycle 的 click-level browser E2E。
- `README.md`：说明它是 harness，不是最终 browser product。

当前 deterministic agent 会把 release environment tracking 加到：

- `src/shared/contracts.ts`
- `src/shared/demo-data.ts`
- `src/db/schema.ts`
- `drizzle/0000_initial_release_operations.sql`
- `src/server/repository.ts`
- `src/client/App.tsx`

真实 Codex app-server lane 也完成了同一个需求，并产出更完整的 product-source patch：

- shared Zod contract 和 types；
- demo data 和 scaffold demo stories；
- Drizzle schema 和 SQL migration；
- memory/Drizzle repository mapping；
- React UI 和 styling；
- tests 和 profile evidence。

Host 验证：

- protected deployment/profile files 没有被改；
- generated app 自己的 `verify` command 通过；
- `/api/items` 的 runtime data 暴露 `environment`；
- apply 后的 v1 可以作为 published runtime 启动。
- published runtime 可以通过 `PNEUMA_PRODUCTION_PROFILE_DATABASE_URL` 接入 Neon；preview 仍然使用 memory-backed sandbox，避免预览操作写入生产数据库。
- publish 可以通过 `PNEUMA_PRODUCTION_PROFILE_DEPLOY=vercel-api` 和 `PNEUMA_VERCEL_TOKEN` 切到 Vercel production deployment。

## 验证

```bash
bun run --cwd examples/production-profile-host build
bun test --cwd examples/production-profile-host
bun run --cwd examples/production-profile-host e2e
bun run --cwd examples/production-generated-app-profile verify
```

结果：

```text
production-profile-host: 2 pass, 0 fail
production-profile-host Vercel API handshake: mocked REST deployment passed
production-profile-host e2e: 1 browser test passed
production-generated-app-profile: typecheck passed, 14 tests passed, build passed
```

Browser/API smoke：

```text
POST /api/reset
POST /api/projects
POST /api/preview
POST /api/publish
POST /api/agent/draft
POST /api/preview
POST /api/approve
POST /api/publish
GET  published_url/api/items
POST /api/rollback
```

观察结果：

```text
v0 preview 和 v0 publish 在 agent 演进前即可工作
published runtime started
/api/items exposes environment: production / staging
rollback returns active_version_id to v0
```

Vercel API 云端发布 smoke：

```text
PNEUMA_PRODUCTION_PROFILE_DEPLOY=vercel-api
PNEUMA_PRODUCTION_PROFILE_DATABASE_URL=<Neon URL>
PNEUMA_VERCEL_TOKEN=<token>
POST /api/projects
POST /api/publish
GET  https://production-generated-app-profile.vercel.app/api/health
GET  https://production-generated-app-profile.vercel.app/api/items
```

观察结果：

```text
Vercel production deployment 返回 READY。
/api/health reports persistence: neon。
/api/items 从 Neon 返回 seeded release operation rows。
```

真实 Codex app-server smoke：

```bash
PORT=8900 PNEUMA_PRODUCTION_PROFILE_AGENT=codex-app-server \
  bun run --cwd examples/production-profile-host serve
```

然后：

```text
POST /api/reset
POST /api/projects
POST /api/agent/draft
POST /api/preview
POST /api/approve
POST /api/publish
GET  published_url/api/items
POST /api/rollback
```

观察结果：

```text
Codex app-server 修改了 draft workspace。
Codex 自己跑通 bun run verify。
Host buildProposal 接受了 draft。
Published runtime 暴露 environment values: production / staging / development。
Rollback 把 project 恢复到 v0。
```

一次真实 agent 运行暴露了一个有价值的 scaffold authoring 经验：Vite 可能在退出码为 0 时仍打印 Node-version warning。现在 code-agent prompt 已明确把这类 warning 视为非阻塞环境噪音，避免 agent 在产品验证已通过时偏离到本机 runtime 修复。

截图：

```text
/tmp/pneuma-m53-production-profile-host-e2e.png
```

## 边界

Framework 应该吸收的经验：

- production profiles 需要先有 Host harness，再做 browser workflows；
- scaffold `verify` 可以作为 pre-proposal gate；
- protected deployment files 需要 fail-closed checks；
- published runtime smoke 应该成为 profile integration proof 的一部分。
- cloud deployment 应该是 Host-owned adapter，并返回结构化 receipt，而不是 Vercel CLI wrapper。

Framework 不应该吸收：

- release-operations 领域；
- Bun/Hono/React/Drizzle/Zod/Neon 作为强制选择；
- harness 为避免提交 `node_modules` 使用的本地依赖链接；
- deterministic environment-lane patch 作为产品语义。

## 关闭

M53 作为 production-profile scaffold integration slice 已关闭。

下一个 slice 应该基于这个稳定 profile，继续组装更完整的产品型 Creation Host flow。M53 不把 Bun/Hono/React/Drizzle/Zod/Neon 变成 framework 默认选型；它证明 Developer 可以准备这样的 profile，用小 demo 验证它，再让真实 code agent 在同一个 pre-proposal verification gate 后面演进它。
