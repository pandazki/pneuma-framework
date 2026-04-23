# ADR-0019: Where-clause AST — 跨 Policy / Query / Trigger 的共享表达式类型

**Status**: Accepted
**Date**: 2026-04-24
**Last amended**: 2026-04-24（2 条: 加 `target` namespace / 加 `input` ValueRef; 详见文末 Amendments）
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: primitive, dsl, query, permission, ai-native, architecture

---

## Context

Pneuma 框架里有**三处**需要"对 row 集合做子集选择"的能力：

| 场景 | 由谁定义 | 用在哪 |
|---|---|---|
| **Permission `when` predicate**（[ADR-0007](./0007-permission-dsl.md)） | Builder / agent | 行级权限过滤 (`row.owner_id == user.id`) |
| **Query filter**（未来 ADR-0020） | Builder / agent | 视图数据源 + agent query tool |
| **Trigger / Hook condition**（未来） | Builder / agent | "数据达到条件时发 webhook / 触发 transform" |

这些场景本质上问的是同一个问题——"**选哪些 row？**"。如果让它们各自发明表达语法：

- Builder 要学 3 套（即使字段名和操作符都一样，YAML 形态 / 字段位置稍有差异也会在对话里增加负担）
- Agent 生成 → 验证 → 缓存要实现 3 次
- 反向翻译（[ADR-0008 NL bidirectional](./0008-nl-bidirectional.md) 的 `explain`）要维护 3 个翻译器
- Static analysis（"哪些用户 / 哪些 row 会被这条命中"）要写 3 个版本

NocoDB 的代码已验证过这条路：他们的 `Filter` 实体是一棵递归 AST，同时被 **view filter + webhook trigger + record-level security + button column + link query** 五处复用，用了十年形态稳定（参考 `packages/nocodb/src/models/Filter.ts` 的 `logical_op / is_group / comparison_op / sub_op / children`）。

所以 pneuma 应该**把 where-clause 提升为独立 first-class 类型**，而不是让 permission / query / trigger 各有一套。

---

## Options considered

### Option A: 每处各自发明
Permission 有自己的 predicate，Query 有自己的 filter，Trigger 又一套。

- **Pro**: 每处独立设计最适合自己的语法
- **Con**: 三倍学习成本；三倍实现成本；三倍翻译成本；static analysis 碎片化

### Option B: 通用"表达式语言"（类 JS / 类 SQL WHERE）
让 Builder / agent 写任意表达式，interpreter 统一求值。

- **Pro**: 最大表达力
- **Con**: 违反 [ADR-0007 封闭词汇表](./0007-permission-dsl.md) 和 [ADR-0018 dual-binding](./0018-operations-as-primitive.md) 的设计哲学；agent 生成错误率高；static analysis 几乎不可能；与 pneuma "结构化优于自由"的整体美学不一致

### Option C（最终选择）: 独立 WhereClause AST，封闭词汇表
WhereClause 是一棵递归 AST，有明确的 branch/leaf 形状和封闭的操作符集。**所有三处** use site 共用这个类型。

- **Pro**: 一次投入，三处受益；Static analysis / NL 双向翻译 / agent 生成 schema 都只写一套；跨 use site 的语义对称（"选 row 的子集"）漂亮
- **Con**: 需要把现有 [ADR-0007](./0007-permission-dsl.md) 的 `when` predicate 提炼成公用类型；新增 Query/Trigger ADR 要 opt-in 复用

---

## Decision

WhereClause 是 pneuma 的**第七个** first-class primitive（并列于 Table / CellType / Adapter / Transform / Ref / Operation）。它是**一棵封闭递归 AST**，跨 permission / query / trigger 三处共享。

### 类型定义

