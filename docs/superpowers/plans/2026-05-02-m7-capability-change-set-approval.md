# M7 Capability Change-Set Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-cut M7 so one Builder intent produces one capability proposal, one approval prompt, and one governed multi-step definition execution.

**Architecture:** Add `definition.apply_change_set` as a framework semantic tool above existing `definition.apply`. The new tool validates the ordered changes against predicted app definition state, prompts once with aggregate impact, then executes child mutations internally through the existing lifecycle mutation guard/restart/rediscovery path. The M7 runner and Knowledge Inbox viewer should show proposal-level approval while preserving child mutation evidence in the transcript.

**Tech Stack:** Bun tests, TypeScript, existing `LifecycleOrchestrator`, framework `ToolRegistry`, Knowledge Inbox vanilla viewer, existing wire-protocol permission prompt/response.

---

## File Structure

- `packages/core/src/lifecycle.ts`  
  Owns `DefinitionChangeSetInput`, `DefinitionChangeSetResult`, aggregate validation/approval prompt, and ordered execution.
- `packages/core/src/tools/action.ts`  
  Registers `definition.apply_change_set`, parses input, enforces proposal authorization, and returns tool results.
- `packages/core/test/tools/definition-apply.test.ts`  
  Adds TDD coverage for allow, deny, pre-validation, and single-prompt behavior.
- `packages/core/test/mcp-server.test.ts`  
  Ensures framework tool discovery exposes the new semantic tool.
- `examples/m7-live-agent-approval-protocol/run.ts`  
  Changes fake backend and prompt from four `definition.apply` calls to one `definition.apply_change_set`.
- `examples/m7-live-agent-approval-protocol/run.test.ts`  
  Expects one proposal prompt/response and all Priority Queue rows after one approval.
- `templates/knowledge-inbox-core-domain/viewer/index.html`  
  Renders proposal-level approval copy and planned change list.
- `templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts`  
  Verifies viewer contract strings for one capability proposal approval.
- `docs/archive/milestone-7-snapshot.md` and `.zh-CN.md`  
  Rewrite M7 snapshot from per-mutation live approval to capability change-set approval.
- `docs/superpowers/plans/2026-05-02-m7-live-agent-approval-protocol.md`  
  Mark as superseded by this plan.

---

### Task 1: Add Failing Core Tests For Change-Set Approval

**Files:**
- Modify: `packages/core/test/tools/definition-apply.test.ts`
- Modify: `packages/core/test/mcp-server.test.ts`

- [ ] **Step 1: Add tests that describe proposal-level behavior**

In `packages/core/test/tools/definition-apply.test.ts`, add tests near the existing approval tests:

```ts
test("definition.apply_change_set approval applies Priority Queue as one proposal", async () => {
  const harness = await startDefinitionApplyHarness();
  try {
    const pending = harness.registry.call("definition.apply_change_set", {
      intent: "Review inbox items by priority",
      summary: "Add Priority Queue",
      require_approval: true,
      changes: priorityCapabilityChanges,
    });

    const prompt = await harness.nextPrompt();
    expect(prompt.tool).toBe("definition.apply_change_set");
    expect(prompt.detail.summary).toBe("Add Priority Queue");
    expect(prompt.detail.changes).toHaveLength(4);
    expect(prompt.detail.impact.added_operations.some((op) => op.operation_id === "list_priority_queue")).toBe(true);

    harness.respondToPrompt(prompt.id, "allow");
    const result = await pending;

    expect(result.ok).toBe(true);
    expect(result.state.status).toBe("applied");
    expect(result.state.applied_changes).toHaveLength(4);
    expect(harness.prompts).toHaveLength(1);
    const config = await harness.readConfig();
    expect(config.operations.some((op) => op.id === "list_priority_queue")).toBe(true);
    expect(config.views.some((view) => view.id === "priority_queue")).toBe(true);
  } finally {
    await harness.close();
  }
});

test("definition.apply_change_set denial leaves all child mutations unapplied", async () => {
  const harness = await startDefinitionApplyHarness();
  try {
    const pending = harness.registry.call("definition.apply_change_set", {
      intent: "Review inbox items by priority",
      summary: "Add Priority Queue",
      require_approval: true,
      changes: priorityCapabilityChanges,
    });
    const prompt = await harness.nextPrompt();
    harness.respondToPrompt(prompt.id, "deny");
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(result.error).toContain("definition.apply_change_set denied by builder");
    const config = await harness.readConfig();
    expect(config.tables.find((table) => table.id === "inbox_items")?.columns.some((column) => column.name === "priority")).toBe(false);
    expect(config.operations.some((op) => op.id === "list_priority_queue")).toBe(false);
  } finally {
    await harness.close();
  }
});
```

