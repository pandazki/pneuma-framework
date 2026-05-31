# M2.3 Governance Evidence Loop Design

**Date:** 2026-04-29
**Status:** Draft for user review
**Milestone:** M2 - Enterprise Governance Hardening
**Builds on:** `2026-04-28-m2-2-durable-permission-ledger-design.md`

中文摘要：

> M2.0-M2.2 已经把企业治理的底层链路铺好：Authorization Kernel 分权，approval token 让 Builder approval 变成 single-use execution authority，durable permission ledger 记录审批事实。M2.3 要把这些底层能力组织成一条外部可审视的 evidence loop：团队和未来企业用户能看到每一次 AI 驱动的软件结构变化是谁提出、谁批准、为什么允许或拒绝、什么 token 授权了执行、最后完成/失败/过期在哪里。

## Goal

Turn M2 governance from internal correctness into an externally understandable proof.

Target chain:

```text
Build-phase Agent proposes a framework change
  -> Authorization Kernel explains what the Agent may do
  -> framework records permission_requested
  -> Builder approves or denies
  -> approval token metadata proves scoped execution authority
  -> framework_system executes or is denied
  -> durable ledger derives the final request state
  -> viewer reconnect can still inspect the evidence
  -> team-share snapshot explains the whole chain from outside
```

M2.3 is not "add a security screen". It is the first slice where enterprise governance becomes a **visible evidence chain** rather than a set of invisible implementation details.

## Current State

Already implemented:

- `AuthorizationKernel` defines static framework authority boundaries.
- `createPneumaFramework(...)` installs kernel, approval token store, and permission ledger by default.
- `definition.apply(require_approval: true)` and `definition.rollback.execute(require_approval: true)` use Builder approval to authorize `framework_system` execution.
- Approval token metadata is recorded without raw token leakage.
- Permission ledger records request / response / token / execution / completion / failure / expiration events.
- Viewer reconnect receives `permission-ledger-state` and live pending framework prompt envelopes.
- `close()` expires unresolved live framework permission prompts instead of leaving them pending forever.

Remaining gap:

- Governance facts are durable but not yet organized into a first-class product-facing surface.
- The derived ledger read model does not yet expose all evidence fields the console needs, especially execution principal and approval-token metadata.
- The canonical demo still focuses on "capability lifecycle"; it does not yet teach the full M2 enterprise-security thesis.
- Tests prove pieces of the chain, but there is no single named acceptance matrix for the whole governance evidence loop.
- M2 does not yet have a snapshot document comparable to `milestone-1-snapshot.md`.

## Non-Goals

This slice does not implement:

- Full enterprise IAM, SSO, SCIM, or organization sync.
- Multi-approver workflow.
- Durable replay of approval tokens after process restart.
- Builder-editable kernel rules.
- PolicyRule lifecycle expansion (`deny`, edit/delete, default posture mutation).
- Cross-store transaction guarantees.
- Hot reload.
- Runtime Agent release-mode governance.
- A production admin console with pagination, server-side filters, or database-backed search.

M2.3 should stay focused on **evidence visibility and narrative hardening**, not broad enterprise product management.

## Options Considered

### Option A - Permission Center product UI first

Build a full viewer-facing Permission Center with pending/resolved approvals, filters, detail drawers, action buttons, and admin-oriented interactions.

Pros:

- Strongest visible product surface.
- Easy for teammates to understand.

Cons:

- Risks spending time on UI workflows before the evidence contract is named and stable.
- Pulls in product decisions such as filters, roles, retention, and admin actions that are not required to prove M2.

### Option B - Evidence loop first, lightweight console second

Define the evidence chain as the M2.3 primitive-level story, expose it through a lightweight Governance Console in the demo/viewer, and make the tests read like the governance contract.

Pros:

- Balances outside-in narrative with engineering correctness.
- Uses the durable ledger already built in M2.2.
- Gives the next team snapshot a concrete story without overbuilding admin UI.
- Keeps Policy lifecycle and transaction/concurrency as later hardening workstreams.

Cons:

- The console will be demo-quality, not a full product Permission Center.
- Some enterprise concerns remain documented as gaps rather than implemented.

### Option C - Continue bottom-up hardening first

Move next to Policy lifecycle or transaction/concurrency before doing any console or snapshot work.

Pros:

- Improves deep correctness.
- Avoids demo surface work.

Cons:

- Delays team alignment.
- M2 remains hard to explain from outside because the visible story still looks like a prompt plus a lot of tests.

## Decision

Choose **Option B**.

M2.3 should define and demonstrate:

```text
Enterprise governance = authority separation + approval token + durable ledger + explainable evidence surface.
```

The implementation should be small enough to fit on top of existing M2.0-M2.2 primitives, but clear enough that `milestone-2-snapshot.md` can be drafted from it.

## Top-Level Thesis

M1 thesis:

```text
App definition is governed runtime data.
```

M2 thesis:

```text
AI-created software capability must be governed as an enterprise change,
not treated as a chat side effect.
```

M2.3 makes that thesis inspectable through seven questions:

