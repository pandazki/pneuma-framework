# Release Rollout 编写指南

**读者：** 正在连接 Host publish、restart 和 rollback flows 的 Developer  
**English version:** [release-rollout-authoring.md](./release-rollout-authoring.md)

release rollout helper 本身很小。本页把它们的精确 shape 写清楚，避免 Host 只能通过读源码重新发现。

## State 和 Instance 构造

始终通过 `createReleaseRolloutState()` 构造 rollout state：

```ts
import {
  createReleaseInstance,
  createReleaseRolloutState,
} from "@pneuma-framework/core";

const state = createReleaseRolloutState();

const candidate = createReleaseInstance({
  candidate_id: "dev-board-v1",
  image_tag: "dev-board:v1",
  data_dir: "/workspace/published/v1",
  url: "http://127.0.0.1:4101",
});
```

它会写入 `created_at_ms` 和 `updated_at_ms`。除非你正在加载已持久化 state，否则不要手写 partial state literal。

## Checks 使用 `at_ms`

Rollout checks 使用 Unix milliseconds：

```ts
{
  name: "health",
  status: "passed",
  message: "GET /health passed",
  at_ms: Date.now(),
}
```

它们不使用 `checked_at` ISO 字符串。

## Stage、Promote、Roll Back

`stageReleaseCandidate` 直接返回 next state：

```ts
const staged = stageReleaseCandidate(state, candidate, {
  reason: "publish v1",
});
```

`promoteReleaseCandidate` 和 `rollbackActiveRelease` 返回 transition envelope：

```ts
const promoted = promoteReleaseCandidate(staged, {
  reason: "candidate passed health checks",
});

if (!promoted.ok) {
  throw new Error(promoted.error);
}

const nextState = promoted.state;
```

Rollback 是同样的 envelope shape：

```ts
const rolledBack = rollbackActiveRelease(nextState, {
  reason: "operator requested rollback",
});
```

## Summary Shape

`summarizeReleaseRollout(state)` 返回当前 candidate ids、active URL 和 status：

```ts
{
  active_candidate_id: "dev-board-v1",
  candidate_candidate_id: undefined,
  previous_candidate_id: "dev-board-v0",
  active_url: "http://127.0.0.1:4101",
  status: "active",
}
```

如果你的 Host 需要 generated-app `version_id`，当前请把该映射保存在 Host state 中。`ReleaseInstance` 目前用 `candidate_id`、`image_tag` 和可选 runtime metadata 表达 rollout 层。
