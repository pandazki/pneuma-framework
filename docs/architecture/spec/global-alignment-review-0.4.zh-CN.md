# Global Alignment Review 0.4

**状态：** M45-M52 之后的当前顶层模型快照。
**日期：** 2026-05-28
**英文版：** [global-alignment-review-0.4.md](./global-alignment-review-0.4.md)

## 目的

这份 review 回答一个问题：

> 经过 Host Kit、产品型 Creation Host 压力样本、Workflow App Studio、真实 Codex code-agent source change、Agent Debug Loop，以及 production Generated App scaffold profile 之后，Pneuma 是否仍然和原始目标对齐？

答案是：是，而且 implementation boundary 更清楚了：

```text
pneuma-framework 不是 Creation Host 产品本身。
pneuma-framework 是 implementation framework，
让 Developer 可以构建 Creation Host，
让 Builder 可以安全地用 Build-phase Agent 创建和演进 Generated Application。
```

## 当前 North Star

`pneuma-framework` 的目标，是帮助 Developer 构建 Creation Host。Builder 在 Creation Host 中通过和 Build-phase Agent 对话，创建和演进 Generated Application。Framework 通过 source boundary、draft workspace、checks、proposal evidence、approval、deterministic apply、preview、publish、runtime/data receipts 和 recovery，收束 AI coding 的不确定性。

目标比早期更具体了。前面的 milestones 证明了 vocabulary 和 governance contracts；M45-M52 证明这些 contracts 可以被组装进可执行的 Host loop、产品型 example，以及 Developer-authored production stack profile。

## 四层模型

顶层模型没有改变：

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

| 层 | M52 之后的当前职责 | 不能吸收什么 |
|---|---|---|
| **Framework** | Shared primitives、contracts、validators、evidence vocabulary、AgentBackend contracts、BuildThread、Code Change Lane、Agent Debug Loop、Host Kit helpers。 | Host product UX、真实 provider implementations、hosted identity、cloud deployment control plane。 |
| **Creation Host** | Builder-facing product、stack/profile choices、prompt/domain tools、generated-source layout、preview/publish UX、provider wiring、真实 credentials、policy decisions。 | 绕过 approval、checks、evidence、rollback 的隐藏通道。 |
| **Generated Application** | App definition/source boundary、data、versions、BuildThread-linked change history、published candidates。 | Host-wide marketplace、identity、global preferences。 |
| **Published Application** | 某个 selected version 的 End User runtime。 | Build-time authority 或 framework-internal mutation powers。 |

M45-M52 让这个边界更可落地：framework 可以提供 implementation parts，但 Creation Host 仍然是产品，stack/profile 选择仍然属于 Developer。

## M45-M52 为模型增加了什么

| Milestone band | 证明了什么 |
|---|---|
| **M45** | Host Kit 可以封装常见 implementation pieces，同时不把一个 reference Host 变成 framework。 |
| **M46-M47** | 一个产品型 Creation Host 可以 create、evolve、approve、preview、publish、share、fork、rollback，并暴露 Published Application use。 |
| **M48** | Workflow App Studio 成为更干净的真实产品线；Codex app-server 是默认真实 code-agent lane，用来修改受控 `src/app.ts`。 |
| **M49** | Agent Debug Loop 属于 proposal 创建之前：failed checks 反馈给下一次尝试，失败 draft 不会进入 Builder approval prompt。 |
| **M50** | Creation Host example 必须通过 UX 教会产品模型：Builder/App separation、lifecycle state、progress/log visibility、preview/publish separation。 |
| **M51** | 这条线已经可验证、可归档：typecheck、combined tests、真实 Codex browser E2E、architecture/developer docs 同步完成。 |
| **M52** | Alice 作为 Developer 的角色更清晰了：先准备并验证 production Generated App profile，再让 Creation Host 把它交给 code agent 演进。 |

## 更新后的 Governed Build Loop

M44 已经描述了贯穿 runtime/data outcome 的 governed creation path。M49-M51 把前半段变得更清楚：

```text
Builder intent
  -> BuildThread user turn
  -> code agent 修改 draft workspace
  -> Developer 声明的 checks 执行
  -> failed checks 成为 agent feedback
  -> 通过检查的 draft 进入 proposal evidence
  -> Builder 批准一个完整 proposal
  -> Code Change Lane 执行确定性 apply
  -> post-apply checks 和 rollback evidence
  -> preview data rehearsal
  -> publish or block
  -> runtime/data receipt
  -> 如果需要修复，进入 corrective proposal
```

现在有两条规则已经明确：

1. **Proposal 是通过检查的候选，不是 raw agent draft。**
2. **Post-apply repair 是新 proposal，不是 agent 静默继续修。**

这是当前 AI Build Assurance 的中心。

## M52 之后的 Domain Map

