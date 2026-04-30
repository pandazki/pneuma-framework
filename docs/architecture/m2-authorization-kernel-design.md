# M2 Authorization Kernel Design

**Date:** 2026-04-28
**Status:** Draft for user review
**Milestone:** M2 — Enterprise Governance Hardening
**Scope:** first governance-hardening slice after M1; test-first by contract.

中文摘要：

> M2 第一刀不是做完整企业 IAM，也不是继续加新的 app primitive，而是把 framework primitive 的权力边界立住：谁可以提出 definition change，谁可以批准，谁可以执行，谁只能消费 app surface。测试矩阵就是能力描述本身，production code 只能为了让这些测试通过而生长。

## Goal

Introduce an **Authorization Kernel** that decides whether a principal can use a framework capability before the existing app policy evaluator runs.

```text
request
  -> identify principal
  -> authorize framework capability
  -> evaluate app policy when relevant
  -> execute operation
```

M1 proved that app definition can be mutated through governed framework operations. M2 must now answer:

> Who is allowed to drive those framework operations?

## Non-Goals

This slice intentionally does **not** implement:

- SSO, SCIM, enterprise org sync, or identity-provider integration.
- A durable product permission center UI.
- Full policy lifecycle (`deny`, edit/delete PolicyRule, default posture mutation).
- Builder-editable framework governance configuration.
- Cross-store transaction guarantees.
- Builder-authored code-handler authorization.
- Runtime Agent release-mode behavior.

Those belong to later M2/M3 workstreams. This design only establishes the authorization seam they will use.

## Core Distinction

M1 already has app policy:

```text
Can reviewer read view:review_queue?
Can guest invoke operation:list_bookmark_urls?
```

M2 adds framework authorization:

```text
Can build_agent apply definition changes?
Can builder approve policy mutation?
Can framework_system execute a rollback after approval?
Can reviewer mutate app definition?
```

The two layers are deliberately separate:

| Layer | Decides | Example |
|---|---|---|
| Authorization Kernel | Access to framework capabilities | `build_agent` cannot `definition:apply` without approval |
| App Policy Evaluator | Access to app resources | `reviewer` can `read view:review_queue` |

This avoids making `PolicyRule` powerful enough to rewrite its own governance boundary.

## Static Kernel, Developer-Time Extensions

The Authorization Kernel is **static after deployment**. It is not an app-definition primitive and it is not Builder-editable.

There are three different mutability levels:

| Layer | Mutability | Who changes it |
|---|---|---|
| Built-in kernel invariants | Static | `pneuma-framework` source code |
| Kernel extensions | Static after deploy | Developer / template / enterprise edition code |
| App policy | Dynamic and governed | Builder through Agent, approval, and `definition.apply` |

This means a Developer can extend the kernel while building a template or enterprise distribution, but the Builder cannot rewrite kernel authority during the build phase.

Examples of built-in invariants:

```text
build_agent cannot directly apply definition changes
framework_system can execute only with a matching approval token
end_user cannot mutate app definition
runtime_agent cannot use build-time definition mutation in this slice
```

Examples of developer-time extensions:

```text
enterprise_admin can approve policy mutation
security_reviewer must co-approve rollback execution
runtime_agent may invoke a template-declared runtime capability
approval token TTL is 10 minutes for this deployment
```

Extension rule:

> Developer extensions may add principals, add capabilities, narrow access, or fill explicit extension slots. They may not override built-in invariants.

This keeps the kernel extensible for enterprise distributions without turning it into a second Builder-editable policy language.

## Model

### Principal

```ts
type Principal =
  | { kind: "builder"; id: string }
  | { kind: "build_agent"; id: string; acting_for: { kind: "builder"; id: string } }
  | { kind: "runtime_agent"; id: string; acting_for?: { kind: "end_user"; id: string } }
  | { kind: "end_user"; id: string; roles: string[] }
  | { kind: "framework_system"; id: "framework" };
```

MVP defaults:

- local Builder id defaults to `default`.
- opencode / MCP tool calls enter as `build_agent`, not owner.
- framework execution after approval enters as `framework_system`.
- demo end users enter as `end_user` with roles such as `reviewer` or `guest`.

### Capability

```ts
type Capability =
  | "definition:propose"
  | "definition:apply"
  | "definition:approve"
  | "definition:rollback:validate"
  | "definition:rollback:execute"
  | "policy:propose"
  | "policy:approve"
  | "policy:mutate"
  | "operation:invoke"
  | "view:read";
```

The first slice focuses on framework capabilities:

- `definition:*`
- `policy:*`

`operation:invoke` and `view:read` remain primarily app-policy decisions, but the kernel can deny framework-internal operations before app policy is consulted.

### Authorization Context

```ts
interface AuthorizationContext {
  readonly workspace_id: string;
  readonly app_id: string;
  readonly session_id?: string;
  readonly trace_id?: string;
  readonly target?: {
    readonly kind: "definition" | "policy_rule" | "operation" | "view" | "rollback_target";
    readonly id?: string;
  };
  readonly approval_token?: ApprovalToken;
}
```

