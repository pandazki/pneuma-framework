# M7 Revised Design: Capability Change-Set Approval

**Date:** 2026-05-02
**Status:** Approved design direction; supersedes the first M7 live-approval cut
**Scope:** redefine M7 from per-mutation live approval to one Builder approval for one coherent capability proposal.

## Problem

The first M7 implementation proved that a `permission-response` can travel from the Knowledge Inbox viewer to a framework-owned `definition.apply` prompt. That proof is technically useful, but the user experience is wrong for a milestone.

Priority Queue is one Builder intent:

```text
I want to review inbox items by priority.
```

The framework currently decomposes that intent into four definition mutations:

1. add `priority` column
2. add `list_priority_queue` Operation
3. add `priority_queue` View
4. add public read PolicyRule

Asking the Builder to approve those four steps independently turns the Builder into a technical reviewer of execution steps. It also implies partial approval is meaningful, which is false for this capability. Approving the first three steps and denying the fourth would leave a product state nobody actually asked for.

## Design Claim

M7 should prove:

> A Build-phase Agent can propose one capability change set for one Builder intent; the Builder approves or denies the whole proposal once; the framework executes the underlying definition mutations as one governed unit and never presents partial success as a valid product outcome.

This is not merely "batch approve." The approval boundary moves from low-level mutation to capability proposal.

## Vocabulary

| Term | Meaning |
|---|---|
| Builder intent | The user's natural-language need, e.g. "Add Priority Queue." |
| Capability proposal | The agent's complete plan for satisfying that intent. |
| Definition change set | The ordered low-level definition mutations needed to realize the proposal. |
| Proposal approval | One Builder decision over the whole proposal. |
| Change-set execution | Framework-owned execution of the ordered mutations after approval. |
| Recovery outcome | The framework's terminal state when execution fails after partial mutation. |

## Proposed Tool

Add a framework semantic tool:

```text
definition.apply_change_set
```

Input shape:

```ts
type DefinitionChangeSetInput = {
  intent: string;
  summary: string;
  changes: DefinitionApplyChange[];
  acceptance_checks?: string[];
  require_approval?: boolean;
  mode?: "apply" | "validate";
};
```

M7 keeps `definition.apply` for single low-level framework mutations. Agents should use `definition.apply_change_set` when satisfying a Builder product request that requires multiple definition mutations.

## Approval Semantics

The viewer shows one approval card:

```text
Proposal: Add Priority Queue

This will:
- add priority column to inbox_items
- add list_priority_queue operation
- add priority_queue view
- add public read policy for the new view

Approve this capability proposal?
```

If the Builder denies, no definition mutation is executed.

If the Builder approves, the framework executes the ordered change set. Low-level mutation records still exist for audit, app history, restart rediscovery, and rollback evidence, but they do not ask the Builder for separate decisions.

## Execution Semantics

The MVP execution strategy is intentionally pragmatic:

1. Fetch current app definition.
2. Validate every change against the predicted definition state before mutating.
3. Show one permission prompt with aggregate impact.
4. If denied, return `status: denied` and leave the app unchanged.
5. If approved, apply each low-level change in order with internal framework authority.
6. After each low-level apply, keep using the existing mutation guard, restart, rediscovery, and diff verification.
7. After all changes, run acceptance checks that prove the capability is live.
8. If a post-approval step fails, attempt rollback to the pre-change-set app history version when available; if rollback cannot fully prove recovery, leave the existing dirty guard active and block further definition mutation until repair/reset.

This does not require database-level distributed transactions. The guarantee is product-level: the framework never reports "Priority Queue succeeded" unless the full proposal succeeded and acceptance checks passed.

## Authorization Semantics

`build_agent` may propose a change set.

`build_agent` may not apply a change set directly.

For change sets containing any policy mutation, the proposal uses the stricter policy proposal/mutation capability. For definition-only change sets, it uses the definition proposal/mutation capability. The approval target fingerprint is the whole proposal, not an individual child mutation.

The framework records one proposal-level permission request/response. Child execution remains framework-owned internal work and can record child tool results in the transcript.

## M7 Demo Change

The revised M7 demo should behave as follows:

```text
Builder request
  -> agent proposes "Add Priority Queue"
  -> viewer shows one approval card with 4 planned changes
  -> Builder clicks Allow once
  -> framework executes 4 definition mutations
  -> Priority Queue appears with 3 demo rows
```

Deny path:

```text
Builder request
  -> agent proposes "Add Priority Queue"
  -> viewer shows one approval card
  -> Builder clicks Deny
  -> no priority column, operation, view, or policy appears
```

Failure path:

```text
Builder approves proposal
  -> an internal step fails
  -> framework reports change-set failure
  -> rollback/repair state is visible
  -> transcript does not claim capability success
```

## Viewer Requirements

The Knowledge Inbox live approval scenario must stop rendering approval as repeated low-level permission cards. It should show:

- one proposal title
- Builder intent
- planned changes grouped by kind
- aggregate impact
- one Allow button and one Deny button
- execution progress after approval
- terminal outcome: completed, denied, or failed/recovery required

The transcript drawer can still show child tool calls and child definition results. Those are evidence, not separate Builder decisions.

## Tests Required

1. Tool contract: `definition.apply_change_set` is listed in framework tools and its prompt describes one proposal.
2. Allow path: one approval response leads to all four Priority Queue changes and three priority rows.
3. Deny path: one denial leaves Priority Queue absent.
4. Transcript: exactly one proposal-level `permission_prompt` and one `approval_response` for the M7 fake backend path.
5. Viewer contract: `?scenario=live-approval` mentions capability proposal / one approval / planned changes.
6. Regression: existing `definition.apply` single-mutation behavior remains intact.

## Non-Goals

- Full production IAM.
- Multi-user approval assignment.
- Hot reload.
- Raw opencode MCP event fidelity.
- A general product marketplace-level "Capability" primitive.
- Strong cross-process database transaction semantics.

## Milestone Definition

M7 is closed only when the live demo and snapshot can honestly say:

> One Builder intent produced one capability proposal, one Builder approval, and one governed change-set execution. Partial low-level success is treated as recovery/failure state, not as a valid approved product outcome.
