# M21 Developer Onboarding Design

**Status:** Approved for implementation

## Goal

M21 turns the current milestone-grade framework into something a new Developer can approach from the outside: scaffold a starter Creation Host, read a concrete guide, verify the Host/profile contract, and diagnose common setup failures before reaching the release-candidate review.

This milestone does not add a new framework primitive. It packages the existing M1-M20 evidence into a developer-facing path.

## User Story

A Developer should be able to:

1. Create a starter Creation Host project.
2. Understand the minimum Creation Host contract.
3. Run contract checks against Host profiles.
4. Run diagnostics against a Host workspace.
5. Follow the same conceptual path shown in the team-share material: create, preview, inspect, evolve, approve, publish, restart, rollback.

## Design

### 1. Golden Path Scaffold

Add a CLI command:

```bash
pneuma-framework scaffold-host ./my-host --name "My Host"
```

The command creates a small Bun TypeScript starter with:

- `package.json`
- `README.md`
- `src/run.ts`
- `profiles.json`

The scaffold is intentionally a starter, not a hidden framework-owned product. It tells the Developer to run and study the existing M16/M18 examples while giving them a shaped local project to adapt.

### 2. Developer Guide

Add a developer-facing guide under `docs/developer/`:

- `getting-started.md`: from zero to first Creation Host loop.
- `creation-host-contract.md`: minimum Host/profile contract, what framework owns, what Host owns, and how schema-driven/open-ended apps differ after ADR-0031.

### 3. Contract Tests

Add a small exported test-kit style API in `@pneuma-framework/core`:

```ts
validateCreationHostProfileContract(profile)
assertCreationHostProfileContract(profile)
```

The API checks the parts that are framework-level contract, not reference-app assumptions:

- stable profile id;
- display name and description;
- template/profile directory;
- optional stack id shape;
- capabilities are non-empty strings;
- metadata is JSON-serializable.

This lets a Developer add one focused test in their Host repo without importing the reference examples.

### 4. Diagnostics / Doctor

Add a CLI command:

```bash
pneuma-framework doctor-host --workspace ./workspace --profiles ./profiles.json
```

The doctor command reports:

- valid/invalid profile contracts;
- Host state file presence;
- project/version directory consistency when a Host state file exists;
- actionable next steps.

The output is text-first so it works in local terminals and CI logs. A future Host UI can render the same diagnostics object.

## Non-Goals

- No published npm package flow yet.
- No production deployment wizard.
- No new adapter/provider abstraction.
- No attempt to make open-ended UI artifacts framework definition rows.
- No new visual workbench UI for diagnostics.

## Verification

- TDD red/green for core contract checks.
- TDD red/green for diagnostics.
- TDD red/green for CLI parse/scaffold/doctor behavior.
- Focused package tests for `packages/core` and `packages/cli`.
- Full typecheck.
- Existing M16 and M18 smoke tests remain green.

