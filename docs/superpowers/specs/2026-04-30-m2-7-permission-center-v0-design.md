# M2.7 Permission Center v0 Design

**Date:** 2026-04-30
**Status:** Draft for review
**Milestone:** M2 - Enterprise Governance Hardening
**Builds on:** `2026-04-30-m2-6-recoverable-definition-mutation-design.md`

中文摘要：

> Permission Center 不是给 Build-phase Agent 用的主界面。它是给 Builder / workspace owner / enterprise admin 查看和控制 AI-created software changes 的治理 surface。Agent 是被治理对象，只消费结构化失败原因和状态，不拥有批准权。

## Goal

Turn the existing permission ledger and governance evidence loop into the first product-shaped governance surface.

Target invariant:

```text
A human governance owner can inspect pending and recent AI-created software changes,
understand who proposed / approved / executed them,
filter the ledger by governance-relevant dimensions,
and see failure / dirty-state reasons without reading framework logs.
```

This is a product-surface milestone over existing M2 primitives, not a new framework primitive.

## Primary User

Permission Center v0 is for the human actor who controls the build process.

| Role | Relationship to Permission Center |
|---|---|
| Builder | Primary v0 user. Sees what the Build-phase Agent wants to change, what was approved or denied, and what happened. |
| Workspace owner / app owner | Same product role as Builder in solo and team-internal settings; owns accountability for build-time changes. |
| Enterprise admin / reviewer | Future primary user. Needs search, retention, assignment, and review workflows later. |
| Build-phase Agent | Governed actor, not primary UI user. It proposes changes and consumes structured denial / repair reasons. |
| Developer | Uses it for debugging and framework integration, but does not define the product persona. |
| End User | Usually out of scope. End Users may receive policy explanations, not build-time approval ledgers. |

Product sentence:

> Permission Center is where a human governance owner audits and controls AI-created app changes.

## Current State

M2.0-M2.6 already provide the raw ingredients:

- Authorization Kernel separates `build_agent` proposal authority from `framework_system` execution authority.
- Approval tokens convert Builder approval into scoped single-use execution authority.
- Permission ledger records request / decision / token / execution / outcome events.
- Viewer reconnect receives `permission-ledger-state` with pending and recent request records.
- `GovernanceEvidencePanel` renders the chain as compact evidence rows.
- M2.6 repair tools expose clean/running/dirty definition mutation state.

The gap is product shape:

- records are visible, but not yet browsable as a governance center;
- filtering is ad hoc;
- summary counts are not a first-class read model;
- dirty repair state is not presented next to permission history;
- the demo still reads as "evidence cards" rather than "a place where the Builder controls AI-created software changes."

## Non-Goals

M2.7 v0 does not implement:

- multi-approver workflow;
- assignment, escalation, or reviewer queues;
- SSO / SCIM / tenant RBAC import;
- retention policy or legal hold;
- bulk actions;
- database search indexing;
- approval delegation;
- external policy engine integration;
- a new wire-protocol envelope;
- a new governance primitive.

Existing permission prompts remain the execution path for allow / deny decisions. Permission Center v0 may surface actionable pending records, but it does not replace the underlying permission-response protocol.

## Decision

Build Permission Center v0 as a read-model and viewer surface over the existing ledger.

```text
PermissionLedgerStore
  -> filtered request records
  -> permission-ledger-state framework event
  -> PermissionCenterPanel
  -> capability-lifecycle demo right rail
```

This keeps the architecture aligned with M2:

- authority still lives in the Kernel and approval token flow;
- evidence still lives in the ledger;
- the viewer is a product explanation of existing framework state;
- the Agent remains a consumer of structured reasons, not a UI owner.

## Data Contract

Extend the permission ledger request query options without changing event storage.

Conceptual type:

```ts
type PermissionLedgerRequestQuery = {
  readonly status?: PermissionLedgerRequestStatus | readonly PermissionLedgerRequestStatus[];
  readonly tool?: string | readonly string[];
  readonly capability?: Capability | readonly Capability[];
  readonly target_kind?: AuthorizationTarget["kind"] | readonly AuthorizationTarget["kind"][];
  readonly requested_principal_kind?: Principal["kind"] | readonly Principal["kind"][];
  readonly execution_principal_kind?: Principal["kind"] | readonly Principal["kind"][];
  readonly text?: string;
  readonly limit?: number;
};
```

Filtering is over derived request records, not raw JSONL lines. That preserves the append-only ledger shape and keeps the query contract independent from the file storage implementation.

`text` is intentionally simple in v0. It matches stable visible fields only:

- prompt id;
- tool;
- capability;
- target id / fingerprint;
- requested principal id;
- execution principal id;
- authorization reason code;
- message.

No fuzzy search, ranking, or full-text index is required.

## Permission Center State

Add a derived state object that can be computed from ledger records.

Conceptual type:

```ts
type PermissionCenterState = {
  readonly summary: {
    readonly pending: number;
    readonly completed: number;
    readonly denied: number;
    readonly failed: number;
    readonly expired: number;
    readonly dirty_definition_state?: boolean;
  };
  readonly records: readonly PermissionLedgerRequestRecord[];
  readonly query: PermissionLedgerRequestQuery;
};
```

