# Production Readiness Boundary

**Status:** RC 0.3.0 planning anchor.  
**Date:** 2026-05-12  
**Chinese version:** [production-readiness-boundary.zh-CN.md](./production-readiness-boundary.zh-CN.md)

## Purpose

Define the minimum production-facing boundary for a Creation Host that wants to claim enterprise-governed Builder + Build Agent changes.

The goal is not to make `pneuma-framework` a full enterprise platform. The goal is to clarify what the framework must provide so a Developer can build a Creation Host where AI-assisted business-function changes have accountable roles, reviewable evidence, approval routing, publish gates, and recovery paths.

## Non-Goal

This is not:

- production IAM;
- hosted secret vaulting;
- marketplace artifact signing;
- a compliance retention backend;
- zero-downtime deployment;
- a workflow engine;
- a certified provider marketplace.

Those may become later productization layers. They are not required for the `pneuma-rc-0.3.0` claim.

## Boundary Table

| Concern | Framework must provide | Creation Host must provide | Later enterprise productization | Out of scope for 0.3.0 |
|---|---|---|---|---|
| Identity | Subject reference vocabulary, role assignment contract, and governance-route evaluation over those subjects. | Real auth, SSO, user directory, org/team mapping, session lifecycle, and account recovery. | SCIM, IdP sync, admin console, directory reconciliation. | Framework-hosted identity. |
| Credential | No-secret refs, credential requirements, rebinding evidence, local/reference session and OAuth utilities. | Secret storage, encryption, rotation, refresh, provider account UX, and credential revocation. | Vault adapters, rotation policy, provider refresh workers, audit retention for access events. | Storing raw secrets in framework app data, share artifacts, or evidence records. |
| Approval | Generic approval route evaluation, decision vocabulary, evidence refs, and integration hooks for Build Assurance. | Product UI, notification, assignment, final policy choices, and mapping real users to approver roles. | SLA queues, delegated approval, escalation, substitution, bulk approval, admin policy editor. | A full workflow engine. |
| Audit | Evidence reference vocabulary, local durable case shape, decision/recovery terms, and validation helpers. | Storage backend, retention duration, export policy, redaction policy, and tenant-specific access controls. | Compliance export, legal hold, immutable audit store, SIEM integration. | Hosted audit backend. |
| Migration | Migration-mode vocabulary, backup/rollback evidence refs, and release-readiness blockers. | Actual migration scripts, downtime policy, backup implementation, restore procedures, and data owner communication. | Multi-tenant migration orchestration, online migration tooling, progressive rollout. | 99.99% online migration claims. |
| Recovery | Recovery readiness vocabulary, recovery drill matrix shape, failed/recovered/unrecovered states, and evidence refs. | Product incident UI, operator playbooks, support workflow, restore execution, and customer communication. | Automated repair routing, incident automation, long-term runbook product. | Guaranteed cross-store ACID or perfect rollback. |
| Provider | Capability contracts, provider-specialization boundaries, no-secret provider evidence, and provider parity test hooks. | Real provider SDKs, credentials, rate-limit handling, data sync, provider UX, and customer authorization. | Certified provider marketplace, hosted connector management, provider SLA monitoring. | Provider-specific Build Agent branches. |
| Release | Release rollout state, health evidence vocabulary, publish blockers, restart/rollback helpers. | Deployment target integration, infra credentials, traffic policy, monitoring, and rollback execution UX. | Multi-region rollout, canary routing, SLO policy, cloud control plane. | Production deploy platform abstraction for every cloud. |
| Concurrency | Single-process guardrails, dirty-state blocking, stale proposal detection, and explicit non-claims. | Hosted locks, database CAS, assignment ownership, and multi-builder conflict UX. | Distributed lock service, collaborative editing workflow, conflict resolution product. | Silent multi-writer correctness guarantees. |

## Minimum 0.3.0 Claim

`pneuma-rc-0.3.0` should prove this narrow claim:

```text
A Builder-requested, Build-Agent-proposed business change can be routed through
minimum enterprise governance before publish.
```

The minimum flow is:

```text
Builder intent
  -> Build Agent proposal
  -> review packet + assurance case
  -> role-based approval route
  -> governed execution
  -> verification / publish gate
  -> rollback or recovery evidence
```

The framework should own the vocabulary and deterministic evaluation. The Host should own the product surface and real identity/provider integrations.

