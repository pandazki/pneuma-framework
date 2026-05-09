# Pneuma 团队分享材料

**日期：** 2026-05-09
**状态：** M31 之后的当前 post-RC 团队分享材料
**受众：** 对 Pneuma 零预备知识、但理解普通软件产品的团队成员
**形式：** 45-60 分钟团队分享，可选本地浏览器 demo 和契约 walkthrough
**English version:** [Pneuma Team Share Package](./team-share-demo.md)

这是一份从顶层目标向下解释 Pneuma 的团队同步材料，适用于 RC 接受和 M26-M31 stabilization 之后。

推荐叙事顺序：

```text
project goal
  -> four-layer product model
  -> governed creation loop
  -> framework control plane
  -> milestone evidence
  -> demos and post-RC contract walkthrough
  -> current decision boundary
```

如果是 Developer 自己第一次阅读，仍然先从 [从这里开始：构建 Creation Host](../developer/start-here.zh-CN.md) 进入。

## 预期结果

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

这就是为什么项目需要 Operation、definition-as-data、approval token、BuildThread、app history、permission ledger、runtime diagnostics、code-change evidence、rollout state 和 rollback。

如果 Pneuma 只是创建一个固定 app，这些 primitives 都会显得多余。

## 2. 四制品模型

最常见的误解，是把所有东西都压缩成一个 “pneuma app”。当前模型刻意把四个制品分开：

![Four artifacts](./assets/team-share/team-share-four-artifacts.zh-CN.png)

| 制品 | 含义 |
|---|---|
| **pneuma-framework** | 提供 primitives、semantic tools、governance、lifecycle、backend-agent contracts、diagnostics 和 release evidence 的 library/runtime。 |
| **Creation Host** | Developer 构建的产品表面，Builder 在这里创建和运营 Generated Applications。 |
| **Generated Application** | 通过 Host 创建出来的 app instance。它拥有 definition、data、source/artifact boundary、versions、runtime surface 和 release history。 |
| **Published Application** | 暴露给 End User 的某个 Generated Application version。 |

角色映射：

| 角色 | 主要工作 |
|---|---|
| **Developer** | 构建或配置 Creation Host、stack profiles、host UX、agent package、guardrails 和 domain constraints。 |
| **Builder** | 通过 conversation、preview、inspection、approval、publish 在 Creation Host 中塑造 Generated Application。 |
| **End User** | 像使用普通 app 一样使用 Published Application。他们可能完全看不到 Build-phase Agent。 |

分享时可以用这句话：

> Framework 是 primitive。Creation Host 和 generated apps 是在它之上构建出来的产品。

## 3. 受治理的创造闭环

核心闭环是：一个 Builder intent 变成一次受治理的 app change。

![Governed creation loop](./assets/team-share/team-share-governed-loop.zh-CN.png)

```text
Builder intent
  -> Agent proposal
  -> impact / diff / evidence disclosure
  -> Builder approval
  -> scoped approval authority
  -> framework 或 Host lane execution
  -> BuildThread receipt
  -> preview, publish, rollback, inspection evidence
```

权限分工不能被模糊：

| Actor | 可以做什么 |
|---|---|
| Build-phase Agent | 通过 framework 或 Host semantic tools 提出变更。 |
| Builder | 批准或拒绝 proposal。 |
| framework_system / Host executor | 消耗 scoped approval authority，执行受治理的 mutation lane。 |
| End User | 通过正常 app policy 使用 published app。 |

所以 approval evidence 是产品状态，不是 debug log。未来企业表面需要能回答：

```text
谁提出了这个变更？
谁批准了它？
到底批准了什么？
哪条 lane 执行了它？
改变了什么？
能否 inspect、replay 或 rollback？
```

## 4. Primitive Control Plane

Pneuma 不是 UI builder + chat。它是一个控制平面：同一组 primitives 同时喂给 UI、Agent tools、HTTP API、policy、history、runtime composition、release evidence 和 portable Host contracts。

![Primitive control plane](./assets/team-share/team-share-primitive-control-plane.zh-CN.png)

当前重要 primitives / subsystems：

