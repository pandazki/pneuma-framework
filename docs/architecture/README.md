# pneuma-framework 架构

> 你正在看的是 pneuma-framework 的**架构决策 + 设计规格**目录。
> 如果你是 Developer 第一次进入项目，不要从这里开始；先读 Developer 入口。

---

## 推荐入口

| 你是谁 | 先读什么 |
|---|---|
| Developer，想知道如何基于 framework 构建 Creation Host | [Start Here: Build A Creation Host](../developer/start-here.md) / [中文版](../developer/start-here.zh-CN.md) |
| Developer，准备动手跑 scaffold / doctor / example | [Getting Started](../developer/getting-started.md) / [中文版](../developer/getting-started.zh-CN.md) |
| 需要判断 RC 为什么成立 | [Release Candidate Snapshot](./release-candidate-snapshot.md) / [中文版](./release-candidate-snapshot.zh-CN.md) |
| 需要判断 RC 0.1.1 patch 改了什么 | [RC 0.1.1 Patch Snapshot](./release-candidate-0.1.1-snapshot.md) / [中文版](./release-candidate-0.1.1-snapshot.zh-CN.md) |
| 需要判断 RC 0.1.3 code-change lane 改了什么 | [RC 0.1.3 Patch Snapshot](./release-candidate-0.1.3-snapshot.md) / [中文版](./release-candidate-0.1.3-snapshot.zh-CN.md) |
| 需要判断下游 DevBoard 是否能真正采用 credential helpers | [M31 Snapshot](./milestone-31-snapshot.md) / [中文版](./milestone-31-snapshot.zh-CN.md) |
| 需要判断 M30 如何让下游 Host 接入 credential/session/OAuth helpers | [M30 Snapshot](./milestone-30-snapshot.md) / [中文版](./milestone-30-snapshot.zh-CN.md) |
| 需要判断 M29 如何把 BuildThread 接进 AgentBackend | [M29 Snapshot](./milestone-29-snapshot.md) / [中文版](./milestone-29-snapshot.zh-CN.md) |
| 需要判断 M28 如何补 HostExtension / extension-slot distribution contract | [M28 Snapshot](./milestone-28-snapshot.md) / [中文版](./milestone-28-snapshot.zh-CN.md) |
| 需要判断 M27 对 runtime composition 做了哪些稳定化 | [M27 Snapshot](./milestone-27-snapshot.md) / [中文版](./milestone-27-snapshot.zh-CN.md) |
| 需要判断 M26 对 code-change lane 做了哪些稳定化 | [M26 Snapshot](./milestone-26-snapshot.md) / [中文版](./milestone-26-snapshot.zh-CN.md) |
| 需要给团队讲 Alice/Bob/Charlie/Dave 故事 | [M25 Story Kit](../../examples/m25-alice-creation-host-prototype/STORY.md) / [中文版](../../examples/m25-alice-creation-host-prototype/STORY.zh-CN.md) |
| 需要追溯架构原因、ADR、milestone 证据 | 继续阅读本索引 |

---

## 当前 canonical 文档索引

不要从临时 P-report 开始读。当前长期入口只有这几份：

