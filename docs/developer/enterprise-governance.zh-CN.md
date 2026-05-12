# 企业治理

**读者：** 构建多人 Builder + Agent 变更控制 Creation Host 的 Developer  
**English version:** [enterprise-governance.md](./enterprise-governance.md)

Enterprise Governance 是 framework 用来把 Build Change 路由到人类责任链的最小词汇。

它不是 IAM 系统、workflow engine、通知产品或 audit backend。

## 放在哪里

```text
Builder intent
  -> BuildThread proposal
  -> Build Change Review Packet
  -> BuildChangeGovernancePolicy
  -> BuildChangeGovernanceDecision
  -> Build Assurance readiness
  -> publish / rollback
```

Creation Host 把真实用户映射到 framework governance roles。framework 只负责评估 route。

## 角色

| Role | 常见 Host 映射 | 默认权力 |
|---|---|---|
| `builder` | 请求 Build Agent 修改 app 的用户。 | 可以请求和提出 proposal，但不能通过 self-approval 满足 required review。 |
| `reviewer` | 负责检查普通业务变更的队友。 | 当 policy 要求 reviewer 时，可以批准标准 additive/source changes。 |
| `owner` | Workspace/app owner。 | 可以批准 destructive definition、policy、migration、credential-boundary 等高风险变更。 |
| `operator` | Runtime/release operator。 | 可以 inspect 和 operate releases，但默认不能批准业务变更。 |
| `end_user` | Published app user。 | 默认没有 build-time governance 权力。 |

## 基础 Policy

```ts
import {
  evaluateBuildChangeGovernance,
  type BuildChangeGovernancePolicy,
} from "@pneuma-framework/core";

const policy: BuildChangeGovernancePolicy = {
  policy_id: "enterprise-minimum",
  app_id: "dev-board",
  role_assignments: [
    { subject: "user:bob", role: "builder" },
    { subject: "user:rachel", role: "reviewer" },
    { subject: "user:olivia", role: "owner" },
    { subject: "user:otto", role: "operator" },
  ],
  routes: [
    {
      route_id: "default-reviewer",
      risks: ["definition_additive", "source_code_change"],
      required_roles: ["reviewer"],
    },
    {
      route_id: "owner-for-high-risk",
      risks: ["destructive_definition", "policy_change", "data_migration", "credential_boundary"],
      required_roles: ["owner"],
    },
  ],
};
```

framework 不认证 `user:bob`。你的 Host 负责认证，并把稳定 subject refs 传入 framework contract。

## 评估一个变更

```ts
const decision = evaluateBuildChangeGovernance(policy, {
  app_id: "dev-board",
  build_change_id: "change-1",
  builder_subject: "user:bob",
  risks: ["source_code_change"],
  evidence_refs: [
    { kind: "build_thread_turn", thread_id: "thread-1", turn_id: "proposal-1" },
  ],
  decisions: [
    { subject: "user:rachel", decision: "approved", decided_at_ms: Date.now() },
  ],
});

if (!decision.allowed) {
  // 保持 publish blocked，并展示 decision.reason_code / missing_roles。
}
```

重要规则：

- Builder self-approval 会被忽略，不能满足 required review。
- 任意 denial 都会阻断 route。
- 高风险变更应路由到 owner-level approval。
- Operator approval 默认不满足 business change review，除非 Host 显式赋予其 approval role。

## 接入 Build Assurance

把 governance decision 传给 Build Assurance：

```ts
import { assessBuildChangeReadiness } from "@pneuma-framework/core";

const assessment = assessBuildChangeReadiness({
  intent_status: "clear",
  proposal_status: "proposed",
  approval_status: "approved",
  execution_status: "applied",
  risks: ["source_code_change"],
  checks: [
    { id: "smoke", phase: "post_apply", status: "passed", message: "Preview works." },
  ],
  release_checks: [
    { name: "health", status: "passed", at_ms: Date.now() },
  ],
  evidence_refs: [
    { kind: "host_check", check_id: "smoke", status: "passed" },
  ],
  governance: {
    required: true,
    decision,
  },
});
```

如果 `governance.required` 是 true，且 `decision.allowed` 不是 true，readiness 会变成：

```text
blocked
blocking_reasons: ["governance_approval_missing"]
```

这样 Host 不会误把一个技术上健康、但未通过企业 review 的 change 发布出去。

## Provider 压力基线

RC 0.3.0 demo 使用：

```text
GitHub public-read + mock Linear
```

Provider data 应作为 app content 或 evidence 出现。Build Agent 应面向 capability contracts 工作，而不是写 provider-specific branches，例如 “如果是 GitHub 就这样，如果是 Linear 就那样”。

## Host 责任

Host 仍然拥有：

- login 和 identity mapping；
- team/org directory；
- reviewer assignment UI；
- notifications；
- audit retention/export；
- provider credentials 和 SDK；
- production policy authoring；
- operator runbooks。

framework 只提供通用 route decision 和 readiness integration。

## 推荐产品流程

```text
1. Builder 请求一个变更。
2. Build Agent 提出 proposal，Host 创建 review packet。
3. Host 评估哪条 governance route 生效。
4. Reviewer 或 Owner approve/deny。
5. Host 把 decision 传给 Build Assurance。
6. checks 和 governance 都通过之前，publish 保持 blocked。
7. Owner/Operator 可以 inspect evidence，并在需要时 rollback/recover。
```

这是让 AI-assisted app evolution 具备企业讨论资格的最小产品循环。
