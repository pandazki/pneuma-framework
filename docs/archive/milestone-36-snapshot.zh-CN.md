# Milestone 36 Snapshot — Recovery Drill Matrix

**日期：** 2026-05-10  
**状态：** 已作为 post-RC assurance milestone 关闭。这不是 `pneuma-rc-0.1.4` release tag。  
**输入：** M35 让 approval-time disclosure 明确化。M36 关注 Host 如何证明预期失败路径不是一句“应该能恢复”的口头承诺。

## M36 证明了什么

M36 增加了 `BuildChangeRecoveryDrillScenario` 和 matrix evaluation：

```text
Expected failure path
  -> assurance case readiness
  -> required evidence refs
  -> passed / failed drill result
```

关键变化是：

```text
Failed-but-recovered 是工程控制成功，不只是一次坏运行。
```

## 产品边界

drill matrix 是 core helper，服务于 Host tests 和下游验证。它不复制日志、不实现生产 incident response、不替代 rollout，也不是 compliance backend。它只检查共享 assurance vocabulary：

- expected readiness；
- required evidence kinds；
- missing assurance cases；
- missing evidence references。

具体的失败注入和恢复实现仍然由 Host 拥有。

## 实现面

新增 core 文件：

- `packages/core/src/build-assurance-recovery.ts`
- `packages/core/test/build-assurance-recovery-drill.test.ts`

更新 exports：

- `packages/core/src/index.ts`

更新 guide：

- [Build Change Assurance](../developer/build-assurance.md)
- [中文版](../developer/build-assurance.zh-CN.md)

## Drill Shape

示例 scenario：

```ts
{
  id: "post-apply-rollback",
  title: "Post-apply check failure rolls back source",
  build_change_id: "change-1",
  failure_stage: "post_apply",
  simulated_failure: "preview smoke failed after apply",
  expected_readiness: "failed_recovered",
  required_evidence_kinds: ["code_change_receipt", "host_check"],
}
```

结果刻意保持很小：

```ts
{
  status: "passed" | "failed",
  readiness,
  missing_evidence_kinds,
  issues,
}
```

## 验证

目标命令：

```bash
bun test packages/core/test/build-assurance-recovery-drill.test.ts
```

目标结果：

- recovery drill matrix：`4 pass`，`0 fail`，`7 expect() calls`。

测试证明：

- expected readiness 和 evidence 会通过 drill；
- readiness 不符合预期会失败；
- 缺少 evidence kind 会给出明确 issue；
- matrix evaluation 能把 scenario 匹配到 case，并汇总 pass/fail。

## 剩余边界

M36 刻意不在 Reference Host UI 里制造一个 demo-only fake failure。正确的下一步是 M37：把 M32-M36 打包成下游可阅读的 adoption path，并用顶层产品模型做一次更广的 review。

