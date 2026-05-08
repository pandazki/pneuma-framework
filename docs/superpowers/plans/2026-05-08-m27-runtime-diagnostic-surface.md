# M27 Runtime Diagnostic Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Host-owned runtime composition easier to verify by promoting the smallest proven runtime context, health diagnostics, framework-route fallback, and readiness helper contracts.

**Architecture:** Keep the Creation Host in charge of process management and Host-owned routes. The framework only exposes stable runtime facts and helpers that downstream Hosts already reimplemented: runtime mode, explicit SQLite boot override, structured health diagnostics, a `tryHandle...` Bun fallback helper, and a polling readiness helper. This is a post-RC stabilization milestone, not a deployment platform or OAuth/session utility milestone.

**Tech Stack:** Bun test runner, TypeScript, `@pneuma-framework/runtime`, existing Bun.serve tests, markdown docs.

---

## File Structure

- Modify `packages/runtime/src/types.ts`: add `RuntimeMode`, `RuntimeBootOptions`, and diagnostic types.
- Modify `packages/runtime/src/runtime.ts`: accept `bootAppRuntime(config, options?)`, store runtime mode, apply explicit SQLite/audit/internal-token boot options, and expose diagnostics.
- Modify `packages/runtime/src/http.ts`: include diagnostics in `/api/health`; add `isFrameworkRuntimePath` and `tryHandleBunRuntimeRequest`.
- Create `packages/runtime/src/runtime-ready.ts`: `waitForRuntimeReady` helper and timeout error.
- Modify `packages/runtime/src/index.ts`: export new runtime helpers/types.
- Modify `packages/runtime/test/runtime.test.ts`: TDD coverage for mode/options/diagnostics/fallback.
- Create `packages/runtime/test/runtime-ready.test.ts`: readiness helper tests.
- Modify `docs/developer/runtime-composition.md` and `.zh-CN.md`: replace "mode is Host-owned in RC 0.1.1" with current M27 contract.
- Create `docs/architecture/milestone-27-snapshot.md` and `.zh-CN.md`: milestone evidence and boundary.
- Modify `docs/architecture/README.md`, `docs/architecture/roadmap.md`, `AGENTS.md`, `CLAUDE.md`: navigation/status updates.

## Task 1: Runtime Mode And Boot Options

**Files:**
- Modify: `packages/runtime/test/runtime.test.ts`
- Modify: `packages/runtime/src/types.ts`
- Modify: `packages/runtime/src/runtime.ts`
- Modify: `packages/runtime/src/index.ts`

- [x] **Step 1: Write failing tests**

Add tests showing:

```ts
const runtime = await bootAppRuntime(minimalConfig(), {
  mode: "published",
  sqlite_path: dbPath,
  audit_ndjson_path: auditPath,
  internal_http_token: "runtime-secret",
});
expect(runtime.mode).toBe("published");
expect(runtime.config.persistence).toEqual({ kind: "sqlite", path: dbPath });
expect(runtime.config.audit?.ndjson_path).toBe(auditPath);
expect(runtime.config.internal_http?.token).toBe("runtime-secret");
```

- [x] **Step 2: Verify red**

Run:

```bash
bun test packages/runtime/test/runtime.test.ts
```

Expected: FAIL because `bootAppRuntime` has no options and `runtime.mode` does not exist.

- [x] **Step 3: Implement minimal code**

Add `RuntimeMode = "preview" | "published"` and `RuntimeBootOptions` to `types.ts`. Implement `applyRuntimeBootOptions(config, options)` in `runtime.ts`, make `bootAppRuntime(config, options?)` pass the merged config into `AppRuntime`, and store `mode` on `AppRuntime` with default `"preview"`.

- [x] **Step 4: Verify green**

Run:

```bash
bun test packages/runtime/test/runtime.test.ts
```

Expected: PASS.

## Task 2: Health Diagnostics Surface

**Files:**
- Modify: `packages/runtime/test/runtime.test.ts`
- Modify: `packages/runtime/src/types.ts`
- Modify: `packages/runtime/src/runtime.ts`
- Modify: `packages/runtime/src/http.ts`

- [x] **Step 1: Write failing tests**

Assert `GET /api/health` returns:

```ts
{
  ok: true,
  app_id: APP,
  runtime_mode: "published",
  diagnostics: {
    runtime_mode: "published",
    persistence: {
      app_database: { kind: "sqlite", path: dbPath },
      history_database: { kind: "sqlite", path: dbPath },
      audit_sink: { kind: "ndjson", path: auditPath },
    },
    internal_http: { configured: true },
    definition: { overlay_warning_count: 0 },
    surface: { framework_api_prefix: "/api" },
  },
}
```

- [x] **Step 2: Verify red**

Run:

```bash
bun test packages/runtime/test/runtime.test.ts
```

Expected: FAIL because health lacks structured diagnostics.

- [x] **Step 3: Implement minimal diagnostics**

