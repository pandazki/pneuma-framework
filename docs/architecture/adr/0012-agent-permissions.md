# ADR-0012: Agent 权限 — Build-phase 作 owner，Runtime 继承 End User

**Status**: Accepted
**Date**: 2026-04-23
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: permission, agent, security

---

## Context

Pneuma 里有两种 agent（见 [CLAUDE.md](../../../CLAUDE.md)）：

- **Build-phase Agent**：dev 模式下常驻，帮 Builder 塑造应用（改 lens、加字段、写 viewer）。类似 opencode / claude-code / codex。
- **Runtime Agent**：可选，release 模式下嵌入 app 为 End User 提供对话能力（比如 "帮我找相似书签"）。由模板作者定义 system prompt + 可授予工具。

两种 agent 在不同阶段以不同身份执行动作。问题：**它们的权限从哪里来？**

关键对话（Pandazki 在 ② O 问题里）：

> Runtime Agent 以 End User 身份操作，继承该用户的全部 permission——这是 safer 的方向（agent 不能做用户做不了的事）。

但有一个 subtle case 必须明确：Runtime Agent 调 adapter write-back 时（比如帮 user 标 Linear issue 为 done），credential 走的是谁的？答案应当一致——走 End User 的 credential，不引入 agent 自己的身份。

这个决策直接影响 archetype D 的合规性——如果 agent 能做用户做不了的事，审计和数据保护都会失守。

---

## Options considered

### Option L1: Agent 有独立身份，自己的权限集
Build-phase Agent 和 Runtime Agent 都是独立的 principal，有自己的 role/permission。

- **Pro**: 可以让 agent 做 user 做不了的事（比如管理员级别的清理）
- **Con**: 权限模型复杂化；审计难（是用户做的还是 agent 做的？责任推诿）；攻击面变大（agent 被 prompt injection 后权限是 agent 自己的而不是用户的）

### Option L2（最终选择）: Agent 继承所依附身份的权限，不超出
- Build-phase Agent 的 ctx = app owner 的 ctx（dev 模式下只有 owner 在场）
- Runtime Agent 的 ctx = 当前 End User 的 ctx，完全继承

**Pro**：
- Agent 不能做用户做不了的事（最安全假设）
- 审计清晰——每次 agent 动作归属到它代理的 user
- Prompt injection 只能在 user 已有权限范围内作恶，不升级

**Con**：
- 某些场景 agent 的能力受限——比如 Runtime Agent 不能"帮一个用户查看另一个用户的数据"（即使业务上可能合理）

### Option L3: Agent 权限是 user 权限的**子集**
Runtime Agent 只能行使 user 权限中被显式授权给 agent 的子集（如允许 read 但不允许 write）。

- **Pro**: 比 L2 更保守——即使 user 有 write，agent 也不能写
- **Con**: 配置复杂度翻倍；多数场景 agent 就是在代 user 做事，限制太严会让 agent 能做的事变少

---

## Decision

采用 **Option L2**。Agent 权限严格继承宿主身份，不多不少。

### Build-phase Agent 的 PermissionContext

```typescript
// dev 模式下，单一 owner 登录
const buildPhaseCtx: PermissionContext = {
  tenant_id: app.tenant_id,
  user: {
    id: app.owner_id,            // app 的所有者
    roles: ["owner"],
    attrs: {},
    email: app.owner_email,
  },
  mode: "builder",               // 关键：区分于 runtime
  session_id: /* dev session */,
  trace_id: /* 当前 dev turn */,
};
```

Agent 调任何 framework 工具（lifecycle.dev.start、checkPolicy、mutation 等）都带这个 ctx。由于是 owner 身份，绝大多数操作都能过。

### Runtime Agent 的 PermissionContext

```typescript
// 收到 End User 一个 HTTP 请求后，agent 开始处理
const runtimeCtx: PermissionContext = {
  tenant_id: request.tenant_id,
  user: request.authenticated_user,  // 从 auth middleware 读
  mode: "runtime",
  session_id: request.session_id,
  trace_id: request.trace_id,
};
```

