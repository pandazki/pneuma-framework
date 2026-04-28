# M2.1 Approval Token Execution Chain Design

**Date:** 2026-04-28
**Status:** Draft for user review
**Milestone:** M2 — Enterprise Governance Hardening
**Builds on:** `docs/architecture/m2-authorization-kernel-design.md`

中文摘要：

> M2.0 已经证明 Authorization Kernel 能判断 framework capability。M2.1 要把 existing Builder approval prompt 接成默认的 token 化执行链：Agent 只能 propose，Builder approve 会 mint 一个 single-use approval token，Framework system 持 token 执行 mutation，并把 authorization decision 暴露给 agent / timeline / demo。

## Goal

Make authorization the default runtime story for framework-owned definition mutation.

Target chain:

```text
Build-phase Agent tool call
  -> authorize as build_agent
  -> if mutation requires approval, prompt Builder
  -> Builder allow mints single-use ApprovalToken
  -> Framework system re-authorizes with token
  -> mutation executes
  -> result/timeline exposes authorization metadata
```

This closes the gap between "the kernel can decide" and "the framework's normal approval flow actually uses the kernel".

## Current State

Already implemented:

- `AuthorizationKernel` in `packages/core-domain`.
- `Principal`, `Capability`, `AuthorizationContext`, `ApprovalToken`, and stable denial reason codes.
- `InMemoryApprovalTokenStore` in `packages/core`.
- Tool-level optional authorization gate for `definition.apply`, `definition.rollback.prepare`, and `definition.rollback.execute`.
- Focused tests proving direct `build_agent` mutation is denied when a kernel is explicitly injected.

Remaining gap:

- `createPneumaFramework(...)` does not default-install `AuthorizationKernel`.
- Existing approval prompts return `"allow" | "deny" | "allow-always"` but do not mint a token.
- `definition.apply(require_approval: true)` still calls `LifecycleOrchestrator.runDefinitionApply(...)` as the same tool principal after approval.
- Agent-visible result state does not consistently explain which principal/capability passed or failed.

## Non-Goals

This slice does not implement:

- Durable Permission Center.
- Multi-approver workflows.
- SSO / enterprise identity sync.
- Persistent approval token storage.
- New wire-protocol envelope kinds.
- Full policy lifecycle (`deny`, edit/delete PolicyRule, default posture mutation).
- Runtime Agent release-mode authorization.

Those remain later M2 workstreams. This slice only tokenizes the current live approval flow.

## Options Considered

### Option A — Keep kernel opt-in only

Leave `authorizationKernel` optional and expect callers/tests to inject it.

Pros: least code change and least compatibility risk.

Cons: M2 does not become a real framework behavior; it remains a library affordance. The team-share story still has to explain that authorization only exists in tests or custom wiring.

### Option B — Default-install kernel and token store in `createPneumaFramework`

`createPneumaFramework(...)` creates an `AuthorizationKernel` and `InMemoryApprovalTokenStore` unless explicitly disabled or overridden. Existing framework-owned approval prompts mint tokens and rerun the mutation under `framework_system`.

Pros: best matches the product story; local and demo behavior exercise the real governance path.

Cons: requires careful backward-compatibility for direct unit tests that use `createToolRegistry(...)` without full framework setup.

### Option C — Move approval token minting into `LifecycleOrchestrator`

The orchestrator owns the prompt and can mint tokens internally.

Pros: close to existing prompt code.

Cons: blurs responsibilities. Lifecycle starts deciding framework authority, while `tools/action.ts` is already the boundary that maps tool calls to capabilities. It also makes authorization harder to test independently.

## Decision

Choose **Option B**, with a narrow compatibility rule:

```text
createPneumaFramework defaults authorization on.
createToolRegistry stays low-level and only enforces authorization when its ToolContext includes a kernel.
```

This keeps current focused unit tests simple while making the product-level framework constructor use the real governance path.

## Architecture

### 1. Framework authorization dependencies

Extend `PneumaFrameworkOptions` with an optional static configuration:

```ts
authorization?: {
  enabled?: boolean; // default true
  kernel?: AuthorizationKernel;
  approvalTokens?: ApprovalTokenStore;
  principal?: Principal; // default build_agent(opencode) acting_for builder:default
  appId?: string;
  workspaceId?: string;
}
```

Default behavior:

- `enabled !== false` installs a default kernel and in-memory token store.
- default principal is `build_agent(opencode)` acting for `builder:default`.
- default `workspaceId` is `opts.workspace`.
- default `appId` is `orchestrator.manifest.name` after construction, otherwise `app:default` only in low-level tests that do not construct a full orchestrator.

### 2. Tool authorization bridge

Introduce a small helper near the tool layer:

```ts
authorizeOrPromptFrameworkMutation(...)
```

Responsibilities:

1. authorize the initial caller as `build_agent`;
2. if the decision is `approval_required` and the tool has `require_approval: true`, continue to the existing Builder prompt;
3. on Builder allow, mint `ApprovalToken`;
4. rerun the final authorization as `framework_system`;
5. pass `approval_token_id` into the existing tool path only for that internal execution.

The public agent does not get to pass a token directly as `build_agent`. If it tries, the kernel returns `principal_not_allowed`.

