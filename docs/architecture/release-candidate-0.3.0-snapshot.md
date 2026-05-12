# Release Candidate Snapshot: pneuma-rc-0.3.0

**Status:** release-candidate verification passed; tag pending final owner confirmation  
**Date:** 2026-05-12  
**Chinese version:** [release-candidate-0.3.0-snapshot.zh-CN.md](./release-candidate-0.3.0-snapshot.zh-CN.md)  
**Previous release train:** [pneuma-rc-0.2.0 snapshot](./release-candidate-0.2.0-snapshot.md)

`pneuma-rc-0.3.0` is the first enterprise-governance release train after the package-consumable 0.2.0 developer contract.

It does not claim production enterprise security. It packages the minimum framework vocabulary and evidence needed to say:

```text
one AI-assisted business change has a role route,
a review packet,
a governance decision,
a publish gate,
and a recovery path.
```

## Decision

Prepare RC 0.3.0 as a **minimum enterprise governance release train**:

- keep the four-layer product model unchanged;
- keep identity, team directory, workflow assignment, credential vaulting, and audit retention Host-owned;
- add a framework-owned role/route/evaluator vocabulary for build-change governance;
- wire governance decisions into Build Change Assurance so publish readiness can fail closed;
- prove the story through a reference demo with Builder, Reviewer, Owner, Operator, and End User responsibilities;
- defer tag creation until the final verification report is accepted by the owner.

## What 0.3.0 Proves

| Area | What is now proven |
|---|---|
| Production boundary | The project has a written line between "conceptually production-meaningful" and "production platform complete." |
| Enterprise vocabulary | `builder`, `reviewer`, `owner`, `operator`, and `end_user` are explicit governance roles, mapped by the Host rather than authenticated by the framework. |
| Governance routes | `BuildChangeGovernancePolicy` can route standard changes to Reviewer and high-risk changes to Owner. |
| Fail-closed decisions | Builder self-approval does not satisfy required review; denials block; app mismatch fails closed. |
| Assurance integration | Build Assurance blocks `ready_to_publish` when governance is required and not allowed. |
| Demo evidence | The M43 demo shows proposal, self-approval denial, Reviewer approval, publish, End User usage, and Owner rollback. |
| Provider pressure | GitHub public-read plus mock Linear prove provider data can participate as content/evidence without provider-specific governance branches. |

## Evidence Chain

| Milestone | Evidence |
|---|---|
| [M40](./milestone-40-snapshot.md) | Production readiness boundary: 0.3.0 should prove governance control, not hosted enterprise SaaS. |
| [M41](./milestone-41-snapshot.md) | Enterprise governance evaluator: roles, routes, decisions, fail-closed semantics. |
| [M42](./milestone-42-snapshot.md) | Build Assurance publish gate consumes governance decisions. |
| [M43](./milestone-43-snapshot.md) | End-to-end enterprise governance demo with GitHub public-read and mock Linear provider pressure. |

Developer-facing guide:

- [Enterprise Governance](../developer/enterprise-governance.md)
- [Production Readiness Boundary](./spec/production-readiness-boundary.md)
- [Enterprise Governance Domain Review](./spec/enterprise-governance-domain-review.md)
- [M43 Enterprise Governance Demo](../../examples/m43-enterprise-governance-demo/README.md)

## Still Not Claimed

RC 0.3.0 still does not claim:

- hosted IAM;
- production credential vault;
- compliance retention or audit export backend;
- assignment queues or workflow engine;
- hosted notification system;
- marketplace artifact trust, signing, or transport;
- full provider SDK certification;
- production Linear OAuth;
- production deployment platform;
- zero-downtime traffic switching or online migration.

This boundary is intentional. The framework is adding enterprise-grade engineering control for Builder + Build Agent changes, not becoming a hosted governance product.

## Demo Route

Run:

```bash
bun run examples/m43-enterprise-governance-demo/run.ts --port 8890
```

Open:

```text
http://127.0.0.1:8890/
```

Expected story:

```text
Builder proposes a Dev Board change
  -> Builder self-approval is denied
  -> Reviewer approval allows
  -> Build Assurance reaches ready_to_publish
  -> Published app becomes active for End User
  -> Owner can roll back
```

Automated smoke:

```bash
bun run examples/m43-enterprise-governance-demo/run.ts
```

Expected output:

```text
m43 propose: awaiting reviewer
m43 self approval: denied
m43 reviewer approval: allowed
m43 publish: active
m43 rollback: completed
```

## Verification

Final verification on 2026-05-12:

```bash
bun run typecheck
bun run test:package-consumption
bun test packages/core/test/enterprise-governance.test.ts packages/core/test/build-assurance.test.ts examples/m43-enterprise-governance-demo/enterprise-governance.test.ts
bun run examples/m43-enterprise-governance-demo/run.ts
git diff --check
bun test
```

Results:

- typecheck: passed;
- package-consumption: passed, including the focused `@pneuma-framework/core/enterprise-governance` subpath;
- targeted enterprise/build-assurance/demo tests: `20 pass`, `0 fail`;
- M43 runner: proposal, self-approval denial, Reviewer approval, publish, and rollback completed;
- `git diff --check`: passed;
- markdown local-link check over changed entry docs: passed;
- full suite: `1293 pass`, `0 fail`, `4772 expect() calls` across `196 files`.

Tagging remains a separate owner decision after this verification report.
