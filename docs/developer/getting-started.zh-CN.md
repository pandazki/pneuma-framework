# 快速开始：构建第一个 Creation Host

这份文档面向第一次从外部接触 pneuma-framework 的 Developer。

目标不是一条命令做出生产 SaaS，而是跑通最小完整路径：

```text
scaffold host
  -> validate profiles
  -> 在 reference examples 里 create / preview / inspect
  -> evolve / approve
  -> publish / restart / rollback
```

## 1. 安装

在 framework repo 里：

```bash
bun install
```

先跑基础检查：

```bash
bun test packages/core/test/developer-experience.test.ts packages/cli/test/developer-experience.test.ts
bun run typecheck
```

## 2. 创建 starter Host

```bash
bun packages/cli/src/index.ts scaffold-host /tmp/my-pneuma-host --name "My Pneuma Host"
```

这个命令会创建：

```text
/tmp/my-pneuma-host
  package.json
  profiles.json
  agent-package.json
  provider-capabilities.json
  share-artifact.example.json
  agent-policy.md
  README.md
  src/run.ts
```

这个 scaffold 故意很小。它是你的 Host 起点，不是 framework 偷偷塞给你的完整 app builder。

这些 authoring files 是 M22 Creation Host Authoring Kit 的第一刀：

- `agent-package.json` 描述 Developer 编写的 Build Agent Package，用于创建 Builder-specific Build Agent Sessions。
- `provider-capabilities.json` 描述 profile 支持/不支持的能力，以及 fail-closed behavior。
- `share-artifact.example.json` 记录 no-secret portable share artifact 边界。
- `agent-policy.md` 是 package 消费的人类可读规则文档。

## 3. 跑 doctor

```bash
bun packages/cli/src/index.ts doctor-host \
  --workspace /tmp/my-pneuma-host/.pneuma-workspace \
  --profiles /tmp/my-pneuma-host/profiles.json
```

新 scaffold 的预期输出：

```text
Creation Host diagnostics: passed
profiles: 1
projects: 0
versions: 0
workspace [warning] workspace.state.missing: No Creation Host state file exists yet.
next steps:
  - Create a generated app project, then run doctor-host again to verify version directories.
```

这表示这是一个健康的空 Host workspace：profile contract 有效，下一步应该创建 generated app。

## 4. 学习 schema-driven Reference Host

启动集成 Reference Host：

```bash
bun run examples/m16-reference-creation-host/run.ts --port 8879
```

打开：

```text
http://127.0.0.1:8879/
```

按顺序体验：

1. 创建 `team-knowledge-inbox`。
2. 预览 generated app。
3. 检查 schema / data / operations / logs。
4. 开始 evolution。
5. 批准 proposed capability。
6. 发布 v0 / v1。
7. restart active。
8. rollback。

自动 smoke：

```bash
bun run examples/m16-reference-creation-host/run.ts --port 0 --smoke-exit
```

## 5. 学习 open-ended app

启动 Personal Focus Site：

```bash
bun run examples/m18-open-ended-personal-focus-site/run.ts --port 8879
```

这个 example 证明它不是 schema/list app 的过拟合：

- routes；
- page sections；
- style tokens；
- dynamic GitHub attention module；
- Host-governed UI/module evolution。

自动 smoke：

```bash
bun run examples/m18-open-ended-personal-focus-site/run.ts --port 0 --smoke-exit
```

## 6. 给你的 Host 加 contract test

在你的 Host repo 里加一个小测试：

```ts
import { expect, test } from "bun:test";
import {
  validateBuildAgentPackageManifest,
  validateCreationHostProfileContract,
  validateProviderCapabilityMatrix,
  validateShareArtifactManifest,
  type CreationHostProfile,
} from "@pneuma-framework/core";
import agentPackage from "../agent-package.json";
import profilesJson from "../profiles.json";
import providerCapabilities from "../provider-capabilities.json";
import shareArtifact from "../share-artifact.example.json";

test("profiles satisfy the framework Creation Host contract", () => {
  for (const profile of profilesJson as CreationHostProfile[]) {
    const result = validateCreationHostProfileContract(profile);
    expect(result.issues).toEqual([]);
  }
});

test("authoring kit contracts are safe", () => {
  expect(validateBuildAgentPackageManifest(agentPackage).issues).toEqual([]);
  expect(validateProviderCapabilityMatrix(providerCapabilities).issues).toEqual([]);
  expect(validateShareArtifactManifest(shareArtifact).issues).toEqual([]);
});
```

## 7. 接下来要做什么

一个有价值的第一版 Host 应该提供：

- profile selection；
- create generated app；
- preview；
- inspect schema / data / operations / logs；
- 一条 governed evolution path；
- approval；
- publish；
- restart；
- rollback；
- diagnostics。

下一篇：[Creation Host Contract](./creation-host-contract.zh-CN.md)。
