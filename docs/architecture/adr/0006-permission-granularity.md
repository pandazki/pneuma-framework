# ADR-0006: 权限粒度 — Table + Row + Column

**Status**: Accepted
**Date**: 2026-04-23
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: permission

---

## Context

[ADR-0001](./0001-archetype-scope.md) 要求架构支持 archetype B（团队内部工具）与 archetype D（白标平台）。这两者对权限粒度都有真实需求：

- Archetype B：团队成员能看 `shared` 的 bookmarks，只有创建者能改
- Archetype D：不同租户的用户看不到互相的数据，且管理员能看见几乎所有东西但 `private_notes` 列除外

权限**粒度**——即权限策略作用的资源层级——决定了后续所有权限表达、enforcement、UI 呈现的面积。粒度过粗（只 table 级）无法表达真实场景；粒度过细（cell 级）实现复杂、性能代价大。

这个决策必须在 [ADR-0002 存储](./0002-storage-typed-cells.md) 的 schema 形状上直接留字段，改起来代价很大。必须 day 1 定对。

---

## Options considered

### Option H1: Table-level only
策略只能作用于整张表（能读/不能读）。

- **Pro**: 实现最简
- **Con**: 表达不了"alice 只能看自己的 bookmark"——真实世界的基本诉求都满足不了

### Option H2: Table + Row-level
加行级过滤（通过 predicate 谓词）。

- **Pro**: 覆盖多租户 SaaS 的标配场景
- **Con**: 表达不了"非 owner 看不见 `private_notes` 列"这种列级敏感数据

### Option H3（最终选择）: Table + Row + Column-level
三层粒度。Column-level 通过 column 的 `default_access` 字段 + 规则列表实现。

- **Pro**: 覆盖绝大多数真实场景（含 PII 列保护）；列级与行级能组合出细胞级效果
- **Con**: 比 H2 多一层字段和判断，但和 H2 实现复杂度差距不大（见 Pandazki 对话）

### Option H4: Cell-level（每个 cell 独立 policy）
最细粒度。

- **Pro**: 最灵活
- **Con**: 每次读取都要过每 cell 的 policy，性能代价；UI 表达不出"这一格你看不到"的语义；实际上 H3 + 行级过滤已能组合出 H4 等价能力

---

## Decision

采用 **H3**。三层粒度共享统一的 triple 表达（见 [ADR-0007](./0007-permission-dsl.md)）。

### 粒度的 resource 路径语法

| 粒度 | Resource 字面量 |
|---|---|
| App | `app` |
| Table | `table:bookmarks` |
| Row（用 `when` predicate 做行级过滤） | `table:bookmarks.row` |
| Column | `table:bookmarks.column:private_notes` |
| View | `view:timeline` |
| Adapter | `adapter:linear` |
| Transform | `transform:summarize-body` |

### Column 上的 `default_access` 字段

```typescript
type Column = {
  name: string;
  type: CellType;
  nullable?: boolean;
  default_access?: "public" | "restricted";   // 默认 "public"
};
```

- `default_access: "public"`——没有规则作用于此 column 时允许读
- `default_access: "restricted"`——没有规则允许的情况下拒绝读（白名单模式）

Builder 标记敏感列为 `restricted`，然后单独加 allow rule 放行特定身份（见 [ADR-0009](./0009-permission-default-posture.md)）。

### Row 级过滤的预期形态

Row 级通过 `when` 子句实现（见 [ADR-0007](./0007-permission-dsl.md)）：

```yaml
- allow: self
  do:    read
  on:    table:bookmarks.row
  when:  row.owner_id == user.id
```

无 `when` 的表级规则等价于"对所有行"，这种组合自然覆盖了 H2 的所有能力。

### Cell-level 的实现路径

虽然不原生支持 H4，但可以组合出来：

- Column-level 的 `restricted` + rule 作用在 `table:X.column:Y` 上 + `when row.status == 'private'` → 等价于"只有 status=private 的那些 cell 被保护"
- 实践中，真正需要 cell-level 的场景极少，H3 + 组合已足

---

## Consequences

### Positive
- **一套 DSL 覆盖三层粒度**——Builder 学一个语法就行，不需要为不同粒度学不同表达
- **默认 public 姿态**（见 [ADR-0009](./0009-permission-default-posture.md)）让 MVP 实现复杂度低，而粒度字段从 day 1 就位——后续收紧只是改配置
- **Column 的 `default_access` 为 PII 保护提供自然锚点**——Builder 说"private_notes 是敏感列"→ agent 把该 column 标 `restricted`

### Negative / Risks
- **Row 级 predicate 的性能**——对大表查询时每行都要评估 predicate，可能成为瓶颈。需要 predicate 静态分析能力（把常量谓词下推到存储层做索引过滤）
- **Cell-level 缺口的教育成本**——某些场景 Builder 会问"能否只让这一格被 Alice 看到"，需要教育他通过 row + column 组合来表达
- **Column `default_access` 默认 public 的向后兼容**——未来如果要默认 `restricted`，是破坏性变更

### Follow-ups
- [ADR-0007 Permission DSL](./0007-permission-dsl.md)：统一 triple 语法
- [ADR-0009 Default posture](./0009-permission-default-posture.md)：public / restricted 切换机制
- **ADR-TBD: Predicate 性能优化**：常量下推、索引生成、大表分区
- **ADR-TBD: Cell-level 需求反馈**：跟踪真实场景中是否有 H3 + 组合无法覆盖的情况
