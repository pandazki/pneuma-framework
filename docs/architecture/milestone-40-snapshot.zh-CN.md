# Milestone 40 Snapshot：生产可用边界

**状态：** 已关闭  
**日期：** 2026-05-12  
**English version:** [milestone-40-snapshot.md](./milestone-40-snapshot.md)

## 发生了什么

M40 钉住了 `pneuma-rc-0.3.0` 线的生产可用边界。

项目现在明确：0.3.0 不是广义企业 SaaS 声明，而是针对 Builder + Build Agent 业务功能变更的最小企业治理声明。

## 证明了什么

- 0.3.0 的范围是最小企业治理，不是完整 production SaaS。
- Framework / Creation Host / 后续产品化 / 明确不做 的边界已经写清楚。
- provider 压力基线是 GitHub public-read + mock Linear。
- production readiness 被定义为 AI 辅助业务变更的工程控制，而不是 marketplace artifact trust。

## 边界摘要

framework 应提供：

- subject 和 role 词汇；
- 确定性 approval route evaluator；
- evidence refs；
- Build Assurance 集成点；
- migration/recovery/release readiness 词汇；
- provider capability boundary。

Creation Host 应提供：

- 真实 identity 和 org mapping；
- 产品 UI 和审批工作流；
- provider credentials 和 SDK；
- deployment 和 migration 执行；
- audit storage 和 retention policy；
- incident response 和 operator playbooks。

## 非声明

M40 不声明：

- production IAM；
- hosted credential vault；
- 完整 workflow engine；
- compliance retention backend；
- marketplace signing/provenance；
- zero-downtime migration；
- 完整 provider certification。

## 下一步

M41 应把这个边界变成第一版 framework-level enterprise governance 词汇：

```text
BuildChangeGovernancePolicy
BuildChangeGovernanceRequest
BuildChangeGovernanceDecision
GovernanceRoleAssignment
```

第一版实现应保持为确定性 evaluator，而不是产品 workflow engine。
