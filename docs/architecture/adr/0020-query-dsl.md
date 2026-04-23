# ADR-0020: Query DSL — 声明式 YAML，Operation 的只读子类

**Status**: Accepted
**Date**: 2026-04-24
**Last amended**: 2026-04-24（Cache key 自动推导契约；详见文末 Amendments）
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: query, dsl, operation, ai-native

---

## Context

[ADR-0018 Operation primitive](./0018-operations-as-primitive.md) 把 "用户/agent 可触发的动作" 抽象为 Operation；Query 作为特殊 case 明确标注为 `reads_only: true`。[ADR-0019 WhereClause](./0019-where-clause-ast.md) 把"选 row 子集"抽象为独立 AST。这两件一旦就位，Query DSL 的设计面积就小了——**它只是把 WhereClause、Operation、Table relations 三件拼到一起的声明式形态**。

但还剩几个具体决策：

- DSL 形态（YAML / URL-query / method chain）
- 跨表关系的表达（sort / alias / nested filter 支不支持？）
- 分页形态（cursor / offset / 无）
- 缓存声明（TTL / 依赖失效）
- End User 能否即时构造 query（vs 只 Builder 预定义）
- Adapter-backed 表的 query 是否允许下推

本 ADR 把这些统一敲定。

---

## Options considered

### DSL 形态

**Option A: URL-query string**（nocodb 形态）
`?where=(status,eq,pending)~and(created_at,date,last_n_days,7)&sort=-created_at&limit=25`

- Pro: 短；URL-friendly
- Con: 嵌套深时可读性崩溃；agent 生成的 structured output schema 不友好

**Option B: Method chain TS API**（程序员风格）
`defineQuery(...).from(...).where(...).sort(...).with(...)`

- Pro: Developer 手写舒服
- Con: agent 生成容易语法错；pneuma 核心用户是 Builder 不是 Developer；跟 WhereClause/Permission 的 YAML 风格不一致

**Option C（最终选择）: 声明式 YAML，风格对齐 Permission (0007) + WhereClause (0019) + Operation (0018)**

- Pro: 家族一致；agent 结构化输出最稳；Builder 在对话里不看 YAML，agent 帮他写；序列化 / 存储 / 版本化都方便
- Con: 单条 query YAML 比 URL-query 长（但 Builder 视角被屏蔽）

### 跨表关系表达（B2）

- **Option B2-a 仅关系名**：`with: [interpretations]`
- **Option B2-b（最终选择）**：alias + nested filter/sort/limit/fields
  ```yaml
  with:
    - relation: interpretations
      as: readings
      filter: { ... WhereClause ... }
      sort: [{ column: created_at, dir: desc }]
      limit: 1
      fields: [body, lens_name]
  ```

Pandazki 判断："B 已经涵盖了，复杂度不大，直接上 B"——MVP 就允许嵌套 filter/sort/limit/fields per relation。

---

## Decision

### Query 的完整 YAML 形态

```yaml
# 作为 Operation 的子形态，id / name / description 都来自 Operation header
operation:
  id: recent_pending_bookmarks          # 唯一 id
  name: 最近待处理书签
  description: 过去 7 天标为 pending 的 bookmark，附带最新的技术解读
  reads_only: true                      # 关键标记，标识这是 Query
  
  input:                                # 可选参数（用户/agent 传入）
    type: record
    fields:
      status:
        type: { kind: primitive, of: Text }
        default: pending
      days:
        type: { kind: primitive, of: Number }
        default: 7

  output:                               # 输出 schema，强制声明
    type: row-list
    row_type: bookmarks                 # 引用 Table id
    with:                               # output 里会带的关联结构
      readings: row-list<interpretations>

  query:                                # Query body
    on: bookmarks                       # 主表

    filter:                             # WhereClause (ADR-0019)
      kind: branch
      logical_op: and
      children:
        - kind: leaf
          subject: { ns: row, path: [status] }
          op: eq
          value: { ref: input, path: [status] }
        - kind: leaf
          subject: { ns: row, path: [created_at] }
          op: date
          sub_op: last_n_days
          value: { ref: input, path: [days] }

    sort:
      - column: created_at
        dir: desc

    fields: [id, title, url, status, created_at]    # projection；省略则"所有字段"

    with:                               # 跨表关系（ADR-0002 amend 预告）
      - relation: interpretations       # Table.relations 里预定义的名字
        as: readings                    # alias（output.with.readings 对应）
        filter:
          kind: leaf
          subject: { ns: row, path: [lens_name] }
          op: eq
          value: technical-depth
        sort:
          - column: created_at
            dir: desc
        limit: 1
        fields: [body, lens_name, created_at]

    pagination:                         # MVP: cursor-based 优先
      kind: cursor                      # "cursor" | "offset"
      size: 25

    cache_ttl: 30                       # 秒；MVP 只支持 TTL，不做依赖失效
```

