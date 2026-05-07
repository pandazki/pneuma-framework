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
  pneumaTurnsToAnthropicMessages,
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

await conversations.appendTurn(thread.thread_id, {
  kind: "user_decision",
  proposal_id: "proposal-1",
  decision: "approved",
});

await conversations.appendTurn(thread.thread_id, {
  kind: "host_execution_receipt",
  proposal_id: "proposal-1",
  status: "completed",
  evidence: { version_id: "v1" },
});

const turns = await conversations.listTurns(thread.thread_id);
const messages = pneumaTurnsToAnthropicMessages(turns, {
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
| `host_execution_receipt` | Host records the result of executing the approved proposal. |
| `host_event` | Escape hatch for Host-owned events that still need transcript visibility. |

Keep domain state out of `user` / `agent_text` prose when it is really proposal, decision, or receipt evidence. The typed turns are what make replay and inspection portable across backends.

## Backend Translators

The framework currently ships:

- `pneumaTurnsToAnthropicMessages(turns, opts?)`
- `pneumaTurnsToOpencodeMessages(turns, opts?)`

Both return role/content messages in v0. They encode proposal, decision, and execution receipt with stable `pneuma:` tags so the Agent can see what was proposed, approved, and applied.

`capTurns` limits replayed turns. `alwaysKeepAnchor: true` keeps the first Builder turn and then the latest `capTurns - 1` turns. This preserves the original app goal while bounding the prompt.

## Browser Thread Id Discipline

Creation Hosts should treat `thread_id` as durable UI state:

```text
POST /evolution/start
  -> returns / streams thread_id
POST /evolution/:thread_id/message
  -> appends follow-up user turn
POST /evolution/:thread_id/proposals/:proposal_id/approve
  -> appends user_decision and later host_execution_receipt
```

Do not compute follow-up URLs from React closure state that may be stale. Keep `thread_id` in an explicit ref or state machine, and do not send a follow-up until the initial start response has committed the id.

## Current Limits

- `BuildThread` is additive; it does not replace `AgentBackend.launch/sendUserMessage/onEvent`.
- It does not auto-record Host execution receipts. Hosts call `appendTurn` after their executor finishes.
- Packing is turn-count based, not token-count based.
- The v0 store is local file-backed, not a cloud multi-tenant database.
