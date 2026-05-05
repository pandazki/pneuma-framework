# Milestone 21 快照：Developer Onboarding

**状态：** 已闭合。已完成 scaffold command、Host diagnostics、profile contract helpers、developer guides、M16/M18 smoke verification，以及 typecheck/full-suite verification。

**日期：** 2026-05-05

## 为什么需要 M21

M20 关闭了一个架构边界：open-ended UI/module artifacts 在 v0 是 Host-owned，不是 framework definition rows。

这让项目接近 candidate release，但还有一个开发者体验缺口：

> 新 Developer 可以读懂架构，但还没有一条从零开始创建第一个 Creation Host 的直路。

M21 关闭这个缺口。它不增加新的 primitive，而是把 M1-M20 的证据变成外部 Developer 可以走的路径。

## 改了什么

### 1. Golden Path Scaffold

CLI 现在支持：

```bash
pneuma-framework scaffold-host ./my-host --name "My Host"
```

scaffold 会创建：

```text
package.json
profiles.json
README.md
src/run.ts
```

它故意很小。它是 starter Host，不是 framework 偷偷提供的完整 app-builder 产品。

### 2. Host Diagnostics

CLI 现在支持：

```bash
pneuma-framework doctor-host --workspace ./workspace --profiles ./profiles.json
```

doctor command 会报告：

- profile contract validity；
- Host state presence；
- generated-app project/version counts；
- missing version directories；
- next steps。

### 3. Contract Test Helpers

`@pneuma-framework/core` 现在导出：

```ts
validateCreationHostProfileContract(profile)
assertCreationHostProfileContract(profile)
diagnoseCreationHostWorkspace({ workspace, profiles })
formatCreationHostDiagnosticsReport(report)
```

Developer 可以在自己的 Host repo 里加轻量 contract tests，不需要 import M16/M18 examples。

### 4. Developer Guides

新增文档：

- [Getting Started](../developer/getting-started.md)
- [Getting Started 中文版](../developer/getting-started.zh-CN.md)
- [Creation Host Contract](../developer/creation-host-contract.md)
- [Creation Host Contract 中文版](../developer/creation-host-contract.zh-CN.md)

它们解释实际路径：

```text
scaffold
  -> doctor
  -> study M16 schema-driven loop
  -> study M18 open-ended loop
  -> add profile contract tests
```

### 5. Published Runtime Health Hardening

最终 full-suite pass 暴露了一个既有的 M16/M14 readiness race：在 `service-ready` 之后，published runtime health under full-suite pressure 偶发从 `/healthz` 拿到 transient 404。

M21 增加了 regression test，并让 published runtime health checks 能容忍短暂 readiness lag。这属于 developer experience，因为 flaky publish/doctor path 会直接破坏 Developer 对 golden path 的信任。

## M21 证明了什么

M21 证明 framework 现在有了 developer-facing entry point：

```text
Developer 从内部 milestone history 之外进入
  -> 创建 starter Creation Host
  -> 校验 profile shape
  -> 诊断 workspace wiring
  -> 跑通 schema-driven 与 open-ended reference loops
```

这很重要，因为 Pneuma 的目标不只是 runtime，而是让 Developer 构建 Creation Host。如果 Developer 无法启动、检查、诊断 Host path，那么 release candidate 还不是真的可用。

## M21 没有证明什么

M21 不声称：

- production SaaS deployment；
- npm package publication；
- polished Hosted Creation Host product；
- Runtime Agent productization；
- hot reload；
- arbitrary open-ended artifact promotion into framework definition rows；
- broad Pneuma 2.x dogfood。

这些仍然属于 post-RC 或未来阶段。

## 验证证据

TDD red evidence：

```text
bun test packages/core/test/developer-experience.test.ts
-> 失败，因为 validateCreationHostProfileContract 尚未导出

bun test packages/cli/test/developer-experience.test.ts
-> 失败，因为 scaffold-host 和 doctor-host 还不是支持的 verbs
```

Focused green：

```text
bun test packages/core/test/developer-experience.test.ts packages/cli/test/developer-experience.test.ts
8 pass
0 fail
27 expect() calls
```

Core + Creation Host regression：

```text
bun test packages/core/test/developer-experience.test.ts packages/core/test/creation-host.test.ts
7 pass
0 fail
27 expect() calls
```

CLI regression：

```text
bun test packages/cli/test/developer-experience.test.ts packages/cli/test/parse-args.test.ts packages/cli/test/e2e.test.ts
21 pass
0 fail
38 expect() calls
```

M16 smoke：

```text
bun run examples/m16-reference-creation-host/run.ts --port 0 --smoke-exit
knowledge inbox preview + inspect: passed
evolution approval: completed with 3 priority rows
publish v1: active team-knowledge-inbox-v1 previous team-knowledge-inbox-v0
restart active: healthy
rollback: active team-knowledge-inbox-v0
team decision log preview + inspect: passed
smoke verification: passed
```

M18 smoke：

```text
bun run examples/m18-open-ended-personal-focus-site/run.ts --port 0 --smoke-exit
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

Published runtime race regression：

```text
bun test examples/m14-host-publish-rollout/published-runtime.test.ts examples/m16-reference-creation-host/run.test.ts
3 pass
0 fail
36 expect() calls
```

type-only CLI fix 后的 focused regression：

```text
bun test packages/cli/test/developer-experience.test.ts packages/cli/test/parse-args.test.ts packages/cli/test/e2e.test.ts packages/core/test/developer-experience.test.ts
25 pass
0 fail
84 expect() calls
```

Typecheck：

```text
bun run typecheck
exit 0
```

Docs link check：

```text
checked 140 markdown files
```

Diff whitespace check：

```text
git diff --check
exit 0
```

Full suite：

```text
bun test
1146 pass
0 fail
4294 expect() calls
Ran 1146 tests across 175 files. [69.95s]
```

## M21 之后的 RC 边界

RC decision 现在应该更窄：

```text
M21 code/docs/tests
  -> final static/full-suite verification
  -> docs link health
  -> decision: tag RC or identify one final blocker
```

除非产品方向明确变化，下一步不要扩大成 hot reload、Runtime Agent、hosted deployment 或 Pneuma 2.x dogfood。
