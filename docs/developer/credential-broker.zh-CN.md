# Host Credential Broker 工具

**读者：** 正在接入账号 session、OAuth callback 和 credential rebinding 的 Creation Host Developer  
**状态：** M30 post-RC stabilization utility；没有新的 release tag  
**English version:** [credential-broker.md](./credential-broker.md)

M30 给下游 Host 一组小而可测试的 credential 工具。它不会把 pneuma-framework 变成 hosted identity、secret manager 或生产级 OAuth 服务。

它解决的问题更窄：

```text
Builder install / fork / preview 一个 app
  -> Host 要求 Builder 绑定 provider credential
  -> Host 把 raw token material 存在 broker 后面
  -> framework-visible artifact 只拿到 credential_ref evidence
  -> runtime 或 Host code 需要时通过 broker resolve secret
```

## 边界

Framework 拥有可复用的安全形状：

- session cookie 是随机值，但 session 记录只保存 `sha256(cookie)`；
- logout/revoke 是 server-side，不只是清浏览器 cookie；
- 多个 `Set-Cookie` header 用 append，不用逗号拼接；
- OAuth state 带 provider scope、subject scope、过期时间，并且只能使用一次；
- credential binding 暴露 `credential_ref`、provider、subject、account、scopes、status 和 timestamps；
- raw OAuth/API key material 只能通过 Host broker resolve；
- credential rebinding evidence 不包含 token、API key、refresh token、password 或 private key；
- 测试可以使用共享的 in-process mock OAuth fixture。

Host 仍然拥有生产决策：

- 真实 auth UX 和 user identity model；
- OAuth app registration 和 provider-specific consent screen；
- 持久化存储、加密、Keychain/KMS/secret-manager 集成；
- token refresh 和 rotation policy；
- audit retention 和 operator workflow；
- provider-specific API clients。

## 核心流程

```text
CredentialRequirement
  -> 为 provider + subject 生成 OAuth state
  -> OAuth callback exchange code
  -> 创建 HostCredentialBinding
  -> credential_ref 进入 CredentialRebindingEvidence
  -> raw secret 仍然只在 broker.resolveCredential() 后面
```

`CredentialRequirement` 仍然来自 Creation Host Authoring Kit：

```ts
const requirement = {
  id: "github-user-token",
  provider_id: "github",
  scopes: ["repo", "read:user"],
  binding_mode: "per-user",
  placement: "host-broker",
  required: true,
} as const;
```

M30 helpers 接受 `placement: "host-broker"`。`keychain`、`kms`、`secret-manager` 或 `env` 等其他 placement 仍然是 Host-owned adapter choice。

## Sessions 和 Cookies

```ts
import {
  InMemoryHostSessionStore,
  appendHostSetCookie,
  readHostCookie,
  serializeHostCookie,
} from "@pneuma-framework/core/host-sessions";

const sessions = new InMemoryHostSessionStore();

const created = await sessions.createSession({
  subject_ref: "user:charlie",
  ttl_ms: 7 * 24 * 60 * 60 * 1000,
});

const headers = new Headers();
appendHostSetCookie(headers, serializeHostCookie("pneuma_session", created.cookie, {
  max_age_seconds: 7 * 24 * 60 * 60,
  secure: true,
}));

const cookie = readHostCookie(request, "pneuma_session");
const session = cookie
  ? await sessions.lookupSession(cookie)
  : undefined;
```

规则：

- 存 `session.cookie_hash`，不要存 `created.cookie`；
- logout 时调用 `revokeSession(cookie)`；
- 如果把 in-memory reference store 的形状改成持久化实现，Host maintenance code 应该定期调用等价的 `sweepExpired()`；
- 多 cookie 响应用 `Headers.append("Set-Cookie", value)`，不要用逗号拼接。

## Credential Broker

```ts
import {
  InMemoryHostCredentialBroker,
  createCredentialRebindingEvidenceFromBindings,
} from "@pneuma-framework/core/host-credentials";

const broker = new InMemoryHostCredentialBroker();

const binding = await broker.bindCredential({
  requirement,
  subject_ref: "user:charlie",
  account_ref: "github:pandazki",
  scopes: ["repo", "read:user"],
  secret: {
    kind: "oauth2",
    access_token: process.env.GITHUB_TOKEN!,
    token_type: "bearer",
  },
});

const resolved = await broker.resolveCredential(binding.credential_ref);
// resolved.secret.access_token 只能通过 broker 拿到。

const evidence = createCredentialRebindingEvidenceFromBindings({
  evidence_id: "charlie-dev-board-bindings",
  artifact_id: "dev-board-share",
  app_id: "dev-board",
  version_id: "v3",
  subject: "user:charlie",
  requirements: [requirement],
  bindings: [binding],
});
```

规则：

- share artifact 和 governance manifest 携带 credential requirements，不携带 secrets；
- credential rebinding evidence 携带 `credential_ref`、status、provider、requirement 和 timestamp；
- `resolveCredential` 对 revoked 或 expired binding fail closed；
- scopes 不满足时，bind 会在存 secret 前失败。

## OAuth Callback Binding

