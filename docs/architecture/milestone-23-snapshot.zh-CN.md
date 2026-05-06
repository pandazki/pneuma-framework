# Milestone 23 快照：Sharing Governance Contract

**状态：** 已闭合。已完成 sharing governance manifests、credential rebinding evidence、scaffold integration、Host doctor diagnostics，以及 core/CLI/typecheck 验证。

**日期：** 2026-05-06

## 为什么需要 M23

M22 已经把 portable share/fork artifact 说清楚：

```text
share artifact = app definition + idempotent semantic init recipe + provider requirements
not share artifact = source database + secrets + private derived cache
```

下一个缺口仍然来自 Bob / Charlie / Dave 的故事：

```text
Bob 分享 dev-board。
Charlie 按 Bob 的默认本地配置安装。
Dave fork 它，切换 provider profile，移除一个 capability，并部署到别处。
```

M22 之后，artifact 已经可以迁移，但它外围的治理仍然是隐式的：

- 谁拥有这个 shared artifact；
- 谁可以 fork、install、publish、rollback 或 revoke；
- fork 后如何保留 source lineage；
- Host 如何证明 credentials 已经重新绑定，而不是复制 secrets；
- shared artifact 被 revoke 后会发生什么。

M23 关闭第一版 framework-level answer。它不做 marketplace、enterprise identity provider、OAuth flow、credential broker、admin UI 或 cross-host signing system。它做的是让 Host-level sharing contract 可以测试。

## 改了什么

### 1. SharingGovernanceManifest

`@pneuma-framework/core` 现在导出：

```ts
validateSharingGovernanceManifest(manifest)
```

manifest 声明：

- governance id；
- artifact id、app id、version id；
- optional source artifact/app/version lineage；
- owner subject；
- maintainer subjects；
- operator subjects；
- explicit right grants；
- required credential rebinding policy；
- revocation status。

Subject refs 使用稳定形状：

```text
user:<id>
role:<id>
team:<id>
org:<id>
```

这只是 framework contract shape，不是 enterprise identity implementation。

### 2. Sharing Decision Helper

`@pneuma-framework/core` 现在导出：

```ts
evaluateSharingGovernance(manifest, request)
```

这个 helper 回答 Host-level lifecycle 问题：

```text
这个 subject 能不能 share / fork / install / approve / publish / rollback / revoke 这个 artifact？
```

决策行为：

- revoked manifest 拒绝所有 action；
- owner 可以执行所有 sharing actions；
- maintainer 可以 share、approve、publish、rollback、revoke；
- operator 可以 publish、rollback；
- explicit grants 只会在 artifact/forks/published-app scope 匹配时允许具体 action；
- 当 manifest 标记 credential requirement 为 required 时，install/fork/publish 必须有完整 credential rebinding evidence。

输出包含稳定 reason code 和 evidence references，方便 Host UI、CI 和未来 audit sink 解释 denial。

### 3. CredentialRebindingEvidence

`@pneuma-framework/core` 现在导出：

```ts
validateCredentialRebindingEvidence(evidence, manifest)
```

evidence 记录：

- evidence id；
- artifact/app/version refs；
- subject ref；
- requirement refs；
- provider id；
- account ref；
- binding status；
- timestamp；
- non-secret labels。

validator 会拒绝 API key、OAuth token、refresh token、password、private key 等 secret-like material。credential value 不属于 share artifact、governance manifest 或 rebinding evidence。

### 4. Authoring Diagnostics

`diagnoseCreationHostAuthoring` 现在支持：

```ts
sharing_governance
credential_rebinding_evidence
```

diagnostics 会报告 sharing governance 和 credential rebinding files 是否被检查，并在以下情况输出可处理的 issue code：

- subject ref 格式错误；
- action 未知；
- explicit grant scope 和请求的 artifact/forks/published-app surface 不匹配；
- share artifact、governance manifest、rebinding evidence 指向不同 artifact/app/version ref；
- share artifact credential requirements 和 governance rebinding policy 漂移；
- credential evidence 引用了未知 requirement；
- evidence 包含 secret-like material；
- evidence 在缺少 governance manifest 的情况下单独提供。

### 5. Scaffold + Doctor Integration

`pneuma-framework scaffold-host` 现在会生成：

```text
sharing-governance.example.json
credential-rebinding.example.json
```

scaffold 出来的 package `doctor` script 会包含这些新文件。

