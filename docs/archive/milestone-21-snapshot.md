# Milestone 21 Snapshot: Developer Onboarding

**Status:** Closed after scaffold command, Host diagnostics, profile contract helpers, developer guides, M16/M18 smoke verification, and typecheck/full-suite verification

**Date:** 2026-05-05

## Why M21 Exists

M20 closed an architectural boundary: open-ended UI/module artifacts are Host-owned in v0, not framework definition rows.

That made the project close to a candidate release, but there was still one developer-experience gap:

> A new Developer could read the architecture, but did not yet have a straight path from zero to a first Creation Host.

M21 closes that gap. It does not add a new primitive. It turns the existing M1-M20 evidence into an external Developer path.

## What Changed

### 1. Golden Path Scaffold

The CLI now supports:

```bash
pneuma-framework scaffold-host ./my-host --name "My Host"
```

The scaffold creates:

```text
package.json
profiles.json
README.md
src/run.ts
```

This is intentionally small. It is a starter Host, not a hidden framework-owned app-builder product.

### 2. Host Diagnostics

The CLI now supports:

```bash
pneuma-framework doctor-host --workspace ./workspace --profiles ./profiles.json
```

The doctor command reports:

- profile contract validity;
- Host state presence;
- generated-app project/version counts;
- missing version directories;
- next steps.

### 3. Contract Test Helpers

`@pneuma-framework/core` now exports:

```ts
validateCreationHostProfileContract(profile)
assertCreationHostProfileContract(profile)
diagnoseCreationHostWorkspace({ workspace, profiles })
formatCreationHostDiagnosticsReport(report)
```

These helpers let a Developer add lightweight contract tests to a Host repo without importing the M16/M18 examples.

### 4. Developer Guides

New guides:

- [Getting Started](../developer/getting-started.md)
- [Getting Started 中文版](../developer/getting-started.zh-CN.md)
- [Creation Host Contract](../developer/creation-host-contract.md)
- [Creation Host Contract 中文版](../developer/creation-host-contract.zh-CN.md)

They explain the practical path:

```text
scaffold
  -> doctor
  -> study M16 schema-driven loop
  -> study M18 open-ended loop
  -> add profile contract tests
```

### 5. Published Runtime Health Hardening

The final full-suite pass exposed an existing M16/M14 readiness race: after `service-ready`, published runtime health could transiently receive a 404 from `/healthz` under full-suite pressure.

M21 added a regression test and made published runtime health checks tolerate short readiness lag. This is developer-experience work because a flaky publish/doctor path destroys trust in the golden path.

## What M21 Proves

M21 proves the framework now has a developer-facing entry point:

```text
Developer starts outside the internal milestone history
  -> creates a starter Creation Host
  -> validates profile shape
  -> diagnoses workspace wiring
  -> follows schema-driven and open-ended reference loops
```

This matters because Pneuma is not only a runtime. Its target user is a Developer building a Creation Host. If that Developer cannot start, inspect, and diagnose the Host path, the release candidate is not actually usable.

## What M21 Does Not Prove

M21 does not claim:

- production SaaS deployment;
- npm package publication;
- a polished Hosted Creation Host product;
- Runtime Agent productization;
- hot reload;
- arbitrary open-ended artifact promotion into framework definition rows;
- broad Pneuma 2.x dogfood.

Those remain post-RC or future-stage work.

## Verification Evidence

TDD red evidence:

```text
bun test packages/core/test/developer-experience.test.ts
-> failed because validateCreationHostProfileContract was not exported

bun test packages/cli/test/developer-experience.test.ts
-> failed because scaffold-host and doctor-host were unsupported verbs
```

Focused green:

```text
bun test packages/core/test/developer-experience.test.ts packages/cli/test/developer-experience.test.ts
8 pass
0 fail
27 expect() calls
```

Core + Creation Host regression:

```text
bun test packages/core/test/developer-experience.test.ts packages/core/test/creation-host.test.ts
7 pass
0 fail
27 expect() calls
```

CLI regression:

```text
bun test packages/cli/test/developer-experience.test.ts packages/cli/test/parse-args.test.ts packages/cli/test/e2e.test.ts
21 pass
0 fail
38 expect() calls
```

M16 smoke:

```text
bun run examples/m16-reference-creation-host/run.ts --port 0 --smoke-exit
knowledge inbox preview + inspect: passed
evolution approval: completed with 3 priority rows
publish v1: active team-knowledge-inbox-v1 previous team-knowledge-inbox-v0
restart active: healthy
rollback: active team-knowledge-inbox-v0
team decision log preview + inspect: passed
smoke verification: passed
```

M18 smoke:

```text
bun run examples/m18-open-ended-personal-focus-site/run.ts --port 0 --smoke-exit
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

Published runtime race regression:

```text
bun test examples/m14-host-publish-rollout/published-runtime.test.ts examples/m16-reference-creation-host/run.test.ts
3 pass
0 fail
36 expect() calls
```

Final focused regression after the type-only CLI fix:

```text
bun test packages/cli/test/developer-experience.test.ts packages/cli/test/parse-args.test.ts packages/cli/test/e2e.test.ts packages/core/test/developer-experience.test.ts
25 pass
0 fail
84 expect() calls
```

Typecheck:

```text
bun run typecheck
exit 0
```

Docs link check:

```text
checked 140 markdown files
```

Diff whitespace check:

```text
git diff --check
exit 0
```

Full suite:

```text
bun test
1146 pass
0 fail
4294 expect() calls
Ran 1146 tests across 175 files. [69.95s]
```

## RC Boundary After M21

The RC decision is now narrower:

```text
M21 code/docs/tests
  -> final static/full-suite verification
  -> docs link health
  -> decision: tag RC or identify one final blocker
```

Do not broaden the next step into hot reload, Runtime Agent, hosted deployment, or Pneuma 2.x dogfood unless the product direction explicitly changes.