```ts
import {
  InMemoryHostCredentialBroker,
} from "@pneuma-framework/core/host-credentials";
import {
  InMemoryOAuthStateStore,
  bindOAuthCallbackCredential,
  createOAuth2Provider,
} from "@pneuma-framework/core/host-oauth";

const states = new InMemoryOAuthStateStore();
const broker = new InMemoryHostCredentialBroker();

const provider = createOAuth2Provider({
  provider_id: "github",
  authorization_url: "https://github.com/login/oauth/authorize",
  token_url: "https://github.com/login/oauth/access_token",
  account_url: "https://api.github.com/user",
});

const issued = await states.issueState({
  provider_id: "github",
  subject_ref: "user:charlie",
  requirement_id: requirement.id,
  redirect_uri: "http://127.0.0.1:3000/oauth/github/callback",
  ttl_ms: 10 * 60 * 1000,
});

const authorizeUrl = provider.buildAuthorizeUrl({
  client_id: process.env.GITHUB_CLIENT_ID!,
  redirect_uri: issued.redirect_uri,
  scopes: requirement.scopes,
  state: issued.state,
});

// 把 Builder redirect 到 authorizeUrl，然后在 callback 中处理：
const result = await bindOAuthCallbackCredential({
  provider,
  broker,
  state_store: states,
  state: callbackState,
  code: callbackCode,
  requirement,
  subject_ref: "user:charlie",
  client_id: process.env.GITHUB_CLIENT_ID!,
  client_secret: process.env.GITHUB_CLIENT_SECRET!,
  redirect_uri: issued.redirect_uri,
});
```

callback helper 会：

- 只消费一次 OAuth state；
- 校验 provider、subject 和 requirement 匹配；
- 通过 provider adapter exchange code；
- 拉取 provider account；
- 在 broker 里绑定 credential；
- 返回一个不含 secret 的 `evidence_binding`，可用于 credential rebinding evidence。

Provider response compatibility：

- `createOAuth2Provider` 使用 `application/x-www-form-urlencoded` 发送 token request；
- token response 可以是 JSON，也可以是 `application/x-www-form-urlencoded`；
- `scope` 可以是空格分隔字符串，`scopes` 可以是数组；
- provider-specific account payload 应该用 `map_account` 归一化。

M31 下游压力确认这点对 GitHub-style OAuth Apps 很重要：Host 可以保留自己的 GitHub account mapping 和 encrypted credential store，同时把 authorize URL construction、token exchange、token-response parsing 委托给 framework helper。

## 测试 Fixture

下游 Host 不应该为每个 provider-shaped test 重写 OAuth mock。M30 增加了一个通用 in-process fixture：

```ts
import {
  InMemoryHostCredentialBroker,
} from "@pneuma-framework/core/host-credentials";
import {
  InMemoryOAuthStateStore,
  bindOAuthCallbackCredential,
  startMockOAuthServer,
} from "@pneuma-framework/core/host-oauth";

const mock = startMockOAuthServer({ provider_id: "github" });

try {
  mock.stageCode({
    code: "oauth-code-1",
    token: {
      access_token: "gho_mock_secret",
      refresh_token: "refresh_mock_secret",
      token_type: "bearer",
      scopes: ["repo", "read:user"],
    },
    account: {
      account_ref: "github:charlie",
      display_name: "charlie",
    },
  });

  // 在 bindOAuthCallbackCredential(...) 中使用 mock.provider。
} finally {
  mock.stop();
}
```

这个 fixture 面向 Host 测试。它不是一个真实 GitHub/Linear/OpenRouter adapter。

## 下游采纳模式

DevBoard Studio 已经采纳这些工具，同时没有把 production secrets 移进 framework-owned storage：

- 保留 Host-owned SQLite tables：`host_sessions` 和 `host_credentials`；
- 保留 Host-owned token-at-rest encryption；
- 使用 framework helpers 生成 session cookie、hash cookie、解析 cookie、append 多个 `Set-Cookie`；
- 使用 framework OAuth provider helpers 构造 authorize URL 和执行 token exchange；
- 使用 framework OAuth fixture 跑 callback round-trip test；
- 使用 `createCredentialRebindingEvidenceFromBindings` 从 Host credential refs 生成 no-secret evidence。

这是推荐的第一条 adoption path。先替换重复的安全机制；只有真实 Host 证明 in-memory reference shape 太低层时，再考虑 persistent framework store interface。

## 建议下游补的测试

建议证明：

- session record 不包含 raw cookie value；
- logout 会 revoke server-side session row；
- OAuth state 不能复用；
- 错误 provider 或错误 subject 不能消费 state；
- scopes 不足时，在存 secret 前拒绝；
- credential evidence 不包含 access token 或 refresh token；
- revoked 和 expired credential 不能 resolve；
- install/fork governance 消费的 credential rebinding evidence 的 `version_id` 和 artifact version 匹配。

## 下游 Host 可以替换掉什么

通常可以删除：

- 手写 cookie serializer/parser；
- 逗号拼接 `Set-Cookie` 的响应代码；
- 没有 subject/provider check 的 in-memory OAuth state map；
- share/install/fork evidence 中的 raw token 字段；
- 每个 Host test suite 自己复制的 provider mock server。

通常仍然 Host-owned：

- persistent session 和 credential tables；
- at-rest encryption；
- provider-specific refresh logic；
- account linking UI；
- app-specific runtime API clients。
