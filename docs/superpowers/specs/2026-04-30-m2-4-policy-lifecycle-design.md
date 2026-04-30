# M2.4 Policy Lifecycle Design

**Date:** 2026-04-30
**Status:** Draft for user review
**Milestone:** M2 - Enterprise Governance Hardening
**Builds on:** `2026-04-29-m2-3-governance-evidence-loop-design.md`

中文摘要：

> M2.0-M2.3 已经证明 AI-created software capability 可以通过 Kernel、approval token、permission ledger 和 governance evidence surface 被治理。M2.4 要把 app policy 从“只能新增 allow rule”的 MVP 形态推进到可治理生命周期：policy rule 可以被修改、删除、解释，并且这些操作继续走同一套 app-definition / approval / ledger / rollback primitive。

## Goal

Make app policy governable as runtime definition data, not as an append-only demo artifact.

Target chain:

```text
Builder asks Agent to change access
  -> Agent proposes a policy lifecycle operation
  -> Authorization Kernel requires approval for framework policy mutation
  -> Builder approves
  -> framework_system updates or deletes pneuma_policy_rules
  -> app_history records the definition change
  -> permission ledger records approval and execution evidence
  -> policy.explain can tell the Agent and Builder why access is allowed or denied
```

M2.4 is not a full enterprise IAM system. It is the first slice where app policy has a lifecycle and an explanation surface.

## Current State

Already implemented:

- `pneuma_policy_rules` is a system-owned Table.
- `add_policy_rule` creates Builder-owned app policy rows through the framework operation pipeline.
- App history captures policy-rule addition as app-definition history.
- Definition rollback can remove overlay policy rules.
- Authorization Kernel separates `build_agent`, `builder`, and `framework_system` authority.
- Approval tokens and permission ledger record framework-level mutation evidence.
- Governance evidence panel can show who proposed, who approved, what token authorized execution, and what completed.

Remaining gap:

- Policy rules are append-only from the Builder/Agent point of view.
- There is no first-class update operation for an existing policy rule.
- There is no first-class delete operation except rollback.
- There is no agent-facing explanation operation for "why can/can't this principal access this resource?".
- `deny` semantics and default-posture mutation are still intentionally absent, but the docs and tests need to make that boundary explicit.

## Non-Goals

This slice does not implement:

- Explicit deny rules.
- Deny/allow precedence semantics.
- Default posture mutation.
- Organization hierarchy, groups, SSO, SCIM, tenant sync, or external IAM import.
- Multi-approver policy workflows.
- A full Permission Center product UI.
- Runtime Agent policy editing in release mode.
- A policy DSL.
- Durable approval-token replay after process restart.

M2.4 should keep the policy evaluator's semantic model stable:

```text
allow if a policy rule matches;
otherwise follow default posture.
```

Denied access can still happen through `default_posture: restricted` plus no matching allow rule. It is not yet an explicit deny rule.

## Options Considered

### Option A - Engine-first deny semantics

Add explicit `effect: "allow" | "deny"` or a dedicated deny rule shape, define deny precedence, migrate `pneuma_policy_rules`, and update evaluator explanations.

Pros:

- Stronger enterprise security vocabulary.
- Moves directly toward a real policy engine.

Cons:

- Changes the evaluator semantics and storage contract in the same slice.
- Forces precedence decisions before lifecycle evidence is proved.
- Increases migration and rollback complexity.
- Makes it harder to tell which behavior changed because policy is mutable versus because policy semantics changed.

### Option B - Lifecycle-first policy operations

Add `update_policy_rule`, `delete_policy_rule`, and `policy.explain` while keeping allow-only policy semantics.

Pros:

- Turns policy from append-only to governable definition data.
- Reuses M2 approval-token and ledger paths.
- Gives agents a precise explanation surface for access failures.
- Keeps evaluator semantics stable.
- Creates a clear demo: grant, narrow, revoke, explain.

Cons:

- Does not yet satisfy the full enterprise "explicit deny" expectation.
- Default posture still requires developer-level configuration rather than Builder-time mutation.

### Option C - Permission Center first

