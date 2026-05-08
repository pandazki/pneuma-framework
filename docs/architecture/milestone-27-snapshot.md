# Milestone 27 Snapshot — Runtime Diagnostic Surface

**Date:** 2026-05-08  
**Status:** Closed as a post-RC stabilization milestone. This is not a `pneuma-rc-0.1.4` release tag.  
**Input:** DevBoard Studio runtime-composition feedback: runtime mode, SQLite path binding, health/readiness probing, and clean framework-vs-Host route fallback.

## What M27 Proved

M27 made the runtime composition seam visible without turning the framework into a deployment platform.

The accepted shape is:

```text
Host-owned process manager
  -> bootAppRuntime(config, runtime boot options)
  -> /api/health diagnostics
  -> Host-owned routes composed with framework routes
  -> waitForRuntimeReady(url)
```

The framework now gives Hosts stable facts and helpers. The Host still owns process spawning, preview/published lifecycle policy, version directory layout, and deployment target.

## Closed Findings

| Finding | M27 result |
|---|---|
| Runtime mode was only implicit Host convention | Added `RuntimeMode = "preview" | "published"` and `runtime.mode`. |
| SQLite path binding depended on env/import order | Added `bootAppRuntime(config, { sqlite_path })` so a Host can bind persistence explicitly at boot. |
| Audit path and internal token wiring were implicit | Added `audit_ndjson_path` and `internal_http_token` boot options. |
| `/api/health` did not expose enough evidence for Host monitoring | Health now includes `runtime_mode` and structured diagnostics for persistence, internal HTTP configuration, definition warnings, and framework API prefix. |
| `asBunFetch` swallowed Host-owned `/api/<domain>` routes with framework 404 | Added `tryHandleBunRuntimeRequest` and `isFrameworkRuntimePath` so a Host can compose routes cleanly. |
| Every Host hand-wrote health polling | Added `waitForRuntimeReady` and `RuntimeReadyTimeoutError`. |

## Boundary Decisions

M27 does not provide a credential broker, OAuth provider abstraction, cookie/session helper, process supervisor, Docker wrapper, or deployment platform.

M27 also does not decide cross-version data inheritance. The documented modes remain `isolated-version-data` and `carry-forward-with-receipt`; the Host chooses one.

## Developer-Facing Changes

Updated guide:

- [Runtime Composition](../developer/runtime-composition.md) / [中文版](../developer/runtime-composition.zh-CN.md)

New runtime helpers:

- `bootAppRuntime(config, options?)`
- `RuntimeMode`
- `RuntimeBootOptions`
- `runtime.diagnostics()`
- `tryHandleBunRuntimeRequest(runtime, req)`
- `isFrameworkRuntimePath(pathname)`
- `waitForRuntimeReady(options)`
- `RuntimeReadyTimeoutError`

## Verification

Commands run from the M27 worktree:

```bash
bun test packages/runtime/test/runtime.test.ts packages/runtime/test/runtime-ready.test.ts
bun test packages/runtime/test/runtime.test.ts packages/runtime/test/runtime-ready.test.ts packages/runtime/test/constants.test.ts
bun run typecheck
tmp_config=$(mktemp -d) && printf '{"auths":{}}\n' > "$tmp_config/config.json" && DOCKER_CONFIG="$tmp_config" bun test
```

Final results:

- Runtime targeted tests: `27 pass`, `0 fail`, `87 expect() calls`.
- Runtime/constants targeted tests: `28 pass`, `0 fail`, `90 expect() calls`.
- Typecheck: passed.
- Full suite with a temporary Docker config: `1230 pass`, `0 fail`, `4575 expect() calls` across `185 files`.

## Next

Recommended sequence remains:

1. M28 — HostExtension / extension slot distribution primitive.
2. M29 — `AgentBackend.runTurn` and receipt automation.

M27 intentionally prepared the runtime composition base before HostExtension, because extension bundles will need reliable runtime mode, diagnostics, fallback routing, and readiness evidence.
