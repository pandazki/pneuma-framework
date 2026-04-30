# Roadmap

**Last updated:** 2026-04-30
**Status:** 项目当前唯一 roadmap，单一 source of truth
**Supersedes:** v0 design spec 的 M0–M6（见 [ADR-0029](./adr/0029-supersede-v0-design-spec.md)）

> 本文档**不**累积历史进度报告。已完成阶段只留一句话总结 + 关键 ADR 链接。
> 已闭合阶段的细节进 milestone snapshot；未闭合阶段的开放问题进 OPEN-QUESTIONS。

---

## 阶段总览

![Pneuma roadmap — Stage 0 through Stage 8 as a flowing timeline; original M1 visual; text below is authoritative for current stage status](./spec/images/m1-roadmap-river.png)

```text
Stage 0   Vision + Architecture           ✅  CLOSED
Stage 1   Core-domain primitives          ✅  CLOSED
Stage 2   Runtime + lifecycle infra       ✅  CLOSED
Stage 3   Agent-in-loop wire              ✅  CLOSED
Stage 4   App-definition primitive        ✅  M1 closed
Stage 5   Enterprise governance hardening ✅  M2 closed
Stage 6   Hot reload + custom code         ⏳
Stage 7   Multi-tenant + Runtime Agent     ⏳
Stage 8   Pneuma 3.0 dogfood (modes)       ⏳
```

> 上图是 share-deck 主视觉；text-only 阅读器看下面的 ASCII 块。

---

## Stage details

### Stage 0 — Vision + Architecture ✅

定位：让 Builder 通过对话创造应用的 framework，而不是更快写代码的工具。

- ADR 集合、12 场景 pressure test、领域模型 + 6 张架构图。
- archetype scope 锁定 A + B；C/D 留接口（[ADR-0001](./adr/0001-archetype-scope.md)）。

### Stage 1 — Core-domain primitives ✅

8 个 first-class primitive 落地：Table / CellType / Ref / Adapter / Transform / Operation / WhereClause / PermissionContext。

- 5 domain services + 6 value objects（见 [`spec/domain-model.md`](./spec/domain-model.md)）。
- 关键 ADR：[0002](./adr/0002-storage-typed-cells.md), [0003](./adr/0003-transform-primitive.md), [0007](./adr/0007-permission-dsl.md), [0018](./adr/0018-operations-as-primitive.md), [0019](./adr/0019-where-clause-ast.md)。

### Stage 2 — Runtime + lifecycle infra ✅

`packages/runtime/` HTTP gateway；`packages/core/` lifecycle / process / agent-backend / wire-protocol / shadow-git。

- `/api/config` 暴露 Operation introspection；SSE 实时事件流；wire protocol 携带 framework events。
- 关键 ADR：[0026](./adr/0026-agent-tool-call-binding.md), [0027](./adr/0027-live-event-stream-sse.md), [0028](./adr/0028-framework-event-protocol.md)。

### Stage 3 — Agent-in-loop wire ✅

opencode backend 接入；MCP bridge 把 template Operation 暴露给 agent；第一次完整 round-trip：Builder 输入 → Agent tool-call → Operation 执行 → viewer 实时更新。

- 关键 ADR：[0025](./adr/0025-agent-conversation-persistence.md), [0026](./adr/0026-agent-tool-call-binding.md)。

### Stage 4 — App-definition primitive ✅ (M1 closed)

**已闭合**——细节见 [`milestone-1-snapshot.md`](./milestone-1-snapshot.md)。

简介：5 个系统级定义表（`pneuma_tables / pneuma_table_columns / pneuma_operations / pneuma_views / pneuma_policy_rules`）；`definition.apply` 5 个 mutation；approval / impact disclosure / rollback validate-prepare-execute / app_history attribution；request-scoped View visibility policy；live browser demo（capability-lifecycle studio variant）。

**M1 闭合时留下的 Stage 4 边界**（部分已在 Stage 5 处理；完整状态看 M2 snapshot）：

- 仍依赖 restart，无 hot reload。（仍开放）
- 仅支持 query-backed Operation；不支持 builder-authored code handler。（仍开放）
- 仅支持 additive allow PolicyRule；无 deny / edit / delete。（M2.5 已处理核心语义）
- 不支持 restored definition rollback。（M2 rollback 覆盖面已扩展，但 full restore 仍需继续验证）
- 跨 store 原子性、并发 definition 写未保证。（M2.6 已有 recoverable dirty guard；full ACID / distributed concurrency 仍开放）
- 自定义 React 组件分发未支持。（仍开放）

