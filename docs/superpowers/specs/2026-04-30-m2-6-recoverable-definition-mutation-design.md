# M2.6 Recoverable Definition Mutation Design

**Date:** 2026-04-30
**Status:** Draft for review
**Milestone:** M2 - Enterprise Governance Hardening
**Builds on:** `2026-04-30-m2-5-policy-semantics-design.md`

中文摘要：

> M2.6 不追求重型数据库事务。它要解决的是构建期 definition mutation 不要悄悄半成功、半回滚，失败必须被系统看见、阻断后续变更，并提供粗粒度 reset/recover 路径。

## Goal

Make build-time app-definition changes recoverable and explainable under failure.

Target invariant:

```text
An approved definition mutation can succeed, fail before mutation, or enter dirty repair state.
It must not silently leave the app in an ambiguous half-applied state while later mutations continue.
```

This is a governance reliability boundary, not a production OLTP transaction system.

## Current State

M1-M2.5 proved that app definition is data:

- framework Operations mutate system-owned definition rows;
- `app_history` stores definition overlay snapshots;
- `definition.apply` restarts and verifies the observed diff;
- rollback can remove, update, and restore definition rows across Tables, columns, Operations, Views, PolicyRules, and policy settings.

Remaining reliability gap:

- a definition row write can succeed while `app_history` append fails;
- rollback can mutate several surfaces before failing;
- after a failed mutation, the next agent action can continue from a state the framework has not classified;
- concurrent tool calls are low-frequency but not explicitly serialized at the framework boundary.

## Non-Goals

This slice does not implement:

- cross-database ACID transactions between row storage and app history;
- distributed locks across multiple deployed runtimes;
- high-concurrency builder collaboration;
- automatic fine-grained compensation for every possible partial write;
- hot reload;
- release-mode migration safety.

Worst-case reset is acceptable for this milestone, as long as the system records that reset is needed and blocks further mutation until repair.

## Decision

Choose a lightweight recovery boundary:

```text
single in-process writer
+ durable mutation guard
+ post-mutation verification
+ dirty-state gate
+ coarse reset/retry repair path
```

M2.6 should make failure visible and bounded. It should not pretend every intermediate failure is impossible.

## Design Principles

### 1. Failure Is Allowed, Ambiguity Is Not

The framework may fail during mutation. The unacceptable behavior is continuing as if the app is clean.

Every definition mutation should end in one of three states:

| State | Meaning |
|---|---|
| `clean` | Mutation verified; new definition state is safe for later mutations. |
| `failed_before_mutation` | Nothing changed; later mutation may proceed. |
| `dirty_definition_state` | Mutation may have partially changed definition/data; later mutation is blocked until repair. |

### 2. Low-Frequency Build-Time Tradeoff

Definition mutation is a build-time governance operation, not a hot request path.

Preferred tradeoff:

```text
conservative blocking > complex transparent recovery
explicit reset > hidden compensation
small repair primitive > cross-store transaction layer
```

### 3. Verify Actual State, Not Just Handler Success

Handler success is not enough. After `definition.apply` or `definition.rollback.execute`, the framework should refresh `/api/config` or read the overlay and verify the expected state.

If verification fails, the mutation becomes dirty even if the handler returned success.

## Architecture

### Mutation Guard

Introduce a framework-owned guard around definition mutation.

Conceptual shape:

```ts
type DefinitionMutationGuard = {
  attempt_id: string;
  app_id: string;
  operation_id: string;
  target: string;
  expected_history_version: number;
  status: "running" | "dirty";
  phase:
    | "started"
    | "mutating"
    | "stopping"
    | "restarting"
    | "verifying"
    | "rollback_backup"
    | "rollback_mutating";
  started_at_ms: number;
  updated_at_ms: number;
  error?: { code: string; message: string };
};
```

Implementation can start with an in-memory single-writer mutex plus a durable guard row in system storage. The durable row exists so a failed process restart still leaves a visible repair state.