Build a visible admin surface for current policy rules and governance evidence before expanding operations.

Pros:

- Strong outside-in product story.
- Easier for teammates to inspect.

Cons:

- Risks polishing a UI around an incomplete policy lifecycle.
- Does not solve the append-only rule limitation.

## Decision

Choose **Option B**.

M2.4 should prove:

```text
Policy is governed app-definition data with lifecycle operations and explainable decisions.
```

The first implementation should add lifecycle and explanation without changing the evaluator's allow-only semantics. Explicit deny and default-posture mutation should become a separate design gate after the team has reviewed the lifecycle model.

## DDD Review

This slice should keep the domain model crisp before TDD starts.

### Aggregate Boundary

`PolicySet` remains the aggregate for app policy rules.

M2.4 should add update behavior at the aggregate level rather than letting runtime handlers patch JSON rows directly:

```text
PolicySet.addRule
PolicySet.updateRule
PolicySet.removeRule
PolicySet.setDefaultPosture
```

`setDefaultPosture` already exists but should stay developer-level / non-Builder-exposed in this slice.

The aggregate should own invariants:

- rule identity is unique;
- `allow` is non-empty;
- `do` is non-empty;
- subject/action/resource vocabularies are closed;
- `when` is a valid `WhereClause`;
- version increments once per successful mutation.

### Persistence Projection

`pneuma_policy_rules` is a system-owned persistence projection of policy rules plus definition metadata.

DDD boundary:

```text
PolicyRule = domain concept
PneumaPolicyRuleEntry = definition-row projection + attribution/version metadata
Row = storage representation
```

`update_policy_rule` should preserve both:

- domain identity: `rule_id`
- storage identity: row `id`

and advance `definition_version`. Tests should assert row identity preservation explicitly so updates do not accidentally become delete+insert.

### Domain Service Boundary

`PolicyEvaluator` is the domain service that answers policy decisions. `policy.explain` should call the same evaluator logic as enforcement.

It should not reimplement matching logic in a framework operation, demo harness, or viewer.

M2.4 should expose a public explanation reason union that excludes `explicit-deny` until explicit deny semantics exist:

```text
explicit-allow
default-public
default-restricted-no-match
```

The existing reserved `explicit-deny` type should not leak into the agent-facing `policy.explain` schema in this slice.

### Capability Boundary

Policy lifecycle mutation is governed by `policy:mutate`, not generic `definition:apply`.

Even when invoked through the `definition.apply` tool, policy changes should produce authorization metadata like:

```text
capability: policy:mutate
target: policy_rule:<rule_id>
```

This keeps approval tokens scoped to policy mutation instead of granting broad definition mutation authority.

### Language Boundary

In M2.4, "deny" means an evaluation result, not an explicit deny rule.

Allowed language:

```text
Bob is denied because default posture is restricted and no allow rule matched.
```

Avoided language:

```text
Bob matched a deny rule.
```

The demo, tests, and agent-facing output should use `default-restricted-no-match` to keep that distinction visible.

### Rollback Boundary

App history snapshots remain the source of truth for rollback.

For policy lifecycle changes:

- update rollback means restoring the previous rule snapshot;
- delete rollback means restoring the removed rule snapshot;
- if current state has changed since the target history version, validation should surface a conflict before execution.

This keeps rollback as a governed definition restoration, not a blind row overwrite.

## Top-Level Thesis

M2.3 thesis:

```text
AI-created software capability must be governed as an enterprise change.
```

M2.4 adds:

```text
Enterprise policy must itself be a governed software capability,
not an invisible conditional hidden in app code.
```

This matters for the Agent:

```text
When the Agent cannot complete a request, it should be able to say:
"I cannot do that because this principal lacks a matching policy rule for this resource/action."
```

That explanation should come from the framework, not from the Agent guessing.

## Architecture

### 1. Policy Lifecycle Operations

Add two framework operations:

```text
update_policy_rule
delete_policy_rule
```

Both operations mutate `pneuma_policy_rules` and append app-history entries through the same definition-as-data pipeline used by `add_policy_rule`.

Both operations should:

