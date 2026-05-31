# Release Candidate Patch 快照：pneuma-rc-0.1.3

**状态：** accepted patch release  
**英文版：** [release-candidate-0.1.3-snapshot.md](./release-candidate-0.1.3-snapshot.md)  
**上一个 RC：** [pneuma-rc-0.1.2 BuildThread 升级指南](../developer/upgrading-to-rc-0.1.2.zh-CN.md)

`pneuma-rc-0.1.3` 是 `pneuma-rc-0.1.2` 之上的 additive Code Change Lane patch。

它不改变四层模型、Operation-first definition primitive、BuildThread transcript primitive 或 Scaffold Project contract。它让 Scaffold Project contract 对简单 Bun + TypeScript + JS Generated Application 变得足够可执行：前提是 Host 已经创建了 draft workspace。

## 决策

把 RC 0.1.3 作为 **code-change lane patch** 发布：

- 增加 `prepareCodeChangeProposal`；
- 增加 `applyCodeChangeProposal`；
- 计算 changed files、文本 diff、check evidence 和 base snapshots；
- `pre_proposal` 失败时在 approval 前 fail；
- mutation 前强制 `writable_roots`；
- mutation 前检测 stale source；
- mutation 前检测 proposal evidence 后发生的 draft changes；
- `post_apply` checks 失败时回滚 source files；
- 传入 store/thread 时 append BuildThread proposal / decision / receipt turns。

## 本 patch 采纳了什么

| Need | RC 0.1.3 处理 |
|---|---|
| 下游 Host 希望 code agent 改完 draft workspace 后由 framework 接手治理 | 在 `@pneuma-framework/core` 增加 Code Change Lane executor functions。 |
| Approval 必须是 proposal-level，而不是每个 file/tool 一个 prompt | `prepareCodeChangeProposal` 为一个 proposal 返回一个 evidence bundle。 |
| 坏 draft 不应该请求 approval | failed `pre_proposal` 在 Builder approval 前返回 `ok: false`。 |
| proposal evidence 生成后 source 可能被其他流程改掉 | `base-snapshot-unchanged` 在 mutation 前 fail。 |
| proposal evidence 被审批后 draft 可能又被改掉 | Draft snapshot comparison 在 mutation 前 fail。 |
| Agent 不能修改 framework/release 文件 | `protected-paths-unchanged` 和 apply-time writable-root enforcement 阻止 unsafe files。 |
| 文件复制后 post-apply checks 可能失败 | Executor 恢复 backup 并记录 `failed_validate_rolled_back`。 |
| conversation/evidence 应该可移植 | Executor 可以 append `agent_proposal`、`user_decision`、`host_execution_receipt` turns 到 BuildThread。 |

## 仍然属于 Host-owned 的部分

- draft workspace creation；
- code agent launch / opencode integration；
- approval UI；
- preview process 和 preview health endpoint；
- 产品特定 static analyzers；
- publish/release rollout。

这是刻意的边界。framework 拥有 lane semantics 和 evidence；Creation Host 拥有产品特定 execution surfaces。

## 新增开发者材料

- [Code Change Lane](../developer/code-change-lane.zh-CN.md)
- [下游升级指南](../developer/upgrading-to-rc-0.1.3.zh-CN.md)
- [ADR-0034](../architecture/adr/0034-code-change-lane-executor.md)

## 验证

2026-05-07 已验证：

```bash
bun test ./packages/core/test/code-change-lane.test.ts
bun run typecheck
bun test
```

结果：

- Code Change Lane targeted tests：6 pass。
- Typecheck：pass。
- Full suite：1217 pass，0 fail，4527 expect calls，覆盖 184 files。
