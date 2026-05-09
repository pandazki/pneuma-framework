# M35-M37 Build Assurance Completion Design

**Date:** 2026-05-10  
**Status:** Execution anchor for M35-M37  
**Related domain anchor:** `docs/architecture/spec/ai-build-assurance-domain-review.md`

## Purpose

M32-M34 gave Pneuma a first Build Change Assurance value object, a visible
Reference Host card, and a durable local case store. M35-M37 finish the current
assurance slice without changing the top-level product boundary:

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

The work is not about generic marketplace provenance, package signing, or
third-party artifact authenticity. It stays focused on the Builder + Build
Agent control loop:

```text
Builder asks for a business-function change
  -> Agent proposes bounded work
  -> Builder sees risk, checks, and recovery plan before approval
  -> Host applies and verifies
  -> failed paths are drillable and recoverable
  -> downstream Developers can adopt the pattern from docs and tests
```

## M35: Build Change Review Packet

The current `BuildChangeAssuranceCase` describes the state of a change, but it
is mostly useful after proposal or execution. The missing approval-time object
is a **Review Packet**: the exact readable packet a Builder should see before
approving one business intent.

The packet must make these claims explicit:

- what the Builder asked for;
- where the scope boundary is;
- what lanes will change: definition, source, host artifact, runtime config,
  credential, migration, or release;
- which risks are present;
- which pre-proposal checks ran;
- what recovery strategy is expected if the change fails;
- what single approval statement the Builder is accepting.

The packet does not replace permission ledger, BuildThread, Code Change Lane, or
definition history. It references those systems and gives the Host a stable
approval disclosure shape.

## M36: Recovery Drill Matrix

Build Assurance should treat failed-but-recovered changes as successful
engineering controls. A Host needs a small way to prove that expected failure
paths have evidence, not only that the happy path passes.

The drill matrix is intentionally narrow:

- each scenario names a failure stage and expected readiness;
- required evidence kinds are checked by reference, not by copying logs;
- missing evidence produces a failed drill result;
- the output is useful for tests, Host inspection, and milestone evidence.

This remains a framework helper, not a production incident-management system.

## M37: Downstream Readiness Pass

M37 is the integration/readiness closure for the current assurance lane. It
should answer whether a downstream Developer can understand and adopt:

- the assurance lifecycle;
- review packets before approval;
- durable assurance cases after execution;
- recovery drills for negative paths;
- what remains Host-owned.

The output should be documentation and verification evidence, not a new release
tag by default.

## Non-Goals

- No marketplace artifact trust model.
- No cryptographic signing requirement.
- No hosted compliance backend.
- No online migration runner.
- No generic approval UI package.
- No change to the four-layer product model.

