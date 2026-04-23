# ADR-0005: Adapter 能力声明 & 框架自动映射 cell 写操作

**Status**: Accepted
**Date**: 2026-04-23
**Last amended**: 2026-04-24（加入 `filter_pushdown` 声明；详见文末 Amendments）
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: storage, integration, permission

---

## Context

[ADR-0004](./0004-adapter-protocol.md) 定义了 Adapter 协议。其中一个尖锐问题：**adapter-backed 表是否支持写回？**

- 只读：最安全，但 "mark this Linear issue as done" 这种明显需要写的场景就死了
- 永远双向：危险，Builder 可能不知道一次 cell edit 会触发 3 次 Linear API 调用
- 折中：**Adapter 作者在 adapter 定义时声明自己支持哪些写操作，framework 依据声明自动映射到 cell 的写能力上；不支持的写操作在 UI 层直接禁用**

用户直觉（来自对话 ① G）：这就是 AI 编程的能力——agent 在创建 adapter 时声明有没有写入能力，framework 把 adapter 的写函数直接映射到单元格写能力上。

---

## Options considered

### Option G1: 所有 adapter-backed 表永远只读
最保守。

- **Pro**: 无副作用风险
- **Con**: 跟外部系统的双向整合完全断开；Linear/Notion/... 的写回场景做不了

### Option G2（最终选择）: Adapter 声明 capabilities，framework 据此 enforcement
Adapter 在定义时明确 `capabilities: { read, list, insert, update, delete }`。Framework 看声明决定哪些 cell 写操作可被 viewer 触发、哪些直接灰掉。

- **Pro**: 明确契约；UI 行为与 adapter 声明严格一致；agent 创建 adapter 时可被 prompt 约束先声明 capabilities
- **Con**: 需要 adapter 作者诚实声明；若声明 `update: true` 但实现有 bug，仍会写坏外部系统（但这是 adapter 质量问题，不是协议问题）

### Option G3: 默认允许所有写操作，adapter 可禁用
宽松反向。

- **Pro**: 不写就得显式声明禁用，"默认能做"
- **Con**: 危险默认；误发 API 请求代价大

---

## Decision

采用 **G2**。定义与映射规则如下：

### Capabilities 声明

```typescript
interface Capabilities {
  list: boolean;       // GET 全集或分页集（AdapterBacked 表的基础）
  read: boolean;       // GET 单条（by id）
  insert: boolean;     // POST 新建
  update: boolean;     // PATCH / PUT 更新（可细分为 column 级见下）
  delete: boolean;     // DELETE 删除
  updatableColumns?: string[];   // 可选：只有这些 column 可被 update
  // 示例：Linear adapter 允许 `state` `assignee` `priority` 被更新
  //      但 `created_at` 永远只读
}
```

### Framework 自动映射到 cell 写操作

| Adapter 声明 | Viewer cell 行为 |
|---|---|
| `list: true` + 没有 `update/insert/delete` | 只读表；UI 所有编辑 gesture 被禁用；试图写会抛 `AdapterWriteNotSupported` |
| `update: true` + `updatableColumns` 为 `[col1, col2]` | 只有 col1/col2 的 cell 可编辑；其他 cell 显示为只读 |
| `insert: true` | viewer "新建行" 按钮可用，否则灰 |
| `delete: true` | viewer "删除行" 菜单可用，否则灰 |

### 写操作的执行链

当 user 在 viewer 改了一个 cell，framework 做：

```
1. 查 cell 所属 column 是否在 adapter.capabilities.updatableColumns 里
2. 调 ADR-0007 权限策略 (checkPolicy) — 用户是否被允许 write
3. 若通过，调 adapter.update(ctx, rowId, { col: newValue })
4. 把这次操作作为 mutation event 写入 ADR-0013 遥测流（audit: true）
5. 若 adapter.update 抛错，rollback viewer 状态，把错误显示给 user
```

### 测试与 dry-run（初步）

Adapter 写操作有外部副作用，测试难。Framework 提供：

- **dry-run 模式**：Builder 的 dev 环境可切"dry-run"，所有 adapter.update/insert/delete 被拦截、只 emit event 不真调外部系统
- **待完成**：自动化测试框架——Builder 不写测试，由 build-phase agent 根据 capabilities 定义自动生成 fixture 与断言（见 open-questions）

---

## Consequences

### Positive
- Cell-level write-back 完全自动——Builder 不写代码就获得对外部系统的双向集成
- Capabilities 声明让 UI 行为与 adapter 真实能力严格一致，没有"能点但点了没反应"
- 为 [ADR-0013 遥测](./0013-telemetry-event-model.md) 的审计子集提供天然埋点——每次 adapter.write 都是 audit event

### Negative / Risks
- **Adapter 作者的诚实依赖**：声明 `update: true` 但实现有 bug 时 framework 仍会调用，写坏外部系统。缓解：marketplace 审核 + adapter 作者测试 fixture
- **跨 field 一致性**：如果一次更新要同时动多个 column 且部分失败，事务语义 TBD（外部系统大多没事务）
- **dry-run 模式的真实性**：拦截外部调用同时，某些本应由外部 side-effect 触发的行为（比如 Linear "标记 done" 后自动发邮件）在 dry-run 下看不到。Builder 要理解这个局限

