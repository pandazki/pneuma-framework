# ADR-0007: 权限 DSL — 封闭词汇表的三元组 YAML

**Status**: Accepted
**Date**: 2026-04-23
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: permission, agent

---

## Context

Pneuma 的权限策略需要一个表达语言。关键约束（由 Pandazki 在对话中提出）：

> 这个权限大概率是用户跟 agent 口述的，应该提供一种权限表达式机制，能比较顺的把自然语言转换成权限表达式。

这把设计约束从"通用权限 DSL"收紧到"**为 NL→DSL 可靠翻译优化的 DSL**"。现成的 Cedar / Rego / Casbin 都是给安全工程师写的——语法重、关键字多、嵌套深。Agent 从 NL 生成这些语言很容易出错（拼错 keyword、错嵌套、漏分号）。

DSL 必须满足：

1. **结构平铺，不嵌套**——一条规则一个意图
2. **词汇表封闭且小**——agent 的选择面小 → 错误率低
3. **位置化而非语法化**——YAML/struct 形状，不是自定义 keyword
4. **完全声明式**——无循环、无变量、无函数调用
5. **round-trip 可读**——DSL → 自然语言反向翻译是 first-class 能力（见 [ADR-0008](./0008-nl-bidirectional.md)）

---

## Options considered

### Option I1: 纯 RBAC（角色 → 权限）
只有 `role:X can do Y on Z` 这种形式。

- **Pro**: 简单；Agent 翻译容易
- **Con**: 表达不了 "bookmark 归创建者所有" 这种按**数据本身**判定的规则

### Option I2: 纯 ABAC（attribute-based，谓词函数）
每条规则是一个任意谓词 `(user, resource) => allow|deny`，可由 JS / 小 DSL 表达。

- **Pro**: 最灵活
- **Con**: 黑盒；agent 生成的谓词可能出错且难审计；难以做 explain / who_can

### Option I3: Relationship-based（Zanzibar / SpiceDB 风格）
权限是"事实"的图：`user:alice` is `owner` of `app:X`。授权 = 图遍历。

- **Pro**: 存下来的数据可以被列表、审计、UI 呈现；跟 Builder 思考方式贴近
- **Con**: 表达不了纯按 row 属性判定的规则（比如"只有 status=public 的才对外可见"）

### Option I4（最终选择）: Hybrid — Relationships 为主，predicate 作 escape hatch
三元组 `(subject, action, resource)` + 可选 `when` 谓词。subject 包含 user / role / 关系性主语（owner / self / anyone / anonymous）。

- **Pro**: 用 triple 结构消除嵌套；用 `when` 作escape hatch，用封闭操作符集防止任意逻辑；Round-trip 可读性强
- **Con**: 仍需要小型 predicate expression parser

---

## Decision

每条规则是一个封闭词汇表的 triple YAML 对象：

```yaml
# 一条 allow rule（无 when 则无条件允许）
- allow: <subject>        # 从封闭 subject 词汇表中选
  do:    <action>         # 从封闭 action 词汇表中选
  on:    <resource>       # path 语法
  when:  <predicate>      # 可选，封闭 predicate DSL
```

### Subject 封闭词汇表

| 字面量 | 含义 |
|---|---|
| `user:<id>` | 具名用户 |
| `role:<name>` | 具名角色（role registry 见 [ADR-TBD 待定]） |
| `owner` | 资源的创建者（通过 row.owner_id 或 app.owner_id） |
| `self` | 行级语法糖，等价 `user.id == row.owner_id`（与 `owner` 的区别：self 是 user→row 的动态对照，owner 是 app-level 关系） |
| `anyone` | 任何已登录用户 |
| `anonymous` | 未登录访问者 |
| `*` | 所有主体（最大范围） |

### Action 封闭词汇表

| 字面量 | 适用资源 |
|---|---|
| `read` | table / row / column / view / adapter |
| `write` | table / row / column |
| `create` | table（插入新行） |
| `delete` | table / row |
| `list` | table（元数据读） |
| `invoke` | adapter / transform |
| `*` | 所有操作 |

