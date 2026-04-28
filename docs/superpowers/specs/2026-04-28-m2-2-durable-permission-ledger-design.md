# M2.2 Durable Permission Ledger Design

**Date:** 2026-04-28
**Status:** Draft for user review
**Milestone:** M2 - Enterprise Governance Hardening
**Builds on:** `2026-04-28-m2-1-approval-token-execution-chain-design.md`

中文摘要：

> M2.1 已经把 Builder approval 接成 token 化执行链。M2.2 要把这条链从 live-only prompt 升级为 durable permission ledger：每一次权限请求、Builder 响应、token 签发元数据、framework execution 结果都能被记录、查询、在 viewer 重连时恢复上下文。Ledger 只保存治理事实，不保存可跨进程复用的 approval token。

## Goal

Make framework-owned approvals durable enough for enterprise governance claims.

Target chain:

```text
Build-phase Agent proposes mutation
  -> framework records permission_requested
  -> viewer receives live permission-prompt
  -> Builder responds
  -> framework records permission_responded
  -> approval token is minted and immediately consumed in-process
  -> framework records token metadata and execution authorization result
  -> viewer reconnect can recover pending/resolved permission context
```

This closes the gap called out in `OPEN-QUESTIONS.md`:

```text
Approval prompt is live, but consumer surface is still demo-level.
Product viewer needs a durable permission center / pending-state model.
```

## Current State

Already implemented:

- `AuthorizationKernel` decides whether a principal can use a framework capability.
- `definition.apply(require_approval: true)` and `definition.rollback.execute(require_approval: true)` use Builder approval to authorize `framework_system` execution.
- `InMemoryApprovalTokenStore` mints single-use tokens with target fingerprints.
- Wire protocol can send live `permission-prompt` envelopes and receive `permission-response`.
- Framework events expose definition apply / rollback lifecycle progress.

Remaining gap:

- Permission prompts are not recorded durably.
- Viewer reconnect only gets file state, not outstanding framework permission context.
- Approval token metadata is agent-facing in the tool result, but not queryable as a governance record.
- A hard process restart loses prompt resolvers. The system cannot explain whether a prompt was pending, answered, abandoned, or already executed.

## Non-Goals

This slice does not implement:

- Full Permission Center product UI.
- Multi-approver workflow.
- SSO, enterprise identity sync, or admin groups.
- Durable approval-token replay.
- Cross-process continuation of an in-flight mutation after the resolver is gone.
- PolicyRule edit/delete/deny semantics.
- Generic event sourcing for all framework events.
- Runtime Agent release-mode authorization.

M2.2 is a governance ledger, not a new authority model.

## Options Considered

### Option A - Core permission ledger plus reconnect seed

Add a framework-local ledger store under `.pneuma`, append permission events, derive current request records, and seed connected viewers with pending/recent permission state.

Pros:

- Directly fixes the live-only prompt gap.
- Keeps M2 focused on enterprise governance hardening.
- Reuses existing prompt and response envelopes.
- Gives tests a durable contract without requiring a product UI.

Cons:

- The UI expression remains minimal.
- The ledger is local-file backed first, not a production database adapter.

### Option B - Wire event replay first

Persist every `framework-event` and derive permission state from the event stream.

Pros:

- More general protocol story.
- Eventually useful for restart timeline replay, debugging, and analytics.

Cons:

- Larger than the current governance need.
- Forces protocol event-sourcing decisions before the permission model itself is stable.

### Option C - Full Permission Center UI

Build a viewer surface with pending/resolved approvals, filters, and action history.

Pros:

- Strongest demo surface.
- Closest to enterprise product expectation.

Cons:

- Couples primitive design to product UI too early.
- Increases scope with visual states, pagination, filtering, and interaction design.

## Decision

Choose **Option A**.

M2.2 should add a durable core ledger, expose enough state for reconnect/demo, and leave the full Permission Center UI for a later product slice.

The ledger must be strict about one boundary:

```text
Durable ledger records governance facts.
Approval tokens remain in-memory, single-use execution credentials.
```

The ledger records a token hash/reference and token metadata after issuance. It must not persist a reusable token object or make a hard-restarted mutation executable by replaying an old approval.

## Architecture

### 1. Ledger Store

Introduce a small store interface in `packages/core`:

```ts
interface PermissionLedgerStore {
  append(event: PermissionLedgerEvent): Promise<void>;
  list(options?: PermissionLedgerListOptions): Promise<readonly PermissionLedgerEvent[]>;
  listRequests(options?: PermissionLedgerRequestListOptions): Promise<readonly PermissionLedgerRequestRecord[]>;
  getRequest(promptId: string): Promise<PermissionLedgerRequestRecord | undefined>;
}
```

