# Milestone 42 Snapshot：Governance-Gated Build Assurance

**状态：** 已关闭  
**日期：** 2026-05-12  
**English version:** [milestone-42-snapshot.md](./milestone-42-snapshot.md)

## 发生了什么

M42 把 M41 的企业治理 decision 接入 Build Assurance readiness。

`assessBuildChangeReadiness` 现在接受：

```ts
governance: {
  required: true,
  decision,
}
```

当 governance required 且 decision 未 allowed 时，readiness 会变成：

```text
blocked
blocking_reasons: ["governance_approval_missing"]
```

## 证明了什么

- 一个技术上健康的 change，如果缺少 required enterprise approval，不能进入 publish-ready。
- 一个 release checks 通过且 governance decision allowed 的 change，可以进入 `ready_to_publish`。
- Governance 保持为确定性的 decision input，而不是 workflow engine。

## 为什么重要

M42 之前，Build Assurance 可以说明一个 change 技术上准备好了。M42 之后，它也可以表达企业 review 是 publish gate。

这是第一次把下面三者具体连起来：

```text
enterprise role routing
  -> Build Assurance readiness
  -> release/publish decision
```

## 非声明

M42 不实现：

- identity provider integration；
- notification 或 assignment workflow；
- production audit retention；
- 完整 Permission Center 产品 UX；
- real provider authorization。

## 验证

```bash
bun test packages/core/test/build-assurance.test.ts packages/core/test/enterprise-governance.test.ts
```

结果：

```text
16 pass
0 fail
```

## 下一步

M43 应把它变成端到端 reference demo：

```text
Builder + Reviewer + Owner + Operator + End User
GitHub public-read + mock Linear
proposal -> review -> approve/deny -> publish -> rollback
```
