# Runtime Composition Notes

**Audience:** Developers composing Host-owned endpoints with the framework runtime HTTP surface  
**Chinese version:** [runtime-composition.zh-CN.md](./runtime-composition.zh-CN.md)

This page documents the runtime composition conventions that surfaced during external DevBoard work.

## Runtime Mode And Boot Options

M27 exposes a first-class `RuntimeMode` for framework-visible diagnostics:

```ts
type RuntimeMode = "preview" | "published";
```

Use `bootAppRuntime(config, options?)` when a Host-owned entrypoint wants to bind process-level facts without making `app-config.ts` read environment variables in a fragile import order:

```ts
import { bootAppRuntime } from "@pneuma-framework/runtime/runtime";

const runtime = await bootAppRuntime(appConfig, {
  mode: "published",
  sqlite_path: "/data/app.db",
  audit_ndjson_path: "/data/audit.ndjson",
  internal_http_token: process.env.PNEUMA_INTERNAL_HTTP_TOKEN,
});
```

Recommended mode discipline:

```text
preview/dev runtime: additive, restartable, inspection-friendly
published/prod runtime: version-scoped, release-controlled, rollback-capable
```

The framework exposes the mode and storage facts. The Host still owns process management, version directory layout, and published-data inheritance policy.

## Health Diagnostics

`GET /api/health` includes a structured diagnostics block:

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

The diagnostics intentionally disclose whether internal HTTP is configured, but never disclose the raw internal token.

## Internal Runtime Authority

The framework uses:

```text
PNEUMA_INTERNAL_HTTP_TOKEN
x-pneuma-internal-token
```

to authorize framework-internal HTTP calls to a child runtime. Import the constants when you need to reference this contract from runtime-facing code:

```ts
import {
  PNEUMA_INTERNAL_HTTP_TOKEN_ENV,
  PNEUMA_INTERNAL_HTTP_TOKEN_HEADER,
} from "@pneuma-framework/runtime/constants";
```

This token shape is suitable for local Host-owned internal calls such as a runtime credential broker. It is not a public auth mechanism. Hosted multi-tenant deployments may need signed service identity, mTLS, or another internal channel.

## Service Markers

Templates have historically printed marker lines by hand. Prefer the core helpers:

```ts
import {
  printReadyMarker,
  printServiceReadyMarker,
  printStoppingMarker,
} from "@pneuma-framework/core/markers";

printServiceReadyMarker("api", "http://127.0.0.1:4100");
printReadyMarker();
printStoppingMarker();
```

The emitted lines are parseable by `parseMarker`.

## `asBunFetch` Ownership Boundary

`asBunFetch(runtime)` handles the framework API surface:

```text
GET  /api/health
GET  /api/config
GET  /api/operations
GET  /api/operations/:id
POST /api/operations/:id
GET  /api/events
GET  /api/events/stream
```

Host-owned routes such as `/health`, `/_internal/...`, `/api/<host-domain>`, or static app routes must be handled by the Host before falling through to `asBunFetch`.

When the Host wants a clean fallback instead of a framework 404, use `tryHandleBunRuntimeRequest`:

```ts
import { tryHandleBunRuntimeRequest } from "@pneuma-framework/runtime/http";

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

`asBunFetch(runtime)` keeps the old behavior: framework routes are handled, unknown routes return JSON 404.

## Readiness Polling

Use `waitForRuntimeReady` when a Host has started a child runtime process and needs to wait until its health endpoint is actually serving:

```ts
import { waitForRuntimeReady } from "@pneuma-framework/runtime/runtime-ready";

await waitForRuntimeReady({
  url: "http://127.0.0.1:4100",
  timeout_ms: 5_000,
  interval_ms: 100,
});
```

The helper polls `/api/health` by default and throws `RuntimeReadyTimeoutError` on timeout. It does not spawn processes or parse stdout markers; those remain Host-owned.

## Published Data Semantics

M27 does not choose a universal cross-version data inheritance model. A Host should choose and document one of these modes:

| Mode | Meaning |
|---|---|
| `isolated-version-data` | Each published version owns its own data directory. Rollback returns to that version's data. |
| `carry-forward-with-receipt` | A new version starts from prior data plus an explicit migration/carry-forward receipt. |

Published version directories are intended to be release-controlled. Current runtime startup may still re-apply framework system tables in the SQLite file; do not treat this as business-data mutation.
