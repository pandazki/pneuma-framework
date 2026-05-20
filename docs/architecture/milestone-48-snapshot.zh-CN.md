# Milestone 48 Snapshot

**Milestone:** M48，真实 Creation Host Example
**状态：** Closed
**日期：** 2026-05-20
**English version:** [milestone-48-snapshot.md](./milestone-48-snapshot.md)

## 决策

M48 在 Dev Board 压力样本之后，启动一条更干净的真实产品线。目标产品是 **Workflow App Studio**：

```text
pneuma-framework
  -> Workflow App Studio
  -> Vendor Intake Portal
  -> published Vendor Intake Portal vN
```

关键变化是：这个 example 不再只是 click-through demo，也不再只是 deterministic storyboard。它证明真实 code agent 可以修改 Generated App source，同时 Host 仍然掌握 source boundary、guardrails、review packet、Builder approval、apply、preview 和 publish。

## 改了什么

Workflow App Studio 现在建模了一个小型业务 workflow app：

- workflow fields、stages、actions、views、records 和 record history；
- 可以被修改并销毁的 preview data copies；
- 独立 end-user route 打开的 published app state；
- share artifact export 和 fork lineage；
- workflow definition 变化后的 data carry-forward；
- 受控 Generated App source module：`src/app.ts`。

code-agent lane 是刻意收窄的。Build-phase Agent 只能修改 `src/app.ts`，这个文件导出 literal `workflowPatch`。Guardrails 通过之后，Host 根据这份 source materialize runtime workflow definition。Derived workflow JSON、Host code、release state 和 framework internals 都不在 agent 可写边界内。

## 真实 Opencode 证据

最终 E2E 使用如下配置启动 Host：

```bash
PNEUMA_WORKFLOW_STUDIO_AGENT=opencode
PNEUMA_WORKFLOW_STUDIO_MODEL=openrouter/anthropic/claude-opus-4.7
PNEUMA_WORKFLOW_STUDIO_AGENT_TIMEOUT_MS=600000
```

随后 Playwright 通过浏览器驱动了两次 Builder 请求：

```text
1. Add legal review before approval.
   opencode changed: src/app.ts
   published v1 fields: contract_value
   published v1 stages: legal_review
   published v1 views: legal_queue

2. Add SLA tracking with due dates and overdue status.
   opencode changed: src/app.ts
   published v2 fields: due_date, sla_status
   published v2 views: sla_watch
```

最终 runtime page 证明 published application 渲染了 legal review、due date 和 SLA status。截图：`/tmp/workflow-real-opencode-e2e-8908.png`。

## 边界复核

### 值得进入 Framework / Host Kit 的部分

- Source boundary declarations 和 protected-path checks。
- Proposal 前、apply 前、apply 后的 guardrail orchestration。
- 带 diff、changed files 和 execution evidence 的 code-change review packets。
- BuildThread 中的 proposal、Builder decision 和 execution receipt turns。
- Preview rehearsal 和 data carry-forward evidence。
- Draft 修改 unauthorized files 时的 fail-closed handling。

### Host 拥有的部分

- Workflow domain model。
- `workflowPatch` 的具体 shape。
- Forms、queues、stages、actions 和 history 的 runtime rendering。
- SQLite workspace layout。
- Product copy、UX、share/fork surface，以及未来 provider integrations。

## 暴露出的 Gap

真实路径使用 `opencode run` 作为 CLI code-agent runner。现有 `backend-opencode` SDK/session path 对 framework Operation-style interaction 仍有价值，但本 milestone 发现它的 completion semantics 对 code-change lane 还不够可靠。后续工作不是削弱这个 example，而是 harden backend adapter，让未来 Host 不需要自定义 CLI orchestration 也能使用同一条 source-boundary workflow。

## 验证

Focused tests：

```bash
bun test examples/workflow-app-studio/workflow-app.test.ts examples/workflow-app-studio/workflow-studio.test.ts
```

结果：

```text
9 pass / 0 fail
```

Live E2E：

```text
Host: PNEUMA_WORKFLOW_STUDIO_AGENT=opencode
Browser driver: Playwright
Requests: legal review, SLA tracking
Changed files: src/app.ts only
Final published route: /app/workflow-app?lang=zh
```

这关闭了 M48 的目标：真实 opencode 修改 Generated App source，Host 拥有治理边界，published app 在 runtime 上证明改动真实生效。