### Query 作为 Operation 的子类型的语义

- `reads_only: true` 告诉 framework：这是 Query，走 read path（可复用缓存、可下推 adapter、可匿名访问当 policy 允许）
- `query` 字段是 Query body（替代常规 Operation 的 `handler`）
- Framework 见到 `query` 字段自动执行；见 `handler` 字段则走普通 Operation 代码路径
- 一个 Operation 不能同时有 `query` 和 `handler`（mutually exclusive）

### 核心字段语义

| 字段 | 语义 | 必填? | 默认 |
|---|---|---|---|
| `on` | 主表 id | ✅ | — |
| `filter` | WhereClause（ADR-0019）决定 row 子集 | ❌ | 无过滤 = 全表 |
| `sort` | 列表，顺序执行，支持多级排序 | ❌ | 按主表的默认 sort（通常 id asc） |
| `fields` | Projection，列名数组 | ❌ | 返回所有字段 |
| `with` | 关系嵌套，见下 | ❌ | 不带 |
| `pagination` | `{ kind: cursor|offset, size }` | ✅ MVP 强制 | — |
| `cache_ttl` | 秒；超时自动失效 | ❌ | 不缓存 |

### Relation traversal (`with`) 详细语义

每条 `with[i]`：

```yaml
- relation: <relation_name>     # 在主 Table 的 relations 声明里存在
  as: <alias>                   # 可选；省略则 = relation_name
  filter: <WhereClause>         # 可选；应用于关联 row
  sort: [{ column, dir }]       # 可选；排序关联 row
  limit: <number>               # 可选；截取前 N 条
  fields: [<column>]            # 可选；projection 关联 row
  with: [<nested_relation>]     # 可选；递归（MVP 最多 2 层，防无限嵌套）
```

**MVP 限制**：
- `with` 最多 **2 层嵌套**（bookmarks → interpretations → lenses 这种够用了）
- `with` 的关联 row 每个主 row 的 limit 默认 100（防止一对多失控）

### Table relations 声明（[ADR-0002 amend](./0002-storage-typed-cells.md) 预告）

Query 的 `with` 依赖 Table schema 里预定义 relations。现有 [ADR-0002](./0002-storage-typed-cells.md) 的 Table 形状需要 amend 加 `relations`：

```yaml
tables:
  - id: bookmarks
    columns: [...]
    relations:                    # 新增字段
      - name: interpretations
        to: interpretations       # 目标 table id
        kind: has_many             # has_one | has_many | belongs_to | many_to_many
        via:                      # 关系的具体连接
          kind: foreign_key
          local_column: id
          remote_column: bookmark_id
        cascade_delete: true      # 删主 row 时对关联 row 的策略
```

这样 Query 的 `with: interpretations` 就能解析。详细 amend 留给 [ADR-0002 amend document](./)，本 ADR 先声明这个依赖。

### 输入参数 (`input`) 语义

Query 作为 Operation 子类，输入通过 Operation.input 声明。在 `filter` / `with.filter` 的 WhereClause 里用 `{ ns: input, path: [...] }` 引用。

- Agent / UI 调用时传 input.json
- Framework 把 input 填入 WhereClause 求值
- 可以有默认值（input.fields.*.default）

### 输出 Schema 强制声明

`output` 字段**必须声明**——这是 pneuma 与 NocoDB 的明确差异。理由：

- Agent 调 query tool 时需要知道返回形状（结构化生成）
- Framework 可以做类型检查（filter field 是否存在 / 返回 fields 是否 subset）
- Cache key 可以包含 output schema hash

### Pagination（Q-focus 5）

