# Milestone 22 快照：Creation Host Authoring Kit

**状态：** 已闭合。已完成 Build Agent Package manifests、provider capability matrices、portable share artifacts、scaffold integration、Host doctor diagnostics、provider parity contracts，以及 core/CLI/typecheck 验证。

**日期：** 2026-05-05

## 为什么需要 M22

M21 让新的 Developer 可以 scaffold 和 diagnose 一个 starter Creation Host。

下一个缺口来自 Bob / Charlie / Dave 的故事：

```text
Alice 基于 pneuma-framework 做了一个产品。
Bob 用 Alice 的 Creation Host 构建 dev-board。
Charlie 按 Bob 的默认设置安装这个 shared app。
Dave fork Bob 的 app，切换 provider profile，移除 Apple Notes，并部署到别处。
```

这个故事的核心不是 SQLite、Postgres、Docker、GitHub 或 Linear，而是一个更底层的 authoring 问题：

> Developer 如何准备 Build Agent、provider choices、credential boundary 和 share/fork recipe，让 Builder 可以创建可迁移的应用，同时避免 agent 泄漏 provider-specific implementation decisions？

M22 给出第一版 contract-backed answer。它不做完整 marketplace、credential broker、installer 或生产 migration engine。它让 Developer 有一组可以 scaffold、测试、诊断和演进的机器可读 Authoring Kit contract。

## 改了什么

### 1. Build Agent Package Manifest

`@pneuma-framework/core` 现在导出第一版 Developer-authored Build Agent Package contract：

```ts
validateBuildAgentPackageManifest(manifest)
```

manifest 声明：

- package id 和 version；
- instructions path；
- semantic tool allowlist；
- provider capability matrix id；
- provider-specialization policy；
- credential boundary；
- review checklist；
- verification hooks。

M22 的关键 invariant 是：

```text
Build Agent Package = Developer 编写的 guardrail package
Build Agent Session = 从 package 创建出来的 Builder-specific runtime instance
```

framework 校验 package shape。Host 仍然拥有 product policy、agent instructions 和 Builder-facing experience。

### 2. Provider Capability Matrix

`@pneuma-framework/core` 现在导出：

```ts
validateProviderCapabilityMatrix(matrix)
```

matrix 声明：

- `relational-store`、`github-issues`、`semantic-index`、`local-notes` 等 capabilities；
- provider/profile support；
- unsupported capabilities 和 fail-closed behavior；
- credential requirements；
- 多个 profile 声明同一 capability 时的 parity contracts。

这就是 SQLite/PG 边界：

```text
Build Agent 面向 capability contracts 工作。
Provider implementations 是 Developer/Host 的责任。
```

如果两个 profile 都声明支持 `relational-store`，M22 要求 parity contract 和 verification hook。这样可以防止 “SQLite path” 或 “Postgres branch” 变成隐藏的 Build Agent 行为。

### 3. Portable Share Artifact Manifest

`@pneuma-framework/core` 现在导出：

```ts
validateShareArtifactManifest(manifest)
```

share artifact 明确是 portable recipe，不是数据库拷贝：

```text
includes:
  app_definition
  init_recipe
  provider_requirements

excludes:
  secrets
  private_derived_cache
  source_database
```

初始化步骤必须是幂等的 semantic operations。接收方 Builder 必须重新绑定自己的 credentials。

这意味着 Bob 可以分享 `dev-board`，但不会导出 Bob 的 SQLite volume、GitHub token、Linear token、Apple Notes 数据或 private derived cache。

### 4. Cross-Contract Validation

`@pneuma-framework/core` 现在导出：

```ts
validateHostAuthoringKitContracts({
  agent_package,
  provider_capabilities,
  share_artifact,
})
```

它会把 authoring files 当成一个 kit 检查：

- Build Agent Package 引用的 provider matrix 存在；
- provider parity verification hooks 在 package 中存在；
- share artifact 引用已知 source profile；
- target profiles 存在并满足 required capabilities；
- package id/version 与 share artifact 一致；
- 没有嵌入 raw source database 或 secret-like material。

### 5. Scaffold + Doctor Integration

`pneuma-framework scaffold-host` 现在会生成：

```text
agent-package.json
provider-capabilities.json
share-artifact.example.json
agent-policy.md
```

