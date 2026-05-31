# M17 Security and Architecture Acceptance Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the RC-blocking security gaps and make the accepted architecture decisions durable before any release-candidate review.

**Architecture:** M17 is a gate, not a feature milestone. First harden runtime trust boundaries with test-first patches, then record the accepted Operation-centered / four-artifact model and lifecycle subsystem contract, then update the roadmap so open-ended app pressure is mandatory before RC.

**Tech Stack:** Bun test runner, TypeScript, `packages/runtime`, `packages/core`, `docs/architecture` ADR/spec/snapshot docs.

---

## Scope

M17 accepts these owner-level decisions:

1. ADR-0029 is accepted as the framework model replacement: Operation is the core primitive; lifecycle scripts are a runtime subsystem.
2. The four-artifact model is accepted: Framework -> Creation Host -> Generated Application -> Published Application.
3. RC is blocked until an open-ended app pressure test proves the framework is not only tuned for schema/list/queue apps.
4. Concrete adapter/provider packages must not be presented as framework core; they are reference integrations unless explicitly promoted by ADR.
5. Lifecycle script protocol needs a dedicated ADR before RC.

M17 also fixes these RC-blocking runtime issues:

1. Public HTTP must not allow `x-pneuma-user-id: framework` to create framework/system authority.
2. GET/query Operation invocation and View source visibility must default to restricted.
3. Definition rollback must not be externally reachable and must leave explicit recovery evidence if execution fails after a backup is written.

Out of scope for M17:

- implementing the open-ended app pressure test itself;
- moving package directories physically;
- building vanilla SDK or second backend;
- production IAM / multi-tenant auth.

---

## File Map

- Modify: `packages/runtime/src/types.ts`
  - Add optional runtime-internal HTTP token config.
- Modify: `packages/runtime/src/http.ts`
  - Reject public `framework` identity spoofing.
  - Permit framework/system context only through a signed internal token.
  - Make Operation invoke checks fail closed by default.
- Modify: `packages/core/src/lifecycle.ts`
  - Generate and forward the internal HTTP token to dev scripts.
  - Use the token when calling framework-internal runtime Operations.
- Modify: `packages/core/src/env.ts`
  - Forward `PNEUMA_INTERNAL_HTTP_TOKEN` to app processes.
- Modify: template server configs under `templates/*/server/config.ts`
  - Read `PNEUMA_INTERNAL_HTTP_TOKEN` into runtime config where templates boot `AppRuntime`.
- Modify tests:
  - `packages/runtime/test/runtime.test.ts`
  - `packages/runtime/test/api-config.test.ts`
  - `packages/core/test/tools/definition-apply.test.ts`
  - rollback-focused tests in `packages/runtime/test/framework-operations.test.ts` if recovery evidence changes.
- Create: `docs/architecture/adr/0030-lifecycle-subsystem-contract.md`
  - Durable lifecycle protocol ADR.
- Modify:
  - `docs/architecture/README.md`
  - `docs/architecture/roadmap.md`
  - `docs/architecture/OPEN-QUESTIONS.md`
  - `docs/architecture/spec/creation-host-model.md`
  - `docs/architecture/spec/creation-host-model.zh-CN.md`
  - `AGENTS.md`
  - `CLAUDE.md`
  - `examples/README.md`

---

## Task 1: Block Public HTTP Framework Identity Spoofing

**Files:**
- Modify: `packages/runtime/src/types.ts`
- Modify: `packages/runtime/src/http.ts`
- Modify: `packages/runtime/test/runtime.test.ts`

- [ ] **Step 1: Write the failing spoofing test**

Add a test near the existing framework-internal HTTP tests in `packages/runtime/test/runtime.test.ts`:

```ts
test("framework-internal definition Operations reject spoofed framework HTTP identity", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pneuma-runtime-framework-spoof-"));
  const runtime = await bootAppRuntime(
    minimalConfig({ history: { sqlite_path: join(dir, "history.sqlite") } }),
  );
  try {
    const resp = await handleHttp(
      runtime,
      mkReq("POST", "/api/operations/add_table_column", {
        body: {
          input: {
            table_id: "bookmarks",
            column_name: "tags",
            cell_type: { kind: "primitive", of: "Text" },
          },
        },
        userId: "framework",
      }),
    );

    expect(resp.status).toBe(403);
    expect((resp.body as { error: string }).error).toBe("policy_denied");
    const entries = await runtime.history.listEntries(APP, { direction: "desc", limit: 5 });
    expect(entries).toHaveLength(0);
  } finally {
    await runtime.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/runtime/test/runtime.test.ts --filter "spoofed framework HTTP identity"
```

