# M5 Knowledge Inbox Builder Evolution

This example turns the M4 Knowledge Inbox into a Builder-evolvable app.

It proves a narrow but important loop:

```text
Builder asks for priority review
  -> deterministic Build-phase Agent proposal
  -> framework approval
  -> definition.apply writes system-owned definition rows
  -> dev service restarts and rediscovers the capability
  -> App/Data/Substrate surfaces show Priority Queue
```

## Run

```bash
bun run examples/m5-knowledge-inbox-builder-evolution/run.ts
```

The runner prints:

- the live app URL;
- the M5 scenario URL: `?scenario=builder-evolution`;
- the workspace path;
- the number of definition changes applied.

For CI/local smoke:

```bash
bun test examples/m5-knowledge-inbox-builder-evolution/evolve.test.ts
bun test examples/m5-knowledge-inbox-builder-evolution/run.test.ts
```

Or run the runner in smoke mode:

```bash
bun run examples/m5-knowledge-inbox-builder-evolution/run.ts --smoke-exit --port 0
```

## What This Proves

- The priority capability is not hard-coded into the base app definition.
- The Builder/Agent proposal is represented as four governed `definition.apply` changes.
- Each change requires approval and executes as `framework_system`.
- Restart rediscovery exposes the new column, query Operation, View, and PolicyRule through `/api/config`.
- `GET /api/operations/list_priority_queue` works as a public API after the definition changes land.

## What This Does Not Prove

- Real LLM planning reliability. The M5 agent path is deterministic so tests are stable.
- Hot reload. M5 still uses restart-based rediscovery.
- Production identity/IAM.
- Postgres, Qdrant, semantic search, or runtime end-user agents.

## Demo Notes

Open the scenario URL printed by the runner. The left side is the end-user app/data surface. The right side stays on the Builder/Agent/Governance trace so a viewer can see why each primitive appears.