In `packages/core/test/mcp-server.test.ts`, extend the tool discovery test:

```ts
expect(toolNames).toContain("definition.apply_change_set");
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts packages/core/test/mcp-server.test.ts
```

Expected: fails because `definition.apply_change_set` is unknown.

---

### Task 2: Implement Core Change-Set Tool

**Files:**
- Modify: `packages/core/src/lifecycle.ts`
- Modify: `packages/core/src/tools/action.ts`

- [ ] **Step 1: Add lifecycle types and aggregate approval**

In `packages/core/src/lifecycle.ts`, add:

```ts
export interface DefinitionChangeSetInput {
  readonly intent: string;
  readonly summary: string;
  readonly changes: readonly DefinitionApplyChange[];
  readonly acceptance_checks?: readonly string[];
}

export type DefinitionChangeSetStatus = "validated" | "applied" | "denied" | "failed";

export interface DefinitionChangeSetResult {
  readonly change_set_id: string;
  readonly operation_id: "definition.apply_change_set";
  readonly mode: DefinitionApplyMode;
  readonly status: DefinitionChangeSetStatus;
  readonly intent: string;
  readonly summary: string;
  readonly before: RuntimeConfigDiscovery;
  readonly after: RuntimeConfigDiscovery;
  readonly impact: DefinitionApplyResult["diff"];
  readonly changes: readonly DefinitionApplyChange[];
  readonly applied_changes: readonly DefinitionApplyResult[];
  readonly failed_change_index?: number;
  readonly failure?: { readonly category: string; readonly message: string };
  readonly approval: { readonly required: boolean; readonly prompt_id?: string; readonly decision?: "allow" | "deny" | "allow-always" };
}

export interface DefinitionChangeSetOptions {
  readonly mode?: DefinitionApplyMode;
  readonly requireApproval?: boolean;
}
```

Then implement `runDefinitionChangeSet(input, options)`:

```ts
async runDefinitionChangeSet(
  input: DefinitionChangeSetInput,
  options: DefinitionChangeSetOptions = {},
): Promise<DefinitionChangeSetResult> {
  const changeSetId = `change-set-${randomUUID()}`;
  const mode = options.mode ?? "apply";
  const serviceUrl = this.currentDevServiceUrl();
  if (!serviceUrl) throw new Error("definition.apply_change_set requires a running dev service");
  const before = await this.fetchRuntimeConfig(serviceUrl);
  const predicted = validateAndPredictDefinitionChangeSet(before, input.changes);
  const impact = aggregateDefinitionChangeSetDiff(before, predicted, input.changes);
  if (mode === "validate") {
    return { change_set_id: changeSetId, operation_id: "definition.apply_change_set", mode, status: "validated", intent: input.intent, summary: input.summary, before, after: before, impact, changes: input.changes, applied_changes: [], approval: { required: false } };
  }
  let approval: DefinitionChangeSetResult["approval"] = { required: options.requireApproval === true };
  if (options.requireApproval) {
    approval = await this.awaitDefinitionChangeSetApproval(changeSetId, input, impact);
    if (approval.decision === "deny") {
      return { change_set_id: changeSetId, operation_id: "definition.apply_change_set", mode, status: "denied", intent: input.intent, summary: input.summary, before, after: before, impact, changes: input.changes, applied_changes: [], approval };
    }
  }
  const applied: DefinitionApplyResult[] = [];
  for (let i = 0; i < input.changes.length; i += 1) {
    try {
      applied.push(await this.runDefinitionApply(input.changes[i]!, { requireApproval: false }));
    } catch (err) {
      const after = await this.fetchRuntimeConfig(this.currentDevServiceUrl() ?? serviceUrl).catch(() => before);
      return { change_set_id: changeSetId, operation_id: "definition.apply_change_set", mode, status: "failed", intent: input.intent, summary: input.summary, before, after, impact, changes: input.changes, applied_changes: applied, failed_change_index: i, failure: { category: err instanceof DefinitionApplyError ? err.category : "execution_failed", message: err instanceof Error ? err.message : String(err) }, approval };
    }
  }
  const after = await this.fetchRuntimeConfig(this.currentDevServiceUrl() ?? serviceUrl);
  return { change_set_id: changeSetId, operation_id: "definition.apply_change_set", mode, status: "applied", intent: input.intent, summary: input.summary, before, after, impact, changes: input.changes, applied_changes: applied, approval };
}
```