```typescript
type WhereClause =
  | WhereBranch
  | WhereLeaf;

interface WhereBranch {
  kind: "branch";
  logical_op: "and" | "or" | "not";       // "not" 的 children 必须恰好 1 个
  children: WhereClause[];
}

interface WhereLeaf {
  kind: "leaf";
  subject: SubjectPath;                    // 要比较的左值
  op: ComparisonOp;                        // 比较操作
  value?: WhereValue;                      // 某些 op（如 null / empty）不需要 value
  sub_op?: DateSubOp;                      // op = "date" 时用于日期语义
}

// 可访问的上下文（封闭命名空间）
type SubjectPath =
  | { ns: "row"; path: string[] }          // row.owner_id / row.tags.0
  | { ns: "user"; path: string[] }         // user.id / user.attrs.department
  | { ns: "input"; path: string[] }        // 仅在 Query/Operation handler 上下文，指代入参
  | { ns: "target"; path: string[] };      // 自 Amendment 2026-04-24：input 里 ref-row 字段解引用后的 row

type ComparisonOp =
  | "eq" | "neq"                           // 等 / 不等
  | "gt" | "gte" | "lt" | "lte"            // 数值 / 日期比较
  | "in" | "nin"                           // 在 / 不在集合
  | "like" | "nlike"                       // 字符串模糊
  | "contains" | "starts_with" | "ends_with"  // ref-row-list / 字符串包含
  | "between" | "nbetween"                 // 区间
  | "null" | "not_null"                    // 是否 null
  | "empty" | "not_empty"                  // 字符串 / 数组空
  | "date";                                // 日期语义，配 sub_op 用

type DateSubOp =
  | "today" | "yesterday" | "tomorrow"
  | "this_week" | "last_week" | "next_week"
  | "this_month" | "last_month" | "next_month"
  | "this_year" | "last_year"
  | "last_n_days" | "next_n_days"          // 配合 value: number
  | "before" | "after" | "on";             // 配合 value: Date/string

type WhereValue =
  | string | number | boolean | null
  | Array<string | number>                 // for in / nin / between
  | { ref: "user" | "row"; path: string[] };  // 引用另一个 namespace 的值
```

### 使用形态（YAML）

**在 Permission policy 里**（[ADR-0007 amend](./0007-permission-dsl.md)——把现有 `when` 字段正式化为 WhereClause 引用）：

```yaml
- allow: self
  do: read
  on: table:bookmarks.row
  when:
    kind: leaf
    subject: { ns: row, path: [owner_id] }
    op: eq
    value: { ref: user, path: [id] }
```

或简化语法糖（Builder 友好）：

```yaml
- allow: self
  do: read
  on: table:bookmarks.row
  when: "row.owner_id == user.id"          # 等价；agent 自动翻译成 WhereClause AST
```

**在 Query filter 里**（未来 ADR-0020）：

```yaml
query: recent_pending_bookmarks
where:
  kind: branch
  logical_op: and
  children:
    - kind: leaf
      subject: { ns: row, path: [status] }
      op: eq
      value: pending
    - kind: leaf
      subject: { ns: row, path: [created_at] }
      op: date
      sub_op: last_n_days
      value: 7
```

**在 Trigger condition 里**（未来 ADR）：

```yaml
trigger: notify_urgent_new_bookmark
on: mutation.insert(bookmarks)
when:
  kind: leaf
  subject: { ns: row, path: [priority] }
  op: eq
  value: urgent
handler: send_notification_operation
```

### 求值语义

所有 use site 共用同一套 evaluator：

```typescript
function evaluateWhere(
  clause: WhereClause,
  ctx: EvaluationContext
): boolean;

interface EvaluationContext {
  row?: Record<string, unknown>;           // 被判断的 row 数据（permission / query / trigger）
  user?: { id: string; attrs: Record<string, unknown>; roles: string[] };
  input?: Record<string, unknown>;         // 只在 Query/Operation handler 上下文里有
  now?: number;                            // 当前时间戳（便于日期 sub_op 求值）
}
```

**关键性质**：
- **纯函数**：相同输入产出相同结果
- **无副作用**：不发起外部调用
- **可缓存**：按 clause + ctx hash 可 memoize
- **可静态分析**：给定 clause 可以反推"它命中哪些 subject / 哪些 op"

### Sub-op 边界（MVP 封闭 vs 可扩展）

操作符集**严格封闭**，新增操作符必须走 framework release（不允许 adapter / app 自定义）。这保证 agent 生成路径、static analysis、NL 翻译器的稳定性。

MVP 的操作符集**不**包含：
- 跨表 join 谓词（通过 ADR-0020 Query 的 `with` 预定义 relation 走，不进 WhereClause）
- 聚合谓词（count / sum / group_by —— [ADR-0002 Derived Table](./0002-storage-typed-cells.md) 或未来 Rollup 列处理）
- 自定义函数调用（禁止任意 JS；后续需要时通过 [ADR-0003 Transform](./0003-transform-primitive.md) 预计算结果存列，再 WhereClause 读列）
- 正则匹配（like / starts_with / contains 覆盖常见需求；完整正则等需要时再补）

