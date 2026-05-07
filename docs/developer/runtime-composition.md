# Runtime Composition Notes

**Audience:** Developers composing Host-owned endpoints with the framework runtime HTTP surface  
**Chinese version:** [runtime-composition.zh-CN.md](./runtime-composition.zh-CN.md)

This page documents the runtime composition conventions that surfaced during external DevBoard work.

## Runtime Mode Is Host-Owned In RC 0.1.1

RC 0.1.1 does not expose a first-class `RuntimeMode` enum. A Host may still choose to start separate preview and published runtimes, but the mode flag and data rules are Host-owned.

Recommended current practice:

```text
preview/dev runtime: additive, restartable, inspection-friendly
published/prod runtime: version-scoped, release-controlled, rollback-capable
```

If you add a Host-owned `--mode dev|prod` flag, treat it as a Host contract until a future framework API promotes runtime mode.

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
} from "@pneuma-framework/runtime";
```

This token shape is suitable for local Host-owned internal calls such as a runtime credential broker. It is not a public auth mechanism. Hosted multi-tenant deployments may need signed service identity, mTLS, or another internal channel.

## Service Markers

Templates have historically printed marker lines by hand. Prefer the core helpers:

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

RC 0.1.1 does not choose a universal cross-version data inheritance model. A Host should choose and document one of these modes:

| Mode | Meaning |
|---|---|
| `isolated-version-data` | Each published version owns its own data directory. Rollback returns to that version's data. |
| `carry-forward-with-receipt` | A new version starts from prior data plus an explicit migration/carry-forward receipt. |

Published version directories are intended to be release-controlled. Current runtime startup may still re-apply framework system tables in the SQLite file; do not treat this as business-data mutation.
