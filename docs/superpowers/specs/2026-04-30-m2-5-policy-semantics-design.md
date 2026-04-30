# M2.5 Explicit Policy Semantics Design

**Date:** 2026-04-30
**Status:** Draft for implementation
**Milestone:** M2 - Enterprise Governance Hardening
**Builds on:** `2026-04-30-m2-4-policy-lifecycle-design.md`

中文摘要：

> M2.4 证明 policy rule 可以作为 app-definition data 被新增、修改、删除、解释和回滚。M2.5 要证明 policy 本身的企业语义也不是一句口号：explicit deny、deny precedence、default posture mutation 都必须进入同一套 definition / approval / ledger / rollback 链路。

## Goal

Make app policy semantics enterprise-readable without turning this slice into an IAM product.

Target chain:

```text
Builder asks Agent to lock down or open access
  -> Agent proposes an explicit policy semantics change
  -> Authorization Kernel requires policy:mutate approval
  -> Builder approves
  -> framework_system mutates policy definition data
  -> app_history records the semantic change
  -> PolicyEvaluator enforces deny precedence or new default posture
  -> policy.explain reports the exact reason code
```

## Current State

Implemented in M2.4:

- `pneuma_policy_rules` stores Builder-authored allow rules.
- `add_policy_rule`, `update_policy_rule`, and `delete_policy_rule` mutate policy rows through framework Operations.
- `policy.explain` returns `explicit-allow`, `default-public`, or `default-restricted-no-match`.
- `PolicySet.updateRule` preserves rule identity and validates rule invariants.
- Definition rollback can restore updated or deleted policy-rule rows.

Remaining enterprise semantics gap:

- There is no explicit deny rule.
- There is no deny-over-allow precedence.
- Default posture is still a developer-level `AppConfig.policy` setting, not governed app-definition data.
- Agents cannot distinguish "denied because a deny rule matched" from "denied because no allow rule matched under restricted posture."

## Non-Goals

This slice does not implement:

- Group hierarchy, org units, SSO, SCIM, external IAM sync, or tenant RBAC import.
- Policy priority numbers, arbitrary rule ordering, or a policy DSL.
- Multi-approver policy workflow.
- Runtime Agent policy editing in Release mode.
- Permission Center product UI.
- Hot reload for policy changes.
- Cross-store transactions or concurrency control.

## Decision

Choose the minimal enterprise semantics slice:

```text
PolicyRule.effect = allow | deny
deny rules beat allow rules
default posture can be changed through a governed framework Operation
policy.explain reports explicit-deny when a deny rule matched
```

M2.5 keeps the M2.4 lifecycle model and adds semantics. It should not redesign the policy engine into an IAM platform.

## DDD Review

### Aggregate Boundary

`PolicySet` remains the aggregate for policy semantics.

`PolicyRule` gains an effect:

```ts
type PolicyEffect = "allow" | "deny";

type PolicyRule = {
  id: string;
  effect?: PolicyEffect; // omitted means "allow" for backward compatibility
  allow: Subject[];
  do: Action[];
  on: Resource;
  when?: WhereClause;
};
```

The `allow` field remains the subject selector for this slice, even for deny rules. This is intentionally backward-compatible with existing rule shape. A future rename to `subjects` would be a separate migration.

`PolicySet` owns these invariants:

- effect is either `allow` or `deny`;
- omitted effect normalizes to `allow`;
- rule id remains unique;
- subject/action/resource/when invariants from M2.4 still hold;
- default posture remains either `public` or `restricted`.

### Domain Service Boundary

`PolicyEvaluator` owns precedence:

```text
matching explicit deny -> deny explicit-deny
else matching explicit allow -> allow explicit-allow
else default posture public -> allow default-public
else default posture restricted -> deny default-restricted-no-match
```

Precedence is semantic, not order-based. A deny rule should win regardless of where it appears in the rule list.

`policy.explain` must call the same evaluator as enforcement. It must not reimplement matching logic in runtime handlers or viewers.

### Persistence Projection Boundary

`pneuma_policy_rules` remains the projection for rules and gains an `effect` column.

Compatibility rule:

```text
old row without effect -> allow
new row without effect input -> allow
new row with effect: deny -> explicit deny rule
```

Default posture is not a rule. It should be stored separately as `pneuma_policy_settings`, a system-owned Table with one current setting row per app-level policy setting.