Default implementation:

```text
workspace/.pneuma/permission-ledger.jsonl
```

Use append-only JSONL for the first store. It matches the existing checkpoint style and avoids overwriting governance history. Query helpers derive request records from events.

### 2. Event Shape

Events are schema-versioned and append-only:

```ts
type PermissionLedgerEvent =
  | PermissionRequestedEvent
  | PermissionRespondedEvent
  | ApprovalTokenIssuedEvent
  | PermissionExecutionAuthorizedEvent
  | PermissionExecutionDeniedEvent
  | PermissionExecutionCompletedEvent
  | PermissionExecutionFailedEvent
  | PermissionExpiredEvent;
```

Shared fields:

```ts
{
  schema_version: 1,
  event_id: string,
  event_type: string,
  at_ms: number,
  prompt_id: string,
  session_id?: string,
  app_id: string,
  workspace_id: string,
  tool: string,
  capability?: Capability,
  target?: AuthorizationTarget,
  target_fingerprint?: string
}
```

Request events also include:

```ts
{
  event_type: "permission_requested",
  requested_principal?: Principal,
  detail: Record<string, unknown>
}
```

Response events include:

```ts
{
  event_type: "permission_responded",
  decision: "allow" | "deny" | "allow-always",
  decided_by: { kind: "builder", id: string }
}
```

Token events include metadata only:

```ts
{
  event_type: "approval_token_issued",
  approval_token_hash: string,
  approved_capability: Capability,
  approved_by: { kind: "builder", id: string },
  issued_at_ms: number,
  expires_at_ms: number,
  single_use: true
}
```

The store must not persist the full `ApprovalToken` object or the raw `approval_token_id`. A stable hash is enough to correlate audit records without creating a durable credential.

### 3. Derived Request Record

Consumers should not have to replay events manually. The store exposes a derived record:

```ts
interface PermissionLedgerRequestRecord {
  readonly prompt_id: string;
  readonly status:
    | "pending"
    | "allowed"
    | "denied"
    | "authorized"
    | "completed"
    | "failed"
    | "expired";
  readonly live: boolean;
  readonly requested_at_ms: number;
  readonly responded_at_ms?: number;
  readonly completed_at_ms?: number;
  readonly tool: string;
  readonly capability?: Capability;
  readonly target?: AuthorizationTarget;
  readonly target_fingerprint?: string;
  readonly requested_principal?: Principal;
  readonly decided_by?: { kind: "builder"; id: string };
  readonly decision?: "allow" | "deny" | "allow-always";
  readonly detail: Record<string, unknown>;
  readonly authorization_reason_code?: string;
}
```

`live` is deliberately separate from `status`.

- `status=pending, live=true`: viewer can answer now; an in-memory resolver exists.
- `status=pending, live=false`: record is stale after restart; viewer can explain it, but cannot execute it.

### 4. Lifecycle Integration

`LifecycleOrchestrator` remains responsible for computing impact and owning live resolvers.

New responsibilities:

- record `permission_requested` before broadcasting a framework-owned prompt;
- record `permission_responded` inside `handleFrameworkPermissionResponse`;
- expose current live prompt ids so the seed path can mark pending records as `live=true`;
- append `permission_expired` for live pending framework prompts during orderly framework close.

Stale after hard restart is derived, not written: when a loaded ledger request is still `pending` but the new orchestrator has no matching live resolver, the derived request record reports `live=false`.

For definition mutations, request recording should be fail-closed:

```text
If a required approval prompt cannot be recorded, do not continue to mutation.
```

Deploy prompts can be best-effort in this slice, because deploy governance is not the M2.2 core proof.

### 5. Tool Authorization Integration

`tools/action.ts` remains responsible for token minting and framework-system authorization.

When `authorizeFrameworkExecutionAfterApproval(...)` mints and consumes a token:

1. append `approval_token_issued` with a token hash/reference;
2. authorize `framework_system`;
3. append `permission_execution_authorized` or `permission_execution_denied`;
4. return authorization metadata to lifecycle.

`LifecycleOrchestrator` appends `permission_execution_completed` or `permission_execution_failed` after the mutation result is known. This keeps token authority in the tool layer and execution outcome in the lifecycle layer.

### 6. Framework Constructor

Extend `createPneumaFramework(...)`:

