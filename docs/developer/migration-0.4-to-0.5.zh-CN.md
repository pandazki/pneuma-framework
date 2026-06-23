# 从 0.4.0 升级到 0.5.0

**读者：** 在 `pneuma-framework` 0.4.0 上构建过、现在要升到 0.5.0 的 Developer
**English version:** [migration-0.4-to-0.5.md](./migration-0.4-to-0.5.md)

## 一句话总结

0.5.0 改变的是你的**消费体验（consumption experience）**，并冻结了**公开 API 契约（public API contract）**。它**不改变 runtime 行为**。build → evolve → approve → publish 这条循环——包括 real-Codex code-agent lane——和 0.4.0 完全一致。变好的是：把 framework 当依赖安装时有多干净，以及现在已发布的 surface 是一份显式的、被纳入 semver 承诺的契约。

这个版本不改变四层产品模型：

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

如果你升级、重装、并且你的 import 在 0.4.0 里本来就能解析，那么你的 Host 几乎不需要任何改动。下面的说明按对你影响的可能性从高到低排序。

## 1. provider 命名的 BuildThread helper 已被移除（breaking）

**这是唯一会真正破坏 0.4.0 消费者构建的改动。** 五个 legacy build-thread message helper 在 0.5.0 里**已被移除（removed）**——不再从 `@pneuma-framework/core` 导出。现在 import 它们中任意一个都会失败。在升级之前（或作为升级的一部分），你**必须**迁移到替代项。

| 已移除 | 替代 |
|---|---|
| `PackedAgentMessage`（type） | `BuildTurnRoleContentMessage` |
| `AnthropicMessage`（type） | `BuildTurnRoleContentMessage` |
| `OpencodeMessage`（type） | `BuildTurnRoleContentMessage` |
| `pneumaTurnsToAnthropicMessages`（fn） | `packBuildTurnsForRoleContent` |
| `pneumaTurnsToOpencodeMessages`（fn） | `packBuildTurnsForRoleContent` |

被移除的 type 本来就是 `BuildTurnRoleContentMessage` 的 alias，被移除的函数本来就是 `packBuildTurnsForRoleContent` 的薄封装，所以这次替换是机械的、且行为保持不变：

```ts
// before（在 0.5.0 下已无法编译）
import { pneumaTurnsToAnthropicMessages } from "@pneuma-framework/core/build-thread";
const messages = pneumaTurnsToAnthropicMessages(turns, opts);

// after
import { packBuildTurnsForRoleContent } from "@pneuma-framework/core/build-thread";
const messages = packBuildTurnsForRoleContent(turns, opts);
```

这次搬迁的意图是：provider-native 的 message 形状属于你的 backend adapter，不属于 core。`packBuildTurnsForRoleContent` 返回 provider-neutral 的 role/content 消息；在你的 adapter 内部把它们翻译成 provider 专有的 request payload。见 CHANGELOG 的 **Removed** 段落。

## 2. `@pneuma-framework/host-kit` 不再带 `workspace:*` 依赖

在 0.4.0 里，`host-kit` 是唯一一个仍然声明 `workspace:*` 依赖的 developer-facing package。这会破坏 monorepo 之外项目的 `file:` 消费——下游 `bun install` 会报 `Workspace dependency "@pneuma-framework/core" not found`（`runtime` 同理）。

0.5.0 把它们改成 `file:` 依赖，并且 host-kit 现在被 local-package-consumption gate 覆盖，这个回归不会再悄悄复发。

**动作：** 如果你在 0.4.0 时为绕过 `workspace:*` 泄漏，在下游 `package.json` 里加了 `overrides` 块（或任何手动 pin），升级后请**删掉它**。它已不再需要，且可能掩盖未来的 drift。

## 3. `scaffold-host` 现在生成可安装的 framework 依赖路径

在 0.4.0 里，当 CLI 自身通过 `file:` 安装时，新 scaffold 出来的 Host 可能生成错误的 framework 依赖路径（它假定了 monorepo 内的布局），导致被 scaffold 项目的 `bun install` 失败。

0.5.0 改为通过 package graph（`import.meta.resolve`）解析这些路径，所以在 monorepo 之外 scaffold 出来的 Host 能干净安装。

**动作：** 如果你在 0.4.0 下遇到过 scaffold 路径错误 / 安装失败、并手动改过它的 `package.json`，请用 0.5.0 CLI 重新 scaffold，路径就会正确解析。

