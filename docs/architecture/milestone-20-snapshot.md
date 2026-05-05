# Milestone 20 Snapshot: Open-Ended Definition Artifact Boundary

**Date:** 2026-05-05
**Status:** Closed after ADR-0031, executable M18 boundary contract, focused M16/M18 verification, M16/M18 smoke verification, and full test sweep
**Audience:** teammates deciding whether Pneuma can proceed to final release-candidate decision
**Scope:** one pre-RC boundary: whether open-ended UI/module artifacts are Host-owned artifacts or framework-governed definition rows.
**Chinese version:** [Milestone 20 Snapshot zh-CN](./milestone-20-snapshot.zh-CN.md)

## Executive Summary

M19 found the repo technically close to a developer-facing release candidate, but blocked RC tagging on one conceptual boundary:

> M18 proved open-ended app creation through a Creation Host, but did not prove arbitrary UI/module artifacts are framework-governed definition rows.

M20 closes that boundary with [ADR-0031](./adr/0031-open-ended-definition-artifact-boundary.md).

The accepted decision:

```text
Open-ended UI/module artifacts are Host-owned artifacts with Host-level approval in v0.
They may use Host approval, transcript, inspection, release, restart, and rollback evidence.
They are not framework definition rows.
They are not definition.apply_change_set artifacts.
```

This keeps Pneuma's RC claim precise:

```text
Framework-governed today:
  Table / Column / Operation / View / PolicyRule / PolicySetting / Rollback

Host-governed in v0:
  routes / sections / style tokens / dynamic modules / profile-owned UI definition artifacts
```

## Why M20 Matters

M18's Personal Focus Site was the right pressure test because it was not another inbox, decision log, table, or queue. It used:

```text
routes
sections
style tokens
dynamic GitHub attention module
```

Those artifacts are real app definition, but they are not the same kind of app definition as `pneuma_tables`, `pneuma_operations`, or `pneuma_views`.

If Pneuma promoted them into framework core immediately, it would risk overfitting one site-shaped example. If Pneuma ignored the distinction, it would overclaim governance. M20 chooses the conservative boundary:

```text
Creation Hosts may own open-ended artifacts.
The framework can support Host evidence around them.
The framework does not yet standardize their internal shape.
```

## What Changed

| Area | Change |
|---|---|
| ADR | Added ADR-0031 as the accepted source of truth for Host-owned open-ended artifacts. |
| M18 executable contract | Added `M18_OPEN_ENDED_DEFINITION_BOUNDARY` to the Personal Focus Site definition module. |
| Host profile metadata | M18 profile metadata now declares the boundary for `site-definition.json`. |
| Inspect output | M18 Host inspection now returns `definition_governance_boundary`. |
| Transcript evidence | M18 evolution transcript now says `host.apply_open_ended_evolution`, `governance_scope: "host_approval"`, and explicitly marks `framework_definition_rows: false`. |
| Tests | Added a failing-then-passing test proving M18 open-ended artifacts are Host-owned, not framework definition rows. |
| Docs | Updated README, PRODUCT, AGENTS, CLAUDE, roadmap, M18/M19 snapshots, team-share docs, architecture index, and examples index. |

## Executable Boundary Contract

M18 now exposes the accepted boundary as data:

```ts
{
  artifact_kind: "host_owned_open_ended_definition",
  artifact_path: "site-definition.json",
  governance_scope: "host_approval",
  host_operation: "host.apply_open_ended_evolution",
  framework_definition_rows: false,
  framework_definition_apply_change_set: false,
}
```

This appears in:

- `examples/m18-open-ended-personal-focus-site/site-definition.ts`
- M18 Host profile metadata
- M18 Host inspect output
- M18 evolution transcript
- M18 focused tests

## Verification Report

TDD red check:

```text
bun test examples/m18-open-ended-personal-focus-site/site-definition.test.ts \
  examples/m18-open-ended-personal-focus-site/run.test.ts

Expected failure:
  Export named 'M18_OPEN_ENDED_DEFINITION_BOUNDARY' not found
  inspected.inspection.definition_governance_boundary is missing
```

Focused M18 tests:

```text
bun test examples/m18-open-ended-personal-focus-site

7 pass
0 fail
58 expect() calls
```

M16 regression:

```text
bun test examples/m16-reference-creation-host/run.test.ts

1 pass
0 fail
26 expect() calls
```

M18 smoke:

```text
bun run examples/m18-open-ended-personal-focus-site/run.ts --port 0 --smoke-exit

created generated app: pandazki-focus-site
preview + GitHub attention: passed
inspect UI definition: passed
evolution proposal: awaiting approval
evolution approval: completed
publish v0: active pandazki-focus-site-v0
publish v1: active pandazki-focus-site-v1 previous pandazki-focus-site-v0
restart active: healthy
rollback: active pandazki-focus-site-v0
smoke verification: passed
```

M16 smoke:

```text
bun run examples/m16-reference-creation-host/run.ts --port 0 --smoke-exit

created generated app: team-knowledge-inbox
knowledge inbox preview + inspect: passed
publish v0: active team-knowledge-inbox-v0
evolution proposal: v1 awaiting approval
evolution approval: completed with 3 priority rows
publish v1: active team-knowledge-inbox-v1 previous team-knowledge-inbox-v0
restart active: healthy
rollback: active team-knowledge-inbox-v0
created generated app: team-decision-log
team decision log preview + inspect: passed
smoke verification: passed
```

Full suite:

```text
bun test

1137 pass
0 fail
4263 expect() calls
Ran 1137 tests across 173 files. [72.72s]
```

## What Is Proven

| Claim | Evidence |
|---|---|
| The M19 boundary is now accepted | ADR-0031 chooses Host-owned artifacts + Host-level approval. |
| M18 no longer relies on prose only | The boundary is present in code, inspect output, transcript, and tests. |
| Pneuma does not overclaim open-ended governance | Contract explicitly says `framework_definition_rows: false`. |
| The integrated Host path still works | M16 regression and smoke still pass. |
| The open-ended app path still works | M18 tests and smoke still pass. |
| Full suite remains healthy | `bun test` passes with 1137 tests. |

## What Is Not Proven

M20 does not claim:

- a generic framework `Surface / Route / ComponentTree` primitive;
- `definition.apply_change_set` support for arbitrary open-ended UI/module artifacts;
- hot reload for open-ended artifact changes;
- custom component distribution;
- production IAM or multi-tenant Host policy;
- production traffic switching or hosted deployment;
- Runtime Agent inside published apps.

Those remain future pressure lines.

## Next Step

The next step is no longer "decide M20." M20 is closed.

The next step is:

```text
final release-candidate decision
  -> review M20 boundary and verification
  -> run final docs/index health check
  -> decide tag / no tag
```

If no new top-level primitive gap appears, the project can proceed to a developer-facing release-candidate tag.
