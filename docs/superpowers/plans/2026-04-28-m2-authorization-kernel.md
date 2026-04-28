# M2 Authorization Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first M2 Authorization Kernel slice: framework principals/capabilities, developer-time static extension slots, approval-token authorization, and tool-facing denial reasons.

**Architecture:** Keep authorization decision logic in `packages/core-domain` as a pure service. Wire `packages/core` tool calls through a small context/token layer so `definition.apply` and rollback execution can distinguish Agent proposal, Builder approval, and framework execution without replacing the existing app `PolicyEvaluator`.

**Tech Stack:** TypeScript, Bun test, existing `@pneuma-framework/core-domain` and `@pneuma-framework/core` packages.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/core-domain/src/value-objects/authorization.ts` | Principal, Capability, AuthorizationContext, AuthorizationDecision, ApprovalToken types plus small helpers. |
| `packages/core-domain/src/services/authorization-kernel.ts` | Pure kernel decision logic, built-in invariants, developer-time extension hooks, approval-token checks. |
| `packages/core-domain/test/services/authorization-kernel.test.ts` | RED/GREEN contract tests for all pure kernel behavior. |
| `packages/core-domain/src/index.ts` | Export authorization value objects and service. |
| `packages/core/src/tools/authorization-context.ts` | Build tool principals/contexts and stable target fingerprints. |
| `packages/core/src/tools/approval-token-store.ts` | In-memory single-use approval token store. |
| `packages/core/src/tools/types.ts` | Add optional authorization dependencies to `ToolContext`. |
| `packages/core/src/tools/action.ts` | Gate `definition.apply`, `definition.rollback.prepare`, and `definition.rollback.execute`; return structured authorization denials. |
| `packages/core/test/tools/definition-authorization.test.ts` | Tool-gate tests for proposal/apply/rollback authorization semantics. |
| `examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts` | Keep existing story green; add behavior checks only if needed by core changes. |

## Task 1: Pure Authorization Kernel

**Files:**
- Create: `packages/core-domain/src/value-objects/authorization.ts`
- Create: `packages/core-domain/src/services/authorization-kernel.ts`
- Create: `packages/core-domain/test/services/authorization-kernel.test.ts`
- Modify: `packages/core-domain/src/index.ts`

- [ ] **Step 1: Write the failing pure-kernel contract tests**

Create `packages/core-domain/test/services/authorization-kernel.test.ts` with tests named:

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

- [ ] **Step 2: Run RED**

Run:

```bash
bun test packages/core-domain/test/services/authorization-kernel.test.ts
```

Expected: fails because `authorization-kernel.ts` / `authorization.ts` do not exist.

- [ ] **Step 3: Implement minimal value objects and kernel**

Implement:

```ts
export type Principal =
  | { kind: "builder"; id: string }
  | { kind: "build_agent"; id: string; acting_for: { kind: "builder"; id: string } }
  | { kind: "runtime_agent"; id: string; acting_for?: { kind: "end_user"; id: string } }
  | { kind: "end_user"; id: string; roles: readonly string[] }
  | { kind: "framework_system"; id: "framework" }
  | { kind: "extension"; id: string; roles?: readonly string[] };

export type Capability =
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

Kernel built-in behavior:

```text
build_agent allow: definition:propose, definition:rollback:validate, policy:propose
build_agent deny: definition:apply, policy:mutate
builder allow approve only in matching workspace/app
framework_system allow apply / rollback execute / policy mutate only with valid token
end_user view:read returns defer_to_app_policy
end_user definition/policy mutation denied
runtime_agent definition mutation denied
developer extension can allow extension principal but cannot override build_agent direct apply invariant
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
bun test packages/core-domain/test/services/authorization-kernel.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core-domain/src/value-objects/authorization.ts \
  packages/core-domain/src/services/authorization-kernel.ts \
  packages/core-domain/test/services/authorization-kernel.test.ts \
  packages/core-domain/src/index.ts
git commit -m "Add authorization kernel contract"
```

## Task 2: Tool Authorization Context And Token Store

**Files:**
- Create: `packages/core/src/tools/authorization-context.ts`
- Create: `packages/core/src/tools/approval-token-store.ts`
- Modify: `packages/core/src/tools/types.ts`
- Test: `packages/core/test/tools/definition-authorization.test.ts`

- [ ] **Step 1: Write failing tests for tool helpers**

Create `packages/core/test/tools/definition-authorization.test.ts` with tests:

```ts
test("definition.apply validate mode is allowed as build_agent proposal");
test("in-memory approval token store consumes a token once");
test("target fingerprint changes when definition change changes");
```