| 文档 | 用途 |
|---|---|
| [../developer/start-here.md](../developer/start-here.md) | Developer first-read：用 5 张图解释 Framework → Creation Host → Generated Application → Published Application |
| [../developer/start-here.zh-CN.md](../developer/start-here.zh-CN.md) | Developer first-read 中文版 |
| [release-candidate-snapshot.md](./release-candidate-snapshot.md) | RC accepted snapshot：为什么 `pneuma-rc-0.1.0` 可以作为第一个 developer-facing candidate release |
| [release-candidate-snapshot.zh-CN.md](./release-candidate-snapshot.zh-CN.md) | RC snapshot 中文版：同一内容，含 acceptance matrix、验证证据、demo route、post-RC lanes |
| [release-candidate-0.1.1-snapshot.md](./release-candidate-0.1.1-snapshot.md) | RC 0.1.1 patch snapshot：外部 DevBoard feedback 中哪些 developer-contract 缺口被采纳，哪些进入后续 lane |
| [release-candidate-0.1.1-snapshot.zh-CN.md](./release-candidate-0.1.1-snapshot.zh-CN.md) | RC 0.1.1 patch snapshot 中文版 |
| [release-candidate-0.1.3-snapshot.md](./release-candidate-0.1.3-snapshot.md) | RC 0.1.3 patch snapshot：Code Change Lane 如何把 Scaffold Project contract 变成最小可执行 source-change lane |
| [release-candidate-0.1.3-snapshot.zh-CN.md](./release-candidate-0.1.3-snapshot.zh-CN.md) | RC 0.1.3 patch snapshot 中文版 |
| [milestone-31-snapshot.md](./milestone-31-snapshot.md) | M31 closed snapshot：DevBoard Studio 如何采用 Host Credential Broker utilities，并暴露 OAuth token response compatibility 缺口 |
| [milestone-31-snapshot.zh-CN.md](./milestone-31-snapshot.zh-CN.md) | M31 snapshot 中文版：同一内容，明确 adoption pressure 不等于 hosted identity |
| [milestone-30-snapshot.md](./milestone-30-snapshot.md) | M30 closed snapshot：Host Credential Broker utilities 如何让 credential rebinding、OAuth state、session cookies 和 no-secret evidence 有共享工具 |
| [milestone-30-snapshot.zh-CN.md](./milestone-30-snapshot.zh-CN.md) | M30 snapshot 中文版：同一内容，明确它不是 hosted identity 或 production secret persistence |
| [milestone-29-snapshot.md](./milestone-29-snapshot.md) | M29 closed snapshot：AgentBackend `runTurn` 如何让 BuildThread 成为 backend turn 的 source of truth |
| [milestone-29-snapshot.zh-CN.md](./milestone-29-snapshot.zh-CN.md) | M29 snapshot 中文版：同一内容，明确 backend-native session 是 cache/optimization |
| [milestone-28-snapshot.md](./milestone-28-snapshot.md) | M28 closed snapshot：HostExtension Slot Contract 如何为 Host-owned open-ended artifacts 增加 portable contribution / slot compatibility validation |
| [milestone-28-snapshot.zh-CN.md](./milestone-28-snapshot.zh-CN.md) | M28 snapshot 中文版：同一内容，明确它不是 marketplace、runtime executor 或 framework definition row |
| [milestone-27-snapshot.md](./milestone-27-snapshot.md) | M27 closed snapshot：Runtime Diagnostic Surface 如何把 runtime mode、boot options、health diagnostics、route fallback 和 readiness helper 固化为 framework helper |
| [milestone-27-snapshot.zh-CN.md](./milestone-27-snapshot.zh-CN.md) | M27 snapshot 中文版：同一内容，明确这不是 `0.1.4` release tag，也不是部署平台 |
| [milestone-26-snapshot.md](./milestone-26-snapshot.md) | M26 closed snapshot：Code Change Lane hardening 如何吸收 DevBoard Studio 反馈，补上 readable diff、rejected receipt、proposal-turn opt-out 和 scaffold diagnostics |
| [milestone-26-snapshot.zh-CN.md](./milestone-26-snapshot.zh-CN.md) | M26 snapshot 中文版：同一内容，明确这不是 `0.1.4` release tag，而是 post-RC stabilization |
| [milestone-25-snapshot.md](./milestone-25-snapshot.md) | M25 closed snapshot：Alice Creation Host prototype 如何把 Developer 的认知路径变成 RC 分享/demo 入口 |
| [milestone-25-snapshot.zh-CN.md](./milestone-25-snapshot.zh-CN.md) | M25 snapshot 中文版：同一内容，解释为什么先讲 Creation Host 心智模型，再讲 Bob/Charlie/Dave outcomes |
| [milestone-1-snapshot.md](./milestone-1-snapshot.md) | M1 closed snapshot：governed app-definition primitive 已证明什么、未证明什么、下一阶段怎么切；含 verification matrix + P-slice ledger 附录 |
| [milestone-1-snapshot.zh-CN.md](./milestone-1-snapshot.zh-CN.md) | M1 snapshot 中文版：同一内容 + 中文配图，适合中文团队成员直接阅读 |
| [milestone-2-snapshot.md](./milestone-2-snapshot.md) | M2 closed snapshot：enterprise governance evidence 已证明什么、未证明什么、下一决策门 |
| [milestone-2-snapshot.zh-CN.md](./milestone-2-snapshot.zh-CN.md) | M2 snapshot 中文版：同一内容 + 中文配图，适合中文团队成员直接阅读 |
| [milestone-3-snapshot.md](./milestone-3-snapshot.md) | M3 closed snapshot：deployable app substrate 已证明什么、未证明什么、下一决策门 |
| [milestone-3-snapshot.zh-CN.md](./milestone-3-snapshot.zh-CN.md) | M3 snapshot 中文版：同一内容 + 中文配图，适合中文团队成员直接阅读 |
| [milestone-4-snapshot.md](./milestone-4-snapshot.md) | M4 closed snapshot：Knowledge Inbox reference app 已证明什么、未证明什么、下一 product-pressure gate |
| [milestone-4-snapshot.zh-CN.md](./milestone-4-snapshot.zh-CN.md) | M4 snapshot 中文版：同一内容 + 中文配图，适合中文团队成员直接阅读 |
| [milestone-5-snapshot.md](./milestone-5-snapshot.md) | M5 closed snapshot：Builder/Agent 如何通过 governed `definition.apply` 演进 Knowledge Inbox |
| [milestone-5-snapshot.zh-CN.md](./milestone-5-snapshot.zh-CN.md) | M5 snapshot 中文版：同一内容 + 中文配图，适合中文团队成员直接阅读 |
| [milestone-6-snapshot.md](./milestone-6-snapshot.md) | M6 closed snapshot：真实 backend-agent 如何通过 framework semantic tools 演进 Knowledge Inbox |
| [milestone-6-snapshot.zh-CN.md](./milestone-6-snapshot.zh-CN.md) | M6 snapshot 中文版：同一内容 + 中文图，适合中文团队成员直接阅读 |
| [milestone-7-snapshot.md](./milestone-7-snapshot.md) | M7 closed snapshot：一个 Builder intent 如何进入 proposal-level approval 与 change-set execution |
| [milestone-7-snapshot.zh-CN.md](./milestone-7-snapshot.zh-CN.md) | M7 snapshot 中文版：同一内容 + live browser evidence，适合中文团队成员直接阅读 |
| [milestone-8-snapshot.md](./milestone-8-snapshot.md) | M8 closed snapshot：Builder/Agent 演进后的 Knowledge Inbox 如何进入 release packaging |
| [milestone-8-snapshot.zh-CN.md](./milestone-8-snapshot.zh-CN.md) | M8 snapshot 中文版：同一内容，解释 release artifact 与 rolling update 的边界 |
| [milestone-9-snapshot.md](./milestone-9-snapshot.md) | M9 closed snapshot：approved creation 如何进入 recovery evidence 或 release candidate ready |
| [milestone-9-snapshot.zh-CN.md](./milestone-9-snapshot.zh-CN.md) | M9 snapshot 中文版：同一内容，解释 creation-to-release integrity |
| [milestone-10-snapshot.md](./milestone-10-snapshot.md) | M10 closed snapshot：Knowledge Inbox 如何通过 derived semantic index 获得语义搜索 |
| [milestone-10-snapshot.zh-CN.md](./milestone-10-snapshot.zh-CN.md) | M10 snapshot 中文版：同一内容，解释为什么 embedding 不写进业务表 |
| [milestone-11-snapshot.md](./milestone-11-snapshot.md) | M11 closed snapshot：release candidate 如何进入 stage / promote / rollback rollout state |
| [milestone-11-snapshot.zh-CN.md](./milestone-11-snapshot.zh-CN.md) | M11 snapshot 中文版：同一内容，解释为什么 v0 rollout 不是生产流量切换 |
| [milestone-12-snapshot.md](./milestone-12-snapshot.md) | M12 closed snapshot：Reference Creation Host 如何创建、预览和检查 Generated Application |
| [milestone-12-snapshot.zh-CN.md](./milestone-12-snapshot.zh-CN.md) | M12 snapshot 中文版：同一内容，解释 Creation Host substrate |
| [milestone-13-snapshot.md](./milestone-13-snapshot.md) | M13 closed snapshot：Host 如何协调 governed Builder/Agent evolution 与 one-intent approval |
| [milestone-13-snapshot.zh-CN.md](./milestone-13-snapshot.zh-CN.md) | M13 snapshot 中文版：同一内容，解释 Host-level governed evolution |
| [milestone-14-snapshot.md](./milestone-14-snapshot.md) | M14 closed snapshot：Host 如何 publish / monitor / restart / rollback Published Application |
| [milestone-14-snapshot.zh-CN.md](./milestone-14-snapshot.zh-CN.md) | M14 snapshot 中文版：同一内容，解释从 Generated Application 到 Published Application 的运营边界 |
| [milestone-15-snapshot.md](./milestone-15-snapshot.md) | M15 closed snapshot：同一个 Host 如何创建和检查两种不同 app shape |
| [milestone-15-snapshot.zh-CN.md](./milestone-15-snapshot.zh-CN.md) | M15 snapshot 中文版：同一内容，解释为什么这是 generality pressure test |
| [milestone-16-snapshot.md](./milestone-16-snapshot.md) | M16 closed snapshot：Reference Creation Host 如何串起创建、预览、检查、演进、审批、发布、重启、回滚 |
| [milestone-16-snapshot.zh-CN.md](./milestone-16-snapshot.zh-CN.md) | M16 snapshot 中文版：同一内容，解释为什么这是 integration gate 而不是自动 release candidate |
| [milestone-17-snapshot.md](./milestone-17-snapshot.md) | M17 closed snapshot：安全与架构接受门如何关闭 identity spoofing、fail-open query、rollback failure evidence 和模型接受问题 |
| [milestone-17-snapshot.zh-CN.md](./milestone-17-snapshot.zh-CN.md) | M17 snapshot 中文版：同一内容，解释为什么下一步是 open-ended app pressure 而不是直接 RC |
| [milestone-18-snapshot.md](./milestone-18-snapshot.md) | M18 closed snapshot：open-ended Personal Focus Site 如何验证框架没有过拟合 schema/list app |
| [milestone-18-snapshot.zh-CN.md](./milestone-18-snapshot.zh-CN.md) | M18 snapshot 中文版：同一内容，解释 open-ended app pressure 如何进入 M19 review |
| [milestone-19-snapshot.md](./milestone-19-snapshot.md) | M19 RC review snapshot：全量验证、第三方 review、边界修正与为什么暂缓 RC tag |
| [milestone-19-snapshot.zh-CN.md](./milestone-19-snapshot.zh-CN.md) | M19 snapshot 中文版：同一内容，解释为什么 M20 必须 pin 住 pre-RC boundary |
| [milestone-20-snapshot.md](./milestone-20-snapshot.md) | M20 closed snapshot：open-ended definition artifact boundary 如何闭合，以及下一步为什么是 RC decision |
| [milestone-20-snapshot.zh-CN.md](./milestone-20-snapshot.zh-CN.md) | M20 snapshot 中文版：同一内容，解释 Host-owned open-ended artifacts 与 framework definition rows 的边界 |
| [milestone-21-snapshot.md](./milestone-21-snapshot.md) | M21 closed snapshot：developer onboarding path 如何补齐 scaffold、contract tests、doctor 和 guide |
| [milestone-21-snapshot.zh-CN.md](./milestone-21-snapshot.zh-CN.md) | M21 snapshot 中文版：同一内容，解释为什么这是 RC 前 developer experience closure |
| [milestone-22-snapshot.md](./milestone-22-snapshot.md) | M22 closed snapshot：Creation Host Authoring Kit 如何 pin 住 Build Agent Package、provider matrix 和 share/fork artifact 边界 |
| [milestone-22-snapshot.zh-CN.md](./milestone-22-snapshot.zh-CN.md) | M22 snapshot 中文版：同一内容，解释 Bob/Charlie/Dave 分享与 fork 场景的 contract boundary |
| [milestone-23-snapshot.md](./milestone-23-snapshot.md) | M23 closed snapshot：Sharing Governance 如何 pin 住 ownership、rights、lineage、revocation 和 credential rebinding evidence |
| [milestone-23-snapshot.zh-CN.md](./milestone-23-snapshot.zh-CN.md) | M23 snapshot 中文版：同一内容，解释 share/fork/install 进入 RC 前的治理边界 |
| [milestone-24-snapshot.md](./milestone-24-snapshot.md) | M24 closed snapshot：Creation Host RC pressure 如何把 Alice/Bob/Charlie/Dave 的真实分享/fork 场景变成 executable contract evidence |
| [milestone-24-snapshot.zh-CN.md](./milestone-24-snapshot.zh-CN.md) | M24 snapshot 中文版：同一内容，解释 provider parity、credential rebinding、fail-closed fork/install decisions |
| [../developer/getting-started.md](../developer/getting-started.md) | Developer guide：从 scaffold 到 M16/M18 reference Host loops 的 golden path |
| [../developer/getting-started.zh-CN.md](../developer/getting-started.zh-CN.md) | Developer guide 中文版：同一路径，适合中文团队成员阅读 |
| [../developer/creation-host-contract.md](../developer/creation-host-contract.md) | Creation Host contract guide：minimum Host contract、schema-driven/open-ended boundary、diagnostics |
| [../developer/creation-host-contract.zh-CN.md](../developer/creation-host-contract.zh-CN.md) | Creation Host contract 中文版：同一内容 |
| [../developer/upgrading-to-rc-0.1.1.md](../developer/upgrading-to-rc-0.1.1.md) | Developer guide：下游 Host 从 `pneuma-rc-0.1.0` 升级到 `pneuma-rc-0.1.1` 的检查清单 |
| [../developer/upgrading-to-rc-0.1.1.zh-CN.md](../developer/upgrading-to-rc-0.1.1.zh-CN.md) | RC 0.1.1 upgrade guide 中文版 |
| [../developer/upgrading-to-rc-0.1.2.md](../developer/upgrading-to-rc-0.1.2.md) | Developer guide：下游 Host 采用 BuildThread primitive 的迁移检查清单 |
| [../developer/upgrading-to-rc-0.1.2.zh-CN.md](../developer/upgrading-to-rc-0.1.2.zh-CN.md) | RC 0.1.2 BuildThread upgrade guide 中文版 |
| [../developer/upgrading-to-rc-0.1.3.md](../developer/upgrading-to-rc-0.1.3.md) | Developer guide：下游 Host 采用 Code Change Lane executor 的迁移检查清单 |
| [../developer/upgrading-to-rc-0.1.3.zh-CN.md](../developer/upgrading-to-rc-0.1.3.zh-CN.md) | RC 0.1.3 Code Change Lane upgrade guide 中文版 |
| [../developer/build-thread.md](../developer/build-thread.md) | Developer guide：BuildThread semantic transcript primitive，用于 Builder conversation / proposal / decision / execution receipt |
| [../developer/build-thread.zh-CN.md](../developer/build-thread.zh-CN.md) | BuildThread guide 中文版 |
| [../developer/scaffold-project-contract.md](../developer/scaffold-project-contract.md) | Developer guide：Scaffold Project contract，用于声明 generated-app source boundary、guardrails 和 code-change approval evidence |
| [../developer/scaffold-project-contract.zh-CN.md](../developer/scaffold-project-contract.zh-CN.md) | Scaffold Project contract 中文版 |
| [../developer/code-change-lane.md](../developer/code-change-lane.md) | Developer guide：Code Change Lane executor，用于 draft evidence、approved apply、rollback 和 BuildThread receipt |
| [../developer/code-change-lane.zh-CN.md](../developer/code-change-lane.zh-CN.md) | Code Change Lane guide 中文版 |
| [../developer/host-extension-slots.md](../developer/host-extension-slots.md) | Developer guide：HostExtension Slot Contract，用于 portable open-ended contribution bundles 和 Host-declared slot compatibility |
| [../developer/host-extension-slots.zh-CN.md](../developer/host-extension-slots.zh-CN.md) | HostExtension Slots guide 中文版 |
| [../developer/credential-broker.md](../developer/credential-broker.md) | Developer guide：Host Credential Broker utilities，用于 session cookies、OAuth callback binding、credential refs 和 no-secret rebinding evidence |
| [../developer/credential-broker.zh-CN.md](../developer/credential-broker.zh-CN.md) | Host Credential Broker guide 中文版 |
| [../developer/app-config-authoring.md](../developer/app-config-authoring.md) | Developer guide：AppConfig authoring invariants、cell type 拼写、reserved row columns、runtime SQLite path |
| [../developer/app-config-authoring.zh-CN.md](../developer/app-config-authoring.zh-CN.md) | AppConfig authoring 中文版 |
| [../developer/runtime-composition.md](../developer/runtime-composition.md) | Developer guide：runtime mode discipline、internal token pattern、markers、`asBunFetch` boundary、published data modes |
| [../developer/runtime-composition.zh-CN.md](../developer/runtime-composition.zh-CN.md) | Runtime composition 中文版 |
| [../developer/release-rollout-authoring.md](../developer/release-rollout-authoring.md) | Developer guide：release rollout helper shapes for Host publish/restart/rollback |
| [../developer/release-rollout-authoring.zh-CN.md](../developer/release-rollout-authoring.zh-CN.md) | Release rollout authoring 中文版 |
| [adr/0031-open-ended-definition-artifact-boundary.md](./adr/0031-open-ended-definition-artifact-boundary.md) | M20 accepted ADR：open-ended UI/module artifacts 在 v0 是 Host-owned + Host approval，不是 framework definition rows |
| [adr/0032-build-thread-primitive.md](./adr/0032-build-thread-primitive.md) | BuildThread accepted ADR：framework-owned semantic transcript，backend-native session 只是 cache/optimization |
| [adr/0033-scaffold-project-contract.md](./adr/0033-scaffold-project-contract.md) | Scaffold Project accepted ADR：Developer-authored scaffold boundary + guardrails for governed code-change lanes |
| [adr/0034-code-change-lane-executor.md](./adr/0034-code-change-lane-executor.md) | Code Change Lane accepted ADR：Scaffold Project + BuildThread 进入最小可执行 source-change lane |
| [adr/0035-host-extension-slot-contract.md](./adr/0035-host-extension-slot-contract.md) | HostExtension Slot accepted ADR：Host-owned portable extension contributions 与 Developer-declared slots 的验证边界 |
| [adr/0036-agent-backend-run-turn.md](./adr/0036-agent-backend-run-turn.md) | AgentBackend runTurn accepted ADR：BuildThread replay、backend session cache、decision+receipt helper 的边界 |
| [adr/0037-host-credential-broker-utilities.md](./adr/0037-host-credential-broker-utilities.md) | Host Credential Broker accepted ADR：session/cookie/OAuth/credential-ref helpers 的本地 Host utility boundary |
| [milestone-3-deployable-substrate-design.md](./milestone-3-deployable-substrate-design.md) | M3 design input：真实 backend / SQLite persistence / release artifact / Docker-first deployable substrate 的设计边界 |
| [milestone-3-deployable-substrate-design.zh-CN.md](./milestone-3-deployable-substrate-design.zh-CN.md) | M3 design 中文版：同一设计边界，适合中文团队成员直接阅读 |
| [m2-authorization-kernel-design.md](./m2-authorization-kernel-design.md) | M2 第一刀 design：test-first Authorization Kernel 设计 |
| [roadmap.md](./roadmap.md) | 项目唯一 roadmap：Stage 0–9，已闭合 / 进行中 / 未来 |
| [team-share-demo.md](./team-share-demo.md) | Post-RC 0 预备知识团队分享包：从项目目标、四层模型、primitive control plane 到 M29 当前边界 |
| [team-share-demo.zh-CN.md](./team-share-demo.zh-CN.md) | Post-RC 团队分享包中文版 |
| [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md) | 仍未决、下一步需要讨论或写 ADR 的问题 |
| [spec/creation-host-model.md](./spec/creation-host-model.md) | 顶层产品/领域边界：含零基础视觉导读，解释 Framework → Creation Host → Generated Application → Published Application |
| [spec/creation-host-model.zh-CN.md](./spec/creation-host-model.zh-CN.md) | Creation Host Model 中文版：同一内容 + 中文配图，适合中文团队成员直接阅读 |
| [spec/creation-host-authoring-and-sharing.md](./spec/creation-host-authoring-and-sharing.md) | Working frame：Alice 如何构建自己的 Creation Host，以及 M22/M23 authoring + sharing governance contract 如何成形 |
| [spec/creation-host-authoring-and-sharing.zh-CN.md](./spec/creation-host-authoring-and-sharing.zh-CN.md) | Creation Host Authoring 与 Sharing Frame 中文版 |
| [spec/creation-host-ddd-review.md](./spec/creation-host-ddd-review.md) | M21 后 DDD review：核心语言、bounded contexts、聚合候选、shared contract 提升规则、M22/M23 方向 |
| [spec/creation-host-ddd-review.zh-CN.md](./spec/creation-host-ddd-review.zh-CN.md) | Creation Host DDD Review 中文版：同一内容 + 中文领域图 |
| [spec/domain-model.md](./spec/domain-model.md) | Generated Application 内部 aggregate / service 模型 |

