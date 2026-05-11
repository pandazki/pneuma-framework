# 下游验证说明

**读者：** 准备基于当前 pneuma-framework repo 从零构建一个 Creation Host 的外部 Developer
**English version:** [downstream-validation-brief.md](./downstream-validation-brief.md)

这份说明面向一个新的下游项目，而不是继续之前的 DevBoard Studio 验证。目标是测试一个 Developer 是否能只依赖当前文档和代码，构建出真实的 Creation Host 形态，并把 framework 缺口反馈回来。

请始终保留这个产品模型：

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

## 1. 任务目标

构建一个小而完整的 Creation Host，证明 framework 可以支持：

- Developer-authored Host，包含 profiles 和 authoring files；
- Builder-facing workflow，用来创建或演进 Generated Application；
- Generated Application 的 preview 和 inspection；
- 一个由 Builder + Build-phase Agent 发起的 governed change path；
- approval-time review packet 和 execution-time assurance case；
- publish、restart、rollback，或者一个清楚说明过的本地等价路径；
- 最终 gap report，明确区分 framework 缺口和 Host 产品选择。

app domain 可以自行选择。它应该足够小，能完成；也应该足够真实，能暴露 framework 摩擦。

如果下游团队不想自行选择 domain，可以直接使用 [LaunchRoom Studio PRD 中文版](../product/launch-room-studio-prd.zh-CN.md)。

## 2. 非目标

不要把验证时间花在：

- production SaaS hosting；
- marketplace transport；
- signed artifact provenance；
- production IAM；
- durable secret-management infrastructure；
- zero-downtime rollout；
- 商业级精致 UI；
- 重建所有 Pneuma 2.x modes。

mock 是可以接受的，只要它保留 framework contract。比如，mock OAuth provider 比直接跳过 credential rebinding 更好。

## 3. 必读顺序

按产品层阅读，不按 milestone 年表阅读：

1. [Start Here 中文版](./start-here.zh-CN.md)
2. [Getting Started 中文版](./getting-started.zh-CN.md)
3. [Creation Host Contract 中文版](./creation-host-contract.zh-CN.md)
4. [BuildThread 中文版](./build-thread.zh-CN.md)
5. [Scaffold Project Contract 中文版](./scaffold-project-contract.zh-CN.md)
6. [Code Change Lane 中文版](./code-change-lane.zh-CN.md)
7. [Build Assurance 中文版](./build-assurance.zh-CN.md)
8. [Build Assurance Adoption 中文版](./build-assurance-adoption.zh-CN.md)
9. [Runtime Composition 中文版](./runtime-composition.zh-CN.md)
10. [Release Rollout Authoring 中文版](./release-rollout-authoring.zh-CN.md)
11. [HostExtension Slots 中文版](./host-extension-slots.zh-CN.md)
12. [Host Credential Broker Utilities 中文版](./credential-broker.zh-CN.md)
13. 只有需要 ADR 或 milestone 证据时，再读 [Architecture Index](../architecture/README.md)。

如果两个文档有冲突，请把冲突记录进 gap log，不要悄悄选一个。

## 4. 本地依赖规则

使用上游 repo 作为 local dependency。不要等 npm release。

推荐形态：

```json
{
  "dependencies": {
    "@pneuma-framework/core": "file:/absolute/path/to/pneuma-framework/packages/core",
    "@pneuma-framework/runtime": "file:/absolute/path/to/pneuma-framework/packages/runtime",
    "@pneuma-framework/core-domain": "file:/absolute/path/to/pneuma-framework/packages/core-domain"
  }
}
```

请在你的项目 README 中记录上游 commit hash，保证验证可复现。

对于 `pneuma-rc-0.2.0` 及之后的本地 RC，全新的下游项目不应该需要 `workspace:*`。如果 `file:` 安装在你的 Host 代码运行前就失败，请把它记录为 package-consumption gap。

## 5. 最小交付物

你的下游项目应该包含：

