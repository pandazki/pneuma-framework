# App Definition Milestone

**Date:** 2026-04-28
**Status:** Current canonical milestone record
**Scope:** Builder/agent-governed app-definition mutation, approval, restart discovery, rollback, and live browser demo.

This document replaces the temporary P2/P5-P15 progress reports. Those reports were useful while building, but the durable story is now one milestone:

> Pneuma can evolve an app's software surface through governed, attributable, reversible definition rows.

中文摘要：

> 这不是 agent 往 app 里写了一条数据，而是 Builder 通过 agent 改变了 app 的 schema / domain service / API surface / app view / policy surface，并且这条变化走了 framework 的治理路径：审批、历史、重启发现、回滚验证、回滚执行。

## Why This Matters

Traditional app frameworks assume the Developer defines the software surface before the user arrives. Pneuma's differentiator is different:

```text
Builder intent
  -> Build-phase Agent
  -> framework semantic operation
  -> system-owned app definition row
  -> app_history attribution
  -> runtime restart / rediscovery
  -> end-user app surface changes
```

The milestone proves this path for app definition, not just app data.

## Working Definition Surface

The current implementation uses system-owned Tables for mutable app definition:

| System-owned Table | Stores |
|---|---|
| `pneuma_tables` | Builder/agent-declared stored Tables |
| `pneuma_table_columns` | Builder/agent-declared columns on stored Tables |
| `pneuma_operations` | Builder/agent-declared query-backed read Operations |
| `pneuma_views` | Builder/agent-declared Views mounted on read Operations |
| `pneuma_policy_rules` | Builder/agent-declared additive PolicyRules |

This is intentionally the same storage layer as app data. It keeps history, audit, policy, rollback, and runtime loading on one framework path instead of introducing a separate JSON overlay channel.

Operation exposure is no longer inferred from `reads_only` alone. Each Operation now has a normalized `surface` contract:

```ts
{
  agent_callable: boolean;
  public_surface: boolean;
  view_mountable: boolean;
  framework_internal: boolean;
}
```

Builder-authored read Operations default to `public_surface=true` and `view_mountable=true`. Framework governance Operations remain `agent_callable=true`, but are explicitly `framework_internal=true`, `public_surface=false`, and `view_mountable=false`.

## Supported Definition Mutations

### `definition.apply(add_table_column)`

Adds a column to an existing stored Table.

Acceptance proof:

```text
before: row with new cell is rejected
apply: writes pneuma_table_columns row and app_history entry
restart: runtime rehydrates schema
after: normal StorageService validation accepts the new cell
```

### `definition.apply(add_table)`

Adds a new stored Table.

Acceptance proof:

```text
before: row for unknown table is rejected
apply: writes pneuma_tables row and app_history entry
restart: /api/config includes the new table
after: normal StorageService validation accepts rows for that table
```

### `definition.apply(add_operation)`

Adds a query-backed read Operation.

Current supported shape:

```ts
{
  kind: "add_operation",
  operation_id: "list_bookmark_urls",
  handler: {
    kind: "query",
    on: "bookmarks",
    fields: ["title", "url", "source", "lens"],
    pagination: { kind: "offset", size: 10 }
  },
  surface: {
    agent_callable: true,
    public_surface: true,
    view_mountable: true,
    framework_internal: false
  }
}
```

Acceptance proof:

```text
before: Operation is absent from runtime and /api/config
apply: writes pneuma_operations row and app_history entry
restart: runtime registers the Operation
after: query returns bookmark rows for the Review Queue and /api/config exposes the capability
```

### `definition.apply(add_view)`

Adds a user-facing View that mounts an existing read Operation.

Current supported shape:

```ts
{
  kind: "add_view",
  view_id: "review_queue",
  name: "Review Queue",
  view_kind: "table",
  source: { kind: "operation", operation_id: "list_bookmark_urls" },
  presentation: {
    title: "Review Queue",
    columns: [
      { field: "title", label: "Title", role: "title" },
      { field: "url", label: "URL", role: "url" },
      { field: "source", label: "Origin", role: "metadata" },
      { field: "lens", label: "Lens", role: "metadata" }
    ],
    empty_state: "No sources are waiting for review."
  }
}
```