```ts
authorization?: {
  enabled?: boolean;
  kernel?: AuthorizationKernel;
  approvalTokens?: ApprovalTokenStore;
  permissionLedger?: PermissionLedgerStore | false;
  principal?: Principal;
  appId?: string;
  workspaceId?: string;
}
```

Default:

- authorization enabled -> file ledger enabled;
- `permissionLedger: false` disables durable records for tests or special embedded hosts;
- low-level `createToolRegistry(...)` stays explicit and only records when a ledger is present in `ToolContext`.

### 7. Wire Seed

Viewer reconnect should receive enough permission state to recover context.

Add a narrow framework event:

```ts
{
  dir: "a2v",
  kind: "framework-event",
  event: {
    type: "permission-ledger-state",
    state: {
      pending: PermissionLedgerRequestRecord[],
      recent: PermissionLedgerRequestRecord[]
    }
  }
}
```

For live pending framework prompts, the seed path must also replay the existing `permission-prompt` envelope so existing viewers can render the same approval UI after reconnect.

This does not imply hard-restart continuation. If the resolver no longer exists, the record is visible as `live=false` and no `permission-prompt` envelope is replayed.

## Data Flow

### Allow path

```text
Agent calls definition.apply(require_approval=true)
  -> validate + diff
  -> ledger: permission_requested
  -> wire: permission-prompt
  -> Builder allow
  -> ledger: permission_responded
  -> token minted, hash recorded
  -> framework_system authorization succeeds
  -> ledger: permission_execution_authorized
  -> mutation executes
  -> ledger: permission_execution_completed
```

### Deny path

```text
Agent calls definition.apply(require_approval=true)
  -> validate + diff
  -> ledger: permission_requested
  -> Builder deny
  -> ledger: permission_responded
  -> no token minted
  -> no mutation
```

### Reconnect path

```text
Viewer connects
  -> seed file state
  -> seed permission-ledger-state
  -> replay live permission-prompt envelopes for pending live prompts
```

### Hard restart path

```text
Process dies while prompt is pending
  -> new process loads ledger
  -> record appears as pending, live=false
  -> viewer can explain that approval is stale
  -> Agent must rerun the operation to produce a new prompt
```

## Error Handling

- Invalid JSONL lines are skipped with a warning. They must not make the framework unable to boot.
- Ledger append failure during required definition approval fails closed before mutation.
- Response for unknown prompt remains routed as today: framework first, then backend. If neither handles it, no ledger response is appended.
- Duplicate response for an already resolved prompt is ignored and no new ledger event is appended.
- Token hash uses a stable cryptographic hash of the token id plus app/workspace salt. The raw token id is not persisted.

## Testing Plan

Tests should describe the capability before implementation:

1. File ledger appends request/response/token/execution events and derives a completed request record.
2. File ledger derives `pending` when a request has no response.
3. File ledger marks pending records as `live=true` only when the orchestrator has a matching live prompt id.
4. Ledger never persists raw `approval_token_id` or full `ApprovalToken`.
5. `definition.apply(require_approval=true)` allow path records request -> response -> token metadata -> authorized -> completed.
6. `definition.apply(require_approval=true)` deny path records request -> response and no token event.
7. `definition.rollback.execute(require_approval=true)` records the same governance chain.
8. Viewer reconnect seed includes `permission-ledger-state`.
9. Viewer reconnect replays live pending `permission-prompt` envelopes.
10. Corrupt JSONL lines do not crash boot or list operations.
11. Ledger append failure before required definition approval prevents mutation.

## Acceptance Criteria

M2.2 is complete when:

- framework-owned approval prompts have durable records;
- Builder responses are recorded durably;
- approval token issuance is auditable without persisting reusable token material;
- successful and denied execution paths are distinguishable in the ledger;
- reconnecting viewers can see pending/recent permission state;
- hard-restarted pending prompts are visible but not actionable;
- focused tests and full repo tests pass.

## Demo Narrative

The milestone demo should show the same app-definition mutation through three layers:

```text
1. Builder asks the Agent to add a capability.
2. Framework shows an approval prompt with impact.
3. Permission ledger records the request, decision, and execution chain.
```

The important team-share sentence:

> This is no longer a live modal. It is a governed permission record: who asked, what changed, who approved, which framework capability executed, and whether it completed.

中文讲法：

> 这一步把“弹窗确认”升级成“企业治理记录”。不是用户点了一下按钮就过去了，而是 framework 能解释：谁请求、请求改什么、谁批准、framework 用什么权力执行、最后有没有成功。
