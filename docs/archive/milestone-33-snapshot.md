# Milestone 33 Snapshot — Assurance Card in Reference Host

**Date:** 2026-05-09  
**Status:** Closed as a post-RC product-understanding milestone. This is not a `pneuma-rc-0.1.4` release tag.  
**Input:** M32 created the `BuildChangeAssuranceCase` primitive. M33 asks whether that language can help a Builder understand why the Creation Host allows approval, apply, or publish.

## What M33 Proved

M33 wires Build Change Assurance into the M16 Reference Creation Host, not only into core tests.

The Builder now sees an Assurance card beside the approval and publish controls:

```text
Priority Queue proposed
  -> readiness: awaiting_approval
  -> risk: definition_additive
  -> evidence: Host proposal check + approval prompt reference

Builder approves
  -> readiness: verified
  -> risk: definition_additive
  -> evidence: definition history + post-apply priority queue check

Publish v1
  -> readiness: ready_to_publish
  -> risk: release_change
  -> evidence: runtime health + release rollout
```

This changes the demo from "click Allow, then Publish" to:

```text
The Host can explain why the next step is available.
```

## Product Boundary

M33 still keeps policy ownership in the Host:

```text
Core evaluates readiness.
Reference Host uses readiness to explain and gate controls.
Builder sees the evidence path before continuing.
```

The framework does not decide that every Host must publish at `verified`, `ready_to_publish`, or any other state. It provides a shared language and validator. Host product policy decides the button rules.

## Implementation Surface

Updated example:

- `examples/m16-reference-creation-host/host-server.ts`
- `examples/m16-reference-creation-host/static/index.html`
- `examples/m16-reference-creation-host/static/app.js`
- `examples/m16-reference-creation-host/static/styles.css`

Updated test:

- `examples/m16-reference-creation-host/run.test.ts`

Updated guide:

- [Build Change Assurance](../developer/build-assurance.md)
- [中文版](../developer/build-assurance.zh-CN.md)

## Verification

Targeted command:

```bash
bun test examples/m16-reference-creation-host/run.test.ts
```

Targeted result:

- `1 pass`, `0 fail`, `33 expect() calls`.

The test proves:

- the Reference Host page exposes `data-testid="assurance-card"`;
- `evolution/start` returns an assurance case with `awaiting_approval`;
- `evolution/approve` returns an assurance case with `verified`;
- `publish v1` returns an assurance case with `ready_to_publish`;
- the full create, preview, inspect, evolve, approve, publish, restart, rollback, and second-app inspection flow still passes.

## Remaining Boundary

M33 does not add persistence for assurance cases, a general assurance UI component package, or a downstream DevBoard migration. Those are separate productization steps.

The next useful lane is downstream adoption or persistence:

```text
M34 option A: add an AssuranceCaseStore for Hosts that want durable cards.
M34 option B: migrate DevBoard Studio to display assurance cards using the M33 shape.
```