Proposed row:

```ts
type PneumaPolicySettingEntry = {
  id: string;
  app_id: string;
  setting_id: "default_posture";
  value: { app: "public" | "restricted" };
  created_by: string;
  created_by_kind: ActorKind;
  definition_version: number;
};
```

This keeps rules and app-level policy settings separate. It also lets rollback restore settings through the same app-history snapshot pattern as other definition data.

### Capability Boundary

All policy semantics mutation uses:

```text
capability: policy:mutate
```

Targets:

```text
policy_rule:<rule_id>
policy_setting:default_posture
```

The Authorization Kernel boundary from M2.0-M2.4 remains unchanged: Build-phase Agent can propose; `framework_system` executes after Builder approval.

## Architecture

### 1. Explicit Rule Effect

Add `effect` support to:

- `PolicyRule` / `PolicyRuleUpdate`
- `pneuma_policy_rules` row encoding and decoding
- `add_policy_rule`
- `update_policy_rule`
- `/api/config.policy_rules`
- definition.apply predicted diff and real diff
- rollback impact for updated/restored policy rules

Agent-facing behavior:

```json
{
  "id": "deny-contractors-review-queue",
  "effect": "deny",
  "allow": [{ "kind": "role", "name": "contractor" }],
  "actions": ["read"],
  "resource": { "kind": "view", "id": "review_queue" }
}
```

### 2. Deny Precedence

`PolicyEvaluator.check()` should gather matching deny and allow rules independently.

Expected behavior:

```text
allow reviewer read review_queue
deny contractor read review_queue
user has roles reviewer + contractor
=> deny explicit-deny, matched_rule_ids includes deny rule
```

This keeps precedence deterministic and order-independent.

### 3. Default Posture Setting

Add framework Operation:

```text
set_default_posture
```

Input:

```ts
type SetDefaultPostureInput = {
  app: "public" | "restricted";
};
```

Output:

```ts
type SetDefaultPostureOutput = {
  setting_id: "default_posture";
  previous_default_posture: { app: "public" | "restricted" };
  default_posture: { app: "public" | "restricted" };
  definition_version: number;
  updated: true;
};
```

Rules:

- Missing or invalid posture fails clearly.
- Same-value update fails as no-op.
- Operation writes `pneuma_policy_settings`.
- On restart, the loader applies the latest `default_posture` setting to `runtime.policy`.
- Change appends an `app_history` snapshot.
- Definition rollback can restore or remove the policy setting overlay.

### 4. policy.explain

`policy.explain` output reason codes become:

```text
explicit-deny
explicit-allow
default-public
default-restricted-no-match
```

Agent-facing explanation should use stable reason codes. Human wording can be layered later by viewers.

## Testing Strategy

Tests should lead implementation in this order:

1. `PolicySet` accepts `effect: deny`, rejects invalid effects, defaults omitted effect to allow.
2. `PolicyEvaluator` denies when both deny and allow match, independent of rule order.
3. `pneuma_policy_rules` round-trips `effect` and defaults legacy missing effect to allow.
4. Runtime `add_policy_rule` / `update_policy_rule` persist and expose effect.
5. Runtime `policy.explain` returns `explicit-deny` for a matching deny rule.
6. New `pneuma_policy_settings` table round-trips default posture setting.
7. Runtime `set_default_posture` persists setting and affects policy after restart.
8. Core `definition.apply` supports deny effect and default posture mutation.
9. Authorization metadata scopes default posture mutation to `policy:mutate` and `policy_setting:default_posture`.
10. Rollback validates and executes default posture restoration.

## Acceptance Criteria

M2.5 is complete when:

- explicit deny can be created through `definition.apply`;
- deny wins over allow in enforcement and explain;
- default posture can be changed through `definition.apply`;
- both rule effect and default posture changes are covered by approval-token / ledger paths;
- rollback can restore policy rule effect changes and default posture changes;
- `/api/config` exposes enough policy metadata for a team demo;
- docs name remaining non-goals instead of implying full IAM.

## Remaining Open After M2.5

- Production Permission Center.
- External IAM / SSO / SCIM.
- Policy priority or conflict diagnostics beyond deny precedence.
- Transaction boundary between definition row writes and app-history append.
- Concurrent policy edits and optimistic version checks.
