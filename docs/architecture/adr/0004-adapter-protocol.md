# ADR-0004: Adapter 协议由 framework 定义，marketplace 由 meta-app 承担

**Status**: Accepted
**Date**: 2026-04-23
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: storage, integration, scope

---

## Context

[ADR-0002](./0002-storage-typed-cells.md) 的 cell 类型系统里有 `ref-external`——允许单元格持有指向外部系统资源的引用（Linear issue、Obsidian page、GitHub PR、Google Doc...）。同时 Table 的 `source` 可以是 `AdapterBacked`——表的数据直接来自外部系统，pneuma 不持有副本。

这两种机制都依赖 **Adapter** ——从 pneuma 到外部系统的 ingress / egress 层。Adapter 要处理：auth（OAuth / API key / service account）、网络（轮询、速率限制、缓存）、schema（外部数据如何映射到 pneuma 类型）、写回（如果允许）、preview 渲染（UI 如何展示一条外部记录）。

Adapter 数量天然会膨胀——每个主流 SaaS 都是一个候选。由谁维护这些 Adapter、它们代码存放在哪里，是一个**范围边界**决策，直接影响 framework 的可维护性。

n8n / Zapier 的历史教训：把几百个 Adapter 全部塞进 framework 主仓库，最终导致主仓库成为一个 "integration hub" 且 framework 本身无法演进——每次 API 小改动都要协调所有 adapter 升级。

---

## Options considered

### Option F1: Framework 内置所有 Adapter
Pneuma 主仓库直接包含 Linear / GitHub / Notion / Obsidian / ... 的 adapter 代码。

- **Pro**: 每个 pneuma-app 开箱可用；升级一致
- **Con**: 主仓库变成巨型 integration monorepo；每个外部 API 变动都要协调升级；社区贡献的 adapter 质量难管；framework 本身演进被 adapter 拖累

### Option F2: 每个 pneuma-app 自己引入 adapter（package 依赖）
需要 Linear 的 app 自己 `bun add @community/adapter-linear`。Framework 只定义 adapter 协议。

- **Pro**: Decouple，framework 主仓库小而聚焦
- **Con**: Builder 要自己挑 adapter package、解决兼容冲突；SaaS 白标场景下每个租户 app 单独安装 adapter 运维负担大

### Option F3（最终选择）: Framework 定义协议 + 极少 reference adapter；marketplace 由 meta-app 层运营
Pneuma 主仓库只给 adapter **协议定义**（接口 / 类型 / 生命周期）和 2-3 个 reference adapter（如 `file`、`http-json`）。真正的 adapter 生态（Linear / Notion / ...）由 **meta-app 层**（例如未来的 "pneuma platform" 白标产品）运营——一个可审核、可授权、可版本化的 marketplace。

- **Pro**: Framework 维持极小核心；reference adapter 提供实现样板；meta-app 负责真实生态管理（审核、授权、付费、版本）
- **Con**: MVP 只有 2-3 个 adapter，archetype B 的 demo 会受限；需要设计一套稳定的 adapter 协议（协议一旦变动，生态全部要跟）

---

## Decision

采用 **F3**，划清三个层次：

### 层次 1 — Framework 只出**协议**

```typescript
interface AdapterDefinition {
  id: string;                        // 全局唯一，e.g. "linear"
  schemaVersion: 1;                  // 协议版本
  externalTypes: ExternalTypeDef[];  // 该 adapter 注册的外部 ref 类型
  auth: AuthStrategy;                // OAuth2 / APIKey / ServiceAccount / None
  capabilities: Capabilities;        // read / list / insert / update / delete（见 ADR-0005）
  credentialMode: "shared" | "per-user" | "both";  // 见 ADR-0011

  // 生命周期回调
  init?(ctx: AdapterCtx): Promise<void>;
  authenticate?(ctx: AdapterCtx): Promise<AuthCredential>;
  list?(ctx: AdapterCtx, query: Query): AsyncIterable<Row>;
  get?(ctx: AdapterCtx, id: string): Promise<Row>;
  insert?(ctx: AdapterCtx, row: Row): Promise<string>;
  update?(ctx: AdapterCtx, id: string, patch: Patch): Promise<void>;
  delete?(ctx: AdapterCtx, id: string): Promise<void>;

  // UI
  preview(row: Row): PreviewData;     // 框架渲染 cell 时调用
}

interface AdapterCtx {
  credential: AuthCredential;         // 由 credentialMode 决定来源（shared: app-level; per-user: user's OAuth）
  tenantId: string;
  logger: Logger;                     // 接入 ADR-0013 telemetry
  cache: CacheHandle;
}
```

### 层次 2 — Framework 内置 **reference adapter**（MVP 2 个）

| Adapter | 用途 | 认证 | 功能 |
|---|---|---|---|
| `file` | 读写本地/workspace 文件 | None | read/list/update |
| `http-json` | 调任意 HTTP JSON API | APIKey / None | read/list（写回 Phase 2） |

这两个 reference adapter 既是样板，也为 MVP 模板提供足够的能力（如 ai-bookmarks 的 URL 抓取可以走 `http-json`）。

### 层次 3 — Real-world adapter 由 **meta-app marketplace** 运营

这层**不是** framework 的职责。未来的 pneuma-platform（meta-app）运营：

- Adapter 审核（安全 / 代码质量 / 数据处理合规）
- 授权 / 付费 / 版本控制
- Schema 注册（外部资源类型被 pneuma 认识的前提是 adapter 在 marketplace 注册过）

在 framework 侧，只有加载协议——通过 `loadAdapter(adapterId, version)` 从本地 / registry 加载 `AdapterDefinition`。

### 协议稳定性承诺

- Adapter 协议一旦 `schemaVersion: 1` 冻结到 v1.0，后续只能**向后兼容**地扩展（可新增字段，可选，旧 adapter 继续工作）
- 破坏性变更 → `schemaVersion: 2`，marketplace 允许新旧版本并存

---

## Consequences

### Positive
- Framework 维持小而聚焦，不会被 integration hub 拖累
- Reference adapter 给社区样板，降低新 adapter 贡献门槛
- Marketplace 承担审核 / 付费 / 版本 → 正是 archetype D 的平台价值所在
- 协议稳定性承诺让社区 adapter 不会因为 framework 升级频繁 break

### Negative / Risks
- **MVP demo 能力受限**：只有 2 个 reference adapter，无法演示 "Linear + 团队工作台" 这种 archetype B 的典型场景。需要在 M6-M7 交付最早一批社区 adapter
- **Marketplace 运营是独立工作量**：framework 交付完成不等于生态可用；marketplace 本身是 meta-app 的 scope
- **协议兼容性负担**：一旦 v1 冻结，任何 adapter API 改动都要考虑社区 adapter 升级成本

### Follow-ups
- [ADR-0005 Adapter capabilities](./0005-adapter-capabilities.md)：`capabilities` 字段的具体语义与框架的 write-back 自动映射
- [ADR-0011 Adapter credential modes](./0011-adapter-credential-modes.md)：`credentialMode` 的详细设计
- **ADR-TBD: Adapter schemaVersion 演进策略**：1 → 2 的破坏性升级如何引导社区
- **ADR-TBD: Reference adapter 选择标准**：除了 `file` 和 `http-json` 之外，是否还有第三个 reference adapter（如 `sqlite-raw` 用于自定义 SQL）
- 进 `open-questions.md`：marketplace 的付费模型（per-install / per-call / free-forever）
