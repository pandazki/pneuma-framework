# M25 Story Kit：Alice 构建 Creation Host

**受众：** 没有 Pneuma 历史背景的 Developer 或团队成员。

**目的：** 先讲清楚 Alice 的认知路径，再展示 Bob/Charlie/Dave 的结果，从而解释 `pneuma-framework` 为什么存在。

**可运行 prototype：** [README.md](./README.md)

**英文版：** [STORY.md](./STORY.md)

## 这条故事想让大家记住什么

M25 最终应该让听众记住一句话：

```text
pneuma-framework 帮 Alice 构建 Creation Host；
Bob 通过这个 Host 和 agent 创建 Generated Application；
Charlie / Dave 可以 install 或 fork 这些 app，
但不复制数据库，也不复制 secrets。
```

这不是“Alice 写了一个 app”的故事，而是“Alice 写了一个让 Builder 创建 app 的产品表面”的故事。

## 视觉地图

| 图片 | 回答的问题 | 资产 |
|---|---|---|
| 产品四层模型 | Alice、Bob、End User 分别接触哪一层？ | [m25-story-product-model.png](../../docs/architecture/assets/m25-story-product-model.png) |
| 角色旅程 | 故事如何从 Alice 走到 Bob，再走到 Charlie/Dave？ | [m25-story-role-journey.png](../../docs/architecture/assets/m25-story-role-journey.png) |
| Contract stack | 哪些 framework contracts 让这个故事安全成立？ | [m25-story-contract-stack.png](../../docs/architecture/assets/m25-story-contract-stack.png) |
| Install vs fork | Charlie install 和 Dave fork 为什么不是一回事？ | [m25-story-install-vs-fork.png](../../docs/architecture/assets/m25-story-install-vs-fork.png) |

![产品四层模型](../../docs/architecture/assets/m25-story-product-model.png)

![角色旅程](../../docs/architecture/assets/m25-story-role-journey.png)

![合约栈](../../docs/architecture/assets/m25-story-contract-stack.png)

![安装 vs 分叉](../../docs/architecture/assets/m25-story-install-vs-fork.png)

## 角色表

| 人物 | 领域模型里的角色 | 需要什么 |
|---|---|---|
| Alice | Developer | 用 framework 构建 Creation Host 的 contract，而不是写一个一次性的 app。 |
| Bob | Builder | Alice 准备好的 Build-phase Agent，以及 preview / inspect / publish 控制面。 |
| Charlie | Installer / Builder | 使用 Bob 的默认 artifact，但绑定自己的 provider credentials。 |
| Dave | Forking Builder | fork app，切换 provider profile，并移除 unsupported capabilities。 |
| End User | Published Application user | 使用 release-mode app 表面；不一定看到 Build-phase Agent。 |

## 故事主线

### Act 1 — 先命名产品层

Alice 第一个问题是：“我是在写 app，还是在写 app builder？”

答案是项目的核心边界：

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

Alice 构建 Creation Host。Bob 通过这个 Host 创建 `dev-board`。End Users 打开 Published Application。如果这个边界丢失，后面的 governance、sharing、provider 决策都会变模糊。

### Act 2 — 决定自由度来自哪里

Bob 不应该让一个无约束 agent 随便猜工程架构。Alice 先决定 Creation Host 暴露哪些 profile：

```text
local-sqlite-docker
remote-postgres-docker
```

framework 不把 SQLite 或 Postgres 当成语义真相。Host 要证明在需要的地方，这两个 profile 实现同一个 capability contract。

### Act 3 — 准备 Build-phase Agent

Bob 的 agent 不是一个拥有无限上下文的裸 coding agent。Alice 准备 Build Agent Package：

```text
instructions
tool allowlist
provider-specialization policy
credential boundary
review checklist
verification hooks
```

最关键的规则是：

```text
Agent 只看 capability contracts，
不看 provider implementation branches。
```