- [ ] **Step 2: Run RED**

Run:

```bash
bun test packages/core/test/tools/definition-authorization.test.ts
```

Expected: fails because helper files do not exist.

- [ ] **Step 3: Implement minimal helpers**

Implement:

```text
defaultToolPrincipal() -> build_agent(opencode) acting_for builder(default)
frameworkSystemPrincipal() -> framework_system
definitionApplyTarget(change) -> stable JSON fingerprint
InMemoryApprovalTokenStore.mint(...)
InMemoryApprovalTokenStore.consume(...)
```

Extend `ToolContext` with optional:

```ts
authorizationKernel?: AuthorizationKernel;
approvalTokens?: ApprovalTokenStore;
principal?: Principal;
```

- [ ] **Step 4: Run GREEN**

Run:

```bash
bun test packages/core/test/tools/definition-authorization.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tools/authorization-context.ts \
  packages/core/src/tools/approval-token-store.ts \
  packages/core/src/tools/types.ts \
  packages/core/test/tools/definition-authorization.test.ts
git commit -m "Add tool authorization context helpers"
```

## Task 3: Gate Framework Tool Execution

**Files:**
- Modify: `packages/core/src/tools/action.ts`
- Modify: `packages/core/test/tools/definition-authorization.test.ts`
- Modify: `packages/core/test/tools/definition-apply.test.ts` only if existing approval tests need structured authorization assertions.

- [ ] **Step 1: Add failing tool-gate tests**

Append tests to `packages/core/test/tools/definition-authorization.test.ts`:

```ts
test("definition.apply apply mode rejects build_agent without approval token");
test("definition.apply apply mode executes as framework_system after builder approval");
test("definition.apply add_policy_rule requires policy mutate approval");
test("definition.rollback.prepare can be proposed by build_agent");
test("definition.rollback.execute requires approved destructive rollback token");
test("denied framework operation returns authorization reason code to agent");
```

- [ ] **Step 2: Run RED**

Run:

```bash
bun test packages/core/test/tools/definition-authorization.test.ts
```

Expected: new tests fail because `action.ts` does not consult the kernel.

- [ ] **Step 3: Implement minimal gating in `action.ts`**

Rules:

```text
definition.apply mode=validate -> definition:propose
definition.apply add_policy_rule mode=apply -> policy:mutate
definition.apply other apply -> definition:apply
definition.rollback.prepare -> definition:rollback:validate
definition.rollback.execute -> definition:rollback:execute
```

On denial, return:

```ts
{
  ok: false,
  error: "<tool> denied by authorization",
  state: { authorization: decision }
}
```

For `require_approval: true`, keep current prompt UX, then mint a single-use token and execute the mutation as `framework_system` with that token.

- [ ] **Step 4: Run GREEN**

Run:

```bash
bun test packages/core/test/tools/definition-authorization.test.ts \
  packages/core/test/tools/definition-apply.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tools/action.ts \
  packages/core/test/tools/definition-authorization.test.ts \
  packages/core/test/tools/definition-apply.test.ts
git commit -m "Gate definition tools through authorization kernel"
```

## Task 4: Demo And Regression Verification

**Files:**
- Modify only if needed: `examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts`

- [ ] **Step 1: Run existing demo behavior test**

Run:

```bash
bun test examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts
```

Expected: pass. If it fails due to new authorization state, update the test to assert the actor boundary:

```ts
expect(result.access).toMatchObject({
  reviewer_can_read_view: true,
  guest_can_read_view: false
});
```

- [ ] **Step 2: Run focused authorization + demo suite**

Run:

```bash
bun test packages/core-domain/test/services/authorization-kernel.test.ts \
  packages/core/test/tools/definition-authorization.test.ts \
  packages/core/test/tools/definition-apply.test.ts \
  examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit if demo test changed**

If the demo test changed:

```bash
git add examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts
git commit -m "Assert authorization actor boundary in lifecycle demo"
```

## Task 5: Final Verification

**Files:**
- No planned source edits.

- [ ] **Step 1: Run typecheck**

```bash
bun run typecheck
```

Expected: exit 0.

- [ ] **Step 2: Run full test suite**

```bash
bun test
```

Expected: exit 0.

- [ ] **Step 3: Run diff check**

```bash
git diff --check
```

Expected: no output, exit 0.

- [ ] **Step 4: Report**

Summarize:

```text
authorization kernel tests: pass
tool gate tests: pass
demo lifecycle test: pass
typecheck: pass
full suite: pass
```

