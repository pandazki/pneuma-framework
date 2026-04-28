# M2.1 Approval Token Execution Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Builder approval mint a single-use token and make framework-owned definition mutations execute as `framework_system` by default.

**Architecture:** Keep the pure `AuthorizationKernel` in `packages/core-domain`. Wire `packages/core` so `createPneumaFramework(...)` installs a default kernel/token store, `tools/action.ts` maps tool calls to capabilities/targets, and `LifecycleOrchestrator` exposes a narrow "after approval, before mutation" callback for tokenized re-authorization.

**Tech Stack:** TypeScript, Bun test, existing `@pneuma-framework/core` and `@pneuma-framework/core-domain` packages.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/lifecycle.ts` | Add approved-mutation authorization callback types and invoke them after Builder allow, before mutation. |
| `packages/core/src/types.ts` | Add optional `authorization` metadata to definition apply / rollback execute framework state types. |
| `packages/core/src/tools/action.ts` | Build approved-mutation callbacks, mint approval tokens, authorize `framework_system`, and attach authorization metadata to tool results. |
| `packages/core/src/create.ts` | Default-install `AuthorizationKernel` and `InMemoryApprovalTokenStore` in product-level framework creation. |
| `packages/core/src/tools/types.ts` | Extend `ToolContext` with optional static builder principal if needed by token minting. |
| `packages/core/test/tools/definition-authorization.test.ts` | Add focused tool-gate and tokenized approval tests. |
| `packages/core/test/create.test.ts` | Assert default framework authorization dependencies are installed. |
| `packages/core/test/tools/definition-apply.test.ts` | Assert existing approval UX now returns authorization metadata without regressing behavior. |
| `examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts` | Regression only unless the demo output shape changes. |

## Task 1: Lifecycle Approved-Mutation Hook

**Files:**
- Modify: `packages/core/src/lifecycle.ts`
- Modify: `packages/core/src/types.ts`
- Test: `packages/core/test/tools/definition-authorization.test.ts`

- [ ] **Step 1: Write failing tests for approval callback execution**

Append to `packages/core/test/tools/definition-authorization.test.ts`:

```ts
test("definition.apply approval callback runs after allow and before mutation", async () => {
  const orchestrator = createFakeOrchestrator();
  let callbackCalled = 0;
  await orchestrator.runDefinitionApply(
    {
      kind: "add_table_column",
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "string" },
    },
    {
      requireApproval: true,
      onApprovedBeforeMutation: async () => {
        callbackCalled += 1;
        return {
          ok: true,
          decision: {
            decision: "allow",
            reason_code: "allowed",
            principal: { kind: "framework_system", id: "framework" },
            capability: "definition:apply",
          },
          approval_token_id: "approval-test",
        };
      },
    },
  );

  expect(callbackCalled).toBe(1);
});
```

If the existing fake orchestrator cannot drive the real prompt path, write the equivalent test in `packages/core/test/tools/definition-apply.test.ts` using `withDefinitionServer(...)` and `handleFrameworkPermissionResponse(...)`.

- [ ] **Step 2: Run RED**

Run:

```bash
bun test packages/core/test/tools/definition-authorization.test.ts
```

Expected: TypeScript/runtime failure because `onApprovedBeforeMutation` does not exist.

- [ ] **Step 3: Add lifecycle types**

In `packages/core/src/lifecycle.ts`, import authorization types:

```ts
import type {
  AuthorizationDecision,
  AuthorizationTarget,
  Capability,
} from "@pneuma-framework/core-domain";
```

Add:

```ts
export type FrameworkMutationTool = "definition.apply" | "definition.rollback.execute";

export interface FrameworkApprovedMutationAuthorizationInput {
  readonly tool: FrameworkMutationTool;
  readonly capability: Capability;
  readonly target: AuthorizationTarget;
  readonly prompt_id: string;
}