### Act 4 — 创建 Bob 的 dev-board

Bob 想要一个日常开发看板，聚合：

```text
GitHub issues / PRs
Linear project work
GitHub CI attention
Apple Notes context
```

生成出来的是 `dev-board@v3`。它拥有自己的 definition、data、versions 和 release history。它不是 Alice 的 Creation Host。

### Act 5 — 分享，但不复制整个世界

Bob 分享的是 portable artifact：

```text
包含：
  app definition
  idempotent semantic init recipe
  provider requirements

不包含：
  source database
  secrets
  private derived cache
```

Charlie 可以安装默认 artifact，但必须重新绑定自己的 GitHub 和 Linear credentials。这是 credential rebinding，不是 credential transfer。

### Act 6 — Fork 并切换 provider

Dave 想要 Linux/cloud 路径。他选择 fork，并切换到 `remote-postgres-docker`。

只有满足这些条件才允许：

```text
fork grant scope 是 forks
credential evidence 绑定正确 version
remote profile 支持 required capabilities
unsupported Apple Notes 被移除
Builder agent 没有使用 provider-specific migration
```

Dave 的 fork 证明 portability 是通过 Host contracts 进行 semantic re-materialization，而不是让 agent 做 raw database migration。

## Contract 与 Evidence 对照表

| 阶段 | Contract | Prototype evidence | 失败探针 |
|---|---|---|---|
| 产品层 | Creation Host model | `artifact-model-boundary` | 把 framework / Host / app 折叠成一个 “pneuma app” |
| Agent package | `BuildAgentPackageManifest` | `agent-package-valid` | 泄露 raw provider implementation |
| Provider profiles | `ProviderCapabilityMatrix` | `provider-matrix-valid`, `provider-parity-present` | 缺少 parity hook |
| Credential boundary | `CredentialRequirement`, `CredentialRebindingEvidence` | `credential-boundary-no-secret`, `credential-evidence-version-bound` | artifact/evidence 里出现 secret，或 evidence 版本过期 |
| Portable sharing | `ShareArtifactManifest` | `share-artifact-valid`, `share-artifact-no-source-db` | 把 source DB 或 private cache 放进 artifact |
| Governance | `SharingGovernanceManifest` | `charlie-install-allowed`, `dave-fork-allowed` | grant scope 错误 |
| Fork compatibility | Provider matrix + fork plan | `apple-notes-local-only`, `provider-specific-migration-blocked` | Apple Notes 泄漏，或出现 provider-specific migration |
| RC judgment | M24 pressure evaluator | `rc-pressure-passed`, `productization-gaps-explicit` | 把 production gaps 假装已经解决 |

## Demo 讲解顺序

1. 打开 prototype。
2. 从 stage 1 开始，直接读 Alice 的问题。
3. 按 stage 逐步点击，不要一开始就跳到 generated app preview。
4. stage 3 停一下，强调 “Alice 准备 Bob 的 agent”。
5. stage 4 停一下，强调 “provider compatibility 属于 Alice 的 Host contract”。
6. stage 7 解释分享的是 recipe，不是 Bob 的数据库。
7. stage 8 和 stage 9 对比 Charlie install 与 Dave fork。
8. stage 10 收尾：M25 支持 RC review，不等于 production marketplace readiness。

## 这条故事守住了哪些边界

- framework 不是某一个具体 app。
- Creation Host 不是 marketplace。
- Generated Application data 不是 share artifact。
- Provider portability 不是 agent-authored migration。
- Credential rebinding evidence 不是 secret container。
- RC readiness 不是 production readiness。

## 故事之后是什么

这个故事已经可以进入 candidate-release review。RC 之后，productization lanes 可以被明确选择：

- 真实 credential broker；
- OAuth/account binding；
- signed artifacts；
- install/fork governance UI；
- 真实 Postgres adapter；
- team/org admin workflows；
- marketplace/share transport。