`pneuma-framework doctor-host` 现在支持：

```bash
--sharing-governance ./sharing-governance.example.json
--credential-rebinding ./credential-rebinding.example.json
```

Doctor 会报告：

```text
sharing governance checked: yes
credential rebinding checked: yes
authoring sharing_governance: ok
authoring credential_rebinding: ok
```

## M23 后的 Bob / Charlie / Dave

```text
Bob 分享 dev-board
  -> share-artifact.example.json 排除 source database 和 secrets
  -> sharing-governance.example.json 把 Bob 记为 owner
  -> 授予 Charlie install、Dave fork/install
  -> 声明 GitHub/Linear rebinding requirements

Charlie 安装默认版本
  -> Host 检查 Charlie 的 install grant
  -> Host 检查 Charlie 的 rebinding evidence
  -> Bob 的 token 和 source database 不会跨过边界

Dave fork
  -> Host 检查 Dave 的 fork grant
  -> forked governance manifest 记录 source artifact/app/version lineage
  -> Dave 可以通过 Host-owned compatibility rules 切换 provider profile
  -> credentials 由 Dave 重新绑定，不从 Bob 那里复制

Bob 后续 revoke
  -> revoked manifest 拒绝之后的 share/fork/install/publish/rollback request
  -> M23 定义 decision surface，不定义产品通知 UI
```

## M23 证明了什么

M23 证明 framework 可以 pin 住第一版 team/org sharing governance contract，同时不吞掉整个 sharing product：

```text
Developer scaffold 一个 Creation Host
  -> 拿到 M22 的 Authoring Kit files
  -> 拿到 M23 的 Sharing Governance files
  -> doctor 校验所有 files
  -> core validators 让 governance 可以测试
  -> Host 可以评估 share/fork/install decisions
```

这是 portable artifacts 走向多人分享的第一条 contract-backed bridge。

它也保持了层次清楚：

```text
Runtime app policy:
  pneuma_policy_rules + Authorization Kernel

Host-level sharing governance:
  SharingGovernanceManifest + CredentialRebindingEvidence
```

两者相关，但不是同一个领域。

## M23 不证明什么

M23 不声称已经完成：

- 真实 OAuth implementation；
- enterprise identity provider mapping；
- signed share artifacts；
- credential broker storage、rotation、revocation；
- org admin UI；
- marketplace install/fork transport；
- cross-host trust；
- runtime app data policy changes；
- audit export and retention productization。

这些仍然是未来 team/org product 或 integration work。M23 只关闭 pre-RC contract boundary。

## 验证证据

```bash
bun test packages/core/test/sharing-governance.test.ts
```

```text
9 pass
0 fail
11 expect() calls
Ran 9 tests across 1 file. [71.00ms]
```

```bash
bun test packages/core/test/developer-experience.test.ts packages/cli/test/developer-experience.test.ts
```

```text
15 pass
0 fail
73 expect() calls
Ran 15 tests across 2 files. [680.00ms]
```

```bash
bun test packages/core-domain packages/core packages/cli
```

```text
824 pass
0 fail
2521 expect() calls
Ran 824 tests across 101 files. [11.50s]
```

```bash
bun run typecheck
```

```text
pass
```

```bash
git diff --check
```

```text
pass
```

```bash
node <markdown-link-check-script>
```

```text
checked 151 markdown files
```

## 推荐阅读

- [Creation Host Contract](../developer/creation-host-contract.md)
- [Creation Host Contract 中文版](../developer/creation-host-contract.zh-CN.md)
- [Getting Started](../developer/getting-started.md)
- [Getting Started 中文版](../developer/getting-started.zh-CN.md)
- [Open Questions](./OPEN-QUESTIONS.md)
- [Roadmap](./roadmap.md)
- [M23 design spec](../superpowers/specs/2026-05-06-m23-team-org-sharing-governance-design.md)
- [M23 implementation plan](../superpowers/plans/2026-05-06-m23-team-org-sharing-governance.md)

## 推荐下一步

回到 candidate release decision。

M20 关闭了 open-ended artifact boundary。M21 关闭了 developer onboarding。M22 关闭了 Authoring Kit contracts。M23 关闭了第一版 sharing-governance contract。剩下的 team/org 问题仍然真实存在，但除非团队明确选择前置某一项，否则它们不再是 pre-RC blocker。
