# Creation Host Authoring 与 Sharing Frame

**状态：** Working frame，不是 ADR。

**目的：** 保存 M21 之后关于 Developer 如何构建自定义 Creation Host，以及这如何引出后续 team/org sharing 与 enterprise security 的讨论。

## 场景

假设有一款 Mac 桌面应用叫 **my-awesome-widget**，简称 `mawidget`。

Alice 是 Developer。她基于 pneuma-framework 构建 `mawidget`。

Bob 安装了 `mawidget`，作为 Builder 创建了一个叫 `dev-board` 的 app。他选择了 `mawidget` 提供的 profile：

```text
sqlite local database + local Docker deployment
```

经过 N 个版本之后，`dev-board` 变成了 Bob 的日常开发工作看板：

- Linear 项目管理；
- GitHub issue / PR；
- GitHub CI；
- Apple Notes；
- Bob 自己习惯的工作流。

Bob 把 `dev-board` 分享给 Charlie 和 Dave。

Charlie 也是 macOS 用户。他沿用 Bob 的默认 profile，在本机启动，授权自己的 Linear/GitHub，Apple Notes 本来就在本地可访问。

Dave 使用 Linux，并希望云端部署。他不是直接使用 Bob 的 app，而是选择 fork。fork 时他选择了另一个 profile：

```text
remote Postgres database + Docker image for target server platform
```

他填写 AWS Postgres credential，移除 Apple Notes 功能，构建 Linux 服务器对应的 Docker image，自行部署，并初始化自己的 provider 授权。

## 主要结论

下一个大产品/设计问题不只是：

> Bob 如何做一个 app？

而是：

> Alice 如何构建一个 Creation Host，让 Bob、Charlie、Dave 在不同环境下都能拥有受治理的 Build Agent session、share/fork recipe、provider choice、credential boundary 和 deployment path？

因此，下一个直接设计方向是：

```text
Creation Host Authoring Kit
```

再下一个方向是：

```text
Team / org sharing and enterprise governance
```

第二个问题依赖第一个问题。如果 Alice 还不能清楚表达 Host 的 build-agent package、provider matrix、credential boundary、share/fork rules，那么 enterprise sharing 一定会很脆弱。

## 场景里的角色

| 角色 | 在场景里是谁 | 控制什么 |
|---|---|---|
| Developer | Alice | `mawidget` Creation Host、profiles、adapters、Build Agent Package、credential model、share/fork semantics。 |
| Builder | Bob | `dev-board` generated app、app evolution、resource bindings、approvals、versions。 |
| Installer / Re-binder | Charlie | 自己的 provider credentials 与 local resource bindings，同时复用 Bob 的 app recipe。 |
| Forking Builder / Deployer | Dave | forked app、替代 provider profile、移除能力、deployment target。 |
| Build Agent Package author | Alice | Bob/Dave 的 Build Agent sessions 使用的稳定 instructions、tools、constraints、tests、review rules。 |
| Build Agent Session owner | Bob / Dave | 绑定到 app、profile、credentials、workspace、approvals 的 per-app/per-session runtime instance。 |

## 数据边界：什么存在 App Database 里

不要把 `app.db` 理解成一个无差别的数据桶。

| 数据 | 是否存在 app DB | 说明 |
|---|---:|---|
| App definition | 是 | Tables、Operations、Views、Policies、capabilities、version metadata。 |
| Runtime app data | 是 | Bob 的 dashboard rows、sync cursors、local cache、materialized issues/PRs/CI/note summaries。 |
| Provider resource selections | 是 | GitHub repository names/ids、Linear workspace/team/project ids、Apple Notes folder ids。这些是 bindings，不是 secrets。 |
| Credential metadata | 是，但只存 ref | `credential_ref`、provider account id、scopes、expiry、status。 |
| Credentials / tokens | 否 | 真正 secrets 应该放 Keychain、OS secret store、cloud secret manager、KMS 或 deployment env。 |
| Share/init defaults | 如果本地 materialize，则是 | Portable defaults 可以由 init recipe 插入。 |
| Bob 的 derived external cache | 分享时否 | Charlie/Dave 应该用自己的 credentials 重新 sync。 |
| App history / audit / rollout evidence | 是 | creation、approval、publish、restart、rollback 的本地 evidence。 |

关键区分：

```text
resource selection = app 被配置去看什么
credential secret  = runtime 如何认证访问它
external cache     = 为产品体验复制到本地的 derived data
```

通常只有第一类和第三类进入 app DB。secret 不进入。

## 分享边界

Bob 不应该分享 raw database。

Bob 应该分享 installable artifact + initialization recipe：

```text
dev-board.share
  app definition
  version manifest
  runtime/build contract
  required providers and scopes
  default views / operations / policies
  init recipe
  no Bob tokens
  no Bob private synced data
```

Portable data 应该通过 recipe 初始化，最好走 semantic framework/Host operations，而不是裸 SQL：

```text
portable defaults
  -> init recipe
  -> semantic operation
  -> local app DB rows
  -> evidence
```

这样分享才是：

- idempotent；
- provider-portable；
- auditable；
- independent of Bob's private cache；
- compatible with Charlie re-binding and Dave fork。

## Provider Switching And Forking

SQLite 到 Postgres 不应该理解成 “把 SQLite DB dump 到 Postgres”。

真正想要的 contract 是：

```text
same app definition
same framework primitive semantics
same init recipe
different storage provider
external data re-bound and re-synced
```

这件事接近无缝的前提是：Alice 已经声明并测试过 profile parity：

```text
local-sqlite-docker
remote-postgres-docker
```

