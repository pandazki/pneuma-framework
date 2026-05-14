# Global Alignment Review 0.3（中文版）

**状态：** M44 之后、进入下一阶段真正实现框架之前的当前顶层模型快照。  
**日期：** 2026-05-14  
**English version:** [global-alignment-review-0.3.md](./global-alignment-review-0.3.md)

## 目的

这次 review 回答一个问题：

> 在 Build Assurance、Enterprise Governance、Runtime / Data Governance 之后，Pneuma 是否仍然对齐最初目标？

答案需要足够明确，让下一阶段实现工作可以开始，而不必反复重新争论模型。

## 当前北极星

`pneuma-framework` 的目标是帮助 Developer 构建 Creation Host。Builder 在 Creation Host 里通过 Build-phase Agent 创建和演进 Generated Application，而 framework 通过 proposal、approval、evidence、verification、governance、publish、runtime/data outcome 和 recovery contracts，收束 AI 带来的不确定性。

这仍然是项目中心。词汇变多了，但顶层对象没有变。

## 四层模型

| 层级 | 拥有什么 | 不应该吞掉什么 |
|---|---|---|
| **Framework** | 共享 primitives、contracts、validators、semantic tools、evidence vocabulary、本地 / reference helpers。 | Host 产品 UX、provider SDK 实现、hosted identity、deployment control plane。 |
| **Creation Host** | Builder 产品表面、profiles、真实 provider wiring、credentials、preview/publish UX、policy choices。 | framework invariants，或绕过 approval/evidence 的隐藏通道。 |
| **Generated Application** | app definition、source/artifact boundary、data、versions、BuildThread、assurance cases。 | Host 级产品偏好或 marketplace concerns。 |
| **Published Application** | active release runtime 和 End User surface。 | build-time authority 或 framework-internal mutation privileges。 |

最重要的产品边界仍然是：

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

## 统一控制闭环

当前 framework 模型已经可以描述完整的受治理创造路径：

```text
Builder intent
  -> BuildThread
  -> Agent proposal
  -> review packet / impact / checks
  -> Builder or enterprise approval
  -> governed definition/code/host execution lane
  -> Build Assurance case
  -> Runtime Intent / Reconcile Attempt
  -> Runtime Observation / Data Evolution Receipt
  -> Runtime Control Receipt
  -> publish, rollback, corrective proposal, or blocked state
```

关键点是：这是一个可问责的控制闭环，而不是一堆互不相关的功能。

## 领域地图

| 领域 | 核心问题 | Framework 拥有 | Host 拥有 |
|---|---|---|---|
| **Creation** | 正在构建什么，通过哪个 Host/profile/session 构建？ | Creation Host contracts 和 diagnostics。 | 产品表面、project creation、profile choices。 |
| **Agent Loop** | Builder 问了什么，Agent 提议了什么？ | BuildThread 和 AgentBackend turn contract。 | Prompt、domain tools、conversation UX。 |
| **App Definition** | app capability 发生了什么变化？ | Operation、definition-as-data、policy/view/table contracts。 | 领域特定 app model 和 generated UI/API shape。 |
| **Code / Artifact** | source 或 open-ended artifact 发生了什么变化？ | Scaffold Project、Code Change Lane、HostExtension slots。 | source layout、guardrail commands、generated-app implementation。 |
| **Assurance** | change 是否可理解、边界清楚、已验证、可恢复？ | Build Change Assurance、review packets、recovery drills。 | evidence producers 和 product checks。 |
| **Enterprise Governance** | publish readiness 前需要哪个 human role 审批？ | role vocabulary、route evaluator、decision evidence。 | 真实身份、org mapping、notification/workflow UX。 |
| **Runtime / Data** | approval 后 runtime 和 provider data 实际发生了什么？ | runtime/data evidence contracts 和 data policy vocabulary。 | provider SDKs、migrations、backups、restore、process management。 |
| **Sharing / Forking** | artifact 能否无 secrets 移动，并安全 rebinding？ | share artifact、sharing governance、credential rebinding evidence。 | distribution product、access UX、真实 credential lifecycle。 |

## Application Governance 与 Data Governance

Application governance 和 data governance 相关，但不是同一个边界。

Application governance 回答：

```text
Builder 要 Agent 修改 app 的什么，
Agent 提议了什么，
谁批准了，
什么被改变了，
结果是否验证通过？
```

Data governance 回答：