**MVP 强制使用 cursor**：

```yaml
pagination:
  kind: cursor
  size: 25
```

Cursor 具体形式：

```typescript
// 请求
interface QueryInvocation {
  after?: string;            // 上一页最后 row 的 cursor token
  before?: string;           // (MVP 可不实现 back nav)
}

// 响应
interface QueryResult {
  rows: Row[];
  next_cursor?: string;      // 如有下一页
  prev_cursor?: string;      // 如有上一页（MVP 不一定实现）
}
```

Cursor token 是对"排序列 + id"的 encode（如 base64 的 `{sort:"created_at",value:"2026-04-23T10:00:00",id:42}`）。

**Offset** 作为 MVP 的 fallback 选项支持（小集合、UI 友好），但**大数据集建议用 cursor**。Agent 生成默认 cursor。

### Cache 声明（Q-focus 7，Q-B3）

**MVP 只支持 `cache_ttl`**（秒）。Framework 按 `(query_id, input_hash, user_id, version)` 为 key 缓存。超时自动失效。

**Post-MVP** 可扩展 `invalidation_dependencies`（某列变时失效）和更细粒度 cache tier（per-user vs shared）。

### End User vs Builder 触发（Q-focus 4）

- **Builder 预定义的 query** 是主路径：query 有 id，存在 app 的 operations 声明里，受 policy 控制
- **End User 在 viewer 里 override sort / filter**（比如"按 title 排序"） → 只影响本次渲染，**不落盘、不生成新 operation**，通过 URL-query string 携带（可能用压缩形态），其实是对已有 query 加 delta
- **End User 发任意 ad-hoc query** → **不支持**（安全 + 性能）

Override 形态（MVP 支持）：

```
GET /api/operations/recent_pending_bookmarks/invoke
    ?extra_filter=(title,like,%bun%)
    &sort=-title
```

Framework 把 `extra_filter` 作为 AND 追加到预定义 query 的 filter 上；`sort` 替换预定义 sort。Policy 仍然作用在结果上（override 不绕开权限）。

### Adapter-backed 表的 query 下推（Q-focus 8）

当 `on: <adapter-backed-table>` 时：

- 默认：framework 通过 adapter 的 `list(query)` 接口把 WhereClause 传给 adapter 执行（adapter 自己决定如何翻译成外部 API）
- Adapter 能处理的 op / sort 由 [ADR-0004 adapter protocol amend](./) 声明（各 adapter 支持的 op 子集可能不同，如 Linear 支持 `eq/in` 但不支持 `like`）
- 不能下推的 op：framework 拉回全量后本地过滤（可能很慢）
- `cache_ttl` 对 adapter-backed 格外有价值（避免频繁外部调用）

### 字符串简写（语法糖）

所有 YAML `filter` 字段都可以用字符串简写替代：

```yaml
# 完整 AST
filter:
  kind: leaf
  subject: { ns: row, path: [status] }
  op: eq
  value: pending

# 等价字符串简写（agent 自动解析为 AST）
filter: "row.status == 'pending'"
```

字符串形态只用于"Builder 手写 / 日志查看方便"，framework 存储和序列化仍是 AST JSON。Agent 生成任一种形态皆可。

---

## Consequences

### Positive
- **一家 YAML 风格**——与 Permission (0007) / WhereClause (0019) / Operation (0018) 完全对称
- **Agent 结构化生成友好**——封闭词汇表 + 明确 schema
- **Query 是 Operation 子类**——权限 / UI 绑定 / telemetry / audit 自动继承 [ADR-0018](./0018-operations-as-primitive.md)
- **WhereClause 复用**——filter / with.filter 共享同一 AST
- **Adapter 下推自动**——adapter-backed 表的 query 透明走 adapter.list
- **End User override 路径清晰**——不落盘的 delta query，不突破权限

### Negative / Risks
- **Query YAML 较长** — Builder 直接看会嫌烦，但 Builder 的 UX 是对话式，不直接看 YAML；开发调试时可读性仍然好
- **`with` 的嵌套 limit / sort 实现成本** — MVP 2 层 + per-relation limit 实现要写 SQL 级或 adapter 级的 join + subquery，不是 trivial；但 NocoDB 形态验证过可行
- **Cursor token 跨部署稳定性** — 如果 sort 列被 rollback（ADR-0017）改了类型，旧 cursor 可能 decode 失败；MVP 接受"rollback 后翻页从头来"
- **Static analysis 深度** — `simplifyClause` 等 ADR-0019 能力现在作用在 query filter 上，但 with.filter 也要 apply；实现时注意递归到 sub-level

