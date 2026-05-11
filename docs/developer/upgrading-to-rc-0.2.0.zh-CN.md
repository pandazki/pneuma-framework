# 下游 Host 升级到 pneuma-rc-0.2.0

**读者：** 当前使用 `pneuma-rc-0.1.3` 或 post-RC 本地 checkout 的下游 Creation Host 项目  
**English version:** [upgrading-to-rc-0.2.0.md](./upgrading-to-rc-0.2.0.md)

`pneuma-rc-0.2.0` 是第一个 post-assurance release train。它把 M26-M37 的稳定化工作收拢成一个有版本号的 developer contract，并新增 local package-consumption gate，确保一个全新的下游 Bun/TypeScript Host 可以在不理解 monorepo workspace 魔法的情况下安装 framework packages。

这个版本不改变四层产品模型：

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

## 1. 更新本地 package 路径

如果你的下游 Host 通过本地 framework checkout 引用依赖，请把每个 dependency path 更新到新的 `pneuma-rc-0.2.0` checkout 或 worktree：

```json
{
  "dependencies": {
    "@pneuma-framework/core": "file:/absolute/path/to/pneuma-framework-rc-0.2.0/packages/core",
    "@pneuma-framework/core-domain": "file:/absolute/path/to/pneuma-framework-rc-0.2.0/packages/core-domain",
    "@pneuma-framework/runtime": "file:/absolute/path/to/pneuma-framework-rc-0.2.0/packages/runtime",
    "@pneuma-framework/cli": "file:/absolute/path/to/pneuma-framework-rc-0.2.0/packages/cli"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

然后重新安装：

```bash
bun install
```

RC 0.2.0 的 package manifest 不再要求下游项目理解 developer-facing packages 里的 `workspace:*` 依赖。通过 `file:` 消费本地 source packages 时，请安装 `@types/bun`，这样 TypeScript 才能识别 source package boundary 暴露出来的 Bun/Node API。

## 2. 使用聚焦的 public subpath 导入 Host contracts

不要把所有 Host contract 都从 package root 导入。root export 仍然是 broad compatibility surface，可能拉入你并不需要的 lifecycle、MCP、backend 或 runtime-adjacent modules。

优先使用聚焦的 public subpaths：

| 需求 | Import from |
|---|---|
| BuildThread transcript and packing | `@pneuma-framework/core/build-thread` |
| Creation Host project/version store | `@pneuma-framework/core/creation-host` |
| `doctor-host` validators and readiness summaries | `@pneuma-framework/core/developer-experience` |
| Authoring Kit validators | `@pneuma-framework/core/host-authoring` |
| Sharing governance validators | `@pneuma-framework/core/sharing-governance` |
| Portable artifact safety | `@pneuma-framework/core/portable-artifact-safety` |
| Code Change Lane | `@pneuma-framework/core/code-change-lane` |
| Build Assurance and review packets | `@pneuma-framework/core/build-assurance` |
| Durable assurance cases | `@pneuma-framework/core/build-assurance-store` |
| Recovery drill matrix | `@pneuma-framework/core/build-assurance-recovery` |
| Release rollout state | `@pneuma-framework/core/release-rollout` |
| Release rollout file store | `@pneuma-framework/core/release-rollout-store` |
| HostExtension slots | `@pneuma-framework/core/host-extension` |
| Host sessions/cookies | `@pneuma-framework/core/host-sessions` |
| Host credential refs/rebinding helpers | `@pneuma-framework/core/host-credentials` |
| OAuth helpers and fixtures | `@pneuma-framework/core/host-oauth` |
| Runtime constants | `@pneuma-framework/runtime/constants` |
| Runtime readiness polling | `@pneuma-framework/runtime/runtime-ready` |

## 3. 采用当前的创造闭环词汇

如果你的 Host 仍然把 agent loop 当成普通 chat 加临时 execution logs，请逐步迁移到当前 vocabulary：

| 需求 | 推荐契约 |
|---|---|
| Builder conversation source of truth | [BuildThread](./build-thread.zh-CN.md) |
| Code agent draft -> proposal -> apply | [Code Change Lane](./code-change-lane.zh-CN.md) |
| Backend turn execution | `AgentBackend.runTurn` |
| Approval-time disclosure | `BuildChangeReviewPacket` |
| Post-transition state | `BuildChangeAssuranceCase` |
| Durable Host-side cases | `BuildChangeAssuranceCaseStore` |
| Failure-path tests | `BuildChangeRecoveryDrillScenario` |

关键变化是：

```text
不要让 Builder 批准零散 tool calls。
让 Builder 批准一个带 evidence、risk、recovery plan 的完整 proposal。
```

## 4. 替换带 provider 名称的 BuildThread packing helper

provider-native message shape 应该属于 backend adapter，而不是 core。

如果你仍在使用 deprecated helper：

```ts
pneumaTurnsToAnthropicMessages(turns)
pneumaTurnsToOpencodeMessages(turns)
```

请迁移到 provider-neutral helper：

```ts
import { packBuildTurnsForRoleContent } from "@pneuma-framework/core/build-thread";