| Question | Evidence source |
|---|---|
| Who asked? | `requested_principal` in permission ledger |
| What did they ask to change? | prompt `detail`, `capability`, `target`, `target_fingerprint` |
| Why could or couldn't they do it? | Authorization Kernel decision and stable `reason_code` |
| Who approved? | `permission_responded.decided_by` and `approval_token_issued.approved_by` |
| What authorized execution? | hashed approval token metadata, capability, target fingerprint, TTL |
| What actually executed? | `permission_execution_authorized` / `permission_execution_denied` |
| What was the final outcome? | `completed`, `failed`, `denied`, or `expired` derived request status |

This is the vocabulary the team-share snapshot should use.

## Architecture

### 1. Evidence Record Contract

`PermissionLedgerRequestRecord` already contains most of the required fields. M2.3 should treat the derived request record as the read model for Governance Console and tests.

The console should not replay raw JSONL events directly. It should consume a normalized shape:

```ts
type GovernanceEvidenceRecord = {
  prompt_id: string;
  status: "pending" | "allowed" | "denied" | "authorized" | "completed" | "failed" | "expired";
  live: boolean;
  tool: string;
  capability?: Capability;
  target?: AuthorizationTarget;
  target_fingerprint?: string;
  requested_principal?: Principal;
  decided_by?: { kind: "builder"; id: string };
  decision?: "allow" | "deny" | "allow-always";
  approved_by?: { kind: "builder"; id: string };
  approval_token_hash?: string;
  approved_capability?: Capability;
  approval_token_expires_at_ms?: number;
  approval_token_single_use?: true;
  execution_principal?: Principal;
  authorization_reason_code?: string;
  requested_at_ms: number;
  responded_at_ms?: number;
  completed_at_ms?: number;
  message?: string;
  detail: Record<string, unknown>;
};
```

This can initially be a type alias / normalizer around `PermissionLedgerRequestRecord`, not a new persistent model.

M2.3 should extend the derived read model where needed. The raw ledger already records token metadata, but the console should not need to inspect raw events to answer:

```text
Who approved?
Which scoped token authorized execution?
Who executed?
```

Execution principal can be explicit in `permission_execution_authorized` / `permission_execution_denied` events, or derived as `framework_system` only when the event is emitted by the framework approval-token path. The implementation plan should choose the smallest compatible path and cover it in tests.

### 2. Wire State

The existing `permission-ledger-state` envelope should remain the reconnect seed:

```ts
{
  type: "permission-ledger-state",
  state: {
    pending: PermissionLedgerRequestRecord[],
    recent: PermissionLedgerRequestRecord[]
  }
}
```

M2.3 should avoid adding a new envelope unless the current one cannot express the console. The design goal is to prove that M2.2's ledger state is sufficient for a first governance surface.

Potential small additions:

- expose a stable `recent` limit in the seed helper;
- ensure pending records include `live=false` for stale unresolved approvals;
- make status labels and reason-code display deterministic in viewer-react helpers.

### 3. Governance Console Surface

Add a lightweight console to the canonical M2 demo path, not a framework-wide product UI yet.

Suggested placement:

```text
examples/p5-viewer-approval-e2e
?scenario=capability-lifecycle&variant=governance
```

The layout should preserve the M1 learning pattern:

```text
left: end-user app + app data/definition surface
right: Builder / Agent / Governance Console
```

The console should show:

- **Now pending**: live approvals that can still be answered.
- **Evidence trail**: recent completed/denied/failed/expired requests.
- **Authority split**: requested principal vs execution principal.
- **Capability + target**: e.g. `policy:mutate -> policy_rule:reviewers-can-read-review-queue`.
- **Reason code**: stable kernel reason, not free-form prose.
- **Outcome**: completed / failed / denied / expired.

The console should use plain language:

```text
Agent proposed a policy mutation.
Builder approved it.
Framework executed it with a scoped single-use token.
The token was not persisted.
The operation completed.
```

This is intentionally more educational than a production admin table.

### 4. Viewer React Reuse

Add reusable presentation helpers only if the demo needs them:

- `formatPrincipal(principal)`
- `formatCapability(capability)`
- `formatTarget(target)`
- `formatPermissionStatus(status, live)`
- `formatReasonCode(reasonCode)`

Avoid a large exported `<PermissionCenter>` component in this slice unless it naturally falls out of the demo implementation. The stable contract is the evidence record, not the exact UI component.

### 5. Demo Narrative Hardening

The M2 demo should add a governance-readback layer to the existing M1 capability lifecycle:

```text
1. Agent proposes add_operation.
2. Governance Console shows build_agent can propose, not execute.
3. Builder approves.
4. Console shows token issued, hashed only.
5. Framework executes as framework_system.
6. Operation completes and app surface changes.
7. Repeat for View / PolicyRule / Rollback.
8. Show an expired or denied case to prove not every prompt becomes success.
```

The point is not to make the demo longer. The point is to let the audience read the same app change through a governance lens.

## Test-First Contract