### NL 双向翻译（复用 [ADR-0008](./0008-nl-bidirectional.md)）

WhereClause 作为独立类型，它的 NL 翻译器**只需写一次**，三处 use site 自动受益。

Agent 生成：`"alice 只能看自己创建的 bookmark"` → `leaf { ns:row, path:[owner_id], op:eq, value:{ref:user,path:[id]} }`
Agent 解释：反向——把 AST 展开成中文/英文自然语言 `"当 bookmark 的 owner_id 等于当前用户 id 时允许"`

### Static Analysis 能力

WhereClause 作为独立类型后，framework 可以提供这些能力（统一实现，三处 use site 共用）：

- **`getSubjects(clause) → SubjectPath[]`**：这条 clause 读了哪些字段（用于 index 优化 / 敏感字段审计）
- **`requiresUserContext(clause) → boolean`**：是否依赖 user.*（影响缓存键）
- **`isUniversallyTrue(clause) → boolean`**：是否恒真（无过滤效果）
- **`isUniversallyFalse(clause) → boolean`**：是否恒假（等价 deny 所有）
- **`simplifyClause(clause) → WhereClause`**：化简（比如 `and(x, universally_true)` → `x`）
- **`explainClause(clause, lang) → string`**：NL 翻译（[ADR-0008](./0008-nl-bidirectional.md) 能力）

这些能力**闪着光地证明**独立成 primitive 是正确的——三处各自的 simplify/explain/analyze 合并成一套。

---

## Consequences

### Positive
- **三处 use site 共享一套词汇 / 实现 / 翻译**——学习、维护、agent 生成成本全部 ×1 而非 ×3
- **[ADR-0007 permission](./0007-permission-dsl.md) 的 `when` predicate 找到了正式的类型归属**（它现在只是"triple 的一个字段"，抽象层次不对）
- **语义对称**——权限是"选允许通过的 row 子集"，查询是"选被显示的 row 子集"，触发是"选被响应的 row 子集"；用同一抽象表达是干净的架构美学
- **Static analysis 能力复用**——三处都受益于 simplify / explain / isUniversallyTrue 等工具
- **agent NL 翻译器只一份**——[ADR-0008](./0008-nl-bidirectional.md) 的 explain / who_can 逻辑统一
- **对齐 [ADR-0018 Operation primitive](./0018-operations-as-primitive.md) 的精神**——独立抽象一个 primitive 让上层场景都受益，是 pneuma 的整体美学

### Negative / Risks
- **[ADR-0007](./0007-permission-dsl.md) 的 `when` 字段需要 amend**——把它从"inline 字符串谓词"提升为"WhereClause 引用"，并保留字符串语法糖（`"row.x == user.y"` 可由 agent 自动翻译到 AST）
- **封闭操作符集需要演进机制**——新操作符需求出现时得走 framework release；缓解：先列一个候选清单（正则 / JSONPath / transform 引用）在 open-questions
- **sub_op 类别扩展（日期之外）** —— 未来可能需要 geo sub_op (`within_radius`) 或 vector sub_op (`similar_to`)；MVP 只做 date，其他按需加

### Follow-ups
- **[ADR-0007 amend]**：`when` 字段类型正式声明为 `WhereClause`，新增字符串简写语法糖的 parser 规约
- [ADR-0020 Query DSL]：`filter` 字段类型 = `WhereClause`
- [ADR-TBD: Trigger system]：`condition` 字段类型 = `WhereClause`
- **ADR-TBD: Custom operators**（远期，如果需要扩展超出封闭集合）
- 进 `open-questions.md`：vector similarity / geo distance 作为 ComparisonOp 的扩展时机（当有首个 use case 时讨论）
- 进 `open-questions.md`：WhereClause 是否允许 nested subquery（`row.tag in (select top_tags)`）—— MVP 明确不支持，通过 pre-computed derived column 替代

---

## Amendments

### 2026-04-24 — 加入 `target` namespace

**触发**：[ADR-0021 admin_delegated credential mode](./0021-admin-delegated-credential.md) 的 policy 示例暴露——Operation 写操作（如 `close_linear_issue`）的 policy 要检查 **"被操作的那行"** 的属性：

```yaml
# close_linear_issue 的 policy
- allow: role:team
  do: invoke
  on: operation:close_linear_issue
  when:
    kind: leaf
    subject: { ns: target, path: [issue_ref, assignee_id] }    # 👈 target ns
    op: eq
    value: { ref: user, path: [attrs, linear_user_id] }
```

