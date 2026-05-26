# M49 Agent Debug Loop 设计

**状态：** Draft for implementation
**日期：** 2026-05-27
**Milestone：** M49

## 问题

M48 已经证明真实 code agent 可以修改受控的 Generated Application source，并且 Creation Host 可以把 diff 转成受治理的 proposal。缺失的是 proposal 之前真正的 coding core。

今天 Host 基本假设：

```text
Builder intent -> code agent 产出一个 draft -> prepare proposal
```

但真实 coding agent 的工作不是这样。它需要一个循环：

```text
编辑 draft -> 跑检查 -> 读取失败 -> 修复 draft -> 再跑检查
```

如果 framework 没有给这个循环提供形状，每个 Creation Host 都会自己实现尝试预算、失败摘要、retry prompt、debug trace，以及“agent 还能继续改”和“Builder 已经批准了这个 change”的边界。

## 决策

在 Code Change Lane 的 proposal preparation 之前，加入 **Agent Debug Loop** primitive。

```text
Builder intent
  -> BuildThread user turn
  -> Agent Debug Session
      attempt 1: agent edits draft -> checks fail
      attempt 2: agent reads failure -> edits draft -> checks pass
  -> prepareCodeChangeProposal()
  -> Builder approval
  -> applyCodeChangeProposal()
  -> post-apply deterministic verification / rollback
```

关键边界：

- **proposal 之前：** code agent 可以在 draft workspace 里，按照 Developer 声明的 budget 迭代。
- **proposal：** Builder 看到的是已经收敛、通过提案前检查的 coherent change set。
- **approval/apply 之后：** Host/framework 只做程序性验证和恢复。code agent 不应该静默继续编程。任何修复都必须是新的 debug loop 和新的 proposal。

## 术语

| 术语 | 含义 |
|---|---|
| `AgentDebugSession` | 围绕一个 Builder intent 的一次 proposal 前尝试预算。 |
| `DebugAttempt` | 一次 agent 针对 draft workspace 的运行，随后跑 checks。 |
| `DebugBudget` | Developer 声明的最大尝试次数 / wall-clock / output budget。 |
| `DebugCheck` | Developer 或 Host 声明的每轮 attempt 后检查。 |
| `DebugOutcome` | `passed` 表示可以进入 proposal preparation；其它结果都不应该弹 approval。 |
| `Corrective Proposal` | post-apply/publish 失败证据进入 BuildThread 后的新 proposal，不是 silent auto-repair。 |

## Core Contract

Core 拥有 backend-neutral 状态机：

```ts
export interface AgentDebugBudget {
  readonly max_attempts: number;
  readonly max_wall_time_ms?: number;
  readonly max_output_bytes?: number;
}

export interface AgentDebugCheck {
  readonly id: string;
  readonly description: string;
}

export interface AgentDebugAttemptRunner {
  (input: AgentDebugAttemptRunnerInput): Promise<AgentDebugAttemptRunnerResult>;
}

export interface AgentDebugCheckRunner {
  (input: AgentDebugCheckRunnerInput): Promise<AgentDebugCheckResult>;
}

export function runAgentDebugLoop(input: AgentDebugLoopInput): Promise<AgentDebugLoopResult>;
```

Core 不知道 Codex、opencode、Bun、React、Drizzle，也不知道某个 Generated Application 的项目形态。它只协调 attempts、checks、budget exhaustion 和 BuildThread evidence。

## Host Kit Contract

Host Kit 提供面向 code-change lane 的 convenience wrapper：

```ts
runHostKitCodeAgentDebugLoop({
  backend,
  thread_store,
  thread_id,
  cwd,
  initial_user_message,
  system_prompt,
  budget,
  checks,
})
```

这个 wrapper 把每次 attempt 映射到 `AgentBackend.runTurn`，把失败摘要反馈给下一轮 backend，并返回可以挂进 review packet 的 debug outcome。

Host 仍然拥有：

- 如何准备 / 复制 draft workspace；
- 哪些命令或 probes 算 checks；
- 如何摘要 app-specific failures；
- 如何在 Creation Host UI 里渲染进度。

## 失败规则

M49 必须保持 fail-closed：

```text
if debug budget exhausted:
  no proposal

if final pre-proposal checks fail:
  no approval prompt

if pre-apply checks fail:
  no source mutation

if post-apply checks fail:
  rollback source
  record failed_validate_rolled_back
```

debug loop 只改变前两种情况。Code Change Lane 仍然是 apply-time authority，负责后两种情况。

## Evidence Shape

每次 attempt 都应该产出可检查 evidence：

```ts
{
  session_id: "debug-...",
  attempt_index: 1,
  status: "failed_checks",
  agent: {
    backend_type: "codex-app-server",
    summary: "Added SLA fields but missed the view filter."
  },
  checks: [
    {
      id: "workflow-definition-valid",
      status: "failed",
      message: "view legal_queue references missing stage legal_review",
      output: "..."
    }
  ]
}
```

M49 不新增强制的 BuildThread turn kind，而是使用 `host_event`：

- `agent_debug_attempt`
- `agent_debug_session`

这样 BuildThread 仍然保持 portable，同时 Host UI 可以渲染 debug progress。

## Review Packet 集成

debug loop 通过后，后续 review packet 应包含：

- attempt count；
- passed checks；
- 若之前 attempt 失败，包含 latest failed checks；
- budget used；
- evidence refs。

Builder 应该理解 proposal 是：

> 已通过声明检查、可被审批的候选变更，
> 而不是 apply、preview、publish 或 end-user behavior 永不失败的保证。

## 非目标

- 不做 post-apply automatic code repair。
- 不让 framework 拥有具体 test runner。
- 不在 core 放 provider-specific backend message shape。
- 不承诺 proposal 是“无风险”的。
- 不开放 Scaffold Project boundary 之外的自主 coding workspace。

## 验收标准

1. Core tests 证明：
   - 第一次 attempt 通过会返回 `ok: true`；
   - 第一次 attempt 失败可以把失败反馈给第二次 attempt；
   - budget exhausted 返回 `ok: false`，且不声明 proposal readiness；
   - BuildThread 收到 attempt/session evidence；
   - failed attempts 不会追加 `agent_proposal`。
2. Host Kit tests 证明：
   - fake backend 可以在 failed check 后修复；
   - budget failure 会返回结构化 evidence；
   - successful result 可以进入 `prepareHostKitCodeChangeReview`。
3. Workflow App Studio 在真实 code-agent mode 使用 debug loop：
   - UI 展示 attempt progress；
   - 只有 debug checks 通过后才展示 proposal；
   - 真实 Codex app-server E2E 仍只修改 `src/app.ts`；
   - 故意失败任务在修复前不会出现 approval prompt。
4. 文档解释边界：
   - pre-proposal = agent debug loop；
   - proposal = verified-before-approval candidate；
   - post-apply = deterministic verification / rollback；
   - apply 之后的 repair = new proposal。