## Role Boundary

The first enterprise vocabulary should stay small:

| Role | Minimum responsibility | Framework stance |
|---|---|---|
| Builder | Requests the change and owns the product intent. | Can initiate a proposal, but should not satisfy required review for high-risk or governed business changes. |
| Reviewer | Reviews packet, risks, evidence, and scope before approval. | Can satisfy standard review routes when assigned by Host policy. |
| Owner | Owns app/workspace responsibility and can approve high-risk changes or rollback. | Can satisfy owner routes and override paths when Host policy allows. |
| Operator | Watches runtime/release health and executes operational actions. | Can inspect and operate, but cannot approve business change by default. |
| End User | Uses the Published Application. | Does not participate in build-time governance by default. |

These are framework governance roles, not framework-hosted identities. A Creation Host maps real users, teams, orgs, and sessions into these roles.

## Provider Pressure Baseline

0.3.0 should not be mock-only.

Minimum provider pressure:

```text
GitHub public-read
  -> real public profile/repo/issue/PR-shaped data when available
  -> no OAuth required for the minimum path

Mock Linear
  -> deterministic fixture shaped like real Linear workspace/team/project/issue/status/assignee
```

This keeps the demo realistic enough to expose provider boundaries without making production OAuth, secret vaulting, or provider sync the center of 0.3.0.

## Scenario Notes

### Agent Writes A Bug

Framework responsibility:

- preserve proposal and diff/check evidence;
- block publish when post-apply or release checks fail;
- preserve `failed_recovered` or `failed_unrecovered` state;
- let the Host show where the failure happened.

Host responsibility:

- run meaningful checks;
- decide which checks are required for its app/profile;
- expose the failure and recovery path to Builder/Reviewer/Owner.

### Agent Deletes A Capability Unnecessarily

Framework responsibility:

- classify destructive or capability-removing risks;
- require stronger approval routes for destructive risk;
- preserve impact and evidence refs.

Host responsibility:

- explain business impact in the review packet;
- decide whether the change exceeds Builder intent;
- map high-risk approval to Owner or equivalent role.

### Builder Regrets Approval

Framework responsibility:

- preserve decision and evidence;
- support corrective proposal / rollback vocabulary;
- distinguish unpublished discard, published rollback, and irreversible migration limits.

Host responsibility:

- provide product UX for corrective proposals and rollback;
- decide how to communicate data or migration limitations.

### Migration Needs Downtime

Framework responsibility:

- make migration mode explicit;
- require backup/restore or irreversible-migration evidence before publish readiness;
- block publish when migration evidence is missing.

Host responsibility:

- implement migration scripts;
- choose downtime policy;
- execute backup/restore and communicate operational impact.

### Reviewer Denies

Framework responsibility:

- represent denial as a first-class governance decision;
- keep proposal, denial reason, and evidence refs inspectable;
- ensure denied proposal does not execute.

Host responsibility:

- route denial feedback back to Builder/Agent;
- decide whether the next step is clarification, revised proposal, or discard.

### Rollback Fails

Framework responsibility:

- record failure as `failed_unrecovered` with recovery evidence refs;
- prevent ambiguous success claims;
- keep prior approval and execution evidence inspectable.

Host responsibility:

- provide operational runbook and support workflow;
- decide whether Owner/Operator escalation is required.

## What Should Become Framework Contract In 0.3.0

The likely framework-level contract is:

```text
BuildChangeGovernancePolicy
BuildChangeGovernanceRequest
BuildChangeGovernanceDecision
GovernanceRoleAssignment
```

These should be deterministic validators/evaluators, not a workflow engine.

The evaluator should answer:

- which route applies to this change;
- which roles are required;
- which decisions satisfy the route;
- why publish/apply is allowed or blocked;
- which evidence refs support the decision.

## What Should Stay Host-Owned

The Creation Host should still own:

- real login/authentication;
- org/team directory mapping;
- provider credentials and SDKs;
- notification and assignment UX;
- admin console and policy editor;
- audit storage/retention/export;
- deployment adapter;
- incident response workflow.

## Decision Rule

Promote only the repeated governance vocabulary into framework core.

Do not promote:

- one Host's UI;
- one provider's SDK shape;
- one org's approval hierarchy;
- one deployment target;
- one audit storage backend.

0.3.0 should make enterprise governance explainable and testable without collapsing Creation Host product logic into the framework.
