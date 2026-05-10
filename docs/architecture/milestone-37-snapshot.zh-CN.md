# Milestone 37 Snapshot — Build Assurance Downstream Readiness

**日期：** 2026-05-10  
**状态：** 已作为当前 post-RC assurance lane 的 readiness checkpoint 关闭。这不是 `pneuma-rc-0.1.4` release tag。  
**输入：** M32-M36 已增加 Build Change Assurance cases、visible/durable Host state、approval-time review packets 和 recovery drill matrices。

## M37 证明了什么

M37 不增加新的 primitive。它把当前 assurance lane 整理成下游可阅读的采用路径：

```text
BuildThread
  -> Code Change Lane / definition / Host lanes
  -> Review Packet before approval
  -> Assurance Case after state transition
  -> durable Host store
  -> Recovery Drill Matrix in Host tests
```

关键变化是：

```text
下游 Developer 可以从 guide 直接采用 assurance loop，
而不是倒着读 milestone history。
```

## 顶层对齐 Review

M37 重新检查这条 lane 是否仍然符合不可破坏的模型：

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

结果：

- **Framework：** 拥有 vocabulary、value objects、validators、local/reference storage 和 testing helpers。
- **Creation Host：** 拥有 UI、product policy、guardrail commands、failure injection、migration implementation 和 production retention。
- **Generated Application：** 拥有 app definition、data、versions、source artifacts 和 build evidence references。
- **Published Application：** 消费被选中的 version；不是 Build Assurance cases 被 authored 的地方。

M32-M37 没有把 Pneuma 变成 marketplace artifact signing、hosted audit backend 或 generic compliance product。

## 更新后的 Developer 路径

新增 guide：

- [Build Assurance Adoption Guide](../developer/build-assurance-adoption.md)
- [中文版](../developer/build-assurance-adoption.zh-CN.md)

这份 guide 给下游 Developer 一条直接路径：

1. approval 前创建 review packet；
2. 状态转换后创建 assurance case；
3. 在 Creation Host workspace 中持久化 cases；
4. 为 negative paths 写 recovery drills。

## 当前 Assurance Surface

| Surface | 作用 |
|---|---|
| `BuildChangeReviewPacket` | 一个 Builder intent 的 approval-time disclosure。 |
| `BuildChangeAssuranceCase` | proposal、execution、publish、failure 或 rollback 后的 durable readiness/risk/evidence state。 |
| `BuildChangeAssuranceCaseStore` | local/reference Creation Host persistence。 |
| `BuildChangeRecoveryDrillScenario` | Host tests 里对预期失败路径的压力测试。 |

## 验证

最终命令：

```bash
bun test packages/core/test/build-assurance.test.ts \
  packages/core/test/build-assurance-review-packet.test.ts \
  packages/core/test/build-assurance-store.test.ts \
  packages/core/test/build-assurance-recovery-drill.test.ts

bun test examples/m16-reference-creation-host/run.test.ts
bun run typecheck
bun test
git diff --check
```

最终结果：

- focused assurance suite：`19 pass`，`0 fail`，`43 expect() calls`；
- M16 E2E：`1 pass`，`0 fail`，`39 expect() calls`；
- typecheck：通过；
- full suite：`1274 pass`，`0 fail`，`4745 expect() calls`。

## 剩余产品工作

这个 checkpoint 已经足够健康，可以启动下一轮 downstream-from-zero validation。它仍然不声明：

- production IAM；
- hosted audit retention；
- online migration；
- broad deployment adapters；
- Runtime Agent productization；
- marketplace artifact authenticity。

下一轮下游验证应该测试：一个新的 Developer 是否可以不按时间顺序阅读 M32-M36，只靠 adoption guide 和 canonical docs 建出使用 assurance loop 的 Creation Host。
