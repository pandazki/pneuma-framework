# Milestone 31 Snapshot 中文版 — Downstream Credential Adoption Pressure

**日期：** 2026-05-09  
**状态：** 作为 post-RC adoption-pressure milestone 关闭。它不是 `pneuma-rc-0.1.4` release tag。  
**输入：** M30 增加了 Host credential utilities；M31 验证一个下游 Creation Host 是否真的能理解并使用它们，而不是必须读 framework 内部源码。

## M31 证明了什么

M31 把 DevBoard Studio 迁移到 M30 credential helpers，同时保留它自己的 Host-owned persistence 和 encryption boundary：

```text
DevBoard Studio
  -> framework OAuth provider + mock OAuth fixture
  -> framework cookie serialization/parsing
  -> framework session cookie hashing
  -> framework credential rebinding evidence builder
  -> Host-owned SQLite + AES-GCM keystore 仍留在 DevBoard
```

这正是预期边界：

```text
Framework utility shape 可复用。
Host production identity 和 secret storage 仍然 Host-owned。
```

## 采纳结果

| 领域 | 结果 |
|---|---|
| OAuth authorize URL | DevBoard 现在把 URL 构造委托给 `createOAuthAuthorizeUrl`。 |
| OAuth code exchange | DevBoard 现在把 provider-neutral code exchange 委托给 `createOAuth2Provider`。 |
| OAuth test fixture | DevBoard 的 round-trip test 改用 framework `startMockOAuthServer`，不再依赖 GitHub-specific OAuth mock。 |
| Cookie handling | DevBoard 现在使用 `serializeHostCookie`、`readHostCookie` 和 `appendHostSetCookie`。 |
| Session hash discipline | DevBoard 现在使用 `createHostSessionCookie` 和 `hashHostSessionCookie`，同时保留自己的 SQLite session table。 |
| Credential evidence | DevBoard 现在用 `createCredentialRebindingEvidenceFromBindings` 从 Host credential refs 生成 rebinding evidence。 |
| Host-owned secret boundary | DevBoard 保留 encrypted credential rows 和 broker endpoint。M31 没有把 durable secret persistence 移进 framework。 |

## Framework 调整

这次 adoption test 暴露出一个真实 framework rough edge：provider token endpoint 即使请求有效，也可能返回 `application/x-www-form-urlencoded`。GitHub OAuth Apps 就是常见例子。

M31 更新 `createOAuth2Provider`，让 token response 可以同时解析 JSON 和 form-encoded body。framework 测试已覆盖这个形状。

## 下游调整

DevBoard 指向更新后的 framework source 后，还暴露了一个非 credential 的类型对齐问题：rejected code-change receipt 现在是一等 `status: "rejected"`，不再折叠成 `failed_framework`。

DevBoard 已更新 proposal persistence/test expectation 来接受显式 `rejected` receipt status。这是 contract alignment，不是 credential feature。

## 验证

Framework 命令：

```bash
bun test packages/core/test/host-oauth.test.ts packages/core/test/host-sessions.test.ts packages/core/test/host-credentials.test.ts
bun run typecheck
```

Framework 结果：

- Host credential/session/OAuth suite：`13 pass`，`0 fail`，`52 expect() calls`。
- Typecheck：通过。

下游命令，在 `/Users/pandazki/Tmp/pneuma-framework-example-devboard-studio` 中运行：

```bash
bun run typecheck
bun test
```

下游结果：

- Typecheck：通过。
- 下游 full suite：`138 pass`，`0 fail`，`873 expect() calls`，覆盖 `33 files`。

## 剩余边界

M31 刻意不把 DevBoard 的 persistent credential table、AES-GCM keystore、GitHub REST fixture、account-linking UI 或 internal broker endpoint 提升成 framework API。

下一条有价值的 credential lane 不是“framework 变成 production IAM”。更窄的决策是：未来的 Host utility package 是否应该提供 session / credential ref 的 persistent-store interface，同时仍然把 storage/encryption implementation 留给 Host。

