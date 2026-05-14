# Pneuma 团队分享材料

**日期：** 2026-05-12
**状态：** RC 0.3.0 团队分享材料；tag 等待 owner 确认
**受众：** 对 Pneuma 零预备知识、但理解普通软件产品的团队成员
**形式：** 60-70 分钟团队分享，可选本地 demo
**English version:** [team-share-demo.md](./team-share-demo.md)

这是一份在 RC 接受、M26-M38 stabilization、Build Assurance adoption、package-consumption gating、fresh downstream validation，以及 M40-M43 minimum enterprise governance lane 之后，从顶层目标向下解释 Pneuma 的团队同步材料。

如果是 Developer 自己第一次阅读，先从 [从这里开始：构建 Creation Host](../developer/start-here.zh-CN.md) 进入。这份文档用于团队讨论。

## 团队应该记住什么

分享结束后，团队应该能说出：

```text
Pneuma 是用于构建 AI-native Creation Host 的基础设施。
Developer 用 framework 构建 Host。
Builder 在 Host 里通过和 Build-phase Agent 对话，创建、检查、演进、审批、发布、监控、回滚 Generated Applications。
End User 使用 Published Application。
```

第二句应该记住的是：

```text
Pneuma 不是在证明 agent 会改文件。
Pneuma 在证明 app evolution 可以成为一个受治理的软件 primitive。
```

0.3.0 这一版需要额外记住的是：

```text
0.3.0 从 developer-contract consumption 进入 minimum enterprise governance：
一次 AI-assisted business change 拥有 role route、review packet、
decision evidence、publish gate 和 recovery path。
```

## 1. 为什么需要这个项目

绝大多数软件默认：Developer 在用户到来前完成 app 形态。用户只是操作完成后的界面：点按钮、填表单、看 dashboard。

Pneuma 测试的是另一种契约：

```text
Builder 可以在 session 中通过和 Agent 对话，改变 app 的行为、数据模型、UI 表面、发布状态和 source-level extension points。
```

![Pneuma north star](./assets/team-share/team-share-north-star.zh-CN.png)

关键区别：

| 普通 app interaction | Pneuma creation interaction |
|---|---|
| 新增一条数据 | 新增或演进一个能力 |
| 过滤一个列表 | 创建 View、Operation、source change 或 Host extension |
| 让 assistant 帮忙解释 | 让 Agent 在治理下提出 app change |
| 部署开发者产出的 build | 发布通过 Host workflow 产出的 Generated Application version |

如果 Pneuma 只是创建一个固定 app，Operation、definition-as-data、approval token、BuildThread、permission ledger、runtime diagnostics、code-change evidence、rollout state、rollback 这些 primitives 都会显得多余。

## 2. 四制品模型

最常见的误解，是把所有东西都压缩成一个 “pneuma app”。当前模型刻意把四个制品分开：

![Four artifacts](./assets/team-share/team-share-four-artifacts.zh-CN.png)

| 制品 | 含义 |
|---|---|
| **pneuma-framework** | 提供 primitives、semantic tools、governance、lifecycle、backend-agent contracts、diagnostics、release evidence 的 library/runtime。 |
| **Creation Host** | Developer 构建的产品表面，Builder 在这里创建和运营 Generated Applications。 |
| **Generated Application** | 通过 Host 创建出来的 app instance。它拥有 definition、data、source/artifact boundary、versions、runtime surface、release history。 |
| **Published Application** | 暴露给 End User 的某个 Generated Application version。 |

角色边界：

| 角色 | 主要工作 |
|---|---|
| **Developer** | 构建或配置 Creation Host、stack profiles、Host UX、agent package、guardrails 和 domain constraints。 |
| **Builder** | 通过 conversation、preview、inspection、approval、publish 在 Creation Host 中塑造 Generated Application。 |
| **End User** | 像使用普通 app 一样使用 Published Application。他们可能完全看不到 Build-phase Agent。 |

分享时可以用这句话：

> Framework 是 primitive。Creation Host 和 generated apps 是在它之上构建出来的产品。