- require framework approval when invoked through `require_approval: true`;
- execute as `framework_system` after approval-token authorization;
- record permission ledger evidence;
- participate in definition rollback validation/execution where possible;
- reject framework-owned/internal targets;
- return typed object output, not `void`.

### 2. update_policy_rule

Purpose:

```text
Change an existing Builder-owned policy rule without creating a second shadow rule.
```

Proposed input:

```ts
type UpdatePolicyRuleInput = {
  rule_id: string;
  allow?: Subject[];
  actions?: Action[];
  resource?: Resource;
  when?: PolicyCondition | null;
};
```

Rules:

- `rule_id` must reference an existing row in `pneuma_policy_rules`.
- The target rule must be app-owned/overlay policy data, not a framework internal invariant.
- At least one mutable field must be supplied.
- `allow`, if supplied, must remain non-empty.
- `actions`, if supplied, must remain non-empty.
- `when: null` clears the condition.
- The operation should preserve row identity and advance `definition_version`.
- The operation should record a before/after diff in app history detail.

Proposed output:

```ts
type UpdatePolicyRuleOutput = {
  rule_id: string;
  updated: true;
  previous_definition_version: number;
  definition_version: number;
  changed_fields: string[];
};
```

### 3. delete_policy_rule

Purpose:

```text
Remove a Builder-owned policy rule through an auditable app-definition mutation.
```

Proposed input:

```ts
type DeletePolicyRuleInput = {
  rule_id: string;
};
```

Rules:

- `rule_id` must reference an existing row in `pneuma_policy_rules`.
- Deleting a missing rule should fail clearly, not become a silent no-op.
- The target rule must be app-owned/overlay policy data.
- The operation should append app history with the removed rule snapshot.
- The operation should make the rule disappear from `/api/config` and policy evaluation after reload/rebuild of the definition state.

Proposed output:

```ts
type DeletePolicyRuleOutput = {
  rule_id: string;
  deleted: true;
  previous_definition_version: number;
  definition_version: number;
};
```

### 4. policy.explain

Purpose:

```text
Give Builder, Agent, and future admin UI a stable answer for why access is allowed or denied.
```

This should be a read-only framework operation. It does not mutate app definition.

Proposed input:

```ts
type PolicyExplainInput = {
  principal: Principal;
  action: Action;
  resource: Resource;
};
```

Proposed output:

```ts
type PolicyExplainOutput = {
  decision: "allow" | "deny";
  reason_code:
    | "explicit-allow"
    | "default-public"
    | "default-restricted-no-match";
  matched_rule_ids: string[];
  default_posture: "public" | "restricted";
  principal: Principal;
  action: Action;
  resource: Resource;
};
```

Rules:

- Explanation must use the same evaluator logic as enforcement.
- It must not invent policy decisions in the viewer or demo harness.
- If multiple allow rules match, return all matched ids.
- For restricted default posture with no match, return `decision: "deny"` and `reason_code: "default-restricted-no-match"`.
- No `explicit-deny` reason should appear until explicit deny semantics are implemented.

### 5. Definition Apply Integration

Extend `definition.apply` with changes:

```ts
type PolicyLifecycleDefinitionChange =
  | { kind: "update_policy_rule"; ... }
  | { kind: "delete_policy_rule"; ... };
```

The adapter should map these changes to the framework operations rather than duplicating mutation logic.

This keeps the agent-facing story consistent:

```text
definition.apply is the batch app-definition mutation surface;
policy lifecycle operations are the primitive executors.
```

### 6. Rollback Semantics

Rollback support should be conservative:

- If `update_policy_rule` records before/after snapshots, rollback can restore the previous policy row.
- If `delete_policy_rule` records the removed rule snapshot, rollback can restore the policy row.
- If a later version already changed the same `rule_id`, rollback validation should report a conflict instead of overwriting silently.

The first implementation can choose validate-only conflict detection if full restoration is larger than expected, but the test names must make the limitation explicit.

### 7. Governance Evidence

M2.4 should not add a new ledger model.

The existing permission ledger should show lifecycle operations as ordinary framework-governed mutations:

```text
tool: update_policy_rule | delete_policy_rule | definition.apply
capability: policy:mutate
target: policy_rule:<rule_id>
requested_principal: build_agent
execution_principal: framework_system
```

If operation scope currently uses different target names, the implementation should normalize enough for the governance evidence panel and tests to read policy lifecycle records clearly.

## Demo Story

The team-facing demo should use a concrete enterprise story rather than policy jargon:

```text
Reader Bookmarks has a review queue.
Only Alice can review it.
Bob tries to access it and is denied.
Builder asks Agent to let Bob review only this queue.
Agent proposes a policy update.
Builder approves.
Bob can access the review queue.
Builder asks Agent to revoke Bob.
Agent deletes or narrows the policy rule.
Bob is denied again.
policy.explain shows the exact reason each time.
```

The visible learning:

```text
The app did not gain a hidden if-statement.
The app definition gained, changed, and removed governed policy rows.
The framework can explain the result.
```

## Test Strategy

Tests should be written before implementation and named as capability statements.

### Core policy tests

- `PolicySet` can update an existing allow rule and preserve rule identity.
- `PolicySet` rejects updates that would leave `allow` empty.
- `PolicySet` rejects updates that would leave `actions` empty.
- `PolicySet` deletes an existing rule.
- `PolicySet` reports a clear error for deleting a missing rule.
- `PolicySet` explanation returns `explicit-allow` with matched rule ids.
- `PolicySet` explanation returns `default-restricted-no-match` when restricted and no rule matches.
- No explanation emits `explicit-deny` before deny semantics exist.

### Framework operation tests

- `update_policy_rule` mutates `pneuma_policy_rules` and appends app history.
- `delete_policy_rule` removes from `pneuma_policy_rules` and appends app history.
- Both operations require approval when called through the governed path.
- Both operations execute as `framework_system` after approval-token authorization.
- Both operation outputs include typed object payloads.
- Both operations reject framework/internal targets.

### Definition apply tests

- `definition.apply` can batch `update_policy_rule`.
- `definition.apply` can batch `delete_policy_rule`.
- `definition.apply` records policy lifecycle changes in the same history path as other definition changes.
- Policy lifecycle failures roll back the batch without partial invisible policy state.

### Rollback tests

- Rollback validation reports the effect of restoring an updated policy rule.
- Rollback execution restores a deleted policy rule if the removed snapshot is still conflict-free.
- Rollback validation reports a conflict when the same policy rule has changed after the target history version.

### Demo/viewer tests

- Demo can show Alice allowed and Bob denied before policy update.
- Demo can show Bob allowed after policy lifecycle approval.
- Demo can show Bob denied again after policy deletion or narrowing.
- Governance evidence panel displays the policy lifecycle operation and final status.
- `policy.explain` output is visible enough for the Agent-side narrative.

## Acceptance Criteria

M2.4 is complete when:

- Policy lifecycle operations exist as framework operations with typed contracts.
- `definition.apply` supports policy update/delete changes.
- `policy.explain` exposes evaluator-backed allow/deny reasoning.
- Policy lifecycle mutations are captured in app history and permission ledger evidence.
- Tests cover lifecycle, approval, explanation, rollback, and demo behavior.
- `milestone-2-snapshot.md` is updated to move policy lifecycle from "still open" to "proved for edit/delete/explain; explicit deny/default posture still open".

## Risks

| Risk | Mitigation |
|---|---|
| Policy lifecycle looks like full IAM | State non-goals clearly and keep explicit deny/default posture deferred. |
| Agent interprets deny as explicit deny | `policy.explain` must use `default-restricted-no-match` until explicit deny exists. |
| Update/delete accidentally target framework invariants | Only allow app-owned/overlay policy rows and add negative tests. |
| Rollback overwrites later policy edits | Add conflict validation before restoration. |
| Demo becomes too abstract | Use named users, a visible review queue, and side-by-side explain output. |

## Open Follow-Up

After M2.4, the next policy design gate should decide whether explicit deny enters as:

```text
PolicyRule.effect = "allow" | "deny"
```

or as a separate deny-rule table/shape. That decision should be made with precedence, migration, explanation, and enterprise admin UX considered together.
