# PRD：LaunchRoom Studio

**状态：** Draft
**目的：** 作为一个新的下游项目需求，用来验证当前 `pneuma-framework` developer contract 是否足够完整，能让外部 Developer 在零上下文下构建真实 Creation Host。
**目标读者：** 负责实现该下游项目的 Developer。
**English version:** [launch-room-studio-prd.md](./launch-room-studio-prd.md)

**重要说明：** 本 PRD 只定义产品需求和验收标准，不规定具体 framework API、文件名、表结构、包结构或代码组织。实现者需要自行阅读当前 `pneuma-framework` 文档、代码、validators 和 examples 后完成设计与实现。

---

## 1. 背景

`pneuma-framework` 的核心 claim 不是“Developer 可以写一个 app”，而是：

> Developer 可以使用 `pneuma-framework` 构建一个 Creation Host；Builder 可以在 Creation Host 中通过 Build-phase Agent 对话创建、检查、演进、预览、发布、恢复、分享和分叉 Generated Application。

当前 framework 已经接受四层模型：

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

它也已经沉淀了 BuildThread、Scaffold Project、Code Change Lane、HostExtension、credential helpers 和 Build Assurance 等 post-RC developer contracts。下一步最有价值的验证，是让一个新的下游项目从当前文档出发，而不是继续沿用历史 DevBoard Studio 实现。

LaunchRoom Studio 就是这个验证目标。

## 2. 产品概述

**产品名：** LaunchRoom Studio

**一句话描述：**

> LaunchRoom Studio 是一个 Creation Host。Builder 可以用它为一次产品或软件发布创建轻量级“发布作战室”应用：一个组合 launch checklist、GitHub attention items、release notes、risk gates、decision records 和 status updates 的 Published Application。

LaunchRoom Studio 本身不是最终的 launch-room app。它是 Builder 用来创建 launch-room app 的产品。

LaunchRoom Studio 创建出来的 Generated Application 可以叫 `launch-room`。

## 3. 角色

### Developer

基于 `pneuma-framework` 实现 LaunchRoom Studio 的独立下游项目开发者。

Developer 负责 Host product choices，包括 UI、本地存储、mock 或真实 provider integration、runtime process management，以及具体 generated-app domain model。

### Builder

使用 LaunchRoom Studio 创建和演进 `launch-room` Generated Application 的人。

示例 Builder：Robin，一位准备功能发布的 release lead。

### End User

打开 Published Application，查看发布状态、待办、风险和决策的人。

示例 End Users：工程师、产品经理、支持负责人和业务 stakeholder。

## 4. 核心用户故事

### Story A：Robin 创建 launch room

Robin 打开 LaunchRoom Studio，为一次即将发布的功能创建新的 `launch-room`。

Robin 输入：

- launch name；
- target date；
- short launch goal；
- GitHub owner/repo 或 public repository URL；
- initial launch checklist items；
- stakeholder names 或 roles。

LaunchRoom Studio 创建一个 Generated Application 并启动 preview。Robin 应该能立刻看到一个产品形态的 launch room，而不是纯 debug 页面。

### Story B：Robin 检查生成的 app

Robin 从 preview 切换到 inspection。

Host 展示：

- generated app identity 和 version；
- launch-room sections 或 modules；
- 当前 launch data；
- connected provider status；
- BuildThread summary；
- 最近的 proposals、approvals、denials、execution receipts 和 assurance evidence；
- publish / rollback state。

Inspection view 应帮助 Robin 理解“系统变了什么”和“为什么现在足够安全可以继续”。

### Story C：Robin 通过对话演进 launch room

Robin 向 Build-phase Agent 说：

> 增加一个 Risk Gate 区域。只有每个 high-risk item 都有 owner 和 mitigation note 时，发布状态才能进入 ready。

系统必须把它变成 Robin 可以在变更生效前 review 的 proposal。

Robin 应该能先 deny 一次，并看到 Generated Application 没有变化。

Robin 随后应该能 approve 一个修订后的 proposal，并在 preview、inspection 和 evidence 中看到 Risk Gate。

### Story D：Host 捕获不安全或不完整的变更

Robin 说：

> 删除 launch checklist，如果 agent 觉得 ready，就直接显示一个大大的绿色状态。

这是一个刻意设计的风险请求。LaunchRoom Studio 不应该盲目应用它。

系统应该至少做到其中一种：

- 追问 clarification；
- 生成 proposal，但 review packet 明确解释 destructive impact；
- 因为 guardrail 或 test 失败而 block proposal；
- 或允许 Robin 在 mutation 前 deny。

这个故事验证 framework 是否在帮助收束 AI Build uncertainty，而不是只记录 happy path。

### Story E：Robin 发布、重启和回滚

Robin 发布一个 `launch-room` 版本。

LaunchRoom Studio 展示：

- 当前 active version；
- publish health；
- 最近一次 restart result；
- rollback target；
- 该版本的 assurance state。

Robin 可以 restart 当前 active Published Application，并 rollback 到上一个版本或本地等价物。

这可以通过本地进程管理实现，不需要生产云部署。

### Story F：Robin 分享 launch room

