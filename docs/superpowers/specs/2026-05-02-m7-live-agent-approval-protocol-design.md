# M7 Design Input: Live Agent Approval Protocol

> **Superseded design input:** This first M7 design correctly prioritized live Builder approval, but it still treated a low-level `definition.apply` prompt as the approval unit. The revised design is [`2026-05-02-m7-capability-change-set-approval-design.md`](./2026-05-02-m7-capability-change-set-approval-design.md): one Builder intent, one capability proposal, one approval.

> 中文版穿插在每节后面。M7 的目标不是新增一个 app capability，而是把 M6 的真实 backend-agent evolution 从“runner 能证明”推进到“Builder 能理解、批准、拒绝、回放”。

## Thesis

M6 proved the hard backend integration claim:

```text
Builder request
  -> real backend-agent session
  -> app + framework MCP tool surfaces
  -> definition.apply
  -> framework governance
  -> restart rediscovery
  -> Priority Queue appears
  -> execution trace preserves evidence
```

M7 should prove the next product-facing claim:

> A Build-phase Agent can request a governed app-definition change during a live conversation, the Builder can approve or deny it through the viewer, and the framework can preserve a coherent execution transcript across tool calls, permission prompts, restarts, and completion.

中文：

> M7 要证明的不是“再加一个功能”，而是：真实 agent 发起高风险动作时，用户能在对话/界面里看懂它要做什么，能点 approve / deny，framework 能把这个过程作为可追溯 transcript 保留下来。

## Why This Before Semantic Index Or Hot Reload

Semantic index and hot reload are both valuable, but they do not close the biggest M6 caveat.

M6 still has three demo/product gaps:

1. Approval is auto-granted by the runner.
2. The execution trace is M6-specific, not a reusable protocol transcript.
3. Restart and completion are inferred by the runner rather than represented as first-class framework events that the agent and viewer can share.

If we skip these and add semantic search, the project gains a new app feature but still has a brittle core creation loop. M7 keeps pressure on the central promise:

```text
the Builder creates the app by talking,
and the framework governs what the agent may actually change.
```

中文：

Semantic index 会验证 substrate 扩展性；hot reload 会改善体验。但 M7 更靠近 Pneuma 的核心：agent 不能只是在后台“做完了”，Builder 必须能理解和授权这个变化。

## Target Story

Keep the same Knowledge Inbox Priority Queue slice so the milestone isolates protocol progress instead of product scope.

```text
Builder: "Add priority review to this inbox."
  -> opencode proposes app-definition changes
  -> framework raises a permission prompt for definition.apply
  -> viewer shows an approval card with impact disclosure
  -> Builder clicks Approve
  -> framework records approval_response
  -> framework_system applies the change
  -> dev service restarts and rediscover definition rows
  -> transcript records restart and completion
  -> app shows Priority Queue
```

The negative path is equally important:

```text
Builder asks for priority review
  -> agent requests definition.apply
  -> viewer shows approval card
  -> Builder clicks Deny
  -> framework returns a denied tool result
  -> agent explains that the change was blocked by Builder approval
  -> app definition remains unchanged
```

中文：

M7 的 demo 不应该再让 approval 看起来像日志。它应该是一个真实的交互节点：用户点了才继续，拒绝就停下，并且 agent 能解释为什么没做。

## Protocol Model

M7 should introduce a reusable execution transcript envelope. It can be implemented narrowly at first, but it should not be named after M6.

Recommended event kinds:

| Kind | Meaning |
|---|---|
| `user_message` | Builder request or follow-up message. |
| `assistant_message` | Backend agent text, with streaming deltas merged into readable messages for viewer replay. |
| `tool_call` | Agent requested a framework or app tool. |
| `permission_prompt` | Framework requires approval before executing a governed tool. |
| `approval_response` | Builder approved or denied the prompt. |
| `tool_result` | Tool completed, failed, or was denied. |
| `restart` | Framework/app lifecycle restart or rediscovery phase. |
| `completion` | Runner/framework declares the requested evolution complete. |

Minimum shared fields:

```ts
type AgentExecutionEvent = {
  id: string;
  created_at: string;
  run_id: string;
  app_id: string;
  workspace_id: string;
  kind:
    | "user_message"
    | "assistant_message"
    | "tool_call"
    | "permission_prompt"
    | "approval_response"
    | "tool_result"
    | "restart"
    | "completion";
  actor: {
    kind: "builder" | "build_agent" | "framework" | "framework_system";
    id: string;
  };
  correlation_id?: string;
  parent_id?: string;
  summary: string;
  data?: Record<string, unknown>;
};
```

The transcript store can start as workspace-local JSON for M7. It should be shaped so a later persistent SQLite table can replace the storage without changing viewer semantics.

中文：

M7 不需要一次做生产级 event store。但 event shape 必须是未来可复用的，不能继续叫 `m6-evolution-trace`。先用 JSON，可以；但 viewer 应该消费 protocol-shaped transcript。

