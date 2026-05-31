# Release Candidate Snapshot: pneuma-rc-0.2.0

**Status:** release-candidate gate passed; tag only after final owner confirmation  
**Chinese version:** [release-candidate-0.2.0-snapshot.zh-CN.md](./release-candidate-0.2.0-snapshot.zh-CN.md)  
**Previous patch:** [pneuma-rc-0.1.3 Code Change Lane upgrade guide](../developer/upgrading-to-rc-0.1.3.md)

`pneuma-rc-0.2.0` is the first versioned roll-up after the post-RC stabilization lane.

It is not a new product direction. It packages the current Developer-facing contract so a fresh downstream Creation Host can install the framework locally, read the current guides, adopt the Builder + Build Agent assurance loop, and report real framework gaps.

## Decision

Prepare RC 0.2.0 as a **developer-contract release train**:

- collect M26-M38 into one versioned contract;
- keep the four-layer model unchanged;
- keep Creation Host product choices Host-owned;
- expose local package consumption as an explicit test gate;
- update downstream upgrade guidance and canonical entry docs;
- defer tag creation until the final verification report is accepted by the owner.

## What 0.2.0 Rolls Up

| Area | What is now part of the 0.2.0 developer contract |
|---|---|
| Code Change Lane | Hardened proposal/apply/reject flow over draft source workspaces. |
| Runtime composition | Explicit runtime mode, health/diagnostic composition, marker helpers, request fallthrough helpers, readiness waiting. |
| HostExtension slots | Portable Host-owned artifact contribution boundary with fail-closed validation. |
| Agent backend turns | `AgentBackend.runTurn` over BuildThread source-of-truth turns. |
| Credential utilities | Session cookie hashing, OAuth state, callback binding, credential refs, no-secret rebinding evidence, provider-shaped test helpers. |
| Build Assurance | Review packets, assurance cases, durable case store, recovery drill matrix, and adoption guide. |
| Package boundary | Developer-facing packages use local-consumable `file:` internal dependencies, focused public subpath exports, downstream-safe CLI diagnostics, and a repo-external smoke gate. |

## Package Consumption Gate

The new gate is:

```bash
bun run test:package-consumption
```

It creates a fresh temporary downstream project, installs:

```text
@pneuma-framework/core-domain
@pneuma-framework/core
@pneuma-framework/runtime
@pneuma-framework/cli
```

by `file:` path from an isolated copy of the package directories with no monorepo `node_modules`, imports focused public subpaths, runs `scaffold-host`, runs `doctor-host`, runs a smoke program, and typechecks the consumer project.

This test exists because fresh downstream projects should fail on real framework contract mistakes, not on monorepo-only dependency assumptions.

## Accepted In This Release Train

Accepted:

- M26-M38 are no longer just chronological milestone evidence; they are part of the current Developer contract.
- `workspace:*` is no longer required in developer-facing package manifests for local external consumption.
- Focused public subpath exports are the preferred developer-facing import surface for Host contracts.
- `doctor-host` can run from a fresh downstream install without eagerly importing unrelated core modules.
- Provider-named BuildThread packing helpers remain available only as deprecated compatibility; provider-neutral `packBuildTurnsForRoleContent` is the core path.
- The downstream upgrade path is documented directly in [Upgrading To RC 0.2.0](../developer/upgrading-to-rc-0.2.0.md).

## Still Not Claimed

RC 0.2.0 still does not claim:

- production IAM;
- hosted audit or compliance retention;
- production credential vaulting;
- broad cloud deployment adapters;
- zero-downtime online migration;
- Runtime Agent productization;
- marketplace artifact signing or transport;
- complete Pneuma 2.x dogfood rebuild.

This boundary is intentional. Pneuma is still focused on enterprise-grade engineering control for Builder + Build Agent workflows, not generic artifact marketplace trust.

## Verification

Final verification on 2026-05-11:

```bash
bun run test:package-consumption
bun run typecheck
bun test
git diff --check
```

Results:

- package-consumption smoke: passed; fresh temporary downstream project installed `core-domain`, `core`, `runtime`, and `cli` by `file:` path from an isolated package copy, imported focused public subpaths, ran `scaffold-host`, ran `doctor-host`, executed the smoke, and typechecked;
- typecheck: passed;
- full suite: `1280 pass`, `0 fail`, `4755 expect() calls` across `194 files`;
- `git diff --check`: passed.

Fresh downstream validation:

- a new temporary downstream Creation Host, Release Radar Studio, was built from an exported RC 0.2.0 candidate directory;
- it consumed `@pneuma-framework/core-domain`, `@pneuma-framework/core`, `@pneuma-framework/runtime`, and `@pneuma-framework/cli` through `file:` dependencies;
- downstream `typecheck`, unit tests, `doctor-host`, smoke runner, and a live HTTP flow passed;
- the downstream gap log reported no material framework blocker. The only accepted follow-up was documentation-level: when validating an exported non-git candidate directory, record the candidate artifact path/version instead of a commit hash.

Tagging remains a separate owner decision after this verification report.
