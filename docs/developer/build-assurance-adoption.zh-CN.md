# Build Assurance Adoption Guide

**读者：** 正在把 Builder + Agent change assurance 接进 Creation Host 的下游 Developer  
**English version:** [build-assurance-adoption.md](./build-assurance-adoption.md)

这份指南是 M37 对 M32-M36 assurance primitives 的实际采用路径。前提是始终保留顶层产品模型：

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

Build Assurance 属于 **Creation Host** 的控制环。它帮助 Host 解释和治理 Builder 让 Build-phase Agent 发起的 change。它不是 marketplace trust ledger、package-signing system，也不是生产 compliance backend。

## 最小有用采用路径

先实现四步：

1. **approval 前创建 review packet。**

   当 Agent 已经提出了一个有边界的 change，并且 Host 准备请求 Builder allow 时，使用 `createBuildChangeReviewPacket`。

2. **每次状态转换后创建 assurance case。**

   在 proposal、approval、apply、verification、publish、failure 或 rollback 后，使用 `createBuildChangeAssuranceCase`。

3. **把 case 持久化在 Creation Host workspace。**

   local/reference Host 可以用 `createFileBuildChangeAssuranceCaseStore`。只有真的需要 hosted backend 时再替换 store。

4. **为 negative paths 写 recovery drills。**

   在测试里使用 `evaluateBuildChangeRecoveryDrillMatrix`，证明失败路径可见、可恢复，或者至少 fail closed。

## Approval-Time Packet

review packet 应该展示在 Allow/Deny 控件旁边，而不是藏在 diagnostics tab 里。

Builder 应该看到：

- 一个 intent summary；
- 一个说明“不包含什么”的 scope boundary；
- proposed changes by lane；
- risk classification；
- pre-proposal checks；
- recovery plan；
- 自动生成的 approval statement。

Host 产品规则：

```text
review-packet validation 失败时，不要请求 approval。
```

## Execution-Time Assurance Case

assurance case 是 Build Change 当前状态的 durable summary。它引用源证据，而不是复制日志。

它可以驱动：

- 为什么 Allow 可用或不可用；
- 为什么 Publish 可用或不可用；
- 为什么一次失败 change 被认为已经 recovered；
- 未来 reviewer 应该检查什么。

Host 产品规则：

```text
不要让 readiness 成为唯一事实来源。
底层 BuildThread、permission ledger、code-change receipt、
definition history、runtime health 和 rollout evidence 仍然必须可检查。
```

## Recovery Drills

drills 应该存在于 Host tests 里。至少证明：

| 场景 | 预期 evidence |
|---|---|
| pre-proposal guardrail 失败 | `blocked` readiness 和 host check evidence |
| post-apply verification 失败但 rollback 成功 | `failed_recovered`、code-change receipt、host check |
| release health 失败 | 不进入 `ready_to_publish`，并有 runtime health evidence |
| rollback 失败 | `failed_unrecovered` 和明确 blocking reason |

不要为了让 demo 看起来完整而制造假的 UI failure。drill 的价值在于它是对 Host implementation 的可执行压力测试。

## 哪些仍由 Host 拥有

framework 提供语言和 helpers。Host 仍然拥有：

- 真实 guardrail commands；
- 测试里的 failure injection；
- migration implementation 和 backup strategy；
- UI copy 和 approval workflow；
- 哪些 readiness state gate 哪些产品按钮；
- 生产 retention、assignment 和 audit storage。

## 推荐阅读顺序

如果要做完整的全新下游验证，请使用
[Downstream Validation Brief 中文版](./downstream-validation-brief.zh-CN.md)。
如果只接入 assurance lane，请按下面顺序阅读：

1. [Start Here 中文版](./start-here.zh-CN.md)
2. [BuildThread 中文版](./build-thread.zh-CN.md)
3. [Scaffold Project Contract 中文版](./scaffold-project-contract.zh-CN.md)
4. [Code Change Lane 中文版](./code-change-lane.zh-CN.md)
5. [Build Change Assurance 中文版](./build-assurance.zh-CN.md)
6. 这份指南

## Adoption Checklist

- [ ] 一个 Builder intent 对应一个 review packet。
- [ ] review packet 在 approval 前展示 scope boundary 和 recovery plan。
- [ ] pre-proposal checks 失败时阻止 approval。
- [ ] proposal、apply、publish、failure、rollback 后都保存 assurance case。
- [ ] evidence references 指向已有系统，而不是复制日志。
- [ ] Publish controls 消费 readiness，但产品 policy 仍由 Host 拥有。
- [ ] recovery drills 至少覆盖一个 recovered failure 和一个 fail-closed path。
- [ ] 产品文档明确说明 Build Assurance 不是 marketplace artifact trust。
