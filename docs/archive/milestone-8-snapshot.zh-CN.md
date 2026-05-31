# Milestone 8 快照：Release Packaging Hardening

**日期：** 2026-05-02
**状态：** Docker release smoke 验证后闭合
**受众：** 0 预备知识团队成员
**范围：** M8 证明了什么、明确没有证明什么，以及下一步该压哪条边界。
**English version:** [Milestone 8 Snapshot](./milestone-8-snapshot.md)

## 摘要

M7 证明了 Builder 可以对真实 Build-phase Agent 提出的一个完整 capability proposal 做一次 approve。M8 问下一个更实际的问题：

> app 被演进出新能力之后，这个更新后的 app state 能不能变成 release artifact？

M8 闭合的是第一版 release boundary。演进后的 Knowledge Inbox workspace 现在会经过：

```text
governed Priority Queue evolution
  -> SQLite app.db
  -> build.manifest.json
  -> Docker image
  -> mounted /data volume
  -> release container
  -> /api/config rediscovery
  -> list_priority_queue API
  -> docker restart
  -> 同一个 capability 仍然可见
```

这还不是 rolling update。它不会把流量从旧版本切到新版本。它证明的是前置条件：Builder/Agent 演进出来的 app state 可以被打包，并作为一个可重启的 release container 运行。

## 改了什么

M8 新增一个 milestone example：

```text
examples/m8-release-packaging-hardening/
  release-packaging-smoke.test.ts
  release-packaging-smoke.sh
  seed-evolved-knowledge-inbox.ts
  assert-build-manifest.ts
  assert-release-capability.ts
  README.md
```

Smoke 准备的是 M5-M7 一直使用的 Priority Queue capability：

| Definition change | Release 期望 |
|---|---|
| `inbox_items.priority` column | release container 的 `/api/config` 暴露这个 column。 |
| `list_priority_queue` Operation | release 里 `GET /api/operations/list_priority_queue` 可用。 |
| `priority_queue` View | `/api/config.views` 包含这个 released View。 |
| View read PolicyRule | `/api/config.policy_rules` 包含这个 View 的 read rule。 |
| P1/P2/P3 rows | restart 前后，release API 都返回 demo priorities。 |

## Release Contract

M8 把 Knowledge Inbox 的 `build.manifest.json` 也纳入证明面：

```json
{
  "schemaVersion": 1,
  "entrypoint": "server/app.ts",
  "processes": {
    "web": {
      "command": "bun server/app.ts",
      "health": "/healthz"
    }
  },
  "data": {
    "volume": "/data",
    "sqlite": "/data/app.db"
  },
  "migrations": {
    "command": "scripts/migrate.sh",
    "direction": "up"
  },
  "deployHints": {
    "requiresMigration": true,
    "runtimeAgent": "none"
  }
}
```

关键边界是：app definition 仍然是 runtime governed data。Release image 不会为 Builder 创建的 Priority Queue 烘焙一份生成出来的 schema migration。它运行在 mounted SQLite `app.db` 上，由 runtime rediscovery 暴露演进后的 capability。

## Verification Report

Focused M8 release smoke：

```text
bun test examples/m8-release-packaging-hardening/release-packaging-smoke.test.ts

1 pass, 0 fail
```

这个 smoke 做了什么：

```text
scripts/migrate.sh
  -> seed evolved Knowledge Inbox through definition.apply_change_set
  -> scripts/build.sh
  -> assert build.manifest.json
  -> docker build templates/knowledge-inbox-core-domain/Dockerfile
  -> docker run with host data mounted at /data
  -> assert /healthz
  -> assert /api/config surfaces Priority Queue
  -> assert list_priority_queue returns P1/P2/P3
  -> docker restart
  -> assert the same surfaces again
```

本 snapshot 前其它检查：

```text
bun run typecheck -> pass
git diff --check -> pass
```

## 已证明

| Claim | Evidence |
|---|---|
| Builder-evolved app state 可以进入 release packaging | M8 seed 使用 governed `definition.apply_change_set` 在 release 前创建 Priority Queue。 |
| Release manifest 是真实 contract | `assert-build-manifest.ts` 校验 process、health、migration、volume、SQLite path、runtime-agent absence。 |
| Docker release 可以运行演进后的 app | Smoke build Knowledge Inbox Dockerfile，并挂载 `/data` 运行。 |
| Release 里 runtime rediscovery 成立 | container 内 `/api/config` 暴露 Priority Queue schema、Operation、View、PolicyRule。 |
| Release 里的 end-user API 可用 | `GET /api/operations/list_priority_queue` 返回 P1/P2/P3。 |
| Restart persistence 成立 | `docker restart` 后，health、config、API 断言仍然通过。 |

## 尚未证明

M8 不声称已经解决：

- 旧/新 app version 之间的 rolling traffic shift
- registry push 或 cloud deployment
- rollout 失败时自动 rollback
- online migration compatibility window
- 多 runtime 并发写同一个 SQLite volume
- production secret management
- production IAM
- release-mode Runtime Agent
- model planning reliability

这些属于 deploy platform 和 production operations 里程碑。M8 只 harden release artifact boundary。

## 战略解读

M3 证明了一个简单 Builder-created capability 可以穿过 SQLite 和 Docker restart。M5-M7 又把 app evolution loop 推近真实产品愿景。M8 把两条线重新接起来：

```text
M3: primitives can leave the demo room.
M5-M7: the real app can be evolved by Builder/Agent.
M8: the evolved real app can become a release artifact.
```

这是回到更大功能之前的一个重要信心点。项目现在已经有一条可信链路：governed creation -> release packaging。生产 rollout 仍然是未来工作，但 release artifact 这一层已经有证据。

## 推荐下一步

1. **Change-set recovery semantics**：决定 Builder approval 后某个 child mutation 失败时应该怎么恢复。
2. **Release rollout protocol**：定义 old/new release、health gate、traffic switch、rollback semantics。
3. **Semantic index return**：把 semantic retrieval 做成 derived capability；SQLite rows 继续是 source of truth。
4. **Protocol SDK polish**：把 M7 approval card 行为抽成可复用 SDK helpers。

我的建议：先做 change-set recovery semantics，再做 release rollout。M8 已经证明 release artifact confidence；下一个 correctness 风险仍然是 approval 之后 multi-step app evolution 部分失败怎么办。

