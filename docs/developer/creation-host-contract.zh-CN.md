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

## Doctor contract

使用：

```bash
pneuma-framework doctor-host --workspace ./workspace --profiles ./profiles.json
```

Doctor 检查：

- profile contract validity；
- Host state file presence；
- generated-app project/version counts；
- missing version directories；
- next steps。

同一个 diagnostics object 也可以通过 `diagnoseCreationHostWorkspace` 放进 Host UI 或 CI。

