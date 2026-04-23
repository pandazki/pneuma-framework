# bookmarks-dogfood

一键跑起 `templates/bookmarks-core-domain`，证明 **核心域 → runtime → template → lifecycle → HTTP** 这条完整链路。

## 跑起来

```sh
bun run examples/bookmarks-dogfood/run.ts
```

默认会：
- 在系统临时目录里创建一个 workspace（启动时打印路径）
- 通过 `packages/core` 的 `LifecycleOrchestrator` 跑 `templates/bookmarks-core-domain/scripts/dev.sh`
- 观察 `##pneuma:ready` marker 之后打印服务地址

要指定 workspace（数据持久保留）或端口：

```sh
bun run examples/bookmarks-dogfood/run.ts \
  --workspace ~/.pneuma-bookmarks \
  --port 9000
```

## 玩玩

```sh
# 查框架元数据
curl http://127.0.0.1:8765/api/health
curl http://127.0.0.1:8765/api/operations

# 加一条
curl -X POST http://127.0.0.1:8765/api/operations/add_bookmark \
  -H 'content-type: application/json' \
  -d '{"input":{"url":"https://bun.sh","title":"Bun","notes":"TypeScript-first runtime"}}'

# 列出所有
curl http://127.0.0.1:8765/api/operations/list_bookmarks

# 尝试删除 —— 没 confirmed 会拿到 428 + impact disclosure
curl -X POST http://127.0.0.1:8765/api/operations/delete_bookmark \
  -H 'content-type: application/json' \
  -d '{"input":{"bookmark_id":{"kind":"row","table":"bookmarks","id":"bm-XXXXX"}}}'

# 带 confirmed 再发一次, 真删
curl -X POST http://127.0.0.1:8765/api/operations/delete_bookmark \
  -H 'content-type: application/json' \
  -d '{"input":{"bookmark_id":{"kind":"row","table":"bookmarks","id":"bm-XXXXX"}},"confirmed":true}'

# 查审计流 (NDJSON)
curl 'http://127.0.0.1:8765/api/events?limit=20'

# 用户隔离 (带 X-Pneuma-User-Id header)
curl -H 'x-pneuma-user-id: alice' \
  'http://127.0.0.1:8765/api/events?user_id=alice&limit=5'
```

浏览器里打开 `http://127.0.0.1:8765/` 有个极简 SPA：加表单 + 列表 + 删除（含 impact disclosure 弹窗）+ curl 片段。

## 这条链路里发生了什么

```
你在这里启动
    │
    ▼
LifecycleOrchestrator (packages/core)
    │ spawn scripts/dev.sh
    ▼
bun --hot server/app.ts (templates/bookmarks-core-domain)
    │ bootAppRuntime(config)
    ▼
AppRuntime (packages/runtime)
    │ 装配 B1 基础设施 + core-domain services
    ▼
┌─────────────────────────────────────────────┐
│ BunSqliteRowRepository   ← SQLite 持久化     │
│ NdjsonAuditSink          ← append-only 文件 │
│ BunSqliteAppHistoryStore ← rollback schema  │
│ StorageService           ← ref 完整性 / 级联 │
│ PolicyEvaluator          ← ADR-0007 规则    │
│ OperationExecutor        ← ADR-0018 pipeline │
│ QueryExecutor            ← ADR-0020 query   │
│ TransformRunner (idle)   ← ADR-0003 (没用到) │
│ AdapterInvoker (idle)    ← ADR-0005 (没用到) │
└─────────────────────────────────────────────┘
    │
    ▼
Bun.serve → 你的 curl / 浏览器
```

`##pneuma:ready` marker 一发出来，LifecycleOrchestrator 就把 `service-ready` 信息累计，`run.ts` 打印出来。Ctrl-C → SIGINT → 你的 `server/app.ts` 里的 `process.on("SIGINT")` 发 `##pneuma:stopping` + 关 SQLite → orchestrator 观察 exit code。

每一步都是**真代码**（不是 mock），workspace 里的 `data/rows.db` / `data/audit.ndjson` / `data/app-history.db` 重启后还在。

## 在 `pneuma-framework` CLI 下跑（可选）

无需 agent backend 的话，上面的 `run.ts` 最直接。如果想跟 opencode backend 协同（体验对话式）：

```sh
bun run packages/cli/src/index.ts dev templates/bookmarks-core-domain \
  --workspace ~/.pneuma-bookmarks \
  --port 8765 \
  --backend opencode
```

这会把 wire protocol 打开并连接 viewer，让 build-phase agent 能通过语义 tool API 跟这个 app 对话。**但**本模板没定义 agent runtime tools 的 viewer 绑定，viewer 只是静态 SPA，所以 agent 的作用比较有限——真正的对话式 builder 体验是 `ai-bookmarks` 模板（M4 产物）展示过的东西。

本例重点是 **core-domain 派生的 HTTP app 跟 packages/core lifecycle 契约**能无缝对接。