## Approval Surface

The first approval surface should live in the Knowledge Inbox viewer because that is the current demo host.

MVP behavior:

- pending permission prompts render as approval cards in the right-side Builder/Agent rail or drawer;
- the card shows:
  - tool name, usually `definition.apply`;
  - change kind, such as `add_table_column`;
  - human summary;
  - affected table / operation / view / policy where available;
  - Approve and Deny buttons;
- Approve calls a framework endpoint that maps to `handleFrameworkPermissionResponse(promptId, "allow")`;
- Deny calls the same endpoint with `"deny"`;
- after response, the card becomes resolved and the transcript records the outcome.

The product text should be direct:

```text
Agent wants to change this app
Add a priority column to inbox_items.
This changes the app definition and requires Builder approval.
```

中文：

approval card 不是权限中心大后台。M7 只做 live conversation 里的单次确认：看懂、批准、拒绝、留下证据。

## Runtime Boundary

M7 should not let the viewer call raw framework internals directly.

Add a narrow dev-mode endpoint or tool bridge for live approval responses:

```text
POST /api/framework/permission-prompts/:id/respond
body: { "decision": "allow" | "deny" }
```

This endpoint is dev/demo scope for now. It should still go through the existing orchestrator response path so M2 approval token semantics remain the source of truth.

中文：

viewer 可以发 approval response，但不能绕过 framework governance。它只是把 Builder 的点击送回已有 orchestrator。

## Restart And Completion Continuity

M7 should represent restart as transcript events rather than relying only on runner polling.

Minimum phases:

```text
restart: requested
restart: stopping
restart: started
restart: rediscovered_config
completion: priority_queue_available
```

The runner may still poll the live API as a safety check, but the viewer and transcript should show framework-level phases.

中文：

M7 不要求 hot reload。它要求 restart 变得可理解。agent 和 Builder 都应该看到“系统正在重启、已重新发现 config、能力已出现”。

## Demo Shape

The M7 demo should reuse M6's left/right split:

- left: Knowledge Inbox App/Data views;
- right: Builder conversation, pending approval card, execution transcript;
- drawer: full transcript replay;
- trace tabs can stay, but they should read from the new transcript rather than M6-specific state.

Demo scenarios:

1. `?scenario=live-approval&decision=approve`
   - Builder sees pending card, clicks Approve, Priority Queue appears.
2. `?scenario=live-approval&decision=deny`
   - Builder sees pending card, clicks Deny, app remains unchanged, agent explains denial.
3. `--backend fake --auto-decision allow|deny`
   - deterministic CI path.
4. `--backend opencode`
   - manual live path with human approval in the viewer.

中文：

M7 demo 的重点不是让 UI 更花，而是让“治理节点”变成用户能亲手触发的交互。

## Non-Goals

M7 does not claim:

- semantic/vector search;
- hot reload;
- Builder-authored code handlers;
- production IAM/admin workflows;
- multi-user approval assignment;
- release-mode Runtime Agent;
- production LLM planning reliability;
- long-term transcript retention policy.

中文：

M7 仍然是概念实现阶段。它要把 live approval protocol 走通，不把自己包装成完整企业审批系统。

## Acceptance Gate

M7 closes only when:

- a reusable transcript event type exists and is covered by tests;
- permission prompts are recorded as transcript events;
- approval and denial responses are recorded as transcript events;
- viewer renders a pending approval card and can send allow/deny;
- allow path applies the Priority Queue capability and records restart/completion;
- deny path leaves app definition unchanged and returns an understandable result to the agent/viewer;
- M6 execution trace drawer is replaced or wrapped by the reusable transcript model;
- deterministic tests cover approve and deny;
- live browser e2e proves approve and deny scenarios;
- opencode manual path is documented with its remaining model-dependent caveats;
- milestone paperwork clearly states what M7 proves and what remains future work.

中文：

M7 的验收标准是双路径：approve 必须真的改变 app；deny 必须真的不改变 app。两者都必须留下可解释 transcript。

## Expected Next Plan Shape

The implementation plan should be split into these workstreams:

1. **Transcript model**
   - type, writer, JSON store, tests.
2. **Permission prompt bridge**
   - prompt-to-transcript recording, response endpoint, allow/deny tests.
3. **Viewer approval card**
   - pending/resolved card UI, transcript replay, contract tests.
4. **Runner scenarios**
   - deterministic approve/deny, live opencode handoff, restart/completion events.
5. **Milestone documentation**
   - M7 snapshot only after e2e verification.

## Self-Review Notes

- Scope is one milestone: live agent approval protocol.
- Semantic index, hot reload, production IAM, and Runtime Agent are explicitly excluded.
- The event model is narrow but not M6-specific.
- The positive and negative paths are both required, preventing a demo-only approve path.
