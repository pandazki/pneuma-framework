# ADR-0017: Rollback 数据语义 — Destructive 时间倒流 + 强制如实披露

**Status**: Accepted
**Date**: 2026-04-23
**Last amended**: 2026-04-24（v1 落地蓝本：借 ToolJet `app_history` schema；详见文末 Amendments）
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: lifecycle, data-model, disclosure, rollback

---

## Context

[ADR-0016 Dev = Prod 快照沙箱](./0016-dev-prod-data-isolation.md) 里确立了一条**线性单分支**原则：prod 是单一时间线，dev 是从 prod 某一点派生出的可丢弃沙箱。这条原则让 rollback 的语义空间极大收缩——没有分支合并，rollback 就是"把 prod 在时间轴上往回走"。

但还有几个必须回答的核心问题（来自 archived pressure test E9；git history: `git show 107ec17:docs/architecture/pressure-test/e-scenarios.md`）：

- Rollback 是 **destructive**（时间真倒流，数据跟着回滚）还是 **preserving**（数据保留，只回滚代码）？
- 反向 migration transformer 如何生成？可逆和不可逆变更怎么区分？
- Rollback 粒度——能回到任意历史版本还是只能上一版？
- Rollback 由谁可触发？

Pandazki 在讨论中确立的**根本原则**：rollback 不是技术问题，是**如实告知 Builder 和 agent** 的问题。任何 rollback 动作发生前，Builder 必须清楚地知道 **具体会失去什么、哪些动作不可恢复、哪些外部副作用已经发生**。

这条原则比任何实现选择都更重要——它直接决定了本 ADR 的骨架是"**一份强制性的 impact disclosure 流程**"，而不是"一套巧妙的 migration reversal 算法"。

---

## Options considered

### Option A: Preserving rollback（代码回退、数据保留）
V2 → V1 时，代码/schema 回到 V1，但数据库不动（tags 列保留、V2 期间新增行保留）。

- **Pro**: 最不伤人；数据永远不丢
- **Con**: V1 代码跑在带 V2 痕迹的 DB 上，是**逻辑撕裂**状态；再 forward 到 V2 时数据怎么处理模糊（迁移还是重用？）；违反线性历史原则

### Option B（最终选择）: Destructive rollback（时间真倒流）+ 强制 impact 披露
V2 → V1 时，**schema / policy / code / data 一起回到 V1 状态**。破坏性由"pre-rollback snapshot"兜底 + agent 如实披露 + Builder 显式确认三道防线保护。

- **Pro**: 逻辑一致（V1 状态就是 V1 状态）；符合线性历史；"如实告知 + 可复原"比"隐藏代价"更诚实
- **Con**: 实现需要反向 transformer + 自动 snapshot 机制；大表 snapshot 有性能代价

### Option C: Hybrid per-change
让 Builder 对每个 schema 变更声明"是否可 rollback"——可 rollback 的走 destructive，不可 rollback 的走 preserving。

- **Pro**: 灵活
- **Con**: 心智负担翻倍；Builder 要理解"这条变更该标 destructive 还是 preserving"，违反对话式精神

---

## Decision

采用 **Option B**——destructive rollback + 强制披露 + 自动 snapshot 兜底。

### 核心契约：如实披露（Impact Disclosure）

**任何 rollback 动作前**，framework 必须计算并呈现一份具体的 **Impact Report**，包含 5 个维度：

