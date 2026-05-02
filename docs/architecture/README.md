# pneuma-framework 架构

> 你正在看的是 pneuma-framework 的**架构决策 + 设计规格**目录。
> 如果你是第一次进来，请按下面的【3 分钟版】读到【10 分钟版】。

---

## 当前 canonical 文档

不要从临时 P-report 开始读。当前长期入口只有这几份：

| 文档 | 用途 |
|---|---|
| [milestone-1-snapshot.md](./milestone-1-snapshot.md) | M1 closed snapshot：governed app-definition primitive 已证明什么、未证明什么、下一阶段怎么切；含 verification matrix + P-slice ledger 附录 |
| [milestone-1-snapshot.zh-CN.md](./milestone-1-snapshot.zh-CN.md) | M1 snapshot 中文版：同一内容 + 中文配图，适合中文团队成员直接阅读 |
| [milestone-2-snapshot.md](./milestone-2-snapshot.md) | M2 closed snapshot：enterprise governance evidence 已证明什么、未证明什么、下一决策门 |
| [milestone-2-snapshot.zh-CN.md](./milestone-2-snapshot.zh-CN.md) | M2 snapshot 中文版：同一内容 + 中文配图，适合中文团队成员直接阅读 |
| [milestone-3-snapshot.md](./milestone-3-snapshot.md) | M3 closed snapshot：deployable app substrate 已证明什么、未证明什么、下一决策门 |
| [milestone-3-snapshot.zh-CN.md](./milestone-3-snapshot.zh-CN.md) | M3 snapshot 中文版：同一内容 + 中文配图，适合中文团队成员直接阅读 |
| [milestone-4-snapshot.md](./milestone-4-snapshot.md) | M4 closed snapshot：Knowledge Inbox reference app 已证明什么、未证明什么、下一 product-pressure gate |
| [milestone-4-snapshot.zh-CN.md](./milestone-4-snapshot.zh-CN.md) | M4 snapshot 中文版：同一内容 + 中文配图，适合中文团队成员直接阅读 |
| [milestone-5-snapshot.md](./milestone-5-snapshot.md) | M5 closed snapshot：Builder/Agent 如何通过 governed `definition.apply` 演进 Knowledge Inbox |
| [milestone-5-snapshot.zh-CN.md](./milestone-5-snapshot.zh-CN.md) | M5 snapshot 中文版：同一内容 + 中文配图，适合中文团队成员直接阅读 |
| [milestone-6-snapshot.md](./milestone-6-snapshot.md) | M6 closed snapshot：真实 backend-agent 如何通过 framework semantic tools 演进 Knowledge Inbox |
| [milestone-6-snapshot.zh-CN.md](./milestone-6-snapshot.zh-CN.md) | M6 snapshot 中文版：同一内容 + 中文图，适合中文团队成员直接阅读 |
| [milestone-7-snapshot.md](./milestone-7-snapshot.md) | M7 closed snapshot：真实 agent evolution 如何进入可见的 Builder approval loop |
| [milestone-7-snapshot.zh-CN.md](./milestone-7-snapshot.zh-CN.md) | M7 snapshot 中文版：同一内容 + live browser evidence，适合中文团队成员直接阅读 |
| [milestone-3-deployable-substrate-design.md](./milestone-3-deployable-substrate-design.md) | M3 design input：真实 backend / SQLite persistence / release artifact / Docker-first deployable substrate 的设计边界 |
| [milestone-3-deployable-substrate-design.zh-CN.md](./milestone-3-deployable-substrate-design.zh-CN.md) | M3 design 中文版：同一设计边界，适合中文团队成员直接阅读 |
| [m2-authorization-kernel-design.md](./m2-authorization-kernel-design.md) | M2 第一刀 design：test-first Authorization Kernel 设计 |
| [roadmap.md](./roadmap.md) | 项目唯一 roadmap：Stage 0–9，已闭合 / 进行中 / 未来 |
| [team-share-demo.md](./team-share-demo.md) | M1 0 预备知识团队分享包：开场叙事、runbook、live demo talk track、FAQ |
| [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md) | 仍未决、下一步需要讨论或写 ADR 的问题 |
| [spec/domain-model.md](./spec/domain-model.md) | 领域模型总览 |