Acceptance proof:

```text
before: Operation is queryable, but the end-user app view is absent
apply: writes pneuma_views row and app_history entry
restart: /api/config includes the View
after: the demo app renders Review Queue with `PneumaViewRenderer` from the View presentation contract and Operation output
```

### `definition.apply(add_policy_rule)`

Adds an additive allow PolicyRule.

Current supported shape:

```ts
{
  kind: "add_policy_rule",
  rule_id: "reviewers-can-read-review-queue",
  allow: [{ kind: "role", name: "reviewer" }],
  actions: ["read"],
  resource: { kind: "view", id: "review_queue" }
}
```

Acceptance proof:

```text
before: restricted app denies the View read by default
apply: writes pneuma_policy_rules row and app_history entry
restart: runtime composes the PolicyRule into the PolicyEvaluator
after: reviewer role gets an explicit allow; guest remains denied
rollback: removes the policy rule definition row and restores restricted default behavior
```

## Governance Path

Definition changes are not silent writes.

Current governance surfaces:

- viewer permission prompt for `definition.apply`
- add-table/add-column/add-operation/add-view impact disclosure
- add-policy-rule impact / diff disclosure through `definition.apply`
- viewer permission prompt for `definition.rollback.validate`
- rollback impact disclosure for removed Tables, columns, Operations, Views, and PolicyRules
- allow/deny response over the existing wire permission envelope
- `app_history` attribution for definition snapshots
- runtime overlay warnings surfaced through runtime state / health / audit path

The important point is that `definition.apply` and rollback use framework semantic operations. The agent is not editing lifecycle scripts or arbitrary files directly.

## Rollback Path

Rollback is split into validation/approval and execution.

```text
definition.rollback.validate
  -> reconstruct target overlay state from app_history
  -> compute removed Tables / columns / Operations / Views / PolicyRules
  -> disclose destructive impact

definition.rollback.prepare
  -> call validate
  -> request approval when needed
  -> return ready_to_execute or denied

definition.rollback.execute
  -> write pre-rollback backup
  -> remove affected definition rows
  -> delete removed overlay table rows when needed
  -> clean removed column cells from retained rows
  -> append post-rollback definition snapshot
  -> restart / refetch / verify
```

Supported execution today:

| Rollback impact | Status |
|---|---|
| Removed overlay Table | Supported, destructive row deletion with backup |
| Removed overlay column | Supported, affected cell cleanup with backup |
| Removed query-backed Operation | Supported, deletes `pneuma_operations` definition row |
| Removed Operation-backed View | Supported, deletes `pneuma_views` definition row |
| Removed PolicyRule | Supported, deletes `pneuma_policy_rules` definition row |
| Restored Table / column / Operation / View / PolicyRule | Not supported yet |
| Non-query Operation rollback | Not supported yet |

## Live Browser Demo

The recommended milestone demo is:

```text
examples/p5-viewer-approval-e2e
?scenario=capability-lifecycle&variant=studio
```

The demo tells the story through three synchronized surfaces:

1. **End-user app:** `Reader Bookmarks`, a source inbox for preparing AI research handoffs.
2. **System viewer:** traditional `Schema + demo data`, `Domain service`, `API surface`, `App view`, and `Policy`.
3. **Builder studio:** Builder + Agent conversation, approval cards, primitive path, and raw event payload.

Flow:

```text
baseline: source row exists, URL export capability absent
  -> Builder asks agent to expose selected source URLs
  -> approval: install capability definition
  -> framework writes pneuma_operations row
  -> restart registers list_bookmark_urls
  -> runtime output returns the selected URL
  -> approval: mount Review Queue view
  -> framework writes pneuma_views row
  -> restart exposes the end-user app view
  -> approval: grant reviewer access
  -> framework writes pneuma_policy_rules row
  -> restart makes Review Queue visible to Reviewer while Guest remains blocked
  -> approval: rollback capability definition
  -> framework removes the operation, view, and policy rule definition rows
  -> restart proves all three are gone
  -> source row remains
```

## Boundaries

Do not overclaim this milestone.