文档卫生规则：实现过程日志、压力测试报告、产品调研、单 slice 进度 report 不长期保留；稳定结论进 milestone / ADR / open questions。早期工作的过程记录已 squash 进 git history（见 ADR-0029）。

---

## 3 分钟版：pneuma 是什么

**Pneuma 是一个 AI-native 应用创造工具的 framework**——不是让开发者更快写代码的工具，而是让 Developer 构建 **Creation Host**，再让 Builder 在 Host 里通过对话创造 **Generated Application** 的基础设施。

三个角色（可以是同一个人）：

- **Developer**：基于 pneuma-framework 做出 Creation Host（提供 builder 产品表面、profile 选择、领域骨架）
- **Builder**：在 Creation Host 里，通过**跟 agent 对话**、preview、schema/data inspection、publish 等动作塑造 Generated Application
- **End User**：使用 Builder 发布出来的 Published Application

**核心对比**：
- vs Retool / n8n：pneuma 是对话式的，Builder 不拖字段
- vs Airtable / Notion：pneuma 里 Agent 是 first-class，不是附加功能
- vs Rails / Next.js：pneuma 面向 Builder 不是 Developer

**愿景覆盖面**（[ADR-0001](./adr/0001-archetype-scope.md)）：MVP 瞄准 A（个人自用）+ B（团队内部工具）两种 archetype；C（SaaS）作接口兼容、D（白标平台）作远期目标**留门**。

**核心差异化**（别的框架没有的）：

1. **UI 和 Agent 永远能做一样的事**（[ADR-0018 Operation primitive](./adr/0018-operations-as-primitive.md)）——界面点按钮 = agent 调 tool，同一份声明派生两种表达
2. **权限 DSL 可以跟 Builder 对话着写 / 反向解释**（[ADR-0008 NL bidirectional](./adr/0008-nl-bidirectional.md)）——builder 说"只有 alice 能看" → agent 翻译成规则；user 问"为什么看不到" → agent 反向解释
3. **数据表达式（filter / policy / trigger）共享同一棵 AST**（[ADR-0019 WhereClause](./adr/0019-where-clause-ast.md)）——学一次覆盖全栈

---

## 10 分钟版：核心心智模型

### 8 个 first-class primitives

Pneuma 的整个架构围绕这 8 个 primitives 组织。其它一切都是它们的使用方式或组合。

| Primitive | 负责 | 关键 ADR |
|---|---|---|
| **Table** | 数据集合（行的容器） | [0002](./adr/0002-storage-typed-cells.md) |
| **CellType** | 单元格的封闭类型系统（Text/Vector/RefRow/RefExternal/...） | [0002](./adr/0002-storage-typed-cells.md) |
| **Ref** | 指向其他 row 或外部资源的引用 | [0002](./adr/0002-storage-typed-cells.md) |
| **Adapter** | 对外部系统（Linear/Notion/...）的 ingress/egress 层 | [0004](./adr/0004-adapter-protocol.md) [0005](./adr/0005-adapter-capabilities.md) [0011](./adr/0011-adapter-credential-modes.md) [0021](./adr/0021-admin-delegated-credential.md) |
| **Transform** | 任意输入 → typed output，impl 可以是 code 或 prompt | [0003](./adr/0003-transform-primitive.md) |
| **Operation** | 用户/agent 可触发的动作。UI 绑定 + agent tool 同声明派生；surface contract 区分 agent 工具面和 end-user app surface | [0018](./adr/0018-operations-as-primitive.md) [0023](./adr/0023-operation-surface-contract.md) |
| **WhereClause** | 跨 policy/query/trigger 共享的表达式 AST | [0019](./adr/0019-where-clause-ast.md) |
| **PermissionContext** | 贯穿运行时的权限/身份/trace 上下文 | [0007](./adr/0007-permission-dsl.md) [0010](./adr/0010-user-id-grants.md) |

边界提醒：`Adapter`、`LLMProvider`、`EmbeddingProvider` 的**协议**是 framework primitive；`packages/adapter-linear` 和 `packages/provider-openrouter` 是 `reference-integration`，用于验证真实外部系统/模型接入，不是 framework core semantics。