文档卫生规则：实现过程日志、压力测试报告、产品调研、单 slice 进度 report 不长期保留；稳定结论进 milestone / ADR / open questions。早期工作的过程记录已 squash 进 git history（见 ADR-0029）。

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

ADR 是一个**可导航的网**，不是线性教程。推荐路径：

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

### 领域模型

- **[spec/domain-model.md](./spec/domain-model.md)**——8 aggregate roots + 6 value objects + 5 domain services，配 6 张架构图（`spec/images/`）。M1 实现的核心 spec。

> M1 的 verification matrix（每个 definition primitive × def 写入 / app_history / restart 发现 / policy gating / rollback / 边界）现在直接放在 [milestone-1-snapshot.md](./milestone-1-snapshot.md#m1-verification-matrix)。早期 step 4-6 的 scenario-validation 已 squash 进 git history。

### 当前位置（下一步做什么）

- **[milestone-1-snapshot.md](./milestone-1-snapshot.md)** / **[中文版](./milestone-1-snapshot.zh-CN.md)**——M1 closed canonical 入口；适合团队先对齐 governed app-definition primitive。
- **[milestone-2-snapshot.md](./milestone-2-snapshot.md)** / **[中文版](./milestone-2-snapshot.zh-CN.md)**——M2 closed snapshot；适合团队理解 enterprise governance evidence 的外部视角。
- **[milestone-3-snapshot.md](./milestone-3-snapshot.md)** / **[中文版](./milestone-3-snapshot.zh-CN.md)**——M3 closed snapshot；适合团队理解 deployable app substrate 的外部视角。
- **[milestone-3-deployable-substrate-design.md](./milestone-3-deployable-substrate-design.md)** / **[中文版](./milestone-3-deployable-substrate-design.zh-CN.md)**——M3 design input；解释为什么从 enterprise hardening 转向真实可部署 substrate。
- **[milestone-4-snapshot.md](./milestone-4-snapshot.md)** / **[中文版](./milestone-4-snapshot.zh-CN.md)**——M4 closed snapshot；适合团队理解 Knowledge Inbox reference app。
- **[milestone-5-snapshot.md](./milestone-5-snapshot.md)** / **[中文版](./milestone-5-snapshot.zh-CN.md)**——M5 closed snapshot；适合团队理解 Builder/Agent 如何演进真实 app。
- **[milestone-6-snapshot.md](./milestone-6-snapshot.md)** / **[中文版](./milestone-6-snapshot.zh-CN.md)**——M6 closed snapshot；适合团队理解真实 backend-agent 如何通过 framework semantic tools 演进 app，以及 live opencode trace 如何解释执行过程。
- **[milestone-7-snapshot.md](./milestone-7-snapshot.md)** / **[中文版](./milestone-7-snapshot.zh-CN.md)**——M7 closed snapshot；适合团队理解真实 agent evolution 如何从 runner auto-approval 进入 live Builder approval protocol。
- **[m2-authorization-kernel-design.md](./m2-authorization-kernel-design.md)**——M2 第一刀设计草案：用测试矩阵定义 framework authorization contract。
- **[team-share-demo.md](./team-share-demo.md)**——M1 推荐团队分享路径；M2 分享应先从 milestone-2 snapshot 组织。
- **[roadmap.md](./roadmap.md)**——Stage 0–9 的现实路径，含 M3 substrate 原型转向。
- **[OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md)**——View rendering、热加载、治理缺口等未决问题。

---

## 项目状态（截至 2026-05-02）

- ✅ **29 条 ADR 已敲定**（0001-0029）+ 多条 amendments
- ✅ **领域模型已立**：domain-model.md + 6 张架构图（[spec/](./spec/)）
- ✅ **Stage 1-3 闭合**：core-domain primitives / runtime infra / agent-in-loop wire（见 [roadmap.md](./roadmap.md)）
- ✅ **M1 — Stage 4 闭合**：governed app-definition primitive
  - `definition.apply(add_table / add_table_column / add_operation / add_view / add_policy_rule)`
  - approval + impact disclosure + policy-gated visibility + rollback validate/prepare/execute
  - live browser capability lifecycle demo（`examples/p5-viewer-approval-e2e?scenario=capability-lifecycle&variant=studio`）
  - verification matrix 见 [milestone-1-snapshot.md](./milestone-1-snapshot.md#m1-verification-matrix)
- ✅ **v0 design spec supersede**（[ADR-0029](./adr/0029-supersede-v0-design-spec.md)）：早期 lifecycle-script-centric framework 视角已废止；lifecycle 保留为 runtime 子系统
- ✅ **M2 — Stage 5 闭合**：Enterprise Governance Hardening — 见 [milestone-2-snapshot.md](./milestone-2-snapshot.md)
  - Authorization Kernel：`build_agent` 只能 propose，`framework_system` 才能执行 approved mutation
  - Approval Token Chain：Builder approval 被转换成 scoped single-use token
  - Raw Framework Ops Boundary：framework internal Operations 不暴露为 agent `op.*`，caller policy 不能重新放开
  - Durable Permission Ledger：request / response / token / execution / outcome 可追踪
  - Governance Evidence：viewer 能解释 proposer / approver / token hash / executor / status
  - Policy Semantics：explicit deny、deny-over-allow、default posture、rollback support
  - Recoverable Mutation：single in-process writer、durable dirty guard、repair status/reset
- ✅ **M3 — Stage 6 闭合**：Deployable App Substrate — 见 [milestone-3-snapshot.md](./milestone-3-snapshot.md)
  - Unified SQLite app database：rows / cells / definition rows / `app_history` / permission ledger 共用真实 substrate
  - Idempotent migration：`migrate.sh` 创建 `data/app.db`，migration tests 覆盖 fresh + rerun
  - Release manifest：`build.sh` 产出 web process、healthcheck、migration、volume contract
  - Docker-first runtime：reference template 能作为 Docker image 跑在 `/data/app.db` 上
  - Restart persistence：Operation API data 和 Builder-created `bookmarks.tags` capability 穿过 container restart 后仍被 `/api/config` rediscover
- ✅ **M4 — Reference App Prototype 闭合**：Knowledge Inbox — 见 [milestone-4-snapshot.md](./milestone-4-snapshot.md)
  - Product loop：capture source → review queue → status triage
  - App/Data/Substrate 三视角：end-user workflow、stored rows、live `/api/config`
  - Deterministic demo runner：`examples/m4-knowledge-inbox/run.ts --seed`
  - Restart persistence：SQLite local reopen + Docker mounted-volume restart
  - Browser QA：seeded App view、Data view、status filters、0 console errors
- ✅ **M5 — Builder Evolution 闭合**：Knowledge Inbox Priority Queue — 见 [milestone-5-snapshot.md](./milestone-5-snapshot.md)
  - Builder request -> deterministic Build-phase Agent proposal -> Builder approval -> governed `definition.apply`
  - `priority` column / `list_priority_queue` Operation / `priority_queue` View / public read PolicyRule
  - Restart rediscovery 后，App/Data/Substrate surfaces 都能解释 Priority Queue 的出现
- ✅ **M6 — Real Backend-Agent Evolution 闭合**：见 [milestone-6-snapshot.md](./milestone-6-snapshot.md)
  - Backend agent 通过 `AgentBackend.launch()` / `sendUserMessage()` 进入 app evolution loop
  - opencode wiring 支持 `pneuma_app` + `pneuma_framework` 双 MCP tool surface
  - `definition.apply` 通过 framework tool proxy 调用，approval / `framework_system` execution / restart rediscovery 仍成立
  - live opencode runner 有 completion gate，并写入 M6 execution trace：Builder request / tool_call / approval / tool_result / before-after diff
  - M6 留下的 live approval gap 已由 M7 补上；Semantic index track 仍后置
- ✅ **M7 — Live Agent Approval Protocol 闭合**：见 [milestone-7-snapshot.md](./milestone-7-snapshot.md)
  - `definition.apply` prompt 不再只由 runner auto-approve；Knowledge Inbox viewer 能显示 live approval card
  - Builder 点击 Allow/Deny 后，`permission-response` 通过既有 WebSocket 回到 framework permission pipeline
  - Allow path 创建 Priority Queue；Deny path 保持 app definition 不变
  - transcript 记录 Builder request / tool call / prompt / response / result / restart / completion，支持 before-work-after 讲解
  - 下一门建议在 real opencode interactive approval 与 release packaging hardening 中二选一

---

## 与其他目录的分工

`docs/architecture/` 是项目所有**长期文档**的唯一入口。早期的 `docs/superpowers/{specs,plans}/`（v0 design spec、M0-M4 实施计划等）大多已 squash 进 git history（见 [ADR-0029](./adr/0029-supersede-v0-design-spec.md)）；M5/M6/M7 的设计和计划仍保留为过程输入，但团队入口已经压缩进 milestone snapshot。`docs/architecture/` 与其他子目录的分工：

| 子目录 | 存什么 | 风格 |
|---|---|---|
| `adr/` | 架构决策（单点决策 + 推理） | 决策原子化，可增可 supersede 但不删 |
| `spec/` | 领域模型综述 + 架构图 | 长文档 + 图，一次成型，按需更新 |
| 顶层文件（`milestone-*.md` / `roadmap.md` / `OPEN-QUESTIONS.md` / `team-share-demo.md`） | 当前状态 + 即将做的事 | 时效性内容，闭合后压缩进下一份 |

## 目录结构

```
docs/architecture/
  README.md              ← 你在看
  OPEN-QUESTIONS.md      ← 待决清单
  milestone-1-snapshot.md / milestone-1-snapshot.zh-CN.md ← M1 closed canonical（含 verification matrix + P-slice ledger）
  milestone-2-snapshot.md / milestone-2-snapshot.zh-CN.md ← M2 closed snapshot（enterprise governance evidence）
  milestone-3-snapshot.md / milestone-3-snapshot.zh-CN.md ← M3 closed snapshot（deployable app substrate）
  milestone-4-snapshot.md / milestone-4-snapshot.zh-CN.md ← M4 closed snapshot（Knowledge Inbox reference app）
  milestone-5-snapshot.md / milestone-5-snapshot.zh-CN.md ← M5 closed snapshot（Builder evolution）
  milestone-6-snapshot.md / milestone-6-snapshot.zh-CN.md ← M6 closed snapshot（real backend-agent evolution）
  milestone-7-snapshot.md / milestone-7-snapshot.zh-CN.md ← M7 closed snapshot（live agent approval protocol）
  milestone-3-deployable-substrate-design.md / .zh-CN.md ← M3 design input
  roadmap.md             ← 项目唯一 roadmap（Stage 0-9）
  team-share-demo.md     ← 团队分享 runbook
  adr/                   ← 架构决策记录（单点决策 + 推理）
    template.md          ← ADR 写作模板（MADR-lite）
    0001-0029-*.md       ← accepted ADRs
  spec/                  ← 领域模型 + 架构图
    domain-model.md
    images/
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
| [0028](adr/0028-framework-event-protocol.md) | Framework event protocol for definition restart phases | Accepted | 2026-04-27 |

### § 10 文档与 framework 视角

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0029](adr/0029-supersede-v0-design-spec.md) | v0 design spec supersede — primitive 中心从 lifecycle scripts 迁到 Operation | Accepted | 2026-04-28 |

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