| Primitive / subsystem | 为什么存在 |
|---|---|
| **Operation** | 共享 action contract。UI button、Agent tool、HTTP operation 来自同一份声明。 |
| **definition-as-data** | app structure 作为受治理的 rows 存储：tables、columns、operations、views、policies。 |
| **Policy / Authorization Kernel** | 分离 proposer、approver、executor 和 runtime user authority。 |
| **Permission Ledger / App History** | 为产品治理表面提供持久 approval 和 definition-change evidence。 |
| **BuildThread** | framework-owned semantic transcript，记录 Builder intent、Agent proposal、Builder decision、execution receipt。 |
| **Scaffold Project + Code Change Lane** | Developer-authored source boundary、guardrails、readable diff、proposal evidence、guarded apply、rollback、receipt。 |
| **Runtime Diagnostic Surface** | 显式 runtime mode、boot options、route fallback、health、readiness、marker helpers。 |
| **HostExtension Slot Contract** | 为 Host-owned open-ended artifacts 提供 portable contribution bundles，但不声称它们是 framework definition rows。 |
| **AgentBackend.runTurn** | backend turn contract：BuildThread 是 source of truth，backend-native sessions 是 cache。 |
| **Release Rollout State** | 在 Host 层追踪 candidate、active、previous、restart、rollback。 |
| **Lifecycle subsystem** | 通过 semantic tools 表达 start、stop、build、deploy、migrate、restart，而不是让 agent 改脚本。 |

原始 v0 spec 到现在的架构转向已经被接受：

```text
old mental model: lifecycle scripts are the core
current model: Operation + definition-as-data is the core
lifecycle remains a runtime subsystem
```

参见 [ADR-0029](./adr/0029-supersede-v0-design-spec.md)、[ADR-0030](./adr/0030-lifecycle-subsystem-contract.md)、[ADR-0034](./adr/0034-code-change-lane-executor.md)、[ADR-0035](./adr/0035-host-extension-slot-contract.md)、[ADR-0036](./adr/0036-agent-backend-run-turn.md)、[ADR-0037](./adr/0037-host-credential-broker-utilities.md)。

## 5. M1-M31 的证据阶梯

项目不是一开始就跳到精致 demo，而是一层层建立证据：

![Evidence ladder](./assets/team-share/team-share-evidence-ladder.zh-CN.png)

| 阶段 | 证明了什么 |
|---|---|
| **M1-M2** | app definition 可以被治理、审批、归因、策略限制、回滚，并拥有企业级 authority separation。 |
| **M3-M4** | primitive chain 能承受真实 substrate 压力：Bun、SQLite、Drizzle、Docker、mounted volume 和可用的 Knowledge Inbox app。 |
| **M5-M7** | Builder/Agent app evolution 可以通过真实 backend-agent path 跑通，并把一个 intent 对应到一个 proposal-level approval。 |
| **M8-M11** | Generated app state 可以进入 release packaging、integrity evidence、semantic retrieval 和 rollout state。 |
| **M12-M16** | Reference Creation Host 可以 create、preview、inspect、evolve、approve、publish、restart、rollback，并切换 profiles。 |
| **M17-M20** | 安全 review、架构接受、open-ended app pressure，以及 ADR-0031 pin 住 Host-owned open-ended artifact 边界。 |
| **M21-M25** | Developer onboarding、Authoring Kit、Sharing Governance、RC pressure、Alice Developer cognition path 让 RC 可以被解释和测试。 |
| **M26-M31** | Code Change Lane、runtime diagnostics、HostExtension slots、AgentBackend `runTurn`、Host Credential Broker utilities 和 downstream credential adoption pressure 稳定了 post-RC developer contract。 |

M31 当前技术健康度：

```text
bun test
1242 pass
0 fail
4637 expect() calls

bun run typecheck
exit 0

targeted docs link check
exit 0
```

这不代表 production SaaS 已完成。它代表 framework 已经有一条自洽的 developer-facing RC line，并且 post-RC contract surface 对真实 Creation Host 更清楚。

## 6. Demo 路径

时间允许时，使用两个 live demo + 一个文档 walkthrough：

![Demo storyboard](./assets/team-share/team-share-demo-storyboard.zh-CN.png)

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