## 4. public API 现已冻结（non-breaking）

0.5.0 把已发布 package 里所有 wildcard `export *` barrel 替换成了显式的 `export { … }` / `export { type … }` 列表：

- `@pneuma-framework/core-domain` —— 枚举了 41 个 star。
- `@pneuma-framework/runtime` —— 枚举了 5 个 star。
- `@pneuma-framework/core` —— 枚举了它唯一一个 `runtime-data-governance` star。

这是一次 **non-breaking** 的冻结。没有 symbol 被新增、移除或迁移——0.4.0 里可达的每个名字，仍然从同一条 import 路径可达。package `exports` map 没动。你的 import 不变。

变的是围绕它们的契约：从 0.5.0 起，这些枚举出来的 barrel 就是被承诺的 public surface。在 0.5.x 内，新增属于 minor/patch；任何对当前可达 symbol 的移除或迁移都是 breaking change，保留给未来的 major-intent 发布列车。实际意义是：你现在可以信赖你 import 的东西。

> 故意延后：`@pneuma-framework/core-domain` 的 SQLite/Drizzle 层在 0.5.0 里被故意保留在主 public barrel 中，以保证这次冻结 non-breaking。把它移到独立的 `/sqlite` subpath 是 breaking change，被刻意推迟到 0.6.0。

## 5. 边界声明与 Vanilla SDK 更正

两个文档层面的澄清，作为消费者值得知道：

- README 现在有一个 **Scope & boundaries** 段落：runtime 是 Bun-only，并显式列出 framework 拥有什么、什么归 Host（multi-tenant identity / IAM、hosted secret vault、真正的 provider SDK、cloud deployment control plane、compliance/audit retention）。
- charter 不再承诺内置 **Vanilla JS SDK**。framework 提供的是**建立在开放 wire protocol 之上的 React SDK**；vanilla / 其他栈的 SDK 是**自带（bring-your-own）**。如果你一直在等官方 vanilla SDK，请改为针对开放 wire protocol 构建。

这两点都不会移除你依赖的任何代码；它们更正的是 framework 的承诺。

## 6. CI gate 拆分（仅当你 fork 或贡献时相关）

repo 现在有了 CI 拆分：

- 一个**必过的 offline gate**——typecheck、package/template 测试套件、以及 local-package-consumption gate——在每次 push 和 pull request 上跑；
- 一个独立的、**非阻塞 live gate**，用于跑联网的 example E2E 套件。

只有当你 fork repo 或向上游贡献时这才重要。它不影响消费已发布的 package。

## 升级清单

1. **把依赖引用 bump 到 0.5.0。** 把 `@pneuma-framework/core`、`@pneuma-framework/core-domain`、`@pneuma-framework/runtime`、`@pneuma-framework/host-kit`、`@pneuma-framework/cli` 的每个 `file:` 路径（或版本号）更新到你的 0.5.0 checkout/tag。
2. **跑 `bun install` 重新 link。** 不要跳过。version bump 之后的 stale install 会表现为 duplicate-type 报错和约 2 个失败的测试；干净重装即可修复。
   ```bash
   bun install
   ```
3. **删掉任何 host-kit `overrides` workaround**——0.4.0 时为 `workspace:*` 泄漏加的那些。
4. **若你遇到过 0.4.0 的 scaffold 路径 bug，请重新 scaffold**——用 0.5.0 CLI 生成一个全新的 Host，而不是手动修补旧的。
5. **替换那五个被移除的 build-thread helper**，改用 `BuildTurnRoleContentMessage` 和 `packBuildTurnsForRoleContent`。（必须做——它们在 0.5.0 已不存在；任何残留的 import 都会破坏你的构建。）
6. **跑你的 typecheck 和测试。**
   ```bash
   bun run typecheck
   bun test
   ```

如果这六步都过，你就在 0.5.0 上了——有一份冻结的、semver 稳定的 surface，以及干净的 `file:` 消费。

## 接下来读

- [Getting Started](./getting-started.md) —— 构建你的第一个 Creation Host。
- [BuildThread](./build-thread.md) —— framework 拥有的 semantic transcript 与 packing helper。
- 历史升级指南：[0.1.1](./upgrading-to-rc-0.1.1.md)、[0.1.2](./upgrading-to-rc-0.1.2.md)、[0.1.3](./upgrading-to-rc-0.1.3.md)、[0.2.0](./upgrading-to-rc-0.2.0.md)。