Robin 导出或分享自己的 launch-room artifact。

share artifact 不得包含：

- source database；
- access tokens；
- refresh tokens；
- API keys；
- passwords；
- private provider caches；
- private Build Agent workspace state。

它应该包含足够的信息，让接收者理解需要重新绑定或重新配置什么。

### Story G：Casey 安装 Robin 的 launch room

Casey 收到 Robin 的 share artifact 后在本地 install。

Casey 必须提供自己的 launch metadata 和 provider configuration。Casey 不能继承 Robin 的私有数据或 credentials。

### Story H：Dana 分叉 Robin 的 launch room

Dana 收到 Robin 的 share artifact 后选择 fork，而不是 install，并进行产品级改动：

- 移除 GitHub attention；
- 增加一个手动维护的 customer comms section；
- 修改 risk readiness rules；
- 发布 Dana 自己的 fork。

Fork 应保留 lineage，但独立运行。

## 5. MVP 范围

### 5.1 Creation Host Home

LaunchRoom Studio 必须提供 Builder-facing home page 或等价 UI。

它应该包含：

- 创建新 launch room；
- 已有 launch rooms 列表；
- project status；
- 输入或选择简单 Builder identity；
- 进入 preview、inspect、evolve、publish、share、fork/install flows。

身份系统可以很简单。手动输入 `user_id` / role 是可以接受的。

### 5.2 Project Creation

Builder 创建 launch room 时，需要提供：

- application name；
- launch name；
- target date；
- launch goal；
- GitHub repository 或 mock provider source；
- initial checklist；
- initial stakeholders。

结果必须是一个可 preview 的 Generated Application。

### 5.3 Generated Launch Room Preview

Generated Application 应该像一个真实可用的小应用。

MVP preview sections：

- Launch Overview；
- Readiness Checklist；
- GitHub Attention；
- Risk Gate；
- Decisions；
- Stakeholder Update；
- Publish Status。

GitHub source 可以使用 public GitHub data 或 mock provider。如果使用真实 provider credential，必须遵守 no-secret sharing boundary。

### 5.4 Inspect / Debug

LaunchRoom Studio 必须包含 inspection surface。

它至少应该展示：

- generated app version；
- app modules 或 sections；
- 当前 launch data；
- source 或 definition summary；
- provider status；
- BuildThread transcript summary；
- review packets；
- assurance cases；
- recovery 或 rollback evidence；
- release state。

不要把随机 internal tables 当作主要体验直接暴露给 Builder。Inspection view 应该是 product-shaped，并且 Builder 能理解。

### 5.5 Builder Conversation

Builder 应该能通过对话演进 generated launch room。

Host 必须把 conversation 作为 durable project artifact 保留下来。Reviewer 应能检查：

- Builder request；
- agent clarification，如果有；
- proposal；
- approval 或 denial；
- execution receipt；
- assurance result。

### 5.6 Governed Change Path

MVP 必须包含一个完整 governed change path：

> 增加一个会改变 readiness behavior 的 Risk Gate section。

最低要求：

- mutation 前先生成 proposal；
- 可见的 review packet；
- approval path；
- denial path；
- execution receipt；
- approval 后 preview 发生变化；
- approval 后 inspection/evidence 发生变化；
- denial 后没有 mutation。

### 5.7 Unsafe Change Path

MVP 必须包含一个 negative path：

> 移除或绕过关键 launch-readiness control。

系统不能把它悄悄当作普通 happy-path change 应用。

可接受结果：

- 需要 clarification；
- proposal 前被 block；
- approval 被 deny；
- proposal 前测试失败；
- post-apply validation 失败，并带 evidence 完成 recover 或 rollback。

### 5.8 Publish / Restart / Rollback

Host 必须支持本地 release workflow：

- 发布当前 generated app version；
- 展示 active published version；
- restart active version；
- rollback 到上一个 version 或本地等价物；
- 展示每一步的 health 和 evidence。

不要求生产部署。

### 5.9 Share / Install / Fork

Host 必须演示 portable artifact boundary。

Share artifact 要求：

- 无 secrets；
- 无 source database；
- 无 private cache；
- 清楚表达 provider 或 credential rebinding requirements；
- 包含 install/fork 所需的 app definition 或 recipe data。

Install 要求：

- receiver 提供自己的 configuration；
- receiver 不继承 Robin 的私有数据；
- receiver 可以运行本地 Published Application。

Fork 要求：

- fork 记录 lineage；
- fork 可以进行至少一个 product-level change；
- fork 可以独立 preview 和 publish。

## 6. 非目标

MVP 不要求：

- production SaaS hosting；
- 真实 multi-tenant authentication；
- enterprise SSO；
- production IAM；
- marketplace listing；
- signed artifact provenance；
- cloud deployment；
- 如果本地进程 publish 足够，不要求 Docker release；
- zero-downtime rollout；
- 真实 GitHub App installation；
- 完整 GitHub API 覆盖；
- 真实 email、Slack、Linear 或 Jira integration；
- production-grade secret persistence；
- billing、quotas 或 organization management；
- 完整移动端优化；
- 重建 Pneuma 2.x。

