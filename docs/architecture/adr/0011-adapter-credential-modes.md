# ADR-0011: Adapter credential 模式 — per-user / shared / both

**Status**: Accepted
**Date**: 2026-04-23
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: permission, integration, identity

---

## Context

[ADR-0004 Adapter protocol](./0004-adapter-protocol.md) 定义了 adapter 的框架，[ADR-0005 Capabilities](./0005-adapter-capabilities.md) 定义了写回能力。但还有一个独立的维度：**adapter 访问外部系统时用谁的 credential？**

两种真实场景：

- **场景 A（共享工作台）**：team 共用一个 Linear 账号，一次 OAuth 之后团队所有人看同一批 issue。Adapter credential 是 app-level 的。
- **场景 B（个人 dashboard）**：每个 End User 连自己的 Linear 账号，看到的是"**我自己**的 issue"。Adapter credential 是 per-user 的。

同一个 Linear adapter 被用在 A 和 B 的形态完全不同。Adapter 作者需要能在声明时表达"我这个 adapter 适合哪种"（或者都支持）；Builder 在搭 app 时需要能选一种模式。

这个决策也直接关系 archetype D（白标平台）——平台上的每个租户会选不同模式，框架得原生支持。

---

## Options considered

### Option J1: 所有 adapter 都是 app-level shared credential
Builder 一次 OAuth，所有 End User 共用。

- **Pro**: 最简；OAuth 流程只走一次
- **Con**: 个人 dashboard 场景做不了；End User 看到"别人"的数据，隐私灾难

### Option J2: 所有 adapter 都是 per-user
每个 End User 必须自己 OAuth。

- **Pro**: 隐私最强；数据隔离最清楚
- **Con**: 共享工作台场景做不了；每个 End User 第一次访问都要 OAuth 体验负担重

### Option J3（最终选择）: Adapter 声明支持哪些模式，Builder 在 app 里选
Adapter 定义里有 `credentialMode: "shared" | "per-user" | "both"`；Builder 配 app 时选择其中一种。

- **Pro**: 两种场景都支持；责任划分清晰（adapter 作者决定技术能力，Builder 决定产品形态）
- **Con**: 多了一个配置轴

---

## Decision

### Adapter 定义里声明

```typescript
interface AdapterDefinition {
  id: string;
  // ...
  credentialMode: "shared" | "per-user" | "both";
  // ...
}
```

- `shared`：adapter 作者认为这种集成只适合共享使用（如自建 CRM 的 system-level API）
- `per-user`：adapter 作者认为这种集成必须每用户自己连（如 Gmail / 私人 Obsidian vault）
- `both`：adapter 作者实现了两种模式的支持，交给 Builder 选

### Builder 在 App 配置里选

```yaml
# app.yaml / manifest
adapters:
  - id: linear
    mode: per-user           # 选择 per-user 模式
  - id: github-org-dashboard
    mode: shared             # 共享 credential
    shared_credential_id: ${env.GITHUB_APP_TOKEN}  # 指向 secret store 的引用
```

当 adapter 声明 `both` 时，Builder 必须选一个；当声明 `shared` 或 `per-user` 时，Builder 必须选与之一致的（否则框架 validation 失败）。

### OAuth flow 的差异

- **shared 模式**：Builder 在 app 配置时一次性完成 OAuth，token 存在 app-level 的 secret store
- **per-user 模式**：End User 首次访问 adapter-backed table 时触发 OAuth flow（viewer 弹窗）；token 存在 per-user secret store，与 user id 绑定

### PermissionContext 如何流入 Adapter

```typescript
interface AdapterCtx {
  credential: AuthCredential;       // shared: 从 app secret store 读；per-user: 从 ctx.user.id 的 secret store 读
  tenantId: string;
  permission_ctx: PermissionContext;  // 完整的请求权限上下文
  logger: Logger;
  cache: CacheHandle;
}
```

Adapter 实现不需要关心 credential 是 shared 还是 per-user——框架 runtime 根据 app 配置决定从哪里取 credential 注入到 `ctx.credential`。

### Runtime Agent 使用 per-user adapter

[ADR-0012](./0012-agent-permissions.md) 规定 Runtime Agent 以 End User 身份执行。当 Runtime Agent 调一个 per-user 模式的 adapter 时：

- 使用 End User 的 credential
- 如果 End User 还没 OAuth（token 缺失），adapter 调用会返回 `NeedsAuthentication` 错误 → agent 回应"请先授权 Linear 才能帮你处理"

这样 adapter 层自然复用 [ADR-0010](./0010-user-id-grants.md) 的 user identity。

### Secret store 抽象

Framework 提供一个内部 `SecretStore` 接口：

```typescript
interface SecretStore {
  getSharedSecret(appId: string, adapterId: string): Promise<AuthCredential | null>;
  getPerUserSecret(userId: string, adapterId: string): Promise<AuthCredential | null>;
  setSharedSecret(appId: string, adapterId: string, cred: AuthCredential): Promise<void>;
  setPerUserSecret(userId: string, adapterId: string, cred: AuthCredential): Promise<void>;
  deletePerUserSecret(userId: string, adapterId: string): Promise<void>;
}
```

MVP 实现：加密的本地 SQLite 表（按 adapterId + userId/appId 存 JSON blob）。生产环境可插拔到 AWS Secret Manager / HashiCorp Vault / env-based 等。

---

## Consequences

### Positive
- **共享与个人两种场景都支持**——archetype B/C/D 的典型用例都能覆盖
- **Adapter 作者与 Builder 责任分离清晰**——adapter 作者决定技术能力，Builder 决定产品形态
- **PermissionContext 贯通** adapter 层——adapter 知道请求发起的 user id，与[ADR-0012](./0012-agent-permissions.md) 的 agent 身份继承无缝衔接
- **Secret store 抽象**让 MVP 实现简单，后续上 vault 不改业务代码

### Negative / Risks
- **per-user OAuth 的体验负担**——每个 End User 要连账号，流量大时可能挡转化率。缓解：让 Builder 可以设置"首次访问时才触发"而不是登录时就触发
- **Shared credential 的风险**——共享 token 如果泄露就是整个 app 级别的问题；per-user 只影响单人。MVP 不加额外保护，但文档里要警示
- **`both` 模式的实现负担**——adapter 作者要同时跑通两种模式的 OAuth 与 API 调用，开发成本更高

### Follow-ups
- [ADR-0012 Agent permissions](./0012-agent-permissions.md)：Runtime Agent 走 per-user credential 的细节
- **ADR-TBD: Secret store pluggability**——生产环境切换到 vault
- **ADR-TBD: Credential revocation 流程**——End User 想撤回 OAuth；管理员强制 kill credential
- 进 `open-questions.md`：OAuth token refresh 的并发冲突（多个用户同时刷同一 shared credential）
