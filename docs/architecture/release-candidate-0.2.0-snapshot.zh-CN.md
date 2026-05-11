# Release Candidate Snapshot：pneuma-rc-0.2.0

**状态：** release-candidate gate 已通过；只有最终 owner 确认后才打 tag  
**English version:** [release-candidate-0.2.0-snapshot.md](./release-candidate-0.2.0-snapshot.md)  
**上一版 patch：** [pneuma-rc-0.1.3 Code Change Lane 升级指南](../developer/upgrading-to-rc-0.1.3.zh-CN.md)

`pneuma-rc-0.2.0` 是 post-RC stabilization lane 之后的第一个版本化收拢。

它不是新的产品方向。它把当前 Developer-facing contract 打包起来，让一个全新的下游 Creation Host 可以本地安装 framework、阅读当前 guides、采用 Builder + Build Agent assurance loop，并报告真实 framework gaps。

## 决策

准备把 RC 0.2.0 作为 **developer-contract release train**：

- 将 M26-M37 收拢成一个有版本号的 contract；
- 四层模型保持不变；
- Creation Host 的产品选择继续属于 Host；
- 把 local package consumption 变成显式 test gate；
- 更新下游升级指南和 canonical entry docs；
- tag 创建推迟到最终 verification report 被 owner 接受之后。

## 0.2.0 收拢了什么

| 领域 | 已进入 0.2.0 developer contract 的内容 |
|---|---|
| Code Change Lane | 围绕 draft source workspace 的 proposal/apply/reject flow 已加固。 |
| Runtime composition | 显式 runtime mode、health/diagnostic composition、marker helpers、request fallthrough helpers、readiness waiting。 |
| HostExtension slots | Portable Host-owned artifact contribution boundary，带 fail-closed validation。 |
| Agent backend turns | 基于 BuildThread source-of-truth turns 的 `AgentBackend.runTurn`。 |
| Credential utilities | Session cookie hashing、OAuth state、callback binding、credential refs、no-secret rebinding evidence、provider-shaped test helpers。 |
| Build Assurance | Review packets、assurance cases、durable case store、recovery drill matrix 和 adoption guide。 |
| Package boundary | Developer-facing packages 使用本地可消费的 `file:` internal dependencies，并加入 repo-external smoke gate。 |

## Package Consumption Gate

新增 gate：

```bash
bun run test:package-consumption
```

它会创建一个全新的临时下游项目，通过 `file:` path 安装：

```text
@pneuma-framework/core-domain
@pneuma-framework/core
@pneuma-framework/runtime
@pneuma-framework/cli
```

这些 package 来自一份没有 monorepo `node_modules` 的 isolated package directory copy。随后测试会 import focused public subpaths，运行 `scaffold-host`、运行 `doctor-host`、运行 smoke program，并 typecheck consumer project。

这个测试存在的原因是：fresh downstream projects 应该因为真实 framework contract 问题而失败，而不是因为 monorepo-only dependency 假设失败。

## 本 release train 采纳了什么

已采纳：

- M26-M37 不再只是 chronological milestone evidence，而是当前 Developer contract 的一部分。
- developer-facing package manifests 不再要求下游通过 `workspace:*` 才能本地外部消费。
- 带 provider 名称的 BuildThread packing helpers 只作为 deprecated compatibility 保留；core 路径是 provider-neutral `packBuildTurnsForRoleContent`。
- 下游升级路径写入 [Upgrading To RC 0.2.0](../developer/upgrading-to-rc-0.2.0.zh-CN.md)。

## 仍然不声称什么

RC 0.2.0 仍然不声称：

- production IAM；
- hosted audit 或 compliance retention；
- production credential vaulting；
- broad cloud deployment adapters；
- zero-downtime online migration；
- Runtime Agent productization；
- marketplace artifact signing 或 transport；
- 完整 Pneuma 2.x dogfood rebuild。

这个边界是刻意的。Pneuma 当前仍锚定在 Builder + Build Agent 工作流的企业级工程控制，而不是泛化的 artifact marketplace trust。

## Verification

2026-05-11 最终 verification：

```bash
bun run test:package-consumption
bun run typecheck
bun test
git diff --check
```

结果：

- package-consumption smoke：通过；全新的临时下游项目从 isolated package copy 通过 `file:` path 安装 `core-domain`、`core`、`runtime` 和 `cli`，导入 focused public subpaths，运行 `scaffold-host`、运行 `doctor-host`、执行 smoke，并完成 typecheck；
- typecheck：通过；
- full suite：`1280 pass`、`0 fail`、`4755 expect() calls`，覆盖 `194 files`；
- `git diff --check`：通过。

tag 仍是这份 verification report 之后单独的 owner decision。