| 交付物 | 必须包含 |
|---|---|
| Product README | 你构建了什么 Host，Developer / Builder / End User 分别是谁，创建出的 Generated Application 是什么。 |
| Host authoring files | `profiles.json`、`agent-package.json`、`pneuma.scaffold.json`、`provider-capabilities.json`；如果包含 share/fork/install，还要有 share/governance/rebinding examples。 |
| Runnable Host | 一个本地启动 Builder-facing Creation Host 的命令。 |
| Builder path | 一个可见的创建或演进 Generated Application 的路径。 |
| Inspection path | 至少一个 schema/data/source/runtime/evidence inspection surface。 |
| Governed change | 一个 Builder intent 进入 proposal、review packet、approval/rejection、execution receipt、assurance case。 |
| Negative path | 至少一个 denied、blocked、failed、recovered 或 fail-closed path。 |
| Tests | contract tests 加至少一个 end-to-end smoke test。 |
| Gap log | 使用 framework 和文档时遇到的具体摩擦。 |

## 6. Contract Checklist

有 framework validator 时优先使用：

- `validateCreationHostProfileContract`
- `validateBuildAgentPackageManifest`
- `validateScaffoldProjectManifest`
- `validateProviderCapabilityMatrix`
- `validateShareArtifactManifest`
- `validatePortableArtifactSafety`
- `validateSharingGovernanceManifest`
- `validateCredentialRebindingEvidence`
- `validateSharingGovernanceBundle`
- `evaluateSharingGovernanceBundle`
- `validateHostExtensionSlotRegistry`
- `validateHostExtensionManifest`
- `validateHostExtensionBundle`
- `validateBuildChangeReviewPacket`
- `validateBuildChangeAssuranceCase`
- `evaluateBuildChangeRecoveryDrillMatrix`
- `createCreationHostReadinessSummary`

同时在 CI 或本地脚本里跑 `doctor-host`。

对于 install/fork/publish 执行，不要在 Host 里手工拼一串 partial checks。应在边界调用 `evaluateSharingGovernanceBundle`，只要返回 `allowed: false` 就 fail closed。任何导出的 artifact bundle 在写入或对外提供前，都应先跑 `validatePortableArtifactSafety`。

## 7. 建议验证命令

按你的下游 repo 调整：

```bash
bun install
bun test
bun run typecheck
```

如果使用上游 scaffold：

```bash
bun /absolute/path/to/pneuma-framework/packages/cli/src/index.ts doctor-host \
  --workspace ./.pneuma-workspace \
  --profiles ./profiles.json \
  --scaffold-project ./pneuma.scaffold.json \
  --agent-package ./agent-package.json \
  --provider-capabilities ./provider-capabilities.json
```

如果包含 sharing/fork/install：

```bash
bun /absolute/path/to/pneuma-framework/packages/cli/src/index.ts doctor-host \
  --workspace ./.pneuma-workspace \
  --profiles ./profiles.json \
  --scaffold-project ./pneuma.scaffold.json \
  --agent-package ./agent-package.json \
  --provider-capabilities ./provider-capabilities.json \
  --share-artifact ./share-artifact.example.json \
  --sharing-governance ./sharing-governance.example.json \
  --credential-rebinding ./credential-rebinding.example.json
```

## 8. Gap Log 模板

每条 gap 使用这个格式：

```markdown
### #N — Short title

**Area:** docs | core contract | runtime | agent backend | credential | assurance | release | UI integration | other
**Severity:** blocker | high | medium | low

**What I tried:**

**What failed or felt unclear:**

**What I used as a workaround:**

**What I think upstream should change:**

**Evidence:** file paths, failing command, screenshot, trace, or test name
```

好的 gap 必须具体。“文档很 confusing”没有太大帮助。“contract guide 说 `requirements` 可以是 ids，但 validator 需要完整 `CredentialRequirement` objects”才有价值。

## 9. 会让验证失效的捷径

不要：

- 让 Build-phase Agent 直接修改 framework internals；
- 把 tokens、API keys、private keys、refresh tokens 或 passwords 存入 portable manifests；
- 因为 demo 是本地的就绕过 approval；
- 只展示 happy path；
- 不重新读当前文档，直接复制旧 DevBoard Studio 结构；
- 把 Host product decision 误报成 framework bug。

## 10. 上游最想知道什么

最有价值的报告会回答：

- 新 Developer 是否能在没有口头解释的情况下理解四层模型？
- 哪些文档是必要的、重复的、过期的、缺失的？
- 哪些 validators 真的抓到了错误？
- 哪些 framework helpers 减少了 Host 重复代码？
- 哪个 helper 仍然太底层，或太耦合 reference Host？
- Build Assurance 是否让 approval/publish 决策更清楚？
- framework 是否不小心把产品选择推给了 Host？
- 什么会阻碍第二个下游团队重复你的工作？
