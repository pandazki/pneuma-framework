# Milestone 41 Snapshot: Enterprise Governance Domain Model v0

**Status:** Closed  
**Date:** 2026-05-12  
**Chinese version:** [milestone-41-snapshot.zh-CN.md](./milestone-41-snapshot.zh-CN.md)

## What Changed

M41 introduces the first framework-level enterprise governance vocabulary for Builder + Build Agent business changes.

The new contract is deterministic and small:

```text
BuildChangeGovernancePolicy
BuildChangeGovernanceRequest
BuildChangeGovernanceDecision
GovernanceRoleAssignment
```

## What Is Proven

- Reviewer approval can satisfy standard source/additive changes.
- Builder self-approval does not satisfy required review.
- Destructive, policy, migration, and credential-boundary risks route to owner-level approval.
- Operator cannot approve business changes by default.
- Denial blocks the route.
- App mismatch and invalid policy fail closed.

## Why This Matters

Enterprise governance is now more concrete than "approval exists." A Build Change can carry a route decision that says:

- which route applied;
- which roles were required;
- who satisfied them;
- which roles are missing;
- why the change is allowed or blocked;
- which evidence refs support the decision.

## Non-Claims

M41 does not implement:

- identity provider integration;
- admin UI;
- assignment queues;
- compliance retention;
- notification workflow;
- production audit backend.

Those remain Creation Host or later productization concerns.

## Verification

```bash
bun test packages/core/test/enterprise-governance.test.ts
```

Result:

```text
7 pass
0 fail
```

## Next

M42 should connect this decision to Build Assurance so publish readiness can be blocked when required governance approval is missing or denied.
