# BuildThread Guide

**Audience:** Developers building chat-driven Creation Hosts
**Chinese version:** [build-thread.zh-CN.md](./build-thread.zh-CN.md)

`BuildThread` is the framework-owned semantic transcript for Builder-phase conversation. It records what the Builder asked, what the Agent proposed, what the Builder approved or rejected, and what execution evidence came back.

This is different from backend-native chat history. opencode, Anthropic, Codex, or another backend may keep their own session cache, but the framework transcript is the portable source of truth.

## Where It Lives

The v0 store is file-backed:

```text
<creation-host-workspace>/.pneuma/build-threads.json
```

This belongs to the Creation Host workspace. It is not Generated Application runtime SQLite, and it is not Published Application data.

## Basic Usage

```ts
import {
  createFileBuildThreadStore,
  packBuildTurnsForRoleContent,
  recordBuildThreadExecutionOutcome,
  summarizeBuildThreadTurns,
} from "@pneuma-framework/core";

const conversations = createFileBuildThreadStore({ workspace });

const thread = await conversations.startThread({
  profile_id: "dev-board",
  app_id: "app-123",
  builder_user_id: "bob",
});

await conversations.appendTurn(thread.thread_id, {
  kind: "user",
  text: "Add a priority column to my board.",
});

await conversations.appendTurn(thread.thread_id, {
  kind: "agent_proposal",
  proposal_id: "proposal-1",
  summary: "Add priority support",
  rationale: "The Builder wants triage order.",
  tool_calls: [
    { name: "add_priority_column", arguments: { levels: ["P1", "P2", "P3"] } },
  ],
});

await recordBuildThreadExecutionOutcome(conversations, {
  thread_id: thread.thread_id,
  proposal_id: "proposal-1",
  decision: "approved",
  receipt: {
    status: "completed",
    evidence: { version_id: "v1" },
  },
});

const turns = await conversations.listTurns(thread.thread_id);
const summary = summarizeBuildThreadTurns(turns);
const messages = packBuildTurnsForRoleContent(turns, {
  capTurns: 20,
  alwaysKeepAnchor: true,
});
```

## Turn Kinds

| Kind | Role |
|---|---|
| `user` | Builder text. |
| `agent_text` | Agent narrative text. |
| `agent_clarification` | Agent asks the Builder a clarification question. |
| `agent_proposal` | Agent proposes a governed change-set or Host-domain tool plan. |
| `user_decision` | Builder approves or rejects a proposal. |
| `host_execution_receipt` | Host records the result of a proposal decision or execution. Status is one of `completed`, `rejected`, `failed_framework`, `failed_host_rolled_back`, or `failed_validate_rolled_back`. |
| `host_event` | Escape hatch for Host-owned events that still need transcript visibility. |

Keep domain state out of `user` / `agent_text` prose when it is really proposal, decision, or receipt evidence. The typed turns are what make replay and inspection portable across backends.

## Core Packing

Core stays backend-agnostic. It ships one provider-neutral role/content packer:

- `packBuildTurnsForRoleContent(turns, opts?)`
- `roleContentBuildTurnPacker`

It returns generic `{ role, content }` messages. It encodes proposal, decision, and execution receipt with stable `pneuma:` tags so the Agent can see what was proposed, approved, and applied.

Provider-native message shapes belong in backend adapters. `pneumaTurnsToAnthropicMessages` and `pneumaTurnsToOpencodeMessages` exist only as compatibility aliases for early RC consumers; new Host code should use the provider-neutral packer.

`capTurns` limits replayed turns. `alwaysKeepAnchor: true` keeps the first Builder turn and then the latest `capTurns - 1` turns. This preserves the original app goal while bounding the prompt.

## Inspection Summary

Use `summarizeBuildThreadTurns(turns)` for Host inspection panes, diagnostics, and demo timelines:

```ts
const turns = await conversations.listTurns(thread.thread_id);
const summary = summarizeBuildThreadTurns(turns);
```

The summary is intentionally backend-neutral. It reports semantic counts such as `proposal_turns`, `decision_turns`, `execution_receipt_turns`, and `latest_proposal_id`; it does not mention Anthropic, opencode, Codex, or any provider-native message format. This keeps Builder-facing inspection tied to pneuma semantics rather than whichever backend happens to execute the turn.

## AgentBackend.runTurn

M29 makes `AgentBackend.runTurn` the standard backend entry for one Builder follow-up turn:

```ts
const result = await backend.runTurn({
  cwd: workspace,
  thread_store: conversations,
  thread_id: thread.thread_id,
  new_user_message: "Also add keyboard shortcuts.",
  system_prompt: "You are the build-phase agent for this Creation Host.",
  context_snapshot: { app_id: "app-123", profile_id: "dev-board" },
});
```

The contract is:

```text
append Builder user turn to BuildThread
  -> pack semantic transcript into provider-neutral role/content messages
  -> build one backend prompt from system prompt + context snapshot + transcript
  -> launch or reuse a backend-native session for this thread_id
  -> send the prompt through the backend transport
```

For legacy backends, `runAgentTurnThroughLaunchSend` implements this contract on top of existing `launch` and `sendUserMessage`. `FakeAgentBackend` and `OpencodeBackend` use that helper and keep a per-`thread_id` backend session cache.

Backend-native sessions are therefore cache/optimization. BuildThread remains the source of truth. If a Host swaps backend implementations mid-thread, the new backend can reconstruct context from the framework transcript.

## Decision + Receipt Helper

Use `recordBuildThreadExecutionOutcome(store, input)` after a Builder decision and Host execution:

```ts
await recordBuildThreadExecutionOutcome(conversations, {
  thread_id: thread.thread_id,
  proposal_id: "proposal-1",
  decision: "approved",
  reason: "Looks correct.",
  receipt: {
    status: "completed",
    evidence: { changed_files: ["src/widget.tsx"] },
  },
});
```

The helper appends `user_decision` followed by `host_execution_receipt` in the canonical order. It does not execute Host code or framework mutations; it only records the semantic transcript once the Host has made and executed the decision.

## Browser Thread Id Discipline

Creation Hosts should treat `thread_id` as durable UI state:

```text
POST /evolution/start
  -> returns / streams thread_id
POST /evolution/:thread_id/message
  -> appends follow-up user turn
POST /evolution/:thread_id/proposals/:proposal_id/approve
  -> appends user_decision and later host_execution_receipt
POST /evolution/:thread_id/proposals/:proposal_id/reject
  -> appends user_decision and rejected host_execution_receipt
```

Do not compute follow-up URLs from React closure state that may be stale. Keep `thread_id` in an explicit ref or state machine, and do not send a follow-up until the initial start response has committed the id.

## Current Limits

- `AgentBackend.runTurn` does not replace streaming/event APIs. Backends still expose `onEvent`, permission events, and stop/close lifecycle.
- `runAgentTurnThroughLaunchSend` is a compatibility helper for launch/send transports. It does not normalize provider-native event streams.
- `recordBuildThreadExecutionOutcome` records decision+receipt turns, but the Host still owns proposal execution, rollback, and evidence generation.
- It does not solve read-only iterative tool-result replay inside a single model turn.
- Packing is turn-count based, not token-count based.
- The v0 store is local file-backed, not a cloud multi-tenant database.
