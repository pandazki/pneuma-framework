# ADR-0025: Agent Conversation Persistence

**Status**: Accepted
**Date**: 2026-04-25
**Deciders**: Pandazki
**Tags**: `agent, session, persistence`

> Amended by [ADR-0032](./0032-build-thread-primitive.md): backend-native sessions remain useful resume/cache state, but the framework now owns the semantic BuildThread transcript for Builder proposal / decision / execution receipt turns.

---

## Context

pneuma-framework's central promise — "Builder builds app by **talking** to a Build-phase Agent" (see [CLAUDE.md](../../../CLAUDE.md)) — only holds across multiple work sessions if those conversations survive process restarts. Day 3-4 demos established the agent-in-loop round-trip, but every agent call was disposable: kill the process, lose the thread. Without session persistence, the "Builder constructs app over multiple days" scenario is blocked at the start.

The Day 5 implementation proved durability: running with `PNEUMA_RESUME=1`, the agent successfully recalled the prior "Building effective agents" bookmark conversation after a kill-and-restart cycle. The opencode backend stores all conversation content — sessions, messages, parts — in a local SQLite database at `~/.local/share/opencode/opencode.db`, and that storage survives process restarts. Inspection of the DB across prior demo runs found 55 sessions, confirming the durability in practice.

The open question, recorded as [ADR-0025 candidate in `OPEN-QUESTIONS.md §P0`](../OPEN-QUESTIONS.md), was: **where does responsibility for conversation persistence lie?** Does pneuma store conversation content itself? Trust opencode entirely? Or replicate?

Separately, archived ToolJet deep-research §13.4 (git history: `git show 0fd26ee:docs/architecture/research/tooljet-analysis.md`) revealed that ToolJet EE maintains a full AI subsystem: `ai_conversations` / `ai_conversation_messages` / `artifacts` / `ai_response_votes` / `ai_chat_prompts` / `organization_ai_credit_history`. That schema is proven and production-grade — but it is also deeply coupled to ToolJet's NestJS + Postgres stack and its "Builder reviews AI PRD, approves, then generates" workflow. Adopting it wholesale would duplicate storage that opencode already provides, add a six-table maintenance burden, and solve problems pneuma does not yet have (credits billing, vote collection, PRD approval gates).

Cross-references:
- See [ADR-0001](./0001-archetype-scope.md) — MVP scope is single-Builder local dev; multi-Builder (archetype B+/cloud) is future.
- See [ADR-0010](./0010-user-id-grants.md) — `builder_id` field future extension point.
- See [ADR-0014](./0014-audit-subset.md) — audit trail captures Operation mutations, not agent reasoning; the two stores are complementary, not duplicates.
- See [ADR-0018](./0018-operations-as-primitive.md) — agent invokes Operations via tool-calls; session scope establishes idempotence context for a given build session.
- See [ADR-0026](./0026-agent-tool-call-binding.md) — agent tool-call binding via MCP bridge; complementary concern (tool *invocation* vs. session identity).
- See [ADR-0027](./0027-live-event-stream-sse.md) — live event stream (SSE); data-refresh channel, not a conversation channel — both observable effects of agent actions but on independent wires.

---

## Options considered

### Option A — Pneuma owns full conversation storage (ToolJet-like)

Pneuma maintains its own `conversations` / `messages` / `parts` SQLite tables inside the workspace directory. Agent backends become thin wrappers responsible for pushing every message turn into pneuma's store; retrieval for resume goes through pneuma's own DB.

- **Pro**: pneuma holds an authoritative, portable view of the conversation; conversation history UI does not require the agent backend to be live; schema is fully under pneuma's control.
- **Con**: duplicates opencode's proven SQLite persistence; requires tracking schema changes in opencode's internal DB (messages, parts, streaming deltas are complex); six-table maintenance surface is premature for MVP; if the two stores drift (a network hiccup, a crash mid-turn), consistency repair is non-trivial. This is the ToolJet EE trajectory — valuable at platform scale, overkill now.

### Option B — Pneuma stores a thin pointer, opencode owns content (CHOSEN)

opencode retains all conversation content in its own SQLite; pneuma stores only a minimal pointer record — `(id, backend_session_id, app_id, builder_id, initial_prompt, timestamps)` — as a JSON array at `workspace/.pneuma/sessions.json`. Resume is achieved by looking up the latest pointer for a given `app_id`, then passing its `backend_session_id` to `AgentLaunchOptions.resumeSessionId`.

