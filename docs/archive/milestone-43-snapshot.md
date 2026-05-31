# Milestone 43 Snapshot: Enterprise Governance Demo

**Status:** Closed  
**Date:** 2026-05-12  
**Chinese version:** [milestone-43-snapshot.zh-CN.md](./milestone-43-snapshot.zh-CN.md)

## What Changed

M43 adds a reference demo for the RC 0.3.0 enterprise governance story:

```text
Builder proposes
  -> Builder self-approval is denied
  -> Reviewer approval allows
  -> Build Assurance reaches ready_to_publish
  -> Published app becomes active
  -> Owner rollback completes
```

## Provider Pressure

The demo is not mock-only:

- GitHub public-read fetches real public repository data for `pandazki`.
- Mock Linear provides deterministic enterprise planning data shaped like Linear workspace/team/project/issue/status/assignee.

This is enough to pressure provider boundaries without turning 0.3.0 into a provider SDK milestone.

## What Is Proven

- The M41 enterprise governance evaluator can route a standard source-code change to a Reviewer.
- Builder self-approval fails closed.
- M42 Build Assurance publish readiness is blocked until governance allows.
- Published Application state is distinct from build-time governance state.
- Owner rollback is a separate authority path from Reviewer approval.

## Verification

```bash
bun test examples/m43-enterprise-governance-demo/enterprise-governance.test.ts
bun run examples/m43-enterprise-governance-demo/run.ts
```

Result:

```text
4 pass
0 fail

m43 propose: awaiting reviewer
m43 self approval: denied
m43 reviewer approval: allowed
m43 publish: active
m43 rollback: completed
```

## Non-Claims

M43 does not claim:

- production identity;
- production credential vaulting;
- real Linear auth;
- assignment queues;
- compliance audit retention;
- hosted deployment;
- zero-downtime rollout.

## Next

M44 should package the 0.3.0 story into release-candidate paperwork, update team-share/docs, and run the final verification gate.