Add `runtime.diagnostics()` that returns serializable facts only. Do not expose raw internal tokens. Update `/api/health` to include `runtime_mode` and `diagnostics`.

- [x] **Step 4: Verify green**

Run:

```bash
bun test packages/runtime/test/runtime.test.ts
```

Expected: PASS.

## Task 3: Framework Route Fallback Helper

**Files:**
- Modify: `packages/runtime/test/runtime.test.ts`
- Modify: `packages/runtime/src/http.ts`
- Modify: `packages/runtime/src/index.ts`

- [x] **Step 1: Write failing tests**

Add tests:

```ts
const handled = await tryHandleBunRuntimeRequest(runtime, new Request("http://localhost/api/health"));
expect(handled?.status).toBe(200);
const hostHealth = await tryHandleBunRuntimeRequest(runtime, new Request("http://localhost/health"));
expect(hostHealth).toBeUndefined();
const hostApi = await tryHandleBunRuntimeRequest(runtime, new Request("http://localhost/api/dev-board"));
expect(hostApi).toBeUndefined();
```

- [x] **Step 2: Verify red**

Run:

```bash
bun test packages/runtime/test/runtime.test.ts
```

Expected: FAIL because the helper does not exist.

- [x] **Step 3: Implement minimal helper**

Export `isFrameworkRuntimePath(pathname)` and `tryHandleBunRuntimeRequest(runtime, req)`. Keep `asBunFetch(runtime)` behavior unchanged by falling back to a framework 404 when the helper returns `undefined`.

- [x] **Step 4: Verify green**

Run:

```bash
bun test packages/runtime/test/runtime.test.ts
```

Expected: PASS.

## Task 4: Runtime Ready Helper

**Files:**
- Create: `packages/runtime/test/runtime-ready.test.ts`
- Create: `packages/runtime/src/runtime-ready.ts`
- Modify: `packages/runtime/src/index.ts`

- [x] **Step 1: Write failing tests**

Cover success and timeout:

```ts
const result = await waitForRuntimeReady({ url, timeout_ms: 500, interval_ms: 10 });
expect(result.ok).toBe(true);
expect(result.health_url).toBe(`${url}/api/health`);

await expect(waitForRuntimeReady({
  url: "http://127.0.0.1:1",
  timeout_ms: 30,
  interval_ms: 5,
})).rejects.toThrow(RuntimeReadyTimeoutError);
```

- [x] **Step 2: Verify red**

Run:

```bash
bun test packages/runtime/test/runtime-ready.test.ts
```

Expected: FAIL because the helper does not exist.

- [x] **Step 3: Implement minimal helper**

Poll `GET /api/health` until HTTP 2xx and JSON `ok !== false`. Return `{ ok: true, url, health_url, attempts, elapsed_ms, body }`. Throw `RuntimeReadyTimeoutError` with attempts and last error on timeout.

- [x] **Step 4: Verify green**

Run:

```bash
bun test packages/runtime/test/runtime-ready.test.ts packages/runtime/test/runtime.test.ts
```

Expected: PASS.

## Task 5: Docs And Snapshot

**Files:**
- Modify: `docs/developer/runtime-composition.md`
- Modify: `docs/developer/runtime-composition.zh-CN.md`
- Create: `docs/architecture/milestone-27-snapshot.md`
- Create: `docs/architecture/milestone-27-snapshot.zh-CN.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/roadmap.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [x] **Step 1: Update docs**

Document M27 as runtime composition stabilization. Explicitly say it does not introduce OAuth/session utilities, Host-owned deployment orchestration, or a release tag.

- [x] **Step 2: Verify relative links**

Run the local markdown link checker over touched docs.

Expected: no broken relative links.

## Task 6: Final Verification And Commit

- [x] **Step 1: Run targeted runtime tests**

```bash
bun test packages/runtime/test/runtime.test.ts packages/runtime/test/runtime-ready.test.ts packages/runtime/test/constants.test.ts
```

- [x] **Step 2: Run typecheck**

```bash
bun run typecheck
```

- [x] **Step 3: Run full suite**

```bash
tmp_config=$(mktemp -d) && printf '{"auths":{}}\n' > "$tmp_config/config.json" && DOCKER_CONFIG="$tmp_config" bun test
```

- [x] **Step 4: Commit**

```bash
git add .
git commit -m "feat(runtime): add diagnostic composition surface"
```

---

## Self-Review

- Spec coverage: covers runtime mode, explicit SQLite/audit/internal-token boot options, health diagnostics, framework-route fallback, readiness polling, docs, and snapshot.
- Scope exclusions: no credential broker, OAuth provider abstraction, session store, cookie helpers, HostExtension, or `AgentBackend.runTurn`.
- Type consistency: public runtime options use existing snake_case style (`sqlite_path`, `audit_ndjson_path`, `internal_http_token`) to match `AppConfig`.
