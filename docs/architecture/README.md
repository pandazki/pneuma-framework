# pneuma-framework 架构

> 你正在看的是 pneuma-framework 的**架构决策 + 设计规格**目录。
> 如果你是第一次进来，请按下面的【3 分钟版】读到【10 分钟版】。

---

## 当前 canonical 文档

不要从临时 P-report 开始读。当前长期入口只有这几份：

| 文档 | 用途 |
|---|---|
| [milestone-1-snapshot.md](./milestone-1-snapshot.md) | 当前里程碑鸟瞰：已证明什么、未证明什么、下一阶段怎么切 |
| [app-definition-milestone.md](./app-definition-milestone.md) | 当前里程碑：Builder/agent 如何治理式改变 app definition |
| [team-share-demo.md](./team-share-demo.md) | 0 预备知识团队分享包：开场叙事、runbook、live demo talk track、FAQ |
| [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md) | 仍未决、下一步需要讨论或写 ADR 的问题 |
| [spec/domain-model.md](./spec/domain-model.md) | 领域模型总览 |

文档卫生规则：实现过程日志不长期保留；稳定结论进 milestone / demo / ADR / open questions。

---

## 3 分钟版：pneuma 是什么

**Pneuma 是一个 AI-native 应用创造工具的 framework**——不是让开发者更快写代码的工具，而是**让非程序员通过对话创造应用**的基础设施。

三个角色（可以是同一个人）：

- **Developer**：基于 pneuma-framework 做出 pneuma-app-template（提供领域骨架）
- **Builder**：拿着 template，通过**跟 agent 对话**逐步塑造成自己的 pneuma-app
- **End User**：使用 Builder 塑造出来的 pneuma-app

**核心对比**：
- vs Retool / n8n：pneuma 是对话式的，Builder 不拖字段
- vs Airtable / Notion：pneuma 里 Agent 是 first-class，不是附加功能
- vs Rails / Next.js：pneuma 面向 Builder 不是 Developer

**愿景覆盖面**（[ADR-0001](./adr/0001-archetype-scope.md)）：MVP 瞄准 A（个人自用）+ B（团队内部工具）两种 archetype；C（SaaS）作接口兼容、D（白标平台）作远期目标**留门**。

**核心差异化**（别的框架没有的）：

1. **UI 和 Agent 永远能做一样的事**（[ADR-0018 Operation primitive](./adr/0018-operations-as-primitive.md)）——界面点按钮 = agent 调 tool，同一份声明派生两种表达
2. **权限 DSL 可以跟 Builder 对话着写 / 反向解释**（[ADR-0008 NL bidirectional](./adr/0008-nl-bidirectional.md)）——builder 说"只有 alice 能看" → agent 翻译成规则；user 问"为什么看不到" → agent 反向解释
3. **数据表达式（filter / policy / trigger）共享同一棵 AST**（[ADR-0019 WhereClause](./adr/0019-where-clause-ast.md)）——学一次覆盖全栈

---

## 10 分钟版：核心心智模型

### 8 个 first-class primitives

Pneuma 的整个架构围绕这 8 个 primitives 组织。其它一切都是它们的使用方式或组合。

| Primitive | 负责 | 关键 ADR |
|---|---|---|
| **Table** | 数据集合（行的容器） | [0002](./adr/0002-storage-typed-cells.md) |
| **CellType** | 单元格的封闭类型系统（Text/Vector/RefRow/RefExternal/...） | [0002](./adr/0002-storage-typed-cells.md) |
| **Ref** | 指向其他 row 或外部资源的引用 | [0002](./adr/0002-storage-typed-cells.md) |
| **Adapter** | 对外部系统（Linear/Notion/...）的 ingress/egress 层 | [0004](./adr/0004-adapter-protocol.md) [0005](./adr/0005-adapter-capabilities.md) [0011](./adr/0011-adapter-credential-modes.md) [0021](./adr/0021-admin-delegated-credential.md) |
| **Transform** | 任意输入 → typed output，impl 可以是 code 或 prompt | [0003](./adr/0003-transform-primitive.md) |
| **Operation** | 用户/agent 可触发的动作。UI 绑定 + agent tool 同声明派生；surface contract 区分 agent 工具面和 end-user app surface | [0018](./adr/0018-operations-as-primitive.md) [0023](./adr/0023-operation-surface-contract.md) |
| **WhereClause** | 跨 policy/query/trigger 共享的表达式 AST | [0019](./adr/0019-where-clause-ast.md) |
| **PermissionContext** | 贯穿运行时的权限/身份/trace 上下文 | [0007](./adr/0007-permission-dsl.md) [0010](./adr/0010-user-id-grants.md) |