Expected before implementation:

```text
FAIL: expected 403, received 200
```

- [ ] **Step 3: Add internal token config**

Extend `AppConfig` in `packages/runtime/src/types.ts`:

```ts
  /** Runtime-private HTTP authority. Public clients must never know this. */
  readonly internal_http?: {
    readonly token?: string;
  };
```

- [ ] **Step 4: Harden `buildCtx`**

In `packages/runtime/src/http.ts`, implement this behavior:

```ts
const FRAMEWORK_USER_ID = "framework";
const INTERNAL_TOKEN_HEADER = "x-pneuma-internal-token";

function hasValidInternalToken(runtime: AppRuntime, req: HttpRequestContext): boolean {
  const expected = runtime.config.internal_http?.token;
  if (!expected) return false;
  const actual = req.headers.get(INTERNAL_TOKEN_HEADER);
  return actual === expected;
}
```

Then change `buildCtx` so:

- no user id -> anonymous UI context;
- `x-pneuma-user-id: framework` without valid internal token -> normal user context or explicit denial;
- valid internal token + `framework` -> `invoked_via: "system"` and `user.id = "framework"`.

Preferred implementation for the spoofed case: throw `PolicyDeniedError` with a deny decision so the HTTP response is a normal 403.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
bun test packages/runtime/test/runtime.test.ts --filter "spoofed framework HTTP identity"
```

Expected:

```text
1 pass
0 fail
```

- [ ] **Step 6: Add valid internal-token test**

Replace the existing test named `framework-internal definition Operations invoked by framework are recorded as framework history` so it no longer uses only `userId: "framework"`. Configure:

```ts
minimalConfig({
  history: { sqlite_path: join(dir, "history.sqlite") },
  internal_http: { token: "test-internal-token" },
})
```

and call `mkReq` with headers:

```ts
headers: {
  "x-pneuma-user-id": "framework",
  "x-pneuma-internal-token": "test-internal-token",
}
```

Expected: request succeeds and history actor remains framework.

- [ ] **Step 7: Run runtime tests**

Run:

```bash
bun test packages/runtime/test/runtime.test.ts
```

Expected:

```text
0 fail
```

- [ ] **Step 8: Commit**

```bash
git add packages/runtime/src/types.ts packages/runtime/src/http.ts packages/runtime/test/runtime.test.ts
git commit -m "fix: reject spoofed framework http identity"
```

---

## Task 2: Route Framework Internal Calls Through the Token

**Files:**
- Modify: `packages/core/src/env.ts`
- Modify: `packages/core/src/lifecycle.ts`
- Modify: `templates/bookmarks-core-domain/server/config.ts`
- Modify: `templates/knowledge-inbox-core-domain/server/config.ts`
- Modify: `templates/ai-bookmarks-core-domain/server/config.ts`
- Modify: `templates/weekly-linear-digest/server/config.ts`
- Modify: `packages/core/test/tools/definition-apply.test.ts`

- [ ] **Step 1: Write failing lifecycle bridge test**

In `packages/core/test/tools/definition-apply.test.ts`, update one existing test that records `lastOperationUserId` to also record `lastInternalToken`:

```ts
let lastOperationUserId: string | null = null;
let lastInternalToken: string | null = null;

lastOperationUserId = req.headers.get("x-pneuma-user-id");
lastInternalToken = req.headers.get("x-pneuma-internal-token");
```

Assert:

```ts
expect(lastOperationUserId).toBe("framework");
expect(lastInternalToken).toBeTruthy();
expect(lastInternalToken).toBe(process.env.PNEUMA_INTERNAL_HTTP_TOKEN ?? lastInternalToken);
```

If the test cannot observe process env, assert only that `lastInternalToken` is a non-empty string.

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts --filter "definition.apply"
```

Expected before implementation: assertion fails because no `x-pneuma-internal-token` header is sent.

- [ ] **Step 3: Generate and forward token in lifecycle**

In `packages/core/src/lifecycle.ts`, generate one internal token per orchestrator instance:

```ts
private readonly internalHttpToken = randomUUID();
```

When building script env, forward:

```ts
PNEUMA_INTERNAL_HTTP_TOKEN: this.internalHttpToken
```

When calling definition operations, send:

```ts
"x-pneuma-user-id": "framework",
"x-pneuma-internal-token": this.internalHttpToken,
```

