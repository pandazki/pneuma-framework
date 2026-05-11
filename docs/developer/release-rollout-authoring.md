# Release Rollout Authoring Guide

**Audience:** Developers wiring Host publish, restart, and rollback flows  
**Chinese version:** [release-rollout-authoring.zh-CN.md](./release-rollout-authoring.zh-CN.md)

The release rollout helpers are intentionally small. This page documents their exact shapes so Hosts do not need to rediscover them from source.

## State And Instance Construction

Always construct rollout state through `createReleaseRolloutState()`:

```ts
import {
  createReleaseInstance,
  createReleaseRolloutState,
} from "@pneuma-framework/core/release-rollout";

const state = createReleaseRolloutState();

const candidate = createReleaseInstance({
  candidate_id: "dev-board-v1",
  image_tag: "dev-board:v1",
  data_dir: "/workspace/published/v1",
  url: "http://127.0.0.1:4101",
});
```

This stamps `created_at_ms` and `updated_at_ms`. Do not hand-write a partial state literal unless you are loading persisted state.

## Checks Use `at_ms`

Rollout checks use Unix milliseconds:

```ts
{
  name: "health",
  status: "passed",
  message: "GET /health passed",
  at_ms: Date.now(),
}
```

They do not use `checked_at` ISO strings.

## Stage, Promote, Roll Back

`stageReleaseCandidate` returns the next state directly:

```ts
const staged = stageReleaseCandidate(state, candidate, {
  reason: "publish v1",
});
```

`promoteReleaseCandidate` and `rollbackActiveRelease` return a transition envelope:

```ts
const promoted = promoteReleaseCandidate(staged, {
  reason: "candidate passed health checks",
});

if (!promoted.ok) {
  throw new Error(promoted.error);
}

const nextState = promoted.state;
```

Rollback has the same envelope shape:

```ts
const rolledBack = rollbackActiveRelease(nextState, {
  reason: "operator requested rollback",
});
```

## Summary Shape

`summarizeReleaseRollout(state)` returns the current candidate ids, active URL, and status:

```ts
{
  active_candidate_id: "dev-board-v1",
  candidate_candidate_id: undefined,
  previous_candidate_id: "dev-board-v0",
  active_url: "http://127.0.0.1:4101",
  status: "active",
}
```

If your Host needs a generated-app `version_id`, store that mapping in Host state for now. `ReleaseInstance` currently keys the rollout layer by `candidate_id`, `image_tag`, and optional runtime metadata.