### 它们如何组合（一次 mutation 的生命周期）

```
用户点击 UI 按钮 or Agent 调 tool
           │
           ▼
      Operation dispatcher                           [ADR-0018]
           │
           ├─ 构造 PermissionContext                  [ADR-0010]
           │
           ├─ evaluatePolicy(ctx, invoke, op:<id>)    [ADR-0007, 0008]
           │     │ policy 用 WhereClause 做谓词        [ADR-0019]
           │     ▼
           ├─ 计算 Impact，必要时强制确认               [ADR-0017, 0018]
           │
           ├─ 执行 Operation handler
           │     │
           │     ├─ 调 Table.write / Adapter.update    [ADR-0002, 0004, 0005]
           │     ├─ 调 Transform 做类型强制             [ADR-0003]
           │     └─ 触发 Query（= 只读 Operation）      [ADR-0020]
           │
           ├─ emit telemetry event（带 ctx）           [ADR-0013, 0015]
           │     │
           │     └─ audit:true 事件流入 append-only sink [ADR-0014]
           │
           └─ 返回 output / 更新 UI
```

---

## 给新人的阅读顺序

24 条 ADR 是一个**可导航的网**，不是线性教程。推荐路径：

### 最小读完能建心智模型（~45 分钟，11 条）

1. **[0001 Archetype scope](./adr/0001-archetype-scope.md)**——产品定位 + MVP 范围
2. **[0002 Typed cells](./adr/0002-storage-typed-cells.md)** + **[0003 Transform](./adr/0003-transform-primitive.md)**——数据模型核心
3. **[0004 Adapter protocol](./adr/0004-adapter-protocol.md)**——外部系统接入
4. **[0007 Permission DSL](./adr/0007-permission-dsl.md)** + **[0019 WhereClause](./adr/0019-where-clause-ast.md)**——权限表达式栈
5. **[0018 Operation primitive](./adr/0018-operations-as-primitive.md)** + **[0023 Operation surface](./adr/0023-operation-surface-contract.md)**——UI 与 Agent 对等的那条线，以及哪些 Operation 能进入 end-user surface
6. **[0013 Telemetry](./adr/0013-telemetry-event-model.md)** + **[0014 Audit](./adr/0014-audit-subset.md)**——观测层
7. **[0016 Dev/Prod isolation](./adr/0016-dev-prod-data-isolation.md)** + **[0017 Rollback](./adr/0017-rollback-data-semantics.md)**——双模式语义
8. **[0021 admin_delegated credential](./adr/0021-admin-delegated-credential.md)**——真实团队场景（Linear 例子）

### 补齐场景细节（按需）

- **存储深度**：[0005](./adr/0005-adapter-capabilities.md) [0008](./adr/0008-nl-bidirectional.md) [0020](./adr/0020-query-dsl.md)
- **权限深度**：[0006](./adr/0006-permission-granularity.md) [0009](./adr/0009-permission-default-posture.md) [0010](./adr/0010-user-id-grants.md) [0011](./adr/0011-adapter-credential-modes.md) [0012](./adr/0012-agent-permissions.md)
- **观测深度**：[0015](./adr/0015-sinks-and-trace.md)

### 压力测试与调研

这不是 ADR 但是**重要旁证**，说明我们的决策是经过压力测试的：

- **[pressure-test/findings.md](./pressure-test/findings.md)**——12 场景 + ai-bookmarks 重设计后的 ADR 修订建议
- **[research/nocodb-analysis.md](./research/nocodb-analysis.md)**——NocoDB 深度对比（1129 行）
- **[research/tooljet-analysis.md](./research/tooljet-analysis.md)**——ToolJet（开源 Retool）深度对比（1043 行）：7 条 pneuma 独有 ADR 得到反证印证；borrow 了 `app_history` snapshot+delta+retention schema

### 领域模型（step 4 产出）

- **[spec/domain-model.md](./spec/domain-model.md)**——8 aggregate roots + 6 value objects + 5 domain services，配 6 张架构图（`spec/images/`）。step 5 MVP 实现的 spec。

### 场景验证清单（step 5 + 6 产出）

- **[spec/scenario-validation.md](./spec/scenario-validation.md)**——278 tests / 5 integration 场景文件 / 每个场景映射 ADR 承诺。"哪些设计已在代码里成立、哪些是纸面"一目了然。

### 当前位置（下一步做什么）

- **[milestone-1-snapshot.md](./milestone-1-snapshot.md)**——当前里程碑鸟瞰，适合团队先对齐“我们证明了什么 / 没证明什么 / 下一阶段是什么”。
- **[app-definition-milestone.md](./app-definition-milestone.md)**——当前已经闭合的 app-definition mutation + rollback + live demo 里程碑。
- **[team-share-demo.md](./team-share-demo.md)**——推荐团队分享路径。
- **[OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md)**——View rendering、热加载、治理缺口等未决问题。

