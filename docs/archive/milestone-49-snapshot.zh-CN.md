# Milestone 49 快照

**Milestone:** M49, Agent Debug Loop
**状态：** 已关闭
**日期：** 2026-05-27
**英文版：** [milestone-49-snapshot.md](./milestone-49-snapshot.md)

## 决策

M49 把 AI coding 的 debug loop 明确建模，并放在 Builder 批准之前：

```text
Builder intent
  -> code agent 修改 draft workspace
  -> Host 执行 Developer 声明的检查
  -> 失败检查作为反馈交回 agent
  -> agent 在预算内修复
  -> 通过检查的 draft 进入 Code Change Lane proposal
  -> Builder 批准一个完整一致的 change set
```

关键边界是：

- **proposal 之前：** code agent 可以在尝试次数、时间、输出大小预算内迭代；
- **proposal 阶段：** Builder 看到已经通过检查的候选、diff、重点改动和影响证据；
- **apply 之后：** Host/framework 只做确定性验证，失败则回滚；
- **apply 后修复：** 必须是新的 Builder intent、新的 debug loop、新的 proposal。

这避免了让 Builder 审批一个未检查 draft，也避免了审批之后 agent 静默继续修代码。

## 变更内容

### Framework Primitive

`@pneuma-framework/core` 现在通过新 subpath 暴露 `runAgentDebugLoop`：

```ts
import { runAgentDebugLoop } from "@pneuma-framework/core/agent-debug-loop";
```

这个 primitive 会记录 BuildThread `host_event`：

- `agent_debug_attempt`
- `agent_debug_session`

它不会写入 `agent_proposal`。Proposal 仍然只在 debug loop 通过后，由 Code Change Lane 创建。

### Host Kit Wrapper

`@pneuma-framework/host-kit` 现在暴露 `runHostKitCodeAgentDebugLoop`。

这个 wrapper 会：

- 每次尝试调用 `AgentBackend.runTurn`；
- 把失败检查摘要反馈给下一次尝试；
- 保持具体 draft 校验、workspace 创建、产品级检查仍由 Host 负责。

### Workflow App Studio 集成

Workflow App Studio 的默认 Codex app-server lane 现在会先通过 Agent Debug Loop，再展示 proposal。

UI 也更清晰地展示生命周期：

- Builder request 和 Generated App 运行面分开；
- agent 进度显示 draft workspace、backend 启动、源码检查、受控修改、draft 验证、proposal 生成；
- 原始 backend 日志折叠保留；
- 生命周期按钮反映草稿 / 等待批准 / 预览中 / 已发布状态；
- 中文 UI 会翻译固定 Host 证据和内置 workflow 标签，但不修改源码 diff。

## 真实 Code-Agent 证据

Live browser E2E 使用默认真实 Codex app-server lane 启动 Host：

```bash
PORT=8898 \
PNEUMA_WORKFLOW_STUDIO_AGENT=codex-app-server \
PNEUMA_WORKFLOW_STUDIO_AGENT_TIMEOUT_MS=600000 \
bun run --cwd examples/workflow-app-studio serve
```

Builder request：

```text
Add SLA due date, SLA status, and an SLA watch queue for overdue items.
Preserve existing records and do not modify Host code.
```

观察结果：

```text
backend: codex-app-server
changed files: src/app.ts
debug attempts: 1
debug check: draft-verification passed
proposal: Add SLA tracking to the workflow
published v1 fields: due_date, sla_status
published v1 view: sla_watch
published app record creation: passed
```

实际 Codex log 包含：

```text
Starting Codex app-server debug loop.
Codex debug attempt 1/2 started.
Running debug check draft-verification for attempt 1.
Draft verification passed after 1 debug attempt(s). Changed paths: src/app.ts.
Building governed code-change review packet for Builder approval.
Proposal is ready for Builder approval.
```

发布后的 v1 应用页面渲染了 SLA 字段，并且可以创建真实记录。

## 失败路径证据

自动化 fake-Codex 测试覆盖了修复路径：

```text
attempt 1: fake Codex 写入不完整 src/app.ts
check: draft-verification 失败
attempt 2: prompt 包含 previous_debug_failure
fake Codex 修复 src/app.ts
check: 通过
proposal: 只在修复后出现
BuildThread: 记录 agent_debug_session
```

这是 M49 的核心声明：失败 draft 不会变成 Builder approval prompt。

## 验证

Typecheck：

```bash
bun run typecheck
```

结果：

```text
passed
```

Focused package tests：

```bash
bun test packages/core/test packages/host-kit/test
```

结果：

```text
492 pass
0 fail
1700 expect() calls
```

Workflow App Studio tests：

```bash
bun test examples/workflow-app-studio/workflow-studio.test.ts examples/workflow-app-studio/workflow-app.test.ts
```

结果：

```text
14 pass
0 fail
85 expect() calls
```

Combined verification gate：

```bash
bun test packages/core/test packages/host-kit/test examples/workflow-app-studio/workflow-studio.test.ts examples/workflow-app-studio/workflow-app.test.ts
```

结果：

```text
506 pass
0 fail
1785 expect() calls
```

Browser E2E：

```text
deterministic lane: create -> ask agent -> approve -> preview -> publish -> open published app
real Codex lane: create -> ask agent -> debug loop -> approve -> preview -> publish -> create published record
```

Bundle check：

```bash
bun build examples/workflow-app-studio/src/ui/App.tsx --target browser --outfile /tmp/workflow-app-studio-m50.js
```

结果：

```text
browser bundle built successfully
```

## 边界 Review

### 值得进入 Framework / Host Kit

- Proposal 之前的带预算 debug attempts。
- 失败检查作为结构化 agent feedback。
- BuildThread 记录 attempt/session 证据。
- Backend-neutral vocabulary：attempt、check、session、proposal-ready。
- 常见 code-agent draft workflow 的 Host Kit wrapper。

### 仍由 Host 负责

- 具体 code-agent prompt。
- Draft workspace 创建和清理。
- 产品级校验，例如 workflow field/stage/view 一致性。
- UI copy 和视觉设计。
- Runtime 渲染和 workflow label 本地化。

## 不声明什么

M49 不声明：

- agent 的最终 draft 没有风险；
- post-apply failure 不会发生；
- framework 应该在 approval 之后自动修复；
- 所有 backend event shape 都已经归一；
- 已支持任意 generated React/TypeScript app。

更窄也更强的声明是：Creation Host 可以要求 AI coding attempts 先通过 Developer 声明的检查，再请求 Builder 批准一个完整一致的 change set。
