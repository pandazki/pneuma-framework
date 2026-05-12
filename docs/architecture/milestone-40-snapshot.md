# Milestone 40 Snapshot: Production Readiness Boundary

**Status:** Closed  
**Date:** 2026-05-12  
**Chinese version:** [milestone-40-snapshot.zh-CN.md](./milestone-40-snapshot.zh-CN.md)

## What Changed

M40 pins the production-readiness boundary for the `pneuma-rc-0.3.0` line.

The project is now explicit that 0.3.0 is not a broad enterprise SaaS claim. It is a minimum enterprise governance claim for Builder + Build Agent business-function changes.

## What Is Proven

- 0.3.0 is scoped to minimum enterprise governance, not full production SaaS.
- Framework / Creation Host / later productization / out-of-scope boundaries are explicit.
- Provider pressure baseline is GitHub public-read plus mock Linear.
- Production readiness is framed as engineering control over AI-assisted business changes, not marketplace artifact trust.

## Boundary Summary

The framework should provide:

- subject and role vocabulary;
- deterministic approval route evaluation;
- evidence references;
- Build Assurance integration points;
- migration/recovery/release readiness vocabulary;
- provider capability boundaries.

The Creation Host should provide:

- real identity and org mapping;
- product UI and approval workflow;
- provider credentials and SDKs;
- deployment and migration execution;
- audit storage and retention policy;
- incident response and operator playbooks.

## Non-Claims

M40 does not claim:

- production IAM;
- hosted credential vault;
- full workflow engine;
- compliance retention backend;
- marketplace signing/provenance;
- zero-downtime migration;
- complete provider certification.

## Next

M41 should turn this boundary into the first framework-level enterprise governance vocabulary:

```text
BuildChangeGovernancePolicy
BuildChangeGovernanceRequest
BuildChangeGovernanceDecision
GovernanceRoleAssignment
```

The first implementation should remain a deterministic evaluator, not a product workflow engine.
