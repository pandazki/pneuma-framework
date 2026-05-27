# Milestone 53 快照

**Milestone:** M53, Production Profile Host Integration
**状态：** 进行中，deterministic browser workbench 已验证
**日期：** 2026-05-28
**英文版：** [milestone-53-snapshot.md](./milestone-53-snapshot.md)

## 决策

M52 让 production Generated App profile 变得具体。M53 开始把它接回 Creation Host workflow。

第一步先做 test-first harness，现在已经补了一个小型 browser workbench：

```text
Builder 选择 production profile
  -> Host 把 scaffold 复制进 project workspace
  -> Host 准备 draft workspace
  -> agent 修改 generated source
  -> proposal 前执行 scaffold verify
  -> 通过检查的 draft 进入 proposal
  -> Builder approval apply v1
  -> Host 从 v1 启动 published runtime
```

这样能让后续浏览器工作台更诚实：如果 harness 都跑不通，UI 再漂亮也没有意义。

## 新增内容

新增 example：

```text
examples/production-profile-host/
```

关键文件：

- `src/host.ts`：基于 M52 scaffold 的小型 Creation Host harness。
- `production-profile-host.test.ts`：copy -> draft -> verify -> proposal -> apply -> published runtime 的端到端测试。
- `src/server.ts`：支持 create、agent draft、preview、approve、publish、rollback 的 browser/API server。
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

Host 验证：

- protected deployment/profile files 没有被改；
- generated app 自己的 `verify` command 通过；
- `/api/items` 的 runtime data 暴露 `environment`；
- apply 后的 v1 可以作为 published runtime 启动。

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
production-profile-host e2e: 1 browser test passed
production-generated-app-profile: typecheck passed, 14 tests passed, build passed
```

Browser/API smoke：

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
published runtime started
/api/items exposes environment: production / staging
rollback returns active_version_id to v0
```

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

Framework 不应该吸收：

- release-operations 领域；
- Bun/Hono/React/Drizzle/Zod/Neon 作为强制选择；
- harness 为避免提交 `node_modules` 使用的本地依赖链接；
- deterministic environment-lane patch 作为产品语义。

## 剩余工作

M53 还未关闭。仍需要：

1. 在这个 production profile 上跑真实 Codex/opencode code-agent；
2. real-agent evidence 需要复用同一套 scaffold checks 和 proposal gate；
3. real-agent evidence 通过后的最终 paperwork。