| Domain | 当前问题 | Framework 负责 | Host 负责 |
|---|---|---|---|
| **Creation Host implementation** | Developer 如何不用重写 common glue 就组装完整 loop？ | Host Kit helpers：approval、code change、runtime/data、publish、code-agent attempts。 | Product UX、profiles、provider wiring、storage layout、policy choices。 |
| **Agent coding** | Build-phase Agent 如何安全修改？ | AgentBackend contracts、BuildThread、Agent Debug Loop、Code Change Lane evidence。 | Prompting、domain tool surface、scaffold source shape、具体 code checks。 |
| **Proposal and approval** | Builder 到底在批准什么？ | Review packets、proposal evidence、approval records、execution receipts。 | 面向人的文案、business policy、route selection、产品级 impact summary。 |
| **Runtime/data** | Approval 之后，数据和运行版本发生了什么？ | Runtime/Data Governance vocabulary、receipts、publish gates。 | Data evolution handlers、migrations、provider APIs、真实 backups/restore。 |
| **Published use** | 发布后的 generated app 是否像真实 app 一样工作？ | 让 published version 和 evidence 可检查的 contracts。 | Runtime UI、interaction design、app-specific data model and behavior。 |
| **Developer explanation** | 新 Developer 能否理解什么放在哪里？ | Start Here、architecture index、domain docs、snapshots、contracts。 | Host-specific docs 和 onboarding。 |

## 健康度判断

| 区域 | 健康度 | 原因 |
|---|---|---|
| 四层模型 | 健康 | M45-M52 强化了 implementation layer，但没有把 Host product 折叠进 framework。 |
| Build-phase Agent control | 健康 | Debug loop 已经在 proposal 之前；失败 draft 不进入 approval。 |
| Example quality | 改善中 | Workflow App Studio 比之前 demo-shaped hosts 更清晰，但 generated-runtime breadth 仍然窄。 |
| Developer implementation path | 改善中 | Host Kit 提供 reusable parts；文档需要持续把 Developer 引导到 Host-owned product choices。 |
| Production stack profile | 改善中 | M52 证明了一个具体 Bun/Hono/React/Drizzle/Zod/Neon scaffold，并覆盖 Docker/Vercel targets，同时这些选型仍然是 Host-owned。 |
| Enterprise-governance alignment | 健康但早期 | Role-route 和 assurance concepts 仍然成立；production IAM/workflow backends 仍明确 Host-owned。 |
| Production claim | 有意克制 | 当前证明的是 local/reference implementation framework，不是 hosted enterprise platform。 |

## 变得更清楚的事

- 项目已经不只是抽象 contracts，现在有 implementation-framework lane。
- Host Kit 只有在保持为 kit 时才有价值，不能变成隐藏 product template。
- 真实 code-agent support 必须包含 approval 前的 debug loop。
- 好的 Creation Host example 必须在 UI 里显式展示 Builder/App/Published App 分离。
- Backend-specific event shapes 不能长期泄漏进 product model。
- Generated-runtime source editing 有价值，但 scaffold boundary 必须显式。
- Production stack profiles 应该先由 Developer 准备和测试，再成为 Builder 可以选择的 Host option。

## 什么会造成偏移

除非未来明确决策提升，否则避免这些方向：

- 把 Workflow App Studio 当成唯一合法 Creation Host shape；
- 把 Host Kit 做成完整 hosted platform；
- 允许 Build-phase Agent 越过声明过的 scaffold boundaries；
- 让 Builder 审批 raw、unchecked agent draft；
- approval 之后让 agent 静默修复；
- 把 provider SDK、真实 credentials、cloud deployment orchestration 移进 framework core；
- 把 product demo polish 当成 production readiness。

## 下一阶段 Runway

下一批 0.4.x 工作应该从明确的 productization lanes 中选择：

1. **Post-apply deterministic recovery hardening**：更强的 failure receipts、rollback evidence、corrective-proposal handoff。
2. **Backend-neutral progress events**：在 Codex app-server、opencode 和未来 backends 之上提供同一套 product-facing progress contract。
3. **Broader generated-runtime code support**：更强表达力的 scaffold boundaries 和 checks，但不进入无限制 app editing。
4. **Deployment/profile adapters**：local/Docker/cloud adapters 作为 Host-owned profiles，而不是 framework deployment semantics。
5. **Fresh downstream validation**：新的 Developer 从 docs 和 packages 出发构建 Host，并提交 gaps。
6. **M52 profile integration**：把 production scaffold 接入完整 Creation Host 路径，覆盖 code-agent edits、proposal、preview、publish 和 rollback。

## 决策

项目仍然和原始目标对齐。M45-M52 改变的是证据层级，不是 north star：

```text
Make AI-assisted app creation governable enough that a Developer can build a real Creation Host
and an organization can trust the Builder + Build-phase Agent change process.
```

下一步默认不应该再加一层抽象 governance。更好的方向是：让 implementation framework 更难误用，也更容易通过真实 Creation Host 验证。
