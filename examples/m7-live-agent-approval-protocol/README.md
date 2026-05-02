# M7 Capability Change-Set Approval

M7 turns M6 backend-agent evolution into a live Builder approval loop with the right product unit: one Builder intent, one capability proposal, one approval.

What changed:

- The Build-phase Agent calls `definition.apply_change_set` once for the Priority Queue capability.
- The framework validates aggregate impact, then broadcasts one framework-owned permission prompt.
- The Knowledge Inbox viewer renders a human-readable approval card.
- Builder approval returns through the existing `permission-response` wire envelope.
- Allow executes the child `definition.apply` mutations internally; deny stops before any child mutation.
- A durable transcript records Builder request, assistant text, tool call, permission prompt, approval response, tool result, restart evidence, and completion.

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
    "id": "pneuma:definition-change-set:...",
    "decision": "allow"
  }
}
```

## Boundaries

This is a dev-mode Builder approval loop. It is not production IAM, not policy authoring, and not a claim that model planning is reliable. The claim is narrower and stronger: a backend agent can propose one capability change set, a human-visible viewer can approve or deny that proposal over the protocol, and the app can show before/work/after evidence.