```typescript
interface RollbackImpact {
  // 基本信息
  from_version: string;              // 当前 prod 版本
  to_version: string;                // 目标回滚版本
  elapsed_time: string;              // "v2 已运行 5 天"

  // 1. 代码变更（文件级 diff）
  code_changes_reverted: Array<{ file: string; lines_added: number; lines_removed: number }>;

  // 2. Schema 变更（结构级）
  schema_changes: {
    columns_dropped: Array<{ table: string; column: string; type: CellType; affected_rows: number }>;
    columns_added_back: Array<{ table: string; column: string; type: CellType }>;  // V1 曾有但 V2 删掉的
    type_changes: Array<{ table: string; column: string; from: CellType; to: CellType; lossy: boolean }>;
    tables_dropped: Array<{ table: string; row_count: number }>;
    tables_recreated: Array<{ table: string }>;
  };

  // 3. Policy 变更
  policy_changes: { rules_removed: number; rules_reverted: number; default_posture_changes: number };

  // 4. 数据增量（V2 期间的数据变化）
  data_deltas: {
    rows_created_since_v2: Array<{ table: string; count: number; will_be_deleted: true }>;
    rows_updated_since_v2: Array<{ table: string; count: number; will_revert_to_v2_state: true }>;
    rows_deleted_since_v2: Array<{ table: string; count: number; will_be_restored: true }>;
  };

  // 5. 外部副作用已发生但不可撤回的
  irreversible_external_effects: Array<{
    adapter: string;
    operation: "insert" | "update" | "delete";
    external_ids: string[];                  // 这些 Linear issue / GitHub PR 已经改了，rollback 不撤外部系统
    first_occurred: number;
  }>;

  // 6. 不可自动反向的变更
  unrecoverable_operations: Array<{
    kind: "type-change-lossy" | "merged-columns" | "custom-transformer-no-reverse";
    description: string;                     // "V2 里 published_at 从 Date 改成 Text，原始毫秒精度已失去"
  }>;

  // 7. 兜底
  pre_rollback_snapshot_path: string;        // 自动 snapshot 的位置，如 .pneuma-prod-snapshots/2026-04-23T15-30-00/
}
```

### Agent 的 NL 翻译责任

Agent 收到 `RollbackImpact` 后，必须翻译成**人类可读的自然语言**呈现给 Builder，不能只显示 JSON。示例：

```
你要把 ai-bookmarks 从 v2 回退到 v1（v2 已运行 5 天）。具体影响：

🟢 代码回退：4 个文件共 127 行改动被撤回（server/interpret.ts / viewer/App.tsx / ...）

🟡 Schema 回退：
  • 删除字段 bookmarks.tags（影响 127 行现有数据）
  • 字段 bookmarks.published_at 类型从 RichText 回到 Text
  • 删除表 notes（含 23 行）

🔴 数据损失：
  • v2 期间新增的 37 条 bookmark 将被删除
  • v2 期间修改的 12 条 interpretation 将被回退到 v2 前的值

⚠️ 不可撤回的外部副作用：
  • 过去 5 天通过 Linear adapter 标记为 done 的 8 个 issue —— Linear 那边的状态不会被 rollback 触达

💾 自动兜底：完整的 pre-rollback snapshot 保存在
   .pneuma-prod-snapshots/2026-04-23T15-30-00/
   （如果 rollback 后你改主意，可以从这里手工恢复）

🚨 需要你明确确认才继续。输入 "yes, rollback" 执行，或 "no" 放弃。
```

这段披露**不是可选提示**而是**强制门禁**——framework 的 `rollback()` API 在执行前必须先调 `computeImpact()` + 要求确认，不能有 "quiet rollback" 路径。

### Destructive 执行路径

确认后的执行顺序：

```
1. [Atomic] 写入 pre-rollback snapshot (全库 dump 到 .pneuma-prod-snapshots/<ts>/)
2. [Atomic] 写入 rollback audit event (verb: rollback, impact: RollbackImpact, confirmed_by, ts)
3. 逆序应用反向 transformer 到 prod DB:
   - 对 V2 期间 INSERT 的行 → DELETE
   - 对 V2 期间 UPDATE 的行 → 恢复 V2 前值（需要 ADR-0013 mutation event 的 diff 字段作为恢复源）
   - 对 V2 新增的 column → DROP
   - 对 V2 修改类型的 column → 反向 transformer 执行（或标 lossy 丢数据）
4. 更新 prod 的 version 指针到 V1
5. 重启 prod 服务 (docker restart / systemd reload)
6. [Atomic] 写入 rollback-completed audit event
```

每一步失败都会触发 `fallback`：从 pre-rollback snapshot 恢复 prod 到 rollback 开始前状态，写 `rollback-failed` audit event。这是安全网的核心价值。

### 反向 Transformer 的自动推导规则

| Schema 变更 | 自动可反向？ | 说明 |
|---|---|---|
| 加字段 + 默认值 | ✅ | 反向 = drop column |
| 删字段 | ✅（如果 V1 有记录该字段的 schema） | 反向 = add column + 从 pre-rollback snapshot 或 event diff 恢复数据 |
| 重命名字段 | ✅ | 反向 = 重命名回去 |
| 改类型（lossless，如 Text → RichText） | ✅ | 反向 = 改回原类型 |
| 改类型（lossy，如 Number → Text） | ⚠️ 需 Builder 显式写反向 transformer | 否则标 `destructive: true` |
| 拆字段（a → a + b） | ⚠️ 需显式反向 | 合并 a + b → a 可能丢信息 |
| 合字段（a + b → c） | ⚠️ 需显式反向 | 拆 c → a + b 信息不足 |
| 加 Table | ✅ | 反向 = drop table |
| 删 Table | ✅（如有 pre-rollback snapshot） | 反向 = recreate + 从 snapshot restore |
| Custom transformer（prompt-based） | ⚠️ 需显式反向 prompt | 否则标 destructive |