scaffold 出来的 package doctor script 会校验这些文件。

`pneuma-framework doctor-host` 现在支持：

```bash
--agent-package ./agent-package.json
--provider-capabilities ./provider-capabilities.json
--share-artifact ./share-artifact.example.json
```

Doctor 会把 authoring-kit diagnostics 和 workspace/profile diagnostics 一起报告。

### 6. Developer Guides

Developer guides 已补充 Authoring Kit 边界：

- [Creation Host Contract](../developer/creation-host-contract.md)
- [Creation Host Contract 中文版](../developer/creation-host-contract.zh-CN.md)
- [Getting Started](../developer/getting-started.md)
- [Getting Started 中文版](../developer/getting-started.zh-CN.md)

## M22 证明了什么

M22 证明 framework 可以帮助 Developer author 一个 Creation Host，同时不接管 Host product：

```text
Developer 声明 Build Agent Package
  -> 声明 provider capability profiles
  -> 声明 credential requirements
  -> 声明 portable share/fork artifact shape
  -> scaffold 生成这些文件
  -> doctor 诊断这些文件
  -> core validators 让 contract 可以被测试
```

这是顶层四制品模型和未来 shared-app / team / org story 之间的第一条具体桥。

Build Agent 现在有了契约上干净的上下文：

```text
Allowed:
  profile_id
  capabilities
  credential_requirements
  semantic tools

Forbidden:
  raw secrets
  copied source databases
  provider-specific implementation branches
```

## M22 没有证明什么

M22 不声称：

- 已有真实 credential broker；
- 已有 OAuth 或企业 identity integration；
- 已有真实 SQLite-to-Postgres data migration；
- 已有生产 installer 或 marketplace；
- 支持 publish 后 runtime provider switching；
- 支持自动 vector-store rebuild；
- 已有 multi-user / organization sharing governance；
- 已有 polished Host Authoring Assistant 自动为 Developer 生成这些文件。

这些都故意不在本 slice 范围内。M22 的目标是在进入 team/org sharing 之前 pin 住 contract boundary。

## Bob / Charlie / Dave 在 M22 后怎么走

```text
Bob 构建 dev-board
  profile: local-sqlite-docker
  capabilities: relational-store, github-issues, linear-projects, apple-notes
  credentials: Bob 在本地重新绑定 GitHub/Linear

Bob 分享 dev-board
  artifact includes app definition + semantic init recipe + provider requirements
  artifact excludes secrets + source database + private derived cache

Charlie 按默认安装
  target profile: local-sqlite-docker
  Host 校验 required capabilities
  Charlie 重新绑定 credentials
  init recipe 重放 semantic operations

Dave fork 到远端
  target profile: remote-postgres-docker
  Host 校验 relational-store parity contract
  unsupported apple-notes fail closed
  Dave 在 publish 前移除 Apple Notes
  Dave 重新绑定 credentials，并按自己的 profile 部署
```

这仍然是 conceptual/runtime-contract work，不是完整产品 installer。但关键歧义已经消失：分享单位是 recipe，credentials 由接收方重新绑定，Build Agent 面向 capabilities 工作而不是写 provider-specific branches。

## 验证证据

Focused Authoring Kit tests：

```text
bun test packages/core/test/host-authoring.test.ts packages/core/test/developer-experience.test.ts packages/cli/test/developer-experience.test.ts
23 pass
0 fail
74 expect() calls
```

Core/domain/CLI regression：

```text
bun test packages/core-domain packages/core packages/cli
812 pass
0 fail
2493 expect() calls
```

Typecheck：

```text
bun run typecheck
exit 0
```

Diff whitespace check：

```text
git diff --check
exit 0
```

## M22 后的 RC 边界

M22 让下一步判断更窄：

```text
M22 关闭 Creation Host Authoring Kit contracts
  -> Developer 可以 scaffold 和测试 authoring files
  -> Build Agent package / provider matrix / share artifact 边界明确
  -> 下一条主要压力线是 team/org sharing governance
```

项目不应该为了泛化而继续扩张 provider abstraction。更有价值的下一个问题，是 DDD review 已经识别出的第二个大产品问题：

> 多个 Builder / user / organization 如何安全地 share、fork、approve 和 operate Generated Applications？
