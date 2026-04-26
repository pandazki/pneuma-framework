# ADR-0028: Framework Event Protocol for Definition Restarts

**Status**: Accepted
**Date**: 2026-04-27
**Deciders**: Pandazki, Codex
**Tags**: wire-protocol, restart, definition-apply, rollback, viewer

---

## Context

The app-definition milestone intentionally uses restart as the rediscovery boundary. That is architecturally honest: a definition row must survive process restart and be rehydrated through the same runtime path.

The product gap is perception. Before this ADR, the Agent received a final `definition.apply` tool result with a timeline, but live viewers had no first-class protocol event for the intermediate phases. A demo could show the app changing after restart, but it could not make the restart itself legible.

ADR-0027 already defines SSE for runtime data observation. Restart progress is different: it is session-scoped framework state, tied to Builder approval and agent tool execution. It belongs on the bidirectional wire-protocol channel, not on the runtime SSE stream.

## Decision

Add a new agent-to-viewer envelope:

```ts
type WireEnvelope =
  | ...
  | {
      dir: "a2v";
      kind: "framework-event";
      event: FrameworkEvent;
    };
```

MVP event variants:

```ts
type FrameworkEvent =
  | { type: "definition-apply-state"; state: DefinitionApplyState }
  | { type: "definition-rollback-prepare-state"; state: DefinitionRollbackPrepareState }
  | { type: "definition-rollback-execute-state"; state: DefinitionRollbackExecuteState };
```

`LifecycleOrchestrator` now has a `setFrameworkEventPushHook(...)`. When `createPneumaFramework({ wire: { enabled: true } })` creates a wire server, it wires that hook to `wireServer.broadcast(...)`.

The event carries the same state shape the tool result returns:

```text
validating
awaiting-approval
applying-definition
stopping-for-definition-apply
starting-after-definition-apply
refreshing-definition
running | failed | denied
```

Rollback prepare and rollback execute use their own existing phase vocabularies. The viewer React SDK stores framework events in `PneumaViewerState.frameworkEvents` so host viewers can render a progress rail without writing their own raw WebSocket subscription.

## Consequences

### Positive

- Builder-visible restart progress is now a protocol primitive, not demo copy.
- The Agent still receives the final tool result, while the viewer receives intermediate states in real time.
- Definition apply, rollback prepare, and rollback execute share the same event channel.
- The separation from ADR-0027 remains clean: SSE observes runtime data changes; wire-protocol carries session-scoped framework progress.

### Negative / Risks

- `frameworkEvents` is an append-only in-memory viewer list capped by the React SDK. Product viewers still need to decide how to render and clear progress.
- The event currently sends the full state object. This is convenient and strongly typed, but a future stable protocol may want smaller event patches.
- If no wire viewer is connected, events are not buffered. The final tool result and orchestrator state remain the source of truth.

## Follow-ups

- Add a polished progress component in the reference demo: `approval -> applying -> restarting -> rediscovered`.
- Decide whether operation tool-list reload should emit a dedicated framework event after `/api/config` refresh.
- Consider a compact event-patch protocol before v1 if full state envelopes become too noisy.
