# Milestone 34 Snapshot — Durable Assurance Cases

**日期：** 2026-05-09  
**状态：** 已作为 post-RC stabilization milestone 关闭。这不是 `pneuma-rc-0.1.4` release tag。  
**输入：** M32 创建了 `BuildChangeAssuranceCase`；M33 把它显示进 Reference Creation Host。M34 要验证这份 assurance 是否能在刷新后保留，并成为可检查的 Host state。

## M34 证明了什么

M34 为 Creation Host 增加了一个很窄的 `AssuranceCaseStore` 形状：

```text
Builder intent / publish action
  -> BuildChangeAssuranceCase
  -> <creation-host-workspace>/.pneuma/build-assurance-cases.json
  -> Workbench Assurance card and inspector tab
```

关键变化不是“做审计日志”。关键变化是：

```text
Host 可以记住为什么 Builder 被允许继续。
```

这对产品闭环很重要：刷新页面、稍后检查、交接给别人时，Host 仍能展示支持下一步的 readiness state、risk classification、blocking reasons 和 evidence references。

## Product Boundary

M34 保持边界收敛：

```text
Core owns the case shape, validation, and local file-backed store.
Host owns when to save, how to present, and which readiness states gate buttons.
Source evidence remains in the existing systems.
```

这个 store 属于 Creation Host workspace。它不是 Generated Application runtime database，不是通用 multi-tenant audit backend，也不是 marketplace artifact trust ledger。

## Implementation Surface

新增 core 文件：

- `packages/core/src/build-assurance-store.ts`
- `packages/core/test/build-assurance-store.test.ts`

更新 exports：

- `packages/core/src/index.ts`

更新 Reference Host：

- `examples/m16-reference-creation-host/host-server.ts`
- `examples/m16-reference-creation-host/static/app.js`
- `examples/m16-reference-creation-host/run.test.ts`

更新 guide：

- [Build Change Assurance](../developer/build-assurance.md)
- [中文版](../developer/build-assurance.zh-CN.md)

## Store Contract

v0 file-backed store 写入：

```text
<workspace>/.pneuma/build-assurance-cases.json
```

它支持：

- `saveCase(assuranceCase)`：validate 后按 `build_change_id` upsert；
- `getCase(build_change_id)`：读取单个 case；
- `listCases({ app_id, thread_id, readiness })`：按最近保存优先返回 filtered list；
- 文件缺失或损坏时 warning 后返回空状态。

Reference Host 会持久化：

- Priority Queue proposal -> `awaiting_approval`；
- Builder approval + post-apply check -> `verified`；
- publish health + rollout evidence -> `ready_to_publish`。

Host 也暴露：

```text
GET /api/host/projects/:appId/assurance
```

## Verification

Targeted commands：

```bash
bun test packages/core/test/build-assurance-store.test.ts
bun test examples/m16-reference-creation-host/run.test.ts
bun run typecheck
bun test
```

Targeted results：

- core store：`4 pass`，`0 fail`，`13 expect() calls`；
- M16 E2E：`1 pass`，`0 fail`，`37 expect() calls`。
- full suite：`1266 pass`，`0 fail`，`4730 expect() calls`。

测试证明：

- case 可以在 store reload 后保留；
- 按 `build_change_id` upsert 会保留最新 readiness；
- list 可以按 `app_id`、`thread_id` 和 `readiness` filter；
- invalid case 会在写入前被拒绝；
- 损坏的本地 store 文件会降级为空状态；
- Reference Host 可以通过 assurance endpoint 列出持久化的 proposal、approval 和 publish cases。

## Remaining Boundary

M34 不增加 compliance audit backend、hosted storage abstraction 或通用 UI component package。后续产品化路线可以再决定下游 Host 是否需要这些表面。

下一步默认不应该继续扩 persistence abstraction，而是继续收口真实 Builder + Build Agent control gaps：proposal diff clarity、recovery evidence、downstream adoption，或 Runtime Agent / product pressure。
