# ADR-0016: Dev = Prod 的可丢弃快照沙箱，数据线性单分支

**Status**: Accepted
**Date**: 2026-04-23
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: lifecycle, data-model, dev-mode, security

---

## Context

[Pressure test E8](../pressure-test/e-scenarios.md) 揭示了框架级漏洞：当前 v0 实现靠"巧合"做到 dev/release 数据隔离——workspace 的 `.pneuma-data/` 和 docker volume `/data` 碰巧不是同一个物理文件，但没有任何 ADR 或契约强制这件事。

这带来的后果：

- 任何 dev.sh 的配置错误（比如 `PNEUMA_WORKSPACE=/data`）都会让两者共用 DB
- Dev 里 Builder 调 Linear write-back 直接改真实外部系统
- "dev 里做实验会不会影响 prod" 这个问题每个模板都要自己回答——注定漂移

与此同时，[ADR-0001 archetype scope](./0001-archetype-scope.md) 承诺支持到 archetype D（白标平台），这要求 dev/prod 之间的数据隔离概念能自然扩展到**多租户**、**多环境**场景。

相关的 DX 痛点：Builder 要测试新功能，**怎么获得真实数据**？v0 靠捏造 fixture 或凭经验，都不合 Builder 对话式工作流的精神。

---

## Options considered

### Option A: 严格物理隔离（两个独立 DB）
Dev 有自己的 DB，Release 有自己的 DB，之间无直接关联。Builder 通过手动导出/导入获得 dev 数据。

- **Pro**: 实现最简
- **Con**: Builder 要么用合成 fixture（不真实），要么自己写 snapshot 脚本（工程化负担）

### Option B: 单 DB + mode 标记每行
每行带 `_mode: "dev" | "release"` 字段，查询自动 filter。

- **Pro**: 统一存储
- **Con**: 字段容易漏写；查询 overhead；不解决外部 adapter 副作用

### Option C: Dev = Release 的 copy-on-write overlay
Release 是主库；Dev 作为写时复制的 overlay。"promote" 把 overlay 合并回 release。

- **Pro**: 支持 staging 式持续演进
- **Con**: 实现复杂（CoW、冲突解决）；Builder 心智负担重（什么时候 overlay / 什么时候合并）

### Option D: 多 environment 正式化
`env` 作一级概念：dev / release / staging / preview / per-tenant...

- **Pro**: 对应未来 archetype C/D 的完整形态
- **Con**: MVP 阶段给 Builder 塞 "env 矩阵" 概念过重

### Option E（最终选择）: Dev = Prod 的可丢弃快照沙箱
Builder 作为 app superadmin 天然能访问全量 prod 数据。**Dev session 开始时从 prod 拉 snapshot，session 里的任何副作用都被 contained 在 dev DB**；Builder 可随时 refresh 重新 snapshot。

- **Pro**: Builder 体验：自动拿真数据真权限；概念最少（prod 真 / dev 玩具箱）；保护来自 containment 而非 permission；自然扩展到 archetype D（per-tenant 的 prod + dev 仍然是同一个 pattern）
- **Con**: 大规模 prod DB 的全量 snapshot 成本高（post-MVP 需 incremental）；adapter 副作用需要额外 dry-run 保护

---

## Decision

采用 **Option E** — Dev = Prod 的可丢弃快照沙箱。

### 4 条不变量

1. **Prod 是唯一事实源**——所有真实数据驻留在 prod
2. **Dev = 一次性可丢弃沙箱**——dev 里发生的数据 mutation 永不流回 prod
3. **Schema / policy / code 从 dev → prod 经 `deploy` 单向推进**
4. **数据从 prod → dev 经 `snapshot` 单向拉取**

### 线性版本历史原则（核心约束）

**任何 dev session 都从 prod 的某一个具体版本开始**：

- 默认 = 最新的 prod 版本
- 要针对旧版做修改 → **必须先把 prod 回滚到该旧版**，再开 dev session
- **不允许两个 dev session 分别建立在 prod 的不同版本上**——防止数据和代码分叉

这条原则的后果：

- 同一时间只有一个"当前 prod 版本" + 一个"当前 dev 沙箱"
- Builder 不需要掌握 git 式的分支 / 合并 / cherry-pick 心智
- Hot-fix 旧版 = 回滚 + 修 + 重新部署（archetype A/B 可接受；archetype C/D 需要"hot-fix branch"扩展，post-MVP）
- 直接决定了 [ADR-TBD: Rollback data semantics](./) 的半边——rollback 是 destructive 的，不保留中间版本数据

### 快照内容

| 类型 | 快照？ | 备注 |
|---|---|---|
| Stored tables | ✅ 全量拷贝 | 真数据真行数 |
| AdapterBacked tables | ❌ 不拷（live 查询） | Dev 下仍通过 adapter 实时访问 |
| Policies | ✅ 拷贝 | Dev 改 policy 不影响 prod |
| Users / Roles / Memberships | ✅ 拷贝 | Dev 需要真实 user 集合来演练权限 |
| Audit events | ❌ 不拷 | Audit 属于 prod 历史，dev 不携带 |
| Secrets | ❌ 不拷（但可 link，见下） | |

### Dev DB 生命周期

