# Milestone 19 Snapshot: Release Candidate Review

**Date:** 2026-05-04
**Status:** Closed as RC review; RC tag deferred pending one pre-RC boundary decision. Post-M20 note: the boundary is now accepted in ADR-0031.
**Audience:** teammates evaluating whether Pneuma is ready for candidate release
**Scope:** project-goal alignment, package/API boundary, docs health, full verification, browser evidence, and third-party review after M1-M18.
**Chinese version:** [Milestone 19 Snapshot zh-CN](./milestone-19-snapshot.zh-CN.md)

## Executive Summary

M19 reviewed the whole project from the top-level goal:

> Can a Developer use pneuma-framework to build an AI-native Creation Host where a Builder co-creates deployable applications through a governed agent loop?

The answer is close, but not yet a release tag.

The strong evidence:

- the four-artifact model is now consistent across current docs;
- M16 shows an integrated Creation Host workflow for schema-driven generated apps;
- M17 closed the major security/governance acceptance issues;
- M18 proves the Host workflow can carry a non-table-first Personal Focus Site;
- the full test suite is green after stale governance assertions were corrected;
- browser E2E still finds real integration defects, and those defects are now covered by tests.

The remaining pre-RC blocker:

> M18's open-ended UI/module evolution is Host-governed, not framework `definition.apply_change_set` governance.

That may be the right boundary, but it must be explicit before a candidate release. Pneuma should not accidentally claim that arbitrary open-ended UI/module artifacts already flow through the same framework-governed app-definition rows as Tables, Operations, Views, and PolicyRules.

## Decision

M19 decision:

```text
GO for pre-RC closure work.
NO-GO for tagging the RC today.
```

The candidate release should wait for one small but important M20 gate:

```text
M20: Open-ended definition governance boundary
  -> decide and document whether open-ended UI/module artifacts are:
     A. Host-owned artifacts with Host-level approval, or
     B. framework-governed definition rows through a new primitive/extension lane.
  -> update M18/M16 examples and docs to match the chosen contract.
```

This is not a reset. It is the final boundary tightening before a credible developer-facing candidate.

## What M19 Fixed

M19 did not add a major feature. It fixed review and verification defects discovered during the RC pass:

| Area | Problem found | Resolution |
|---|---|---|
| Creation Host core contract | `packages/core/src/creation-host.ts` exposed reference-stack assumptions: `sqlite_path`, `runtime: "bun-typescript"`, `persistence: "sqlite"`, `read_operation_id`, `data_table_id`. | Core contract now exposes generic `stack_id`, `capabilities`, and opaque JSON `metadata`; concrete SQLite paths and read/data operation ids live in reference examples. |
| M18 transcript accuracy | M18 claimed `definition.apply_change_set` in transcript while the example directly changed `site-definition.json`. | Transcript now says `host.apply_open_ended_evolution` with `governance_scope: "host_approval"`. M18 docs explicitly say this is not framework `definition.apply_change_set` evidence. |
| Rollout evidence shape | Browser E2E revealed M18 release checks were strings cloned as object-like character maps. | Health checks are now real `ReleaseRolloutCheck` objects and covered in M18 browser-flow test assertions. |
| Stale governance tests | M5/M6/M9 and `definition-apply` tests still assumed old 4-change Priority Queue and public query/view defaults. | Tests now reflect the current fail-closed governance model and the 5-change capability proposal. |
| Onboarding docs | Root `README.md` was missing, `PRODUCT.md` was stale, and local-only AGENTS/CLAUDE pointers looked mandatory. | Added root README, rewrote PRODUCT, and clarified local files are optional/git-ignored. |
| ADR template link health | ADR template had a wildcard sample link that failed markdown link checks. | Replaced with a concrete example reference. |

## Verification Evidence

Full test suite:

```text
bun test

1136 pass
0 fail
4261 expect() calls
Ran 1136 tests across 173 files. [75.33s]
```

Typecheck:

```text
bun run typecheck
exit 0
```

Whitespace/diff check:

```text
git diff --check
exit 0
```

Architecture markdown link check:

```text
checked 77 architecture markdown files
exit 0
```

Focused post-fix checks:

```text
bun test packages/core/test/creation-host.test.ts \
  examples/m16-reference-creation-host/run.test.ts \
  examples/m18-open-ended-personal-focus-site

10 pass
0 fail
94 expect() calls
```

Live browser review:

```text
http://127.0.0.1:8885/

Create -> Preview -> Inspect -> Evolve -> Transcript
  transcript includes host.apply_open_ended_evolution
  governance_scope is host_approval

Allow -> Publish v0 -> Publish v1 -> Rollback -> Rollout
  active release returns to pandazki-focus-site-v0
  release checks are structured health/site_api ReleaseRolloutCheck objects
  app console error count: 0
```

## Third-Party Review

An independent reviewer returned **go-with-blockers** before the final fixes.

The important findings were correct:

| Finding | M19 disposition |
|---|---|
| M18 bypassed framework `definition.apply_change_set` while claiming it in transcript. | Accepted. Transcript and docs corrected. Boundary remains as M20 decision. |
| Core Creation Host contract leaked Bun/SQLite/reference app assumptions. | Accepted and fixed in `packages/core/src/creation-host.ts`. |
| `AGENTS.local.md` was referenced as required but absent. | Accepted and fixed by making local pointers optional. |
| Full-suite evidence needed a fresh M19 run. | Accepted. Full `bun test` is now green. |

## What Is Healthy

The project is structurally healthier than it was before M19:

- current docs explain Framework -> Creation Host -> Generated Application -> Published Application without reverting to the old template-only model;
- framework core no longer exposes the reference Creation Host's SQLite/Bun inspection details;
- M17 security fixes are still covered by runtime and framework operation tests;
- query-backed reads remain fail-closed unless explicit invoke policy exists;
- framework-internal definition Operations still reject direct/spoofed external HTTP calls;
- M16 and M18 are both runnable and browser-testable;
- adapter/provider implementation packages are marked as reference integrations, not core semantics.

## Remaining RC Blocker

The one blocker is conceptual, not a failing test:

```text
Open-ended app definition governance is not yet pinned.
```

M1-M17 governance is very strong for framework primitives:

```text
Table
Column
Operation
View
PolicyRule
PolicySetting
Rollback
```

M18 introduced a different kind of definition:

```text
routes
sections
style tokens
dynamic modules
GitHub attention ranking config
```

Today those live in a Host-owned `site-definition.json`. That is acceptable only if the framework explicitly says:

```text
Host-owned open-ended artifacts are outside framework definition-as-data v0.
They may still use Host approval, release, inspection, and rollback evidence.
```

If that is not acceptable, M20 must introduce a framework-governed extension lane before RC.

## Recommended M20

M20 should be deliberately small:

1. Write ADR-0031: Open-ended definition artifact boundary.
2. Decide one of two contracts:
   - Host-owned artifact + Host approval is allowed for open-ended generated apps; or
   - add a framework primitive/extension row for open-ended definition artifacts.
3. Update M18 to match the contract.
4. Run the M16/M18 browser path and full verification.
5. If green, tag the release candidate.

## Post-M20 Update

M20 accepted [ADR-0031](../architecture/adr/0031-open-ended-definition-artifact-boundary.md):

```text
Open-ended UI/module artifacts are Host-owned artifacts with Host-level approval in v0.
They are not framework definition rows.
They are not definition.apply_change_set artifacts.
```

The M18 Personal Focus Site now exposes this as an executable boundary contract in profile metadata, Host inspection output, and evolution transcript evidence.

The remaining next step after M20 is no longer the boundary decision itself. It is a final release-candidate decision on top of the accepted boundary and fresh verification.

## Bottom Line

M19 did what it was supposed to do: it prevented a premature release claim while proving the repo is technically close.

The project is not drifting anymore. As of M20, that pre-RC boundary decision has been accepted; the remaining work is the final RC decision.