The existing approval prompt is currently owned by `LifecycleOrchestrator`, because validation and impact diff are computed there before the prompt is shown. M2.1 should not duplicate that logic in `action.ts`. Instead, add a narrow callback hook to the relevant lifecycle options:

```ts
onApprovedBeforeMutation?: (input: {
  tool: "definition.apply" | "definition.rollback.execute";
  capability: Capability;
  target: AuthorizationTarget;
  prompt_id: string;
}) => Promise<FrameworkExecutionAuthorization>;
```

If result metadata needs the token id, use a small wrapper result rather than overloading `AuthorizationDecision`:

```ts
type FrameworkExecutionAuthorization =
  | { ok: true; decision: AuthorizationDecision; approval_token_id: string }
  | { ok: false; decision: AuthorizationDecision };
```

The orchestrator invokes this callback after Builder allow and before the runtime mutation call. The callback itself lives in the tool authorization layer and owns:

- minting `ApprovalToken`;
- re-authorizing as `framework_system`;
- returning metadata for result/timeline state.

This keeps lifecycle responsible for validation/restart sequencing, while the tool layer remains responsible for framework authority.

### 3. Definition apply flow

For `definition.apply`:

```text
mode=validate
  build_agent -> definition:propose or policy:propose -> allow
  no prompt, no token

mode=apply + require_approval=false
  build_agent -> definition:apply/policy:mutate -> deny approval_required

mode=apply + require_approval=true
  build_agent -> proposal allow
  existing permission prompt asks Builder
  allow -> lifecycle invokes onApprovedBeforeMutation
  callback mints token for definition:apply or policy:mutate
  callback authorizes framework_system with token
  authorized lifecycle continues mutation
  deny -> no mutation
```

### 4. Rollback flow

For `definition.rollback.prepare`:

```text
build_agent -> definition:rollback:validate -> allow
existing destructive-impact approval UX remains available
```

For `definition.rollback.execute`:

```text
build_agent direct execute -> approval_required
Builder allow during prepare -> lifecycle invokes onApprovedBeforeMutation
callback mints token for definition:rollback:execute
callback authorizes framework_system with token
authorized lifecycle continues execute
```

Rollback prepare can keep validating impact before approval. The dangerous transition is execute.

### 5. Agent-facing metadata

Tool results should expose authorization metadata without changing the existing success shape drastically:

```ts
state.authorization = {
  requested_principal,
  execution_principal,
  capability,
  decision,
  reason_code,
  approval_token_id?: string,
}
```

On denial, the existing shape remains:

```ts
{
  ok: false,
  error: "<tool> denied by authorization",
  state: { authorization: decision }
}
```

The goal is that an agent can say:

```text
I could not apply that schema change because Builder approval is required.
```

or:

```text
Builder approved; the framework executed the change as framework_system.
```

### 6. Wire/demo surface

No new wire envelope is required in this slice. Existing `permission-prompt` stays the UI surface.

The demo should show the upgraded explanation in one of two lightweight ways:

- timeline entry: `authorization: build_agent -> builder approval -> framework_system`;
- or result panel copy showing the same actor chain.

The demo should not become a Permission Center UI yet.

## Error Handling

Failure cases are stable and test-visible:

| Case | Expected result |
|---|---|
| Agent calls apply without approval | deny `approval_required`; no orchestrator mutation call |
| Agent passes token directly | deny `principal_not_allowed`; token not consumed |
| Framework token target mismatch | deny `approval_target_mismatch`; token consumed only if store policy consumes before kernel validation |
| Token expired | deny `approval_expired`; no mutation |
| Token reused | deny `approval_already_used`; no mutation |
| Builder denies prompt | existing denied result; no token minted |
| Approval prompt hook missing | existing `approval_unavailable`; no token minted |

Token consumption policy for this slice:

> `ApprovalTokenStore.consume(...)` removes a token before kernel validation. This is stricter and safer for mismatched-token attempts. Later durable stores can record failed consumption attempts explicitly.

## Testing Plan

Add tests before implementation.

Core tests:

- `createPneumaFramework installs authorization kernel and token store by default`.
- `definition.apply with require_approval true mints token and executes as framework_system`.
- `definition.apply builder denial does not mint token`.
- `definition.apply without approval is denied before lifecycle mutation`.
- `definition.apply direct build_agent token use is denied and token remains unspent`.
- `definition.rollback.execute uses approved rollback token for framework_system execution`.
- `authorization metadata is returned on successful definition.apply`.

Regression tests:

- existing `packages/core/test/tools/definition-authorization.test.ts`.
- existing `packages/core/test/tools/definition-apply.test.ts`.
- existing `examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts`.
- full `bun run typecheck`.
- full `bun test`.

## Acceptance Criteria

M2.1 is complete when:

1. `createPneumaFramework(...)` defaults to an installed kernel/token store.
2. Builder approval creates a single-use token bound to the exact definition target.
3. Mutation execution is authorized as `framework_system`, not `build_agent`.
4. Denials include stable reason codes.
5. Existing approval prompt UX and demo lifecycle remain green.
6. Agent-facing result state can explain the actor chain.

## Explicit Follow-Ups

After M2.1, the next likely workstreams are:

- Permission Center persistence and query UI.
- Policy lifecycle: deny/edit/delete/default posture.
- Protocol polish: reconnectable prompt/result history.
- Enterprise reviewer/co-approval extension slots.

M2.1 should not pull those in.
