# ADR-0021: `admin_delegated` credential mode + identity binding

**Status**: Accepted
**Date**: 2026-04-24
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: integration, permission, identity, adapter, archetype-b

---

## Context

[ADR-0011](./0011-adapter-credential-modes.md) 给了两种 adapter credential 模式：`per-user`（每人 OAuth）和 `shared`（Builder 一次 OAuth，所有用户共用）。MVP 场景压力测试发现这两种都不合适对一个典型诉求：

> 一个 5 人 team，admin 是 Builder，想把 Linear 引入 dashboard。
> - "my-open-issues" widget：每人只看到**自己的** issue + 可以关闭并附变更说明
> - User A 打开就直接看到自己的 open issue，自动刷新

这个诉求在**企业内部工具**场景极其常见，但用 0011 的两种 mode 都有明显问题：

- `per-user`：每个用户进 app 前得先走 OAuth，**非常烦**；而且团队里可能有成员**没有外部系统的 API 权限**（contractor / 运营 / 客服），根本 OAuth 不起来
- `shared`：所有人看同一批数据——违反"每人只看自己的"诉求；也没有 per-user filter 语义的起点

**Pandazki 提出的简化模式**：Builder 做一次 **admin-scope OAuth**（看到所有 team 数据的权限），然后每个 User 在 pneuma 内完成一次**轻量身份绑定**（"我在外部是 alice@company.com"），之后所有 API 调用都走 Builder 的 credential，**pneuma 在内部按 binding 做 per-user 过滤**。

这种模式是**企业 SaaS 的主流实践**——Salesforce、Slack、Notion、Asana 的 enterprise 集成都是类似套路（admin OAuth + internal ACL）。不是妥协，而是**独立存在的第三种合理模式**。

---

## Options considered

### Option A: 把需求硬塞进现有 `per-user` 模式
坚持每人 OAuth，教育 team 成员接受繁琐流程。

- **Pro**: 不引入新 mode，ADR-0011 不变
- **Con**: Archetype B 场景体验极差；成员没有外部 API 权限的路被堵死；企业 admin 需要的"集中管理"能力缺失

### Option B: 把需求硬塞进 `shared` 模式
所有人看到同一批数据。

- **Pro**: 实现最简
- **Con**: 直接违反"每人只看自己"诉求；没有出路

### Option C（最终选择）: 新增 `admin_delegated` 模式
作为 0011 的第三种 peer mode。Builder OAuth + per-user binding + pneuma 内部过滤。

- **Pro**: 精准匹配 archetype B 场景；对齐行业主流模式；`per-user` / `shared` / `admin_delegated` 三种模式覆盖完整光谱
- **Con**: 要增加一层**安全契约**——pneuma 的 WhereClause filter 必须**静态可证**包含 user 约束；否则 admin credential 调出来的数据会全泄露给所有用户。这个约束不是 mode-specific 的负担，而是 mode 固有特性，由 framework 强制

---

## Decision

新增 `admin_delegated` 作为第三种 adapter credential mode。具体契约如下。

### 三种 mode 的选择指南

| 场景 | 推荐 mode | 理由 |
|---|---|---|
| LLM / 搜索 / 公共 API（OpenRouter, Jina, 天气...） | `shared` | 无 per-user 语义；一把 key 所有人共用 |
| 团队协作工具（Linear, Notion, GitHub, Slack, Asana...） | **`admin_delegated`** | 业务场景 B 主流；UX 简化；团队 admin 集中管理 |
| 个人私密数据（Gmail, 个人 Calendar, 私人云盘...） | `per-user` | 每人自己的数据 Builder 不能看全；隐私边界不能破 |
| 混合场景（team 共享 + 个人数据） | 分开 adapter 实例 | 同一外部系统按业务角色分两个 adapter config |

Adapter **声明自己支持哪些 mode**；Builder 在 app 配置时选一个：

```yaml
adapters:
  - id: linear
    supported_credential_modes: [admin_delegated, per-user]  # adapter 声明
    # Builder 选:
    credential_mode: admin_delegated                         # 用这个
```

### `admin_delegated` 的完整形态

```yaml
adapters:
  - id: linear
    credential_mode: admin_delegated
    
    admin_credential:
      # Builder 完成 admin OAuth 之后的 token 存这里
      scope_required: ["read:all", "write:issues", "read:users"]
      storage: app_secret_store           # 存在 app-level，per-env 独立（ADR-0016）
      expiry_handling:
        warn_days_before: 7
        fallback: halt_writes             # 过期：只读可用，写阻止 + 通知 Builder
    
    identity_binding:
      # pneuma user ↔ external user 的映射
      strategy: email_match               # MVP default
      store_at: user.attrs.linear_user_id
      verify_on_bind: false               # email_match 信任 pneuma auth
      
      # 绑定所需的 external user 发现方式
      discovery:
        endpoint: /api/v1/organization/members
        identity_field: email
        result_id_field: id
    
    filter_pushdown:
      # admin_delegated 模式要求的额外契约
      required_ops_for_user_filter:
        # 哪些 op 必须能下推到 adapter 执行（不允许本地过滤）
        - { column: assignee_id, op: [eq, in] }
      fail_closed: true                   # pushdown 失败 → refuse，不降级本地过滤
    
    attribution:
      # Write-back 时如何在外部系统里标记实际 actor
      comment_injection:
        template: "via pneuma by {{ user.email }} (audit-id: {{ trace_id }})"
        field: comment_body
      audit_authoritative: pneuma          # pneuma audit 是权威；外部 log 仅辅助
    
    capabilities:
      list: true
      update: true
      updatableColumns: [state, comment]
```

