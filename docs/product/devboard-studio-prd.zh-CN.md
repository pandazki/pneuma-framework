# PRD：DevBoard Studio

**状态：** Draft  
**目的：** 作为一个独立项目需求，用来验证 `pneuma-rc-0.1.0` 是否足够支持外部 Developer 构建真实 Creation Host  
**目标读者：** 负责实现该项目的 Developer  
**重要说明：** 本 PRD 只定义产品需求和验收标准，不规定具体 framework API、文件结构、表结构、实现方式或代码组织。实现者需要自行阅读 pneuma-framework 的 RC 文档、代码和 examples 后完成设计与实现。

---

## 1. 背景

Pneuma RC 的核心 claim 不是“可以做一个 app”，而是：

> Developer 可以使用 pneuma-framework 构建一个 Creation Host；Builder 可以在 Creation Host 中通过对话创建、检查、演进、发布、分享和分叉 Generated Application。

为了从外部视角验证这个 claim，需要一个独立项目。该项目不应该直接修改 framework 源码，也不应该照抄现有 examples。它应当像真实 Developer 项目一样，从当前 RC 文档和本地 framework tag 出发，构建一个可运行的 Creation Host。

## 2. 项目概述

项目名：**DevBoard Studio**

一句话描述：

> DevBoard Studio 是一个面向软件工程师的 Creation Host。Builder 可以通过它创建自己的开发工作看板应用，聚合 GitHub 公开 issue / PR、手动关注项和优先级规则，并发布成一个可使用、可分享、可分叉的 Generated Application。

DevBoard Studio 本身不是最终的工作看板。它是 Builder 用来创造工作看板的产品。

## 3. 目标用户

### Developer

实现 DevBoard Studio 的软件工程师。需要基于 pneuma-framework RC 构建一个独立 Creation Host。

### Builder

使用 DevBoard Studio 创建 `dev-board` 工作看板的人。典型 Builder 是软件工程师，例如 Bob。

### End User

打开已发布 `dev-board` 的用户。MVP 中 End User 通常可以和 Builder 是同一个人。

## 4. 核心用户故事

### Story A：Bob 创建自己的 dev-board

Bob 打开 DevBoard Studio，创建一个新的 `dev-board`。他输入自己的 GitHub 用户名，选择要关注的 repo 或使用默认公开信息。系统生成一个可预览的工作看板。

Bob 能看到：

- 最近需要关注的 GitHub issue / PR；
- 自己手动添加的关注项；
- 按优先级组织的今日工作；
- 最近一次刷新或同步的状态。

### Story B：Bob 通过对话演进 dev-board

Bob 觉得当前看板缺少一个“Review Needed”区域。他向 Build-phase Agent 描述需求：

> 帮我把需要 review 的 PR 单独放到一个区域里。

系统应给出清晰的变更提案。Bob 批准后，预览中的 `dev-board` 出现新的区域，并且现有数据能够体现该变化。Bob 拒绝时，不应发生实际变更。

### Story C：Bob 发布版本

Bob 可以发布初始版本，也可以发布演进后的新版本。发布后，End User 可以打开当前活跃版本。

Bob 需要能看到：

- 当前活跃版本；
- 最近发布记录；
- 健康状态；
- 重新启动能力；
- 回滚到旧版本的能力。

### Story D：Charlie 安装 Bob 分享的 dev-board

Bob 分享自己的 `dev-board`。Charlie 安装后，不应获得 Bob 的数据库、私有缓存或凭据。Charlie 需要输入自己的 GitHub 用户名或 repo 配置，然后得到一个属于自己的可运行工作看板。

### Story E：Dave 分叉 Bob 的 dev-board

Dave 不想完全沿用 Bob 的设置。他选择 fork，并修改部分配置，例如：

- 更换 GitHub 用户名或 repo 关注范围；
- 移除手动关注项模块；
- 调整默认优先级规则；
- 发布为 Dave 自己的版本。

系统应保留分叉来源信息，但 Dave 的版本应独立运行。

## 5. MVP 功能范围

### 5.1 Creation Host 首页

DevBoard Studio 应提供一个 Builder 可以理解的入口页面。

页面至少包含：

- 创建新 `dev-board` 的入口；
- 已创建项目列表；
- 每个项目的当前状态；
- 进入 preview / inspect / publish 的入口；
- 当前 Builder 身份输入或选择方式。

身份系统可以非常简单，不要求真实登录。MVP 可使用手动输入的 `user_id` / role。

### 5.2 创建 dev-board

Builder 创建 `dev-board` 时，至少需要提供：

- 应用名称；
- GitHub 用户名；
- 可选 repo 列表；
- 初始关注偏好。

创建成功后，系统应生成一个可预览的 Generated Application。

### 5.3 dev-board 预览

生成的 `dev-board` 应像一个真实可用的小应用，而不是调试页面。

MVP 至少包含：

- Today Focus；
- GitHub Attention；
- Manual Watchlist；
- Priority Buckets；
- Refresh Status。

GitHub 数据可以基于公开信息，不要求 OAuth。示例数据可以使用 `https://github.com/pandazki` 的公开信息，也可以允许 Builder 输入其他公开用户名或 repo。

### 5.4 Inspect / Debug

Creation Host 应提供 Builder / Developer 可理解的检查视图。

至少能查看：

- 当前 app 的主要数据；
- 当前 app 的能力列表；
- 当前 app 的公开 API 或操作入口；
- 最近一次 agent / system 变更记录；
- 发布与回滚记录。

