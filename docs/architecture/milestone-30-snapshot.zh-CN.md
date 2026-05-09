# Milestone 30 Snapshot 中文版 — Host Credential Broker Utilities

**日期：** 2026-05-09  
**状态：** 作为 post-RC stabilization milestone 关闭。它不是 `pneuma-rc-0.1.4` release tag。  
**输入：** DevBoard 下游压力：Host 已经可以声明 credential requirements 和 rebinding evidence，但仍然需要手写 session、OAuth state、callback binding、credential refs 和 provider-shaped test fixtures。

## M30 证明了什么

M30 把 credential rebinding 的支撑路径做成可用工具，但不声称生产级 identity：

```text
CredentialRequirement
  -> 为 provider + subject 创建 OAuth state
  -> OAuth callback code exchange
  -> 带 credential_ref 的 HostCredentialBinding
  -> no-secret CredentialRebindingEvidence
  -> 只能通过 broker resolve secret
```

边界刻意很窄：

```text
Framework 拥有安全 helper shape。
Creation Host 拥有真实 identity、persistence、encryption、refresh 和 UX。
```

## 关闭的反馈

| 反馈 | M30 结果 |
|---|---|
| Host 会重复实现 cookie parsing、多 `Set-Cookie` 和 logout revoke discipline | 新增 session/cookie helpers 和 `InMemoryHostSessionStore`。 |
| Host 容易把 credential metadata 和 secret material 放得太近 | 新增 `InMemoryHostCredentialBroker` 和不含 secret 的 `HostCredentialBinding` metadata。 |
| Credential rebinding evidence 容易被手写错 | 新增 `createCredentialRebindingEvidenceFromBindings`。 |
| OAuth state map 是 Host-specific，容易缺少 scope | 新增 `InMemoryOAuthStateStore`，带 provider、subject、requirement、expiry 和 single-use semantics。 |
| OAuth callback-to-credential binding 没有共享路径 | 新增 `createOAuth2Provider` 和 `bindOAuthCallbackCredential`。 |
| 每个下游 Host 都写自己的 provider-shaped OAuth mock | 新增 `startMockOAuthServer` 测试 fixture。 |

## 边界决定

M30 不增加 hosted auth、production secret persistence、provider SDKs、token refresh、cloud KMS 或 account-linking UI。它给下游 Host 一个共享 reference implementation 和 test contract。

`InMemory*` classes 适合本地 example 和测试。生产 Host 应该用自己的 storage 和 secret boundary 持久化等价 records，同时保留同样的 fail-closed semantics。

## Developer-facing 变化

新的 guide：

- [Host Credential Broker Utilities](../developer/credential-broker.md) / [中文版](../developer/credential-broker.zh-CN.md)

新的 ADR：

- [ADR-0037: Host Credential Broker Utilities](./adr/0037-host-credential-broker-utilities.md)

新的 core exports：

- `serializeHostCookie`、`readHostCookie`、`appendHostSetCookie`
- `InMemoryHostSessionStore`
- `InMemoryHostCredentialBroker`
- `createCredentialRebindingEvidenceFromBindings`
- `InMemoryOAuthStateStore`
- `createOAuthAuthorizeUrl`、`createOAuth2Provider`
- `bindOAuthCallbackCredential`
- `startMockOAuthServer`

## 验证

在 M30 worktree 中运行：

```bash
bun test packages/core/test/host-sessions.test.ts packages/core/test/host-credentials.test.ts packages/core/test/host-oauth.test.ts
bun test packages/core/test/host-authoring.test.ts packages/core/test/sharing-governance.test.ts packages/core/test/agent-backend/run-turn.test.ts packages/core/test/host-sessions.test.ts packages/core/test/host-credentials.test.ts packages/core/test/host-oauth.test.ts
bun run typecheck
tmp_config=$(mktemp -d) && printf '{"auths":{}}\n' > "$tmp_config/config.json" && DOCKER_CONFIG="$tmp_config" bun test
```

最终结果：

- Host credential/session/OAuth suite：`12 pass`，`0 fail`，`49 expect() calls`。
- Related authoring/governance/backend suite：`42 pass`，`0 fail`，`112 expect() calls`。
- Typecheck：通过。
- 使用临时 Docker config 的 full suite：`1254 pass`，`0 fail`，`4686 expect() calls`，覆盖 `190 files`。

## 下一步

建议的下一个 milestone：

1. 让下游 Host 压力测试这些工具，再决定是否提升 persistent Host stores、provider-specific adapters 或 account-linking UI helpers。

M30 刻意保持 credential lane 很小。它让下游 Host 可以理解并使用 credential tools；它不把 credential operations 变成 hosted product surface。
