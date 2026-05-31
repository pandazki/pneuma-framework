# Milestone 41 Snapshot：企业治理领域模型 v0

**状态：** 已关闭  
**日期：** 2026-05-12  
**English version:** [milestone-41-snapshot.md](./milestone-41-snapshot.md)

## 发生了什么

M41 引入了第一版 framework-level enterprise governance 词汇，用于 Builder + Build Agent 业务变更。

新 contract 很小，并且是确定性的：

```text
BuildChangeGovernancePolicy
BuildChangeGovernanceRequest
BuildChangeGovernanceDecision
GovernanceRoleAssignment
```

## 证明了什么

- Reviewer approval 可以满足标准 source/additive changes。
- Builder self-approval 不能满足 required review。
- Destructive、policy、migration、credential-boundary risks 会路由到 owner-level approval。
- Operator 默认不能批准业务变更。
- Denial 会阻断 route。
- App mismatch 和 invalid policy fail closed。

## 为什么重要

企业治理现在不再只是“存在 approval”。一个 Build Change 可以携带 route decision，说明：

- 哪条 route 生效；
- 需要哪些 roles；
- 谁满足了这些 roles；
- 还缺哪些 roles；
- 为什么允许或阻止 change；
- 哪些 evidence refs 支撑 decision。

## 非声明

M41 不实现：

- identity provider integration；
- admin UI；
- assignment queues；
- compliance retention；
- notification workflow；
- production audit backend。

这些仍然属于 Creation Host 或后续产品化。

## 验证

```bash
bun test packages/core/test/enterprise-governance.test.ts
```

结果：

```text
7 pass
0 fail
```

## 下一步

M42 应把这个 decision 接入 Build Assurance，让缺少或拒绝 required governance approval 时阻止 publish readiness。
