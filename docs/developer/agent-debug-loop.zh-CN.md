# Agent Debug Loop

**读者：** 正在构建带 code-changing Build-phase Agent 的 Creation Host Developer。
**英文版：** [agent-debug-loop.md](./agent-debug-loop.md)
**引入：** M49

Agent Debug Loop 是 proposal / approval 之前的 coding loop：

```text
Builder intent
  -> agent 修改 draft workspace
  -> Host 运行 checks
  -> failed checks 变成给 agent 的反馈
  -> agent 修复 draft
  -> checks 通过
  -> Code Change Lane 准备 proposal
```

它位于 [Code Change Lane 中文版](./code-change-lane.zh-CN.md) 之前。Code Change Lane 仍然负责 proposal evidence、Builder approval、apply、stale-base checks、post-apply checks 和 rollback。

## 为什么需要它

M48 已证明真实 code agent 可以修改受控 Generated Application source。但一次 draft attempt 不足以代表真实 coding work。Agent 需要在请求 Builder approve 之前，看到 type error、build failure、product-specific validation failure 和 runtime smoke failure。

framework 边界是：

- **proposal 之前：** agent 可以按照 Developer 声明的 budget 迭代；
- **proposal：** Builder 看到的是已经收敛、通过声明检查的候选变更；
- **apply 之后：** Host/framework 只做程序性验证和 rollback；
- **apply 之后的 repair：** 新 debug loop，新 proposal。

## Core API

如果 Host 已经有运行 agent attempt 和运行 checks 的方式，可以直接使用 `runAgentDebugLoop`：

```ts
import { runAgentDebugLoop } from "@pneuma-framework/core/agent-debug-loop";

const debug = await runAgentDebugLoop({
  session_id: "debug-proposal-1",
  budget: { max_attempts: 3, max_wall_time_ms: 120_000 },
  checks: [{ id: "typecheck", description: "Run TypeScript." }],
  thread_store,
  thread_id,
  run_attempt: async ({ attempt_index, feedback }) => {
    await runYourAgent({
      prompt: feedback
        ? `Previous attempt failed:\n${feedback.summary}\nRepair the draft.`
        : "Implement the Builder request.",
    });
    return { ok: true, backend_type: "codex-app-server", summary: `attempt ${attempt_index} completed` };
  },
  run_check: async () => {
    const result = await runTypecheck();
    return { ok: result.ok, message: result.summary, output: result.output };
  },
});

if (!debug.ok) {
  // 不要请求 Builder approval。
  return debug;
}
```

`runAgentDebugLoop` 会在 BuildThread 里记录 `host_event` turns：

- `agent_debug_attempt`
- `agent_debug_session`

它不会追加 `agent_proposal` turn。proposal 只应该在 debug loop 通过，并且 Host 调用 `prepareCodeChangeProposal` 后出现。

## Host Kit API

常见 code-agent 场景可以使用 `runHostKitCodeAgentDebugLoop`：

```ts
import { runHostKitCodeAgentDebugLoop } from "@pneuma-framework/host-kit";

const debug = await runHostKitCodeAgentDebugLoop({
  app_id,
  backend,
  thread_store,
  thread_id,
  cwd: draftRoot,
  initial_user_message: builderMessage,
  system_prompt,
  budget: { max_attempts: 2 },
  checks: [
    {
      id: "draft-verification",
      description: "Generated app source is valid.",
      run: async () => verifyDraft(draftRoot),
    },
  ],
});
```

这个 wrapper 每次 attempt 调用 `AgentBackend.runTurn`，并把 failed check summaries 反馈给下一次 attempt。Host 仍然拥有 draft workspace creation、具体命令、product-specific verifier、preview lifecycle 和 UI rendering。

## 失败语义

Agent Debug Loop 必须 fail closed：

```text
budget exhausted      -> no proposal
checks still failing  -> no proposal
attempt runner fails  -> retry until budget is exhausted
```

它不会削弱 apply-time safety：

```text
pre_apply failure   -> no source mutation
post_apply failure  -> rollback source and record failed_validate_rolled_back
```

不要让 code agent 在 approval 之后静默继续改代码。如果已批准 change 在 apply、preview、publish 或 rollout 阶段失败，应把失败记录进 BuildThread；如果 Builder 想继续，再启动 corrective proposal。

## Builder 应该看到什么

Builder 不应该把每个 raw token 都当成一个决策点。一个好的 Creation Host 应展示：

- attempt count 和 budget；
- failed check summaries；
- 最终 passing checks；
- proposal diff 和 review packet；
- “debugging draft”和“awaiting approval”的清晰区别。

这样 approval 绑定的是一个 coherent change set，而不是 agent 的中间调试过程。
