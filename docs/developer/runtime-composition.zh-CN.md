# Runtime 组合说明

**读者：** 正在把 Host-owned endpoint 与 framework runtime HTTP surface 组合起来的 Developer  
**English version:** [runtime-composition.md](./runtime-composition.md)

这页记录外部 DevBoard 实现过程中暴露出来的 runtime 组合约定。

## Runtime Mode 在 RC 0.1.1 中仍是 Host-owned

RC 0.1.1 不暴露一等的 `RuntimeMode` enum。Host 仍然可以分别启动 preview runtime 和 published runtime，但 mode flag 和数据纪律属于 Host 自己的 contract。

当前推荐做法：

```text
preview/dev runtime: additive, restartable, inspection-friendly
published/prod runtime: version-scoped, release-controlled, rollback-capable
```

如果你加入 Host-owned `--mode dev|prod` flag，在未来 framework API 提升 runtime mode 之前，请把它视为 Host contract。

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

```ts
const apiFetch = asBunFetch(runtime);

Bun.serve({
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return Response.json({ ok: true });
    if (url.pathname.startsWith("/_internal/")) return handleInternal(req);
    return apiFetch(req);
  },
});
```

## Published Data Semantics

RC 0.1.1 不选择唯一的跨 version 数据继承模型。Host 应选择并记录其中一种：

| Mode | 含义 |
|---|---|
| `isolated-version-data` | 每个 published version 拥有自己的 data directory。Rollback 回到该 version 的数据。 |
| `carry-forward-with-receipt` | 新 version 从旧数据出发，并留下显式 migration / carry-forward receipt。 |

Published version directory 的目标是 release-controlled。当前 runtime 启动时仍可能在 SQLite 文件中重新应用 framework system tables；这不应被视为业务数据 mutation。