Agent 调的所有工具继承这个 ctx。checkPolicy 以 user 身份评估。Adapter 调用用 user 的 credential（[ADR-0011 per-user 模式](./0011-adapter-credential-modes.md)）。

### Agent 动作的 audit 事件归属

每次 agent 调工具，audit event 上的 `actor` 字段：

```typescript
{
  event: "mutation",
  actor: {
    user_id: ctx.user.id,          // End User id
    acting_via: "runtime-agent",   // 透明标记是 agent 代行
    agent_id: "the-agent-instance-id",
  },
  // ...
}
```

这样审计既能归到 user（责任人），又能区分"直接用户操作 vs agent 代操作"。

### 关键 subtle case 的处理

**Case 1**：Runtime Agent 调 per-user adapter（例：帮 user 标 Linear issue done）
- 走 user 的 OAuth token（[ADR-0011](./0011-adapter-credential-modes.md)）
- 如果 user 没连 Linear → agent 回答"需要你先连 Linear 账号"

**Case 2**：Runtime Agent 想"跨用户"读数据（"看看团队里谁也收藏了这个链接"）
- 以 user 身份查 `bookmarks` → row-level policy 过滤（[ADR-0006](./0006-permission-granularity.md)）
- 看得见就看得见（如果 row 对 user 可见），看不见就看不见。**Agent 不绕过**。
- 如果 user 没有跨用户查询权限，agent 能说的只有 "我只能看到你自己的和公开的，看不到别人私有的"

**Case 3**：Build-phase Agent 在 dev 模式意外看到 End User 留下的敏感数据
- 因为 builder ctx 是 owner 权限、又在 dev 模式下操作的是 app 内所有数据，owner 本来就有资格看见
- 这是 MVP 接受的权衡：dev workspace = owner 的 personal data view；生产部署前 owner 应该清掉 dev 数据或确保 dev 不用真实数据（见[ADR-TBD: Dev/Release 数据隔离]）

### Agent 能"升级权限"的唯一路径：Builder 显式配置

如果某个 Runtime Agent 确实需要比普通 user 更高的权限（极少见，但设计上可能），Builder 必须：

1. 在 app 配置里显式声明这个 agent 作为 "service user"（实际上就是一个特殊的 user with elevated roles）
2. 任何调用该 agent 的 HTTP 请求会以 service user 身份进入，而非原始 End User
3. 这种配置会在 policy 审计里明确标记为 "elevated agent"，前端也显示警示标识

这避开了"agent 内部悄悄升权"的坑——所有权限升级都是显式配置。

---

## Consequences

### Positive
- **安全基线最强**：Prompt injection 不能越权；agent 错误也不能越权
- **审计清晰**：每个 event 都归到具体 user_id，acting_via 字段显示是否走 agent
- **Adapter credential 语义自然**：继承了[ADR-0011 per-user](./0011-adapter-credential-modes.md) 的设计
- **对齐 "Builder 和 End User 角色分离"的整体叙事**（[ADR-0001](./0001-archetype-scope.md)）

### Negative / Risks
- **某些场景 agent 能力受限**：跨 user 查询、管理员级清理等场景需要显式 elevated agent 配置。需要 DX 友好
- **Build-phase Agent 以 owner 身份跑** 意味着 dev 模式下 agent 能做"几乎任何事"——包括删表等危险操作。需要在 dev UX 里提供 "agent action preview" 让 owner 在 agent 做危险操作前确认（已有 [ADR-TBD: PermissionPrompt](./) 的路径）

### Follow-ups
- **ADR-TBD: Dev/Release 数据隔离** —— dev 模式下的数据应该跟 release 隔离（Builder 不应意外用真实生产数据做 dev）
- **ADR-TBD: Elevated agent configuration** —— service user / 明确升权的 yaml schema
- **ADR-TBD: Agent action preview** —— dev 模式下危险操作要让 owner 确认
- 进 `open-questions.md`：Build-phase Agent 在 dev 期间其实在同时操作 End User 的数据（如果 app 已上线且 dev 跑在 staging 数据），这种场景的隔离机制
