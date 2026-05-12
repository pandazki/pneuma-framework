# M43 企业治理 Demo

**状态：** canonical M43 demo  
**English version:** [README.md](./README.md)

这个 example 证明 `pneuma-rc-0.3.0` 的最小企业治理流程：

```text
Builder intent
  -> Build Agent proposal
  -> reviewer route
  -> Build Assurance publish gate
  -> published app
  -> owner rollback
```

它刻意保持为一个小型内存态 Creation Host demo。它不是 production IAM、workflow、audit、credential 或 provider-sync 系统。

## Provider 基线

0.3.0 不能只有 mock，所以这个 demo 使用：

| Provider | 形状 |
|---|---|
| GitHub | 真实 public-read API，读取 `pandazki` public repositories。不需要 OAuth。 |
| Linear | mock provider，但形状接近真实 Linear workspace/team/project/issue/status/assignee data。 |

governance model 不 special-case GitHub 或 Linear。Provider data 作为 app content 和 evidence pressure 出现。

## 角色

| Role | Subject | Demo 责任 |
|---|---|---|
| Builder | `user:bob` | 提出 Dev Activity Board 变更。Self-approval 会被拒绝。 |
| Reviewer | `user:rachel` | 批准标准 source/change risk。 |
| Owner | `user:olivia` | 可以 rollback。 |
| Operator | `user:otto` | 可以 inspect release/runtime state。 |
| End User | `user:erin` | 看到 Published Application board。 |

## 运行

```bash
bun test examples/m43-enterprise-governance-demo/enterprise-governance.test.ts
bun run examples/m43-enterprise-governance-demo/run.ts
```

期望输出：

```text
m43 propose: awaiting reviewer
m43 self approval: denied
m43 reviewer approval: allowed
m43 publish: active
m43 rollback: completed
```

打开浏览器 demo：

```bash
bun run examples/m43-enterprise-governance-demo/server.ts
```

然后打开打印出的 URL。

## 证明了什么

- 真实 public provider data 和 mock enterprise provider data 可以进入 governed generated-app proposal。
- Builder self-approval 不满足 enterprise review。
- Reviewer approval 可以满足标准 route。
- Build Assurance 在 governance allow 之前阻止 publish。
- End User 只看到 published app state。
- Owner rollback 产生明确状态变化。

## 不声明什么

- Production identity。
- Production credential storage。
- 真实 Linear auth。
- Assignment queues 或 notifications。
- Compliance audit retention。
- Hosted deployment 或 zero-downtime rollout。