```
pneuma dev            → 若无 dev DB，auto-snapshot prod 到 $WORKSPACE/.pneuma-dev/
                        若有 dev DB，继续使用（Builder 的工作连续）

pneuma dev --refresh  → 重新 snapshot prod（丢弃所有 dev 副作用）

pneuma dev --reset    → 清空 dev DB（不 snapshot，空库进入 dev）

pneuma deploy         → schema/policy/code delta 推到 prod
                        dev DB 保留，下一次 pneuma dev 从保留状态继续
                        （想让 dev 状态跟新 prod 同步 → 加 --refresh）
```

### Adapter 副作用处理

默认在 dev 模式下，adapter 的 `insert / update / delete` 操作**被 framework 拦截为 dry-run**：

- 调用参数被记录到 `agent` event（带 `dry_run: true` 标记）
- Adapter 的实际 HTTP / API 调用**不发生**
- Viewer 里看到 "模拟写成功"——但标注"此操作在 prod 部署后才真实生效"

Builder 显式 opt-out 要配置 per-adapter：

```yaml
adapters:
  - id: linear
    dev_mode_writes: true   # 显式：这个 adapter 的 dev-mode 写回要真调 Linear
```

此配置需在 viewer 里有明显视觉警示（比如小红点），提醒 Builder "dev 写是真写"。

### Secret Store 与 Per-env Credentials

Secret store 按 env 分离，目录级：

```
$WORKSPACE/
  .pneuma-prod/
    secrets.sqlite        # prod secrets（加密）
  .pneuma-dev/
    secrets.sqlite        # dev secrets（加密）
    db.sqlite             # dev snapshot
```

Per-adapter 可声明 dev 是否 **link from prod**：

```yaml
adapters:
  - id: openrouter
    credential_mode: shared
    dev_credential: { link_from: prod }   # dev 共用 prod 的 OpenRouter key

  - id: linear
    credential_mode: per-user
    dev_credential: { link_from: null }   # dev 独立——Builder 要单独 OAuth（推荐连 Linear sandbox 账号）
```

**Default policies**：

- **读多写少的 LLM / 无副作用**类 adapter（OpenRouter, Jina, OpenAI embeddings）→ 推荐 `link_from: prod`
- **有副作用**类（Linear / GitHub / Notion / Google Drive）→ **默认 `link_from: null`**，Builder 必须显式 link 才会共享 token

### Deploy 时的数据迁移语义

Deploy 时：

1. Schema / policy / code 的 delta 被推到 prod
2. 数据迁移 transformer 应用在 **prod 当前数据上**（不是 snapshot 时的数据——prod 在 dev session 期间可能有 concurrent 写入）
3. Transformer 必须 **idempotent 且能处理 "snapshot 之后 prod 新增的行"**（依赖 [ADR-0002 storage](./0002-storage-typed-cells.md) 的 transformer 性质）

如果 Builder 的 schema 变更基于 snapshot 时刻的假设（例如"这个表里没有 type=foo 的行"），而 prod 后来真的出现了 type=foo 的行，migration 就会出 bug。这是 Builder 心智模型的责任——agent 在 deploy 前可以提醒 Builder "snapshot 以来 prod 新增了 X 条数据，你的 schema 变更是否能处理"。

---

## Consequences

### Positive
- **Builder 体验**：真数据真权限的 dev 沙箱，无需造 fixture
- **框架级 containment 保证** dev mutation 不污染 prod
- **概念最少**：不引入 env 矩阵；Builder 只有 "prod 真 / dev 沙箱" 两个
- **天然扩展到 archetype D**：白标平台下 "per-tenant prod + per-tenant dev" 是相同的 pattern（tenant 作为隐式 prod 边界）
- **与 [ADR-0001](./0001-archetype-scope.md) 约束 1（D 留门）对齐**：线性历史原则不排斥未来的多环境/多分支扩展
- **简化了 rollback 决策**：线性单分支意味着 rollback 就是"把 prod 在时间轴上往回走"，无分支合并复杂度

### Negative / Risks
- **大型 prod DB 全量 snapshot 的性能** - MVP 接受；大规模时需要 "incremental snapshot / sampling"（post-MVP）
- **线性历史原则限制 hot-fix 老版本场景** - archetype A/B 可接受；archetype C/D 需要"hot-fix branch"扩展（post-MVP）
- **Adapter per-user credential 在 dev 独立**意味 Builder 要多 OAuth 一次——DX 摩擦但换数据安全，值得
- **Snapshot 的时刻语义** - deploy 时数据已漂移，依赖 transformer 健壮性；Builder 需要被 agent 提醒这个窗口

### Follow-ups
- [ADR-TBD: Rollback data semantics](./)（高优先级，与线性历史原则强耦合）
- [ADR-TBD: Checkpoint within dev](./)（dev 内部细粒度 undo，与 shadow-git 整合）
- **ADR-TBD: Incremental / sampling snapshot**（大规模 prod DB 的 snapshot 策略）
- **ADR-TBD: Hot-fix branch**（archetype C/D 下从旧版本 fork dev 的扩展语义）
- **ADR-TBD: Multi-builder collaboration**（team 内多人同时 dev 的冲突处理）
- 进 `open-questions.md`：dev session 的"超长寿命"问题（Builder 一个月不 refresh，dev 跟 prod 漂移到不兼容怎么办）
