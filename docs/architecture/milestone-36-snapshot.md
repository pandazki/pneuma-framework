# Milestone 36 Snapshot — Recovery Drill Matrix

**Date:** 2026-05-10  
**Status:** Closed as a post-RC assurance milestone. This is not a `pneuma-rc-0.1.4` release tag.  
**Input:** M35 made approval-time disclosure explicit. M36 asks how a Host proves expected failure paths are not just hand-waved.

## What M36 Proved

M36 adds `BuildChangeRecoveryDrillScenario` and matrix evaluation:

```text
Expected failure path
  -> assurance case readiness
  -> required evidence refs
  -> passed / failed drill result
```

The important shift is:

```text
Failed-but-recovered is an engineering-control success, not merely a bad run.
```

## Product Boundary

The drill matrix is a core helper for Host tests and downstream validation. It
does not copy logs, implement production incident response, replace rollout, or
become a compliance backend. It checks the shared assurance vocabulary:

- expected readiness;
- required evidence kinds;
- missing assurance cases;
- missing evidence references.

Host-specific failure injection and recovery implementation remain Host-owned.

## Implementation Surface

New core files:

- `packages/core/src/build-assurance-recovery.ts`
- `packages/core/test/build-assurance-recovery-drill.test.ts`

Updated exports:

- `packages/core/src/index.ts`

Updated guide:

- [Build Change Assurance](../developer/build-assurance.md)
- [中文版](../developer/build-assurance.zh-CN.md)

## Drill Shape

Example scenario:

```ts
{
  id: "post-apply-rollback",
  title: "Post-apply check failure rolls back source",
  build_change_id: "change-1",
  failure_stage: "post_apply",
  simulated_failure: "preview smoke failed after apply",
  expected_readiness: "failed_recovered",
  required_evidence_kinds: ["code_change_receipt", "host_check"],
}
```

The result is intentionally small:

```ts
{
  status: "passed" | "failed",
  readiness,
  missing_evidence_kinds,
  issues,
}
```

## Verification

Targeted command:

```bash
bun test packages/core/test/build-assurance-recovery-drill.test.ts
```

Targeted result:

- recovery drill matrix: `4 pass`, `0 fail`, `7 expect() calls`.

The tests prove:

- expected readiness and evidence pass the drill;
- wrong readiness fails;
- missing evidence kinds fail with explicit issues;
- matrix evaluation matches scenarios to cases and summarizes pass/fail counts.

## Remaining Boundary

M36 deliberately does not add a demo-only fake failure to the Reference Host UI.
The correct next step is M37: package M32-M36 as a downstream-readable adoption
path and run a broader review against the top-level product model.