```text
当这个 approved change 影响 runtime data 或 provider data 时，
期望的数据演进是什么，
哪个 runtime generation 被允许执行，
实际观察到了什么，
哪份 receipt 证明 migration、carry-forward、snapshot、restore 或 branch behavior？
```

两者关系是：

```text
Application governance 决定 change 是否可以推进。
Data governance 解释并约束这个决定之后 live 或 carried-forward data 发生什么。
```

这让 M44 仍然对齐项目目标。它没有把 Pneuma 变成通用 database governance platform。

## 关键不变量

1. Agent 通过 semantic tools 或 Host 声明的 domain tools 工作，而不是隐藏的 provider-specific branches。
2. 一个 Builder business intent 应该变成一个可 review 的 proposal，或者一个明确 clarification，而不是分散的无主 mutation。
3. Approval 必须绑定到 human 当时看到的完整 proposal evidence。
4. Framework-internal authority 不能从用户可控 HTTP header 或普通 End User runtime context 推导出来。
5. Provider capabilities 作为 contracts 声明；provider implementations 仍然由 Host 拥有。
6. 改变 active 或 carried-forward data 的 data evolution 必须有 evidence，尤其是 carry-forward、snapshot、restore、branch 或 irreversible migration receipts。
7. Failure 是一等状态：denied、blocked、failed-recovered、failed-unrecovered、rolled-back、stale、superseded 必须保持可区分。
8. 文档和示例可以使用 Bun、SQLite、Docker、GitHub、Linear、OpenRouter 或本地 version directories；这些都不是 framework semantics。

## 现在更清楚了什么

相比 M1，模型已经更具体：

- framework 不是“app generator”；它是 Creation Host 的 control plane；
- application/code governance 和 data governance 是两条协同的 evidence lane；
- enterprise governance 是围绕 AI-assisted business change 的 review routing，不是通用 admin product；
- provider abstraction 是 capability 和 evidence boundary，不是允许 Build Agent 对 provider 做特殊分支；
- 下一阶段应该在这些 contracts 之上构建真实 Host/runtime usability，而不是继续无限增加抽象 provider options。

## 什么会构成漂移

除非后续有明确产品决策，否则应避免这些方向：

- 把 Pneuma 做成 hosted IAM 或 workflow engine；
- 把 provider integration 变成 framework primitive；
- 在 Builder/Agent build safety 之前优先做 marketplace artifact signing；
- 没有真实 Host-owned identity、credentials、migration、monitoring 就声称 production readiness；
- 在 reference implementation 证明 coherent Developer workflow 之前无限扩展 adapters。

## 当前健康度判断

| 区域 | 健康度 | 理由 |
|---|---|---|
| 四层模型 | 健康 | M40-M44 增加了 governance 和 runtime/data contracts，但没有把 Host 或 provider implementation 坍缩进 framework core。 |
| Builder + Agent 控制闭环 | 健康 | BuildThread、review packets、Assurance、governance decisions 和 receipts 已经可以描述 intent 到 outcome。 |
| Provider boundary | 变好 | Provider Capability Matrix 和 Runtime/Data Governance 给出了更好的抽象，但仍需要真实 provider-backed pressure。 |
| Developer experience | 变好 | Start Here、Creation Host Contract、downstream briefs、upgrade guides 已经存在，但下一阶段需要真实 implementation framework，而不是更多孤立 contract。 |
| Production claim | 有意收窄 | framework 拥有 enterprise-governance vocabulary，不拥有 hosted enterprise infrastructure。 |

## 下一阶段实现跑道

下一阶段应该围绕已经稳定的 contracts，开始构建真正的实现框架：

1. Reference Creation Host runtime，把 BuildThread、Code Change Lane、Assurance、Enterprise Governance、Runtime / Data Governance 串成一个可见闭环。
2. 真实 provider-backed profile pressure，带 provider capability declarations 和 fail-closed evidence，但不允许 provider-special-case Agent behavior。
3. Published runtime/data lifecycle implementation，包括 migration/carry-forward receipt production 和 stale-generation rejection。
4. Developer-facing authoring experience，让 scaffold、profiles、agent package、provider matrix、governance policies 更容易创建和验证。
5. 当 implementation framework 可用之后，再做一次 zero-context downstream validation。

## 决策

项目仍然对齐原始目标。词汇扩展了，但中心没有移动：

```text
让 AI-assisted app creation 足够可治理，
使 Developer 可以构建真实 Creation Host，
组织也能信任 Builder + Build Agent 的 change process。
```

正确的下一步不是再加一层抽象 governance，而是构建一个端到端使用这些 contracts 的真实实现框架。
