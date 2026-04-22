# opencode-chat — pneuma-framework E2E example

Minimal end-to-end demo that wires:

- `@pneuma-framework/core` — spawns the `templates/minimal` dev server via its
  lifecycle verbs, sets up the semantic tool registry.
- `@pneuma-framework/backend-opencode` — launches a local `opencode serve` via
  the SDK and exposes it as an `AgentBackend`.
- An OpenRouter-backed model — auth read from `opencode`'s own config.

## Prereqs

1. `opencode` binary on `$PATH` (the adapter spawns it via `createOpencode()`).
2. OpenRouter credential registered with opencode:

   ```sh
   opencode auth login
   # choose "OpenRouter" and paste your key
   ```

   Verify with:

   ```sh
   opencode models | grep openrouter | head -3
   ```

## Run

From the repo root:

```sh
bun examples/opencode-chat/run.ts "What is 2+2? Answer in one word."
```

Override the model via env var (defaults to
`openrouter/anthropic/claude-opus-4.7`):

```sh
OPENCODE_MODEL=openrouter/anthropic/claude-haiku-4.5 \
  bun examples/opencode-chat/run.ts "hi"
```

## What it does

1. Creates a throwaway workspace under `$TMPDIR`.
2. Runs `templates/minimal`'s `dev.sh` — shows pneuma's lifecycle verbs working.
3. Spawns an `opencode serve`, creates a session against the configured model.
4. Sends the prompt via `backend.sendUserMessage`; streams `message.part.updated`
   events back through the `AgentBackend.onEvent` surface.
5. Prints the agent's text reply.
6. Tears down: stops dev, closes framework, closes backend.

## What this is NOT (yet)

- Tool calls from the agent back into pneuma (`lifecycle.state`, `workspace.tree`, …)
  are wired in code but the MCP transport between opencode and the
  framework's `ToolRegistry` is M3 work.
- No viewer / builder UI. That's also M3.

This example is a sanity check that the backend abstraction, lifecycle
orchestrator, and an OpenRouter-backed agent all run together.
