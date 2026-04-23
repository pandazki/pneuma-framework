# ADR-0010: User-id 粒度授权与 role 并列支持

**Status**: Accepted
**Date**: 2026-04-23
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: permission, identity

---

## Context

[ADR-0007](./0007-permission-dsl.md) 的 subject 封闭词汇表里同时列了 `user:<id>` 和 `role:<name>`——但是需要 **ADR 层面明确承诺**：user-id 级授权从 day 1 支持（不是 role-only），并定义 user / role 的最小 registry 形态。

Pandazki 在对话中表态：

> 至少要支持一种 user_id 级别的权限吧……不能只有 role

这个需求在小团队 / archetype B 场景非常真实：

- "只有 alice 能 deploy" —— alice 一人特例，不值得为她建个 role
- "这个 bookmark 除了 bob 别人都看不到" —— 临时分享
- 从 role 到 user 的收缩场景（先 role 级授权，随后针对具体 user 单独限制）

如果框架只支持 role，就强制 Builder 为每个单人权限都建一个 `role:only-alice`，荒谬。

反过来，user:id 是否**等价于** role 的一员？理论上 `user:<id>` 是 `role:<role-that-only-contains-alice>` 的退化形式——但从对话体验与数据模型看，让 user 与 role 并列更自然。

---

## Options considered

### Option A: 只支持 role，user 级通过"单人 role"实现
`role:only-alice` = 临时为 alice 建一个 role，把她加进去。

- **Pro**: 概念上只一个 subject kind
- **Con**: 对话体验差（Builder 说"只有 alice 能..."，agent 生成 `role:only-alice` 很别扭）；role registry 膨胀

### Option B（最终选择）: user 与 role 并列为一级 subject kind
DSL 里 `user:<id>` 直接生效，无需包一层 role。

- **Pro**: 对话自然；role registry 保持干净
- **Con**: 需要定义 user registry

### Option C: 只支持 user，role 由组动态计算
只存 user，role 通过 role membership 表动态求。

- **Pro**: 统一；role 可以成为 user attribute 之一
- **Con**: 失去 role 作为"group subject"的简洁性；大量小规模授权时规则面爆炸

---

## Decision

**Subject 封闭词汇表里 user 和 role 平等并存**（[ADR-0007](./0007-permission-dsl.md) 已写入）。同时定义最小 user/role registry 形态：

### User registry（MVP）

```typescript
interface User {
  id: string;                   // 稳定的不变标识，如 uuid
  email?: string;               // 可选，用于登录和显示
  display_name?: string;
  attrs: Record<string, unknown>;   // 自定义属性，供 predicate 使用（e.g. row.owner_id == user.id）
  created_at: number;
  // MVP 单用户场景：system 会有一个 owner user 默认存在
}
```

存放位置：MVP 存在 `users` 这张 Table 里（dogfood 存储层）。Framework 为这张 Table 提供特殊的"内置" source，确保它存在且 schema 稳定。

### Role registry（MVP）

```typescript
interface Role {
  name: string;                 // 短标识符，e.g. "admin" / "team" / "editor"
  description?: string;
  created_at: number;
}

interface RoleMembership {
  user_id: string;
  role_name: string;
  granted_at: number;
  granted_by?: string;          // user_id of granter
}
```

存放：同样在内置 Table `roles` 与 `role_memberships`。

### DSL 里的使用

```yaml
# user-id 级授权示例
- allow: user:alice_uuid
  do:    [read, write]
  on:    table:bookmarks

- allow: user:alice_uuid
  do:    deploy
  on:    app

# role 级授权示例
- allow: role:admin
  do:    '*'
  on:    app
```

### PermissionContext 的 user 字段

```typescript
interface PermissionContext {
  tenant_id: string;
  user: {
    id: string;
    email?: string;
    roles: string[];            // 当前用户的全部 role name
    attrs: Record<string, unknown>;
  } | null;                     // null = anonymous
  mode: "builder" | "runtime";
  session_id: string;
  trace_id: string;
}
```

每次请求框架从 auth middleware 读 user，查 role_memberships 填入 `roles` 字段；`attrs` 来自 user 表的同名字段。ctx 然后流经所有 checkPolicy 调用与 mutation emit。

### NL→DSL 翻译示例

**Builder 说**：
> "只有 alice 能 deploy 这个 app。"

**Agent 生成**：
```yaml
- allow: user:alice_<uuid>
  do:    deploy
  on:    app
```
（agent 先查 user registry 解析 alice → user id，再填入规则）

**Builder 说**：
> "alice 和 bob 都能读 bookmarks，但 bob 不能写。"

**Agent 生成**：
```yaml
- allow: user:alice_<uuid>
  do:    [read, write]
  on:    table:bookmarks

- allow: user:bob_<uuid>
  do:    read
  on:    table:bookmarks
```

### 与可插拔 IdP 的关系

MVP 的 User registry 是 framework 内嵌的（app 级自管）。后续当接入外部 IdP（OIDC / SAML）时：

- IdP 提供的 user 通过"桥接用户" shape 注入 User registry（保留稳定 id）
- `roles` 字段可以从 IdP claim 映射
- `attrs` 字段可从 IdP 扩展 claim 映射

这个桥接的详细 schema 将在 **ADR-TBD: Identity provider pluggability** 中定义。

---

## Consequences

### Positive
- **对话自然**："只有 alice 能 X" 直接对应 `user:alice_id` 规则
- **Role registry 不膨胀**——单人权限不需要建单人 role
- **IdP 可插拔的基础已就位**——User/Role shape 是 IdP-agnostic 的
- **Predicate 能用 user.attrs**——像 `when row.department == user.attrs.department` 这种谓词可行

### Negative / Risks
- **User/Role registry 作为内置 Table**——意味着存储层必须支持"内置表"的概念（Table 定义由 framework 提供，不由 app 声明）
- **User id 的永久性**——MVP 用 uuid，迁移到 IdP 时要保证 IdP 的用户能映射回同一个 id（桥接表）
- **Role membership 的授予链**——MVP 没有授予审计（谁给谁授的 role）；审计诉求等[ADR-0013](./0013-telemetry-event-model.md) + [ADR-0014](./0014-audit-subset.md) 覆盖

### Follow-ups
- **ADR-TBD: Identity provider pluggability**——IdP claims → user / roles / attrs 的桥接
- **ADR-TBD: Internal tables**——framework 提供的 built-in Table 机制（users / roles / role_memberships / events / migrations）
- 进 `open-questions.md`：Role 的 nested hierarchy（admin 继承 editor 继承 viewer）在 MVP 是否需要——倾向不做，MVP 平铺
