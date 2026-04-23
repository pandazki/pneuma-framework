# ADR-0001: Archetype scope — MVP 聚焦 A+B，D 作远期目标

**Status**: Accepted
**Date**: 2026-04-23
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: product, scope, vision

---

## Context

`CLAUDE.md` 的 vision 句子同时点了两头：

> Let anyone — from a solo individual building a personal pomodoro, to a SaaS team offering dashboard self-service to their users — ship an application where the user creates the application by talking

这两头——**个人自用**与 **SaaS 给外部客户**——对框架的工程负担差距巨大。是否支持多租户、是否需要 Runtime Agent、权限模型复杂度、部署目标多样性、auth/计费/观测——每一档都在多个维度上拉开量级。

MVP 必须在这些维度上做**明确选择**，否则架构会落入"什么都想支持、什么都做不扎实"的陷阱。同时，M4 阶段已经暴露出的问题（v0 template 把 Dev 和 Release 混用、workspace 非自包含、Runtime Agent 承诺未实现）表明：**架构决策里含糊就真会落到代码里含糊**。因此这个决策是后续所有 ADR 的前提——它决定哪些能力必须在 day 1 就埋好概念、哪些可以推迟。

---

## Options considered

我们把可能的终态应用形态分为四档：

### Archetype A: Solo personal tool
个人给自己做工具（番茄钟、书签、日记、个人 dashboard）。Developer ≡ Builder ≡ End User 三合一。

- **Pro**: 实现负担最低；pneuma 的 first customer 天然是框架开发者自己
- **Con**: 验证不了 "Builder ≠ End User" 的模式分离设计；与传统 low-code / scaffold 工具差异化不强

### Archetype B: 团队内部工具
一人搭、5-50 人用。Builder 是单一主导者，End Users 是被信任的同事。轻量 auth（OAuth/magic link/企业 SSO），单实例多用户但非真多租户。

- **Pro**: pneuma 差异化最强的位置——对话改需求对小团队痛点最契合；强制验证双模式设计、Runtime Agent 场景真实存在
- **Con**: 需要最小 auth + user identity 层；权限模型要可用而非只可谈；runtime agent 概念真正开始发力

### Archetype C: SaaS 产品
创业者做一个 app，卖给多家企业客户。每个客户租户有 Builder 席位（做 customization）+ 若干 User 席位（纯使用）。严格 auth、多租户隔离、计费、成本控制。

- **Pro**: 产品形态最饱满，Runtime Agent 作为主要交互方式价值最高
- **Con**: auth / tenant 隔离 / 计费 / 成本控制每一项单拿都是数月工程；v1 直接做会直接拖死

### Archetype D: 白标平台嵌入
pneuma 作为基础设施嵌入另一个 SaaS 平台，该平台再卖给自己的客户（类似 Retool/Airtable 做 embedded 给自家用户用的模式，但换成 AI-native）。

- **Pro**: 终极愿景；pneuma 此时是"agent-native 的应用基础设施"
- **Con**: 要求 A/B/C 全部已就位，然后再叠一层 meta-app 管理层

---

MVP 的交付组合有四种可能：

- **策略 1**: 只做 A
- **策略 2**: 做 A + B
- **策略 3**: 做 A + B + C
- **策略 4**: 全部做

---

## Decision

选择 **策略 2：MVP 聚焦 archetype A + B**。同时，在此前提下，对架构定下两条约束：

### 约束 1：D 的远期目标必须在底层抽象里**预留接口**

即使 MVP 不实现多租户 / 计费 / 跨租户 adapter 生态，**所有底层原语从 day 1 就必须 multi-tenant ready**——比如：

- `PermissionContext` 包含 `tenant_id`（MVP 可为 `"default"` 常量但字段存在）
- Event 事件携带 tenant 维度
- Adapter 协议区分"这个 credential 在哪个 tenant 作用域"

这样将来加多租户是**配置切换**，不是**架构重构**。

### 约束 2：C 不强制实现，但其必要接口从 day 1 就位

C 特有的东西（严肃 auth、审计）必须在设计里留位：

- 可插拔 IdP（MVP 可是单用户 owner，但 provider 接口就绪）
- 审计 event 子集（ADR-0014 单独详述）与 debug event 分轨
- Adapter credential 的 per-user / shared 两种模式（ADR-0011）都要支持

### MVP 具体 Scope Boundaries

| 维度 | MVP 做 | MVP 留接口、不实现 | MVP 不考虑 |
|---|---|---|---|
| Auth | 单用户 owner + 匿名 | IdP 可插拔（OIDC/SAML） | SSO、MFA、SCIM |
| 多租户 | 单租户（`tenant_id = "default"`） | tenant 维度在 Ctx/Event 里存在 | 真正的隔离、迁移、计费 |
| Runtime Agent | 可选（template 决定），至少 1 个 reference 模板带 | 可插拔 agent backend 架构（复用现有 AgentBackend）| Agent marketplace、跨 agent 协作 |
| Adapter | 2 个 reference adapter（例：file、http） | Adapter 协议 + credential mode 声明 | Adapter marketplace、审核流程 |
| 部署 target | 本地 docker | Deploy target 抽象、build manifest 通用化 | k8s、CF Workers、App Store |
| 权限 | Triple DSL + public 基线（ADR-0005~0010） | 所有 enforcement hook 点就位 | 细粒度审批流、动态授权撤销 |
| 观测 | stdout + NDJSON + audit.ndjson（ADR-0011~0014） | Pluggable sink 接口 + OTEL 契约 | 计费指标、异常追踪 SaaS |

---

## Consequences

### Positive
- **MVP 周期可控**：4-6 个月能交付可用产品，而非全面追求 D 所需的 12+ 个月
- **Archetype B 验证位置强**：小团队 workflow 工具是 pneuma 差异化最明显的场景——对话改需求的痛点解决得好就赢一半
- **架构无债**：所有底层抽象从 day 1 就是 "multi-tenant ready、IdP pluggable、sink pluggable"，避免走捷径后积累技术债
- **MVP 用户即开发者**：archetype A 的早期用户就是框架作者自己（正在发生），反馈循环短

### Negative / Risks
- **C/D 真实落地时仍会暴露新问题**：比如跨租户 adapter 缓存、计费度量单位、agent 并发成本分摊——现有 ADR 可能需要 amend
- **B 的 auth 需求很快会顶到 MVP 的 IdP 接口** —— 得想清楚"MVP 单用户"与"真 OAuth"之间的切换点是否顺畅
- **架构约束的"留接口"是成本**——所有字段/类型都带 tenant / sink / credential-mode 字段即便 MVP 用不上，增加基础面的复杂度。需要在 "留得够用" 和 "不过度设计" 之间保持克制

### Follow-ups
- [ADR-0002~0004] 将确认存储原语在这个 archetype scope 下的形状
- [ADR-0005~0012] 将确认权限 / adapter / agent 层的具体决策
- [ADR-0013~0015] 将确认遥测 / 审计层
- **ADR-TBD: Multi-tenancy data model**（何时真做 C，single→multi tenant 的切换点）
- **ADR-TBD: Identity provider pluggability**（MVP 单用户如何透明升级到 OIDC）
- 进 `open-questions.md`：SaaS 定价模型下 pneuma-app 的度量单位是什么（per-user / per-request / per-agent-token / per-mutation）