**标记为 `destructive: true` 的变更**：
- Builder 在 dev 里做此变更时 agent 必须提示"此变更不可自动 rollback"
- Deploy 时 framework 在 build.manifest 里记录这些 destructive markers
- Rollback 时这些变更出现在 `unrecoverable_operations` 里，披露给 Builder

### Rollback 粒度（MVP）

MVP 只支持 **rollback to immediately previous deploy**（V2 → V1 可以，V5 → V2 需要连续 3 次 rollback）。

Post-MVP 可扩展：
- 任意历史 rollback（V5 → V2 一步到位，但要累计多版本 transformer）
- Point-in-time recovery（到任意时刻，需要更重的备份机制）

### Rollback 的触发入口

- ✅ **Build-phase Agent dialog**（Builder 对话里说"回退到上一版"→ agent 调 `framework.rollback()` 经披露流程）
- ✅ **CLI**：`pneuma rollback` 命令（自动显示披露，交互式确认）
- ❌ **Viewer 上没有 End User 可见的 Rollback 按钮**（太危险）
- ❌ **HTTP API 没有匿名 rollback 入口**（必须通过 Build-phase agent 或 CLI）

### 与 [ADR-0016](./0016-dev-prod-data-isolation.md) 的互动

- Rollback 只作用于 prod；dev DB 不动
- Rollback 后，下次 `pneuma dev` 若带 `--refresh`，dev 从 rolled-back 的 prod 重新 snapshot（拿到 V1 状态）
- Dev 开放时做了一半的实验，若 prod 被 rollback 到更早版本，dev 的变更基 base 失效——agent 应提示 Builder "prod 已被 rollback，你的 dev 变更基于过时版本，建议 refresh"

### 审计事件

Rollback 全程产生以下 audit events：

```
rollback-requested    (ctx, impact summary, status: "awaiting-confirmation")
rollback-confirmed    (ctx, confirmed_by, pre_snapshot_path)
rollback-started      (ctx, started_ts)
rollback-completed    (ctx, ended_ts, duration_ms, impact)
OR
rollback-failed       (ctx, failed_at_step, error, restored_from_snapshot: true/false)
```

全部属于 [ADR-0014](./0014-audit-subset.md) 的 audit subset（`audit: true`），独立 sink 通路。

---

## Consequences

### Positive
- **透明性**：Builder 和 agent 都能 100% 清楚看到 rollback 的具体影响，没有"黑盒撤回"
- **安全网**：pre-rollback snapshot 让"改主意"有出路
- **一致性**：destructive + 线性历史，不会出现"V1 状态却有 V2 数据"的撕裂情况
- **Agent 的 NL 翻译强制**——每次 rollback dialog 都复用 [ADR-0008](./0008-nl-bidirectional.md) 的"双向翻译"能力
- **Audit 闭环**：rollback 本身是 first-class audit event 序列，合规可验证

### Negative / Risks
- **Pre-rollback snapshot 是全库 dump** —— 大表部署频繁会产生很多重型 snapshot。MVP 接受，post-MVP 用 incremental snapshot 优化
- **不可撤回的外部副作用披露但不解决** —— Linear adapter 写回的 issue state 不会因 rollback 回滚。这是**外部系统的本质限制**，只能通过披露让 Builder 知情
- **反向 transformer 的自动推导** —— 简单变更可靠，复杂变更（custom prompt、多步 transformer）需 Builder 显式提供反向。Builder 初次写 schema 时 agent 应主动问"这个变更可不可逆"
- **Lossy 变更的警告疲劳** —— 如果每次都弹警告，Builder 可能习惯性点 yes。缓解：destructive 变更在 dev 阶段就清晰提醒，部署到 prod 时已经是 Builder 清醒决策
- **Snapshot 空间累积** —— `.pneuma-prod-snapshots/` 会越来越大。MVP 手动清理，post-MVP 加 retention policy