## 3. AI Build 是一个工程控制问题

难点不是“Agent 能不能改出一个东西”。难点是：

```text
一个非专家 Builder 能不能要求 Agent 修改软件，
同时不丢失 accountability、inspection、recovery、release discipline？
```

常见失败模式：

| 失败 | Framework response |
|---|---|
| Agent 提出了过宽的变更 | Proposal evidence、diff、impact disclosure、Builder approval。 |
| Builder 反悔了 | Rejection turns、scoped approval、rollback/recovery evidence。 |
| Agent 意外删除字段或 source file | Scaffold Project boundaries、Code Change Lane guardrails、readable diff、protected paths。 |
| migration 或 rollout 半失败 | Release rollout state、recovery evidence、restart/rollback discipline。 |
| 未来 reviewer 追问为什么改了 | BuildThread、app history、permission ledger、execution receipts。 |

所以接下来的概念主线是 **AI Build Assurance**。它不是泛化的 artifact signing，而是围绕 Builder + Build-phase Agent changes 的 assurance case：

```text
谁提出，
提出了什么，
展示了什么证据，
谁批准，
哪条 lane 执行，
改变了什么，
哪里失败，
如何恢复。
```

## 4. 受治理的创造闭环

核心闭环是：一个 Builder intent 变成一次受治理的 app change。

![Governed creation loop](./assets/team-share/team-share-governed-loop.zh-CN.png)

```text
Builder intent
  -> BuildThread turn
  -> Agent proposal
  -> impact / diff / evidence disclosure
  -> Builder approval or rejection
  -> scoped approval authority
  -> framework or Host lane execution
  -> execution receipt
  -> preview, publish, rollback, inspection evidence
```

权限分工不能被模糊：

| Actor | 可以做什么 |
|---|---|
| Build-phase Agent | 通过 framework 或 Host semantic tools 提出变更。 |
| Builder | 批准或拒绝 proposal。 |
| framework_system / Host executor | 消耗 scoped approval authority，执行受治理的 mutation lane。 |
| End User | 通过正常 app policy 使用 published app。 |

Approval evidence 是产品状态，不是 debug log。

## 5. Framework 契约栈

Pneuma 不是 UI builder + chat。它是一个控制平面：同一组 contracts 同时喂给 UI、Agent tools、HTTP API、policy、history、runtime composition、release evidence 和 portable Host contracts。

![Primitive control plane](./assets/team-share/team-share-primitive-control-plane.zh-CN.png)

| Contract / subsystem | 为什么存在 |
|---|---|
| **Operation + definition-as-data** | app structure 和 actions 可以被治理、rediscover、approve、rollback。 |
| **Policy / Authorization Kernel** | proposer、approver、executor、runtime user authority 保持分离。 |
| **BuildThread** | Builder intent、Agent proposal、decision、execution receipt 拥有 semantic transcript。 |
| **Scaffold Project + Code Change Lane** | source changes 变成 draft evidence、guarded approval、apply、rollback、receipt。 |
| **Runtime Diagnostic Surface** | Host/runtime composition 有显式 mode、boot、health、readiness、route fallback behavior。 |
| **HostExtension Slot Contract** | Host-owned open-ended artifacts 可以 portable，但不伪装成 framework definition rows。 |
| **AgentBackend.runTurn** | backend 消费 BuildThread 作为 source of truth；native sessions 只是 cache。 |
| **Host Credential Broker utilities** | sessions、OAuth callback binding、credential refs、no-secret rebinding evidence 有共享 helpers。 |
| **Release Rollout State** | candidate、active、previous、restart、rollback 成为可检查的 Host state。 |

原始 v0 spec 到现在的架构转向已经被接受：

```text
old mental model: lifecycle scripts are the core
current model: Operation + definition-as-data is the core
lifecycle remains a runtime subsystem
```

## 6. 证据阶梯

项目不是一开始就跳到精致 demo，而是一层层建立证据：

![Evidence ladder](./assets/team-share/team-share-evidence-ladder.zh-CN.png)

