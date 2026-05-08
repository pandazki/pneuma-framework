# Runtime 组合说明

**读者：** 正在把 Host-owned endpoint 与 framework runtime HTTP surface 组合起来的 Developer  
**English version:** [runtime-composition.md](./runtime-composition.md)

这页记录外部 DevBoard 实现过程中暴露出来的 runtime 组合约定。

## Runtime Mode 和 Boot Options

M27 暴露一等的 `RuntimeMode`，用于 framework-visible diagnostics：

```ts
type RuntimeMode = "preview" | "published";
```

当 Host-owned runtime entrypoint 需要绑定 process-level facts，但又不想让 `app-config.ts` 依赖脆弱的 env import 顺序时，使用 `bootAppRuntime(config, options?)`：

```ts
import { bootAppRuntime } from "@pneuma-framework/runtime";

const runtime = await bootAppRuntime(appConfig, {
  mode: "published",
  sqlite_path: "/data/app.db",
  audit_ndjson_path: "/data/audit.ndjson",
  internal_http_token: process.env.PNEUMA_INTERNAL_HTTP_TOKEN,
});
```

推荐 mode discipline：

```text
preview/dev runtime: additive, restartable, inspection-friendly
published/prod runtime: version-scoped, release-controlled, rollback-capable
```

framework 暴露 mode 和 storage facts。Host 仍然拥有 process management、version directory layout 和 published-data inheritance policy。

## Health Diagnostics

`GET /api/health` 包含结构化 diagnostics block：

```json
{
  "ok": true,
  "app_id": "my-app",
  "runtime_mode": "published",
  "diagnostics": {
    "runtime_mode": "published",
    "persistence": {
      "app_database": { "kind": "sqlite", "path": "/data/app.db" },
      "history_database": { "kind": "sqlite", "path": "/data/app.db" },
      "audit_sink": { "kind": "ndjson", "path": "/data/audit.ndjson" }
    },
    "internal_http": { "configured": true },
    "definition": { "overlay_warning_count": 0, "overlay_warnings": [] },
    "surface": { "framework_api_prefix": "/api" }
  }
}
```

diagnostics 会披露 internal HTTP 是否已配置，但永远不披露 raw internal token。

## 内部 Runtime Authority

framework 使用：

```text
PNEUMA_INTERNAL_HTTP_TOKEN
x-pneuma-internal-token
```

来授权 framework-internal HTTP calls 访问 child runtime。runtime-facing 代码需要引用该约定时，请导入常量：

```ts
import {
  PNEUMA_INTERNAL_HTTP_TOKEN_ENV,
  PNEUMA_INTERNAL_HTTP_TOKEN_HEADER,
} from "@pneuma-framework/runtime";
```

这个 token 形状适合本地 Host-owned internal call，例如 runtime credential broker。它不是 public auth 机制。hosted multi-tenant 部署可能需要 signed service identity、mTLS 或其他 internal channel。

## Service Markers

历史模板会手写 marker lines。现在优先使用 core helper：

```ts
import {
  printReadyMarker,
  printServiceReadyMarker,
  printStoppingMarker,
} from "@pneuma-framework/core";

printServiceReadyMarker("api", "http://127.0.0.1:4100");
printReadyMarker();
printStoppingMarker();
```

这些输出可以被 `parseMarker` 解析。

## `asBunFetch` 边界

`asBunFetch(runtime)` 处理 framework API surface：

```text
GET  /api/health
GET  /api/config
GET  /api/operations
GET  /api/operations/:id
POST /api/operations/:id
GET  /api/events
GET  /api/events/stream
```

Host-owned routes，例如 `/health`、`/_internal/...`、`/api/<host-domain>` 或静态 app routes，需要由 Host 在 fallback 到 `asBunFetch` 之前处理。

如果 Host 想要干净的 fallback，而不是让 framework 返回 404，使用 `tryHandleBunRuntimeRequest`：

```ts
import { tryHandleBunRuntimeRequest } from "@pneuma-framework/runtime";

Bun.serve({
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return Response.json({ ok: true });
    if (url.pathname.startsWith("/_internal/")) return handleInternal(req);

    const frameworkResponse = await tryHandleBunRuntimeRequest(runtime, req);
    if (frameworkResponse) return frameworkResponse;

    return handleHostRoute(req);
  },
});
```

`asBunFetch(runtime)` 保持旧行为：framework routes 会被处理，未知 routes 返回 JSON 404。

## Readiness Polling

当 Host 已经启动 child runtime process，并且需要等待 health endpoint 真正可用时，使用 `waitForRuntimeReady`：

```ts
import { waitForRuntimeReady } from "@pneuma-framework/runtime";

await waitForRuntimeReady({
  url: "http://127.0.0.1:4100",
  timeout_ms: 5_000,
  interval_ms: 100,
});
```

helper 默认轮询 `/api/health`，超时时抛 `RuntimeReadyTimeoutError`。它不负责 spawn process，也不解析 stdout markers；这些仍是 Host-owned。

## Published Data Semantics

M27 不选择唯一的跨 version 数据继承模型。Host 应选择并记录其中一种：

| Mode | 含义 |
|---|---|
| `isolated-version-data` | 每个 published version 拥有自己的 data directory。Rollback 回到该 version 的数据。 |
| `carry-forward-with-receipt` | 新 version 从旧数据出发，并留下显式 migration / carry-forward receipt。 |

Published version directory 的目标是 release-controlled。当前 runtime 启动时仍可能在 SQLite 文件中重新应用 framework system tables；这不应被视为业务数据 mutation。