---

## 项目状态（截至 2026-04-28）

- ✅ **28 条 ADR 已敲定**（0001-0028）+ 多条 amendments
- ✅ **1 次完整 pressure test**（12 场景 + ai-bookmarks redesign + 16 项改进建议）
- ✅ **2 次产品对比调研**：NocoDB（1129 行）+ ToolJet（1043 行）
- ✅ **Step 4 DDD**：domain-model.md + 6 张架构图
- ✅ **Step 5 + 6 MVP 实现**：`packages/core-domain/` / **278 tests green** / 5 integration scenarios / ADR-0018 UI↔Agent parity + ADR-0021 admin_delegated fail-closed 在测试里成立 · 场景清单见 [scenario-validation.md](./spec/scenario-validation.md)
- ✅ **阶段 B framework 化**：runtime / lifecycle / agent backend / viewer wire 基础设施可用
- ✅ **App definition milestone**：`definition.apply(add_table/add_table_column/add_operation/add_view/add_policy_rule)` + approval + policy-gated visibility + rollback validate/prepare/execute + live browser capability lifecycle demo
- ✅ **Operation contract cleanup**：object output contract、`invocation_method`、Operation surface classification、`reads_only` storage isolation
- 🔜 **下一候选**：Enterprise Governance Hardening（policy lifecycle、authorization、permission center、protocol recovery、transaction/concurrency）

---

## 与其他目录的分工

| 目录 | 存什么 | 风格 |
|---|---|---|
| `docs/superpowers/specs/` | v0 design spec 等**早期总纲 spec** | 长文档，一次成型 |
| `docs/superpowers/plans/` | milestone-level **实施计划**（M0-M4 已归档） | 任务步骤，做完归档 |
| `docs/architecture/` | **架构决策（ADR）+ 设计综述** | 决策原子化，可增可废但不删 |

`plans/` 回答"**怎么做**"，`architecture/` 回答"**为什么这样做** + **领域概念**"。

---

## 目录结构

```
docs/architecture/
  README.md              ← 你在看
  OPEN-QUESTIONS.md      ← 待决清单 + 未来计划
  milestone-1-snapshot.md
  app-definition-milestone.md
  team-share-demo.md
  adr/                   ← 架构决策记录（单点决策 + 推理）
    template.md          ← ADR 写作模板（MADR-lite）
    0001-*.md ...        ← accepted ADRs
  pressure-test/         ← ADR 压力测试产物
    README.md
    e-scenarios.md       ← 12 个场景的 ADR 应力测试
    c-redesign.md        ← ai-bookmarks 用新 ADR 重设计
    findings.md          ← 综合发现 + 行动项
  research/              ← 外部产品 / 技术调研
    nocodb-analysis.md   ← NocoDB 深度对比（1129 行）
  spec/                  ← 领域模型综述与场景验证
```

---

## ADR 是什么

一条 ADR = 一个**架构决策** + 它的**完整推理**。每条回答"为什么我们选 X 而不是 Y/Z"。

我们采用 **MADR-lite** 格式（Context / Options considered / Decision / Consequences）。详见 [adr/template.md](./adr/template.md)。

**ADR 和 design doc 的区别**：
- ADR 存**推理**（考虑了 A/B/C，选 C 因为...）
- design doc 存**状态**（目前的决定是 C）
- 当决策被推翻时，ADR 留存，新 ADR supersede 旧的——推理链是资产

---

## 所有 ADR 索引

### § 1 范围与愿景

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0001](adr/0001-archetype-scope.md) | Archetype scope — MVP 聚焦 A+B，D 作远期目标 | Accepted | 2026-04-23 |

### § 2 存储层（数据模型）

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0002](adr/0002-storage-typed-cells.md) | Storage 核心 — 类型化 Cell + 多态 data-ref | Accepted+amended | 2026-04-23/24 |
| [0003](adr/0003-transform-primitive.md) | Transform 作为 first-class 原语，与 Adapter 分开 | Accepted | 2026-04-23 |
| [0004](adr/0004-adapter-protocol.md) | Adapter 协议由 framework 定义，marketplace 在 meta-app | Accepted | 2026-04-23 |
| [0005](adr/0005-adapter-capabilities.md) | Adapter 能力声明与框架自动映射 cell 写操作 | Accepted+amended | 2026-04-23/24 |