The tests are the capability description. Implementation should start by writing failing tests that describe the evidence loop.

### Layer 1 - Core evidence derivation

File:

```text
packages/core/test/permission-ledger.test.ts
```

Required behaviors:

- derives a full completed approval chain from requested -> responded -> token issued -> authorized -> completed.
- derives denied requests without token/execution events.
- derives execution denied requests with stable `authorization_reason_code`.
- derives expired requests distinctly from denied and failed.
- exposes token metadata as hash/TTL/single-use evidence, not as a raw token id.
- exposes or deterministically derives `execution_principal` for framework-authorized execution.
- never exposes raw approval token ids.

### Layer 2 - Wire reconnect state

File:

```text
packages/core/test/wire-protocol/permission-ledger-seed.test.ts
packages/core/test/wire-protocol/seed-on-open.test.ts
```

Required behaviors:

- seeds pending live approvals as `live=true` plus live prompt envelope.
- seeds stale pending approvals as `live=false` without replaying prompt envelope.
- seeds recent completed/denied/failed/expired records.
- seed failure remains isolated from viewer connection.

### Layer 3 - Viewer state and presentation

File:

```text
packages/viewer-react/test/hooks.test.tsx
packages/viewer-react/test/GovernanceEvidence.test.tsx
```

Required behaviors:

- `usePneumaState` stores permission ledger state.
- pending and recent evidence records survive reconnect seed.
- status/reason/principal/target formatting is deterministic.
- UI distinguishes pending-live, pending-stale, denied, failed, expired, and completed.

### Layer 4 - Demo e2e

File:

```text
examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts
```

Required behaviors:

- governance variant shows a pending approval before Builder response.
- after approval, evidence trail shows requested -> approved -> authorized -> completed.
- deny path shows denied without mutation.
- expired path shows expired and not actionable.
- policy mutation evidence names `policy:mutate` and the concrete policy target.
- rollback evidence names `definition:rollback:execute` and the target history version.

### Layer 5 - Snapshot readiness

File:

```text
docs/archive/milestone-2-snapshot.md
```

Required content checks:

- M2 thesis is explicit.
- M2.0/M2.1/M2.2/M2.3 are summarized as one chain, not separate feature bullets.
- Remaining gaps are honest: Policy lifecycle, transaction/concurrency, production Permission Center, multi-approver, enterprise identity.
- Demo runbook points to the governance variant.

## Acceptance Criteria

M2.3 is complete when:

1. A teammate can open the demo and answer "why was this AI-created app change allowed?"
2. A teammate can inspect the console and see requested principal, approving actor, execution principal, capability, target, reason code, and final outcome.
3. The evidence surface survives viewer reconnect.
4. Denied/expired/failed are visually and semantically distinct from completed.
5. Tests cover the evidence chain without relying on screenshots.
6. `milestone-2-snapshot.md` can tell the M2 story from outside the implementation.

## Milestone 2 Snapshot Shape

M2 snapshot should not repeat all M1 material. It should start from:

```text
M1 proved: a Pneuma app can evolve its own app definition through governed primitives.
M2 proves: that evolution has enterprise-grade authority separation and evidence.
```

Recommended top sections:

1. **Executive Summary** - one paragraph and one diagram.
2. **M2 Thesis** - AI-created capability as enterprise change.
3. **Evidence Chain** - who asked / who approved / who executed / what happened.
4. **What Is Proven** - Authorization Kernel, approval token execution, durable ledger, governance console.
5. **Demo Story** - same capability lifecycle, read through governance.
6. **Security Model** - static kernel, Builder approval, framework_system execution, no durable raw token.
7. **Still Not Claimed** - IAM, deny rules, cross-store transactions, concurrency, production admin center.
8. **Next Decision Gate** - Policy lifecycle vs transaction/concurrency vs production Permission Center.

## Risks And Constraints

| Risk | Mitigation |
|---|---|
| Console becomes product UI too early | Keep it demo-quality and evidence-focused. |
| M2 story becomes too abstract | Anchor every claim to a visible record in the console. |
| Tests duplicate M2.1/M2.2 tests | Name tests around the full chain and viewer read model, not individual internals. |
| Ledger state implies durable approval replay | Say explicitly: durable facts, not durable executable credentials. |
| Snapshot overclaims enterprise readiness | Keep "Still Not Claimed" prominent. |

## Implementation Notes

- Prefer extending the existing canonical demo over adding another example.
- Keep wire protocol version stable unless a missing field forces a change.
- Keep raw ledger event inspection available in tests, but make UI consume derived records.
- Avoid adding new framework primitives.
- Treat wording as part of the feature: labels should teach authority separation clearly.

## Open Follow-Ups After M2.3

After M2.3, the next real decision should be:

```text
Do we harden policy lifecycle next,
or do we harden transaction/concurrency next?
```

The likely order is:

1. Policy lifecycle, because it extends the governance story users can understand.
2. Transaction/concurrency, because it is required before enterprise claims become production-grade.
3. Production Permission Center, when there is an actual host/meta-app surface.
