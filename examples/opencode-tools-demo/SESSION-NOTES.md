# opencode-tools-demo — First Successful E2E Round-Trip

**Date:** 2026-04-24
**Commit:** fa64403 (after fixes in 4941ab6, ade61ed, fa64403)
**Model:** `openrouter/anthropic/claude-sonnet-4.6`

## Two successful runs

Both runs completed cleanly with fresh workspaces.

### Run 1

- Workspace: `/var/folders/l9/.../pneuma-tools-demo-ws-qerfxU`
- Agent called `op.add_bookmark` with `{ url: "https://example.com" }`
- SQLite result:

  ```
  bookmarks|1
  interpretations|3
  lenses|3
  bm-1777013157581-5270|https://example.com
  ```

### Run 2

- Workspace: `/var/folders/l9/.../pneuma-tools-demo-ws-xVyIZD`
- Agent called `op.add_bookmark` with `{ url: "https://example.com" }`
- SQLite result:

  ```
  bookmarks|1
  interpretations|3
  lenses|3
  bm-1777013220238-e679|https://example.com
  ```

## Agent tool call excerpt (from DEBUG_EVENTS run)

```
[ev] text {"part":{"type":"tool","callID":"toolu_bdrk_016YvgCdh1KaU7tkBpt4yHqD",...}}
...
[ev] text {"partId":"prt_dbe3d4df3001...","delta":"Here's what was stored:"}
[ev] text {"partId":"prt_dbe3d4df3001...","delta":"\n\n| Field | Value |\n|---|---|"}
[ev] text {"partId":"prt_dbe3d4df3001...","delta":"| **Bookmark ID** | `bm-1777013157581-5270` |"}
[ev] text {"partId":"prt_dbe3d4df3001...","delta":"| **Title** | Example Domain |"}
[ev] text {"partId":"prt_dbe3d4df3001...","delta":"| **URL** | https://example.com |"}
[ev] text {"partId":"prt_dbe3d4df3001...","delta":"| **Interpretations generated** | 3 (across 3 lenses) |"}
```

## Bugs fixed in this session

1. **`##pneuma:service-ready` emitted `/api/health` path** — consumers appending
   `/api/config` hit 404. Fixed in 4941ab6: all three templates now emit the bare
   service root URL.

2. **URL consumers used `.replace(/\/$/, "")` instead of `.origin`** — defensive
   normalization added in ade61ed: `template-mcp-bridge.ts` and
   `lifecycle.ts` now strip any path from the service URL before appending
   `/api/config`.

3. **Model IDs used `claude-sonnet-4-6` (hyphen)** — corrected to
   `claude-sonnet-4.6` (dot) in fa64403.

## Test suite

639 tests pass, 0 failures.
