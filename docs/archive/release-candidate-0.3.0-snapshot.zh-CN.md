# Release Candidate Snapshot: pneuma-rc-0.3.0

**状态：** release-candidate verification 已通过；tag 等待最终 owner 确认  
**日期：** 2026-05-12  
**English version:** [release-candidate-0.3.0-snapshot.md](./release-candidate-0.3.0-snapshot.md)  
**上一条 release train:** [pneuma-rc-0.2.0 snapshot](./release-candidate-0.2.0-snapshot.zh-CN.md)

`pneuma-rc-0.3.0` 是 package-consumable 0.2.0 developer contract 之后，第一条 enterprise-governance release train。

它不声称生产级企业安全已经完成。它打包的是最小 framework vocabulary 和证据，用来说明：

```text
一次 AI-assisted business change 拥有 role route、
review packet、
governance decision、
publish gate、
以及 recovery path。
```

## 决策

准备 RC 0.3.0 作为 **minimum enterprise governance release train**：

- 四层产品模型保持不变；
- identity、team directory、workflow assignment、credential vaulting、audit retention 仍由 Host 拥有；
- framework 提供 build-change governance 的 role / route / evaluator vocabulary；
- governance decision 接入 Build Change Assurance，让 publish readiness 可以 fail closed；
- 通过 reference demo 展示 Builder、Reviewer、Owner、Operator、End User 的职责分离；
- tag 创建等待最终 verification report 被 owner 接受。

## 0.3.0 证明了什么

| 领域 | 当前证明 |
|---|---|
| Production boundary | 项目有一条明确边界：0.3.0 证明治理控制，不声称 hosted enterprise SaaS 完成。 |
| Enterprise vocabulary | `builder`、`reviewer`、`owner`、`operator`、`end_user` 成为显式 governance roles；真实身份由 Host 映射。 |
| Governance routes | `BuildChangeGovernancePolicy` 可以把普通变更路由给 Reviewer，把高风险变更路由给 Owner。 |
| Fail-closed decisions | Builder self-approval 不能满足 required review；denial 会 block；app mismatch fail closed。 |
| Assurance integration | 当 governance required 且未 allowed 时，Build Assurance 阻止 `ready_to_publish`。 |
| Demo evidence | M43 demo 展示 proposal、self-approval denial、Reviewer approval、publish、End User usage、Owner rollback。 |
| Provider pressure | GitHub public-read + mock Linear 证明 provider data 可以作为内容 / evidence 参与，但 governance 不需要 provider-specific branches。 |

## 证据链

| Milestone | 证据 |
|---|---|
| [M40](./milestone-40-snapshot.zh-CN.md) | Production readiness boundary：0.3.0 要证明 governance control，而不是 hosted enterprise SaaS。 |
| [M41](./milestone-41-snapshot.zh-CN.md) | Enterprise governance evaluator：roles、routes、decisions、fail-closed semantics。 |
| [M42](./milestone-42-snapshot.zh-CN.md) | Build Assurance publish gate 消费 governance decisions。 |
| [M43](./milestone-43-snapshot.zh-CN.md) | 使用 GitHub public-read 和 mock Linear provider pressure 的端到端 enterprise governance demo。 |

Developer-facing guide：

- [Enterprise Governance 中文版](../developer/enterprise-governance.zh-CN.md)
- [Production Readiness Boundary 中文版](../architecture/spec/production-readiness-boundary.zh-CN.md)
- [Enterprise Governance Domain Review 中文版](../architecture/spec/enterprise-governance-domain-review.zh-CN.md)
- [M43 Enterprise Governance Demo 中文版](../../examples/m43-enterprise-governance-demo/README.zh-CN.md)

## 仍不声称什么

RC 0.3.0 仍不声称：

- hosted IAM；
- production credential vault；
- compliance retention 或 audit export backend；
- assignment queues 或 workflow engine；
- hosted notification system；
- marketplace artifact trust、signing 或 transport；
- full provider SDK certification；
- production Linear OAuth；
- production deployment platform；
- zero-downtime traffic switching 或 online migration。

这个边界是有意保留的。framework 加的是 Builder + Build Agent changes 的企业级工程控制，而不是一个 hosted governance product。

## Demo 路径

启动：

```bash
bun run examples/m43-enterprise-governance-demo/run.ts --port 8890
```

打开：

```text
http://127.0.0.1:8890/
```

预期故事：

```text
Builder proposes a Dev Board change
  -> Builder self-approval is denied
  -> Reviewer approval allows
  -> Build Assurance reaches ready_to_publish
  -> Published app becomes active for End User
  -> Owner can roll back
```

自动 smoke：

```bash
bun run examples/m43-enterprise-governance-demo/run.ts
```

预期输出：

```text
m43 propose: awaiting reviewer
m43 self approval: denied
m43 reviewer approval: allowed
m43 publish: active
m43 rollback: completed
```

## Verification

2026-05-12 最终 verification：

```bash
bun run typecheck
bun run test:package-consumption
bun test packages/core/test/enterprise-governance.test.ts packages/core/test/build-assurance.test.ts examples/m43-enterprise-governance-demo/enterprise-governance.test.ts
bun run examples/m43-enterprise-governance-demo/run.ts
git diff --check
bun test
```

结果：

- typecheck：通过；
- package-consumption：通过，并覆盖 focused `@pneuma-framework/core/enterprise-governance` subpath；
- targeted enterprise / build-assurance / demo tests：`20 pass`，`0 fail`；
- M43 runner：proposal、self-approval denial、Reviewer approval、publish、rollback 完成；
- `git diff --check`：通过；
- changed entry docs 的 markdown local-link check：通过；
- full suite：`1293 pass`，`0 fail`，`4772 expect() calls`，共 `196 files`。

Tagging 仍是这份 verification report 之后的独立 owner decision。