### 4 种 binding strategy

```yaml
identity_binding:
  strategy: email_match | admin_assigns | oauth_prove | sso_derived
```

| Strategy | 什么时候用 | MVP 状态 |
|---|---|---|
| `email_match` | pneuma 里 verified email 跟外部系统 email 直接对齐（Builder 信任 pneuma auth） | ✅ MVP 实现 |
| `admin_assigns` | Builder 手动把 pneuma 用户映射到外部 ID；适合少数例外情况 + `email_match` 的 fallback | ✅ MVP 实现 |
| `oauth_prove` | User 做一次最小 scope OAuth（e.g. `read:profile` 单次）证明身份；高安全场景 | 🟡 shape ready, impl 待做 |
| `sso_derived` | 走 OIDC / SAML 的 claim 直接拿外部身份；适合企业 SSO 场景 | 🟡 shape ready, impl 待做 |

**MVP binding flow**：

```
User A 首次打开涉及 linear 的 view
  ↓
Framework 查 ctx.user.attrs.linear_user_id
  ├─ 已存在 → 直接用
  └─ 未绑定 → 进入 binding flow
       ├─ strategy: email_match
       │   ├─ 调 linear.discovery.endpoint 查 email = A.email 的 user
       │   ├─ 命中唯一一个 → agent 提示 "检测到你是 Linear 的 <foo@…>，确认？"
       │   │   ├─ 用户确认 → 写入 user.attrs.linear_user_id
       │   │   └─ 用户否认 → fallback 到 admin_assigns
       │   ├─ 命中 0 个 → fallback 到 admin_assigns
       │   └─ 命中多个 → 让用户选，确认后入库
       └─ strategy: admin_assigns
           └─ Builder 在后台管理面板看到 "X 个未绑定用户"，手动连线
```

### 安全契约（fail-closed 原则）

`admin_delegated` 模式下，**pneuma 的权限正确性决定外部数据安全**。为降低风险，framework 强制执行三条约束：

**约束 1：Query filter 必须静态可证包含 user 约束**

