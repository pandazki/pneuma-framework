# Milestone 32 Snapshot — Build Change Assurance v0

**日期：** 2026-05-09  
**状态：** 已作为 post-RC assurance primitive milestone 关闭。这不是 `pneuma-rc-0.1.4` release tag。  
**输入：** AI Build Assurance DDD review 要求项目继续锚定 Builder + Build Agent 的工程控制：意图不清、安全边界不明、checks 失败、destructive definition changes、rollback evidence、publish readiness。

## M32 证明了什么

M32 增加了第一个 framework-level value object，用来回答 assurance 问题：

```text
当 Builder 要求 Agent 修改一个 app 时，
它提出了什么，
展示了什么证据，
谁批准了它，
实际改变了什么，
哪里失败了，
Host 如何恢复？
```

新的 core primitive 是：

```text
BuildChangeAssuranceCase
  = identity + intent/scope summaries
  + risk classification
  + readiness
  + evidence refs
  + blocking reasons
  + rollback / migration notes
```

它引用已有 framework evidence，不复制日志：

```text
BuildThread turn
Permission ledger record
Code Change receipt
Definition history
Runtime health
Release rollout
Host check
```

## Readiness Rules

第一版 evaluator 刻意保持窄范围：

| 场景 | Readiness |
|---|---|
| Builder intent 不清楚 | `needs_clarification` |
| `pre_proposal` 或 `pre_apply` check 失败 | `blocked` |
| destructive definition risk 缺少 explicit impact disclosure | `blocked` |
| approved + applied + `post_apply` check 通过 | `verified` |
| verified + release checks 通过 | `ready_to_publish` |
| post-apply 失败但存在 rollback evidence | `failed_recovered` |

这不是泛化 artifact-trust 或 marketplace audit 功能。它是 Creation Host 判断一个 Builder/Agent change 应该 clarify、stop、apply、publish 还是 recover 所需的最小共享语言。

## Developer Surface

新的 core exports：

```ts
assessBuildChangeReadiness(input)
createBuildChangeAssuranceCase(input)
validateBuildChangeAssuranceCase(case)
```

新的 developer guide：

- [Build Change Assurance](../developer/build-assurance.md)
- [中文版](../developer/build-assurance.zh-CN.md)

## Verification

Targeted command：

```bash
bun test packages/core/test/build-assurance.test.ts
```

Targeted result：

- `7 pass`，`0 fail`，`17 expect() calls`。

测试覆盖：

- intent 不清楚 -> clarification；
- pre-proposal check 失败 -> blocked；
- destructive definition 没有 impact -> blocked；
- approved/applied/post-check passed -> verified；
- release checks passed -> ready to publish；
- post-apply 失败但有 rollback evidence -> failed recovered；
- evidence refs 和必填 identity fields 的 validation。

## Boundary

M32 刻意不持久化 assurance cases、不实现 Host UI、不强制 publish policy，也不打 release tag。Host 仍然拥有产品 policy：

```text
framework says: readiness = ready_to_publish
Host decides: show Publish, require extra approval, or wait for more checks
```

下一条有价值的路线，是把这个 primitive 接进 reference Host flow，让 Builder 在 proposal、approval、execution receipt、preview checks 和 publish controls 旁边看到一张 assurance card。