### Follow-ups
- [ADR-0013 Telemetry event model](./0013-telemetry-event-model.md)：adapter write 的审计埋点细节
- **ADR-TBD: Adapter 测试协议**：fixture 格式、回放机制、build-phase agent 如何自动生成测试
- **ADR-TBD: 跨 adapter 事务**：同一次 Builder 操作跨多个 adapter 写时的一致性；MVP 明确不做事务（best-effort + telemetry 留痕）
- 进 `open-questions.md`：adapter update 失败的回滚策略（乐观 UI / 悲观锁 / 失败提示）

---

## Amendments

### 2026-04-24 — 加入 `filter_pushdown` 声明

**触发**：[ADR-0020 Query DSL](./0020-query-dsl.md) + [ADR-0021 admin_delegated credential](./0021-admin-delegated-credential.md) 的演练暴露——Adapter-backed table 的 query 需要把 WhereClause filter 下推到外部系统执行（不能全拉回本地过滤，慢 + 在 admin_delegated 模式下是安全问题）。原 capability 声明只覆盖 `list/read/write`，没覆盖"我能下推哪些 filter"。

**Decision**：`Capabilities` 接口加 `filter_pushdown` 字段：

```typescript
interface Capabilities {
  list: boolean;
  read: boolean;
  insert: boolean;
  update: boolean;
  delete: boolean;
  updatableColumns?: string[];
  
  // 自 Amendment 2026-04-24
  filter_pushdown?: FilterPushdown;
}

interface FilterPushdown {
  /** 每列能下推的 comparison op 集合 */
  supported_ops: Record<
    string,              // column name
    ComparisonOp[]       // e.g. ["eq", "in", "gt", "gte"]
  >;
  
  /** 日期列能下推的 sub_op 集合（如果该列是 date 类型） */
  supported_sub_ops?: Record<string, DateSubOp[]>;
  
  /** 能 sort 的列 */
  sortable_columns?: string[];
  
  /** 能 projection 的字段（有些 adapter 必须返回全字段） */
  supports_field_projection?: boolean;
  
  /** admin_delegated 模式的硬要求 —— 见 ADR-0021 */
  required_for_admin_delegated?: Array<{
    column: string;           // 必须能下推 user-binding filter 的列
    required_ops: ComparisonOp[];  // 至少支持的 op（如 ["eq"]）
  }>;
}
```

**执行规则**：

1. Query 执行时，framework 把 filter AST 拆成"可下推部分"和"必须本地过滤部分"，基于 `supported_ops` / `supported_sub_ops`
2. 可下推部分通过 `adapter.list(query)` 的 filter 参数传出
3. Adapter 返回经过外部过滤的结果
4. Framework 对结果应用剩余"不可下推部分"做本地过滤

**admin_delegated 模式特殊约束**（来自 [ADR-0021](./0021-admin-delegated-credential.md)）：
- Query 的 filter 里的 **user-binding 子句**（如 `row.assignee_id == user.attrs.linear_user_id`）必须**能下推**——`required_for_admin_delegated` 强制声明
- 如果 query 引用的 user-binding 字段不在 `required_for_admin_delegated` 里 → deploy-time 阻止
- 如果 adapter 实际执行时返回"不支持这个 op" → **fail-closed**（refuse 返回，不降级到本地过滤）

**示例 — Linear adapter 的声明**：

```yaml
adapters:
  - id: linear
    capabilities:
      list: true
      update: true
      updatableColumns: [state, comment]
      
      filter_pushdown:
        supported_ops:
          assignee_id: [eq, in]
          state:       [eq, in, nin]
          priority:    [eq, gt, gte, lt, lte]
          created_at:  [gt, gte, lt, lte, date]
          updated_at:  [gt, gte, lt, lte, date]
        supported_sub_ops:
          created_at: [today, yesterday, this_week, last_n_days]
          updated_at: [today, yesterday, this_week, last_n_days]
        sortable_columns: [created_at, updated_at, priority]
        supports_field_projection: true
        required_for_admin_delegated:
          - column: assignee_id
            required_ops: [eq]
```

**对未声明 adapter 的兼容**：
- `filter_pushdown` 是**可选字段**——未声明的 adapter 默认 "仅支持 list 返回全量"
- 此时 Query 执行 = 拉全量 + 本地过滤（慢但安全）
- `admin_delegated` 模式下 **不允许** 未声明 `required_for_admin_delegated` 的 adapter——deploy-time 阻止使用

**关联**：
- [ADR-0020 Query DSL](./0020-query-dsl.md) 的 query 执行时依赖此字段决定"多少下推多少本地"
- [ADR-0021 admin_delegated](./0021-admin-delegated-credential.md) 的安全契约 #2 通过此字段落实
- [ADR-0004 Adapter protocol](./0004-adapter-protocol.md) 的 adapter 定义需要在 `AdapterDefinition.capabilities` 里填此字段（adapter 作者责任）