### 它们如何组合（一次 mutation 的生命周期）

```
用户点击 UI 按钮 or Agent 调 tool
           │
           ▼
      Operation dispatcher                           [ADR-0018]
           │
           ├─ 构造 PermissionContext                  [ADR-0010]
           │
           ├─ evaluatePolicy(ctx, invoke, op:<id>)    [ADR-0007, 0008]
           │     │ policy 用 WhereClause 做谓词        [ADR-0019]
           │     ▼
           ├─ 计算 Impact，必要时强制确认               [ADR-0017, 0018]
           │
           ├─ 执行 Operation handler
           │     │
           │     ├─ 调 Table.write / Adapter.update    [ADR-0002, 0004, 0005]
           │     ├─ 调 Transform 做类型强制             [ADR-0003]
           │     └─ 触发 Query（= 只读 Operation）      [ADR-0020]
           │
           ├─ emit telemetry event（带 ctx）           [ADR-0013, 0015]
           │     │
           │     └─ audit:true 事件流入 append-only sink [ADR-0014]
           │
           └─ 返回 output / 更新 UI
```

---

## 给新人的阅读顺序

ADR 是一个**可导航的网**，不是线性教程。推荐路径：

### 最小读完能建心智模型（~45 分钟，11 条）

1. **[0001 Archetype scope](./adr/0001-archetype-scope.md)**——产品定位 + MVP 范围
2. **[0002 Typed cells](./adr/0002-storage-typed-cells.md)** + **[0003 Transform](./adr/0003-transform-primitive.md)**——数据模型核心
3. **[0004 Adapter protocol](./adr/0004-adapter-protocol.md)**——外部系统接入
4. **[0007 Permission DSL](./adr/0007-permission-dsl.md)** + **[0019 WhereClause](./adr/0019-where-clause-ast.md)**——权限表达式栈
5. **[0018 Operation primitive](./adr/0018-operations-as-primitive.md)** + **[0023 Operation surface](./adr/0023-operation-surface-contract.md)**——UI 与 Agent 对等的那条线，以及哪些 Operation 能进入 end-user surface
6. **[0013 Telemetry](./adr/0013-telemetry-event-model.md)** + **[0014 Audit](./adr/0014-audit-subset.md)**——观测层
7. **[0016 Dev/Prod isolation](./adr/0016-dev-prod-data-isolation.md)** + **[0017 Rollback](./adr/0017-rollback-data-semantics.md)**——双模式语义
8. **[0021 admin_delegated credential](./adr/0021-admin-delegated-credential.md)**——真实团队场景（Linear 例子）

### 补齐场景细节（按需）

- **存储深度**：[0005](./adr/0005-adapter-capabilities.md) [0008](./adr/0008-nl-bidirectional.md) [0020](./adr/0020-query-dsl.md)
- **权限深度**：[0006](./adr/0006-permission-granularity.md) [0009](./adr/0009-permission-default-posture.md) [0010](./adr/0010-user-id-grants.md) [0011](./adr/0011-adapter-credential-modes.md) [0012](./adr/0012-agent-permissions.md)
- **观测深度**：[0015](./adr/0015-sinks-and-trace.md)

### 顶层模型与领域模型

- **[spec/creation-host-model.md](./spec/creation-host-model.md)** / **[中文版](./spec/creation-host-model.zh-CN.md)**——顶层边界：先用零基础视觉导读分清 Framework / Creation Host / Generated Application / Published Application，再进入领域模型。
- **[spec/creation-host-ddd-review.md](./spec/creation-host-ddd-review.md)** / **[中文版](./spec/creation-host-ddd-review.zh-CN.md)**——M21 后 DDD review：面向 Creation Host Authoring 和 Team/Org Sharing Governance 的核心语言、bounded contexts、聚合候选和 contract 提升规则。
- **[spec/domain-model.md](./spec/domain-model.md)**——Generated Application 内部模型：8 aggregate roots + 6 value objects + 5 domain services，配 6 张架构图（`spec/images/`）。M1 实现的核心 spec。

