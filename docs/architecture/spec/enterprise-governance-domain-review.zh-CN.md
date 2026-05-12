# 企业治理领域模型 Review

**状态：** RC 0.3.0 领域锚点，不是 ADR。  
**日期：** 2026-05-12  
**English version:** [enterprise-governance-domain-review.md](./enterprise-governance-domain-review.md)

## 目的

定义 Builder + Build Agent 业务功能变更的第一版企业治理词汇。

这份 review 建立在：

- [生产可用边界](./production-readiness-boundary.zh-CN.md)；
- [AI Build Assurance Domain Review 中文版](./ai-build-assurance-domain-review.zh-CN.md)；
- [Creation Host DDD Review 中文版](./creation-host-ddd-review.zh-CN.md)。

0.3.0 的声明很窄：

```text
一个通过 Builder + Build Agent 创建的业务变更，可以在 publish-ready 之前进入最小企业 review。
```

framework 应提供确定性的治理词汇和 evaluator。它不应变成托管身份系统、审批工作流产品、合规后台或 provider marketplace。

## 防漂移声明

Pneuma 里的企业治理不是“加一个管理员页面”。

它是 AI 辅助软件创建过程中的控制循环：

```text
intent -> proposal -> review packet -> approval route -> execution -> verification -> publish / recovery
```

价值在于：一个非专家 Builder 可以要求 Agent 构建软件，同时组织仍然能回答：

- 谁提出了请求；
- 提议了什么；
- approval 时可见了哪些证据；
- 谁批准或拒绝；
- 为什么允许或阻止发布；
- 系统如何恢复。

## 角色词汇

| Role | 最小责任 | 不应意味着 |
|---|---|---|
| Builder | 提出业务变更并拥有产品意图。 | 自动成为受治理变更的可信 approver。 |
| Reviewer | 在 approval 前审查 packet、scope、risk 和 evidence。 | framework 托管用户账号。 |
| Owner | 对 app/workspace 负责，并拥有高风险 approval / rollback 权力。 | 脱离 Host policy 的全局 superuser。 |
| Operator | 观察 runtime/release health，并执行运维控制。 | 默认业务变更 approver。 |
| End User | 使用 Published Application。 | 默认参与 build-time governance。 |

这些角色是 framework governance vocabulary。Creation Host 负责把真实身份映射到这些角色。

## 第一批聚合候选

### BuildChangeGovernancePolicy

Identity：

```text
policy_id + app_id
```

拥有：

- role assignments；
- route definitions；
- risk-to-required-role mapping。

不变量：

- policy id 和 app id 必填；
- route id 唯一；
- role assignments 显式；
- 每条 route 至少包含一个 risk 和一个 required role。

### GovernanceRoleAssignment

Identity：

```text
subject + role
```

拥有：

- subject ref，例如 `user:bob`；
- role，例如 `reviewer`。

不变量：

- subject refs 是 Host 映射的身份；
- 重复 assignment 无效；
- framework 不负责认证 subject。

### BuildChangeGovernanceRoute

Identity：

```text
route_id
```

拥有：

- risk set；
- required roles。

不变量：

- 高风险变更不应被低风险 reviewer route 满足；
- route 选择必须确定性；
- route result 是 evidence，不是 workflow execution。

### BuildChangeGovernanceRequest

Identity：

```text
build_change_id
```

拥有：

- app id；
- builder subject；
- risks；
- evidence refs；
- approval 或 denial decisions。

不变量：

- request app id 必须匹配 policy app id；
- Builder self-approval 不满足 required review；
- denial 会阻断 route；
- 缺少 required roles 会阻断 route。

### BuildChangeGovernanceDecision

Identity：

```text
build_change_id + route_id + evaluation time
```

拥有：

- allowed / blocked result；
- reason code；
- required roles；
- missing roles；
- satisfied subjects；
- evidence refs。

不变量：

- 不读 Host UI state 也能解释结果；
- decision 里不能出现 raw approval token 或 secret；
- 可以作为 evidence 安全保存。

## 集成图

| Existing primitive | 企业治理如何接入 |
|---|---|
| BuildThread | 提供 intent/proposal/decision/receipt turn refs。 |
| Build Change Review Packet | 提供 approval-facing scope、risk、checks 和 recovery plan。 |
| Build Assurance | 把 governance decision 作为 publish/readiness blocker。 |
| Permission Ledger | 当 Host 把 route 接入 live prompts 时，可提供 durable approval evidence refs。 |
| Code Change Lane | 提供 source diff/check/apply/rollback evidence。 |
| Release Rollout | 只在 readiness 和 governance 都允许后发布。 |
| Sharing Governance | 保持独立：share/fork/install rights 是分发治理，不是 per-change build governance。 |

## 第一版 Evaluator 行为

第一版 framework evaluator 应回答：

```text
给定 policy 和 build-change request：
  -> 哪条 route 适用？
  -> 需要哪些 roles？
  -> 哪些 decisions 满足这些 roles？
  -> 是否允许这个 change？
  -> 如果被阻止，原因是什么？
```

必要行为：

- reviewer approval 可以满足标准 additive/source changes；
- Builder self-approval 不能满足 required review；
- destructive/policy/migration/credential-boundary risk 路由到 Owner；
- Operator 默认不能批准业务变更；
- 任意 denial 会阻断 route；
- app mismatch fail closed。

## Provider 边界

0.3.0 provider 压力应使用：

```text
GitHub public-read + mock Linear
```

governance model 不应知道 GitHub 或 Linear 特例。Provider data 只作为 evidence 或 generated-app content 出现。Provider capability 和 credential boundary 仍属于 Host/profile。

## 非声明

M41 不声明：

- hosted IAM；
- 真实 org directory；
- user invitation 或 team management；
- 完整 admin policy editor；
- workflow assignment queues；
- audit retention/export backend；
- provider authorization product。

## 决策

第一版 framework object 应是确定性 evaluator：

```text
BuildChangeGovernancePolicy
BuildChangeGovernanceRequest
BuildChangeGovernanceDecision
GovernanceRoleAssignment
```

这是能让 0.3.0 证明 enterprise-governed Build Change routing、同时不把 Creation Host 产品逻辑坍缩进 framework core 的最小 contract。