- [ ] **Step 4: Add env builder support**

In `packages/core/src/env.ts`, add optional support for:

```ts
internalHttpToken?: string;
```

and emit:

```ts
if (opts.internalHttpToken) out.PNEUMA_INTERNAL_HTTP_TOKEN = opts.internalHttpToken;
```

- [ ] **Step 5: Wire templates**

In each runtime template config that exports an `AppConfig`, add:

```ts
  internal_http: {
    token: process.env.PNEUMA_INTERNAL_HTTP_TOKEN,
  },
```

Only add it where the template boots `@pneuma-framework/runtime`.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts --filter "definition.apply"
bun test packages/runtime/test/runtime.test.ts
```

Expected:

```text
0 fail
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/env.ts packages/core/src/lifecycle.ts templates/*/server/config.ts packages/core/test/tools/definition-apply.test.ts
git commit -m "fix: route framework runtime calls through internal token"
```

---

## Task 3: Make GET Query and View Source Invocation Fail Closed

**Files:**
- Modify: `packages/runtime/src/http.ts`
- Modify: `packages/runtime/test/runtime.test.ts`
- Modify: `packages/runtime/test/api-config.test.ts`

- [ ] **Step 1: Write failing anonymous query test**

In `packages/runtime/test/runtime.test.ts`, add:

```ts
test("query-backed Operations without explicit invoke policy reject anonymous GET even when app default is public", async () => {
  const policy = new PolicySet({ app_id: APP });
  const runtime = await bootAppRuntime(minimalConfig({ policy }));
  try {
    const resp = await handleHttp(runtime, mkReq("GET", "/api/operations/list_bookmarks"));
    expect(resp.status).toBe(403);
    expect((resp.body as { error: string }).error).toBe("policy_denied");
  } finally {
    await runtime.close();
  }
});
```

- [ ] **Step 2: Write failing view visibility test**

In `packages/runtime/test/api-config.test.ts`, add a config where a View has read policy but its source query Operation has no invoke rule. Assert `/api/config` does not include the View for anonymous users.

Expected test shape:

```ts
expect(body.views.some((view) => view.id === "bookmarks_view")).toBe(false);
```

- [ ] **Step 3: Verify RED**

Run:

```bash
bun test packages/runtime/test/runtime.test.ts --filter "query-backed Operations without explicit invoke policy"
bun test packages/runtime/test/api-config.test.ts --filter "source query Operation has no invoke rule"
```

Expected before implementation: at least one test fails because default public allows access.

- [ ] **Step 4: Implement restricted default**

In `packages/runtime/src/http.ts`, change `operationInvokeDecision`:

```ts
return runtime.policyEvaluator.check(
  "invoke",
  Resources.operation(opId),
  ctx,
  {
    input: (input as Record<string, unknown>) ?? undefined,
    resourceDefaultAccess: "restricted",
  },
);
```

This covers both GET query execution and View source visibility because both paths call `operationInvokeDecision`.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
bun test packages/runtime/test/runtime.test.ts packages/runtime/test/api-config.test.ts
```

Expected:

```text
0 fail
```

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/http.ts packages/runtime/test/runtime.test.ts packages/runtime/test/api-config.test.ts
git commit -m "fix: fail closed for query operation invoke checks"
```

---

## Task 4: Make Rollback Failure Observable and Keep It Lifecycle-Only

**Files:**
- Modify: `packages/runtime/src/framework-operations.ts`
- Modify: `packages/runtime/test/framework-operations.test.ts`
- Modify: `docs/architecture/OPEN-QUESTIONS.md`

- [ ] **Step 1: Write failing recovery evidence test**

In `packages/runtime/test/framework-operations.test.ts`, add a test-specific failing storage wrapper around `saveRowUnchecked` or `deleteRow` during rollback execution. The test should:

1. create a rollback backup;
2. force the handler to fail after backup but before successful rollback history;
3. assert app history contains a `definition_rollback_failed` snapshot with:

```ts
{
  kind: "definition_rollback_failed",
  target_history_version: target,
  backup_history_version: expect.any(Number),
  recovery: "manual_repair_required"
}
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/runtime/test/framework-operations.test.ts --filter "definition.rollback.execute records failure evidence"
```

Expected before implementation: no failure evidence entry is appended.

- [ ] **Step 3: Implement failure evidence**

In `createDefinitionRollbackExecuteHandler`, after backup append, wrap the destructive mutation block in `try/catch`.

On catch, append history:

```ts
await history.append({
  app_id: ctx.app_id,
  history_type: "snapshot",
  payload: {
    kind: "definition_rollback_failed",
    target_history_version: validation.target_history_version,
    previous_history_version: validation.current_history_version,
    backup_history_version: backup.version,
    error: errorMessage(err),
    recovery: "manual_repair_required",
    impact: validation.impact,
  },
  is_ai_generated: ctx.invoked_via === "agent",
  actor_id: ctx.user?.id ?? "anonymous",
  actor_kind: actorKindFromInvokedVia(ctx.invoked_via),
  description: `definition rollback failed after backup for target history version ${validation.target_history_version}`,
  operation_scope: operationScopeForRollbackImpact(validation.impact),
});
throw err;
```

Keep the successful rollback history append unchanged.

- [ ] **Step 4: Document atomicity boundary**

In `docs/architecture/OPEN-QUESTIONS.md`, add a short item:

```md
### Rollback transactionality

M17 blocks public HTTP access to rollback execute and records failure evidence after backup,
but full crash-proof atomic rollback still requires a storage transaction boundary.
Before production release, choose either SQLite transaction support for unified app.db
or keep destructive rollback explicitly non-production.
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
bun test packages/runtime/test/framework-operations.test.ts --filter "definition.rollback.execute"
```

Expected:

```text
0 fail
```

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/framework-operations.ts packages/runtime/test/framework-operations.test.ts docs/architecture/OPEN-QUESTIONS.md
git commit -m "fix: record rollback failure recovery evidence"
```

---

## Task 5: Accept the Architecture Model Explicitly

**Files:**
- Modify: `docs/architecture/spec/creation-host-model.md`
- Modify: `docs/architecture/spec/creation-host-model.zh-CN.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/roadmap.md`

- [ ] **Step 1: Update Creation Host boundary spec**

Add a section to both English and Chinese creation-host model docs:

```md
## Accepted Architecture Boundary

The project accepts ADR-0029: Operation is the framework's core primitive.
Lifecycle scripts remain a runtime subsystem.

The project accepts the four-artifact model:

Framework -> Creation Host -> Generated Application -> Published Application

Framework may own minimal contracts that make Creation Hosts interoperable
(profile, project, version, semantic lifecycle tools), but it must not absorb
the product surface of a specific Creation Host.
```

- [ ] **Step 2: Sync `CLAUDE.md` to `AGENTS.md`**

Bring `CLAUDE.md` forward from Post-M11 to Post-M16/M17 language. It should:

- point first to M16 snapshot;
- mention M17 security + architecture acceptance gate;
- remove stale “M11 current” status;
- preserve the four-artifact boundary.

- [ ] **Step 3: Update roadmap**

Change roadmap tail to:

```text
M17 Security + architecture acceptance ✅/⏳
M18 Open-ended app pressure ⏳
M19 Release candidate review ⏳
```

Keep M17 as in-progress until snapshot closure.

- [ ] **Step 4: Verify docs navigation**

Run:

```bash
rg -n "Post-M11|M16 is the release-candidate review gate|v0 spec / pre-code|M17 Release candidate review" AGENTS.md CLAUDE.md docs/architecture examples/README.md
```

Expected: no stale status claims remain, except inside historical snapshots if intentionally quoted.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md CLAUDE.md docs/architecture/spec/creation-host-model.md docs/architecture/spec/creation-host-model.zh-CN.md docs/architecture/README.md docs/architecture/roadmap.md
git commit -m "docs: accept operation-centered creation host model"
```

---

## Task 6: Write ADR-0030 Lifecycle Subsystem Contract

**Files:**
- Create: `docs/architecture/adr/0030-lifecycle-subsystem-contract.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/OPEN-QUESTIONS.md`

- [ ] **Step 1: Create ADR**

Write `docs/architecture/adr/0030-lifecycle-subsystem-contract.md` with:

```md
# ADR-0030: Lifecycle subsystem contract

**Status**: Accepted
**Date**: 2026-05-04
**Deciders**: Pandazki, Codex
**Tags**: lifecycle, runtime-subsystem, security, release

## Context

ADR-0029 superseded lifecycle scripts as the framework core primitive, but the
runtime still uses lifecycle verbs to start, stop, build, deploy, migrate, and fork
Generated Application versions.

## Decision

Lifecycle is a runtime subsystem. Agents call semantic tools, never scripts.
Templates or Host profiles implement lifecycle through scripts or host-owned adapters.

The framework-owned lifecycle contract includes:

- verbs: setup, dev, stop, build, deploy, migrate, fork;
- process supervision and log streaming;
- service-ready marker semantics;
- build manifest handoff;
- env vars under `PNEUMA_*`;
- internal HTTP token handoff for framework-only runtime calls.

## Consequences

Lifecycle remains swappable implementation machinery. It cannot become the app
definition source of truth, and it cannot be used to bypass Operation governance.
```

- [ ] **Step 2: Update ADR index**

Add ADR-0030 to `docs/architecture/README.md` under the lifecycle/framework section.

- [ ] **Step 3: Remove lifecycle open question**

In `OPEN-QUESTIONS.md`, mark lifecycle formalization as answered by ADR-0030, while leaving hot reload and transactionality as open.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/adr/0030-lifecycle-subsystem-contract.md docs/architecture/README.md docs/architecture/OPEN-QUESTIONS.md
git commit -m "docs: define lifecycle subsystem contract"
```

---

## Task 7: Reclassify Adapter and Provider Packages

**Files:**
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/roadmap.md`
- Modify: `examples/README.md`
- Modify: `packages/adapter-linear/package.json`
- Modify: `packages/provider-openrouter/package.json`

- [ ] **Step 1: Document classification**

Add a section to architecture README:

```md
## Reference integrations

`packages/adapter-linear` and `packages/provider-openrouter` are reference
integrations kept in the monorepo for dogfood and tests. They are not framework
core primitives. Core owns Adapter and Provider interfaces; concrete vendors
should move to templates/examples or external packages before public release
unless an ADR explicitly promotes them.
```

- [ ] **Step 2: Mark package metadata**

Add to both package.json files:

```json
"private": true,
"pneuma": {
  "classification": "reference-integration"
}
```

- [ ] **Step 3: Verify typecheck still includes them**

Run:

```bash
bun run typecheck
```

Expected:

```text
exit 0
```

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/README.md docs/architecture/roadmap.md examples/README.md packages/adapter-linear/package.json packages/provider-openrouter/package.json
git commit -m "docs: mark concrete integrations as reference packages"
```

---

## Task 8: Close M17 Snapshot

**Files:**
- Create: `docs/archive/milestone-17-snapshot.md`
- Create: `docs/archive/milestone-17-snapshot.zh-CN.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/roadmap.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run focused security verification**

Run:

```bash
bun test packages/runtime/test/runtime.test.ts packages/runtime/test/api-config.test.ts packages/runtime/test/framework-operations.test.ts packages/core/test/tools/definition-apply.test.ts
```

Expected:

```text
0 fail
```

- [ ] **Step 2: Run M16 regression**

Run:

```bash
bun test examples/m16-reference-creation-host packages/core/test/creation-host.test.ts examples/m14-host-publish-rollout/publish-rollout.test.ts
bun run examples/m16-reference-creation-host/run.ts --port 0 --smoke-exit
```

Expected:

```text
0 fail
smoke verification: passed
```

- [ ] **Step 3: Run typecheck and diff check**

Run:

```bash
bun run typecheck
git diff --check
```

Expected:

```text
exit 0
exit 0
```

- [ ] **Step 4: Write M17 snapshots**

The snapshot must say:

- M17 closed security blockers before RC;
- ADR-0029 and four-artifact model are explicitly accepted;
- lifecycle subsystem is now ADR-0030;
- adapter/provider packages are reference integrations, not core;
- open-ended app pressure is mandatory before RC;
- rollback still needs full transactionality before production unless explicitly scoped out.

- [ ] **Step 5: Commit**

```bash
git add docs/archive/milestone-17-snapshot.md docs/archive/milestone-17-snapshot.zh-CN.md docs/architecture/README.md docs/architecture/roadmap.md AGENTS.md CLAUDE.md
git commit -m "docs: add m17 security architecture gate snapshot"
```

---

## Post-M17 Mandatory Next Milestone

M18 must be **Open-Ended App Pressure** before RC.

Minimum acceptable M18 proof:

```text
Creation Host
  -> creates an app whose primary artifact is not a schema/list/queue table app
  -> app changes include open-ended UI/code structure
  -> Builder can preview the result
  -> Host can inspect enough evidence to explain what changed
  -> framework governance does not collapse into blind file editing
```

Candidate shapes:

- Webcraft-style single page app editor;
- Gridboard-style canvas/grid app;
- micro dashboard with custom layout and component tree.

M18 should not aim for production-quality webcraft. It only needs to pressure whether Operation-centered app definition can coexist with open-ended UI/code artifacts.