Add helper `awaitDefinitionChangeSetApproval(...)` mirroring `awaitDefinitionApplyApproval`, but with:

```ts
const promptId = `pneuma:definition-change-set:${changeSetId}`;
tool: "definition.apply_change_set";
detail: { change_set_id: changeSetId, intent, summary, changes, impact, restart_required: true };
```

Add `validateAndPredictDefinitionChangeSet` and `aggregateDefinitionChangeSetDiff` near existing diff helpers. Validation must apply each prediction in order so later changes can reference earlier changes.

- [ ] **Step 2: Register `definition.apply_change_set`**

In `packages/core/src/tools/action.ts`, import the new types and register a tool before `definition.apply`:

```ts
reg.register(
  {
    name: "definition.apply_change_set",
    description: "framework semantic tool for one Builder intent that requires multiple app-definition mutations. Use it to propose a complete capability, request one Builder approval, and execute the ordered definition change set as one governed unit.",
    inputSchema: {
      type: "object",
      properties: {
        intent: { type: "string" },
        summary: { type: "string" },
        changes: { type: "array" },
        acceptance_checks: { type: "array", items: { type: "string" } },
        mode: { type: "string", enum: ["apply", "validate"] },
        require_approval: { type: "boolean" },
      },
      required: ["intent", "summary", "changes"],
    },
  },
  async (ctx, params): Promise<ToolResult> => {
    const parsed = parseDefinitionChangeSet(params);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const proposalCapability = definitionChangeSetProposalCapability(parsed.changes);
    const authorization = authorizeToolCapability(ctx, params, "definition.apply_change_set", proposalCapability, definitionChangeSetTarget(parsed.intent, parsed.summary, parsed.changes));
    if (!authorization.ok) return authorization.result;
    const result = await ctx.orchestrator.runDefinitionChangeSet(parsed.input, parsed.options);
    if (result.status === "denied") return { ok: false, error: "definition.apply_change_set denied by builder", state: result };
    if (result.status === "failed") return { ok: false, error: result.failure?.message ?? "definition.apply_change_set failed", state: result };
    return { ok: true, state: result };
  },
);
```

Implement parser helpers by reusing `parseDefinitionApplyChange` for every child change.

- [ ] **Step 3: Run tests and verify GREEN**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts packages/core/test/mcp-server.test.ts
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/lifecycle.ts packages/core/src/tools/action.ts packages/core/test/tools/definition-apply.test.ts packages/core/test/mcp-server.test.ts
git commit -m "feat: add capability change-set approval"
```

---

### Task 3: Rework M7 Runner To Use One Proposal

**Files:**
- Modify: `examples/m7-live-agent-approval-protocol/run.ts`
- Modify: `examples/m7-live-agent-approval-protocol/run.test.ts`

- [ ] **Step 1: Write failing runner assertions**

Update `run.test.ts` allow path:

```ts
const prompts = transcript?.events.filter((event) => event.kind === "permission_prompt") ?? [];
const approvals = transcript?.events.filter((event) => event.kind === "approval_response") ?? [];
expect(prompts).toHaveLength(1);
expect(approvals).toHaveLength(1);
expect(prompts[0]?.tool).toBe("definition.apply_change_set");
expect(JSON.stringify(prompts[0]?.detail)).toContain("Add Priority Queue");
expect(transcript?.events.some((event) =>
  event.kind === "tool_result" && event.tool === "definition.apply_change_set" && event.ok === true
)).toBe(true);
```

Update prompt test:

```ts
expect(prompt).toContain("definition.apply_change_set");
expect(prompt).toContain("one Builder approval");
expect(prompt).not.toContain("Apply these changes one by one");
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
bun test examples/m7-live-agent-approval-protocol/run.test.ts
```

Expected: fails because runner still calls `definition.apply` four times.

- [ ] **Step 3: Implement one tool call**

In `run.ts`:

- `buildM7LiveAgentPrompt()` should instruct the agent to call `definition.apply_change_set` once.
- `ScriptedM7LiveApprovalAgentBackend.sendUserMessage()` should fetch `definition.apply_change_set`, emit one tool call, call the framework tool once with:

```ts
{
  intent: m6BuilderRequest,
  summary: "Add Priority Queue",
  require_approval: true,
  acceptance_checks: [
    "GET /api/operations/list_priority_queue returns three seeded rows",
    "Priority Queue view is visible in /api/config.views",
  ],
  changes: priorityCapabilityChanges,
}
```

- `finalizeSuccessfulRun()` should record a single tool result from `definition.apply_change_set`.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
bun test examples/m7-live-agent-approval-protocol/run.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add examples/m7-live-agent-approval-protocol/run.ts examples/m7-live-agent-approval-protocol/run.test.ts
git commit -m "feat: make M7 approval proposal-level"
```