### Follow-ups
- [ADR-TBD: Incremental snapshot](./) — 大规模 prod DB 的 pre-rollback snapshot 优化（与 [ADR-0016](./0016-dev-prod-data-isolation.md) follow-up 合并）
- [ADR-TBD: Snapshot retention policy](./) — `.pneuma-prod-snapshots/` 的清理策略
- **ADR-TBD: Transformer reversal composition** — 多个 transformer 链式 + 反向如何编排
- **ADR-TBD: Cross-adapter side-effect tracking** — 更精确地枚举"已对外部系统造成的影响"
- 进 `open-questions.md`：Rollback 过程中 End User 的活动（并发写入）如何处理——MVP 假设 rollback 时服务短暂停机（几秒），post-MVP 考虑 graceful
- 进 `open-questions.md`：Rollback 是否应该要求 audit reader 权限的第二人审批（特别是 archetype D）

---

## Amendments

### 2026-04-24 — v1 落地蓝本：借 ToolJet `app_history` 的 snapshot+delta+retention schema

**触发**：archived ToolJet 深度调研（git history: `git show 0fd26ee:docs/architecture/research/tooljet-analysis.md`）发现 ToolJet 已有一个生产级 rollback 存储 schema，且带 AI-native 需要的 `is_ai_generated` 字段。原 decision 停留在"shadow-git + 时间倒流"的**术语层**——没有定义具体存储媒介 / snapshot 频率 / retention 算法 / payload 字段约束，实现者不知道从哪下手。ToolJet 这套跑了两年没大问题，可直接借鉴，省 v1 自己设计的 1-2 周。

**Decision**：pneuma 的 rollback 存储 v1 采用 ToolJet `app_history` 的结构，叠加 AI-native 必需字段。MVP 落地为 SQLite 表（Postgres 等价），schema 如下：

```typescript
interface AppHistoryRow {
  id: string;                       // ULID
  app_id: string;
  version: number;                  // 连续递增
  history_type: "snapshot" | "delta";
  payload: unknown;                 // snapshot: object；delta: JSON-Patch (RFC 6902) array
  parent_snapshot_version?: number; // delta 时指向所依赖 snapshot 的 version
  is_ai_generated: boolean;         // 此次变更是否由 build-phase agent 发起
  actor_id: string;                 // user_id（Builder 或 Agent）
  actor_kind: "builder" | "agent" | "framework";
  description?: string;             // 自然语言描述（agent 生成 / builder 输入）
  operation_scope?: string[];       // 变更影响到的 resource id（table/op/policy/...）
  created_at: number;
}
```

**存储契约**：

1. **snapshot_frequency = 10**（可配，默认值）：每 10 次变更落一次完整 snapshot；中间 9 次是相对前一次 snapshot 的 JSON-Patch delta。
2. **retention_buffer_limit = 11 组（即 110 行）**：保留最近 N 组 snapshot+deltas；**老组整组 prune**（避免悬空 delta 指向已删 snapshot）。
3. **DB-level CHECK 约束**（绕不开、[ADR-0012](./0012-agent-permissions.md) sandbox 的底线防线）：
   - `history_type = 'snapshot'` ⟹ `payload` 是 object
   - `history_type = 'delta'` ⟹ `payload` 是 JSON-Patch array
   - `history_type = 'delta'` ⟹ `parent_snapshot_version` 非空且指向存在的 snapshot
