# opencode-tools-demo

Demonstrates the Step 4b MCP bridge: the agent (opencode) can call template Operations as tools.

## What it does

1. Starts the `ai-bookmarks-core-domain` template (Bun HTTP server exposing `/api/config` and `/api/operations/:id`).
2. Passes the running server's URL as `appUrl` to the opencode backend.
3. The backend injects `config.mcp.pneuma` into opencode, which spawns `template-mcp-bridge.ts` and advertises `op.*` tools (e.g. `op.add_bookmark`) to the LLM.
4. Sends a prompt that exercises one of those tools, streams the response, and shuts down.

## Prerequisites

- opencode auth configured: `opencode auth login` (openrouter credentials)
- or set `OPENROUTER_API_KEY` in your environment

## Usage

```sh
# From repo root:
bun run examples/opencode-tools-demo/run.ts

# Custom prompt:
bun run examples/opencode-tools-demo/run.ts "Add a bookmark for https://bun.sh"

# Select a different model:
OPENCODE_MODEL=openrouter/anthropic/claude-haiku-4.5 bun run examples/opencode-tools-demo/run.ts

# Debug agent events:
DEBUG_EVENTS=1 bun run examples/opencode-tools-demo/run.ts
```

## What to expect

- Template setup + dev start: ~5-10 seconds.
- Agent response: depends on model; haiku is faster for demos.
- The agent should call `op.add_bookmark` with `{ url: "..." }` and report back what was stored.
