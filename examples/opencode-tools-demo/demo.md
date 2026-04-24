# pneuma-framework: 5-minute live demo

**What this proves:** The agent invokes Operations through MCP tool-calls; the viewer reflects
the result in real time via SSE; and the conversation continues across a full server kill and
restart — without the agent asking "what were we talking about?"

**Acts at a glance:**
- Act 1 (90 s) — start the bookmarks server, open the viewer, confirm `● live`
- Act 2 (90 s) — run the agent; it calls `op.add_bookmark`; the viewer updates live
- Act 3 (90 s) — kill the server, restart it, resume the session; the agent remembers

---

## Prerequisites

- macOS or Linux with [Bun](https://bun.sh) ≥ 1.1 installed
- An [OpenRouter](https://openrouter.ai) API key in `OPENROUTER_API_KEY`
- Two terminal windows (Terminal A and Terminal B) and one browser tab

```sh
# Clone and install once if you haven't already:
git clone https://github.com/your-org/pneuma-framework
cd pneuma-framework
bun install
```

---

## Act 1 — Start and observe (90 s)

**Terminal A:**

```sh
export OPENROUTER_API_KEY=sk-or-v1-...   # your key
bun run examples/ai-bookmarks-real/run.ts \
  --workspace ~/.pneuma-bookmarks \
  --port 8765
```

Expected output (takes ~5-10 s while Bun compiles):

```
template:  .../templates/ai-bookmarks-core-domain
workspace: /Users/you/.pneuma-bookmarks
port:      8765

service api: http://127.0.0.1:8765

Open in browser:
  http://127.0.0.1:8765/

Your data persists in:
  /Users/you/.pneuma-bookmarks/data/

Press Ctrl-C to stop.
```

Open `http://127.0.0.1:8765/` in a browser.

You should see:
- `● live` badge (green) in the page header — the viewer's SSE connection is up
- Three pre-seeded lenses: *technical-depth*, *personal-relevance*, *skimmable-summary*
- An empty bookmarks list (or previously saved entries if you've run this before)

---

## Act 2 — Agent invokes Operation (90 s)

**Terminal B** (leave Terminal A running):

```sh
export OPENROUTER_API_KEY=sk-or-v1-...   # same key
export OPENCODE_MODEL=openrouter/anthropic/claude-sonnet-4.6
bun run examples/opencode-tools-demo/agent-only.ts \
  "Add a bookmark for https://martinfowler.com/articles/ship-show-ask.html and summarize what it is."
```

The agent will think for ~5-10 s before making the tool call. Expected output:

```
[agent-only] workspace:  /Users/you/.pneuma-bookmarks
[agent-only] target:     http://127.0.0.1:8765
[agent-only] app_id:     ai-bookmarks-core-domain
[agent-only] operations: 9 (list_lenses, upsert_lens, delete_lens, add_bookmark, ...)
[agent-only] model:      openrouter/anthropic/claude-sonnet-4.6
[agent-only] mode:       new session
[agent-only] launching opencode backend with MCP bridge…
[agent-only] session:    ses_<ID>
[agent-only] prompt:     Add a bookmark for https://martinfowler.com/...
[agent-only] agent reply:
--------------------------------
Bookmark added ✅ (ID: `bm-<ID>`)

**Ship / Show / Ask** — by Rouan Wilsenach (published on martinfowler.com)

A modern branching strategy that reconciles Continuous Integration with the benefits
of Pull Requests. Every code change gets classified into one of three categories:
Ship (commit directly), Show (merge immediately, share for async comments), or
Ask (wait for review before merging).
...
--------------------------------
[agent-only] session recorded: sess-<ID> (backend: ses_<ID>)
```

**Meanwhile, in the browser:**
The bookmark card for *Ship / Show / Ask* appears automatically. After another ~30-60 s
the three lens interpretation cards fill in. No refresh — the viewer's `EventSource` fires
on `operation-executed` SSE events and debounces a `refreshAll()` call.

The session record has been written to `~/.pneuma-bookmarks/.pneuma/sessions.json`.

---

## Act 3 — Kill and resume across restart (90 s)

**Terminal A:** press `Ctrl-C` to kill the server.

In the browser, the `● live` badge changes to `● reconnecting` — the viewer tries to
reconnect for up to 10 seconds (5 retries × 2 s). If the server stays down past that
window, the badge flips to `○ offline`. Either way, the page content stays visible.

**Terminal A:** restart the server with the same command:

```sh
bun run examples/ai-bookmarks-real/run.ts \
  --workspace ~/.pneuma-bookmarks \
  --port 8765
```

Once the service is back, the browser badge returns to `● live` (either automatically
if the reconnect window hasn't expired, or after a manual page refresh).

**Terminal B:** resume the most recent session:

```sh
PNEUMA_RESUME=1 bun run examples/opencode-tools-demo/agent-only.ts \
  "What URL did you just add and what was it about?"
```

Expected output — note the `resuming` log line:

```
[agent-only] resuming    ses_<SAME-ID> (first prompt: "Add a bookmark for https://martinfowler.com/...")
[agent-only] mode:       resume (ses_<SAME-ID>)
...
[agent-only] agent reply:
--------------------------------
The URL I just added was https://martinfowler.com/articles/ship-show-ask.html,
titled "Ship / Show / Ask". It covers a branching strategy by Rouan Wilsenach that
classifies every code change into Ship, Show, or Ask — balancing speed and collaboration
without requiring approval as a hard gate.
--------------------------------
[agent-only] session touched: sess-<ID> (backend: ses_<SAME-ID>)
```

The agent answers from memory — no "I don't have context about that" — because it
resumed the same opencode session thread.

---

## What just happened

Five moving pieces made this work:

1. **MCP bridge** (`packages/backend-opencode/src/template-mcp-bridge.ts`) — spawned by
   opencode during `backend.launch()`; reads `/api/config` from the running template,
   translates each Operation into an MCP tool (`op.add_bookmark`, etc.), and proxies
   tool-call results back to opencode.

2. **Operation handler** (`templates/ai-bookmarks-core-domain/server/app.ts`) — receives
   `POST /api/operations/add_bookmark`, fetches the URL via Jina Reader, runs each lens
   prompt against Claude Sonnet 4.6, stores everything in SQLite under
   `~/.pneuma-bookmarks/data/`.

3. **SSE broadcaster** (`packages/runtime/src/event-broadcaster.ts`) — after every
   Operation executes, the runtime broadcasts an `operation-executed` event on
   `GET /api/events/stream`. Clients get notified without polling.

4. **Viewer** (`templates/ai-bookmarks-core-domain/viewer/index.html`) — a plain HTML page
   with an `EventSource` pointing at `/api/events/stream`. On `operation-executed` it
   debounces a full `refreshAll()` call (300 ms window). The `● live / ● reconnecting /
   ○ offline` badge reflects the EventSource connection state.

5. **Session index** (`packages/core/src/session-index.ts`) — persists a lean record of
   each agent session (`sess-*`) → opencode session ID (`ses_*`) in
   `~/.pneuma-bookmarks/.pneuma/sessions.json`. `PNEUMA_RESUME=1` calls
   `findLatestSession()`, retrieves the opencode session ID, and passes it as
   `resumeSessionId` to `backend.launch()` — which tells opencode to reattach to the
   existing conversation thread.

---

## Troubleshooting

**Port 8765 already in use:**
```sh
lsof -ti :8765 | xargs kill
```
Then rerun the server command.

**Agent reply is empty or the terminal just hangs:**
- Make sure `OPENCODE_MODEL` is set to `openrouter/anthropic/claude-sonnet-4.6` (note
  the dot, not a hyphen).
- Confirm `OPENROUTER_API_KEY` is exported.
- Run with `DEBUG_EVENTS=1` prepended to see raw event payloads.

**Resume didn't seem to remember anything:**
Check the session index first:
```sh
cat ~/.pneuma-bookmarks/.pneuma/sessions.json
```
You should see an entry whose `backend_session_id` matches the `ses_*` value printed in
Act 2's `[agent-only] session recorded:` line.

If the entry exists but the agent still didn't remember, opencode may have garbage-collected
the session. By default opencode retains sessions for 30 days; sessions in a temp directory
may be evicted sooner. Run Act 2 and Act 3 in the same sitting to avoid this.