> M1 的 verification matrix（每个 definition primitive × def 写入 / app_history / restart 发现 / policy gating / rollback / 边界）现在直接放在 [milestone-1-snapshot.md](./milestone-1-snapshot.md#m1-verification-matrix)。早期 step 4-6 的 scenario-validation 已 squash 进 git history。

### 当前位置（下一步做什么）

- **[milestone-1-snapshot.md](./milestone-1-snapshot.md)** / **[中文版](./milestone-1-snapshot.zh-CN.md)**——M1 closed canonical 入口；适合团队先对齐 governed app-definition primitive。
- **[milestone-2-snapshot.md](./milestone-2-snapshot.md)** / **[中文版](./milestone-2-snapshot.zh-CN.md)**——M2 closed snapshot；适合团队理解 enterprise governance evidence 的外部视角。
- **[milestone-3-snapshot.md](./milestone-3-snapshot.md)** / **[中文版](./milestone-3-snapshot.zh-CN.md)**——M3 closed snapshot；适合团队理解 deployable app substrate 的外部视角。
- **[milestone-3-deployable-substrate-design.md](./milestone-3-deployable-substrate-design.md)** / **[中文版](./milestone-3-deployable-substrate-design.zh-CN.md)**——M3 design input；解释为什么从 enterprise hardening 转向真实可部署 substrate。
- **[milestone-4-snapshot.md](./milestone-4-snapshot.md)** / **[中文版](./milestone-4-snapshot.zh-CN.md)**——M4 closed snapshot；适合团队理解 Knowledge Inbox reference app。
- **[milestone-5-snapshot.md](./milestone-5-snapshot.md)** / **[中文版](./milestone-5-snapshot.zh-CN.md)**——M5 closed snapshot；适合团队理解 Builder/Agent 如何演进真实 app。
- **[milestone-6-snapshot.md](./milestone-6-snapshot.md)** / **[中文版](./milestone-6-snapshot.zh-CN.md)**——M6 closed snapshot；适合团队理解真实 backend-agent 如何通过 framework semantic tools 演进 app，以及 live opencode trace 如何解释执行过程。
- **[milestone-7-snapshot.md](./milestone-7-snapshot.md)** / **[中文版](./milestone-7-snapshot.zh-CN.md)**——M7 closed snapshot；适合团队理解真实 agent evolution 如何从 runner auto-approval 进入 proposal-level Builder approval，并理解真实 opencode path、deferred approval、completion gate 的边界。
- **[milestone-8-snapshot.md](./milestone-8-snapshot.md)** / **[中文版](./milestone-8-snapshot.zh-CN.md)**——M8 closed snapshot；适合团队理解 Builder/Agent 演进后的 app state 如何变成 restartable Docker release artifact，以及这和 rolling update 的区别。
- **[milestone-9-snapshot.md](./milestone-9-snapshot.md)** / **[中文版](./milestone-9-snapshot.zh-CN.md)**——M9 closed snapshot；适合团队理解 approved creation 如何安全进入 release candidate，或在失败时留下 recovery evidence。
- **[milestone-10-snapshot.md](./milestone-10-snapshot.md)** / **[中文版](./milestone-10-snapshot.zh-CN.md)**——M10 closed snapshot；适合团队理解 semantic retrieval 如何作为 derived capability 加入 Knowledge Inbox，同时不分裂 source of truth。
- **[milestone-11-snapshot.md](./milestone-11-snapshot.md)** / **[中文版](./milestone-11-snapshot.zh-CN.md)**——M11 closed snapshot；适合团队理解 release candidate 如何通过 framework semantic tools 进入 stage / promote / rollback 状态。
- **[milestone-12-snapshot.md](./milestone-12-snapshot.md)** / **[中文版](./milestone-12-snapshot.zh-CN.md)**——M12 closed snapshot；适合团队理解 Reference Creation Host substrate。
- **[milestone-13-snapshot.md](./milestone-13-snapshot.md)** / **[中文版](./milestone-13-snapshot.zh-CN.md)**——M13 closed snapshot；适合团队理解 Host-level governed evolution。
- **[milestone-14-snapshot.md](./milestone-14-snapshot.md)** / **[中文版](./milestone-14-snapshot.zh-CN.md)**——M14 closed snapshot；适合团队理解 Host publish / monitor / rollback。
- **[milestone-15-snapshot.md](./milestone-15-snapshot.md)** / **[中文版](./milestone-15-snapshot.zh-CN.md)**——M15 closed snapshot；适合团队理解同一个 Host 如何承载不同 app shape。
- **[milestone-16-snapshot.md](./milestone-16-snapshot.md)** / **[中文版](./milestone-16-snapshot.zh-CN.md)**——M16 closed snapshot；适合团队理解一个 Reference Creation Host 如何把 M12-M15 串成完整 Builder-facing workflow。
- **[milestone-17-snapshot.md](./milestone-17-snapshot.md)** / **[中文版](./milestone-17-snapshot.zh-CN.md)**——M17 closed snapshot；适合团队理解安全与架构接受门，以及为什么 RC 前必须做 open-ended app pressure。
- **[milestone-18-snapshot.md](./milestone-18-snapshot.md)** / **[中文版](./milestone-18-snapshot.zh-CN.md)**——M18 closed snapshot；适合团队理解 Personal Focus Site 如何压力测试 open-ended app shape，并把下一步推进到 M19 release-candidate review。
- **[milestone-19-snapshot.md](./milestone-19-snapshot.md)** / **[中文版](./milestone-19-snapshot.zh-CN.md)**——M19 closed review；适合团队理解为什么 repo 技术健康度接近 RC，但 RC tag 当时等待 open-ended definition governance boundary。
- **[milestone-20-snapshot.md](./milestone-20-snapshot.md)** / **[中文版](./milestone-20-snapshot.zh-CN.md)**——M20 closed boundary；适合团队理解 Host-owned open-ended artifacts 的 accepted contract 和验证证据。
- **[milestone-21-snapshot.md](./milestone-21-snapshot.md)** / **[中文版](./milestone-21-snapshot.zh-CN.md)**——M21 closed developer onboarding；适合团队理解为什么 RC 前补的是 Developer golden path，而不是新 primitive。
- **[milestone-22-snapshot.md](./milestone-22-snapshot.md)** / **[中文版](./milestone-22-snapshot.zh-CN.md)**——M22 closed Creation Host Authoring Kit；适合团队理解 Build Agent Package、provider matrix、portable share/fork artifact 的 contract boundary。
- **[milestone-23-snapshot.md](./milestone-23-snapshot.md)** / **[中文版](./milestone-23-snapshot.zh-CN.md)**——M23 closed Sharing Governance；适合团队理解 share/fork/install rights、owner/maintainer/operator、revocation 和 no-secret credential rebinding evidence。
- **[milestone-24-snapshot.md](./milestone-24-snapshot.md)** / **[中文版](./milestone-24-snapshot.zh-CN.md)**——M24 closed Creation Host RC pressure；适合团队理解 Alice/Bob/Charlie/Dave 真实场景如何压测 authoring、sharing、provider parity 和 fail-closed fork/install decisions。
- **[milestone-25-snapshot.md](./milestone-25-snapshot.md)** / **[中文版](./milestone-25-snapshot.zh-CN.md)**——M25 closed Alice Creation Host prototype；适合团队从 Developer 的外部认知路径理解 framework 为什么要支持 Creation Host，而不是只做一个 app。
- **[release-candidate-snapshot.md](./release-candidate-snapshot.md)** / **[中文版](./release-candidate-snapshot.zh-CN.md)**——RC accepted snapshot；适合团队判断为什么 `pneuma-rc-0.1.0` 是 developer-facing candidate release，而不是 production readiness claim。
- **[release-candidate-0.1.1-snapshot.md](./release-candidate-0.1.1-snapshot.md)** / **[中文版](./release-candidate-0.1.1-snapshot.zh-CN.md)**——RC patch snapshot；适合团队判断外部 DevBoard feedback 中哪些缺口被收进 developer-contract patch，哪些进入后续 lane。
- **[release-candidate-0.1.3-snapshot.md](./release-candidate-0.1.3-snapshot.md)** / **[中文版](./release-candidate-0.1.3-snapshot.zh-CN.md)**——RC patch snapshot；适合团队判断 Code Change Lane 如何把 Scaffold Project contract 推进为可执行 source-change lane。
- **[milestone-31-snapshot.md](./milestone-31-snapshot.md)** / **[中文版](./milestone-31-snapshot.zh-CN.md)**——M31 downstream adoption pressure；适合团队判断 M30 credential helpers 是否真的能替换下游 Host 的重复 session/OAuth/cookie/evidence 代码。
- **[milestone-30-snapshot.md](./milestone-30-snapshot.md)** / **[中文版](./milestone-30-snapshot.zh-CN.md)**——M30 post-RC stabilization；适合团队判断 credential rebinding、OAuth callback、session cookie 和 no-secret evidence 如何变成下游可用工具。
- **[milestone-29-snapshot.md](./milestone-29-snapshot.md)** / **[中文版](./milestone-29-snapshot.zh-CN.md)**——M29 post-RC stabilization；适合团队判断 BuildThread 如何接到 AgentBackend `runTurn`，以及 backend-native session 为什么只是 cache。
- **[milestone-28-snapshot.md](./milestone-28-snapshot.md)** / **[中文版](./milestone-28-snapshot.zh-CN.md)**——M28 post-RC stabilization；适合团队判断 HostExtension slot/manifest 如何让 Host-owned open-ended contribution 可验证、可分发。
- **[milestone-27-snapshot.md](./milestone-27-snapshot.md)** / **[中文版](./milestone-27-snapshot.zh-CN.md)**——M27 post-RC stabilization；适合团队判断 runtime composition 如何变得可诊断、可组合，而不是把 framework 做成部署平台。
- **[milestone-26-snapshot.md](./milestone-26-snapshot.md)** / **[中文版](./milestone-26-snapshot.zh-CN.md)**——M26 post-RC stabilization；适合团队判断 Code Change Lane 如何吸收下游反馈，而不是急着切 `0.1.4` release。
- **[../developer/getting-started.md](../developer/getting-started.md)** / **[中文版](../developer/getting-started.zh-CN.md)**——Developer 从零开始的 scaffold / doctor / reference loop 路径。
- **[../developer/creation-host-contract.md](../developer/creation-host-contract.md)** / **[中文版](../developer/creation-host-contract.zh-CN.md)**——Creation Host 最小 contract、Host/framework 边界、schema-driven 与 open-ended app 差异。
- **[../developer/upgrading-to-rc-0.1.2.md](../developer/upgrading-to-rc-0.1.2.md)** / **[中文版](../developer/upgrading-to-rc-0.1.2.zh-CN.md)**——BuildThread 下游升级指南；适合 DevBoard 这类 Host 把 conversation table / translator 迁到 framework primitive。
- **[../developer/upgrading-to-rc-0.1.3.md](../developer/upgrading-to-rc-0.1.3.md)** / **[中文版](../developer/upgrading-to-rc-0.1.3.zh-CN.md)**——Code Change Lane 下游升级指南；适合简单 Bun/TS/JS Generated Application 的 draft/apply lane。
- **[../developer/build-thread.md](../developer/build-thread.md)** / **[中文版](../developer/build-thread.zh-CN.md)**——BuildThread guide；适合下游 Host 把 Builder conversation 从 Host-owned table 迁到 framework semantic transcript。
- **[../developer/scaffold-project-contract.md](../developer/scaffold-project-contract.md)** / **[中文版](../developer/scaffold-project-contract.zh-CN.md)**——Scaffold Project contract；适合下游 Host 在让 agent draft code 前声明 source boundary、protected paths、guardrails 和 proposal evidence。
- **[../developer/code-change-lane.md](../developer/code-change-lane.md)** / **[中文版](../developer/code-change-lane.zh-CN.md)**——Code Change Lane guide；适合下游 Host 将 draft workspace 变成 proposal evidence、approved apply 和 BuildThread receipt。
- **[../developer/credential-broker.md](../developer/credential-broker.md)** / **[中文版](../developer/credential-broker.zh-CN.md)**——Host Credential Broker guide；适合下游 Host 接入 session、OAuth state、callback binding、credential refs 和 no-secret rebinding evidence。
- **[../developer/app-config-authoring.md](../developer/app-config-authoring.md)** / **[中文版](../developer/app-config-authoring.zh-CN.md)**——AppConfig authoring 的实际 invariant：cell type、reserved columns、`_cell`、destructive impact、SQLite path。
- **[../developer/runtime-composition.md](../developer/runtime-composition.md)** / **[中文版](../developer/runtime-composition.zh-CN.md)**——Runtime composition：Host-owned dev/prod discipline、internal token、markers、`asBunFetch` boundary、published data modes。
- **[../developer/release-rollout-authoring.md](../developer/release-rollout-authoring.md)** / **[中文版](../developer/release-rollout-authoring.zh-CN.md)**——Release rollout helper shape：stage/promote/rollback transition、checks、summary。
- **[spec/creation-host-authoring-and-sharing.md](./spec/creation-host-authoring-and-sharing.md)** / **[中文版](./spec/creation-host-authoring-and-sharing.zh-CN.md)**——M21 之后的 authoring/sharing 问题框架：Developer 如何构建自己的 Creation Host，以及 M22/M23 contract 如何接上。
- **[spec/creation-host-ddd-review.md](./spec/creation-host-ddd-review.md)** / **[中文版](./spec/creation-host-ddd-review.zh-CN.md)**——最完整的 post-M21 DDD 锚点：从核心语言、子域、聚合候选到 M22/M23 contract 边界。
- **[ADR-0031](./adr/0031-open-ended-definition-artifact-boundary.md)**——M20 accepted boundary；适合团队理解 Host-owned open-ended artifacts 与 framework definition rows 的边界。
- **[m2-authorization-kernel-design.md](./m2-authorization-kernel-design.md)**——M2 第一刀设计草案：用测试矩阵定义 framework authorization contract。
- **[team-share-demo.md](./team-share-demo.md)** / **[中文版](./team-share-demo.zh-CN.md)**——post-RC 0 预备知识团队分享路径；从顶层目标进入四制品模型、governed creation loop、primitive control plane、M1-M31 证据链和 RC decision。
- **[roadmap.md](./roadmap.md)**——Stage 0–9 的现实路径，含 M3 substrate 原型转向。
- **[OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md)**——View rendering、热加载、治理缺口等未决问题。

---

## 项目状态（截至 2026-05-09）

- ✅ **37 条 ADR 已敲定**（0001-0037）+ 多条 amendments
- ✅ **领域模型已立**：domain-model.md + 6 张架构图（[spec/](./spec/)）
- ✅ **Stage 1-3 闭合**：core-domain primitives / runtime infra / agent-in-loop wire（见 [roadmap.md](./roadmap.md)）
- ✅ **M1 — Stage 4 闭合**：governed app-definition primitive
  - `definition.apply(add_table / add_table_column / add_operation / add_view / add_policy_rule)`
  - approval + impact disclosure + policy-gated visibility + rollback validate/prepare/execute
  - live browser capability lifecycle demo（`examples/p5-viewer-approval-e2e?scenario=capability-lifecycle&variant=studio`）
  - verification matrix 见 [milestone-1-snapshot.md](./milestone-1-snapshot.md#m1-verification-matrix)
- ✅ **v0 design spec supersede**（[ADR-0029](./adr/0029-supersede-v0-design-spec.md)）：早期 lifecycle-script-centric framework 视角已废止；lifecycle 保留为 runtime 子系统
- ✅ **Lifecycle subsystem contract**（[ADR-0030](./adr/0030-lifecycle-subsystem-contract.md)）：lifecycle 被 pin 成 runtime subsystem；agent/host 面向 semantic tools，脚本和 marker 是 implementation lane
- ✅ **Open-ended definition artifact boundary**（[ADR-0031](./adr/0031-open-ended-definition-artifact-boundary.md)）：M18 式 UI/module artifacts 在 v0 是 Host-owned + Host approval，不是 framework definition rows 或 `definition.apply_change_set`
- ✅ **BuildThread primitive**（[ADR-0032](./adr/0032-build-thread-primitive.md)）：framework owns semantic Builder conversation transcript；backend-native sessions are cache/optimization
- ✅ **Scaffold Project contract**（[ADR-0033](./adr/0033-scaffold-project-contract.md)）：Developer-authored scaffold boundary、writable/protected paths、guardrails 和 code-change proposal evidence 进入 doctor-host validation
- ✅ **Code Change Lane executor**（[ADR-0034](./adr/0034-code-change-lane-executor.md)）：Scaffold Project + BuildThread 进入最小可执行 source-change lane；支持 proposal evidence、approved apply、stale-base fail、post-apply rollback receipt
- ✅ **HostExtension Slot Contract**（[ADR-0035](./adr/0035-host-extension-slot-contract.md)）：Host-owned open-ended contribution 进入 portable manifest + slot compatibility validation
- ✅ **AgentBackend runTurn Contract**（[ADR-0036](./adr/0036-agent-backend-run-turn.md)）：BuildThread replay 接入 backend turn，backend-native session 只是 cache/optimization
- ✅ **Host Credential Broker Utilities**（[ADR-0037](./adr/0037-host-credential-broker-utilities.md)）：session/cookie/OAuth/credential-ref helpers 进入本地 Host utility boundary
- ✅ **Downstream Credential Adoption Pressure**（[milestone-31-snapshot.md](./milestone-31-snapshot.md)）：DevBoard Studio 采用 credential helpers，并把 OAuth JSON / form response compatibility 补回 framework
- ✅ **Developer onboarding path**（[milestone-21-snapshot.md](./milestone-21-snapshot.md)）：scaffold-host、doctor-host、profile contract tests、developer guides 已补齐
- ✅ **Creation Host Authoring Kit**（[milestone-22-snapshot.md](./milestone-22-snapshot.md)）：Build Agent Package、Provider Capability Matrix、Portable Share Artifact、provider parity contracts、authoring doctor 已补齐
- ✅ **Sharing Governance contract**（[milestone-23-snapshot.md](./milestone-23-snapshot.md)）：SharingGovernanceManifest、CredentialRebindingEvidence、share/fork/install rights、revocation、no-secret rebinding evidence、doctor-host integration 已补齐
- ✅ **Creation Host RC pressure**（[milestone-24-snapshot.md](./milestone-24-snapshot.md)）：Alice/Bob/Charlie/Dave 场景、capability-contract-only Build Agent boundary、provider parity、version-bound credential rebinding、fail-closed fork/install decisions 已补齐
- ✅ **Alice Creation Host prototype**（[milestone-25-snapshot.md](./milestone-25-snapshot.md)）：Developer cognitive path、Host contract decisions、Builder session constraints、share/fork evidence、RC judgment 已补齐
- ✅ **Release Candidate accepted**（[release-candidate-snapshot.md](./release-candidate-snapshot.md)）：`pneuma-rc-0.1.0` 作为第一个 developer-facing candidate release；明确不是 production readiness claim
- ✅ **RC 0.1.1 developer-contract patch**（[release-candidate-0.1.1-snapshot.md](./release-candidate-0.1.1-snapshot.md)）：吸收外部 DevBoard feedback 中明确的 runtime / AppConfig / rollout / Authoring Kit 文档与 helper 缺口
- ✅ **M2 — Stage 5 闭合**：Enterprise Governance Hardening — 见 [milestone-2-snapshot.md](./milestone-2-snapshot.md)
  - Authorization Kernel：`build_agent` 只能 propose，`framework_system` 才能执行 approved mutation
  - Approval Token Chain：Builder approval 被转换成 scoped single-use token
  - Raw Framework Ops Boundary：framework internal Operations 不暴露为 agent `op.*`，caller policy 不能重新放开
  - Durable Permission Ledger：request / response / token / execution / outcome 可追踪
  - Governance Evidence：viewer 能解释 proposer / approver / token hash / executor / status
  - Policy Semantics：explicit deny、deny-over-allow、default posture、rollback support
  - Recoverable Mutation：single in-process writer、durable dirty guard、repair status/reset
- ✅ **M3 — Stage 6 闭合**：Deployable App Substrate — 见 [milestone-3-snapshot.md](./milestone-3-snapshot.md)
  - Unified SQLite app database：rows / cells / definition rows / `app_history` / permission ledger 共用真实 substrate
  - Idempotent migration：`migrate.sh` 创建 `data/app.db`，migration tests 覆盖 fresh + rerun
  - Release manifest：`build.sh` 产出 web process、healthcheck、migration、volume contract
  - Docker-first runtime：reference template 能作为 Docker image 跑在 `/data/app.db` 上
  - Restart persistence：Operation API data 和 Builder-created `bookmarks.tags` capability 穿过 container restart 后仍被 `/api/config` rediscover
- ✅ **M4 — Reference App Prototype 闭合**：Knowledge Inbox — 见 [milestone-4-snapshot.md](./milestone-4-snapshot.md)
  - Product loop：capture source → review queue → status triage
  - App/Data/Substrate 三视角：end-user workflow、stored rows、live `/api/config`
  - Deterministic demo runner：`examples/m4-knowledge-inbox/run.ts --seed`
  - Restart persistence：SQLite local reopen + Docker mounted-volume restart
  - Browser QA：seeded App view、Data view、status filters、0 console errors
- ✅ **M5 — Builder Evolution 闭合**：Knowledge Inbox Priority Queue — 见 [milestone-5-snapshot.md](./milestone-5-snapshot.md)
  - Builder request -> deterministic Build-phase Agent proposal -> Builder approval -> governed `definition.apply`
  - `priority` column / `list_priority_queue` Operation / `priority_queue` View / public read PolicyRule
  - Restart rediscovery 后，App/Data/Substrate surfaces 都能解释 Priority Queue 的出现
- ✅ **M6 — Real Backend-Agent Evolution 闭合**：见 [milestone-6-snapshot.md](./milestone-6-snapshot.md)
  - Backend agent 通过 `AgentBackend.launch()` / `sendUserMessage()` 进入 app evolution loop
  - opencode wiring 支持 `pneuma_app` + `pneuma_framework` 双 MCP tool surface
  - `definition.apply` 通过 framework tool proxy 调用，approval / `framework_system` execution / restart rediscovery 仍成立
  - live opencode runner 有 completion gate，并写入 M6 execution trace：Builder request / tool_call / approval / tool_result / before-after diff
  - M6 留下的 live approval gap 已由 M7 补上；Semantic index track 仍后置
- ✅ **M7 — Capability Change-Set Approval 闭合**：见 [milestone-7-snapshot.md](./milestone-7-snapshot.md)
  - `definition.apply_change_set` 把一个 Builder intent 收束成一个 proposal-level approval
  - 子 app-definition mutation 继续复用 `definition.apply` 的 governance / restart / rediscovery path
  - Builder 点击 Allow/Deny 后，`permission-response` 通过既有 WebSocket 回到 framework permission pipeline
  - Real opencode path 现在由 backend agent 基于 app-definition snapshot 构造 proposal，并用 `approval_mode: "defer"` 等待 Builder
  - Allow path completion gate 会校验 priority column / Operation / View / PolicyRule / priority rows；Deny path 在任何子 mutation 前保持 app definition 不变
  - transcript 记录 Builder request / tool call / prompt / response / result / restart / completion，支持 before-work-after 讲解
- ✅ **M8 — Release Packaging Hardening 闭合**：见 [milestone-8-snapshot.md](./milestone-8-snapshot.md)
  - `examples/m8-release-packaging-hardening` 把 evolved Knowledge Inbox workspace 打成 Docker release
  - `build.manifest.json` 的 process / health / migration / volume / SQLite contract 被测试校验
  - release container 挂载 `/data/app.db` 后，`/api/config` rediscover Priority Queue
  - `list_priority_queue` 在 `docker restart` 前后都返回 P1/P2/P3
- ✅ **M9 — Creation-to-Release Integrity 闭合**：见 [milestone-9-snapshot.md](./milestone-9-snapshot.md)
  - `definition.apply_change_set` 现在返回 child progress、before fingerprint、failed child index、recovery status
  - partial child failure 会进入 explicit recovery envelope，不会留下无法解释的 half-success
  - `ReleaseCandidate` v0 建模 created / building / verifying / ready / failed，并对缺失 manifest/image/check fail closed
  - `examples/m9-creation-to-release-integrity` 写出 success/failure 两条 evidence JSON
  - M8 Docker smoke 在 M9 后仍通过，说明 release artifact boundary 未退化
- ✅ **M10 — Derived Semantic Index 闭合**：见 [milestone-10-snapshot.md](./milestone-10-snapshot.md)
  - Core-domain 新增 `SemanticIndexService` / `SemanticIndexStore` / deterministic embedding / SQLite derived index store
  - Knowledge Inbox 新增 `rebuild_semantic_index` 和 `semantic_search_items`
  - `inbox_items` 没有新增 `embedding` 业务列；vectors 存在可重建的 `semantic_index_entries`
  - Viewer 新增 Semantic Search panel，并暴露 missing / stale / ready index status
  - M10 runner 和 Docker release smoke 验证语义搜索在 container restart 前后仍通过
- ✅ **M11 — Rollout Adapter v0 闭合**：见 [milestone-11-snapshot.md](./milestone-11-snapshot.md)
  - Core 新增 `ReleaseRolloutState`：active / candidate / previous slots + timeline
  - `.pneuma/release-rollout.json` 持久化 rollout state
  - framework tool registry 新增 `release.status` / `release.stage` / `release.promote` / `release.rollback`
  - `examples/m11-local-rollout-adapter` 用两个本地 Docker release URL 证明 promote 与 rollback
  - M11 明确不声称 stable hostname、cloud deploy、registry push 或 production traffic switch
- ✅ **M12 — Reference Creation Host Substrate 闭合**：见 [milestone-12-snapshot.md](./milestone-12-snapshot.md)
  - Host 创建 `team-knowledge-inbox@v0` generated app workspace
  - Host 启动 preview runtime，并在同一界面展示 app / schema / data / operations / logs
  - 左右分屏 workbench 第一次让 Builder 站在 Host 里理解 app
- ✅ **M13 — Host-Level Governed Evolution 闭合**：见 [milestone-13-snapshot.md](./milestone-13-snapshot.md)
  - Builder 在 Host 里提出 Priority Queue intent
  - Backend agent 提出一个 `definition.apply_change_set`
  - Host 展示一个 approval prompt；allow 应用整个 capability，deny 保持 app 不变
  - transcript 保存 builder / agent / tool / approval / result / completion 证据
- ✅ **M14 — Host Publish / Monitor / Rollback 闭合**：见 [milestone-14-snapshot.md](./milestone-14-snapshot.md)
  - Host 创建 v0/v1 version workspaces
  - Host 发布 v0、发布 evolved v1、保留 previous release
  - Host 重启 active runtime 并重新验证 health/config/API
  - Host rollback 后 End User surface 回到 v0，v1 变成 previous
- ✅ **M15 — Generality Pressure App 闭合**：见 [milestone-15-snapshot.md](./milestone-15-snapshot.md)
  - 同一个 Host 创建 Knowledge Inbox 与 Team Decision Log 两种 app shape
  - Team Decision Log 提供不同主表 `decisions`、不同 Operation、不同 View
  - Host inspection 同时暴露 schema / operations / views / policies / data
  - `owner-can-read-decisions` 证明 app policy shape 可以因 profile 而异
- ✅ **M16 — Reference Creation Host Integration Gate 闭合**：见 [milestone-16-snapshot.md](./milestone-16-snapshot.md)
  - 新增 shared Creation Host profile/project/version/store contract
  - 一个 Host workbench 串起 create / preview / inspect / evolve / approve / publish / restart / rollback
  - Knowledge Inbox 证明完整 release path；Team Decision Log 继续证明 profile generality
  - Live browser E2E 发现并修复 rollback stale URL 与 multi-app selection 状态泄漏
- ✅ **M17 — Security + Architecture Acceptance Gate 闭合**：见 [milestone-17-snapshot.md](./milestone-17-snapshot.md)
  - HTTP 不再允许外部 caller 通过 `x-pneuma-user-id: framework` 伪造 framework identity
  - Framework lifecycle calls 通过 `PNEUMA_INTERNAL_HTTP_TOKEN` / `x-pneuma-internal-token` 进入 child runtime
  - GET/query 和 View source invoke 检查默认 fail closed
  - rollback failure 在 pre-rollback backup 后写 `definition_rollback_failed`
  - ADR-0029 / 四制品模型 / ADR-0030 lifecycle subsystem contract 被正式接受
  - Linear/OpenRouter 被标记为 `reference-integration`
- ✅ **M18 — Open-Ended App Pressure 闭合**：见 [milestone-18-snapshot.md](./milestone-18-snapshot.md)
  - `examples/m18-open-ended-personal-focus-site` 创建 Personal Focus Site，而不是另一个 table/list workflow
  - Generated app definition 覆盖 routes / sections / style tokens / dynamic modules / GitHub attention ranking
  - Host inspect surface 暴露 UI definition 与 pandazki GitHub attention evidence
  - 一个 Builder intent 通过一个 approval 演进 section copy、visual tone 和 ranking module
  - publish v0/v1、restart active runtime、rollback to v0 通过测试和 live browser E2E
  - M18 结论：open-ended shape 能进入 Host workflow，但其 UI/module artifact governance 在 M19 被标为 pre-RC boundary decision
- ✅ **M19 — Release Candidate Review 闭合**：见 [milestone-19-snapshot.md](./milestone-19-snapshot.md)
  - 全量 `bun test`：1136 pass / 0 fail
  - typecheck、diff check、architecture markdown link check 全绿
  - 修正 stale governance tests、Creation Host core contract leakage、M18 transcript 误称 `definition.apply_change_set`、M18 rollout check evidence shape
  - 决策：不立即打 RC tag；M20 先 pin open-ended definition artifact boundary
- ✅ **M20 — Open-Ended Definition Boundary 闭合**：见 [ADR-0031](./adr/0031-open-ended-definition-artifact-boundary.md)
  - 决策：open-ended UI/module artifacts 在 v0 是 Host-owned artifacts + Host-level approval
  - 不声称任意 open-ended artifacts 已经是 framework definition rows 或 `definition.apply_change_set` artifacts
  - M18 example 现在在 profile metadata、inspect output、evolution transcript 中暴露 executable boundary contract

---

## 与其他目录的分工

`docs/architecture/` 是项目所有**长期文档**的唯一入口。早期的 `docs/superpowers/{specs,plans}/`（v0 design spec、M0-M4 实施计划等）大多已 squash 进 git history（见 [ADR-0029](./adr/0029-supersede-v0-design-spec.md)）；M5-M31 的设计和计划仍保留为过程输入，但团队入口已经压缩进 milestone snapshot 或 ADR。`docs/architecture/` 与其他子目录的分工：

| 子目录 | 存什么 | 风格 |
|---|---|---|
| `adr/` | 架构决策（单点决策 + 推理） | 决策原子化，可增可 supersede 但不删 |
| `spec/` | 领域模型综述 + 架构图 | 长文档 + 图，一次成型，按需更新 |
| 顶层文件（`milestone-*.md` / `roadmap.md` / `OPEN-QUESTIONS.md` / `team-share-demo.md`） | 当前状态 + 即将做的事 | 时效性内容，闭合后压缩进下一份 |

## 目录结构

```
docs/architecture/
  README.md              ← 你在看
  OPEN-QUESTIONS.md      ← 待决清单
  milestone-1-snapshot.md / milestone-1-snapshot.zh-CN.md ← M1 closed canonical（含 verification matrix + P-slice ledger）
  milestone-2-snapshot.md / milestone-2-snapshot.zh-CN.md ← M2 closed snapshot（enterprise governance evidence）
  milestone-3-snapshot.md / milestone-3-snapshot.zh-CN.md ← M3 closed snapshot（deployable app substrate）
  milestone-4-snapshot.md / milestone-4-snapshot.zh-CN.md ← M4 closed snapshot（Knowledge Inbox reference app）
  milestone-5-snapshot.md / milestone-5-snapshot.zh-CN.md ← M5 closed snapshot（Builder evolution）
  milestone-6-snapshot.md / milestone-6-snapshot.zh-CN.md ← M6 closed snapshot（real backend-agent evolution）
  milestone-7-snapshot.md / milestone-7-snapshot.zh-CN.md ← M7 closed snapshot（capability change-set approval）
  milestone-8-snapshot.md / milestone-8-snapshot.zh-CN.md ← M8 closed snapshot（release packaging hardening）
  milestone-9-snapshot.md / milestone-9-snapshot.zh-CN.md ← M9 closed snapshot（creation-to-release integrity）
  milestone-10-snapshot.md / milestone-10-snapshot.zh-CN.md ← M10 closed snapshot（derived semantic index）
  milestone-11-snapshot.md / milestone-11-snapshot.zh-CN.md ← M11 closed snapshot（rollout adapter v0）
  milestone-12-snapshot.md / milestone-12-snapshot.zh-CN.md ← M12 closed snapshot（Reference Creation Host substrate）
  milestone-13-snapshot.md / milestone-13-snapshot.zh-CN.md ← M13 closed snapshot（Host-level governed evolution）
  milestone-14-snapshot.md / milestone-14-snapshot.zh-CN.md ← M14 closed snapshot（Host publish / monitor / rollback）
  milestone-15-snapshot.md / milestone-15-snapshot.zh-CN.md ← M15 closed snapshot（Generality pressure app）
  milestone-16-snapshot.md / milestone-16-snapshot.zh-CN.md ← M16 closed snapshot（Reference Creation Host integration gate）
  milestone-17-snapshot.md / milestone-17-snapshot.zh-CN.md ← M17 closed snapshot（Security + architecture acceptance gate）
  milestone-18-snapshot.md / milestone-18-snapshot.zh-CN.md ← M18 closed snapshot（Open-ended app pressure）
  milestone-19-snapshot.md / milestone-19-snapshot.zh-CN.md ← M19 closed snapshot（Release candidate review）
  milestone-20-snapshot.md / milestone-20-snapshot.zh-CN.md ← M20 closed snapshot（Open-ended definition boundary）
  milestone-21-snapshot.md / milestone-21-snapshot.zh-CN.md ← M21 closed snapshot（Developer onboarding）
  milestone-22-snapshot.md / milestone-22-snapshot.zh-CN.md ← M22 closed snapshot（Creation Host Authoring Kit）
  milestone-23-snapshot.md / milestone-23-snapshot.zh-CN.md ← M23 closed snapshot（Sharing Governance）
  milestone-24-snapshot.md / milestone-24-snapshot.zh-CN.md ← M24 closed snapshot（Creation Host RC pressure）
  milestone-25-snapshot.md / milestone-25-snapshot.zh-CN.md ← M25 closed snapshot（Alice Creation Host prototype）
  milestone-26-snapshot.md / milestone-26-snapshot.zh-CN.md ← M26 closed snapshot（Code Change Lane hardening）
  milestone-27-snapshot.md / milestone-27-snapshot.zh-CN.md ← M27 closed snapshot（Runtime Diagnostic Surface）
  milestone-28-snapshot.md / milestone-28-snapshot.zh-CN.md ← M28 closed snapshot（HostExtension Slot Contract）
  milestone-29-snapshot.md / milestone-29-snapshot.zh-CN.md ← M29 closed snapshot（AgentBackend runTurn Contract）
  milestone-30-snapshot.md / milestone-30-snapshot.zh-CN.md ← M30 closed snapshot（Host Credential Broker Utilities）
  milestone-31-snapshot.md / milestone-31-snapshot.zh-CN.md ← M31 closed snapshot（Downstream Credential Adoption）
  release-candidate-snapshot.md / release-candidate-snapshot.zh-CN.md ← RC accepted snapshot（pneuma-rc-0.1.0）
  release-candidate-0.1.1-snapshot.md / .zh-CN.md ← RC patch snapshot（developer-contract polish）
  release-candidate-0.1.3-snapshot.md / .zh-CN.md ← RC patch snapshot（Code Change Lane）
  milestone-3-deployable-substrate-design.md / .zh-CN.md ← M3 design input
  roadmap.md             ← 项目唯一 roadmap（Stage 0-9）
  team-share-demo.md / team-share-demo.zh-CN.md ← post-RC 团队分享包（顶层目标 → demo → RC decision → stabilization evidence）
  adr/                   ← 架构决策记录（单点决策 + 推理）
    template.md          ← ADR 写作模板（MADR-lite）
    0001-0037-*.md       ← accepted ADRs
  spec/                  ← Creation Host model、Generated Application 领域模型 + 架构图
    creation-host-model.md / creation-host-model.zh-CN.md
    domain-model.md
    images/
```

---

## ADR 是什么

一条 ADR = 一个**架构决策** + 它的**完整推理**。每条回答"为什么我们选 X 而不是 Y/Z"。

我们采用 **MADR-lite** 格式（Context / Options considered / Decision / Consequences）。详见 [adr/template.md](./adr/template.md)。

**ADR 和 design doc 的区别**：
- ADR 存**推理**（考虑了 A/B/C，选 C 因为...）
- design doc 存**状态**（目前的决定是 C）
- 当决策被推翻时，ADR 留存，新 ADR supersede 旧的——推理链是资产

---

## 所有 ADR 索引

### § 1 范围与愿景

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0001](adr/0001-archetype-scope.md) | Archetype scope — MVP 聚焦 A+B，D 作远期目标 | Accepted | 2026-04-23 |

### § 2 存储层（数据模型）

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0002](adr/0002-storage-typed-cells.md) | Storage 核心 — 类型化 Cell + 多态 data-ref | Accepted+amended | 2026-04-23/24 |
| [0003](adr/0003-transform-primitive.md) | Transform 作为 first-class 原语，与 Adapter 分开 | Accepted | 2026-04-23 |
| [0004](adr/0004-adapter-protocol.md) | Adapter 协议由 framework 定义，marketplace 在 meta-app | Accepted | 2026-04-23 |
| [0005](adr/0005-adapter-capabilities.md) | Adapter 能力声明与框架自动映射 cell 写操作 | Accepted+amended | 2026-04-23/24 |