两个 profile 必须满足同一组 semantic contract：

- CellType encoding；
- query/filter/sort/pagination behavior；
- Operation behavior；
- app_history/audit/policy behavior；
- init/share/fork recipe behavior；
- rollout evidence behavior；
- unsupported capability 必须 explicit fail-closed。

Dave 的 fork 本质上是：

```text
take Bob's app definition and portable recipe
  -> choose a different Host profile
  -> re-bind credentials
  -> remove unsupported Apple Notes capability
  -> publish for target platform
```

## Build Agent Package Vs Build Agent Session

Bob 在 build 阶段拥有自己的 Build Agent。但这个 agent 不是 Bob 从零配置出来的。

Alice 在 `mawidget` 中预先准备一个 versioned **Build Agent Package**。

当 Bob 创建或演进 `dev-board` 时，`mawidget` 会基于 Alice 的 package 自动启动一个 per-app/per-session **Build Agent Session**。

```text
Build Agent Package
  authored by Alice
  belongs to mawidget / Host profile
  versioned and reviewed
  defines knowledge, policy, tools, and checks

Build Agent Session
  created for Bob's app/session
  uses opencode or another backend
  bound to Bob's app, workspace, profile, credentials, approvals
  consumes Alice's package
```

Dave 的情况是：

```text
same Build Agent Package
different Build Agent Session context
  profile = remote-postgres-docker
  apple_notes = disabled
  github credential_ref = dave/github
  linear credential_ref = dave/linear
  deployment target = linux/docker/amd64
```

这个 distinction 是核心。Pneuma 应该帮助 Alice 生产和治理 package。Creation Host 应该从 package 实例化 session。

## Provider-Specific Behavior Rule

Build Agent 可以知道当前 active profile，方便它和 Builder 拥有相同上下文：

```text
profile = remote-postgres-docker
capabilities.relational_store = true
capabilities.apple_notes = false
```

但在普通 Builder mode 中，Build Agent 不应该写 provider-specific implementation logic。

允许：

```text
call semantic Host/framework tools
read provider capability matrix
ask for approval when changing capabilities
explain unsupported features
```

禁止：

```text
write raw Postgres SQL because provider = postgres
assume SQLite file paths
edit deployment scripts directly
store provider secrets in app DB
branch app behavior on provider quirks
```

Provider-specific implementation 属于 Alice 的 Developer/adapter-authoring layer，不属于 Bob 的 Build Agent Session。

## Creation Host Authoring Kit

下一个主要 workstream 应该帮助 Alice 构建 `mawidget` 这种 Creation Host。

它应该帮助 Alice 创建、校验、维护：

- Build Agent system prompt；
- tool allowlist；
- provider capability matrix；
- credential boundary；
- init/share/fork recipe；
- SQLite/Postgres parity tests；
- “agent must not provider-special-case” rule；
- review checklist；
- post-generation verification；
- Host docs / Builder docs。

输出不应该只是 Markdown，还应该包含 machine-readable assets：

```text
mawidget.host.json
profiles/*.json
provider-capabilities.json
agent-policy.md
agent-tool-allowlist.json
share-recipe.schema.json
contract-tests/
```

可能的 framework commands：

```bash
pneuma-framework validate-host-authoring ./mawidget
pneuma-framework validate-agent-package ./mawidget/agent-package
pneuma-framework test-profile-parity local-sqlite-docker remote-postgres-docker
pneuma-framework doctor-share-recipe ./dev-board.share
```

可能的 Developer Assistant：

```text
Host Authoring Assistant
  -> reads Alice's software architecture and chosen providers
  -> drafts Build Agent Package
  -> generates profile capability matrix
  -> generates contract tests
  -> reviews provider-special-casing risk
  -> checks docs and post-generation verification
```

这个 assistant 在精神上类似 Codex/Claude skill，但它是 Creation Host authoring 的 domain-specific 辅助。

## 下一个问题：Team / Org Sharing And Enterprise Governance

Creation Host Authoring Kit 变清楚之后，下一个大问题是分享和企业安全：

```text
who may share
who may fork
who may approve
who may bind credentials
who may publish
who may deploy
who may revoke access
who can audit what happened
```

可能涉及：

- organization identity model；
- workspace/team/project boundaries；
- app ownership and transfer；
- share artifact signing/provenance；
- fork permissions；
- provider credential brokering；
- per-user vs shared credentials；
- approval delegation；
- admin policy management；
- revocation and rotation；
- audit retention；
- deployment target governance；
- data export/import policy；
- cross-user derived-cache isolation。

这个问题不应该先于 Authoring Kit 解决。enterprise governance 需要先有明确的 Host contract 和 Build Agent Package boundary。

## 需要带到后面的开放决策

| 问题 | 当前倾向 |
|---|---|
| Build Agent Package 是否是 first-class framework concept？ | 可能是，但要等一个 Creation Host Authoring Kit slice 证明形状。 |
| Provider capability matrix 应该在 core 里，还是 Host profile metadata？ | 先作为 Host-owned metadata，加 framework validation helpers。多个 Host 收敛后再提升。 |
| Profile parity tests 是否应该成为 framework package？ | 是，作为 test-kit，不作为 provider implementation 规定。 |
| Build Agent sessions 能否访问 provider-specific docs？ | 只能在显式 Developer/adapter-authoring mode，不能在普通 Builder mode。 |
| Share artifact signing 是否 RC 前必须？ | 不是。team/org distribution claims 前才必须。 |
| Credentials 能否进入 share artifacts？ | 不能。只包含 credential requirements / refs，绝不包含 secrets。 |