任何 query 作用于 `admin_delegated` adapter-backed table 时，framework 运行 [ADR-0019 static analysis](./0019-where-clause-ast.md#static-analysis-能力)：

```typescript
function validateAdminDelegatedQuery(query: Query, adapter: Adapter): void {
  if (adapter.credential_mode !== "admin_delegated") return;
  
  const subjects = getSubjects(query.filter);
  const hasUserBinding = subjects.some(s =>
    s.ns === "user" && s.path[0] === "attrs" &&
    s.path[1].endsWith("_user_id")   // e.g. linear_user_id
  );
  
  if (!hasUserBinding) {
    throw new Error(
      `Query on adapter-backed table "${adapter.id}" in admin_delegated mode ` +
      `must include a user binding filter (row.<field> == user.attrs.${adapter.id}_user_id). ` +
      `Refusing to execute — would expose all team data through Builder's credential.`
    );
  }
}
```

**此约束在 deploy 时检查（不是运行时）** —— Builder/agent 改 query 后 deploy 会被 block 直到修正。

**约束 2：Filter pushdown 必须匹配 user-filter 字段**

Adapter 的 `filter_pushdown.required_ops_for_user_filter` 声明哪些字段能真正下推。Framework 对比 query.filter 里的 user-binding filter 字段——必须在这个集合里；不在就 refuse。

如果下推失败（adapter 实际查询时返回 "不支持这个 op"），默认 **fail closed**（refuse 返回数据），不 fallback 到本地过滤。可通过 `fail_closed: false` 显式允许（不推荐）。

**约束 3：Policy 的 target namespace 仍然工作**

写操作（如 `close_linear_issue`）必须通过 [ADR-0019 target namespace amend](./) 的 policy 检查——target row 的字段要能被 policy 引用，判断 user 是否有权做此操作。

### Write-back attribution

Admin-delegated 的写操作归属分两级：

**外部系统（Linear 等）**：
- 写请求用 Builder 的 admin token —— Linear audit log 显示"Builder 账号做了 X"
- Framework **自动注入 attribution**：写操作的 content field（comment / description）附加 `"via pneuma by alice@company.com (audit-id: trace-xyz)"`
- Adapter 通过 `attribution.comment_injection.template` 声明注入格式

**Pneuma 内部（权威记录）**：
- [ADR-0013 audit event](./0013-telemetry-event-model.md) 记录 `actor.user_id = user A`, `acting_via = operation`, `mode = admin_delegated`, `external_call_result = ...`
- 任何合规审计以 pneuma audit log 为准；外部系统 log 只是辅助

严肃合规（SOX/HIPAA actor-level 追责）场景仍该用 `per-user`。本模式的审计模型**对一般企业场景足够**，对强合规**不足够**。

### 跟现有 primitives 的整合

- **[ADR-0002 Adapter-backed Table](./0002-storage-typed-cells.md)**：不变，table 定义照旧；`source.adapter` 引用 adapter 即可
- **[ADR-0004 Adapter protocol](./0004-adapter-protocol.md)**：`supported_credential_modes` 成为 adapter 声明的必填字段之一
- **[ADR-0005 Adapter capabilities](./0005-adapter-capabilities.md)**：`filter_pushdown.required_ops_for_user_filter` 加入 capabilities 声明
- **[ADR-0011 Adapter credential modes](./0011-adapter-credential-modes.md)**：升级到三种 mode；本 ADR 作为 0011 的扩展 + 专章
- **[ADR-0018 Operation primitive](./0018-operations-as-primitive.md)**：admin_delegated adapter 派生的 operation 无特殊；handler 照常用 adapter ctx，ctx.credential 被 framework 自动填为 admin token
- **[ADR-0019 WhereClause](./0019-where-clause-ast.md)**：安全契约通过 static analysis 实现
- **[ADR-0020 Query DSL](./0020-query-dsl.md)**：Query 含 user-binding filter 的 pattern 标准化；cache key 自动含 user.id（Gap #3 → 已经修）

### MVP 实施 scope

**MVP 做**：
- `admin_delegated` mode 引入 [ADR-0011](./0011-adapter-credential-modes.md) 并实现端到端
- `email_match` binding strategy 实现
- `admin_assigns` binding strategy 实现（作 email_match 的 fallback）
- Filter pushdown 安全契约三条（deploy-time + fail-closed）
- Attribution comment injection
- Audit event 带 mode 字段

**MVP 不做（shape ready, impl 后续）**：
- `oauth_prove` binding strategy
- `sso_derived` binding strategy
- 强合规 actor-level audit（`per-user` 用户可以走，后续补文档说明差异）

**Open**：
- `per-user` mode 的具体 UX 设计 —— Pandazki 打算用 Linear 开个真实 team 做实验，等实验结果再敲细节（见 OPEN-QUESTIONS）

---

## Consequences

### Positive
- **Archetype B 场景的主流模式被正式表达**—— Linear / Notion / Slack 这类团队工具集成 UX 大幅简化
- **三种 credential mode 覆盖光谱完整**——不同场景 Builder 有明确选择
- **安全契约由 framework 强制**（不依赖 Builder 谨慎）—— deploy-time static analysis + fail-closed pushdown
- **Attribution 双级归属清楚**—— pneuma audit 权威 + 外部系统 comment injection
- **Binding strategy 可扩展**—— `email_match` 满足 MVP，`oauth_prove` / `sso_derived` 预留企业场景

### Negative / Risks
- **安全性前置条件增加**—— `admin_delegated` 要求 adapter 支持 filter pushdown + framework WhereClause static analysis 正确 + pneuma auth 是可信 trust anchor。任一前提破了就泄露
- **Builder admin token 集中**—— 单点失效；但企业场景多数可以用 service account 绕开
- **不适用于强合规**—— SOX / HIPAA 一类 actor-level 追责场景仍需要 `per-user`
- **Binding flow UX 复杂度**—— email_match 的多结果 / 零结果 fallback 路径要写清楚，agent 对话可能变长

### Follow-ups
- **[ADR-0019 amend]**: `target` namespace 定义（Gap #1），admin_delegated 的 write policy 依赖它
- **[ADR-0020 amend]**: cache key 自动含 WhereClause 引用的 user namespace 值（Gap #3）
- **[ADR-0011 amend]**: 三种 mode 并存的文字正式化；本 ADR 作为 `admin_delegated` 专章
- **[ADR-0005 amend]**: `filter_pushdown.required_ops_for_user_filter` 加入 capabilities（Gap #4 部分）
- **ADR-TBD: `oauth_prove` binding strategy** (post-MVP)
- **ADR-TBD: `sso_derived` binding strategy** (post-MVP)
- **ADR-TBD: Admin credential lifecycle** (token rotation, service account integration)
- 进 `OPEN-QUESTIONS.md`：`per-user` mode 的具体 UX 设计——Pandazki 在 Linear 做实验后再敲细节
- 进 `OPEN-QUESTIONS.md`：Binding multi-candidate 命中（同 email 多个外部 user）的 UX
- 进 `OPEN-QUESTIONS.md`：Builder admin credential 过期期间的 app 降级模式（halt_writes vs read_only）
