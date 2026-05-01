# M7 Live Agent Approval Protocol

M7 turns the M6 backend-agent evolution into a live Builder approval loop.

What changed:

- The Build-phase Agent still calls `definition.apply`; no new mutation path was added.
- Framework-owned permission prompts are broadcast over the existing viewer WebSocket.
- The Knowledge Inbox viewer renders a human-readable approval card.
- Builder approval returns through the existing `permission-response` wire envelope.
- A durable transcript records Builder request, assistant text, tool calls, permission prompts, approval responses, tool results, restart evidence, and completion.

## Run The Demo

Deterministic live approval:

```bash
bun run examples/m7-live-agent-approval-protocol/run.ts \
  --backend fake \
  --auto-decision none \
  --port 8878
```

Open:

```text
http://127.0.0.1:8878/?scenario=live-approval
```

Click **Allow** to let the app evolve into Priority Queue, or **Deny** to leave the app unchanged.

CI-safe allow path:

```bash
bun run examples/m7-live-agent-approval-protocol/run.ts \
  --backend fake \
  --auto-decision allow \
  --port 0 \
  --smoke-exit
```

CI-safe deny path:

```bash
bun run examples/m7-live-agent-approval-protocol/run.ts \
  --backend fake \
  --auto-decision deny \
  --port 0 \
  --smoke-exit
```

Manual opencode path:

```bash
OPENCODE_MODEL=openrouter/anthropic/claude-opus-4.7 \
bun run examples/m7-live-agent-approval-protocol/run.ts \
  --backend opencode \
  --auto-decision none \
  --port 8878
```

## Transcript

The runner writes:

```text
<workspace>/data/m7-agent-execution-transcript.json
```

The template server exposes it through:

```text
GET /api/agent-execution-transcript
```

The app also exposes the framework wire session:

```text
GET /api/framework-session
```

The viewer uses that session to connect to:

```text
<PNEUMA_WS_URL>/ws/viewer/<PNEUMA_SESSION_ID>
```

Then it sends:

```json
{
  "dir": "v2a",
  "kind": "permission-response",
  "response": {
    "id": "pneuma:definition-apply:...",
    "decision": "allow"
  }
}
```

## Boundaries

This is a dev-mode Builder approval loop. It is not production IAM, not policy authoring, and not a claim that model planning is reliable. The claim is narrower and stronger: a backend agent can pause on framework governance, a human-visible viewer can approve or deny the change over the protocol, and the app can show the resulting before/work/after evidence.