### Walkthrough C：Post-RC developer contracts

目的：

```text
展示 M26-M31 为真实下游 Host 补了什么。
```

打开这些文档：

1. [Code Change Lane 中文版](../developer/code-change-lane.zh-CN.md) — proposal evidence、readable diff、guarded apply、rollback、receipt。
2. [Runtime Composition 中文版](../developer/runtime-composition.zh-CN.md) — mode、boot options、internal token pattern、readiness helpers。
3. [HostExtension Slots 中文版](../developer/host-extension-slots.zh-CN.md) — portable Host-owned extension bundles。
4. [BuildThread 中文版](../developer/build-thread.zh-CN.md) 和 [M29 Snapshot 中文版](./milestone-29-snapshot.zh-CN.md) — BuildThread 作为 backend turns 的 source of truth。
5. [Host Credential Broker Utilities 中文版](../developer/credential-broker.zh-CN.md)、[M31 Snapshot 中文版](./milestone-31-snapshot.zh-CN.md) 和 [M30 Snapshot 中文版](./milestone-30-snapshot.zh-CN.md) — session cookies、OAuth state、credential refs、no-secret rebinding evidence 和下游采用证据。

## 7. 当前决策边界

RC 已经接受。下一步不应该再问 “RC 还缺什么？”，而应该问 “哪条 post-RC productization 或 pressure lane 最值得证明？”

![Current boundary](./assets/team-share/team-share-rc-boundary.zh-CN.png)

当前足够稳定、可以构建其上的部分：

| Area | 当前主张 |
|---|---|
| 四层模型 | 已接受：Framework -> Creation Host -> Generated Application -> Published Application。 |
| Schema-driven app definition | 通过 Operation + definition-as-data 成为 framework-governed rows。 |
| Host-owned open-ended artifacts | 通过 Host approval、Code Change Lane、HostExtension slots 支持；不是 framework definition rows。 |
| Builder conversation | BuildThread 是 framework-owned semantic transcript；backend-native sessions 是 cache。 |
| Source changes | Code Change Lane 可以为 draft source changes 产出 proposal evidence 和 guarded apply。 |
| Runtime composition | runtime mode、readiness、health、route fallback 已有 framework helpers。 |

仍属于 productization / pressure work 的部分：

| Lane | 为什么不属于当前主张 |
|---|---|
| Production credential store + OAuth/account-linking UX | 本地 / reference credential helpers 已存在；durable secret storage、encryption、refresh 和 account-linking UX 仍是 Host/product 工作。 |
| 真实 provider adapter profile，可能先做 Postgres | provider parity shape 已存在；具体 adapter pressure 还需要做。 |
| Install/fork governance UI | governance reasons 已存在；产品表面还需要构建。 |
| Signed artifact / provenance | cross-host marketplace claims 之前需要。 |
| Runtime Agent | 与 Build-phase Agent 正交；需要明确 End User job。 |
| Hot reload 和更丰富 open-ended artifact execution | 重要产品 lane，但当前证据基于 restart/preview。 |
| Pneuma 2.x dogfood | 最强 generality proof：把已有 modes 重建成 Creation Host profiles/templates。 |

## 8. 推荐分享节奏

| 时间 | 章节 | 目标 |
|---:|---|---|
| 0-5 min | 为什么存在 | 区分“使用软件”和“通过对话创造软件”。 |
| 5-12 min | 四制品 | 防止 “pneuma app” 术语坍缩。 |
| 12-20 min | 治理闭环 | 解释 authority separation，以及为什么企业治理是核心。 |
| 20-30 min | Primitive control plane | 把 primitives 映射到 UI、Agent tools、API、policy、history、runtime、source-change、release。 |
| 30-40 min | Demo A | 展示 Alice 的 Developer cognition path 和 Bob/Charlie/Dave outcomes。 |
| 40-50 min | Demo B | 展示 open-ended app pressure。 |
| 50-57 min | Walkthrough C | 解释 M26-M29 为真实下游 Host 补了什么。 |
| 57-60 min | Boundary | 对齐下一条 post-RC lane 要证明什么。 |

讲解规则：

