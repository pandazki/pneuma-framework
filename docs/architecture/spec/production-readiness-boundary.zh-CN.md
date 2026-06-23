# 生产可用边界

**状态：** 历史 / 基线文档。最初是 RC 0.3.0 的规划锚点（M40）；它界定的最小企业治理边界已在 M40-M43 交付，现已被 0.4.0 状态取代。  
**日期：** 2026-05-12  
**English version:** [production-readiness-boundary.md](./production-readiness-boundary.md)

> **基线文档。** 本文档锁定了后来成为 RC 0.3.0 / M40-M43 的最小生产边界，作为该边界的持久理由保留。当前 0.4.0 implementation-framework 状态请读 [Global Alignment Review 0.4](./global-alignment-review-0.4.zh-CN.md)、[release-0.4.0-notes](../release-0.4.0-notes.md) 和 [CHANGELOG.md](../../../CHANGELOG.md)。

## 目的

定义一个 Creation Host 如果想声明“企业可接受的 Builder + Build Agent 变更治理”，最小需要面对的生产边界。

这里的目标不是把 `pneuma-framework` 做成完整企业平台，而是澄清 framework 必须提供什么，才能让 Developer 构建一个 Creation Host：AI 辅助产生的业务功能变更有明确角色、责任、审查证据、审批路由、发布门禁和恢复路径。

## 非目标

这不是：

- 生产 IAM；
- 托管 secret vault；
- marketplace artifact 签名；
- 合规留存后台；
- 零停机部署；
- workflow engine；
- certified provider marketplace。

这些可以成为后续产品化层，但不是 `pneuma-rc-0.3.0` 的声明范围。

## 边界表

| 关注点 | Framework 必须提供 | Creation Host 必须提供 | 后续企业产品化 | 0.3.0 明确不做 |
|---|---|---|---|---|
| Identity | subject ref 词汇、role assignment contract、基于 subject 的 governance route evaluator。 | 真实登录、SSO、用户目录、org/team 映射、session 生命周期、账号恢复。 | SCIM、IdP sync、admin console、目录 reconciliation。 | framework 托管身份系统。 |
| Credential | no-secret refs、credential requirements、rebinding evidence、本地 / reference session 和 OAuth utilities。 | secret 存储、加密、轮换、refresh、provider account UX、credential revocation。 | vault adapters、rotation policy、provider refresh workers、access event audit retention。 | 把 raw secrets 存进 framework app data、share artifacts 或 evidence records。 |
| Approval | 通用 approval route evaluator、decision 词汇、evidence refs、Build Assurance 集成钩子。 | 产品 UI、通知、assignment、最终 policy 选择、真实用户到 approver role 的映射。 | SLA queues、delegated approval、escalation、substitution、bulk approval、admin policy editor。 | 完整 workflow engine。 |
| Audit | evidence ref 词汇、本地 durable case shape、decision/recovery terms、validation helpers。 | 存储后台、留存周期、导出策略、脱敏策略、tenant-specific access controls。 | compliance export、legal hold、immutable audit store、SIEM 集成。 | 托管 audit backend。 |
| Migration | migration-mode 词汇、backup/rollback evidence refs、release-readiness blockers。 | 真实 migration scripts、停机策略、backup 实现、restore procedure、数据 owner 沟通。 | 多租户 migration orchestration、online migration tooling、progressive rollout。 | 99.99% online migration 声明。 |
| Recovery | recovery readiness 词汇、recovery drill matrix shape、failed/recovered/unrecovered 状态、evidence refs。 | 产品 incident UI、operator playbooks、support workflow、restore 执行、客户沟通。 | automated repair routing、incident automation、长期 runbook 产品。 | 保证 cross-store ACID 或完美 rollback。 |
| Provider | capability contracts、provider-specialization boundary、no-secret provider evidence、provider parity test hooks。 | 真实 provider SDK、credentials、rate-limit 处理、data sync、provider UX、客户授权。 | certified provider marketplace、hosted connector management、provider SLA monitoring。 | provider-specific Build Agent branches。 |
| Release | release rollout state、health evidence vocabulary、publish blockers、restart/rollback helpers。 | deployment target integration、infra credentials、traffic policy、monitoring、rollback execution UX。 | multi-region rollout、canary routing、SLO policy、cloud control plane。 | 为所有云提供 production deploy platform abstraction。 |
| Concurrency | single-process guardrails、dirty-state blocking、stale proposal detection、明确 non-claims。 | hosted locks、database CAS、assignment ownership、multi-builder conflict UX。 | distributed lock service、collaborative editing workflow、conflict resolution product。 | 静默保证 multi-writer correctness。 |

## 0.3.0 最小声明

`pneuma-rc-0.3.0` 应该证明这个窄声明：

```text
一个 Builder 请求、Build Agent 提议的业务变更，可以在发布前进入最小企业治理流程。
```

最小流程是：

```text
Builder intent
  -> Build Agent proposal
  -> review packet + assurance case
  -> role-based approval route
  -> governed execution
  -> verification / publish gate
  -> rollback or recovery evidence
```

