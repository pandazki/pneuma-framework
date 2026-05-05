# Creation Host Contract

这份文档说明 Developer 基于 pneuma-framework 构建产品时，最低要提供什么。

## 四个制品

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

framework 提供 primitives 和 shared contracts。Creation Host 是 Builder-facing 产品面。Generated Application 是 Builder 通过 Host 创建出来的应用。Published Application 是对 End User 暴露的某个 generated-app version。

不要把这四层混成一个东西。这个项目里很多设计风险都来自把 “pneuma app” 同时当成四层。

## Host 的最低职责

一个有用的 Creation Host 负责：

| 职责 | 原因 |
|---|---|
| Profile selection | Developer 决定 Builder 可以创建哪些 stack 和 app shape。 |
| Project/version workspace | Generated app 需要稳定 version directory 和 state。 |
| Preview | Builder 在发布前需要看到应用。 |
| Inspection | Builder 和 Developer 需要看到 schema / data / operation / logs。 |
| Agent loop | Builder intent 必须变成 proposal、evidence 和 governed change。 |
| Approval | 能合并的一个 Builder intent 应该对应一次 coherent approval。 |
| Publish | 某个 generated version 必须能变成 active Published Application。 |
| Restart / rollback | Published app 需要基本运维控制。 |
| Diagnostics | Developer 需要知道 setup 或 runtime wiring 为什么失败。 |

## Framework 拥有的 contract

多种 Host 都需要的共享 contract 可以放在 framework：

- `CreationHostProfile`；
- `CreationHostProject`；
- `CreationHostVersion`；
- `CreationHostStore`；
- release candidate and rollout state；
- permission ledger；
- lifecycle semantic tools；
- profile contract validation；
- workspace diagnostics。

这些 contract 必须保持 generic，不能把某个 reference Host 的 SQLite path、Bun process layout、app-specific read operation id 变成 core semantics。

## Host 拥有的 contract

Host 拥有产品和 profile 选择：

- stack profile selection；
- Builder workbench UI/UX；
- generated-app templates；
- app-specific inspection views；
- open-ended UI/module artifacts；
- published app 是否包含 Runtime Agent；
- deployment adapter choice；
- semantic infrastructure choice，比如 SQLite vectors 或 Qdrant。

## Authoring Kit contract

M22 加入了第一版机器可读的 Creation Host Authoring Kit 边界。新的 scaffold Host 会包含：

```text
agent-package.json
provider-capabilities.json
share-artifact.example.json
agent-policy.md
```

这些文件仍然是 **Host-owned**。framework 只验证通用安全形状：

| 文件 | 作用 | Core validator |
|---|---|---|
| `agent-package.json` | 声明 Developer 编写的 Build Agent Package：instructions path、semantic tool allowlist、credential boundary、review checklist、verification hooks。 | `validateBuildAgentPackageManifest` |
| `provider-capabilities.json` | 声明 profile/provider capabilities、unsupported capabilities 和 fail-closed behavior。 | `validateProviderCapabilityMatrix` |
| `share-artifact.example.json` | 记录 portable no-secret share artifact 形状：app definition、init recipe、provider requirements、exclusions。 | `validateShareArtifactManifest` |
| `agent-policy.md` | Host Developer 编写的人类可读 Builder-agent rules。 | Host-owned text；由 package manifest 引用 |

核心边界是：

```text
Build Agent Package = Developer 编写的 guardrail package。
Build Agent Session = 从 package 创建出来的 Builder-specific runtime instance。
```

framework 验证 package 不包含 raw secrets、provider limitations 必须 fail closed、share artifact 是 portable manifest 而不是 database。

## Schema-driven apps

schema-driven apps 使用 framework definition rows：

```text
pneuma_tables
pneuma_table_columns
pneuma_operations
pneuma_views
pneuma_policy_rules
```

它们的 governed changes 可以走 `definition.apply` 或 `definition.apply_change_set`，并获得 impact disclosure、approval token、framework execution、history、rollback/recovery evidence。

Knowledge Inbox 和 Team Decision Log 证明了这条路径。

## Open-ended apps

open-ended apps 可能包含 routes、page sections、style tokens、source modules 或其他当前 definition-row 模型表达不了的 artifacts。

M20 接受的边界是：

```text
open-ended UI/module artifacts
  -> Host-owned artifact
  -> Host approval
  -> Host inspection/transcript/release/rollback evidence
  -> v0 不是 framework definition rows
```

这不是缺陷，而是避免 framework 在没有稳定抽象前，把某个 site-builder 形态过早提升为 primitive。

Personal Focus Site 证明了这条路径。

## Profile contract test

使用 core helper：

```ts
import { assertCreationHostProfileContract } from "@pneuma-framework/core";

for (const profile of profiles) {
  assertCreationHostProfileContract(profile);
}
```

helper 只检查 framework-level shape：

- stable profile id；
- display name；
- description；
- template/profile directory；
- optional stack id shape；
- capability string shape；
- JSON metadata。

它不会验证 app-specific semantics。

## Authoring contract test

对新的 authoring files 使用 M22 helper：

```ts
import { expect, test } from "bun:test";
import {
  validateBuildAgentPackageManifest,
  validateProviderCapabilityMatrix,
  validateShareArtifactManifest,
} from "@pneuma-framework/core";
import agentPackage from "../agent-package.json";
import providerCapabilities from "../provider-capabilities.json";
import shareArtifact from "../share-artifact.example.json";

test("Creation Host authoring contracts are valid", () => {
  expect(validateBuildAgentPackageManifest(agentPackage).issues).toEqual([]);
  expect(validateProviderCapabilityMatrix(providerCapabilities).issues).toEqual([]);
  expect(validateShareArtifactManifest(shareArtifact).issues).toEqual([]);
});
```

这些 validator 不证明你的 Host product 已经完整。它们证明第一层 Authoring Kit safety boundary：package/share files 没有 raw secrets、provider fail-closed behavior 显式、share artifact 可以 re-bind，而不是复制 raw database。

## Doctor contract

使用：

```bash
pneuma-framework doctor-host \
  --workspace ./workspace \
  --profiles ./profiles.json \
  --agent-package ./agent-package.json \
  --provider-capabilities ./provider-capabilities.json \
  --share-artifact ./share-artifact.example.json
```

Doctor 检查：

- profile contract validity；
- Host state file presence；
- generated-app project/version counts；
- missing version directories；
- Build Agent Package manifest safety；
- Provider Capability Matrix fail-closed behavior；
- Share Artifact manifest portability and no-secret boundary；
- next steps。

同一个 diagnostics object 也可以通过 `diagnoseCreationHostWorkspace` 放进 Host UI 或 CI。

Authoring diagnostics 可以通过 `diagnoseCreationHostAuthoring` 获取。Developer workflow 变成：

```text
scaffold-host
  -> 生成 profile + authoring files
doctor-host
  -> 验证 profile + workspace + authoring files
```