- 从问题开始，不从 ADR 编号开始。
- 用 “Builder changes app capability”，不要用 “Agent edits code”。
- 先展示 End User app，再展示 inspectors。
- 展示 approval 时，明确 proposer、approver、executor、lane、receipt。
- 对 open-ended artifacts 保持精确：Host-owned、portable，但不是 framework definition rows。
- 最后落到下一条 lane decision，而不是泛泛列未来功能。

## 9. FAQ

### Pneuma 是网站构建器吗？

不是。网站构建器可以是某个 Creation Host 或 profile。Pneuma 是用于构建 Creation Hosts 的 framework layer；这些 Host 生成的 app 可以是 workflow tools、knowledge apps、internal SaaS modules、open-ended sites，或未来的 Pneuma 2.x modes。

### Agent 可以直接改生产软件吗？

不可以。预期契约是 proposal、impact/diff disclosure、approval、scoped authority、framework 或 Host-lane execution、evidence、rollback/recovery。M17 关闭了关键 runtime bypass；M26-M29 澄清了 source-change 和 backend-turn lanes。

### 为什么不直接让 Agent 改文件？

因为直接文件修改会让 UI action、Agent tool-call、policy、approval evidence、audit history、rollback、release semantics 彼此分裂。Code Change Lane 仍允许 source changes，但它必须先作为 draft evidence 进入 governed approval/apply path。

### 为什么现在不支持所有数据库、vector store、deployment target 和 runtime？

因为 framework semantics 不应该和 implementation choices 混在一起。Provider 和 deployment options 只有在具体 pressure 证明 shared shape 之后，才应该进入 framework contract。

### 这是生产级企业安全了吗？

不是。framework 已经有正确的 authority shape 和 local/runtime hardening evidence，但 production IAM、tenant administration、secret management、retention、assignment、hosted governance workflows 都是后续 productization work。

### 什么会构成下一个 release tag 的理由？

选定一条 post-RC lane，完成 executable evidence、更新文档，并且没有新的顶层边界混淆。候选 lane 包括 credential broker/OAuth、provider profile pressure、install/fork governance UI、Runtime Agent、hot reload/custom code，或 Pneuma 2.x dogfood。

## Appendix：Useful Links

- [从这里开始：构建 Creation Host](../developer/start-here.zh-CN.md)
- [Creation Host Model 中文版](./spec/creation-host-model.zh-CN.md)
- [Release Candidate Snapshot 中文版](./release-candidate-snapshot.zh-CN.md)
- [M25 Alice Creation Host Prototype Snapshot 中文版](./milestone-25-snapshot.zh-CN.md)
- [M26 Code Change Lane Hardening Snapshot 中文版](./milestone-26-snapshot.zh-CN.md)
- [M27 Runtime Diagnostic Surface Snapshot 中文版](./milestone-27-snapshot.zh-CN.md)
- [M28 HostExtension Slot Snapshot 中文版](./milestone-28-snapshot.zh-CN.md)
- [M29 AgentBackend runTurn Snapshot 中文版](./milestone-29-snapshot.zh-CN.md)
- [M31 Downstream Credential Adoption Snapshot 中文版](./milestone-31-snapshot.zh-CN.md)
- [M30 Host Credential Broker Snapshot 中文版](./milestone-30-snapshot.zh-CN.md)
- [ADR-0031: Open-ended definition artifact boundary](./adr/0031-open-ended-definition-artifact-boundary.md)
- [ADR-0034: Code Change Lane executor](./adr/0034-code-change-lane-executor.md)
- [ADR-0035: HostExtension Slot Contract](./adr/0035-host-extension-slot-contract.md)
- [ADR-0037: Host Credential Broker Utilities](./adr/0037-host-credential-broker-utilities.md)
- [ADR-0036: AgentBackend runTurn](./adr/0036-agent-backend-run-turn.md)
- [BuildThread Guide 中文版](../developer/build-thread.zh-CN.md)
- [Code Change Lane Guide 中文版](../developer/code-change-lane.zh-CN.md)
- [HostExtension Slots Guide 中文版](../developer/host-extension-slots.zh-CN.md)
- [Runtime Composition Guide 中文版](../developer/runtime-composition.zh-CN.md)