### Resource 路径语法（见 [ADR-0006](./0006-permission-granularity.md)）

```
app
table:<id>
table:<id>.row                    # 行级，用 when 过滤
table:<id>.column:<name>          # 列级
view:<id>
adapter:<id>
transform:<id>
```

### Predicate 封闭操作符（MVP M1）

只允许：
- 操作符：`==, !=, in, has, and, or, not`
- 访问：`row.*`、`user.*`（其他路径禁止）
- 字面量：字符串、数字、布尔、null

示例：
```
row.owner_id == user.id
row.visibility == "shared" and user.id in row.collaborators
not has(row.tags, "archived")
```

**不允许**：
- 任意 JS
- 函数调用（除了 `has / in` 这两个操作符）
- `now()`、`len()`（M2 再考虑）
- Transform 引用 `matches transform:X`（M3 再考虑）

### NL→DSL 翻译完整示例

**Builder 说**：
> "只有创建者能看自己的 bookmark。"

**Agent 生成**：
```yaml
- allow: self
  do:    read
  on:    table:bookmarks.row
  when:  row.owner_id == user.id
```

**Builder 说**：
> "团队内的人可以看 shared 的 bookmark，只有创建者能改。"

**Agent 生成**：
```yaml
- allow: role:team
  do:    read
  on:    table:bookmarks.row
  when:  row.visibility == "shared"

- allow: self
  do:    [read, write]
  on:    table:bookmarks.row
  when:  row.owner_id == user.id
```

**Builder 说**：
> "`private_notes` 字段除了创建者别人都看不到。"

**Agent 生成**（假设 column 已标为 `default_access: restricted`）：
```yaml
- allow: self
  do:    read
  on:    table:bookmarks.column:private_notes
  when:  row.owner_id == user.id
```
（column 是 restricted，没有其它 allow rule 命中的非 self 访问自动拒绝）

### 规则存放位置

单一文件 `policies.yaml`（或 manifest 的 `policies` 字段），跟 app 源码一起版本化。Builder dialogue 的每次修改都是对这个文件的 edit。

### 编译与 enforcement

启动时 framework 加载 policies.yaml、编译为内存中的决策树；运行时 checkPolicy / evaluatePolicy 查树。文件变更时热重载（参考 ai-bookmarks lenses.json 的模式）。

---

## Consequences

### Positive
- **NL→DSL 可靠性高**：封闭词汇表 + 结构化 YAML 让 agent 的 structured output 约束可用（给 agent 约束语法 schema，它不能越出）
- **一套语法覆盖 H3 三层粒度** + adapter + transform + view + app，Builder 学一个规则模式就能表达全部
- **决策可审计**：规则是数据，可以被列表 UI / who_can 查询 / explain 反向解释（[ADR-0008](./0008-nl-bidirectional.md)）
- **封闭 predicate 操作符**让静态分析成为可能（"这条规则是否会让 Alice 看到 X？"），避免 ABAC 的黑盒风险

### Negative / Risks
- **某些场景 predicate 不够表达**（比如需要时间窗口、需要 cross-table 查询作为判断条件）——M1 接受这个局限，预留 M2/M3 扩展路径
- **Role registry 暂未定义**——role:X 里的 X 具体注册在哪里、如何管理，留给后续 ADR（与 IdP 可插拔同批）
- **`owner` vs `self` 的语义需要文档清晰**——Builder 容易混淆

### Follow-ups
- [ADR-0008 NL bidirectional](./0008-nl-bidirectional.md)：evaluatePolicy / who_can / explain 的 API 形态
- [ADR-0009 Default posture](./0009-permission-default-posture.md)：public / restricted 切换机制
- [ADR-0010 User-id grants](./0010-user-id-grants.md)：`user:<id>` 的 registry 与管理 UI
- **ADR-TBD: Role registry & IdP pluggability**
- **ADR-TBD: Predicate M2 扩展**（时间、聚合、transform 引用）
- 进 `open-questions.md`：多条规则冲突时的优先级（MVP 倾向 "任一 allow 命中即允许"，不支持 deny override）