---

### Task 4: Update Viewer Contract For Proposal Approval

**Files:**
- Modify: `templates/knowledge-inbox-core-domain/viewer/index.html`
- Modify: `templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts`

- [ ] **Step 1: Write failing viewer contract checks**

In `viewer-contract.test.ts`, update M7 test to require:

```ts
expect(html).toContain("Capability proposal");
expect(html).toContain("One Builder approval");
expect(html).toContain("Planned changes");
expect(html).toContain("data-testid=\"live-approval-card\"");
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
bun test templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts
```

Expected: fails on missing new copy.

- [ ] **Step 3: Update viewer copy/rendering**

In `index.html`, adjust the live approval card renderer:

- title: `Capability proposal`
- subtitle: `One Builder approval for the complete change set`
- planned changes list from `prompt.detail.changes`
- use `summary` and `intent` from prompt detail when present
- keep existing `Allow` and `Deny` buttons and `permission-response` behavior

- [ ] **Step 4: Run test and verify GREEN**

Run:

```bash
bun test templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add templates/knowledge-inbox-core-domain/viewer/index.html templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts
git commit -m "feat: show M7 capability proposal approval"
```

---

### Task 5: Rewrite M7 Snapshot And Supersede Old Plan

**Files:**
- Modify: `docs/archive/milestone-7-snapshot.md`
- Modify: `docs/archive/milestone-7-snapshot.zh-CN.md`
- Modify: `docs/superpowers/plans/2026-05-02-m7-live-agent-approval-protocol.md`
- Modify: `examples/m7-live-agent-approval-protocol/README.md`

- [ ] **Step 1: Update docs**

Rewrite M7 claim to:

```text
One Builder intent -> one capability proposal -> one approval -> one governed change-set execution.
```

Remove language implying that the milestone is satisfied by four independent approvals. Keep the old per-mutation round-trip as supporting evidence only.

Add run instruction:

```bash
bun run examples/m7-live-agent-approval-protocol/run.ts --backend fake --auto-decision none --port 8878
```

Expected live behavior:

```text
One approval card appears.
Click Allow once.
Priority Queue appears.
```

Mark old plan as superseded at top:

```markdown
> Superseded by `2026-05-02-m7-capability-change-set-approval.md`.
```

- [ ] **Step 2: Run doc checks**

Run:

```bash
rg "four approvals|one by one|each tool call must require approval|per-mutation" docs/archive/milestone-7-snapshot.md docs/archive/milestone-7-snapshot.zh-CN.md examples/m7-live-agent-approval-protocol/README.md
git diff --check
```

Expected: no stale per-mutation milestone claim; diff check pass.

- [ ] **Step 3: Commit**

```bash
git add docs/archive/milestone-7-snapshot.md docs/archive/milestone-7-snapshot.zh-CN.md docs/superpowers/plans/2026-05-02-m7-live-agent-approval-protocol.md examples/m7-live-agent-approval-protocol/README.md
git commit -m "docs: revise M7 around capability approval"
```

---

### Task 6: Final Verification And Retag

**Files:**
- No code edits expected.

- [ ] **Step 1: Run focused verification**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts packages/core/test/mcp-server.test.ts examples/m7-live-agent-approval-protocol/run.test.ts templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run broader verification**

Run:

```bash
bun run typecheck
bun test $(rg --files -g '*.test.ts' | rg -v 'docker-smoke|release-smoke')
git diff --check
```

Expected: typecheck pass, non-Docker tests pass, diff check pass.

- [ ] **Step 3: Manual live demo**

Run:

```bash
bun run examples/m7-live-agent-approval-protocol/run.ts --backend fake --auto-decision none --port 8878
```

Open:

```text
http://127.0.0.1:8878/?scenario=live-approval
```

Expected:

- one proposal approval card
- click Allow once
- runner completes
- `GET /api/operations/list_priority_queue` returns 3 rows

- [ ] **Step 4: Retag M7**

```bash
git tag -f pneuma-m7-live-agent-approval-protocol HEAD
```

---

## Self-Review

- Spec coverage: every design requirement maps to a task.
- Placeholder scan: no TODO/TBD/fill-in placeholders are present.
- Type consistency: the plan uses `definition.apply_change_set`, `DefinitionChangeSetInput`, and `DefinitionChangeSetResult` consistently.
- Scope: one feature slice; production IAM, hot reload, raw opencode fidelity, and marketplace-level capability primitives remain out of scope.