### § 3 权限层

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0006](adr/0006-permission-granularity.md) | 权限粒度 — Table + Row + Column | Accepted | 2026-04-23 |
| [0007](adr/0007-permission-dsl.md) | 权限 DSL — 封闭词汇表的三元组 YAML | Accepted | 2026-04-23 |
| [0008](adr/0008-nl-bidirectional.md) | 权限 DSL 的双向 NL 能力 — evaluatePolicy / who_can | Accepted | 2026-04-23 |
| [0009](adr/0009-permission-default-posture.md) | 权限默认姿态 — Public 基线，按需收紧 | Accepted+amended | 2026-04-23/24 |
| [0010](adr/0010-user-id-grants.md) | User-id 粒度授权与 role 并列支持 | Accepted | 2026-04-23 |
| [0011](adr/0011-adapter-credential-modes.md) | Adapter credential 模式 — per-user / shared | Accepted | 2026-04-23 |
| [0012](adr/0012-agent-permissions.md) | Agent 权限 — Build-phase owner / Runtime 继承 | Accepted | 2026-04-23 |

### § 4 遥测层

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0013](adr/0013-telemetry-event-model.md) | 遥测事件模型 — 5 类事件 + Context 传播 | Accepted+amended | 2026-04-23/24 |
| [0014](adr/0014-audit-subset.md) | 审计子集 — Append-only，独立 sink 通路 | Accepted | 2026-04-23 |
| [0015](adr/0015-sinks-and-trace.md) | 可插拔 Sink 架构 + Trace scope 层级 | Accepted | 2026-04-23 |

