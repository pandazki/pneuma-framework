# Workflow App Studio

**状态：** M48 真实 Creation Host example，浏览器 E2E 垂直切片已完成
**English version:** [README.md](./README.md)

Workflow App Studio 是 Product Creation Host 压力样本关闭之后的新 example。它从干净的产品 brief 开始，而不是继续扩展 Dev Board Builder。

Alice 作为 Developer，交付一个用于构建小型业务流程应用的本地 Creation Host。Bob 作为 Builder，用这个 Host 创建真实应用，例如 **Vendor Intake Portal**。Generated Application 拥有 forms、queues、record detail、stages、role-gated actions、preview data、publish state、share artifacts 和 fork lineage。Charlie 可以 fork Bob 分享的 app，并演进出自己的独立版本。

## 产品目标

这个产品不是“让 agent 任意改文件”。这个产品是：

```text
Builder describes a business workflow
  -> Build-phase Agent proposes a workflow app shape
  -> Builder reviews source diff, data migration, and runtime impact
  -> Host applies the change through guarded lanes
  -> Builder previews the generated app with disposable data
  -> Builder publishes a usable workflow app
  -> another Builder can fork the artifact and evolve a new lineage
```

它比 Dev Board 更适合作为下一阶段压力目标，因为 generated app 必须建模：

- entities 和 fields；
- forms 和 queues；
- stage graphs；
- role-gated actions；
- record history；
- workflow 变化后的 data carry-forward；
- preview data 和 published data 的不同语义。

## 已实现的垂直切片

当前切片刻意 domain-first、test-first：

```text
WorkflowAppDefinition
  -> fields
  -> stages
  -> actions
  -> views
  -> records
  -> transitions
  -> migration/carry-forward
```

已覆盖的故事：

```text
Bob creates Vendor Intake Portal.
Bob asks the agent to add legal review before approval.
The definition gains legal_review, contract_value, and legal actions.
Existing records carry forward without data loss.
Runtime transitions enforce role and stage requirements.
```

Host UI 实现：

- React browser entry：`src/ui/App.tsx`；
- lucide icons 用于 actions、tabs、project switching 和状态表达；
- shadcn-style local component classes 用于 buttons、popovers、cards、tabs 和 templates；
- Builder-facing Host surface 不再使用浏览器原生 `select`。

运行测试：

```bash
bun test --cwd examples/workflow-app-studio
```

使用 deterministic draft generation 启动本地 Creation Host：

```bash
PORT=8898 bun run --cwd examples/workflow-app-studio serve
```

使用真实 opencode code-agent lane 启动同一个 Host：

```bash
PORT=8898 \
PNEUMA_WORKFLOW_STUDIO_AGENT=opencode \
PNEUMA_WORKFLOW_STUDIO_MODEL=openrouter/anthropic/claude-opus-4.7 \
PNEUMA_WORKFLOW_STUDIO_AGENT_TIMEOUT_MS=600000 \
bun run --cwd examples/workflow-app-studio serve
```

opencode lane 是刻意收窄的。Agent 只能修改 Generated App draft workspace 里的 `src/app.ts`。这个文件导出一个 literal `workflowPatch`，Host 在 guardrails 通过之后，根据这份 source materialize runtime workflow。Agent 不修改 Host code、derived `workflow.json`、release state 或 framework internals。

## 验收目标

Workflow App Studio 现在已经支持这条端到端浏览器工作流：

1. Alice 的 Host 暴露 stack/profile 和 scaffold constraints。
2. Bob 从产品目标创建 Vendor Intake Portal。
3. Bob 请求 Build-phase Agent 做一个有意义的 workflow change。
4. Agent 修改受控 Generated App source，而不是 Host code。
5. Host 展示 interpretation、proposal、diff、migration impact 和 confirmation。
6. Builder approval 应用 proposal。
7. Preview 作为独立 app 页面打开，并使用 disposable data。
8. Published app 作为独立 End User 页面打开。
9. End User 创建 records，并通过 role-gated workflow actions 推进状态。
10. Bob 导出 no-secret share artifact。
11. Charlie fork artifact 成独立 app，并继续演进。

当前 E2E 路径验证了：

- Bob 创建并预览 `Vendor Intake Portal@v0`。
- Preview data 是一次性沙盒数据，和 published app 数据隔离。
- Bob 发布 v0，End User 在 published app 中创建并流转真实 workflow record。
- Bob 请求加入 legal review，review proposal evidence，批准，预览并发布 v1。
- Generated app form 由 workflow definition fields 驱动，因此 v1 后 runtime app 里会出现 `contract_value`。
- Bob 导出 no-secret share artifact。
- Charlie fork artifact，并在 fork 上独立演进 SLA tracking。
- 真实 opencode lane 可以产出两次受治理 source change：
  - legal review：`contract_value`、`legal_review`、`legal_queue`；
  - SLA tracking：`due_date`、`sla_status`、`sla_watch`。

## 真实 Code-Agent 证据

收口 E2E 使用 `PNEUMA_WORKFLOW_STUDIO_AGENT=opencode` 启动本地 Host，并通过浏览器完成两次 Builder 请求。两次请求都满足：

- opencode 修改的是允许边界内的 Generated App source：`src/app.ts`；
- 如果 draft 修改边界外文件，Host 会 fail closed；
- Host 在 approval 前计算 source diff 和 review packet；
- Builder approval 之后，Host Kit code-change lane 才应用 source；
- preview / publish 使用改后 source materialize 出来的 workflow；
- published app 真实渲染新增 fields、stages 和 views。

验证快照：

```text
proposal 1: Add legal review before approval
changed files: src/app.ts
published v1 fields: contract_value
published v1 stages: legal_review
published v1 views: legal_queue

proposal 2: Add SLA tracking with due dates and overdue status
changed files: src/app.ts
published v2 fields: due_date, sla_status
published v2 views: sla_watch
```

本地运行截图：`/tmp/workflow-real-opencode-e2e-8908.png`。

## 边界

Framework / Host Kit 应拥有：

- BuildThread 和 proposal receipts；
- source-boundary 与 guardrail orchestration；
- approval route evaluation；
- preview data rehearsal semantics；
- publish / rollback state；
- durable evidence vocabulary。

Workflow App Studio 应拥有：

- workflow app domain model；
- generated app renderer；
- local SQLite workspace layout；
- concrete profile choices；
- product copy 和 UX；
- 未来产品需要的 provider integrations。

## 目前还不声称什么

自动化测试仍然使用 deterministic / fake-backend draft agent，以保证可重复。manual/live E2E 现在已经证明：真实 opencode CLI code-agent 可以修改受控 Generated App source，并穿过同一条 Host guardrail / approval / apply 路径。

这一版还不声称 hosted auth、cloud deployment、marketplace transport、广泛 provider integrations、任意 generated React/TypeScript editing，或者 production-grade opencode SDK lifecycle semantics。这次也暴露了一个有价值的 framework gap：对这个 code-change lane 来说，opencode CLI path 是可靠的；现有 backend-opencode SDK/session path 还需要更明确的 completion semantics，之后才能替换 example 里的 CLI runner。