### Approval Token

```ts
interface ApprovalToken {
  readonly token_id: string;
  readonly approved_by: { kind: "builder"; id: string };
  readonly approved_capability: Capability;
  readonly workspace_id: string;
  readonly app_id: string;
  readonly target_fingerprint: string;
  readonly issued_at_ms: number;
  readonly expires_at_ms: number;
  readonly single_use: true;
}
```

MVP storage:

- The kernel accepts an `ApprovalTokenStore` interface.
- The first implementation is in-memory and single-process, backed by the existing permission prompt response.
- A later permission center can replace the store without changing the kernel contract.
- Approval token policy, such as TTL, is deployment/static configuration for this slice, not Builder-editable app policy.

### Authorization Decision

```ts
type AuthorizationDecision =
  | {
      decision: "allow";
      reason_code: "allowed";
      principal: Principal;
      capability: Capability;
    }
  | {
      decision: "deny";
      reason_code:
        | "principal_not_allowed"
        | "approval_required"
        | "approval_missing"
        | "approval_capability_mismatch"
        | "approval_target_mismatch"
        | "approval_expired"
        | "approval_already_used"
        | "workspace_mismatch"
        | "app_mismatch"
        | "framework_internal_not_public";
      message: string;
      principal: Principal;
      capability: Capability;
    };
```

Denial reason codes are agent-facing and test-stable. They should not be treated as incidental error text.

## Capability Contract

The kernel starts with a small explicit rule table.

| Principal | Capability | Decision |
|---|---|---|
| `build_agent` | `definition:propose` | allow |
| `build_agent` | `definition:apply` | deny as direct execution; must transition through Builder approval to `framework_system` |
| `build_agent` | `definition:rollback:validate` | allow |
| `build_agent` | `policy:propose` | allow |
| `build_agent` | `policy:mutate` | deny as direct execution; must transition through Builder approval to `framework_system` |
| `builder` | `definition:approve` | allow in own workspace/app for apply or rollback execution |
| `builder` | `policy:approve` | allow in own workspace/app |
| `framework_system` | `definition:apply` | allow only with valid single-use approval token |
| `framework_system` | `definition:rollback:execute` | allow only with valid single-use approval token |
| `framework_system` | `policy:mutate` | allow only with valid single-use approval token |
| `end_user:reviewer` | `view:read` | defer to app policy |
| `end_user:reviewer` | `definition:apply` | deny |
| `end_user:guest` | `view:read` | defer to app policy |
| `end_user:guest` | `definition:apply` | deny |
| `runtime_agent` | `definition:*` | deny in this slice |

Important consequence:

```text
Build-phase Agent proposes.
Builder approves.
Framework system executes.
End user consumes.
```

No single actor silently spans all four steps.

## Test-First Contract

The tests are the design surface. Implementation work should start by writing the tests below and watching them fail.

### Layer 1 — Pure Authorization Kernel Tests

File:

```text
packages/core-domain/test/services/authorization-kernel.test.ts
```

Required tests:

```ts
test("build_agent can propose definition changes");
test("build_agent can validate rollback impact");
test("build_agent cannot apply definition changes without builder approval");
test("build_agent cannot spend a builder approval token directly");
test("build_agent cannot mutate policy without builder approval");
test("builder can approve definition apply in owned workspace");
test("builder cannot approve definition apply in another workspace");
test("framework_system can execute definition apply with a valid approval token");
test("framework_system can mutate policy with a valid approval token");
test("framework_system cannot execute definition apply with a mismatched approval token");
test("framework_system cannot reuse a single-use approval token");
test("developer extension can add a static enterprise approver principal");
test("developer extension cannot override build_agent direct-apply invariant");
test("reviewer can defer view read to app policy");
test("reviewer cannot mutate app definition");
test("guest cannot mutate app definition");
test("runtime_agent cannot mutate app definition in this slice");
test("denial includes stable reason code, principal, and capability");
```

Expected contract examples:

```ts
expect(decision).toMatchObject({
  decision: "deny",
  reason_code: "approval_required",
  capability: "definition:apply",
  principal: { kind: "build_agent" }
});
```

```ts
expect(decision).toMatchObject({
  decision: "allow",
  reason_code: "allowed",
  capability: "definition:propose",
  principal: { kind: "build_agent" }
});
```

### Layer 2 — Framework Operation Gate Tests

Files:

```text
packages/core/test/tools/definition-authorization.test.ts
packages/core/test/tools/definition-apply.test.ts
```

Required tests:

```ts
test("definition.apply validate mode is allowed as build_agent proposal");
test("definition.apply apply mode rejects build_agent without approval token");
test("definition.apply apply mode executes as framework_system after builder approval");
test("definition.apply add_policy_rule requires policy mutate approval");
test("definition.rollback.prepare can be proposed by build_agent");
test("definition.rollback.execute requires approved destructive rollback token");
test("framework_internal operations remain implementation-only and never public-surface");
test("denied framework operation returns authorization reason code to agent");
```

The first implementation should keep current approval UX working, but route the final mutation through the kernel:

```text
existing prompt response
  -> mint single-use ApprovalToken
  -> framework_system executes requested capability with token
```

### Layer 3 — Runtime / Demo Behavior Tests

Files:

```text
examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts
```

Required tests:

```ts
test("agent proposal requires builder approval before definition apply");
test("reviewer can consume policy-granted Review Queue but cannot mutate definition");
test("guest remains blocked from Review Queue and cannot mutate definition");
test("rollback execute requires builder-approved destructive token");
```

The demo does not need a full permission center yet. It only needs to make the actor boundary visible enough that the team can see:

```text
Agent proposed
Builder approved
Framework executed
Reviewer consumed
Guest denied
```

## Implementation Shape

The planned file boundaries are:

| File | Responsibility |
|---|---|
| `packages/core-domain/src/value-objects/authorization.ts` | `Principal`, `Capability`, `AuthorizationContext`, `AuthorizationDecision`, `ApprovalToken` |
| `packages/core-domain/src/services/authorization-kernel.ts` | Pure decision logic plus developer-time extension slots; no runtime process, no HTTP, no viewer dependency |
| `packages/core-domain/test/services/authorization-kernel.test.ts` | Layer 1 contract tests |
| `packages/core/src/tools/authorization-context.ts` | Convert tool/session inputs into `Principal` + `AuthorizationContext` |
| `packages/core/src/tools/approval-token-store.ts` | MVP in-memory token mint/consume implementation behind an interface |
| `packages/core/src/tools/action.ts` | Gate `definition.apply`, rollback, and policy mutation paths |
| `packages/core/test/tools/definition-authorization.test.ts` | Layer 2 tool-gate tests |
| `examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts` | Layer 3 story tests |

YAGNI boundary:

- Do not add a database table for approvals in this first slice.
- Do not add org/team/group models.
- Do not introduce a Builder-editable policy language for framework authorization.
- Do not replace app policy evaluator.

## Data Flow

### Agent Proposal

```text
build_agent calls definition.apply(mode="validate")
  -> Authorization Kernel checks definition:propose
  -> allow
  -> return predicted diff / impact
```

### Builder Approval

```text
viewer permission prompt returns allow
  -> Builder principal approves definition:apply or policy:mutate
  -> ApprovalToken minted for target fingerprint
```

### Framework Execution

```text
framework_system calls execution path with ApprovalToken
  -> Authorization Kernel checks capability + token
  -> consume token
  -> existing definition.apply / rollback path runs
```

### End-User Consumption

```text
end_user calls /api/config or operation route
  -> Authorization Kernel denies framework_internal surfaces if relevant
  -> app PolicyEvaluator decides read/invoke on View/Operation
```

## Error Handling

Authorization denials should be structured before they are rendered:

```ts
{
  ok: false,
  error: "definition.apply denied by authorization",
  authorization: {
    decision: "deny",
    reason_code: "approval_required",
    principal: { kind: "build_agent", id: "opencode", acting_for: { kind: "builder", id: "default" } },
    capability: "definition:apply"
  }
}
```

User-facing text can be derived later. Tests should assert reason codes, not prose.

## Migration From M1

Current M1 behavior:

```text
definition.apply(require_approval=true)
  -> prompt Builder
  -> mutate directly after allow
```

M2 behavior:

```text
definition.apply(require_approval=true)
  -> prompt Builder
  -> mint ApprovalToken
  -> execute as framework_system with token
```

The UI can look unchanged for now. The semantic difference is visible in tests and structured state.

## Success Criteria

M2 Authorization Kernel first cut is done when:

1. The pure authorization test matrix passes.
2. `definition.apply` and rollback execution are denied without the expected principal/capability/approval combination.
3. Approval-gated definition mutation still works in the existing demo.
4. Reviewer/Guest app policy behavior remains unchanged.
5. Denials expose stable reason codes to agent/tool callers.
6. Developer-time extensions can add static approver/capability slots without overriding built-in invariants.
7. No new app primitive is introduced.

## Open Follow-Ups

These are intentionally deferred:

| Follow-up | Trigger |
|---|---|
| Durable permission center | When approvals must survive reconnect/restart or be inspected later |
| Policy lifecycle | After kernel distinguishes `policy:propose`, `policy:approve`, and `policy:mutate` |
| Developer-authored enterprise kernel extension | When a deployment needs extra static approver classes or co-approval rules |
| Org/team authorization | When workspace has multiple Builders/admin roles; modeled through developer-time kernel extension plus identity integration, not Builder-editable kernel policy |
| Transaction/concurrency | When approval token + definition row + app_history must become atomic |
| Runtime Agent permissions | When Release-mode Runtime Agent becomes real |

## Spec Self-Review

- No placeholder sections.
- The first implementation can be tested without adding enterprise identity infrastructure.
- The model preserves M1's app policy evaluator instead of replacing it.
- The first slice has a concrete TDD path: pure kernel tests, tool-gate tests, demo behavior tests.
- Kernel extension is Developer-time and static after deploy, not Builder-editable app definition.
- The design does not add new app primitives; it hardens access to existing framework primitives.