检查视图的目标是帮助 Builder 理解“系统变了什么”，而不是展示底层实现细节。

### 5.5 Agent 演进

Builder 应能通过自然语言请求演进 `dev-board`。

MVP 必须支持一个完整演进场景：

> 新增 “Review Needed” 区域，用于展示需要 review 的 GitHub PR 或相关关注项。

要求：

- 系统应展示变更提案；
- Builder 批准前不能实际生效；
- Builder 批准后，预览和检查视图都能体现变更；
- Builder 拒绝时，系统应保持原状态；
- 变更记录应保留，便于回看。

### 5.6 发布、重启、回滚

Creation Host 应支持：

- 发布当前版本；
- 查看当前活跃发布版本；
- 重新启动活跃版本；
- 回滚到上一个发布版本。

这些能力可以是本地开发级实现，不要求生产级部署。

### 5.7 分享与安装

Bob 应能导出或分享自己的 `dev-board`。

分享内容必须满足：

- 不包含 Bob 的数据库；
- 不包含 token、API key、OAuth refresh token、password 等 secret；
- 不包含私有缓存；
- 能表达接收方需要重新提供哪些配置或授权；
- Charlie 可以基于分享内容初始化自己的版本。

### 5.8 分叉

Dave 应能基于 Bob 的分享内容 fork。

Fork 后 Dave 至少可以修改：

- GitHub 用户名或 repo 关注范围；
- 是否启用 Manual Watchlist；
- 默认优先级偏好。

Fork 后的版本应能独立预览和发布。

## 6. 非目标

MVP 不要求：

- 真实 OAuth 登录；
- 真实 GitHub App 安装流程；
- 多租户 SaaS；
- 云端部署；
- Docker 镜像发布；
- 企业级 SSO；
- 完整权限管理后台；
- 支持所有 GitHub API；
- 支持 Linear / Apple Notes / CI 系统；
- 生产级错误恢复；
- 完整移动端适配。

如果实现者认为某个非目标必须提前实现，需要在项目说明中解释原因。

## 7. 数据与隐私要求

MVP 可以使用公开 GitHub 数据和本地示例数据。

必须遵守：

- 不把 credential 写进分享产物；
- 不把 source database 当作分享产物；
- 不把私有缓存当作分享产物；
- 接收方安装或 fork 时必须重新输入自己的身份、配置或凭据引用；
- 示例中如使用 `pandazki` GitHub 公开信息，只能依赖公开可访问数据。

## 8. 体验要求

DevBoard Studio 应该让外部 reviewer 快速理解四件事：

1. Builder 正在 Creation Host 里创造 app，而不是直接使用一个固定 app；
2. Agent 提案和 Builder 批准之间有清晰边界；
3. app 演进后，preview 和 inspect 都能说明变化；
4. 发布、回滚、分享、fork 是同一个产品链路的一部分；
5. 分享不等于复制数据库或凭据。

UI 不要求复杂，但应当足够像真实产品。不要只做命令行 demo 或纯 debug 页面。

## 9. 验收标准

项目完成后，应能现场演示以下流程：

1. 启动 DevBoard Studio。
2. Bob 创建 `dev-board`。
3. Bob 输入 GitHub 用户名或 repo 配置。
4. Bob 打开预览，看见初始工作看板。
5. Bob 打开 inspect，看见当前 app 状态、数据、能力和记录。
6. Bob 通过对话请求新增 `Review Needed` 区域。
7. 系统展示变更提案。
8. Bob 拒绝一次，确认 app 不变化。
9. Bob 再次请求或重新批准，确认 app 发生变化。
10. Bob 发布 v1。
11. Bob 重启活跃版本。
12. Bob 回滚到旧版本。
13. Bob 分享 app。
14. Charlie 安装分享产物并输入自己的配置。
15. Dave fork 分享产物，修改配置并发布自己的版本。

## 10. RC 验证问题

实现完成后，reviewer 应回答这些问题：

- Developer 是否能只依赖 `pneuma-rc-0.1.0` 文档、代码和 examples 开始？
- 实现者是否需要修改 framework core？如果需要，缺口是什么？
- Creation Host / Generated Application / Published Application 的边界是否自然？
- Build-phase Agent 是否能理解自己能做什么、不能做什么？
- Builder approval 是否对应一个完整用户意图，而不是一堆孤立技术步骤？
- Preview / Inspect / Publish / Rollback 是否形成端到端产品链路？
- Share / Install / Fork 是否能避免复制数据库和 secrets？
- Provider / GitHub 相关逻辑是否被控制在 DevBoard Studio 自己的产品边界内？
- 如果换一个 GitHub 用户名或 repo，系统是否仍然成立？

## 11. 交付物

实现者应交付：

- 一个独立项目 repo；
- 可运行的本地启动命令；
- 简短 README；
- 一条完整 demo script；
- 一份实现记录，说明：
  - 读了哪些 pneuma-framework 文档；
  - 哪些地方顺畅；
  - 哪些地方不清楚；
  - 是否修改了 framework；
  - 遇到的 framework 缺口或文档缺口；
  - 如果重做，会希望 framework 提供什么帮助。

## 12. 依赖输入

实现时将提供一个本地 `pneuma-rc-0.1.0` 对应的 framework checkout 路径，用于本地依赖安装和阅读。具体路径由项目负责人提供。

实现者不应假设该路径可被修改；如发现 framework 必须修改才能完成需求，应记录为 RC 缺口，而不是直接把 workaround 混进主实现。
