# M13 Host Agent Evolution

M13 moves governed backend-agent evolution into the Reference Creation Host.

The demo keeps the M12 model visible:

```text
Creation Host
  -> Generated Application project
  -> v0 preview runtime
  -> Builder asks for a capability
  -> Build-phase Agent proposes one definition.apply_change_set
  -> Host shows one approval prompt
  -> allow applies the whole change-set
  -> deny leaves the app unchanged
```

## What This Proves

- A Builder can ask for evolution from inside the Host, not from a standalone app demo.
- The backend agent sees framework semantic tools through `pneuma_framework`.
- One Builder intent maps to one `definition.apply_change_set` approval.
- The allow path applies schema, Operation, View, and PolicyRule changes together.
- The deny path records refusal and leaves `list_priority_queue` absent.
- The Host persists transcript evidence under the generated-app version workspace.
- The workbench shows preview, data, schema, API, and transcript in one surface.

## Run

```bash
bun run examples/m13-host-agent-evolution/run.ts --backend fake --auto-decision none --port 8880
```

Open:

```text
http://127.0.0.1:8880/
```

Use the browser flow:

```text
Create v0
Start preview
Evolve with agent
Allow or Deny
Inspect Data / Schema / API / Transcript
```

## Deterministic Smoke

Allow path:

```bash
bun run examples/m13-host-agent-evolution/run.ts --backend fake --auto-decision allow --smoke-exit
```

Deny path:

```bash
bun run examples/m13-host-agent-evolution/run.ts --backend fake --auto-decision deny --smoke-exit
```

## Real Backend Path

The runner accepts `--backend opencode` for manual real-backend verification:

```bash
bun run examples/m13-host-agent-evolution/run.ts --backend opencode --auto-decision none --port 8880
```

The fake backend is the CI path. It deterministically calls `definition.apply_change_set`
with the Priority Queue capability so tests can verify the Host approval loop without
depending on model output.

## Not In Scope

M13 does not publish the generated app. It also does not claim production IAM,
multi-tenant isolation, arbitrary code generation, hot reload, or release rollback.

Those move to later milestones, starting with M14 host publish / monitor / rollback.