- **Pro**: minimal footprint (~150 LoC total incl. tests); opencode is an actively maintained project with proven SQLite durability; single source of truth for conversation content; the pointer file is trivially reconstructable if lost (just lose resume ability, not data); forward-compatible with other agent backends — each backend has its own session-id domain and `backend_session_id` is opaque to pneuma.
- **Con**: depends on opencode's own session retention policy; if opencode GCs sessions or the user wipes `~/.local/share/opencode/`, pneuma's index becomes stale pointers; conversation history browsing requires the backend to be live; cross-machine sync is not supported (session IDs are machine-local).

### Option C — Reconstruct conversations from the audit log (ADR-0014)

Do not store any per-session conversation state; instead replay the NDJSON audit log to reconstruct what happened in a session.

- **Pro**: zero new storage infrastructure; the audit trail already exists (see [ADR-0014](./0014-audit-subset.md)).
- **Con**: the audit log captures Operation mutations and their outcomes — it does not capture agent reasoning, tool-call chains, thinking blocks, or streaming message parts; a conversation cannot be reconstructed from it. More critically, this approach does not solve the resume problem at all: opencode still needs its `ses_xxx` session ID to append new messages to a prior conversation thread.

---

## Decision

**Option B** is chosen: opencode is the source of truth for conversation content; pneuma stores only a thin pointer.

### Module location

`packages/core/src/session-index.ts`

### SessionRecord interface

```ts
export interface SessionRecord {
  readonly id: string;                  // pneuma-local: "sess-<ts>-<rand>"
  readonly backend_session_id: string;  // opencode-native: "ses_<opencode-id>"
  readonly app_id: string;              // e.g. "ai-bookmarks-core-domain"
  readonly builder_id: string;          // MVP: "default"
  readonly created_at: number;          // epoch ms
  readonly last_resumed_at: number;     // epoch ms (equals created_at on first record)
  readonly initial_prompt: string;      // first user message, trimmed to ≤160 chars
}
```

### Public API (all async)

```ts
export function loadSessionIndex(workspace: string): Promise<readonly SessionRecord[]>
export function saveSessionIndex(workspace: string, records: readonly SessionRecord[]): Promise<void>
export function recordSession(params: {
  workspace: string;
  backend_session_id: string;
  app_id: string;
  builder_id?: string;       // defaults to "default"
  initial_prompt: string;
}): Promise<SessionRecord>
export function touchSession(workspace: string, backend_session_id: string): Promise<SessionRecord | undefined>
export function findLatestSession(workspace: string, app_id?: string): Promise<SessionRecord | undefined>
export function listSessions(workspace: string, opts?: { app_id?: string; builder_id?: string }): Promise<readonly SessionRecord[]>
```

### Storage file location

`${workspace}/.pneuma/sessions.json`

The file is **per-workspace** — one file per pinned workspace directory (e.g. `~/.pneuma-bookmarks`). It is not global. The `.pneuma/` directory is auto-created on first write.

### Atomic write protocol

Writes go to `sessions.json.tmp` first, then `fs.rename` to `sessions.json`. Corrupted or non-array JSON on load is logged to stderr and treated as `[]`; the function never throws on corruption. Missing file also returns `[]`.

### `builder_id` semantics

A free-form string with no validation. `"default"` everywhere in MVP (single-Builder local dev, per [ADR-0001](./0001-archetype-scope.md)). When multi-Builder auth lands, the caller populates this field from the authenticated identity. Records are additive — multiple Builders working on the same workspace co-exist in the same file and are separated at read time via `listSessions({ builder_id: ... })`.

### opencode integration boundary

`AgentLaunchOptions.resumeSessionId` (already present in `packages/backend-opencode/src/adapter.ts:130-143`) carries the opencode session ID from pneuma's pointer index. When set, the adapter skips `session.create`; subsequent `session.prompt(id, ...)` calls append to the pre-existing opencode conversation thread.

### Consumer flow (from `examples/opencode-tools-demo/agent-only.ts`)

```
// RESUME path (PNEUMA_RESUME=1):
prior = await findLatestSession(workspace, app_id)   // look up pointer
if (prior):
  resumeSessionId = prior.backend_session_id
  sess = await backend.launch({ cwd, appUrl, resumeSessionId })
  await touchSession(workspace, sess.sessionId)       // bump last_resumed_at

// NEW SESSION path:
sess = await backend.launch({ cwd, appUrl })           // opencode creates ses_xxx
await recordSession({ workspace, backend_session_id: sess.sessionId, app_id, initial_prompt })
```

### Storage layout in workspace

```
workspace/
├── data/rows.db              # template row data (ADR-0002 BunSqliteRowRepository)
├── audit.ndjson              # append-only audit log (ADR-0014 NdjsonAuditSink)
├── .pneuma/
│   ├── sessions.json         # THIS ADR — pointer index
│   ├── logs/
│   └── shadow.git/
```

### Cross-layer boundary