4. **恢复协议**：
   - 找到目标 version 依赖的 snapshot version
   - 加载该 snapshot
   - 顺序 apply snapshot→target 之间的所有 delta
   - 按本 ADR 原 [Impact Disclosure](#核心契约如实披露impact-disclosure) 计算 impact + 获取 Builder 确认
   - 确认后原子执行 + 写 audit event

**为什么直接借用而非自创**：
- ToolJet 生产跑了两年（见 `server/src/modules/app-history/constants/index.ts:43-55`、`server/src/entities/app_history.entity.ts:17-67`）
- JSON-Patch（RFC 6902）是行业标准，无需 git 库依赖
- snapshot+delta+retention 的 memory/storage 权衡已被验证
- `is_ai_generated` 字段 ToolJet 已有，说明"AI 变更作为一等维度"是成熟模式

**相对 ToolJet 的增量（pneuma 独有字段）**：
- `actor_kind = "agent" | "builder" | "framework"` 三档区分
- `operation_scope: string[]`——来自 [ADR-0018 Operation primitive](./0018-operations-as-primitive.md) 的 `affects` 声明，让 rollback 的 impact 计算能精确到"这次回滚影响哪些 operation id"
- `description`——可直接复用 [ADR-0018 `impact.disclosure_template`](./0018-operations-as-primitive.md) 渲染结果

**对原 decision 的关系（重要）**：

本 amendment 把 "pre-rollback snapshot 作为兜底" 的**粒度**做了分层：
- **细粒度（新）**：`app_history` 表做 build-phase 过程中的细粒度 checkpoint。Builder 改一条 policy、加一个 column，每一步都是一个 history row。rollback 默认从这里来。
- **粗粒度（原）**：`.pneuma-prod-snapshots/` 目录仍然存在——作为**deploy 前的事务性全量 snapshot**，每次 deploy 落 1 份。两种情况用它：(1) `app_history` 链断了（磁盘坏 / retention 切掉）时的**最后安全网**；(2) "全 app 一步回到上一个 released 版本" 的粗粒度 rollback。

两套共存不冲突。MVP 可以只实现 `app_history`；`.pneuma-prod-snapshots/` 在首次 deploy 才做。

**落地影响**：
- 之前两条 follow-up（`Incremental snapshot` 和 `Snapshot retention policy`）的一半问题被本 amendment 吸收掉——snapshot+delta 天然就是 incremental；retention 就是 `retention_buffer_limit` 常量。
- 剩余 follow-up：大规模 prod DB 的"事务性全量 snapshot"（粗粒度那一层）的优化路径。

**关联**：
- [ADR-0012 Agent permissions](./0012-agent-permissions.md)：DB CHECK 约束是 prompt-injection 防线的最后一层
- [ADR-0014 Audit subset](./0014-audit-subset.md)：`is_ai_generated` + `actor_kind` 对齐 audit event schema；每条 app_history 行也 emit 一个 audit event
- [ADR-0018 Operation primitive](./0018-operations-as-primitive.md)：要求 Operation 执行时输出 `affects` 信息给 `operation_scope`
- **代码证据**（ToolJet commit `8ce1dcc`）：
  - `server/src/modules/app-history/constants/index.ts:43-55` — snapshot_frequency / retention_buffer_limit
  - `server/src/modules/app-history/repository.ts:109-184` — save/restore 实现
  - `server/src/entities/app_history.entity.ts:17-67` — entity schema + CHECK 约束

### 2026-04-25 — `app_history` 首次被激活写入（Phase 3 P1）

**触发**：Phase 3 P1（"True App Definition Change"）引入 framework-injected Operation `add_table_column`，每次成功调用都会往 `app_history` 写一条 snapshot。在此之前 `app_history` schema 已就绪（2026-04-24 amendment）但从无 Operation 写过一行。P1 是第一条真写路径。

**Decision**：

1. **P1 只写 snapshot**：payload shape 固定为 `{ kind: "pneuma_table_columns_snapshot", rows: [<所有 pneuma_table_columns entries after this write>] }`。delta / JSON-Patch 路径等真的跑到 `SNAPSHOT_FREQUENCY = 10` 再启用。
2. **attribution 从 PermissionContext 推导**：
   - `actor_id` = `ctx.user?.id ?? "anonymous"`
   - `actor_kind` = `"agent" | "builder" | "framework"` 依 `ctx.invoked_via` 映射（agent → agent；system → framework；其它 → builder）
   - `is_ai_generated` = `actor_kind === "agent"`
   - `operation_scope` = `[`table:<id>`, "operation:add_table_column"]`
   - `description` = 自然语言（handler 拼 `"Added column '<name>' to table '<id>'"`）
3. **未来 destructive rollback 流程（ADR-0017 原 decision）仍是目标**：P1 只激活 write path，restore / rollback / impact disclosure 还没跑到。P2 `definition.apply` 加 restart orchestration；真 rollback 入口留给 P3 或专门 ADR。

**Follow-up**：
- delta 路径（RFC 6902 JSON-Patch）首次启用、`parent_snapshot_version` 的回溯恢复实现等、等真 rollback 场景触发时再落。
- 跨 app_id 跨 deploy 场景的 retention 策略由 `RETENTION_BUFFER_LIMIT * SNAPSHOT_FREQUENCY` 常量控制；P1 不调整。
