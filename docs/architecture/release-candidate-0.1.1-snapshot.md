# Release Candidate Patch Snapshot: pneuma-rc-0.1.1

**Status:** accepted patch release  
**Chinese version:** [release-candidate-0.1.1-snapshot.zh-CN.md](./release-candidate-0.1.1-snapshot.zh-CN.md)  
**Previous RC:** [pneuma-rc-0.1.0 snapshot](./release-candidate-snapshot.md)

`pneuma-rc-0.1.1` is a small developer-contract patch over `pneuma-rc-0.1.0`.

It does not change the accepted four-layer product model, Operation-first primitive model, open-ended artifact boundary, Authoring Kit contract, or Sharing Governance contract. It absorbs concrete feedback from the external DevBoard Studio implementation where the framework contract was correct but too implicit for a Developer building a real Creation Host.

## Decision

Ship RC 0.1.1 as a **contract-surfacing patch**, not a new milestone:

- expose stable runtime constants for hidden environment/header names;
- expose stable lifecycle marker format/print helpers;
- document AppConfig authoring invariants that previously required source reading;
- document runtime composition boundaries around `asBunFetch`, internal calls, published data modes, and Host-owned routes;
- document release rollout helper shapes;
- document Authoring Kit JSON shape requirements in the canonical Creation Host contract guide;
- record which DevBoard gaps are intentionally deferred because they require new primitive design.

## Accepted In This Patch

| Feedback | RC 0.1.1 action |
|---|---|
| #10 Authoring Kit JSON shape only visible in scaffold/source | `creation-host-contract.md` now lists required `CredentialRequirement`, `app_id`, `init_recipe`, and `subject` shapes. |
| #18 `PNEUMA_SQLITE_PATH` hidden env contract | `@pneuma-framework/runtime` exports `PNEUMA_SQLITE_PATH_ENV`; AppConfig guide documents import-order discipline. |
| #19 service-ready marker is handwritten in templates | `@pneuma-framework/core` exports `format*Marker` and `print*Marker` helpers. |
| #20 `asBunFetch` path ownership implicit | Runtime composition guide states which paths runtime owns and where Host routes must intercept. |
| #24 AppConfig authoring invariants scattered across source | AppConfig authoring guide documents cell type spellings, reserved row columns, `_cell` convention, operation surface inference, and destructive impact invariant. |
| #29 release rollout helper shapes not obvious | Release rollout authoring guide documents construction, checks, transition envelopes, and summary shape. |
| #3 / #21 Host internal credential broker token pattern | Runtime composition guide documents the M17 internal-token shape and how a Host may mirror it for Host-owned credential brokering. |
| #4 published data inheritance semantics undefined | Runtime composition guide records the current recommended modes: isolated version data and carry-forward with migration receipt. |

## Deferred By Design

These are valid pressure findings, but not safe to fold into a patch release because they create new primitives, new packages, or compatibility surface:

| Feedback | Why deferred |
|---|---|
| #1 RuntimeMode enum / `createRuntimeContext` | Needs API design around Host-owned dev/prod semantics and dev-additive-only enforcement. |
| #2 preview lifecycle semantic tools | Useful, but needs alignment with lifecycle subsystem and process manager ownership. |
| #5 cross-lane atomic approval | Requires a formal composition contract for framework definition lane + Host artifact lane. |
| #6 tool lane mapping | Belongs in a Build Agent Package extension after the lane model is designed. |
| #7 `exportDefinitionRows()` | Good helper, but should be designed with share artifact versioning and privacy boundary. |
| #8 `runInitRecipe()` | Needs Host operation registry contract and idempotency semantics. |
| #9 domain tool surface policy | Likely important for production Hosts; should be an Authoring Kit extension. |
| #11 / #12 test fixtures and test DB helper | High-leverage DX utilities, but should be a coherent testing package. |
| #13-#17 cookies, sessions, OAuth provider helpers | These are host-app security utilities, not RC patch material. They deserve a focused Host security kit milestone. |
| #22 / #23 subprocess stream and ready helpers | Useful host-utils lane; should not be mixed into the marker patch. |
| #26-#28 opencode host-owned tools, auth, tool-call events | Real backend-agent polish lane; requires adapter contract work. |
| #30-#32 rollout convenience helpers | #32 is already covered by current `active_url`; #30/#31 need type/API decisions. |
| #33 published SQLite read-only semantics | Needs a runtime/storage design choice, not just docs. Current docs clarify the RC behavior. |
| #34 eager table materialization | Needs storage lifecycle change and broad regression tests. |

## Developer Guidance Added

- [AppConfig Authoring Guide](../developer/app-config-authoring.md)
- [Runtime Composition Guide](../developer/runtime-composition.md)
- [Release Rollout Authoring Guide](../developer/release-rollout-authoring.md)
- [Creation Host Contract](../developer/creation-host-contract.md) authoring shape notes

## Verification

Verified on 2026-05-07:

```bash
bun test packages/core/test/markers.test.ts packages/runtime/test/constants.test.ts
bun run typecheck
bun test $(rg --files -g '*.test.ts' | rg -v 'docker-smoke|release-smoke|release-packaging-smoke')
git diff --check
```

Results:

- Targeted helper tests: 11 pass.
- Typecheck: pass.
- Non-Docker test suite: 1165 pass across 170 files.
- Markdown local-link check: 202 markdown files checked, excluding `.claude` skill templates with intentional placeholder links.
- Diff whitespace check: pass.

Full `bun test` was also attempted. It reached the legacy Docker smoke tests and timed out in `examples/m4-knowledge-inbox/docker-smoke.sh` while `docker build` was blocked on `docker-credential-desktop get`. The same Docker credential-helper block appeared when a filtered run accidentally included `examples/m8-release-packaging-hardening/release-packaging-smoke.test.ts`. No RC 0.1.1 code path depends on Docker; this patch is accepted on targeted, typecheck, link, and non-Docker suite evidence.
