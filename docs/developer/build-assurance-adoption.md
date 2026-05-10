# Build Assurance Adoption Guide

**Audience:** downstream Developers adding Builder + Agent change assurance to a Creation Host  
**Chinese version:** [build-assurance-adoption.zh-CN.md](./build-assurance-adoption.zh-CN.md)

This guide is the M37 practical adoption path for the M32-M36 assurance
primitives. It assumes the top-level product model stays explicit:

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

Build Assurance belongs to the **Creation Host** control loop. It helps the Host
explain and govern changes a Builder requests from a Build-phase Agent. It is
not a marketplace trust ledger, a package-signing system, or a production
compliance backend.

## The Smallest Useful Adoption

Implement these four steps first:

1. **Create a review packet before approval.**

   Use `createBuildChangeReviewPacket` when the Agent has proposed a bounded
   change and the Host is about to ask the Builder to allow it.

2. **Create an assurance case after each state transition.**

   Use `createBuildChangeAssuranceCase` after proposal, approval, apply,
   verification, publish, failure, or rollback.

3. **Persist cases in the Creation Host workspace.**

   Use `createFileBuildChangeAssuranceCaseStore` for local/reference Hosts.
   Replace the store only when you need a real hosted backend.

4. **Write recovery drills for negative paths.**

   Use `evaluateBuildChangeRecoveryDrillMatrix` in tests to prove failures are
   visible and recovered or fail closed.

## Approval-Time Packet

A review packet should be rendered beside the Allow/Deny controls. It should not
be hidden in a diagnostics tab.

The Builder should see:

- one intent summary;
- a scope boundary that says what is not included;
- proposed changes by lane;
- risk classification;
- pre-proposal checks;
- recovery plan;
- the generated approval statement.

Host product rule:

```text
Do not ask for approval while review-packet validation fails.
```

## Execution-Time Assurance Case

An assurance case is the durable summary of where a Build Change stands. It
references source evidence rather than copying logs.

Use it to power:

- why Allow is enabled or disabled;
- why Publish is enabled or disabled;
- why a failed change is considered recovered;
- what a future reviewer needs to inspect.

Host product rule:

```text
Do not make readiness the only source of truth.
Keep the underlying BuildThread, permission ledger, code-change receipt,
definition history, runtime health, and rollout evidence inspectable.
```

## Recovery Drills

Drills should live in Host tests. They should prove at least:

| Scenario | Expected evidence |
|---|---|
| pre-proposal guardrail fails | `blocked` readiness and host check evidence |
| post-apply verification fails but rollback works | `failed_recovered`, code-change receipt, host check |
| release health fails | not `ready_to_publish`, runtime health evidence |
| rollback fails | `failed_unrecovered` and explicit blocking reason |

Do not create fake UI failures just to make a demo look complete. A drill is
valuable because it is executable pressure against the Host implementation.

## What Remains Host-Owned

The framework gives language and helpers. The Host still owns:

- actual guardrail commands;
- failure injection in tests;
- migration implementation and backup strategy;
- UI copy and approval workflow;
- which readiness states gate product buttons;
- production retention, assignment, and audit storage.

## Recommended Read Order

For a full fresh downstream validation, use the
[Downstream Validation Brief](./downstream-validation-brief.md). For only the
assurance lane, read:

1. [Start Here](./start-here.md)
2. [BuildThread](./build-thread.md)
3. [Scaffold Project Contract](./scaffold-project-contract.md)
4. [Code Change Lane](./code-change-lane.md)
5. [Build Change Assurance](./build-assurance.md)
6. This guide

## Adoption Checklist

- [ ] One Builder intent maps to one review packet.
- [ ] The review packet shows scope boundary and recovery plan before approval.
- [ ] Approval is blocked when pre-proposal checks fail.
- [ ] Assurance cases are saved after proposal, apply, publish, failure, and rollback.
- [ ] Evidence references point to existing systems instead of copied logs.
- [ ] Publish controls consume readiness but keep Host-owned policy.
- [ ] Recovery drills cover at least one recovered failure and one fail-closed path.
- [ ] Product docs say explicitly that Build Assurance is not marketplace artifact trust.
