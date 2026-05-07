# ADR-0032: BuildThread Primitive For Builder Conversation

**Status**: Accepted
**Date**: 2026-05-07
**Deciders**: Pandazki, Codex
**Tags**: `agent, conversation, creation-host, transcript`

---

## Context

External DevBoard Studio pressure showed that ADR-0025's thin-pointer decision is no longer enough for Creation Hosts that need real Builder conversation UX. ADR-0025 chose "opencode owns conversation content; pneuma stores only a backend session pointer" because the early MVP only needed resume. That kept the framework small, but it left every Host to reinvent the semantic transcript that makes Pneuma different from a generic chat wrapper.

The repeated Host-owned code shape is now clear:

- persist Builder / Agent turns;
- pack turns into backend-consumable message shapes;
- encode pneuma-specific events such as proposal, Builder decision, and execution receipt;
- cap replayed history while keeping the initial Builder goal as an anchor;
- round-trip a thread id through browser, SSE, follow-up messages, and approve/reject routes.

DevBoard Studio hit a real closure race when its UI failed to preserve the current evolution id before posting a follow-up message. That bug restarted an evolution thread for every follow-up, so the Agent only saw the latest Builder message and repeated the same clarification. This is framework-relevant because the thread id is part of the Build-phase conversation contract, not domain-specific Host logic.

Cross-references:

- [ADR-0025](./0025-agent-conversation-persistence.md) — superseded in part. Backend-native session storage remains useful, but it is no longer the source of truth for semantic Build-phase transcript.
- [ADR-0026](./0026-agent-tool-call-binding.md) — tool invocation remains separate from thread persistence.
- [ADR-0028](./0028-framework-event-protocol.md) — framework events are operational state; BuildThread records the semantic Builder conversation.
- [ADR-0031](./0031-open-ended-definition-artifact-boundary.md) — Host-owned open-ended artifacts can expose transcript evidence without becoming framework definition rows.

---

## Options considered

### Option A: Keep Host-owned conversation tables

Every Creation Host stores its own `host_conversations` or equivalent table, writes its own turn packer, and decides how proposal / decision / execution receipt are represented to the Agent.

- **Pro**: No framework API change.
- **Con**: Repeats non-optional code in every Host, makes cross-backend replay fragile, and keeps pneuma-specific turn semantics encoded as ad hoc text in Host code.

### Option B: Backend owns all conversation content

The framework treats the backend-native session as authoritative. opencode, Anthropic direct, Codex, or another backend decides its own persistence and replay.

- **Pro**: Works for simple "resume the same backend" flows; aligns with ADR-0025's original narrow MVP.
- **Con**: Breaks backend portability and makes proposal / approval / receipt turns invisible to framework audit and inspection. A Host cannot swap backends mid-thread because the canonical history lives inside one backend's store.

### Option C: Framework owns the semantic BuildThread; backend owns native cache/session

The framework stores a canonical semantic transcript in the Creation Host workspace. Backend adapters may still keep native sessions for performance, but they rebuild or continue from the framework transcript.

- **Pro**: One source of truth for Builder intent, Agent proposal, Builder decision, and execution receipt. Translators are fixed once per backend. Host code shrinks without losing UI freedom.
- **Con**: Adds a new framework primitive and storage file. It does not yet solve token-level packing, read-only tool result reinjection, or browser client helpers.

---

## Decision

Choose **Option C**.

### Primitive

`BuildThread` is a framework-owned semantic transcript for Build-phase conversation:

```ts
export interface BuildThread {
  thread_id: string;
  profile_id: string;
  app_id: string;
  builder_user_id: string;
  status: "open" | "closed";
  created_at_ms: number;
  updated_at_ms: number;
  closed_at_ms?: number;
}
```

`BuildTurn` is a closed core union plus one Host escape hatch:

```ts
type BuildTurn =
  | { kind: "user"; text: string }
  | { kind: "agent_text"; text: string }
  | { kind: "agent_clarification"; question: string }
  | { kind: "agent_proposal"; proposal_id: string; summary: string; rationale: string; tool_calls: BuildToolCall[] }
  | { kind: "user_decision"; proposal_id: string; decision: "approved" | "rejected"; reason?: string }
  | { kind: "host_execution_receipt"; proposal_id: string; status: ReceiptStatus; evidence: unknown }
  | { kind: "host_event"; label: string; payload: unknown };
```

The persisted turn includes `turn_id`, `thread_id`, `turn_index`, and `ts_ms`.

### Storage location

The v0 implementation is file-backed:

```text
<creation-host-workspace>/.pneuma/build-threads.json
```

This is Creation Host workspace state. It is not written to Generated Application runtime SQLite and not included in Published Application data by default.

### Public API

`packages/core/src/build-thread.ts` exports:

- `createFileBuildThreadStore({ workspace })`
- `buildThreadsFilePath(workspace)`
- `BuildThreadStore` / `ConversationStore`
- `packBuildTurnsForRoleContent(turns, opts?)`
- `roleContentBuildTurnPacker`

The store API:

```ts
interface BuildThreadStore {
  startThread(opts: { profile_id: string; app_id: string; builder_user_id: string }): Promise<BuildThread>;
  appendTurn(thread_id: string, turn: BuildTurnInput): Promise<BuildTurn>;
  listTurns(thread_id: string): Promise<readonly BuildTurn[]>;
  listThreads(opts?: { app_id?: string; builder_user_id?: string; status?: BuildThreadStatus }): Promise<readonly BuildThread[]>;
  closeThread(thread_id: string): Promise<BuildThread | undefined>;
}
```

### Backend interop

This ADR does not break `AgentBackend`. `AgentBackend.launch/sendUserMessage/onEvent` remains valid. BuildThread v0 is additive: Hosts can start using the store and provider-neutral packer immediately, then later migrate to a future `AgentBackendV2.runTurn` if the backend interface is redesigned.

Backend-native sessions are treated as optimization/cache. The semantic BuildThread is the source of truth.

Core deliberately stays backend-agnostic: `packBuildTurnsForRoleContent` returns generic `{ role, content }` messages and backend adapters own provider-native Anthropic / opencode / Codex message shapes. Provider-named helpers remain only as compatibility aliases for early RC consumers.

---

## Consequences

### Positive

- DevBoard-style Hosts can delete Host-owned conversation tables and turn packers.
- Proposal / decision / execution receipt are stable framework concepts instead of bracketed text invented by each Host.
- Backend migration becomes possible because new backends can replay the framework transcript.
- Browser `thread_id` round-trip becomes a framework-visible contract rather than hidden Host glue.

### Negative / Risks

- File-backed storage is enough for RC pressure but not a production multi-tenant cloud store.
- v0 packing is turn-count based, not token-budget aware.
- The framework does not yet auto-append execution receipts because Host-owned artifact 2PC is not yet a framework primitive.
- The default packer emits generic role/content messages. Rich provider-native message shapes should be implemented in backend adapter packages, not in core.

### Follow-ups

- ADR-TBD: `AgentBackendV2.runTurn` and backend-native session cache semantics.
- ADR-TBD: cross-lane approval / execution receipt auto-recording after Host artifact 2PC is promoted.
- Developer doc: SSE/browser `thread_id` round-trip recipe for chat-driven Hosts.
- OPEN-QUESTIONS: token-level packing strategy for long BuildThreads.