### § 5 生命周期与双模式

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0016](adr/0016-dev-prod-data-isolation.md) | Dev = Prod 的可丢弃快照沙箱，数据线性单分支 | Accepted | 2026-04-23 |
| [0017](adr/0017-rollback-data-semantics.md) | Rollback 数据语义 — Destructive 时间倒流 + 强制披露 | Accepted+amended | 2026-04-23/24 |

### § 6 UI / Agent 语义对等

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0018](adr/0018-operations-as-primitive.md) | Operation 作为 first-class primitive — UI 与 Agent 的双绑定 | Accepted | 2026-04-23 |

### § 7 表达式与查询

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0019](adr/0019-where-clause-ast.md) | Where-clause AST — 跨 Policy / Query / Trigger 的共享表达式 | Accepted+amended | 2026-04-24 |
| [0020](adr/0020-query-dsl.md) | Query DSL — 声明式 YAML，Operation 的只读子类 | Accepted+amended | 2026-04-24 |

### § 8 Adapter credential 扩展

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0021](adr/0021-admin-delegated-credential.md) | `admin_delegated` credential mode + identity binding | Accepted | 2026-04-24 |

### § 9 Agent / Runtime live loop

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0025](adr/0025-agent-conversation-persistence.md) | Agent conversation persistence | Accepted | 2026-04-25 |
| [0026](adr/0026-agent-tool-call-binding.md) | Agent tool-call binding | Accepted | 2026-04-25 |
| [0027](adr/0027-live-event-stream-sse.md) | Live event stream via SSE | Accepted | 2026-04-25 |
| [0028](adr/0028-framework-event-protocol.md) | Framework event protocol for definition restart phases | Accepted | 2026-04-27 |
| [0032](adr/0032-build-thread-primitive.md) | BuildThread primitive for Builder conversation semantic transcript | Accepted | 2026-05-07 |
| [0033](adr/0033-scaffold-project-contract.md) | Scaffold Project contract for governed code-change lanes | Accepted | 2026-05-07 |
| [0034](adr/0034-code-change-lane-executor.md) | Code Change Lane executor for governed source changes | Accepted | 2026-05-07 |
| [0035](adr/0035-host-extension-slot-contract.md) | HostExtension Slot contract for portable Host-owned contributions | Accepted | 2026-05-08 |
| [0036](adr/0036-agent-backend-run-turn.md) | AgentBackend runTurn contract for BuildThread-backed backend turns | Accepted | 2026-05-08 |
| [0037](adr/0037-host-credential-broker-utilities.md) | Host Credential Broker utilities for sessions, OAuth state, and credential refs | Accepted | 2026-05-09 |

