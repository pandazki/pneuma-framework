# doc-mode — full-stack E2E walkthrough

Exercises every M3 moving part together: lifecycle orchestrator + opencode
backend + wire protocol (WS server + file watcher + state seed) + React
viewer (`<PneumaViewer>` + `useFocus` / `useAction` / `usePneumaState`) +
live markdown preview.

## Prereqs

1. `opencode` on `$PATH` (the backend-opencode adapter spawns `opencode serve`).
2. OpenRouter credential registered with opencode — run once:

   ```sh
   opencode auth login
   # choose "OpenRouter", paste your key
   ```

   Verify:

   ```sh
   opencode models | grep openrouter/anthropic | head
   ```

## Run

From the repo root:

```sh
bun packages/cli/src/index.ts dev templates/doc --backend opencode --workspace /tmp/pneuma-doc
```

Terminal prints something like:

```
[pneuma:starting dev]
[pneuma:ready]
  service viewer: http://localhost:5173/?sid=<uuid>&ws=http%3A%2F%2F127.0.0.1%3A<port>

  Builder URL: http://localhost:5173/?sid=<uuid>&ws=http%3A%2F%2F127.0.0.1%3A<port>
  (copy to browser · 复制到浏览器打开)
```

Copy the **Builder URL** into a browser. You should see the bilingual welcome
doc on the left and the collapsible chat panel (status: `open`) on the right.

## What to try

- **Chat →**: in the right-side panel, type "写一篇关于协程的 3 段介绍" and
  press Send. Watch the agent stream its reply, then edit `doc.md`; the
  preview re-renders live.
- **Click a heading**: click a `##` heading in the preview. The next chat
  message you send arrives at the agent with a `[User selected: heading …]`
  context line prepended.
- **Edit `doc.md` on disk**: open `/tmp/pneuma-doc/doc.md` in your editor,
  save. The preview re-renders.
- **Collapse the chat**: click the `→` / `←` tab at the top-right of the
  panel.

## Knobs

- `OPENCODE_MODEL=openrouter/anthropic/claude-haiku-4.5 bun packages/cli/src/index.ts dev templates/doc --backend opencode --workspace /tmp/pneuma-doc` — cheaper model.
- `--port 6173` — pick a different viewer port.
- `--workspace /path/persistent/` — survive across runs (without this, doc.md gets scaffolded fresh into the chosen dir on each start — only re-scaffolded if missing).
- `PNEUMA_DEBUG_BRIDGE=1` — log every backend event with its routing decision. Useful when "nothing comes back" needs triage.

## What's out of scope for M3

- Multi-file editing (only `doc.md` is rendered).
- Permission prompt UI (everything auto-accepts in v0 doc mode).
- Diff animation / checkpoint rewind UI (orchestrator supports checkpoints; viewer doesn't surface them).
- `claude-code` / `codex` backends (Phase G of the plan — deferred).

## The sharp edges I hit while building this

- WebSocket needs `ws://`, not `http://`. PneumaViewer rewrites the URL.
- opencode's SSE event stream is **filtered by `?directory=`** — the adapter has to pass it to `event.subscribe()` or the stream is silent.
- opencode streams text via `message.part.delta` events — the adapter handles
  both that and the cumulative `message.part.updated` path.
- `session.create` / `session.prompt` need `query.directory` too, otherwise
  the agent operates in the opencode server's cwd instead of your workspace.