export type FrameworkApprovedMutationAuthorizationResult =
  | { readonly ok: true; readonly decision: AuthorizationDecision; readonly approval_token_id: string }
  | { readonly ok: false; readonly decision: AuthorizationDecision };

export type FrameworkApprovedMutationAuthorizer = (
  input: FrameworkApprovedMutationAuthorizationInput,
) => Promise<FrameworkApprovedMutationAuthorizationResult>;
```

Extend:

```ts
export interface DefinitionApplyOptions {
  readonly mode?: DefinitionApplyMode;
  readonly requireApproval?: boolean;
  readonly approvedMutationAuthorization?: {
    readonly tool: "definition.apply";
    readonly capability: Capability;
    readonly target: AuthorizationTarget;
    readonly authorize: FrameworkApprovedMutationAuthorizer;
  };
}

export interface DefinitionRollbackExecuteOptions {
  readonly requireApproval?: boolean;
  readonly approvedMutationAuthorization?: {
    readonly tool: "definition.rollback.execute";
    readonly capability: "definition:rollback:execute";
    readonly target: AuthorizationTarget;
    readonly authorize: FrameworkApprovedMutationAuthorizer;
  };
}
```

- [ ] **Step 4: Invoke callback after Builder allow**

In `runDefinitionApply(...)`, immediately after the approval-deny branch and before `mark("applying-definition")`, add:

```ts
let executionAuthorization: FrameworkApprovedMutationAuthorizationResult | undefined;
if (approvalDecision && approvalDecision !== "deny" && options.approvedMutationAuthorization && approvalPromptId) {
  executionAuthorization = await options.approvedMutationAuthorization.authorize({
    tool: options.approvedMutationAuthorization.tool,
    capability: options.approvedMutationAuthorization.capability,
    target: options.approvedMutationAuthorization.target,
    prompt_id: approvalPromptId,
  });
  if (!executionAuthorization.ok) {
    fail("approval_denied", executionAuthorization.decision.message ?? "definition.apply authorization denied after approval");
  }
}
```

Include `authorization: executionAuthorization` in returned `DefinitionApplyResult` and state updates where possible.

In `runDefinitionRollbackExecute(...)`, after `prepare.status !== "denied"` and before `mark("executing-rollback", ...)`, call the same callback and fail with `approval_denied` when it returns `ok: false`.

- [ ] **Step 5: Run GREEN**

Run:

```bash
bun test packages/core/test/tools/definition-authorization.test.ts packages/core/test/tools/definition-apply.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/lifecycle.ts packages/core/src/types.ts packages/core/test/tools/definition-authorization.test.ts packages/core/test/tools/definition-apply.test.ts
git commit -m "Add lifecycle approved mutation authorization hook"
```

## Task 2: Default Framework Authorization Wiring

**Files:**
- Modify: `packages/core/src/create.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/tools/types.ts`
- Test: `packages/core/test/create.test.ts`

- [ ] **Step 1: Write failing default wiring test**

Append to `packages/core/test/create.test.ts`:

```ts
test("createPneumaFramework installs authorization kernel and approval token store by default", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-auth-default-"));
  const fw = createPneumaFramework({ templateDir: FIXTURE_TEMPLATE, workspace: ws });

  expect(fw.authorizationKernel).toBeDefined();
  expect(fw.approvalTokens).toBeDefined();

  const result = await fw.toolRegistry.call("definition.apply", {
    kind: "add_table_column",
    table_id: "bookmarks",
    column_name: "tags",
    cell_type: { kind: "primitive", of: "Text" },
  });

  expect(result.ok).toBe(false);
  expect((result.state as { authorization: { reason_code: string } }).authorization.reason_code).toBe("approval_required");
  await fw.close();
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
bun test packages/core/test/create.test.ts
```

Expected: fails because `fw.authorizationKernel` and `fw.approvalTokens` do not exist.

- [ ] **Step 3: Extend public framework types**

In `packages/core/src/create.ts`, import:

```ts
import { AuthorizationKernel, type Principal } from "@pneuma-framework/core-domain";
import { InMemoryApprovalTokenStore, type ApprovalTokenStore } from "./tools/approval-token-store.js";
import { defaultToolPrincipal } from "./tools/authorization-context.js";
```

Extend `PneumaFrameworkOptions`:

```ts
authorization?: {
  enabled?: boolean;
  kernel?: AuthorizationKernel;
  approvalTokens?: ApprovalTokenStore;
  principal?: Principal;
  appId?: string;
  workspaceId?: string;
};
```

Extend `PneumaFramework`:

```ts
authorizationKernel?: AuthorizationKernel;
approvalTokens?: ApprovalTokenStore;
```

- [ ] **Step 4: Default-install auth dependencies**

In `createPneumaFramework(...)`, before `buildToolRegistry(...)`:

```ts
const authorizationEnabled = opts.authorization?.enabled !== false;
const authorizationKernel = authorizationEnabled
  ? opts.authorization?.kernel ?? new AuthorizationKernel()
  : undefined;
const approvalTokens = authorizationEnabled
  ? opts.authorization?.approvalTokens ?? new InMemoryApprovalTokenStore()
  : undefined;
const principal = opts.authorization?.principal ?? defaultToolPrincipal();
const appId = opts.authorization?.appId ?? orchestrator.manifest.name;
const workspaceId = opts.authorization?.workspaceId ?? opts.workspace;
```

Then build:

```ts
const toolRegistry = buildToolRegistry({
  orchestrator,
  backend: opts.backend,
  authorizationKernel,
  approvalTokens,
  principal,
  appId,
  workspaceId,
});
```

Return `authorizationKernel` and `approvalTokens`.

- [ ] **Step 5: Run GREEN**

Run:

```bash
bun test packages/core/test/create.test.ts packages/core/test/create-agent.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/create.ts packages/core/src/index.ts packages/core/src/tools/types.ts packages/core/test/create.test.ts
git commit -m "Install authorization kernel by default"
```

## Task 3: Tokenize Definition Apply Approval

**Files:**
- Modify: `packages/core/src/tools/action.ts`
- Modify: `packages/core/src/lifecycle.ts`
- Test: `packages/core/test/tools/definition-authorization.test.ts`
- Test: `packages/core/test/tools/definition-apply.test.ts`

- [ ] **Step 1: Add failing tokenized approval tests**

Append to `packages/core/test/tools/definition-authorization.test.ts`:

```ts
test("definition.apply require_approval mints token and reports framework_system execution", async () => {
  const orchestrator = createFakeOrchestrator();
  const approvalTokens = new InMemoryApprovalTokenStore();
  const reg = createToolRegistry({
    orchestrator,
    authorizationKernel: new AuthorizationKernel(),
    approvalTokens,
    principal: defaultToolPrincipal(),
    appId: "ai-bookmarks",
    workspaceId: "workspace-1",
  });
  registerActionTools(reg);

  const result = await reg.call("definition.apply", {
    require_approval: true,
    kind: "add_table_column",
    table_id: "bookmarks",
    column_name: "tags",
    cell_type: { kind: "string" },
  });

  expect(result.ok).toBe(true);
  const authorization = (result.state as { authorization: { execution_principal: { kind: string }; reason_code: string } }).authorization;
  expect(authorization.execution_principal.kind).toBe("framework_system");
  expect(authorization.reason_code).toBe("allowed");
});
```

In `packages/core/test/tools/definition-apply.test.ts`, update `"definition.apply approval gate allows an approved definition mutation"` to assert:

```ts
const state = result.state as {
  status: string;
  approval: { required: boolean; decision: string };
  authorization: {
    requested_principal: { kind: string };
    execution_principal: { kind: string };
    capability: string;
    reason_code: string;
    approval_token_id: string;
  };
};
expect(state.authorization).toMatchObject({
  requested_principal: { kind: "build_agent" },
  execution_principal: { kind: "framework_system" },
  capability: "definition:apply",
  reason_code: "allowed",
});
expect(state.authorization.approval_token_id).toStartWith("approval-");
```

- [ ] **Step 2: Run RED**

Run:

```bash
bun test packages/core/test/tools/definition-authorization.test.ts packages/core/test/tools/definition-apply.test.ts
```

Expected: fails because approval success has no authorization metadata and does not mint token.

- [ ] **Step 3: Implement approved mutation authorizer helper**

In `packages/core/src/tools/action.ts`, add:

```ts
function approvedMutationAuthorization(
  ctx: ToolContext,
  capability: Capability,
  target: AuthorizationTarget,
): DefinitionApplyOptions["approvedMutationAuthorization"] {
  return {
    tool: "definition.apply",
    capability,
    target,
    authorize: async ({ prompt_id }) => authorizeFrameworkExecutionAfterApproval(ctx, {
      tool: "definition.apply",
      capability,
      target,
      prompt_id,
    }),
  };
}
```

Add shared function:

```ts
async function authorizeFrameworkExecutionAfterApproval(
  ctx: ToolContext,
  input: {
    readonly tool: "definition.apply" | "definition.rollback.execute";
    readonly capability: Capability;
    readonly target: AuthorizationTarget;
    readonly prompt_id: string;
  },
) {
  if (!ctx.authorizationKernel || !ctx.approvalTokens) {
    return {
      ok: true as const,
      decision: {
        decision: "allow" as const,
        reason_code: "allowed" as const,
        principal: frameworkSystemPrincipal(),
        capability: input.capability,
      },
      approval_token_id: `approval-legacy-${input.prompt_id}`,
    };
  }
  const token = ctx.approvalTokens.mint({
    app_id: ctx.appId ?? DEFAULT_TOOL_APP_ID,
    workspace_id: ctx.workspaceId ?? ctx.orchestrator.workspace,
    capability: input.capability,
    target: input.target,
    approved_by: builderPrincipal(),
  });
  const tokenForKernel = ctx.approvalTokens.consume(token.token_id);
  const decision = ctx.authorizationKernel.authorize(
    frameworkSystemPrincipal(),
    input.capability,
    buildToolAuthorizationContext({
      app_id: ctx.appId,
      workspace_id: ctx.workspaceId ?? ctx.orchestrator.workspace,
      target: input.target,
      approval_token: tokenForKernel,
    }),
  );
  if (decision.decision !== "allow") return { ok: false as const, decision };
  return { ok: true as const, decision, approval_token_id: token.token_id };
}
```

- [ ] **Step 4: Attach authorizer to approved definition apply**

In `authorizeDefinitionApplyTool(...)`, keep current initial behavior:

```text
validate -> propose
apply + build_agent + requireApproval -> propose
apply without approval -> direct mutation capability -> denied
```

In the `definition.apply` handler, when `parsed.options.requireApproval === true`, pass:

```ts
const capability = parsed.change.kind === "add_policy_rule" ? "policy:mutate" : "definition:apply";
const target = definitionApplyTarget(parsed.change);
const options = {
  ...parsed.options,
  approvedMutationAuthorization: approvedDefinitionApplyAuthorization(ctx, capability, target),
};
result = await ctx.orchestrator.runDefinitionApply(parsed.change, options);
```

- [ ] **Step 5: Add authorization metadata to result state**

When lifecycle returns `authorization`, convert it in `action.ts` to:

```ts
authorization: {
  requested_principal: activePrincipal(ctx),
  execution_principal: result.authorization.decision.principal,
  capability: result.authorization.decision.capability,
  decision: result.authorization.decision.decision,
  reason_code: result.authorization.decision.reason_code,
  approval_token_id: result.authorization.approval_token_id,
}
```

- [ ] **Step 6: Run GREEN**

Run:

```bash
bun test packages/core/test/tools/definition-authorization.test.ts packages/core/test/tools/definition-apply.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/tools/action.ts packages/core/src/lifecycle.ts packages/core/test/tools/definition-authorization.test.ts packages/core/test/tools/definition-apply.test.ts
git commit -m "Tokenize definition apply approval execution"
```

## Task 4: Tokenize Rollback Execute Approval

**Files:**
- Modify: `packages/core/src/tools/action.ts`
- Modify: `packages/core/src/lifecycle.ts`
- Test: `packages/core/test/tools/definition-authorization.test.ts`
- Test: `packages/core/test/tools/definition-apply.test.ts`

- [ ] **Step 1: Add failing rollback execution token test**

Append to `packages/core/test/tools/definition-authorization.test.ts`:

```ts
test("definition.rollback.execute require_approval mints token and executes as framework_system", async () => {
  const orchestrator = createFakeOrchestrator();
  const approvalTokens = new InMemoryApprovalTokenStore();
  const reg = createToolRegistry({
    orchestrator,
    authorizationKernel: new AuthorizationKernel(),
    approvalTokens,
    principal: defaultToolPrincipal(),
    appId: "ai-bookmarks",
    workspaceId: "workspace-1",
  });
  registerActionTools(reg);

  const result = await reg.call("definition.rollback.execute", {
    target_history_version: 1,
    require_approval: true,
  });

  expect(result.ok).toBe(true);
  const authorization = (result.state as { authorization: { execution_principal: { kind: string }; capability: string } }).authorization;
  expect(authorization.execution_principal.kind).toBe("framework_system");
  expect(authorization.capability).toBe("definition:rollback:execute");
});
```

- [ ] **Step 2: Run RED**

Run:

```bash
bun test packages/core/test/tools/definition-authorization.test.ts
```

Expected: fails because rollback execute has no approved mutation authorization metadata.

- [ ] **Step 3: Attach rollback authorizer**

In `definition.rollback.execute` handler:

```ts
const target = definitionRollbackTarget(parsed.target_history_version);
const options = {
  ...parsed.options,
  approvedMutationAuthorization: approvedRollbackExecuteAuthorization(ctx, target),
};
result = await ctx.orchestrator.runDefinitionRollbackExecute(
  { target_history_version: parsed.target_history_version },
  options,
);
```

Use capability `"definition:rollback:execute"` and tool `"definition.rollback.execute"`.

- [ ] **Step 4: Run GREEN**

Run:

```bash
bun test packages/core/test/tools/definition-authorization.test.ts packages/core/test/tools/definition-apply.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tools/action.ts packages/core/src/lifecycle.ts packages/core/test/tools/definition-authorization.test.ts packages/core/test/tools/definition-apply.test.ts
git commit -m "Tokenize rollback execution approval"
```

## Task 5: Demo And Regression Verification

**Files:**
- Modify only if needed: `examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts`

- [ ] **Step 1: Run demo lifecycle test**

Run:

```bash
bun test examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts
```

Expected: pass.

- [ ] **Step 2: Run focused suite**

Run:

```bash
bun test packages/core-domain/test/services/authorization-kernel.test.ts \
  packages/core/test/create.test.ts \
  packages/core/test/tools/definition-authorization.test.ts \
  packages/core/test/tools/definition-apply.test.ts \
  examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: exit 0.

- [ ] **Step 4: Run full tests**

Run:

```bash
bun test
```

Expected: all tests pass.

- [ ] **Step 5: Run diff hygiene**

Run:

```bash
git diff --check
```

Expected: no output, exit 0.

- [ ] **Step 6: Commit any demo/test-only changes**

If demo tests changed:

```bash
git add examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts
git commit -m "Keep capability lifecycle demo green under authorization"
```

If no files changed in this task, do not create an empty commit.