### § 10 文档与 framework 视角

| # | 标题 | Status | Date |
|---|------|--------|------|
| [0029](adr/0029-supersede-v0-design-spec.md) | v0 design spec supersede — primitive 中心从 lifecycle scripts 迁到 Operation | Accepted | 2026-04-28 |
| [0030](adr/0030-lifecycle-subsystem-contract.md) | lifecycle subsystem contract — runtime 子系统、semantic tools、script-lane marker 边界 | Accepted | 2026-05-04 |
| [0031](adr/0031-open-ended-definition-artifact-boundary.md) | open-ended definition artifact boundary — Host-owned artifacts + Host-level approval | Accepted | 2026-05-05 |

---

## 写新 ADR

1. 决定编号：当前 `ls adr/0*.md | tail -1` 的数字 + 1
2. 文件名：`adr/NNNN-kebab-case-title.md`（四位数字）
3. 复制 [template.md](./adr/template.md)，按章节填写
4. 初始 `Status: Proposed`；评审通过后改 `Accepted`
5. 更新本文件的 ADR 索引表

## Amend 现有 ADR

当决策需要小修（不推翻主决定）：

1. 在原 ADR 的 `Status` 行加 `Last amended: YYYY-MM-DD`
2. 在文末加 `## Amendments` 段落
3. 每条 amend 带日期 + 触发源 + 具体修改 + 关联（如引用其他 ADR / 场景）
4. **不修改原 Decision / Options considered / Consequences 段的历史正文**——只追加

见 [0002](./adr/0002-storage-typed-cells.md#amendments) / [0005](./adr/0005-adapter-capabilities.md#amendments) / [0009](./adr/0009-permission-default-posture.md#amendments) / [0013](./adr/0013-telemetry-event-model.md#amendments) / [0017](./adr/0017-rollback-data-semantics.md#amendments) / [0018](./adr/0018-operations-as-primitive.md#amendments) / [0019](./adr/0019-where-clause-ast.md#amendments) / [0020](./adr/0020-query-dsl.md#amendments) 作 amend 样板。

## 废止与替换

重大决策被推翻：

- 旧 ADR `Status: Superseded by ADR-XXXX`
- 新 ADR 在 Context 里引用旧 ADR + 说明推翻理由
- **不删除**旧 ADR

## 语言

当前所有 ADR 使用**中文**。成熟后可整体翻英文对外发布，保留双版。
