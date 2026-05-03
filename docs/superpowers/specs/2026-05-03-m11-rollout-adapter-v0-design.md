# M11 Design: Rollout Adapter v0

**Date:** 2026-05-03  
**Status:** Draft design direction after M10 closure  
**Scope:** define the first candidate-to-active release primitive without pretending to be a full production deployment platform.

中文摘要：

> M11 要补上 M9/M10 之后缺失的一段：一个 release candidate ready 之后，framework 如何把它 stage、verify、promote 成 active release，并且在需要时 rollback 到 previous active release。第一版只做 local Docker rollout adapter，不做云部署、不做 registry、不做稳定域名流量切换；重点是把 rollout 的语义、证据和 agent-facing tool surface 定义清楚。

## Why M11 Now

M8 proved that a Builder/Agent-evolved app can be packaged as a Docker artifact with SQLite volume persistence. M9 proved an approved creation flow can reach release-candidate readiness or fail with recovery evidence. M10 proved the app can gain a visible semantic capability while preserving a derived-index boundary.

The missing link is now explicit:

```text
approved app evolution
  -> release candidate ready
  -> stage candidate release
  -> verify candidate health/config/API
  -> promote candidate to active release
  -> rollback to previous active release when needed
```

Without M11, the project still stops at “we built something ready”. It does not yet answer “what does the framework mean by releasing the new app?”

中文：

M11 不是为了做一个生产级部署系统，而是为了让团队第一次看到：Pneuma 的 release 不是脚本成功退出，而是一套可被 agent 理解、可审计、可回滚的 framework 状态转换。

## M11 Thesis

M11 should prove:

> A ready release candidate can enter a governed rollout state machine where stage, promote, status, and rollback are semantic framework actions, while Docker remains only the first local adapter.

Milestone name:

```text
M11 — Rollout Adapter v0
```

## Non-Goals

M11 intentionally does **not** implement:

- production traffic routing;
- cloud provider deployment;
- Docker registry publishing;
- multi-region or zero-downtime rollout;
- Qdrant/Postgres rollout;
- daemon supervision or automatic healing.

M11 v0 records an active release URL and verifies that URL. A later platform adapter can put a stable hostname or reverse proxy in front of the same semantic state.

中文：

第一版不要把 local Docker adapter 包装成“生产发布”。它只是第一个可运行、可测试的 adapter。真正重要的是 `candidate -> active -> previous -> rollback` 这条语义链路。

## Release Slot Model

M11 introduces three release slots:

| Slot | Meaning |
|---|---|
| `active` | The release currently considered live by framework state. |
| `candidate` | A staged release under verification or ready for promotion. |
| `previous` | The release that was active before the latest promotion, used for rollback. |

Each slot points to a release instance:

```ts
interface ReleaseInstance {
  candidate_id: string;
  image_tag: string;
  data_dir?: string;
  container_name?: string;
  url?: string;
  status: "created" | "starting" | "healthy" | "unhealthy" | "stopped";
  checks: ReleaseRolloutCheck[];
  created_at_ms: number;
  updated_at_ms: number;
}
```

Promotion is a state transition:

```text
candidate(healthy) + active(existing)
  -> previous = old active
  -> active = candidate
  -> candidate = undefined
```

Rollback is also a state transition:

```text
previous(healthy) + active(existing)
  -> active = previous
  -> previous = old active
```

The v0 model uses immutable transition helpers so tests can prove failed promotion does not partially mutate the previous state.

## Local Docker Rollout Adapter

The first adapter stages releases by running Docker containers from a local image tag and mounted data directory:

```text
release.stage
  -> docker run candidate container on a host port
  -> GET /healthz
  -> GET /api/config
  -> optional capability API checks
  -> store candidate slot evidence
```

For M11, active release identity is the recorded `active.url`. This is enough to demonstrate promotion and rollback without introducing a reverse proxy. The adapter must keep evidence of:

- candidate id;
- image tag;
- data volume path;
- container name;
- URL;
- check names and pass/fail status;
- promotion and rollback timeline.

## Framework Semantic Tools

M11 adds release tools to the framework registry:

| Tool | Purpose |
|---|---|
| `release.status` | Read current active/candidate/previous release state. |
| `release.stage` | Record or stage a candidate release through the configured adapter. |
| `release.promote` | Promote a healthy candidate to active. |
| `release.rollback` | Swap previous release back into active. |

The Build-phase Agent should call these tools instead of invoking Docker or shell scripts directly. The local adapter can still use Docker internally.

中文：

Agent 的心智模型应该是“我要 stage/promote/rollback release”，不是“我要 docker run 某个容器”。这延续了 lifecycle 和 definition.apply 的原则：脚本和 Docker 都是实现细节。

## Knowledge Inbox Demonstration

The M11 demo should use Knowledge Inbox because the team already understands it from M4-M10.

Recommended story:

```text
1. Previous active release exists with normal inbox data but no ready semantic index.
2. Candidate release uses the same app image plus a prepared data volume where semantic index is rebuilt.
3. Candidate is staged and verified.
4. Promotion makes candidate the active URL; semantic search is ready.
5. Rollback restores previous active URL; semantic search returns missing/stale evidence again.
```

This does not pretend that code-version rollout is solved. It proves the release slot semantics and Docker/volume release boundary. Future milestones can use a true old/new image pair when template code evolution needs that pressure.

## Success Criteria

M11 is closed when:

- core rollout state has TDD coverage for stage, failed promote, promote, rollback, and timeline evidence;
- file-backed rollout store survives process restart;
- framework tool registry exposes `release.status`, `release.stage`, `release.promote`, and `release.rollback`;
- local Docker rollout smoke stages candidate, promotes it, validates active semantic capability, rolls back, and validates previous capability boundary;
- English and Chinese milestone snapshots explain exactly what M11 proves and what remains out of scope.

## Open Follow-Ups After M11

- Stable active endpoint adapter: reverse proxy or platform traffic switch.
- Cloud rollout adapter: Fly/Render/Vercel/Docker registry.
- Multi-service app release graph.
- Rollout authorization policy separate from definition mutation policy.
- Automatic rollback on failed post-promote health checks.