如果实现者选择加入其中任何内容，需要解释为什么它对验证是必要的。

## 7. 数据与隐私要求

MVP 可以使用 public GitHub data、deterministic fixtures 或 mock provider。

必须遵守：

- credential 不进入 share artifact；
- source database 不进入 share artifact；
- private derived cache 不进入 share artifact；
- provider configuration 必须由 installer/forker 重新绑定或重新输入；
- mock credential 也应该经过与真实 credential 相同的边界；
- 如果使用 public GitHub data，不要求访问 private repository。

## 8. Build Assurance 要求

LaunchRoom Studio 必须把 Build Assurance 展示到外部 reviewer 可以理解 control loop 的程度。

对于至少一个 approved change，需要展示：

- 原始 Builder intent；
- risk 或 ambiguity classification；
- proposal summary；
- affected surfaces；
- expected data 或 UI impact；
- proposal 前运行的 checks；
- approval decision；
- execution result；
- execution 后运行的 checks；
- 如有需要，recovery 或 rollback evidence；
- final assurance state。

这不是 compliance audit feature。它是 Builder + Build Agent 变更的工程控制能力。

## 9. 体验要求

产品应让四层模型容易理解：

1. LaunchRoom Studio 是 Creation Host。
2. Builder 正在创建 launch-room Generated Application。
3. Preview 展示 construction 中的 generated app。
4. Publish 暴露一个选定的 Published Application version。
5. Inspect 解释系统变了什么、为什么变、以及有什么 evidence。

UI 不需要达到商业级精修，但应该像真实产品，而不是一组裸 debug endpoints。

## 10. 验收演示

完成后的下游项目应支持这个现场 walkthrough：

1. 启动 LaunchRoom Studio。
2. 以 Robin 身份进入。
3. 创建 `launch-room`。
4. 输入 launch metadata 和 provider 或 fixture source。
5. 打开 preview，看见初始 launch room。
6. 打开 inspect，看见 app status、sections、data、transcript/evidence 和 release state。
7. 请求 agent 增加 Risk Gate。
8. deny 第一个 proposal，并确认没有 mutation。
9. approve 一个修订后的 proposal。
10. 在 preview 中看到 Risk Gate。
11. 在 inspect 中看到 review packet、execution receipt 和 assurance case。
12. 触发 unsafe-change request，并展示 blocked/denied/recovered path。
13. 发布当前版本。
14. restart active Published Application。
15. rollback 到上一个版本或本地等价物。
16. export/share launch room。
17. Casey 用新的本地配置 install。
18. Dana fork，移除 GitHub attention，增加 customer comms，并发布 fork。

## 11. 必须测试

至少包含：

- Host authoring files 的 contract validation tests；
- Builder conversation persistence 或 replay test；
- governed change approval test；
- denial/no-mutation test；
- unsafe-change blocked 或 recovered test；
- publish/restart/rollback smoke test；
- share artifact no-secret test；
- install/fork rebinding test；
- 至少一个启动 Host 并跑主流程的 end-to-end smoke test。

## 12. Framework 验证问题

实现完成后，下游报告应回答：

- Developer 是否能在没有上游口头解释的情况下理解四层模型？
- 哪些文档是必要的？
- 哪些文档过期、重复、缺失或误导？
- validator / doctor tools 是否真的抓到了错误？
- BuildThread 是否减少了 Host-owned conversation glue？
- Scaffold Project / Code Change Lane 是否让 code-change boundary 清楚？
- HostExtension 概念是否适合 product-level generated modules？
- credential utilities 是否有帮助，同时没有把 framework 变成 hosted identity？
- Build Assurance 是否让 approval 和 publish 决策更清楚？
- Developer 是否需要阅读 framework source 才能理解必要 shape？
- 哪个 framework helper 最能减少 Host 重复代码？
- 是否有 framework 概念强迫了本应属于 LaunchRoom Studio 的产品选择？
- 什么会阻碍另一个 Developer 重复这个项目？

## 13. 交付物

下游 Developer 应交付：

- 独立 project repo；
- 带 setup 和 upstream framework commit hash 的 README；
- 一条本地启动命令；
- 一条测试命令；
- 匹配验收演示的 demo script；
- 关键状态的 screenshots 或短录屏；
- generated app example data 或 fixtures；
- 使用上游 gap 模板的 gap log；
- 简短实现报告：
  - 哪些地方顺畅；
  - 哪些地方不清楚；
  - 哪些地方文档足够；
  - 哪些地方必须读 framework source；
  - 是否必须修改 framework code；
  - 推荐上游修复什么。

## 14. 成功标准

本次下游验证成功的标准：

- LaunchRoom Studio 能本地运行；
- 主 Builder flow 端到端可用；
- 至少一个 approved generated-app change 被治理并留下 evidence；
- 至少一个 unsafe 或 denied path 证明没有 accidental mutation；
- publish/restart/rollback 或本地等价物可用；
- share/install/fork 证明 no-secret portability；
- 实现者能清楚区分 Host product choices 和 framework gaps；
- 最终报告给上游提供具体、可复现的反馈。

发现 framework gaps 是可以接受的。精准发现 gap 本来就是验证目标的一部分。
