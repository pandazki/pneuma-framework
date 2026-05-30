# 定义即数据

框架里最不寻常的想法:一个 Generated Application 的**结构**——它的表、你能跑的
operation、你看到的 view、为它们门禁的 policy——不是代码,也不是数据库迁移。它是
**受治理的数据**,存在系统拥有的表里,经由与任何其他数据变更相同的 pipeline 改动。

![系统拥有的表 pneuma_tables、pneuma_operations、pneuma_views、pneuma_policy_rules 把 app 结构当作行存放;definition.apply 经由受治理 pipeline 改动它们](/diagrams/definition-as-data.png)

## app 的结构是行

五张系统拥有的表持有定义:

| 表 | 持有 | 关键字段 |
|---|---|---|
| `pneuma_tables` | app 的表 | `table_id`、`columns`、`system_owned`、`definition_version` |
| `pneuma_operations` | 你能调用的动作 | `operation_id`、`handler`、`input`、`affects`、`ui_binding`、`agent_tool` |
| `pneuma_views` | 各 surface 渲染什么 | `view_id`、`kind`、`source`、`presentation` |
| `pneuma_policy_rules` | 谁能做什么 | `rule_id`、`effect`、`actions`、`resource`、`when` |
| `pneuma_policy_settings` | 默认姿态 | `public` \| `restricted` |

因为定义*就是*数据,每个结构变更都是一行带来源信息——`created_by`、`created_by_kind`
(是人还是 agent?)、以及一个单调的 `definition_version`。app 的结构有历史,就像它的
内容一样。

## `definition.apply` —— 一条受治理 pipeline

你不直接编辑这些行,也不写迁移。你调一个语义工具。`definition.apply` 接一个类型化的
单一变更,把它跑过*与普通数据变更相同的原语 pipeline*——policy 检查、impact、执行、
审计。变更种类是一个封闭集:

```text
add_table · add_table_column · add_operation · add_view
add_policy_rule · update_policy_rule · delete_policy_rule · set_default_posture
```

那个"相同 pipeline"的主张(由 ADR-0029 钉死)是优雅的地方:不存在一条独立的、特权的
"schema 迁移"代码路径绕过治理。重塑 app 是一次*受治理的变更*,像其他每个变更一样可检查、
可审计。

## `definition.apply_change_set` —— 一个意图,一次批准

单个 Builder 意图("加一个优先级队列")通常意味着好几个结构变更:一列、一个设置它的
operation,也许还有一个 view 和一个 policy。把它们拆成多次批准是噪声。
`definition.apply_change_set` 把它们打包成**一个意图 → 一次批准 → 子变更**:

```ts
definition.apply_change_set({
  intent:  "加一个优先级队列",
  summary: "...",
  changes: [ /* add_table_column、add_operation、add_view、... */ ],
  approvalMode: "wait" | "defer",
})
```

Builder 看到一个批准提示。批准后,子变更作为一个整体执行;拒绝则**什么都不**变更。这是
代码侧[单意图 proposal](./proposal-and-evidence)的定义侧镜像——相同的纪律(批准单元 =
意图单元),不同的产物。

## Operation:一个声明,两个消费者

`pneuma_operations` 的行值得单独一提,因为 **Operation 是 first-class 原语**(ADR-0018),
而非便利封装。一个 Operation 声明携带关于一个动作的一切:

```ts
Operation = {
  id, name, description,
  input,                 // 一个封闭的输入 schema
  output,                // 返回形状
  affects: { mutations, adapter_writes, reads_only, destructive },
  handler,               // 代码 handler 或 query body
  ui_binding?,           // 它在某个 view 里出现在哪/如何出现
  agent_tool?,           // agent 如何看见并调用它
}
```

从那*一个*声明,框架派生出 **UI 入口****和** agent 工具。后果,用 ADR-0018 的话说,是
UI 与 agent*"走进同一个 pipeline … 完全对等"*。不存在"UI 有检查、agent 绕过",也不存在
"agent 做了审计、UI 没做"。一次点击和一次工具调用是同一个受治理的调用。

`affects.destructive` 是这为何要紧的一部分:把一个 operation 声明为 destructive 一次,
*两个* surface 都会尊重它——UI 显示确认对话框,agent 必须用自然语言披露后果。一个声明,
一个真相,两个 surface。

## 这条 lane 如何回退

因为定义是版本化的数据,它有原生的撤销:`definition.rollback.prepare` /
`definition.rollback.execute` 把定义移回一个目标历史版本——它本身是一次已批准、受治理的
动作。对比[代码 lane 的回滚](./rollback),后者在已物化的源码上移动一个版本指针。两者都
受治理;它们作用于不同的底物,因为两种[变更模型](./change-models)就是如此。

下一篇:记录每一个这类意图与决策的记录——[BuildThread](./build-thread)。