| 阶段 | 证明了什么 |
|---|---|
| **M1-M11** | core primitives 可以治理 definition、approval、permissions、recovery、deployable substrate、semantic index 和 rollout。 |
| **M12-M20** | Creation Host 可以 create、preview、inspect、evolve、approve、publish、restart、rollback，并承载非 table-first app，同时不模糊 framework 边界。 |
| **M21-M25** | Developer onboarding、Authoring Kit、Sharing Governance、RC pressure、Alice/Bob/Charlie/Dave 让 RC 故事可以被解释和测试。 |
| **M26-M38** | Code Change Lane、runtime diagnostics、HostExtension slots、AgentBackend `runTurn`、credential utilities、downstream adoption、visible/durable Build Change Assurance、approval-time review packets、recovery drill matrices、downstream adoption guidance 和 package-consumption gating 稳定了 post-RC developer contract。 |
| **M40-M43** | Production-readiness boundary、enterprise governance roles/routes、Build Assurance publish gating，以及带 Builder/Reviewer/Owner/Operator/End User 职责的 reference demo，让最小企业治理具体化。 |
| **M44** | Runtime / Data Governance 把同一条 assurance story 延伸到 approval 之后：desired runtime/data state、observed state、generation、reconcile attempt、data evolution receipt 和 runtime control receipt 成为 contract-shaped evidence。 |

M44 之后，用 [Global Alignment Review 0.3 中文版](./spec/global-alignment-review-0.3.zh-CN.md) 作为从 milestone evidence 进入下一阶段 implementation-framework phase 的桥。它重新说明当前 north star、四层模型、统一控制闭环、领域地图和反漂移边界，帮助团队在开始真正实现框架前保持同一个心智模型。

RC 0.3.0 owner gate 之前的技术健康度：

```text
bun run typecheck
exit 0

bun run test:package-consumption
exit 0

bun test packages/core/test/enterprise-governance.test.ts packages/core/test/build-assurance.test.ts examples/m43-enterprise-governance-demo/enterprise-governance.test.ts
20 pass
0 fail

bun run examples/m43-enterprise-governance-demo/run.ts
m43 propose: awaiting reviewer
m43 self approval: denied
m43 reviewer approval: allowed
m43 publish: active
m43 rollback: completed

bun test
1293 pass
0 fail
4772 expect() calls
```

这不代表 production SaaS 已完成。它代表 framework 已经有一条自洽的 developer-facing RC line、一个 package-consumable 的 0.2.0 contract surface，以及一条狭窄但可演示的 0.3.0 enterprise-governance loop。

## 7. Demo 路径

时间允许时，使用三个 live demo + 一个 contract walkthrough。

### Demo A：Developer cognition path

目的：

```text
展示 Alice 为什么是在构建 Creation Host，而不是直接写一个 app。
```

启动：

```bash
bun run examples/m25-alice-creation-host-prototype/run.ts --port 8886
```

打开：

```text
http://127.0.0.1:8886/
```

Walkthrough：

1. Alice 从四层模型混淆开始。
2. Alice 定义 Host profiles 和 Build Agent Package。
3. Bob 创建 `dev-board`。
4. Charlie 通过 credential rebinding 安装。
5. Dave fork 时必须通过 provider-profile compatibility checks。
6. RC judgment 明确保留 productization gaps。

### Demo B：Open-ended Personal Focus Site

目的：

```text
展示同一条 Host workflow 可以承载非 table-first generated app。
```

启动：

```bash
bun run examples/m18-open-ended-personal-focus-site/run.ts --port 8880
```

打开：

```text
http://127.0.0.1:8880/
```

Walkthrough：

1. 创建 `pandazki-focus-site`。
2. 预览一个精致个人站，而不是 list workflow。
3. 检查 routes、sections、style tokens、modules 和 deterministic GitHub attention evidence。
4. 演进一个 Builder request。
5. 在 Host layer 审批 v1。
6. Publish、restart、rollback。

关键讲法：

> M18 证明四制品 workflow 可以承载 open-ended UI/module state。ADR-0031 和 ADR-0035 保持 framework 边界诚实：这些仍是 Host-owned artifacts，除非未来 ADR 把某种重复形态提升为 framework definition rows。

