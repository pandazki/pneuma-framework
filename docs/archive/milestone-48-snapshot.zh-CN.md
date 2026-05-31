# Milestone 48 Snapshot

**Milestone:** M48，真实 Creation Host Example
**状态：** Closed，已在 Codex app-server 默认路径后稳定化
**日期：** 2026-05-20
**稳定化日期：** 2026-05-26
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

## 真实 Code-Agent 证据

M48 现在把 **Codex app-server** 作为 Workflow App Studio 的默认真实 code-agent lane。Developer 直接启动本地服务时会默认使用 Codex，除非显式切换到 deterministic 或 opencode：

```bash
PORT=8898 bun run --cwd examples/workflow-app-studio serve
```

默认 Codex 路径完成了这条浏览器 E2E：

```text
Request: Add SLA tracking with due dates and overdue status.
Backend: codex-app-server
Changed files: src/app.ts
Published v1 fields: due_date, sla_status
Published v1 active route: /app/vendor-intake-portal
```

UI 现在把 backend 工作过程整理成 Builder 可读的进度摘要：准备草稿工作区、启动 code agent、检查源码、修改受控源码、验证草稿、生成提案。原始 stdout / stderr / tool events 默认折叠，只在需要检查时展开。稳定化运行截图：

```text
/tmp/workflow-codex-default-final-ui.png
/tmp/workflow-codex-default-published.png
```

早期 opencode 路径仍然是受支持的替代 backend，并证明了两次变更的压力路径：

早期 opencode E2E 使用如下配置启动 Host：

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

该 runtime page 证明 published application 渲染了 legal review、due date 和 SLA status。截图：`/tmp/workflow-real-opencode-e2e-8908.png`。

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

M48 现在拥有两种真实 backend shape：opencode CLI 和 Codex app-server JSON-RPC。Host 表面希望无论 backend event shape 如何，都能呈现同一套 proposal、progress、evidence 和 guardrail 语义。这进一步确认了后续 framework 需要：为 Code Change Lane 提供 backend-neutral code-agent progress / turn contract，而不是让每个 Host 自己解析日志。

## 验证

稳定化后的 focused tests：

```bash
bun test --cwd examples/workflow-app-studio
bun build examples/workflow-app-studio/src/ui/App.tsx --target browser --outfile /tmp/workflow-app-studio-react.js
```

结果：

```text
13 pass / 0 fail
browser bundle built successfully
```

Live E2E：

```text
Host: default agent mode, codex-app-server
Browser driver: Playwright
Request: SLA tracking
Changed files: src/app.ts only
Final published route: /app/vendor-intake-portal
```

这稳定化了 M48 目标：真实 code agent 修改 Generated App source，Host 拥有治理边界，published app 在 runtime 上证明改动真实生效。Codex app-server 是默认 lane；opencode 保留为替代压力证据。
