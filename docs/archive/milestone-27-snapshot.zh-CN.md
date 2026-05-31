# Milestone 27 Snapshot 中文版 — Runtime Diagnostic Surface

**日期：** 2026-05-08  
**状态：** 作为 post-RC stabilization milestone 关闭。它不是 `pneuma-rc-0.1.4` release tag。  
**输入：** DevBoard Studio 的 runtime-composition 反馈：runtime mode、SQLite path 绑定、health/readiness 探测，以及 framework routes 与 Host routes 的干净组合。

## M27 证明了什么

M27 让 runtime composition 的边界变得可见，但没有把 framework 做成部署平台。

接受的形状是：

```text
Host-owned process manager
  -> bootAppRuntime(config, runtime boot options)
  -> /api/health diagnostics
  -> Host-owned routes composed with framework routes
  -> waitForRuntimeReady(url)
```

framework 现在给 Host 稳定的 facts 和 helpers。Host 仍然拥有 process spawning、preview/published lifecycle policy、version directory layout 和 deployment target。

## 关闭的反馈

| 反馈 | M27 结果 |
|---|---|
| Runtime mode 只是隐式 Host convention | 新增 `RuntimeMode = "preview" | "published"` 和 `runtime.mode`。 |
| SQLite path 绑定依赖 env/import 顺序 | 新增 `bootAppRuntime(config, { sqlite_path })`，Host 可以在 boot 时显式绑定 persistence。 |
| Audit path 和 internal token wiring 是隐式的 | 新增 `audit_ndjson_path` 和 `internal_http_token` boot options。 |
| `/api/health` 缺少 Host monitoring 所需 evidence | Health 现在包含 `runtime_mode` 和结构化 diagnostics：persistence、internal HTTP 配置、definition warnings、framework API prefix。 |
| `asBunFetch` 会用 framework 404 吃掉 Host-owned `/api/<domain>` routes | 新增 `tryHandleBunRuntimeRequest` 和 `isFrameworkRuntimePath`，Host 可以干净组合 routes。 |
| 每个 Host 都要手写 health polling | 新增 `waitForRuntimeReady` 和 `RuntimeReadyTimeoutError`。 |

## 边界决定

M27 不提供 credential broker、OAuth provider abstraction、cookie/session helper、process supervisor、Docker wrapper 或 deployment platform。

M27 也不决定跨 version 数据继承。文档里的模式仍然是 `isolated-version-data` 和 `carry-forward-with-receipt`；由 Host 选择。

## Developer-facing 变化

更新的 guide：

- [Runtime Composition](../developer/runtime-composition.md) / [中文版](../developer/runtime-composition.zh-CN.md)

新的 runtime helpers：

- `bootAppRuntime(config, options?)`
- `RuntimeMode`
- `RuntimeBootOptions`
- `runtime.diagnostics()`
- `tryHandleBunRuntimeRequest(runtime, req)`
- `isFrameworkRuntimePath(pathname)`
- `waitForRuntimeReady(options)`
- `RuntimeReadyTimeoutError`

## 验证

在 M27 worktree 中运行：

```bash
bun test packages/runtime/test/runtime.test.ts packages/runtime/test/runtime-ready.test.ts
bun test packages/runtime/test/runtime.test.ts packages/runtime/test/runtime-ready.test.ts packages/runtime/test/constants.test.ts
bun run typecheck
tmp_config=$(mktemp -d) && printf '{"auths":{}}\n' > "$tmp_config/config.json" && DOCKER_CONFIG="$tmp_config" bun test
```

最终结果：

- Runtime targeted tests：`27 pass`，`0 fail`，`87 expect() calls`。
- Runtime/constants targeted tests：`28 pass`，`0 fail`，`90 expect() calls`。
- Typecheck：通过。
- 使用临时 Docker config 的 full suite：`1230 pass`，`0 fail`，`4575 expect() calls`，覆盖 `185 files`。

## 下一步

建议顺序保持：

1. M28 — HostExtension / extension slot distribution primitive。
2. M29 — `AgentBackend.runTurn` 和 receipt automation。

M27 刻意先补 runtime composition 基座，因为 extension bundles 后面会需要可靠的 runtime mode、diagnostics、fallback routing 和 readiness evidence。
