# ADR-0036: AgentBackend runTurn Contract

**Status:** Accepted  
**Date:** 2026-05-08  
**Related:** [ADR-0032](./0032-build-thread-primitive.md), [ADR-0034](./0034-code-change-lane-executor.md), [ADR-0035](./0035-host-extension-slot-contract.md)

## Context

ADR-0032 made BuildThread the framework-owned semantic transcript for Builder conversation. Downstream DevBoard pressure then proved a second gap: Hosts could store turns in BuildThread, but still had to translate those turns into backend prompts and manually decide when to create or reuse backend-native sessions.

That made every Host reimplement the same loop:

```text
Builder message
  -> append user turn
  -> replay BuildThread
  -> encode proposal / decision / receipt turns for the model
  -> create or reuse backend session
  -> send prompt
```

The loop is framework-shaped, not Host-domain-shaped. The Host should still own product UI, proposal execution, rollback, and evidence, but the BuildThread-to-backend turn bridge should be a shared primitive.

## Decision

Accept `AgentBackend.runTurn` as the standard backend entry for one Builder follow-up turn.

`runTurn` takes:

```text
thread_store
thread_id
cwd
new_user_message
system_prompt
context_snapshot?
packing?
launch?
```

It returns:

```text
thread_id
session
backend_session_cached
appended_user_turn
messages
message_count
prompt
```

The framework also provides `runAgentTurnThroughLaunchSend`, a compatibility helper for backends that already implement `launch` and `sendUserMessage`. `FakeAgentBackend` and `OpencodeBackend` use this helper and cache one backend-native session per BuildThread `thread_id`.

The accepted source-of-truth rule is:

```text
BuildThread is authoritative.
Backend-native sessions are cache / optimization.
```

If a backend session disappears, a Host or backend can reconstruct context from BuildThread.

## Decision + Receipt Recording

M29 also accepts `recordBuildThreadExecutionOutcome(store, input)`.

The helper appends:

```text
user_decision
host_execution_receipt
```

in canonical order for one proposal. It does not execute Host code, mutate framework definition rows, or perform rollback. It only records the semantic result after the Host has made the decision and produced evidence.

## Consequences

### Positive

- Hosts no longer need to hand-roll the BuildThread replay-to-backend prompt loop.
- Backend-native sessions become explicitly subordinate to the framework transcript.
- The fake backend and opencode backend share one implementation path.
- Downstream Hosts can replace a backend without losing the Builder conversation source of truth.
- Decision and receipt turns get one canonical append helper.

### Negative / Limits

- `runTurn` does not normalize provider-native streaming events.
- `runTurn` does not solve read-only iterative tool-result replay inside a single model turn.
- The prompt shape is provider-neutral role/content text; provider-native message optimization remains backend-adapter work.
- The v0 BuildThread store remains file-backed in the Creation Host workspace.

## Verification

M29 adds tests for:

- `runAgentTurnThroughLaunchSend` appending the user turn, packing proposal/receipt context, and reusing backend sessions by `thread_id`;
- `FakeAgentBackend.runTurn`;
- `OpencodeBackend.runTurn`;
- `recordBuildThreadExecutionOutcome`.
