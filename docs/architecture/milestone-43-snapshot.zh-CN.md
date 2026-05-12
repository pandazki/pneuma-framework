# Milestone 43 Snapshot：企业治理 Demo

**状态：** 已关闭  
**日期：** 2026-05-12  
**English version:** [milestone-43-snapshot.md](./milestone-43-snapshot.md)

## 发生了什么

M43 增加了 RC 0.3.0 企业治理故事的 reference demo：

```text
Builder proposes
  -> Builder self-approval is denied
  -> Reviewer approval allows
  -> Build Assurance reaches ready_to_publish
  -> Published app becomes active
  -> Owner rollback completes
```

## Provider 压力

这个 demo 不只有 mock：

- GitHub public-read 读取 `pandazki` 的真实 public repository data。
- Mock Linear 提供 deterministic enterprise planning data，形状接近 Linear workspace/team/project/issue/status/assignee。

这足以压力测试 provider boundary，同时不会把 0.3.0 变成 provider SDK milestone。

## 证明了什么

- M41 enterprise governance evaluator 可以把标准 source-code change 路由给 Reviewer。
- Builder self-approval fail closed。
- M42 Build Assurance publish readiness 在 governance allow 前保持 blocked。
- Published Application state 和 build-time governance state 是不同状态。
- Owner rollback 是独立于 Reviewer approval 的另一条 authority path。

## 验证

```bash
bun test examples/m43-enterprise-governance-demo/enterprise-governance.test.ts
bun run examples/m43-enterprise-governance-demo/run.ts
```

结果：

```text
4 pass
0 fail

m43 propose: awaiting reviewer
m43 self approval: denied
m43 reviewer approval: allowed
m43 publish: active
m43 rollback: completed
```

## 非声明

M43 不声明：

- production identity；
- production credential vaulting；
- 真实 Linear auth；
- assignment queues；
- compliance audit retention；
- hosted deployment；
- zero-downtime rollout。

## 下一步

M44 应把 0.3.0 故事整理进 release-candidate paperwork，更新 team-share/docs，并运行最终 verification gate。
