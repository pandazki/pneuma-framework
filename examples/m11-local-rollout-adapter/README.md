# M11 Local Rollout Adapter

This example demonstrates the first release rollout primitive:

```text
baseline active release
  -> stage semantic-search candidate
  -> promote candidate to active
  -> rollback previous active release
```

The important boundary is semantic: the Build-phase Agent calls framework tools such as `release.stage`, `release.promote`, `release.status`, and `release.rollback`. Docker is only the local adapter used by the smoke test.

## What It Proves

- release state has explicit `active`, `candidate`, and `previous` slots;
- promotion keeps the previous active release for rollback;
- rollback restores the previous active release pointer;
- release state is durable under `.pneuma/release-rollout.json`;
- a local Docker smoke can verify two release URLs with different capability evidence.

## What It Does Not Prove

- no stable hostname or reverse proxy traffic switch;
- no cloud deployment;
- no Docker registry publishing;
- no zero-downtime production rollout;
- no automatic rollback daemon.

In M11 v0, the active release is the URL recorded by framework state. A later adapter can put a platform traffic switch behind the same semantic tools.

## Commands

Run the deterministic model:

```bash
bun test examples/m11-local-rollout-adapter/run.test.ts
```

Run the Docker smoke:

```bash
bun test examples/m11-local-rollout-adapter/release-rollout-smoke.test.ts
```

The Docker smoke builds the Knowledge Inbox image, starts a baseline container with a missing semantic index, starts a candidate container with a ready semantic index, records promote/rollback through M11 release tools, and verifies both capability boundaries.