const messages = packBuildTurnsForRoleContent(turns, {
  capTurns: 20,
  alwaysKeepAnchor: true,
});
```

你的 backend adapter 再把 role/content messages 转成具体 provider 的 request payload。

## 5. 使用共享 Host utilities 减少重复胶水代码

RC 0.2.0 包含经下游压力验证的 post-RC utility surface：

- runtime composition helpers：显式 mode、boot options、diagnostics、marker/health waiting；
- HostExtension slot validators：验证 portable Host-owned artifacts；
- credential broker helpers：hashed sessions、OAuth state、callback binding、credential refs、no-secret rebinding evidence；
- package-consumption smoke：保护本地下游安装路径。

production storage、encryption、provider UI 和 long-term retention 仍然属于 Host。

## 6. 更新你的文档和测试

至少在下游 README 中记录：

- upstream commit hash 或 tag；
- 本地 package paths；
- Creation Host / Generated Application / Published Application 的角色；
- 使用哪条 approval lane：definition、Code Change Lane、HostExtension 或 Host-owned lane；
- happy path 与 failure path 期望生成哪些 Build Assurance cases。

推荐验证命令：

```bash
bun install
bun run typecheck
bun test
```

如果你在验证 upstream checkout 本身，请运行：

```bash
bun run test:package-consumption
```

该命令会创建一个全新的临时下游项目，把 developer-facing package directories 复制到没有 monorepo `node_modules` 的 isolated package set，然后通过 `file:` path 安装 `@pneuma-framework/core-domain`、`@pneuma-framework/core`、`@pneuma-framework/runtime` 和 `@pneuma-framework/cli`，导入 focused public subpaths，运行 `scaffold-host`、运行 `doctor-host`、执行 runtime smoke，并 typecheck consumer project。

## 7. 0.2.0 采纳了什么

已采纳：

- M26 的 Code Change Lane hardening；
- M27 的 runtime diagnostic/composition surface；
- M28 的 HostExtension slot contract；
- M29 的 `AgentBackend.runTurn` contract；
- M30/M31 的 Host credential broker utilities；
- M32-M37 的 Build Change Assurance、review packets、durable cases、recovery drills 和 adoption guidance；
- local package-consumption gate、package manifest cleanup、public Host-contract subpath exports，以及 downstream-safe `doctor-host` execution。

## 8. 什么仍然属于 Host 或 deferred

仍然属于 Host：

- code agent launch 和 draft workspace creation；
- approval UI 和 product-specific policy；
- production credential encryption 和 secret storage；
- provider-specific OAuth product screens；
- deployment target adapters；
- long-term audit retention；
- Runtime Agent product surface。

Deferred：

- production IAM；
- hosted compliance/audit backend；
- broad cloud deployment adapters；
- 作为 framework primitive 的 hot reload/custom code；
- marketplace artifact authenticity 和 signed transport；
- 完整 Pneuma 2.x dogfood rebuild。

RC 0.2.0 的目标是让当前 developer contract 对下一轮从零开始的下游验证来说，真正可安装、可测试、可理解。