The first implementation can keep the existing `permission-ledger-state` framework event and add optional fields in a backward-compatible way:

```ts
type PermissionLedgerState = {
  readonly pending: readonly PermissionLedgerRequestRecord[];
  readonly recent: readonly PermissionLedgerRequestRecord[];
  readonly permission_center?: PermissionCenterState;
};
```

Existing viewers that only read `pending` and `recent` keep working.

## Viewer Surface

Add a new `PermissionCenterPanel` in `@pneuma-framework/viewer-react`.

It should make three ideas obvious:

1. **Queue** — what is pending and actionable now.
2. **History** — what recently completed, failed, expired, or was denied.
3. **Proof** — why each record was allowed or blocked: proposer, approver, token hash, executor, reason code, final status.

Recommended component contract:

```ts
type PermissionCenterPanelProps = {
  readonly pending: readonly PermissionLedgerRequestRecord[];
  readonly recent: readonly PermissionLedgerRequestRecord[];
  readonly repairStatus?: DefinitionRepairStatus;
  readonly initialQuery?: PermissionLedgerRequestQuery;
  readonly onQueryChange?: (query: PermissionLedgerRequestQuery) => void;
  readonly onRespond?: (response: PermissionResponse) => void;
};
```

`onRespond` is optional. A host can use Permission Center as read-only audit, or wire pending records to the existing permission-response flow. The component must not mint authority or bypass the existing approval token chain.

UI shape:

- summary strip: pending / completed / denied / failed / dirty state;
- filter controls: status, capability, principal kind, tool, text;
- record list: compact rows with status, capability, target, proposer, approver, executor;
- detail drawer or expanded row: token hash, reason code, message, timestamps, target fingerprint;
- dirty repair callout when `repairStatus.status === "dirty"`.

The panel should eventually replace `GovernanceEvidencePanel` in the canonical M2 demo, but `GovernanceEvidencePanel` can remain as a compact embeddable evidence widget.

## Demo Narrative

Update the capability lifecycle demo so the right rail reads as Permission Center v0:

```text
Left: end-user app changes over time.
Right: human governance owner sees the AI-created change queue and evidence.
```

The demo should show:

1. Agent proposes adding a capability.
2. Permission Center shows a pending request with proposer and target.
3. Builder approves through the existing permission prompt or an optional Permission Center action.
4. Record becomes completed with token hash and executor.
5. A denied or failed path remains visible in history.
6. Dirty definition state, when present in a scenario, appears as a repair callout.

The teaching point:

> Enterprise governance becomes understandable because the same software change is visible as app behavior and as human-readable authority evidence.

## Agent-Facing Behavior

Build-phase Agent does not use Permission Center as its UI.

It benefits indirectly because:

- denied/failed ledger records carry stable reason codes;
- dirty-state blocks point to `definition.repair.status`;
- the Builder can inspect the same record the Agent is explaining;
- future agents can cite permission center records when summarizing why a change did or did not happen.

The Agent must not receive new authority from Permission Center v0.

## Testing Strategy

Use TDD. The tests should describe the product contract, not implementation details.

Core tests:

1. ledger query filters by status, capability, target kind, principal kind, tool, text, and limit;
2. query derivation preserves newest-first request ordering;
3. invalid/corrupt ledger lines remain ignored as they are today;
4. permission center summary counts pending/completed/denied/failed/expired records;
5. permission center state is backward-compatible with existing `pending` and `recent` consumers.

Viewer tests:

1. `PermissionCenterPanel` renders summary counters;
2. it renders authority proof fields without raw token ids;
3. it filters records through visible controls;
4. it marks live pending records as actionable only when `onRespond` is provided;
5. it renders dirty repair state as a callout.

Demo tests:

1. capability lifecycle demo exposes Permission Center labels and records over the governance variant;
2. completed approval path shows proposer, approver, token hash, executor, and completed status;
3. denied/failure scenario remains inspectable in history.

Full verification remains:

```bash
bun test packages/core/test/permission-ledger.test.ts packages/core/test/wire-protocol/permission-ledger-seed.test.ts packages/viewer-react/test/GovernanceEvidence.test.tsx examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts
bun test
bun run typecheck
git diff --check
```

## Risks And Tradeoffs

| Risk | Mitigation |
|---|---|
| It becomes an admin console too early | Keep v0 scoped to query + summary + evidence rendering. No assignment, retention, or org sync. |
| It duplicates permission prompt UI | `onRespond` is optional and delegates to the existing permission-response protocol. The authority chain stays unchanged. |
| It hides ledger truth behind a pretty component | Keep token hash, reason code, executor, final status, and target fingerprint visible in record detail. |
| Query API leaks file-store assumptions | Filter derived request records, not raw JSONL lines. |
| Agent is treated as a governance user | Spec says Agent is governed actor and reason-code consumer, not Permission Center owner. |

## Success Criteria

M2.7 is done when:

- the ledger can produce filtered request records and summary counts;
- viewer-react exports a Permission Center panel;
- the demo right rail can show Permission Center v0 instead of only compact evidence cards;
- existing governance evidence consumers remain compatible;
- tests prove the v0 query, summary, viewer, and demo contracts;
- milestone docs can honestly say: "M2 now has a first product-shaped governance surface."