原 4 个 namespace（`row / user / input`）无法表达——`input` 只能访问参数本身（如 `input.issue_ref` 是 row id 字符串），不能自动展开到 row 字段。

**Decision**：`SubjectPath.ns` 新增 `"target"`。语义如下：

- `target` 仅在 **Operation policy 的 `when` 谓词** 上下文里有效（row-level permission / query filter / trigger 不适用）
- Framework policy engine 在求值前自动处理：
  1. 扫描 `input` schema，找出所有 `ref-row` 类型的字段
  2. 对每个 ref-row 字段执行"解引用"（读出目标 row 的当前状态）
  3. 把这些 rows 挂到 `target.<input_field_name>` 下
- 访问路径：`target.<input_field_name>.<column>` —— 如 `target.issue_ref.assignee_id`
- 如果 input 没有 ref-row 字段，policy 里出现 `target.*` → deploy-time 报错
- 如果 input.ref_field 解引用失败（row 不存在），policy 判 deny + audit event 记录

**静态分析扩展**：[`getSubjects`](#static-analysis-能力) 能识别 `target.*`；static analyzer 在 deploy-time 能反推 policy 读取了哪些字段，便于审计和 index 规划。

**缓存影响**：`target.*` 引用依赖"被引的 row 当前值"，不可缓存同一 target 的 policy 结果跨时间——缓存 key 要含 target rows 的版本戳。[ADR-0020](./0020-query-dsl.md) 的 cache key 推导逻辑对此已有支持（见其 Amendments）。

**使用约束**：`target` 不能和 `row` 混用（两个是不同角色——`row` 是被过滤的 row，`target` 是被操作的 row）。Operation policy 常用 `target`；row-level table policy 常用 `row`；混用会 deploy-time 拒绝。

### 2026-04-24 (later that day) — `ValueRef.ref` 加 `"input"` target

**触发**：[ai-bookmarks-core-domain template](../../../templates/ai-bookmarks-core-domain) 里的 `list_bookmark_interpretations` query 需要这种 filter：

```yaml
filter:
  kind: leaf
  subject: { ns: row, path: [bookmark_id, id] }
  op: eq
  value: { ref: input, path: [bookmark_id] }   # ← 需要 input ValueRef
```

意思是"把 row.bookmark_id.id 跟 operation input 里的 bookmark_id 对比"。原 ValueRef 只支持 `ref: "user" | "row"`，`subject: "input"` 可以作为左值但 `value.ref: "input"` 不行。不对称。

**Decision**：`ValueRef` 的 target 从 2 种扩到 3 种：

```typescript
type ValueRef =
  | { readonly ref: "user"; readonly path: readonly string[] }
  | { readonly ref: "row";  readonly path: readonly string[] }
  | { readonly ref: "input"; readonly path: readonly string[] };   // 新
```

`evaluate` 里 `resolveValue` 对 `ref: "input"` 解析 `ctx.input[path]`。非破坏性扩展。

**Adapter-invoker 侧约束**：`AdapterInvoker.splitFilter` 里遇到 `value.ref: "input"` 也能解析（input 若已被 caller 传入 Adapter 调用上下文）；但**MVP 的 ListOptions 尚未把 operation input 线到 adapter 层**，所以当前实现默认 input=undefined，`input` ValueRef 在 adapter pushdown 路径上会解析成 undefined → leaf 不进 pushable → 转本地过滤。这是安全的默认（不会把 operation input 悄悄塞进外部 API filter），未来 Operation-to-Adapter 需要传参时再打通。

**使用约束**：只有 `reads_only` 的 Query / 一般 Operation 的 `when` 子句（有 `input` context 时）才能用 `value.ref: "input"`。Policy 的 row-level `when` 子句跟没有 input 的场景对这条 ref 求值会得到 undefined。

**关联**：[ADR-0020 Query DSL](./0020-query-dsl.md) 的 filter 字段类型已经是 WhereClause，本 amend 自动生效。

---

### 未来 Amendments

预期还会在以下触发下 amend：

- Vector similarity / geo distance 作为 ComparisonOp 扩展（当有首 use case 时）
- `target` 支持 `ref-row-list` 字段的"解引用成多 row"（E1 分享场景会用到，见 [pressure-test](../pressure-test/e-scenarios.md#scenario-e1)）
- Trigger / hook 场景激活后，可能需要 `prev_row` / `next_row` namespace（记录 before/after 状态）