### Follow-ups
- **[ADR-0002 amend]**: Table.relations 字段详细 schema（has_one/has_many/belongs_to/many_to_many, via 表达, cascade 策略）
- **[ADR-0004 amend]**: Adapter protocol 的 `list(query)` 接口；声明 adapter 支持哪些 op 下推
- **[ADR-TBD]: Derived Table**（ADR-0002 占位）的 Query-based 定义形态——派生表 = 基于某个 query 的物化视图
- **[ADR-0021 View System]**（下一条）：View 挂载 Query 作为数据源
- **ADR-TBD: Invalidation dependencies**（post-MVP cache 增强）
- **ADR-TBD: Back navigation cursor**（prev_cursor 支持）
- 进 `open-questions.md`：`with` 嵌套深度 MVP 限 2 层是否够；post-MVP 如何扩
- 进 `open-questions.md`：Query 作为 Derived Table 的 "物化 vs 即时" 权衡

---

## Amendments

### 2026-04-24 — Cache key 由 WhereClause static analysis 自动推导

**触发**：[ADR-0021 admin_delegated credential mode](./0021-admin-delegated-credential.md) 的 pressure 演练暴露：当 Query filter 引用 `user.attrs.linear_user_id`（per-user binding 值），而 cache key 只含 `user.id`——在某些 edge case（同 user.id 但 user.attrs 被外力改变，或 admin-delegated 下 binding id 替换）下，会把**旧身份的缓存结果交给新身份**。更普遍地说，原 decision "cache_key = (query_id, input_hash, user.id, version)" 是**不够**的——没覆盖 filter 实际引用的所有 namespace 值。

**Decision**：Cache key 由 framework **自动从 WhereClause static analysis 推导**，不由 Builder 声明。具体规则：

```
cache_key = hash(
  query_id,
  query_spec_version,            // 查询定义本身的 hash（filter AST 改了就 invalidate）
  input_values,                  // 所有 input.* 字段的实际值
  referenced_user_values,        // filter / with.filter 引用的所有 user.* 路径的实际值
                                 // 如 filter 含 user.attrs.linear_user_id → key 含这个值
  referenced_target_versions,    // 如果 filter 引用 target.*（罕见），含 target rows 的 updated_at
  tenant_id,                     // ADR-0001 约束 1：所有 cache key 含 tenant
)
```

实现上 framework 用 [ADR-0019 `getSubjects`](./0019-where-clause-ast.md#static-analysis-能力) 扫描 query.filter + all with[].filter，找出所有 `user.*` 和 `target.*` 的 subject path，对每个 path 读出当前值进 cache key。

**影响范围**：
- **跨用户隔离**：天然保证——filter 里引 `user.attrs.X` → 不同用户 X 值不同 → cache key 不同 → 不共用
- **同用户多设备**：同 user.id 同 attrs → 同 cache 命中——符合预期
- **Admin-delegated binding 变更**：Builder 重新 assigns 了某 user 的 linear_user_id → 该 user 的 attrs 值变了 → 老 cache key 失效 → 下次查拿新值——符合预期
- **Adapter-backed table 的 remote 变化**：不影响 cache key（靠 `cache_ttl` 失效，或显式 invalidation post-MVP）

**Builder 视角**：`cache_ttl: 60` 是 Builder 唯一声明；cache key 策略完全框架自动。Builder 不能 override cache key 推导（简化 + 安全）。

**约束**：如果 query filter **不**引用 user.*（纯 public query），cache 在用户间**共享**——这是 by design。Builder 要让结果 per-user 必须在 filter 里显式引用 user.*。

**关联**：[ADR-0021](./0021-admin-delegated-credential.md) 的 "admin_delegated 模式必须 filter 含 user 约束" 这条安全契约和本 cache key 契约**互相支撑**——前者保证 filter 有 user 引用，后者保证 cache 按该引用分桶。