framework 应拥有词汇和确定性 evaluator。Host 应拥有产品界面、真实身份系统和 provider 集成。

## 角色边界

第一版企业词汇应保持很小：

| Role | 最小责任 | Framework 立场 |
|---|---|---|
| Builder | 提出变更，拥有产品意图。 | 可以发起 proposal，但不应满足高风险或受治理业务变更所需的 review。 |
| Reviewer | 在 approval 前审查 packet、risk、evidence 和 scope。 | 被 Host policy 指派时，可以满足标准 review route。 |
| Owner | 对 app/workspace 负责，可以批准高风险变更或 rollback。 | Host policy 允许时，可以满足 owner route 和 override path。 |
| Operator | 观察 runtime/release health，并执行运维动作。 | 可以 inspect 和 operate，但默认不能批准业务变更。 |
| End User | 使用 Published Application。 | 默认不参与 build-time governance。 |

这些是 framework governance roles，不是 framework 托管身份。Creation Host 负责把真实用户、团队、组织和 session 映射到这些角色。

## Provider 压力基线

0.3.0 不能只有 mock。

最小 provider 压力是：

```text
GitHub public-read
  -> 在可用时读取真实 public profile/repo/issue/PR-shaped data
  -> 最小路径不需要 OAuth

Mock Linear
  -> deterministic fixture，形状接近真实 Linear workspace/team/project/issue/status/assignee
```

这样 demo 足够真实，可以暴露 provider boundary，又不会让 production OAuth、secret vault 或 provider sync 成为 0.3.0 的中心。

## 场景说明

### Agent 写了 bug

Framework 责任：

- 保存 proposal 和 diff/check evidence；
- post-apply 或 release check 失败时阻止 publish；
- 保存 `failed_recovered` 或 `failed_unrecovered` 状态；
- 让 Host 能展示失败发生的位置。

Host 责任：

- 运行有意义的检查；
- 决定哪些检查对自己的 app/profile 是 required；
- 向 Builder/Reviewer/Owner 暴露失败和恢复路径。

### Agent 不必要地删除了 capability

Framework 责任：

- 分类 destructive 或 capability-removing risk；
- 对 destructive risk 要求更强审批路由；
- 保存 impact 和 evidence refs。

Host 责任：

- 在 review packet 里解释业务影响；
- 判断是否超出 Builder intent；
- 将高风险 approval 映射到 Owner 或等价角色。

### Builder 后悔批准

Framework 责任：

- 保存 decision 和 evidence；
- 支持 corrective proposal / rollback 词汇；
- 区分 unpublished discard、published rollback 和 irreversible migration limits。

Host 责任：

- 提供 corrective proposal 和 rollback 的产品 UX；
- 决定如何沟通数据或 migration 限制。

### Migration 需要停机

Framework 责任：

- 明确 migration mode；
- publish readiness 前要求 backup/restore 或 irreversible-migration evidence；
- 缺少 migration evidence 时阻止 publish。

Host 责任：

- 实现 migration scripts；
- 选择停机策略；
- 执行 backup/restore 并沟通运维影响。

### Reviewer 拒绝

Framework 责任：

- 把 denial 表示为一等 governance decision；
- 让 proposal、denial reason 和 evidence refs 可检查；
- 确保 denied proposal 不会执行。

Host 责任：

- 把拒绝反馈路由回 Builder/Agent；
- 决定下一步是 clarification、revised proposal 还是 discard。

### Rollback 失败

Framework 责任：

- 将失败记录为带 recovery evidence refs 的 `failed_unrecovered`；
- 防止模糊的 success claim；
- 让 prior approval 和 execution evidence 可检查。

Host 责任：

- 提供 operational runbook 和 support workflow；
- 决定是否需要 Owner/Operator escalation。

## 0.3.0 应进入 framework contract 的内容

可能进入 framework core 的 contract 是：

```text
BuildChangeGovernancePolicy
BuildChangeGovernanceRequest
BuildChangeGovernanceDecision
GovernanceRoleAssignment
```

这些应该是确定性的 validator/evaluator，而不是 workflow engine。

evaluator 应回答：

- 哪条 route 适用于这个 change；
- 需要哪些 roles；
- 哪些 decisions 满足 route；
- 为什么允许或阻止 publish/apply；
- 哪些 evidence refs 支撑这个 decision。

## 应保持 Host-owned 的内容

Creation Host 仍应拥有：

- 真实 login/authentication；
- org/team directory mapping；
- provider credentials 和 SDK；
- notification 和 assignment UX；
- admin console 和 policy editor；
- audit storage/retention/export；
- deployment adapter；
- incident response workflow。

## 决策规则

只把重复出现的 governance vocabulary 提升到 framework core。

不要提升：

- 某个 Host 的 UI；
- 某个 provider 的 SDK 形状；
- 某个 org 的 approval hierarchy；
- 某个 deployment target；
- 某个 audit storage backend。

0.3.0 应让企业治理可解释、可测试，但不把 Creation Host 产品逻辑坍缩进 framework。
