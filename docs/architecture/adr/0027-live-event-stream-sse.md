# ADR-0027: Live Event Stream for Viewer via SSE

**Status**: Accepted
**Date**: 2026-04-25
**Deciders**: Pandazki
**Tags**: `runtime, viewer, event, sse, observation`

---

## Context

[ADR-0018](./0018-operations-as-primitive.md) established Operations as the single semantic primitive binding UI and Agent behavior. By Day 3, the agent→Operation loop was end-to-end functional: an agent in a terminal session could call `op.add_bookmark` via the MCP bridge and the Operation would execute and persist. However, the viewer (a browser tab open to the template's HTML page) had no mechanism to observe that completion. The Builder had to manually reload the page to see the new bookmark.

This "submit → wait → refresh" pattern undermined the AI-native promise of the framework. When the Builder delegates work to an agent — "add a few bookmarks while I read" — the mental model is that the viewer updates on its own, not that they need to track when the agent finishes and hit reload. The gap between agent activity and viewer state was observable and jarring.

The concrete symptom from the `ai-bookmarks-core-domain` demo (Act 2):

> "Meanwhile, in the browser: The bookmark card for *Ship / Show / Ask* appears automatically. After another ~30-60 s the three lens interpretation cards fill in. No refresh — the viewer's `EventSource` fires on `operation-executed` SSE events and debounces a `refreshAll()` call."

Pre-Day-4, that paragraph could not have been written — the viewer was static until manually reloaded.

**Why not polling?** Two obvious polling intervals were considered: 5-second polling misses fast multi-operation sequences where the agent invokes several operations in rapid succession (the viewer would lag behind by up to 5 s between cards); 1-second polling burns cycles during the overwhelmingly idle steady state where no operations are executing. Neither is correct; polling is the wrong abstraction — the server knows exactly when something happened.

**Protocol choice is non-trivial.** The framework already has a `packages/core/src/wire-protocol/` WebSocket infrastructure intended for the agent↔Builder dialog channel. Reusing it for data-observation push would be possible but conflates two different concerns (see Options). A fresh decision was needed.

Related prior decisions:
- see [ADR-0013](./0013-telemetry-event-model.md) — the audit/telemetry event model is a separate, durable sink; SSE is NOT that sink
- see [ADR-0014](./0014-audit-subset.md) — audit persistence is an independent path; SSE is ephemeral observation only
- see [ADR-0018](./0018-operations-as-primitive.md) — Operation invocation is the event source for this ADR
- see [ADR-0025](./0025-agent-conversation-persistence.md) — session continuity across restart is complementary; SSE is the data-refresh channel, not the conversation channel
- ADR-0026 (Agent Tool-Call Binding) — once defined, SSE closes the "agent invoked X → viewer sees X" loop that ADR-0026 opens

---

## Options considered

### Option A: WebSocket (full duplex)

Viewer opens a WebSocket connection to the runtime; server pushes `operation-executed` frames; viewer could optionally send messages back (future: agent prompts, permission gates). WS gives a bidirectional persistent channel that could eventually carry everything.

- **Pro**: single long-lived channel; bidirectional capability matches potential future needs (permission confirmations, agent text streaming to viewer); matches the existing `packages/core/src/wire-protocol/` infrastructure shape
- **Con**: more complex server implementation (frame parsing, ping/pong keepalive, close handshake); viewer reconnect logic is more code than `EventSource`; entirely overkill when we only need server→client today; `Bun.serve` WebSocket support is fine but not as zero-config as `ReadableStream`

### Option B: Long-polling REST

Viewer issues `GET /api/events?since=<seq>` which the server holds open for up to 30 s, returning when an event occurs or the timeout elapses. Classic Comet pattern.

- **Pro**: simplest client code — just another `fetch()`; firewall-friendly (pure HTTP); no special server primitives needed
- **Con**: latency between events can be up to 30 s (or whatever the poll interval is), making fast agent sequences appear sluggish in the viewer; client must track `since` cursor across reconnects; server holds one pending request per open viewer tab, which wastes file descriptors for any scenario with more than one viewer; semantically awkward (a "request" that waits 30 s isn't a query)

### Option C: Server-Sent Events (chosen)

Viewer opens a native browser `EventSource` to `GET /api/events/stream`; server sends `data: ${json}\n\n` frames over a persistent HTTP response body (a `ReadableStream`). Connection is unidirectional: server → client only. `EventSource` has built-in auto-reconnect with browser-managed backoff.

- **Pro**: built into HTML5 `EventSource` — no library; browser handles reconnect automatically; perfectly matches the one-directional "server notifies client of state changes" use case; trivial Bun.serve integration via `ReadableStream`; HTTP-native (works through reverse proxies, VPNs, corporate firewalls without special configuration)
- **Con**: unidirectional — cannot carry future builder→server messages on the same channel (that concern belongs on the wire-protocol WebSocket, not here); text-frame overhead slightly higher than binary WS; no built-in Last-Event-ID replay in MVP (viewer reconciles via REST on reconnect)

### Option D: Reuse `packages/core/src/wire-protocol/` WebSocket infrastructure

The framework already has a wire-protocol WebSocket server in `packages/core/src/wire-protocol/` (stub for agent↔Builder dialog — `bridge.ts`, `server.ts`, `session-registry.ts`). This infrastructure could be extended to also fan-out `operation-executed` events to connected viewers.

- **Pro**: one WebSocket for everything (agent text, permission confirmations, data refresh); fewer open connections per session
- **Con**: conflates two fundamentally different concerns — Builder-agent dialog (stateful, session-scoped, bidirectional, permission-bearing) vs. server-data observation (stateless broadcast, any viewer, unidirectional); the wire-protocol's `focus`/`action`/permission-prompt envelope types are not designed for Operation-executed fan-out; tight coupling blocks both channels from maturing independently; would require coordinating three processes (CLI, template server, viewer) rather than two (template server, viewer)

---

## Decision

**Option C — Server-Sent Events** is adopted. The implementation has five specific shapes:

### 1. EventBroadcaster pub/sub hub (`packages/runtime/src/event-broadcaster.ts`)

```ts
export interface RuntimeEvent {
  readonly type: "operation-executed";
  readonly operation_id: string;
  readonly app_id: string;
  readonly ts: number;        // Date.now() at emission time
  readonly success: boolean;  // false if handler threw
}

export class EventBroadcaster {
  subscribe(listener: (evt: RuntimeEvent) => void): () => void; // returns unsubscribe fn
  emit(evt: RuntimeEvent): void;
  subscriberCount(): number;
}
```

Implementation: in-memory `Set<Listener>`; no persistence; errors in individual listeners are caught and swallowed so one broken subscriber cannot abort fan-out to others. The broadcaster is a **per-AppRuntime singleton** — every `AppRuntime` instance constructs one and exposes it as `runtime.broadcaster`.

### 2. OperationExecutor hook (`packages/runtime/src/runtime.ts`)

In the `AppRuntime` constructor, `executor.invoke` is wrapped once (the original is bound to `_rawInvoke` to prevent re-wrapping on re-access):

```ts
this.executor.invoke = async function (op, input, ctx, opts) {
  let success = false;
  try {
    const result = await rawInvoke(op, input, ctx, opts);
    success = true;
    return result;
  } finally {
    broadcaster.emit({
      type: "operation-executed",
      operation_id: op.id,
      app_id,
      ts: Date.now(),
      success,
    });
  }
};
```

The `finally` ensures emission happens even when the handler throws (`success=false`). Reads-only operations (query executor path, `runtime.queryExec`) do **not** emit; only mutating Operations routed through `executor.invoke` emit. The debounce on the viewer side coalesces any rapid burst into a single `refreshAll()`.

### 3. HTTP endpoint (`packages/runtime/src/http.ts`)

```
GET /api/events/stream
Response:
  Status: 200
  Content-Type: text/event-stream; charset=utf-8
  Cache-Control: no-cache
  Connection: keep-alive
  X-Accel-Buffering: no        (nginx: disable proxy buffering)
  Body: ReadableStream of SSE frames

Frame format (data event):
  data: {"type":"operation-executed","operation_id":"add_bookmark","app_id":"...","ts":...,"success":true}\n\n

Keepalive comment (every 15 s):
  : keepalive\n\n
```

The endpoint is intercepted in `asBunFetch` **before** the normal `handleHttp` JSON pipeline — returning a raw `Response` with a `ReadableStream` body. This interception is necessary because the regular `HttpResponse` shape (`{ status, body: unknown }`) assumes a JSON-serializable body; changing that contract for a streaming endpoint would require threading `ReadableStream` through all 30+ routes. The special-case at the `asBunFetch` level is the narrowest change.

On connection open: subscribe to `runtime.broadcaster`, start 15-second keepalive interval. On stream cancel (client disconnect): unsubscribe, clear interval. No Last-Event-ID / event replay semantics in MVP — if a viewer was disconnected, it receives fresh events on reconnect, and its `refreshAll()` reconciles state against the REST endpoints regardless.

### 4. Viewer integration (`templates/ai-bookmarks-core-domain/viewer/index.html`)

```js
const es = new EventSource("/api/events/stream");
let debounceTimer = null;

es.onmessage = (event) => {
  let data;
  try { data = JSON.parse(event.data); } catch { return; }
  if (data && data.type === "operation-executed") {
    // Coalesce rapid events (e.g. agent calls 3 ops in 50 ms) into one refresh.
    if (debounceTimer !== null) return;
    debounceTimer = setTimeout(() => { debounceTimer = null; refreshAll(); }, 300);
  }
};

// Connection state indicator in page header:
// ● live         (green)  — EventSource readyState OPEN
// ● reconnecting (amber)  — onerror fired, retry queued (up to 5 retries × 2 s)
// ○ offline      (gray)   — 5 retries exhausted
```

After 5 failed reconnect attempts (~10 s), the viewer stops retrying and displays `○ offline`. A manual page refresh re-establishes when the server is back. The `● reconnecting` flash during Act 3's kill-restart cycle is intentionally brief — the server restarts fast enough that the indicator barely shows, which is acceptable production behavior.

### 5. Separation from `packages/core/src/wire-protocol/`

An explicit architectural boundary is established:

| Channel | Purpose | Direction | Scope |
|---|---|---|---|
| **SSE (`/api/events/stream`)** | State-change observation (any Operation completion) | Server → viewer | Stateless broadcast; any connected viewer receives all events |
| **wire-protocol WebSocket** | Agent ↔ Builder dialog (text streaming, permission prompts, confirmation gates, focus/action) | Bidirectional | Stateful conversation; Builder-specific; session-scoped |

These two channels solve different problems. Merging them at this stage would prematurely constrain wire-protocol's envelope design and block it from evolving toward permission-gate UX, focus/action payloads, and streaming text — all of which are out-of-scope for a data-observation broadcast. If a future wire-protocol revision absorbs the observation channel, that is a natural evolution; starting them merged would muddy semantics in both directions.

---

## Consequences

### Positive

- The "AI-native moment" is demonstrable end-to-end: Builder opens viewer, agent adds a bookmark in a separate terminal, the bookmark card appears in the browser with no manual action. Day 4 demo (Act 2 in `examples/opencode-tools-demo/demo.md`) validated this verbatim.
- Zero polling in the viewer. The framework's stated YAGNI principle applies: no session-cursor management, no wasted cycles during idle periods, no coarse-grained update windows.
- Clean separation of concerns: the observation channel (ephemeral, broadcast, stateless) is kept distinct from the dialog channel (stateful, session-scoped, bidirectional), allowing both to evolve independently without coupling.
- HTTP-native: SSE traverses reverse proxies, VPNs, and corporate firewalls without special configuration. The `X-Accel-Buffering: no` header handles nginx proxy-buffering edge cases.
- Zero new runtime dependencies: Bun.serve's native `ReadableStream` support is sufficient. No SSE library needed in the template or the runtime.
- `EventBroadcaster` and the SSE endpoint are covered by 13 tests across `packages/runtime/test/event-broadcaster.test.ts` and `packages/runtime/test/sse.test.ts`, running against a real `Bun.serve` instance on a random port. The tests validate subscribe/emit/fan-out, error isolation, HTTP headers, keepalive comment, and the `success=false` failure path.
- The `RuntimeEvent` union type is open for extension: future event variants (`policy-updated`, `transform-cache-hit`, `row-deleted`) can be added to the union without breaking existing viewers, which filter by `type`.

### Negative / Risks

- **In-memory broadcaster — events lost on crash.** If the runtime process exits, connected viewers lose the SSE stream. Native `EventSource` auto-reconnect is transparent for restarts, but any `operation-executed` events emitted during the downtime window are not replayed. Viewers reconcile on reconnect via `refreshAll()` against the REST endpoints (the source of truth is Layer 1 storage, not the event stream), so data correctness is maintained — but a transient notification would be missed if that use case is ever added.
- **No Last-Event-ID / replay in MVP.** A viewer that disconnects for an extended period won't receive events that fired during the gap. The full `refreshAll()` on reconnect reconciles data state, but fine-grained event-level replay (e.g. "animate each bookmark as it was added") is not possible without a sequence store. Acceptable for the current single-Builder local-dev archetype.
- **No auth on `/api/events/stream`.** MVP assumes a single Builder in local dev. In archetype B / cloud scenarios (multi-tenant, multi-Builder), the broadcast model leaks cross-Builder activity. Scoping events per-Builder, per-app, or per-session requires an auth layer that is deliberately deferred to a multi-tenancy ADR.
- **Debounce hides intermediate states.** When an agent invokes 10 operations in 50 ms (e.g. bulk-adding bookmarks from a list), the viewer coalesces all 10 `operation-executed` events into a single `refreshAll()` after 300 ms. This is desirable for throughput but means intermediate states are never rendered. Acceptable for bookmark-scale; worth revisiting for higher-frequency domains.
- **`operation-executed` payload is coarse.** Viewers wanting fine-grained reactive updates (e.g. "refresh just this one bookmark row") must still call REST endpoints and diff client-side. The event carries enough to trigger a refresh but not enough to apply a targeted patch. See follow-up ADR.

### Follow-ups

- **ADR-TBD: Event variants for fine-grained reactivity** — `row-created`, `row-updated`, `row-deleted` with minimal payload (`{ table, id }`) so viewers can apply targeted DOM patches instead of full `refreshAll()`. Relevant when template data sets are large enough that full re-render is perceptible.
- **ADR-TBD: Last-Event-ID / sequence-based replay** — MVP is pure best-effort delivery. When reliability matters (archetype C+: cloud, multi-Builder), add a sequence number to `RuntimeEvent` and a `GET /api/events/stream?since=<seq>` backfill path so reconnecting viewers catch up without a full REST reconcile.
- **ADR-TBD: Multi-tenancy event scoping** — per-Builder or per-app subscription filtering; depends on the auth layer. Blocks archetype B deployment.
- **Integration with ADR-0026 (Agent Tool-Call Binding)** — when the agent invokes an operation via the MCP bridge, the viewer now observes the result via SSE. Future wire-protocol work (preview/confirmation events) will be distinct from `operation-executed` and will travel on the dialog channel, not this one.
- **Amendment to ADR-0013 (Telemetry)** — SSE is NOT the audit sink. Telemetry sinks are durable and queryable via `GET /api/events`; SSE is ephemeral observation only. The distinction is worth clarifying in an ADR-0013 amendment to prevent future confusion.
- **进 OPEN-QUESTIONS.md**: should `success=false` events include an error category or code so viewer UX can surface targeted error states (e.g. "policy denied" vs "handler threw")? Today viewers receive the failure fact but not the reason.
