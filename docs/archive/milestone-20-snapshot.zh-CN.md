# Milestone 20 Snapshot：Open-Ended Definition Artifact Boundary

**日期：** 2026-05-05
**状态：** 已闭合：完成 ADR-0031、M18 executable boundary contract、M16/M18 focused verification、M16/M18 smoke verification 和 full test sweep
**读者：** 需要判断 Pneuma 是否可以进入最终 release-candidate decision 的团队成员
**范围：** 一个 pre-RC 边界：open-ended UI/module artifacts 到底是 Host-owned artifacts，还是 framework-governed definition rows。
**English version:** [Milestone 20 Snapshot](./milestone-20-snapshot.md)

## 摘要

M19 认为 repo 技术健康度已经接近 developer-facing release candidate，但 RC tag 被一个概念边界挡住：

> M18 证明 open-ended app creation 可以通过 Creation Host 跑通，但没有证明任意 UI/module artifacts 已经是 framework-governed definition rows。

M20 用 [ADR-0031](../architecture/adr/0031-open-ended-definition-artifact-boundary.md) 关闭这个边界。

已接受的决策：

```text
Open-ended UI/module artifacts 在 v0 是 Host-owned artifacts + Host-level approval。
它们可以使用 Host approval、transcript、inspection、release、restart、rollback evidence。
它们不是 framework definition rows。
它们不是 definition.apply_change_set artifacts。
```

这让 Pneuma 的 RC claim 保持精确：

```text
今天 framework-governed 的是：
  Table / Column / Operation / View / PolicyRule / PolicySetting / Rollback

v0 里 Host-governed 的是：
  routes / sections / style tokens / dynamic modules / profile-owned UI definition artifacts
```

## 为什么 M20 重要

M18 的 Personal Focus Site 是一个必要的压力测试，因为它不是另一个 inbox、decision log、table 或 queue。它使用：

```text
routes
sections
style tokens
dynamic GitHub attention module
```

这些 artifact 是真实 app definition，但它们和 `pneuma_tables`、`pneuma_operations`、`pneuma_views` 不是同一种 definition。

如果现在直接把它们提升到 framework core，风险是过拟合一个 site-shaped example。如果完全不区分，又会 overclaim governance。M20 选择了更稳的边界：

```text
Creation Host 可以拥有 open-ended artifacts。
framework 可以支持这些 artifact 周围的 Host evidence。
framework 还不标准化这些 artifact 的内部形状。
```

## 做了什么

| 区域 | 变化 |
|---|---|
| ADR | 新增 ADR-0031，作为 Host-owned open-ended artifacts 的 accepted source of truth。 |
| M18 executable contract | 在 Personal Focus Site definition module 中新增 `M18_OPEN_ENDED_DEFINITION_BOUNDARY`。 |
| Host profile metadata | M18 profile metadata 现在为 `site-definition.json` 声明 boundary。 |
| Inspect output | M18 Host inspection 现在返回 `definition_governance_boundary`。 |
| Transcript evidence | M18 evolution transcript 现在写明 `host.apply_open_ended_evolution`、`governance_scope: "host_approval"`，并显式标记 `framework_definition_rows: false`。 |
| Tests | 新增先失败后通过的测试，证明 M18 open-ended artifacts 是 Host-owned，不是 framework definition rows。 |
| Docs | 更新 README、PRODUCT、AGENTS、CLAUDE、roadmap、M18/M19 snapshots、team-share docs、architecture index、examples index。 |

## Executable Boundary Contract

M18 现在把 accepted boundary 暴露成数据：

```ts
{
  artifact_kind: "host_owned_open_ended_definition",
  artifact_path: "site-definition.json",
  governance_scope: "host_approval",
  host_operation: "host.apply_open_ended_evolution",
  framework_definition_rows: false,
  framework_definition_apply_change_set: false,
}
```

它出现在：

- `examples/m18-open-ended-personal-focus-site/site-definition.ts`
- M18 Host profile metadata
- M18 Host inspect output
- M18 evolution transcript
- M18 focused tests

## 验证报告

TDD red check：

```text
bun test examples/m18-open-ended-personal-focus-site/site-definition.test.ts \
  examples/m18-open-ended-personal-focus-site/run.test.ts

Expected failure:
  Export named 'M18_OPEN_ENDED_DEFINITION_BOUNDARY' not found
  inspected.inspection.definition_governance_boundary is missing
```

M18 focused tests：

```text
bun test examples/m18-open-ended-personal-focus-site

7 pass
0 fail
58 expect() calls
```

M16 regression：

```text
bun test examples/m16-reference-creation-host/run.test.ts

1 pass
0 fail
26 expect() calls
```

M18 smoke：

```text
bun run examples/m18-open-ended-personal-focus-site/run.ts --port 0 --smoke-exit

created generated app: pandazki-focus-site
preview + GitHub attention: passed
inspect UI definition: passed
evolution proposal: awaiting approval
evolution approval: completed
publish v0: active pandazki-focus-site-v0
publish v1: active pandazki-focus-site-v1 previous pandazki-focus-site-v0
restart active: healthy
rollback: active pandazki-focus-site-v0
smoke verification: passed
```

M16 smoke：

```text
bun run examples/m16-reference-creation-host/run.ts --port 0 --smoke-exit

created generated app: team-knowledge-inbox
knowledge inbox preview + inspect: passed
publish v0: active team-knowledge-inbox-v0
evolution proposal: v1 awaiting approval
evolution approval: completed with 3 priority rows
publish v1: active team-knowledge-inbox-v1 previous team-knowledge-inbox-v0
restart active: healthy
rollback: active team-knowledge-inbox-v0
created generated app: team-decision-log
team decision log preview + inspect: passed
smoke verification: passed
```

Full suite：

```text
bun test

1137 pass
0 fail
4263 expect() calls
Ran 1137 tests across 173 files. [72.72s]
```

## 证明了什么

| Claim | Evidence |
|---|---|
| M19 boundary 已被接受 | ADR-0031 选择 Host-owned artifacts + Host-level approval。 |
| M18 不再只靠文档说明 | boundary 出现在 code、inspect output、transcript 和 tests 中。 |
| Pneuma 没有 overclaim open-ended governance | contract 显式写 `framework_definition_rows: false`。 |
| Integrated Host path 仍然工作 | M16 regression 和 smoke 通过。 |
| Open-ended app path 仍然工作 | M18 tests 和 smoke 通过。 |
| Full suite 仍然健康 | `bun test` 通过 1137 个测试。 |

## 没有证明什么

M20 不声称：

- generic framework `Surface / Route / ComponentTree` primitive；
- `definition.apply_change_set` 支持任意 open-ended UI/module artifacts；
- open-ended artifact changes 的 hot reload；
- custom component distribution；
- production IAM 或 multi-tenant Host policy；
- production traffic switching 或 hosted deployment；
- published apps 内置 Runtime Agent。

这些仍然是未来 pressure lines。

## 下一步

下一步不再是 “decide M20”。M20 已经关闭。

下一步是：

```text
final release-candidate decision
  -> review M20 boundary and verification
  -> run final docs/index health check
  -> decide tag / no tag
```

如果没有新的顶层 primitive gap，项目可以进入 developer-facing release-candidate tag。
