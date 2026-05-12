# Enterprise Governance Domain Review

**Status:** RC 0.3.0 domain anchor, not an ADR.  
**Date:** 2026-05-12  
**Chinese version:** [enterprise-governance-domain-review.zh-CN.md](./enterprise-governance-domain-review.zh-CN.md)

## Purpose

Define the first enterprise governance vocabulary for Builder + Build Agent business-function changes.

This review builds on:

- [Production Readiness Boundary](./production-readiness-boundary.md);
- [AI Build Assurance Domain Review](./ai-build-assurance-domain-review.md);
- [Creation Host DDD Review](./creation-host-ddd-review.md).

The 0.3.0 claim is narrow:

```text
A business change created through Builder + Build Agent can be routed through
minimum enterprise review before it becomes publish-ready.
```

The framework should provide deterministic governance vocabulary and evaluation. It should not become a hosted identity system, approval workflow product, compliance backend, or provider marketplace.

## Non-Drift Statement

Enterprise governance in Pneuma is not "add an admin page."

It is the control loop around AI-assisted software creation:

```text
intent -> proposal -> review packet -> approval route -> execution -> verification -> publish / recovery
```

The value is that a non-expert Builder can ask an Agent to build software while an organization can still answer:

- who requested this;
- what was proposed;
- what evidence was available at approval time;
- who approved or denied;
- why publish was allowed or blocked;
- how the system recovered.

## Role Vocabulary

| Role | Minimum responsibility | Must not mean |
|---|---|---|
| Builder | Requests the business change and owns the product intent. | Automatically trusted approver for governed changes. |
| Reviewer | Reviews packet, scope, risk, and evidence before approval. | A framework-hosted user account. |
| Owner | Owns the app/workspace responsibility and high-risk approval/rollback authority. | A universal superuser outside Host policy. |
| Operator | Observes runtime/release health and executes operational controls. | Default business-change approver. |
| End User | Uses the Published Application. | Build-time governance participant by default. |

These roles are framework governance vocabulary. The Creation Host maps real identities to them.

## First Aggregate Candidates

### BuildChangeGovernancePolicy

Identity:

```text
policy_id + app_id
```

Owns:

- role assignments;
- route definitions;
- risk-to-required-role mapping.

Invariants:

- policy id and app id are required;
- route ids are unique;
- role assignments are explicit;
- every route has at least one risk and one required role.

### GovernanceRoleAssignment

Identity:

```text
subject + role
```

Owns:

- subject ref, such as `user:bob`;
- role, such as `reviewer`.

Invariants:

- subject refs are Host-mapped identities;
- duplicate assignment entries are invalid;
- framework does not authenticate the subject.

### BuildChangeGovernanceRoute

Identity:

```text
route_id
```

Owns:

- risk set;
- required roles.

Invariants:

- high-risk changes should not be satisfied by lower-risk reviewer routes;
- route selection must be deterministic;
- route result is evidence, not workflow execution.

### BuildChangeGovernanceRequest

Identity:

```text
build_change_id
```

Owns:

- app id;
- builder subject;
- risks;
- evidence refs;
- approval or denial decisions.

Invariants:

- request app id must match policy app id;
- Builder self-approval does not satisfy required review;
- denial blocks the route;
- missing required roles block the route.

### BuildChangeGovernanceDecision

Identity:

```text
build_change_id + route_id + evaluation time
```

Owns:

- allowed / blocked result;
- reason code;
- required roles;
- missing roles;
- satisfied subjects;
- evidence refs.

Invariants:

- result must be explainable without reading Host UI state;
- no raw approval token or secret can appear in the decision;
- it is safe to store as evidence.

## Integration Map

| Existing primitive | How enterprise governance attaches |
|---|---|
| BuildThread | Supplies intent/proposal/decision/receipt turn refs. |
| Build Change Review Packet | Supplies approval-facing scope, risk, checks, and recovery plan. |
| Build Assurance | Consumes the governance decision as a publish/readiness blocker. |
| Permission Ledger | Can provide durable approval evidence refs when the Host wires the route into live prompts. |
| Code Change Lane | Supplies source diff/check/apply/rollback evidence. |
| Release Rollout | Publishes only after readiness and governance allow. |
| Sharing Governance | Remains separate: share/fork/install rights are distribution governance, not per-change build governance. |

## First Evaluator Behavior

The first framework evaluator should answer:

```text
Given a policy and a build-change request:
  -> which route applies?
  -> which roles are required?
  -> which decisions satisfy those roles?
  -> is the change allowed?
  -> if blocked, why?
```

Required behavior:

- reviewer approval can satisfy standard additive/source changes;
- Builder self-approval cannot satisfy required review;
- destructive/policy/migration/credential-boundary risk routes to Owner;
- Operator cannot approve business changes by default;
- any denial blocks the route;
- app mismatch fails closed.

## Provider Boundary

0.3.0 provider pressure should use:

```text
GitHub public-read + mock Linear
```

The governance model should not know GitHub or Linear special cases. Provider data appears as evidence or generated-app content. Provider capability and credential boundaries remain Host/profile concerns.

## Non-Claims

M41 does not claim:

- hosted IAM;
- a real org directory;
- user invitation or team management;
- full admin policy editor;
- workflow assignment queues;
- audit retention/export backend;
- provider authorization product.

## Decision

The first framework object should be a deterministic evaluator:

```text
BuildChangeGovernancePolicy
BuildChangeGovernanceRequest
BuildChangeGovernanceDecision
GovernanceRoleAssignment
```

This is the smallest contract that lets 0.3.0 prove enterprise-governed Build Change routing without collapsing Creation Host product logic into framework core.