### § 3 权限层

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0006](adr/0006-permission-granularity.md) | 权限粒度 — Table + Row + Column | Accepted | 2026-04-23 |
| [0007](adr/0007-permission-dsl.md) | 权限 DSL — 封闭词汇表的三元组 YAML | Accepted | 2026-04-23 |
| [0008](adr/0008-nl-bidirectional.md) | 权限 DSL 的双向 NL 能力 — evaluatePolicy / who_can | Accepted | 2026-04-23 |
| [0009](adr/0009-permission-default-posture.md) | 权限默认姿态 — Public 基线，按需收紧 | Accepted+amended | 2026-04-23/24 |
| [0010](adr/0010-user-id-grants.md) | User-id 粒度授权与 role 并列支持 | Accepted | 2026-04-23 |
| [0011](adr/0011-adapter-credential-modes.md) | Adapter credential 模式 — per-user / shared | Accepted | 2026-04-23 |
| [0012](adr/0012-agent-permissions.md) | Agent 权限 — Build-phase owner / Runtime 继承 | Accepted | 2026-04-23 |

### § 4 遥测层

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0013](adr/0013-telemetry-event-model.md) | 遥测事件模型 — 5 类事件 + Context 传播 | Accepted+amended | 2026-04-23/24 |
| [0014](adr/0014-audit-subset.md) | 审计子集 — Append-only，独立 sink 通路 | Accepted | 2026-04-23 |
| [0015](adr/0015-sinks-and-trace.md) | 可插拔 Sink 架构 + Trace scope 层级 | Accepted | 2026-04-23 |

### § 5 生命周期与双模式

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0016](adr/0016-dev-prod-data-isolation.md) | Dev = Prod 的可丢弃快照沙箱，数据线性单分支 | Accepted | 2026-04-23 |
| [0017](adr/0017-rollback-data-semantics.md) | Rollback 数据语义 — Destructive 时间倒流 + 强制披露 | Accepted+amended | 2026-04-23/24 |

### § 6 UI / Agent 语义对等

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0018](adr/0018-operations-as-primitive.md) | Operation 作为 first-class primitive — UI 与 Agent 的双绑定 | Accepted | 2026-04-23 |

### § 7 表达式与查询

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0019](adr/0019-where-clause-ast.md) | Where-clause AST — 跨 Policy / Query / Trigger 的共享表达式 | Accepted+amended | 2026-04-24 |
| [0020](adr/0020-query-dsl.md) | Query DSL — 声明式 YAML，Operation 的只读子类 | Accepted+amended | 2026-04-24 |

### § 8 Adapter credential 扩展

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0021](adr/0021-admin-delegated-credential.md) | `admin_delegated` credential mode + identity binding | Accepted | 2026-04-24 |

### § 9 Agent / Runtime live loop

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0025](adr/0025-agent-conversation-persistence.md) | Agent conversation persistence | Accepted | 2026-04-25 |
| [0026](adr/0026-agent-tool-call-binding.md) | Agent tool-call binding | Accepted | 2026-04-25 |
| [0027](adr/0027-live-event-stream-sse.md) | Live event stream via SSE | Accepted | 2026-04-25 |

---

## 写新 ADR

1. 决定编号：当前 `ls adr/0*.md | tail -1` 的数字 + 1
2. 文件名：`adr/NNNN-kebab-case-title.md`（四位数字）
3. 复制 [template.md](./adr/template.md)，按章节填写
4. 初始 `Status: Proposed`；评审通过后改 `Accepted`
5. 更新本文件的 ADR 索引表

## Amend 现有 ADR

当决策需要小修（不推翻主决定）：

1. 在原 ADR 的 `Status` 行加 `Last amended: YYYY-MM-DD`
2. 在文末加 `## Amendments` 段落
3. 每条 amend 带日期 + 触发源 + 具体修改 + 关联（如引用其他 ADR / 场景）
4. **不修改原 Decision / Options considered / Consequences 段的历史正文**——只追加

见 [0002](./adr/0002-storage-typed-cells.md#amendments) / [0005](./adr/0005-adapter-capabilities.md#amendments) / [0009](./adr/0009-permission-default-posture.md#amendments) / [0013](./adr/0013-telemetry-event-model.md#amendments) / [0017](./adr/0017-rollback-data-semantics.md#amendments) / [0018](./adr/0018-operations-as-primitive.md#amendments) / [0019](./adr/0019-where-clause-ast.md#amendments) / [0020](./adr/0020-query-dsl.md#amendments) 作 amend 样板。

## 废止与替换

重大决策被推翻：

- 旧 ADR `Status: Superseded by ADR-XXXX`
- 新 ADR 在 Context 里引用旧 ADR + 说明推翻理由
- **不删除**旧 ADR

## 语言

当前所有 ADR 使用**中文**。成熟后可整体翻英文对外发布，保留双版。