### Demo C：Enterprise Governance Loop

目的：

```text
展示一次 business change 如何在 publish 前经过角色路由。
```

启动：

```bash
bun run examples/m43-enterprise-governance-demo/run.ts --port 8890
```

打开：

```text
http://127.0.0.1:8890/
```

Walkthrough：

1. Builder 基于 GitHub public-read 和 mock Linear context 提出 Dev Board change。
2. Builder self-approval 被拒绝。
3. Reviewer approval 满足普通 business-change route。
4. Build Assurance 达到 `ready_to_publish`。
5. End User 看到 Published Application。
6. Owner 执行 rollback。

关键讲法：

> 0.3.0 不是把 “enterprise security” 当成泛化标签。它加入的是最小 route decision：正确的人类责任被满足前，publish 必须被 block。

### Walkthrough D：RC 0.3.0 contract

打开这些文档：

1. [BuildThread 中文版](../developer/build-thread.zh-CN.md) - Builder conversation 的 semantic transcript。
2. [Scaffold Project Contract 中文版](../developer/scaffold-project-contract.zh-CN.md) - generated-app source boundary 和 guardrails。
3. [Code Change Lane 中文版](../developer/code-change-lane.zh-CN.md) - proposal evidence、readable diff、guarded apply、rollback、receipt。
4. [Runtime Composition 中文版](../developer/runtime-composition.zh-CN.md) - mode、boot options、internal token pattern、readiness helpers。
5. [HostExtension Slots 中文版](../developer/host-extension-slots.zh-CN.md) - portable Host-owned extension bundles。
6. [Host Credential Broker Utilities 中文版](../developer/credential-broker.zh-CN.md) - session cookies、OAuth state、credential refs、no-secret rebinding evidence。
7. [AI Build Assurance DDD Review 中文版](./spec/ai-build-assurance-domain-review.zh-CN.md) - 当前已进入 RC 0.2.0 contract 的 assurance-domain 锚点。
8. [Build Assurance Adoption Guide 中文版](../developer/build-assurance-adoption.zh-CN.md) - Host 如何逐步采用 assurance cases、review packets、stores 和 recovery drills。
9. [Downstream Validation Brief 中文版](../developer/downstream-validation-brief.zh-CN.md) - 一个新的下游项目应该构建什么、报告什么。
10. [RC 0.2.0 Snapshot 中文版](./release-candidate-0.2.0-snapshot.zh-CN.md) - package-consumption gate、full verification 和 downstream validation evidence。
11. [Production Readiness Boundary 中文版](./spec/production-readiness-boundary.zh-CN.md) - 0.3.0 所说的 production readiness 是什么、不是什么。
12. [Enterprise Governance 中文版](../developer/enterprise-governance.zh-CN.md) - role routes、governance decisions 和 Build Assurance gating。
13. [Enterprise Governance Domain Review 中文版](./spec/enterprise-governance-domain-review.zh-CN.md) - 0.3.0 governance vocabulary 的 DDD anchor。
14. [Runtime / Data Governance 中文版](../developer/runtime-data-governance.zh-CN.md) - publish、migration、restart、rollback 和 provider data 的 post-approval runtime/data outcome evidence。
15. [Global Alignment Review 0.3 中文版](./spec/global-alignment-review-0.3.zh-CN.md) - M44 之后的当前顶层模型快照。
16. [RC 0.3.0 Snapshot 中文版](./release-candidate-0.3.0-snapshot.zh-CN.md) - minimum enterprise governance release train 和 owner gate。

0.2.0 仍然是团队需要明确理解的 developer-contract baseline：

```text
framework 现在可以从 monorepo 外部，被一个全新的 Bun/TypeScript Creation Host 消费。
```

package-consumption gate 会把 developer-facing packages 复制到一个 isolated 临时目录，用 `file:` dependencies 安装进一个新的 consumer，导入 focused public subpaths，运行 `scaffold-host`、运行 `doctor-host`、执行 smoke program，并 typecheck consumer。第二个全新的下游 Host，Release Radar Studio，又用同一方向验证了一次，没有报告 material framework blocker。