```
┌─────────────────────────────────────────┐
│ pneuma: sessions.json                   │
│   (pointer: backend_session_id,         │
│    app_id, builder_id, timestamps,      │
│    initial_prompt)                      │
└──────────┬──────────────────────────────┘
           │ findLatest / touch / list
           ↓
┌─────────────────────────────────────────┐
│ opencode: ~/.local/share/opencode/      │
│   opencode.db  (SQLite)                 │
│   sessions / messages / parts tables    │
│   (full content — source of truth)      │
└─────────────────────────────────────────┘
```

---

## Consequences

### Positive

- **Tiny implementation footprint**: the entire module is ~150 LoC including tests (`packages/core/src/session-index.ts` + `packages/core/test/session-index.test.ts`); no new runtime dependencies, no schema migrations.
- **Proven durability without duplication**: opencode's SQLite persistence is actively maintained and field-proven across 55+ sessions in pre-Day-5 demo runs; pneuma does not replicate that infrastructure.
- **"Builder resumes conversation across days" is live**: the Day 5 Act 3 demo (`PNEUMA_RESUME=1`) verified end-to-end resume with a real Anthropic "Building effective agents" bookmark prompt — agent recalled context after kill+restart.
- **Multi-Builder seam is already in schema**: `builder_id` is a first-class field; no schema migration is required when archetype B multi-Builder auth lands — the filter path (`listSessions({ builder_id })`) is already implemented.
- **Adapter wiring was already correct**: `AgentLaunchOptions.resumeSessionId` and the conditional `session.create` skip in `adapter.ts:130-143` existed before Day 5; this ADR formalizes the consumer pattern, not a new adapter change.
- **Backend-agnostic**: `backend_session_id` is opaque to pneuma; a Codex or future backend adapter only needs to surface its own session-ID domain through the same `AgentLaunchOptions` interface, and the session-index module works unchanged.

### Negative / Risks

- **opencode session GC**: opencode's default retention is 30 days; after that, pneuma's pointer records become stale. The `last_resumed_at` field makes staleness visible (entries not touched in >30 days are likely dead), but there is currently no automated pruning. A future "prune" command would scan the index and verify liveness against the opencode DB.
- **Sync loss on data wipe**: if the user deletes `~/.local/share/opencode/` or migrates to a new machine, pneuma's index is meaningless — `backend.launch({ resumeSessionId: "ses_xxx" })` will silently start a fresh session (opencode won't find the ID and will create a new one). There is no cross-machine portability without also migrating the opencode DB. An optional pneuma-side conversation mirror (Option A as opt-in) could address this in a future ADR.
- **No conversation UI without live backend**: pneuma cannot render conversation history (messages, tool calls, thinking blocks) if the opencode process is not running. Any "history browsing" feature requires either opencode to be live, or escalation to Option A-style local replication.
- **Cross-machine sync not supported**: opencode session IDs are machine-local opaque strings; `sessions.json` from one machine is useless on another. This is acceptable for [ADR-0001](./0001-archetype-scope.md) archetype A (single-Builder local) but will need resolution for cloud deployments.
- **MVP `builder_id = "default"` has no scoping enforcement**: two Builders on the same machine sharing a workspace directory would co-mingle their session records in the same file; filtering is possible via `listSessions({ builder_id })` but requires the caller to supply the correct identity. No isolation is enforced at the file level until multi-Builder auth is wired.

### Follow-ups

- **ADR-TBD: Multi-Builder session scoping** — when archetype B deployment (see [ADR-0001](./0001-archetype-scope.md)) needs to distinguish Builder identities, formalize the `builder_id` population path (e.g., from JWT claims or a local user registry) and decide whether per-Builder file separation is warranted, or whether the combined-file + filter approach scales.
- **ADR-TBD: Session provenance in `app_history`** — [ADR-0017](./0017-rollback-data-semantics.md) amendment already bakes `actor_kind` and `is_ai_generated` into `app_history`; a future amendment can link an `app_history` entry back to the `backend_session_id` that produced it, completing the audit trail from "user said X" → "agent called Operation Y" → "row changed Z".
- **ADR-TBD: Optional conversation mirror** — if a use case demands pneuma-side history rendering without the opencode backend live, an opt-in mirror (Option A as a layer on top of Option B) should be specified as a separate ADR rather than baked into the current thin-pointer design.
- **进 OPEN-QUESTIONS.md**: when and how to prune stale `sessions.json` entries — TTL based on `last_resumed_at`, LRU eviction at N records, explicit user command, or never? The 30-day opencode GC window provides a natural hint but is not yet enforced.
- **进 OPEN-QUESTIONS.md**: whether `initial_prompt` truncated to 160 chars is sufficient for a future session-listing UI; longer human-readable summaries (produced by an LLM at record time) may be more useful but add latency and cost to every new session.