### Stage 5 — Enterprise governance hardening ✅ (M2 closed)

**主题：让 primitive 在企业级治理需求下扛得住，不再加新 primitive。**

Closed snapshot: [`milestone-2-snapshot.md`](./milestone-2-snapshot.md) is the team-facing state after M2.8 closure hardening. The first design cut remains [`m2-authorization-kernel-design.md`](./m2-authorization-kernel-design.md).

Workstream 状态（见 [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md) "Governance Gaps"）：

| Workstream | 当前状态 |
|---|---|
| Authorization model | Authorization Kernel + principal boundary 已落地；framework 权限是开发期扩展边界，不是 Builder 可改的 runtime policy。 |
| Approval execution chain | Builder approval -> scoped single-use approval token -> `framework_system` execution 已落地。 |
| Raw framework op boundary | Framework internal Operations 不再作为 agent `op.*` 暴露；framework policy injection 覆盖同 ID caller policy rule。 |
| Permission center | Durable permission ledger + v0 summary/search/filter viewer panel 已落地；生产级 retention、assignment、bulk actions、admin workflow、policy authoring 仍未做。 |
| Policy lifecycle | add/update/delete、explicit deny、deny-over-allow、default posture、explain、rollback support 已落地；产品化 authoring/review surface 仍未做。 |
| Protocol hardening | ADR-0028 framework events 已落地；Operation bridges 已按 `invocation_method` 分流 GET/POST；持久 replay、versioned envelopes、hard-restart tool-call continuity 仍未做。 |
| Transaction & concurrency | M2.6 已有单进程 writer latch + durable dirty guard；cross-store ACID、DB CAS、distributed lock 仍未做。 |
| Pressure-test app | 第二个 reference app 仍未做，用于检验 primitive 是否超出 Reader Bookmarks。 |

**M2 已闭合。下一团队决策门**：选择下一个最大缺口：Permission Center 产品化、protocol hardening、cross-store / distributed concurrency，或 IAM / threat model。见 [`milestone-2-snapshot.md`](./milestone-2-snapshot.md#next-decision-gate)。

### Stage 6 — Hot reload + custom code ⏳

- definition 变更不再依赖 restart：先支持 Operation 与 PolicyRule（rediscovery 即可），再考虑 schema 与 View。
- builder-authored code handler：how does framework approve agent-authored handler code? sandbox? capability allowlist?
- custom view component 分发：how does template ship custom React components for views, while keeping `pneuma_views` 治理通路？

### Stage 7 — Multi-tenant + Runtime Agent ⏳

- ADR-0001 留好的 archetype C 接口正式落地：per-tenant credential / isolation / 审计分轨 / 计费度量。
- Runtime Agent 真正在 Release artifact 里跑起来——双轨 agent（Build-phase + Runtime）首次真验证。
- ADR-0011 (per-user / shared adapter credential) 在生产真用上。

### Stage 8 — Pneuma 3.0 dogfood (modes) ⏳

- pneuma-skills 2.x 的 10 个 mode 改造为 pneuma-framework 上的 template。
- 验证 framework 能完整覆盖 webcraft / gridboard / doc / slide 等差异极大的模板形态——dogfood 是 framework 完备性的最终判决。

---

## 约束与原则

**M2 没有新增 primitive。** M1 已经把"app definition is data"立住了；M2 是把这条 primitive 在企业级语境下扛住，而不是再加新 primitive。

**Reader Bookmarks 是教学 demo，不是产品。** 长期保留作为 framework 自检 + 团队 onboarding 的 canonical demo；它的简单是有意为之。

**lifecycle 子系统保留为 runtime 实施层。** 见 [ADR-0029](./adr/0029-supersede-v0-design-spec.md)。`dev.sh / build.sh / deploy.sh` 等仍然是 pneuma-app 启动 / 构建 / 部署的实施层；不在 framework primitive 故事里。

**模板与 example 状态标签。** `templates/` 6 项 + `examples/` 10 项的状态分类（canonical / reference / archived / scratch）维护在 [`templates/README.md`](../../templates/README.md) 与 [`examples/README.md`](../../examples/README.md)。新 contributor 应先读这两份再选起步路径，避免把 dormant 模板当 canonical 路径读。