The guard is not app-definition itself. It is framework repair metadata.

### Apply Flow

```text
definition.apply starts
  -> reject if active writer or dirty guard exists
  -> read expected_history_version
  -> create running guard
  -> invoke framework mutation Operation
  -> stop/restart dev
  -> fetch /api/config
  -> verify expected diff
  -> append/observe clean history version
  -> clear guard
```

Failure handling:

| Failure point | Result |
|---|---|
| before guard | normal failure; no repair state |
| after guard, before mutation | mark dirty or allow clear if no definition diff exists |
| after mutation, before verified history | dirty |
| restart fails | dirty |
| diff mismatch | dirty |
| guard clear fails | dirty by default |

### Rollback Flow

```text
definition.rollback.execute starts
  -> reject if active writer or dirty guard exists
  -> create running guard
  -> write pre-rollback backup
  -> mutate rows/data
  -> append rollback snapshot
  -> verify target overlay
  -> clear guard
```

Rollback gets the same rule: if target verification fails, the framework blocks future definition mutation and reports dirty repair state.

### Repair Surface

Add a minimal repair surface, not a full admin console:

```text
definition.repair.status
definition.repair.reset_to_last_good
```

`definition.repair.status` reports:

- whether the app is clean or dirty;
- last failed attempt;
- expected history version;
- current observed overlay summary;
- last known good history version if known.

`definition.repair.reset_to_last_good` performs a coarse recovery:

- restore definition overlay to the last known good snapshot;
- restart/verify;
- clear dirty guard only after verification;
- otherwise keep dirty and return manual repair instructions.

This is intentionally blunt. The product claim is not "we always recover perfectly"; it is "we do not continue silently from an untrusted state."

## Concurrency Model

M2.6 should implement single-writer semantics at the framework tool layer:

```text
one definition.apply / rollback.execute / repair operation at a time per running app
```

This prevents accidental concurrent tool calls in the current dev runtime.

Out of scope for this slice:

- multiple deployed runtimes mutating the same storage;
- database-level compare-and-swap;
- multi-builder collaborative editing.

The design should still carry `expected_history_version` in state and errors so a future optimistic concurrency guard has a natural place to attach.

## Agent-Facing Behavior

When blocked by dirty state, the agent should receive a stable reason code:

```json
{
  "error": "definition mutation blocked",
  "authorization": {
    "reason_code": "dirty_definition_state"
  },
  "repair": {
    "status_tool": "definition.repair.status",
    "reset_tool": "definition.repair.reset_to_last_good"
  }
}
```

The important UX is that the agent can explain:

> The previous app-definition change did not finish cleanly, so the framework blocked new changes until the Builder repairs or resets the app definition.

## Testing Strategy

Use failure injection rather than relying on real crashes.

Required tests:

1. `definition.apply` writes a running guard and clears it after successful verification.
2. a second concurrent `definition.apply` is rejected while the first is running.
3. mutation Operation failure before any observed diff does not leave dirty state.
4. mutation success plus history/verification failure leaves `dirty_definition_state`.
5. dirty state blocks later `definition.apply`.
6. rollback verification failure leaves `dirty_definition_state`.
7. `definition.repair.status` exposes the failed attempt and current overlay summary.
8. `definition.repair.reset_to_last_good` restores the last good snapshot and clears the guard only after verification.

Full verification remains:

```bash
bun test
bun run typecheck
git diff --check
```

## Open Edges After M2.6

- Whether the durable guard should live in row storage, app history, or a tiny framework-state store.
- Whether future multi-runtime deployments need database compare-and-swap or an external lock.
- How much of the repair surface should appear in the team-share demo.
- Whether Release mode should expose repair operations at all.

## Recommendation

Implement M2.6 as a conservative recovery gate.

Do not build a transaction framework yet. First prove that build-time definition mutation cannot silently drift into an untrusted state while the Agent keeps building on top of it.
