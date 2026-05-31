# Milestone 32 Snapshot — Build Change Assurance v0

**Date:** 2026-05-09  
**Status:** Closed as a post-RC assurance primitive milestone. This is not a `pneuma-rc-0.1.4` release tag.  
**Input:** AI Build Assurance DDD review asked the project to stay anchored on Builder + Build Agent engineering control: unclear intent, unsafe scope, failed checks, destructive definition changes, rollback evidence, and publish readiness.

## What M32 Proved

M32 adds the first framework-level value object for the assurance question:

```text
When a Builder asks an Agent to change an app,
what was proposed,
what evidence was shown,
who approved it,
what changed,
what failed,
and how can the Host recover?
```

The new core primitive is:

```text
BuildChangeAssuranceCase
  = identity + intent/scope summaries
  + risk classification
  + readiness
  + evidence refs
  + blocking reasons
  + rollback / migration notes
```

It references existing framework evidence instead of copying logs:

```text
BuildThread turn
Permission ledger record
Code Change receipt
Definition history
Runtime health
Release rollout
Host check
```

## Readiness Rules

The first evaluator is intentionally narrow:

| Scenario | Readiness |
|---|---|
| Builder intent is unclear | `needs_clarification` |
| `pre_proposal` or `pre_apply` check failed | `blocked` |
| destructive definition risk lacks explicit impact disclosure | `blocked` |
| approved + applied + passing `post_apply` check | `verified` |
| verified + passing release checks | `ready_to_publish` |
| post-apply failure with rollback evidence | `failed_recovered` |

This is not a generic artifact-trust or marketplace audit feature. It is the minimum shared language a Creation Host needs to decide whether a Builder/Agent change should clarify, stop, apply, publish, or recover.

## Developer Surface

New core exports:

```ts
assessBuildChangeReadiness(input)
createBuildChangeAssuranceCase(input)
validateBuildChangeAssuranceCase(case)
```

New developer guide:

- [Build Change Assurance](../developer/build-assurance.md)
- [中文版](../developer/build-assurance.zh-CN.md)

## Verification

Targeted command:

```bash
bun test packages/core/test/build-assurance.test.ts
```

Targeted result:

- `7 pass`, `0 fail`, `17 expect() calls`.

The test suite covers:

- unclear intent -> clarification;
- failed pre-proposal check -> blocked;
- destructive definition without impact -> blocked;
- approved/applied/post-check passed -> verified;
- release checks passed -> ready to publish;
- failed post-apply with rollback evidence -> failed recovered;
- validation of evidence refs and required identity fields.

## Boundary

M32 deliberately does not persist assurance cases, implement a Host UI, enforce publish policy, or add a release tag. Hosts still own product policy:

```text
framework says: readiness = ready_to_publish
Host decides: show Publish, require extra approval, or wait for more checks
```

The next useful lane is to use this primitive in a reference Host flow so the Builder can see one assurance card beside the proposal, approval, execution receipt, preview checks, and publish controls.