- Runtime restart is still required; hot reload is not implemented.
- `add_operation` only supports query-backed read Operations.
- `add_view` only supports mounting an existing read Operation with a narrow presentation contract; `PneumaViewRenderer` covers the declarative table/list/detail path, but custom components are not implemented.
- `add_policy_rule` only supports additive allow rules; deny rules, rule editing, and default-posture mutation are not implemented.
- `surface` is a classification/discovery contract, not a replacement for policy or auth.
- Arbitrary code handler distribution is outside this slice.
- Restored definitions are not executable rollback targets yet.
- `reads_only` for code handlers is currently a declaration/governance signal, not a runtime sandbox.
- Enterprise-grade authorization is not complete; MVP policy remains permissive in several framework-injected paths.
- Operation output/invocation metadata is improved but still needs another pass before broad third-party clients should rely on it as a stable external contract.

## Current Verification

Latest checked on 2026-04-28:

```text
bun run typecheck                      PASS
bun test                               843 pass / 0 fail / 2698 expect() calls
(cd examples/p5-viewer-approval-e2e && bun run build) PASS
git diff --check                       PASS
```

Live-browser smoke check covered Operation -> PneumaViewRenderer input -> PolicyRule visibility -> rollback with preserved business row and no browser console warnings/errors.

Targeted suite:

```text
packages/viewer-react/test/PermissionPrompt.test.tsx
packages/viewer-react/test/ViewRenderer.test.tsx
packages/core-domain/test/aggregates/operation.test.ts
packages/core-domain/test/lifecycle/pneuma-operations.test.ts
packages/core-domain/test/lifecycle/pneuma-views.test.ts
packages/core-domain/test/lifecycle/pneuma-policy-rules.test.ts
packages/runtime/test/framework-operations.test.ts
packages/runtime/test/definition-apply.test.ts
packages/runtime/test/api-config.test.ts
packages/runtime/test/runtime.test.ts
packages/core/test/operation-tool-bridge.test.ts
packages/core/test/template-mcp-bridge.test.ts
packages/core/test/tools/definition-apply.test.ts
examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts
```

## Historical Slice Ledger

This milestone came from a sequence of implementation slices. Keep this ledger brief; detailed process reports should not accumulate indefinitely.

| Slice | Durable result |
|---|---|
| P2 | `definition.apply(add_table_column)` end to end |
| P4 | `definition.apply(add_table)` on the same primitive path |
| P5 | approval UI, overlay warning visibility, rollback semantics draft |
| P6 | non-destructive rollback validation |
| P7 | rollback approval disclosure in viewer |
| P8 | rollback prepare boundary in core tool lifecycle |
| P9 | destructive rollback executor for removed overlay Tables |
| P10 | removed-column rollback with affected cell cleanup |
| P11 | live browser rollback execute E2E |
| P12 | query-backed `add_operation` and `pneuma_operations` overlay |
| P13 | Operation impact disclosure in apply/rollback approval |
| P14 | rollback execute for removed query-backed Operations |
| P15 | replayable live browser capability lifecycle demo |
| P16 | Operation-backed View primitive, `pneuma_views`, and full Operation -> View -> rollback demo |
| P17 | Operation surface contract: `agent_callable`, `public_surface`, `view_mountable`, `framework_internal` |
| P18 | 0-prep team-share package: opening narrative, demo checklist, architecture readback, FAQ |
| P19 | Request-scoped View visibility policy: `read view:<id>` plus source Operation `invoke` |
| P20 | Wire-protocol framework events for definition apply / rollback restart phases |
| P21 | PolicyRule definition primitive: `pneuma_policy_rules`, `add_policy_rule`, runtime policy composition, and rollback removal |
| P22 | Policy-gated live demo: Operation -> View -> PolicyRule -> rollback with request-scoped Reviewer/Guest visibility |

## Document Hygiene Rule

Future work should update one of these durable homes:

- app-level design state: this document
- team presentation: [`team-share-demo.md`](./team-share-demo.md)
- unsettled decisions: [`OPEN-QUESTIONS.md`](./OPEN-QUESTIONS.md)
- architectural decisions: ADRs under [`adr/`](./adr/)

Avoid adding one report per implementation slice unless it captures a decision that should become an ADR.