0.3.0 额外加入团队需要理解的一句话：

```text
一个技术上健康的 AI-built change，在 required enterprise review route 满足前，仍然不是 publish-ready。
```

## 8. 推荐分享节奏

| 时间 | 章节 | 目标 |
|---:|---|---|
| 0-5 min | 为什么存在 | 区分“使用软件”和“通过对话创造软件”。 |
| 5-12 min | 四制品 | 防止 “pneuma app” 术语坍缩。 |
| 12-20 min | AI build control problem | 解释为什么不确定性、反悔、半失败、恢复都是一等问题。 |
| 20-30 min | 治理闭环和契约栈 | 把 primitives 映射到 authority、evidence、runtime、source-change、release。 |
| 30-42 min | Demo A | 展示 Alice 的 Developer cognition path 和 Bob/Charlie/Dave outcomes。 |
| 42-52 min | Demo B | 展示 open-ended app pressure。 |
| 52-58 min | Demo C | 展示最小 enterprise governance：Builder denial、Reviewer approval、publish、End User、Owner rollback。 |
| 58-65 min | Walkthrough D | 解释 RC 0.3.0 contract surface 和边界。 |

讲解规则：

- 从问题开始，不从 ADR 编号开始。
- 用 “Builder changes app capability”，不要用 “Agent edits code”。
- 先展示 End User app，再展示 inspectors。
- 展示 approval 时，明确 proposer、approver、executor、lane、receipt。
- 对 open-ended artifacts 保持精确：Host-owned、portable，但不是 framework definition rows。
- 最后落到当前证据和下一次具体压力测试，而不是泛泛列未来功能。

## FAQ

### Pneuma 是网站构建器吗？

不是。网站构建器可以是某个 Creation Host 或 profile。Pneuma 是用于构建 Creation Hosts 的 framework layer；这些 Host 生成的 app 可以是 workflow tools、knowledge apps、internal SaaS modules、open-ended sites，或未来的 Pneuma 2.x modes。

### Agent 可以直接改生产软件吗？

不可以。预期契约是 proposal、impact/diff disclosure、approval、scoped authority、framework 或 Host-lane execution、evidence、rollback/recovery。

### 为什么不直接让 Agent 改文件？

因为直接文件修改会让 UI action、Agent tool-call、policy、approval evidence、audit history、rollback、release semantics 彼此分裂。Code Change Lane 仍允许 source changes，但它必须先作为 draft evidence 进入 governed approval/apply path。

### 这是生产级企业安全了吗？

不是。framework 已经有正确的 authority shape、local/runtime hardening evidence、package-consumption proof，以及最小 role-route governance loop；但 production IAM、tenant administration、secret management、retention、assignment queues、hosted governance workflows 和长期运营证明都属于后续 productization work。

### 什么会构成 RC 0.3.0 tag 的理由？

owner 接受 verification report 时，0.3.0 tag 就有理由成立：full suite 绿、package-consumption gate 绿、M41/M42/M43 focused tests 绿、M43 enterprise demo 绿、文档已更新。未来 tag 仍然应该由具体下游压力证明，而不是默认继续增加抽象 governance layer。

## Useful Links

- [从这里开始：构建 Creation Host](../developer/start-here.zh-CN.md)
- [Downstream Validation Brief 中文版](../developer/downstream-validation-brief.zh-CN.md)
- [架构索引](./README.md)
- [Creation Host Model 中文版](./spec/creation-host-model.zh-CN.md)
- [AI Build Assurance DDD Review 中文版](./spec/ai-build-assurance-domain-review.zh-CN.md)
- [Release Candidate Snapshot 中文版](./release-candidate-snapshot.zh-CN.md)
- [RC 0.2.0 Snapshot 中文版](./release-candidate-0.2.0-snapshot.zh-CN.md)
- [RC 0.3.0 Snapshot 中文版](./release-candidate-0.3.0-snapshot.zh-CN.md)
