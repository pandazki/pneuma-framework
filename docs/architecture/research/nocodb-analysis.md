# NocoDB 深度调研 — 对 pneuma-framework 18 条 ADR 的启示

> 调研时间：2026-04-22
> 调研者：Claude (Opus 4.7, subagent)
> NocoDB 版本：latest release `2026.04.2`（"Introducing NocoDocs"，2026-04-22），master 分支
> 报告用途：ADR-0019 (Query DSL) / ADR-0020 (View System) 起草前的外部对标；同时对既有 0001-0018 做反向印证

---

## TL;DR（3 条）

1. **NocoDB 不适合作为 pneuma 的内置 data backend**（抽象层次是 "SQL-table + view"，pneuma 是 "typed cell + data-ref"；权限模型是 imperative RBAC 而非 declarative DSL；它是 app 而非 library）。但它**是 pneuma Adapter 协议的第一类优质 target**——通过一个 `pneuma-adapter-nocodb` 可以一次性接入 7 种关系数据库 + 原生 MCP token 支持。
2. **NocoDB 对 pneuma 18 条 ADR 的总体校验是"方向正确但还需补 3-5 个缺失维度"**：显著缺失的维度是——(a) **Transform / Derived column 的 DependencyGraph**（NocoDB 的 `DependencyTracker` 印证）、(b) **Team/Group + 匿名 share-link 作为 subject**、(c) **`enforce_for: [ui|agent|api|webhook|scheduled]` 在 policy 上的维度**、(d) **View-level column override 独立存储**、(e) **View lock_type 三档**。这些都是 R7-R11 行动项。
3. **对即将起草的 ADR-0019 Query DSL / ADR-0020 View System 有强直接启示**——Query 走混合形态（声明式 + handler），直接借用 NocoDB 的 Filter AST 词汇（`logical_op / is_group / children / comparison_op + sub_op`）；View MVP 从 4 个改回 **5 个（加 form）**；view-level column override / lock_type / shared-view uuid 都是 NocoDB 验证过的成熟形态可直接抄。pneuma 需要保留的独特优势是 **NL 双向 policy（ADR-0008）** 和 **Operation primitive（ADR-0018）**——这两点 NocoDB 完全没有，是 pneuma 的差异化护城河。

---

## 摘要

**NocoDB 是一个成熟、大体量、正在从 Airtable-clone 向"Airtable + Notion + Retool"多形态演进的 TypeScript / NestJS 产品**。它顶层 187 个 release、最新版 2026-04-22、已内置 MCP token、有 47 种 UIDT、7 种 View、单独的 AIColumn / Dashboard / Widget 实体。`packages/nocodb/src/models` 目录下约 60 个 domain entity，足以支撑企业级 Airtable 替代品的工程规模。研究它对 pneuma 的价值不在"抄架构"，而在**看 Airtable 类产品的问题空间被工程化到什么程度，以及 AI-native 定位和它有多远的差异**。

**核心判断是"定位与哲学不重合，技术实现值得借鉴"**。NocoDB 的产品假设是"管理员通过 GUI 配置 schema + 权限 + view + webhook，End User 通过 UI 填表填数"，它的 Agent / AI 是作为**列级填空器**接入（AIColumn = 一种 formula 的 sugar）。pneuma 的产品假设是"Builder 通过自然语言对话构建，Agent 对一切（schema / policy / view / data / operation）是 first-class 主体"。两个产品解决的不是同一个问题，但在"数据模型底层 / 权限表达 / view 组合 / 触发机制"这几个**工程原语层面**，NocoDB 的十年沉淀对 pneuma 起草中的 ADR 是直接可消费的参考。

**最显著的正向印证**：UIDT vs DB-type 分层（ADR-0002）、Filter AST 递归树（ADR-0007）、capability 声明 + readonly 旗标（ADR-0005）、三层权限粒度 Table+Field+Record（ADR-0006）、Integration 独立于 Source（ADR-0011 amend 候选）。**最显著的差异化护城河**：pneuma 的 NL 双向 policy（ADR-0008）和 Operation primitive（ADR-0018）NocoDB 完全没有对应——前者让 agent 可以回答"谁能看到什么 / 为什么不能"，后者让 UI 按钮和 agent 工具是同一抽象。NocoDB 里对应的东西是散在 Button column / Hook / Script / AIColumn 里的分裂实现，pneuma 的统一 Operation 如果做对，就是代际领先。

**最需要补的 pneuma 现有 ADR 盲区**（共 6 处）：(1) Transform 的依赖图追踪（NocoDB `DependencyTracker.ts` 印证），(2) Team/Group 作为 subject（ADR-0010 扩展），(3) 匿名 share-link（NocoDB shared view 的 uuid+password 印证），(4) policy 的 `enforce_for` 入口维度，(5) view-level column override 独立存储（NocoDB 的 `*ViewColumn.ts` 拆分），(6) view lock_type 三档（collaborative/locked/personal）。其中 (1)(4)(5)(6) 是纯架构补漏，(2)(3) 是企业 / 公开场景的一等需求。

**对 ADR-0019/0020 的直接可执行建议**：Query DSL 走 Option C（混合），直接借 NocoDB Filter 词汇表并扩展 sub_op；View MVP 从 4 改回 5（加 form），借 lock_type 三档、view-level column override、shared-view uuid 三个概念，Operation 用 id 引用挂在 `table_level / row_level / field_level` 三层。Button column 作为 OperationUIBinding 的一种 flavor（`in_cell_button`）而非独立 CellType。where-clause AST 设计为独立类型，同时被 query / policy / trigger 共享（这是 pneuma 的架构美学机会）。

---

## 目录

- [1. NocoDB 概览](#1-nocodb-概览)
- [2. 层 1 — 能否作为 pneuma backend](#2-层-1--能否作为-pneuma-backend)
- [3. 层 2 — 值得借鉴的具体实现](#3-层-2--值得借鉴的具体实现)
- [4. 层 3 — 对 18 条 ADR 的印证与反思](#4-层-3--对-18-条-adr-的印证与反思)
- [5. 层 4 — 对 Query DSL (0019) 和 View System (0020) 的启示](#5-层-4--对-query-dsl-0019-和-view-system-0020-的启示)
- [附加：核心维度 side-by-side 对照](#附加核心维度-side-by-side-对照)
- [6. 新视角 / 我们漏掉的维度](#6-新视角--我们漏掉的维度)
- [7. 推荐行动项](#7-推荐行动项)
- [附录 — 研究方法](#附录--研究方法)

---

## 1. NocoDB 概览

**定位**：NocoDB 是开源的 Airtable / Smartsheet 替代品，自我定位是"The fastest and easiest way to build databases online"。核心价值主张是：**把任意关系数据库（MySQL / PostgreSQL / SQLite / SQL Server / MariaDB / Snowflake / Databricks）转换成智能电子表格式的 UI**，同时保持 schema / 数据本身由底层 DB 拥有（No vendor lock-in）。

**技术栈**（来自 repo 元信息）：

| 层 | 技术 |
|---|---|
| 语言分布 | TypeScript 61.7% / Vue 32.1% / JavaScript 4.3% / PLpgSQL / SCSS |
| Monorepo | Lerna + pnpm workspaces |
| 后端 | Node.js / TypeScript，基于 **NestJS** 框架（从 `controllers/ services/ modules/ guards/ interceptors/` 结构判定） |
| 后端 DB abstraction | Knex.js（`dbQueryClient/`），支持 MySQL / Postgres / SQLite / SQL Server / MariaDB / Snowflake / Databricks |
| Meta DB（NocoDB 自身元数据） | 默认 SQLite，可切换到 Postgres / MySQL |
| 前端 | Vue 3 / Nuxt（`packages/nc-gui`） |
| 实时 | Socket.io (`socket/`, `gateways/`) |
| 缓存 | Redis (`redis/`, `cache/`) |
| 插件 | 自研 plugin 系统 (`plugins/`) |

**Repo 规模信号**：187 个 release、最新 `2026.04.2`、顶级 `packages/` 下至少两个主包、`nocodb/src/` 下超过 20 个顶级子目录。这是一个**成熟、大体量**的产品工程，不是 demo。最新版本引入了 **NocoDocs**（知识库 / 文档形态），说明产品正在从"纯表格"向"Airtable + Notion + Retool"混合体演化。

**后端顶层模块地图**（`packages/nocodb/src/`）：

```
app.module.ts / main.ts / cli.ts / Noco.ts   ← NestJS bootstrap
models/         ← domain 实体（60+ 文件）
services/       ← 业务编排
controllers/    ← HTTP 入口
modules/        ← NestJS 功能模块分组
db/             ← Knex/DB 抽象 + SQL 构造
dbQueryClient/  ← 专门的 external DB 查询客户端
meta/           ← NocoDB 自身元数据
cache/ redis/   ← 缓存层
gateways/ socket/   ← 实时
integrations/   ← 外部服务集成
plugins/        ← 插件系统
helpers/ utils/ types/ interface/ constants/ decorators/  ← 辅助
guards/ interceptors/ middlewares/ filters/ strategies/   ← NestJS 中间层
version-upgrader/  ← schema / 元数据迁移
providers/      ← DI
```

**关键信号**：独立的 `dbQueryClient/` 和 `integrations/` 目录，说明 NocoDB 在"对外部数据源的适配"这件事上是**第一类公民**，不是 afterthought——这与 pneuma 的 Adapter 设计（ADR-0004/0005）有直接可比性。

**Domain 实体规模**（来自 `models/` 目录清点，共约 60 文件）：

- 核心 4：`Base.ts` / `Source.ts` / `Model.ts` / `Column.ts`
- View 变体 × 7 + view-level column × 7：`GridView` / `FormView` / `GalleryView` / `KanbanView` / `CalendarView` / `MapView` / `ListView`（+ 同名 `*Column.ts`）
- 查询：`Filter.ts` / `Sort.ts` / `CalendarRange.ts`
- 列类型特化：`FormulaColumn` / `LookupColumn` / `RollupColumn` / `LinkToAnotherRecordColumn` / `LinksColumn` / `BarcodeColumn` / `QrCodeColumn` / `ButtonColumn` / `LongTextColumn` / **`AIColumn`**
- 用户 / 权限：`User` / `BaseUser` / `WorkspaceUser` / `Permission` / `ModelRoleVisibility`
- 自动化 / 集成：`Hook` / `HookFilter` / `HookLog` / `Integration` / `IntegrationStore` / `Plugin` / `Script` / `Extension`
- 审计 / 协作：`Audit` / `Comment` / `Notification`
- 认证：`ApiToken` / `OAuthClient` / `OAuthToken` / `OAuthAuthorizationCode` / **`MCPToken`** / `UserRefreshToken`
- 可视化 2.0（新）：`Dashboard` / `Widget`
- 同步 / 工作流：`SyncSource` / `SyncLogs` / `Workflow`
- 其他：`SelectOption` / `CustomUrl` / `Store` / `PresignedUrl` / `FileReference` / `DataReflection` / `DependencyTracker` / `RowColorCondition` / `Workspace` / `Job`

两个值得注意的信号：

1. **`AIColumn.ts` 存在** — NocoDB 把 LLM 列作为**字段类型**接入。即它把 AI 做成了"电子表格里的一种单元格"，是**表格驱动 + AI 增强**的思路，与 pneuma **"AI-native、Agent 能做 UI 能做的事"**的思路是反的（详见第 4 节）。
2. **`MCPToken.ts` 存在** — NocoDB 已经把自己暴露为 MCP server。这意味着从 pneuma backend 的视角，NocoDB 不仅是潜在的 data provider，还是**潜在的 tool surface**。

---

## 2. 层 1 — 能否作为 pneuma backend

**结论**：**不推荐作为 pneuma-framework 的"内置 data backend"**，但**强烈推荐作为 pneuma Adapter 的第一类 target**，且可以**作为具体 gridboard-class pneuma-app-template 的参考实现 / 可选后端**。

### 为什么不作为 framework 内置 backend

一、**颗粒度和抽象层次都不匹配**。pneuma 的 Storage 模型（ADR-0002）是 "typed cells + data-ref"，并且有 4 种 Table source（Stored / AdapterBacked / Derived / Hybrid），核心抽象是 **Cell**；NocoDB 的核心抽象是 **Model (= Table)** + **Column**，每个 Column 有 47 种 `UIDT`（UI data type），大部分都直接 map 到底层 SQL 列。这两个抽象不是子集关系——NocoDB 的 "LinkToAnotherRecord" 类型内嵌了 FK / 中间表选择、"Formula" 类型内嵌了自己的 AST 解析器、"Lookup/Rollup" 类型内嵌了 join+agg 的特殊执行器——这些都是**绑定到"关系数据库 + 电子表格语义"**的具体选择。pneuma 要的是更中性的数据原语（cell，可以来自任何地方），NocoDB 的假设是"这是一个多少偏 Airtable-like 的表 + 视图产品"。

二、**权限模型方向不同**。NocoDB 的权限（见 §3.4）是**"role + 粗粒度 RBAC + 可选 RLS（尚未完全文档化）"**；pneuma（ADR-0006/0007/0008/0010）是**"封闭词汇三元组 YAML + user-id grants + NL 双向"**。两者的核心设计目标不同：

- NocoDB 目标：**让管理员能快速设置访问边界**（Editor-and-up / Creator-and-up / Nobody，粗档位）
- pneuma 目标：**让 Agent 能解释、生成、回答"谁能做什么"的自然语言问题**

NocoDB 的 `Permission.ts` 里核心评估函数 `isAllowed()` 是空实现（placeholder），实际鉴权散在 NestJS guards / controllers 里；这是典型的"RBAC 靠 middleware 拦截"的 imperative 方案。pneuma 要的是 declarative / queryable policy。这不是谁好谁坏，而是**设计目标不重合**。

三、**NocoDB 不是库 / 运行时，而是 app**。NocoDB 是一个完整的 NestJS app，自己拥有 HTTP 服务、WebSocket、认证、Redis、UI。pneuma-framework 是一个库，给 Developer 写 template 用的。把 NocoDB 当 backend "嵌进去"意味着：pneuma template 要么以 iframe 形式集成 NocoDB UI（但 NocoDB 官方 iframe 有 whitelist 限制，见 WebSearch 结果），要么以 API client 形式集成 NocoDB 的 REST API（但这时 pneuma 就等于重写了 NocoDB 的前端，收益很小）。两条路都不通透。

### 为什么可以作为 Adapter target（ADR-0004 语境）

一、**REST API 完整**：NocoDB 提供 Data API 和 Meta API 两套，支持 filter DSL（`(col,op,val)~and(col2,op,val2)`）、sort、limit/offset、fields 选择。对于 Adapter 的 `readCells` / `writeCells` / `listRows` 协议来说，这是可消费的。

二、**MCP Token 已经内置**：NocoDB master 分支已经有 `MCPToken.ts`。说明 NocoDB 官方有计划把自己作为 MCP server 暴露（工具调用友好的形态）。这对 pneuma Build-phase Agent 是**天然友好**的。

三、**外部 DB 连接能力强**：NocoDB 的 Source 模型（§3.2）可以连 MySQL/PG/SQLite/SSMS/Snowflake/Databricks。pneuma 如果把 NocoDB 当作"数据库接入层 Adapter"，可以**一次性获得接入 7 种数据库的能力**，而不用 pneuma 自己写 7 个 adapter。

四、**现实用例**：已经在 Notion/Airtable 里构建过复杂表格的 team，如果想迁移到 pneuma 同时保留原有数据结构，走 NocoDB Adapter 是比 "从零 CSV 导入 pneuma stored table" 更低阻力的路径。

### 推荐定位

| 模式 | 形态 | 语义 |
|---|---|---|
| 首选 | `pneuma-adapter-nocodb` | 一个 Adapter 包，把 NocoDB base 当作 AdapterBacked table（ADR-0002）的数据源，cell write 按 capability 声明（ADR-0005）映射到 NocoDB 的 row update |
| 可选 | `pneuma-app-template-gridboard-via-nocodb` | 一个 template，后端是 NocoDB，前端是 pneuma 自己的 viewer，Build-phase Agent 通过 NocoDB 的 MCP server 操作 schema |
| 不推荐 | 把 NocoDB 内嵌到 framework 作为 default storage | 抽象层次不匹配，会把 pneuma 的 typed-cell 模型拉回 SQL-table 语义 |

---

## 3. 层 2 — 值得借鉴的具体实现

### 3.1 字段类型系统 (UIDT)

**源文件**：`packages/nocodb-sdk/src/lib/UITypes.ts`（估计 ~200-500 行，含 enum 与 helper）

**UIDT 总计约 47 种**（来自 WebFetch 读取）。分类清单：

| 类别 | 枚举值 |
|---|---|
| 文本 | `SingleLineText` / `LongText` |
| 选择 | `SingleSelect` / `MultiSelect` / `Checkbox` |
| 数值 | `Number` / `Decimal` / `Currency` / `Percent` / `Rating` / `Duration` |
| 日期时间 | `Date` / `DateTime` / `Time` / `Year` / `CreatedTime` / `LastModifiedTime` |
| 关系 | `LinkToAnotherRecord` / `ForeignKey` / `Lookup` / `Rollup` / `Count` / `Links` |
| 计算 / 衍生 | `Formula` / `Button` |
| 媒体 / 编码 | `Attachment` / `Barcode` / `QrCode` / `Geometry` / `GeoData` |
| 系统 | `ID` / `Order` / `Meta` / `CreatedBy` / `LastModifiedBy` / `User` / `Collaborator` |
| 联系 | `Email` / `PhoneNumber` / `URL` |
| 特殊 | `JSON` / `UUID` / `Colour` / `SpecificDBType` |

**辅助结构**：

- `UITypesName` — 每个 UIDT 的 human-readable label（"Link to another record"）
- `UITypesSearchTerms` — 每个 UIDT 的搜索关键词（用于 UI 添加字段时模糊搜索）
- `FieldNameFromUITypes` — 新建字段时的默认 title（"Attachment" / "Notes" 等）
- 分类函数：`isNumericCol()` / `isVirtualCol()` / `isSelectTypeCol()` / `isReadOnlyColumn()`

**存储 / 运行时分层**（见 `models/Column.ts`）：

- `uidt`：UI 类型（47 种之一）
- `dt` / `dtx` / `dtxp` / `dtxs` / `clen` / `cdf` / `cc`：底层 DB 列信息（data_type / extra / precision / scale / length / default / comment）
- `colOptions`：type-specific 的额外配置，对于不同 UIDT 是不同的形状（例如 Formula 列的 colOptions = FormulaColumn instance；LinkToAnotherRecord 列的 colOptions = LinkToAnotherRecordColumn instance）
- `meta` / `internal_meta`：两个独立 JSON 字段，前者对 API 公开，后者用于框架内部约束元数据

**"虚拟列"的处理**：NocoDB 的 "virtual column" 概念是针对 `LinkToAnotherRecord` 特化的——表示这个关系**不在该表 schema 中物化 FK 列**，而是通过中间表存储（或完全在 meta 层模拟）。这对 AdapterBacked 场景（pneuma ADR-0004）很重要：当 adapter 指向的表没法增列时，通过 virtual link 可以在 meta 层记录关系。

**可借鉴点**：

1. **UIDT vs DB type 分离**是 pneuma ADR-0002 "typed cells" 的成熟工程参照。我们的 CellType 已经是类似的 UIDT 层；NocoDB 把 UIDT + 底层 dt 拆成两层值得直接抄——它在 schema evolution 时保留了 UI 语义的稳定性。
2. **`isVirtualCol()` / `isReadOnlyColumn()` 作为一等函数**。pneuma 里这些分类目前是隐式的，应该显式化为 CellType 上的 capability 位（ADR-0002 amend）。
3. **特化列（`FormulaColumn` / `LookupColumn` / `RollupColumn` / `LinkToAnotherRecordColumn` / `AIColumn`）是独立 domain model**，不是 Column 的 union variant。这种"Column → 1:1 特化 entity"的设计让每个特殊类型有自己的存储、生命周期、hook。pneuma Transform (ADR-0003) 目前是独立的 entity——方向一致；但我们应该考虑 `DerivedColumn`（Table 内 Transform 快捷声明）作为一个特化类型，避免每个简单的 computed 列都要跑完整 Transform pipeline。

**反思**：47 种 UIDT 是 NocoDB 十年积累的结果，也是"GUI-driven product"的诅咒——每种都要画 UI、写 validator、写 formatter。pneuma 作为 AI-native 产品，可以用更 orthogonal 的 CellType 基础类型 + `render_hint`（非 first-class 的 UI 装饰）组合出等价语义，而不一定要把所有 47 种都做成一等公民。我们的"封闭 CellType"决定（ADR-0002）在这里被印证——但要警惕"封闭太快导致业务表达不出来"。

### 3.2 Data Source / 外部数据库

**源文件**：`packages/nocodb/src/models/Source.ts`（读取结果见上）

**Source 实体核心字段**：

```
identity:      id / fk_workspace_id / base_id
connection:    type (DriverClient: 'mysql' | 'pg' | 'sqlite3' | 'mssql' | ...) / config (加密)
flags:         is_meta / is_local / is_schema_readonly / is_data_readonly / enabled / deleted
integration:   fk_integration_id / integration_config / is_encrypted
```

**核心机制**：

1. **三级层次**：Workspace → Base → **Source** → Model → Column。一个 Base 可包含**多个 Source**（即一个 Airtable-like "Base" 可以聚合多个数据库！）。这是比 Airtable 更强的结构。
2. **`is_meta` 标志位**区分"这是 NocoDB 自身元数据的 source"还是"这是用户业务数据的 source"。Meta source 不可删、配置从框架默认 DB 配置取。
3. **`is_schema_readonly` / `is_data_readonly` 双读写旗标**。Schema readonly 允许查询但不允许改表结构；data readonly 连数据都不能改。这个二维正好对应 pneuma ADR-0005 的 adapter capability 声明（read / write / schema-alter 应该是独立位）。
4. **加密 config + `is_encrypted` 标志 + 新老版本迁移**。Source 的 connection config（含密码 / API key）在 meta DB 中加密存储，解密在请求时进行。
5. **`fk_integration_id` 连到 Integration**。新版本（约近两年）NocoDB 把 Source 和 Integration 分离——Integration 是"存凭据 + 凭据类型"的独立实体（可复用于多个 Source 或 Webhook 或 AI 列），Source 只是"一个引用到 Integration 的连接实例 + 这个连接在 NocoDB 里的元信息"。

**可借鉴点**：

1. **Integration 作为凭据存储实体独立于使用点**。pneuma ADR-0011 讨论了 adapter credential 模式（per-user / shared / both），但没有独立的 `Credential` / `Integration` entity。Nocodb 的拆法提示我们：credential 的生命周期（rotate / revoke / owner）和 adapter 实例的生命周期是不同的，应该独立建模。
2. **一 Base 多 Source 的嵌套**在 pneuma 也值得考虑：一个 pneuma-app 可以声明多个 data source（local stored + adapter-backed × N），在 agent 的 mental model 里被"自然地 join"。
3. **`is_schema_readonly` vs `is_data_readonly` 二维旗标**比单一 readonly 有用得多，直接抄。

**反思**：NocoDB 的 Source/Base/Model/Column 四层是**自上而下的 DB 视角**；pneuma 的 Storage model 是**自 cell 出发的 data-ref 视角**。这是根本分歧——NocoDB 假设"你有 DB / 表 / 列，我给你一层 UI+协同"，pneuma 假设"你有数据 / 语义，我帮你持久化 + 渲染"。NocoDB 的 "Source can be external DB" 在我们这里对应 `AdapterBacked Table`（ADR-0002）；我们不需要把"一个 external DB"整体抽象出来，因为 pneuma 的 adapter 粒度通常是**一个语义实体**（比如"我的 Notion 工作区"、"我的 GitHub 某个 repo 的 issues"），不是"一个 MySQL 连接"。这个定位差异要 preserve。

### 3.3 View 系统

**源文件**：`packages/nocodb/src/models/View.ts`（基类）+ `GridView.ts` / `FormView.ts` / `GalleryView.ts` / `KanbanView.ts` / `CalendarView.ts` / `MapView.ts` / `ListView.ts`（7 个特化）+ `*ViewColumn.ts`（7 个 view-level 列配置）+ `ViewSection.ts` + `ListViewLevel.ts` + `CalendarRange.ts`

**View 基类字段**：

```typescript
id?: string;
title: string;
description?: string;
uuid?: string;        // 用于 shared view 的公开 URL
password?: string;    // shared view 可选密码
show: boolean;
order: number;
type: ViewTypes;      // GRID / GALLERY / KANBAN / FORM / CALENDAR / MAP / LIST
lock_type?: 'collaborative' | 'locked' | 'personal';
row_coloring_mode?: ROW_COLORING_MODE;
created_by?: string;
owned_by?: string;
fk_model_id: string;  // 指向 Model (Table)

// 组合字段
columns?: Array<GridViewColumn | FormViewColumn | GalleryViewColumn | ... >;
sorts: Sort[];
filter: Filter;       // root filter（含子树）
meta: Record<string, any>;
fk_custom_url_id?: string;
```

**核心设计**：

1. **View 强绑到 Model（table）**：一个 view 只看一个 table。跨表展示靠 Lookup/Rollup/Link 列在 table 里先拉出来。
2. **View type 决定特化数据形状**：例如 `GridView` 有"frozen columns / row height"、`KanbanView` 有"stack_by column / cover column"、`CalendarView` 有 `CalendarRange`（start/end 日期列）、`FormView` 有"submit button text / banner image"。每个特化的存储在独立 meta 表里（`GRID_VIEW_COLUMNS` 等）。
3. **View columns 是独立 entity**，可以给每个 view 单独决定"这个列在这个 view 里叫什么 / 是否显示 / 宽度 / 位置"，不污染基础 Column 定义。
4. **Filter 和 Sort 挂到 View**：Filter 是**递归树**（`is_group` + `children` + `logical_op: and|or|not`）；Sort 是数组。
5. **Lock type 三档**：`collaborative`（所有人可改 view）/ `locked`（只读 view）/ `personal`（只自己看）。这是 pneuma 的 "view policy" 视角里**明显缺失**的一个设计维度。
6. **Shared view**：通过 UUID + 可选 password 生成公开链接。`share()` 方法生成 UUID，`sharedViewDelete()` 置空。密码 bcrypt 存储。

**Dashboard / Widget（2026 新增）**：独立于 View 体系。Dashboard.ts + Widget.ts 构成第二套可视化形态，大致是"多图表 / 多 view 拼装在一个画布上"。调研没看到完整字段定义（stub 实现），但这个方向值得关注——说明 NocoDB 已经承认**"一个 table → 一个 view"的形态不够**，需要跨多个 table / 多个聚合的 dashboard。

**可借鉴点**：

1. **View = (type, model, columns[], filter-tree, sort[], meta)** 是经典五元组，pneuma ADR-0020 可以直接抄。
2. **View columns 独立于 Model columns**，让每个 view 可以 override title / width / visibility 而不动 schema——这是 gridboard-class 应用的核心灵活性，pneuma 应该一开始就这样设计。
3. **Lock type 三档**（`collaborative` / `locked` / `personal`）——pneuma 的 policy DSL 里应该能表达"这个 view 是 personal 的（只有创建者看）"这种关系，而不是每次去 user-id grants 里写 owner 规则。
4. **Filter 作为递归 boolean tree + `fk_rls_policy_id`**：NocoDB 的 Filter 实体可以 fk 到 view / hook / row-color condition / **RLS policy** / button column / link column。也就是说 NocoDB 已经把 "filter tree" 变成了一个**通用的谓词表达式容器**，挂在任何需要 "a boolean condition over rows" 的地方。pneuma 的 predicate（policy 里那部分）和 query 的 where 子句在**本质上是同一种东西**，值得共享 data 结构。

**反思 / 分歧**：

- **View 是"Table 的投影"**在 NocoDB 是硬约束（一个 view = 一个 table）。pneuma 想做"graph view / custom view 从多个表拉"，需要额外设计——不能照抄。
- **View 没有挂载 Operation 的概念**。NocoDB 的 view 只有 filter/sort/column display，没有"这个 view 暴露哪些 action"这种东西。Action 是全局的（table-level RBAC + record-level CRUD）。pneuma ADR-0018 的 **"Operation binding to view"** 是 NocoDB 没有的维度——这是 pneuma AI-native 定位带来的新要求（详见第 5 节）。
- **NocoDB 的 Custom URL (`CustomUrl.ts`)** 允许把某个 view 挂在自定义路径下。pneuma 的 viewer 路径管理值得考虑类似机制。

### 3.4 Permission / Access Control

**源文件**：`packages/nocodb/src/models/Permission.ts` / `User.ts` / `BaseUser.ts` / `WorkspaceUser.ts` / `ModelRoleVisibility.ts` + 官方文档 `docs/product-docs/roles-and-permissions/*`

**层级**：Organization（Enterprise）→ Workspace → Base → Table → Field / Record

**Role 枚举**（workspace/base 同构）：

| 角色 | Create workspace/base | Schema DDL | Record CUD | Record R | Comment |
|---|---|---|---|---|---|
| Owner | - | Y | Y | Y | Y |
| Creator | - | Y | Y | Y | Y |
| Editor | - | N | Y | Y | Y |
| Commenter | - | N | N | Y | Y |
| Viewer | - | N | N | Y | N |
| No Access | - | N | N | N | N |

在 Enterprise 还有 Organization 级：`Org Viewer` / `Org Creator` / `Org Admin`。还有一个特殊的 **Inherit** 角色，"从 team 继承"——类似于 SpiceDB 的 `group#member` 关系。

**Table Permissions 粒度**（相对细的那层）：

- 控制对象：**Create records** / **Delete records**（两个独立开关）
- 粒度选项：`Editors & up` / `Creators & up` / `Nobody` / `Selected members or teams`（指名 users / teams）
- **不能控制 Read 和 Update**——这两个默认由 role 决定
- 明确声明："Table permissions do not control record visibility — users with access can still view all records."

**Field Permissions 粒度**（相对细的那层）：

- 控制对象：**Write**（编辑权限）
- **不支持 hide**（用户依然看得见字段名和数据）
- 粒度选项：`Editors & up` / `Creators & up` / `Nobody` / `Selected members or teams`
- **不支持 conditional**（no "when status=open" 之类）
- 计算字段（Formula / Rollup / Lookup / 时间戳）**不能配置 field permission**（因为它们本就不可写）
- 跨 API 和 shared forms 都生效

**Record-Level Security (RLS)**：

- 官方文档在 `Permission.ts` 里有 `fk_rls_policy_id` 字段，Filter 实体里有对应挂载点
- 但**公开文档 URL `/record-level-security` 返回 404**（调研时）——说明这个功能要么还没完全 ship 要么还在 Enterprise-only
- GitHub issue #9008 提到"handle PostgreSQL RLS policy violations from external DB gracefully"——说明 NocoDB 的方向更多是**透传 PG 的原生 RLS**，而不是在 meta 层重建一套 policy engine
- 一个 2022 年的讨论 #640 和 2023 年的 #6076 都在问 "NocoDB 有 RLS 吗"——说明这个功能姗姗来迟
- 结论：**NocoDB 的 RLS 是 recent / immature / 部分透传到 external DB**

**`ModelRoleVisibility.ts`**：一个独立实体，控制"某个 role 能不能看到某个 model（table）"——table 的可见性是 role 级别的旗标表，不是 role 定义里的字段。**可借鉴**：把 visibility 独立化，避免 role 定义变成巨大的 ACL matrix。

**Permission 实体细节**：

```
fields:   fk_workspace_id / base_id / entity_id (target) / entity (target type) / 
          subjects[] (users+teams) / granted_type / granted_role /
          enforce_for_form / enforce_for_automation
methods:  isAllowed() ← placeholder (return true)
          list()      ← placeholder ([])
```

关键是 `isAllowed()` 是 **placeholder**！说明 NocoDB 的权限判断**不在 Permission entity 上**，而是分散在各 controller / service / guard 里。这是 NestJS 常见 pattern 但不 declarative，无法做 pneuma 那种 "who_can / explain" 查询。

**`enforce_for_form` / `enforce_for_automation` 二元旗标**——这是一个很重要的维度：权限策略在**表单入口**和**自动化入口**的执行是否独立可控。Pneuma 的 policy DSL 目前没有这个概念；我们 ADR-0007 的 triple 是 `(subject, resource, action)`，没法表达"这条规则只在 form 入口生效"。

**可借鉴点**：

1. **粒度分三层：workspace role / table permission / field permission 是独立正交维度**，不是 table 权限继承 role 也不是 field 权限包含 table 权限。pneuma ADR-0006 已经是类似的 table+row+column 三层，方向对。
2. **`enforce_for_*` 维度**——policy 按**入口**区分是否生效，是一个值得补的概念。pneuma 的 policy context（ADR-0013 PermissionContext）可以扩展"触发来源（form / api / agent / scheduled）"作为 predicate。
3. **计算字段不能配 field permission**——是一个自然约束，pneuma 也该遵循：`cell_type=derived` 的列不能出现在 `write` permission 里。
4. **Inherit 角色（从 team / group 继承）**：pneuma 的 user-id grants（ADR-0010）目前是扁平的 user list，应该支持 team / group 层次——这是 enterprise-ready 的前提。

**反思 / 批判**：

- NocoDB 的权限模型**非常产品化**（给管理员用 UI 配的）但**非常弱 AI-friendly**：没有 declarative policy DSL、没法做 "explain why denied"、没法 "who_can_see_record X"、没法 NL 翻译成 policy。这恰恰是 pneuma ADR-0007/0008 的优势。
- NocoDB 的 Table Permission **不控制 Read 和 Update**——这是一个很大的缺口，强行把 "read / update" 压给 role。pneuma 不能学这个，我们要的是 read/update 粒度可控。
- NocoDB 的 Field Permission **不支持 conditional**——pneuma 的 `when` predicate（ADR-0007）是明确支持的，这是领先点不要丢。

### 3.5 Webhook / Automation

**源文件**：`packages/nocodb/src/models/Hook.ts` + `HookFilter.ts` + `HookLog.ts`

**Hook 实体核心字段**：

```
event:         'after' | 'before' 的 trigger 点（后文推测：after insert / after update / after delete / 
                before insert / before update / before delete）
operation:     v1/v2 string-based, v3 array-based
async:         boolean
retries:       number
retry_interval: number
timeout:       number
notification:  string | Record<string, any>  ← 可序列化 JSON
url / headers: HTTP 参数
condition:     boolean 旗标，指示 hook 是否附 filter
```

**关键特性**：

1. **三版本 operation 模型**：v1/v2 是字符串型（`"after.insert"`），v3 是数组型（`["insert", "update"]`），支持一个 hook 多个 op。V3 明确拒绝 `bulkInsert/bulkUpdate/bulkDelete` 这些"聚合 op"——说明 NocoDB 在 v3 里做了**op 原子性规范**。
2. **Hook 有自己的 Filter 树**（通过 `HookFilter` + `Filter.rootFilterListByHook()`）——即"hook 只在满足条件的行触发"。这是 adapter 同步 / webhook 自动化场景的核心。
3. **Retry / timeout / async 都是第一类字段**，不是 afterthought。这意味着 NocoDB 把 webhook 当**分布式作业**处理（不是立即同步），所以有专门的 `Job.ts` 和可能的队列后端。
4. **HookLog 记录每次执行**：成功 / 失败 / payload / response。这是 audit 的重要部分。

**可借鉴点**：

1. **Hook 作为 Operation 的同胞**——ADR-0018 的 Operation primitive，其实可以统一覆盖 "webhook / automation"。一个 Operation 可以声明：（a）UI 入口触发、（b）schedule 触发、（c）row change 触发（即 webhook）。NocoDB 的 Hook 是 "trigger-based operation"，pneuma Operation 应该把 trigger 列为属性之一。
2. **Hook 的 `async` + `retries` + `timeout` + `Job` 队列模型**——pneuma 目前没有 operation-level 的重试 / 异步 / 超时配置，应该考虑。
3. **HookLog 的失败记录**和 pneuma telemetry（ADR-0013）有直接映射；pneuma 的 event 模型应该 natively 支持 "operation execution log"。
4. **Hook Filter 树**复用 Filter 实体——Filter 是通用谓词容器，这是一个设计美学：pneuma 的 predicate DSL 应当能在 policy / query / trigger 三处都用同一 AST。

**反思**：NocoDB 的 Hook 是"表 + 事件"触发，pneuma 的触发模型会更丰富（agent action, schedule, external event, adapter change）。但从数据结构上，把 Hook 看成"Operation + trigger 条件"是正确的抽象。

### 3.6 Schema Migration / 版本升级

**源文件**：`packages/nocodb/src/version-upgrader/`（未直接读，但目录存在）+ `DataReflection.ts` / `DependencyTracker.ts`

**推断**（待核实）：

- NocoDB 有自己的 version-upgrader，meta DB 随版本演进（187 个 release，肯定踩过很多 schema migration）
- `DependencyTracker.ts` 暗示 NocoDB 跟踪 column 之间的依赖（e.g. Formula A 依赖 Column B；B 改名 / 删除时 A 要级联处理）
- `DataReflection.ts` 暗示 schema 反射机制——对 external DB source 可以反向扫出 schema，生成 NocoDB 的 Column metadata

**可借鉴点**：

1. **DependencyTracker 是 Formula / Lookup / Rollup 体系的基础设施**。pneuma 的 Transform / Derived column / 跨表 Lookup 当天需要类似的依赖图。**这个值得专门做一条 ADR**（可能叫"DependencyGraph of Cells / Transforms"）。
2. **Meta DB 的 version-upgrader**是"NocoDB 自己的 schema migration 产品"——pneuma 作为 framework 也需要 meta store 的版本迁移。这个和 pneuma-app 的"用户数据 schema migration"是两件事（后者是 ADR-0016/0017 的范畴）。

### 3.7 Multi-tenancy / Workspace

**源文件**：`Workspace.ts` / `WorkspaceUser.ts` / `BaseUser.ts`

**模型**：

- Workspace 是顶层容器
- User 通过 `WorkspaceUser` 关联到 Workspace（携带 role）
- 同一个 User 可以在多 Workspace 各有 role
- Workspace 下有多个 Base
- Base 下有多个 Source
- Source 下有多个 Model
- Model 下有多个 View

**Enterprise 加一层 Organization**（组织级别，多 Workspace 的父）。

**可借鉴点**：

1. **多层 tenant (Org → Workspace → Base → Source)** 是给"平台型部署（一套 NocoDB 服务多团队）"准备的。pneuma 目前单层（一个 app），但长期肯定要考虑。
2. **User ↔ Workspace 的 M:N 关系 + 每 membership 独立 role**，是基础 pattern。pneuma ADR-0010 的 user-id grants 已经对齐，但**显式的 Team / Group 层**还缺。

### 3.8 Formula / Lookup / Rollup 执行引擎

**源文件**：`FormulaColumn.ts` / `LookupColumn.ts` / `RollupColumn.ts` + 推断有 `packages/nocodb/src/helpers/formulaFnHelper.ts` / `packages/nocodb-sdk/src/formulaParser/`（本次调研 WebFetch 此目录返回 404——可能路径有变，或要直接看 master branch 的 `packages/nocodb/src/` 下相关 helpers）

**FormulaColumn**：

- 存 `formula_raw`（用户输入）+ `formula`（编译后）+ `parsed_tree`（AST，stringified JSON）
- AST 预解析 + 缓存策略
- Formula 函数库（来自 Airtable / Excel 传统）：`IF() / SWITCH() / AND() / OR() / NOT() / CONCAT() / LEFT() / RIGHT() / MID() / LEN() / SEARCH() / SUBSTITUTE() / DATEADD() / DATEDIFF() / WEEKDAY() / NOW() / ROUND() / MAX() / MIN() / AVG() / SUM() / COUNT()` 等
- 执行时机：推测 **SQL 侧**（把 AST 编译成 SELECT 子查询），跨 DB dialect——这是 Airtable-style 产品的工程惯例

**LookupColumn**：通过一个 LinkToAnotherRecord 列拉取关联 table 的某个列的值。execution 是 join。

**RollupColumn**：LookupColumn 的聚合版（count / sum / avg / min / max / concat）。

**Count / Links**：特化的关系列快捷（count 关联行数；Links 是新版的关系展示）。

**可借鉴点**：

1. **AST 存在 meta 里而不是每次 parse**——pneuma Transform（ADR-0003）的 prompt 也应该考虑预编译 / 指纹缓存（当前 ADR 没提）。
2. **Formula 是 SQL 侧执行**（跨 dialect 编译），不是应用侧。对 pneuma：Derived Table / Computed Cell 如果量大，**不能每次 agent 请求才算**，需要下推到 store 层。这是一条 performance 方向的新思考。
3. **Lookup / Rollup 对"预定义 relation"的强依赖**——你必须先定义 LinkToAnotherRecord 列，才能基于它配 Lookup/Rollup。这正好支持 pneuma ADR-0019 的 Q-focus 2 "预定义 relation" 倾向。

### 3.9 Audit / Comment / Notification

**源文件**：`packages/nocodb/src/models/Audit.ts`

**Audit 实体字段**：

```
identity:     id / fk_user_id / fk_model_id / fk_parent_id / source_id
context:      fk_workspace_id / base_id / row_id
user info:    user / user_agent / ip
audit data:   op_type / op_sub_type / description / details / version
```

**关键特性**：

1. **事件类别通过 `op_type + op_sub_type`** 扁平化表达（具体枚举在 `nocodb-sdk/AuditV1OperationTypes`，本次未深读）
2. **IP / user_agent 都是一等字段** —— 合规 / 安全审计场景重要
3. **`row_id` 直接挂到具体 row** —— 可以支持"这条记录过去怎么变的"的查询（即 per-row audit trail）
4. **`version` 字段** 表明 audit schema 本身可能演进；API 版本迁移时 audit 不丢
5. **默认 pagination 25** —— 暗示可预期大数据量
6. **未见显式 retention / partitioning** —— NocoDB 没表态"老 audit 怎么清理"

**对 pneuma ADR-0014 的启示**：

- **字段清单值得直接抄**：我们的 audit event 目前没明确 ip / user_agent / op_sub_type / row_id / version 的处理；NocoDB 的清单是生产成熟后的沉淀
- **per-row audit** （通过 `row_id`）是一种很有价值的组织方式——"这行数据过去发生了什么"是 End User 想问的典型问题
- **Retention / partitioning 留白** 是 NocoDB 自己的 todo，pneuma 可以从一开始就明确（Audit ADR-0014 follow-up）

### 3.10 Script / Extension / AIColumn / Dashboard

**Script.ts 是 stub**（placeholder），但存在说明 NocoDB 规划了"用户写脚本"的形态——类似 Airtable Scripting 或 Retool Workflows。目前未实现。

**Extension.ts** 同样存在。暗示 NocoDB 有"用户端扩展插件"规划（不同于 `Plugin.ts` 可能是服务端插件）。

**AIColumn.ts**：LongTextColumn 的子类，字段 = `fk_integration_id`（LLM 凭据引用）+ `prompt` / `prompt_raw` + `model` + `error`。即**一个列绑定一个 prompt 和模型**，每行有自己的生成结果。这是一个**非常重要的观察**：

> NocoDB 把 "LLM 能力"作为**字段类型**接入，而不是作为**交互主体**。用户还是手动编辑行、手动触发生成；AI 是一种"特殊的 formula"。

这与 pneuma 完全相反：pneuma 的 Agent 是**第一类交互主体**，用户对 Agent 说话，Agent 操作所有东西。两种哲学对比：

| 维度 | NocoDB AI | pneuma |
|---|---|---|
| AI 定位 | 一种字段 type / 列级别能力 | 贯穿 build-phase + runtime 的主交互 |
| 触发 | 行数据变化 / 手动 | 自然语言对话 |
| 作用面 | 单元格填充 | schema / policy / view / data / operation 全面 |
| 用户 mental model | "一个聪明的 formula" | "一个理解我意图的 collaborator" |
| 故障处理 | error 字段存错误 | rollback / disclosure / 继续对话 |

这不是 NocoDB 做错了——而是他们的产品假设是"Airtable-like 电子表格的用户"，Airtable 用户不会跟电子表格"说话"。但 pneuma 的赌注恰恰是"未来的 Builder 会"。

**Dashboard / Widget**：2026-04 新增。方向是"多表 + 多视图的聚合画布"。具体 schema 还在演进。`Widget.ts` 目前存在但 stub。方向上类似 Retool dashboard 或 Metabase dashboard。

**可借鉴点**：

1. **Dashboard** 是 pneuma 当前 View 模型的"二维扩展"——我们 ADR-0020 候选 view kind 里 "detail / graph" 都可以被理解为 **Widget 拼装的特例**。值得思考"View / Dashboard 是同一 primitive 还是两个"。
2. **AIColumn** 作为对比维度：pneuma 不把 AI 当字段类型，但我们可以有 **"AI-computed cell"** 作为 Transform 的 sugar（`ai-derived<CellType>` 作为 CellType，自动绑 prompt + integration）。这是对 ADR-0002/0003 的一个可能 amend。

---

## 4. 层 3 — 对 18 条 ADR 的印证与反思

使用图标：✅ 正向印证 / ⚠️ 分歧但理由清楚 / ❓ 值得反思 / 🆕 新视角

### ADR-0001 Archetype scope（MVP A+B，D 留门）

- ✅ NocoDB 本身就是 "A+B" 的典型实现：A（typed data + CRUD）+ B（多 view 可视化 + 协同）。它证明了这个 archetype 有明确市场。
- 🆕 **Archetype 扩展维度**：NocoDB 的 Dashboard（2026-04 新增）+ NocoDocs（知识库）说明，一个成熟 gridboard 产品最终会往 C（文档 / wiki 内嵌数据）和 E（dashboards）扩展。pneuma 可以提前想好 archetype 的扩展路径。

### ADR-0002 Storage 核心 — 类型化 Cell + 多态 data-ref

- ✅ NocoDB UIDT / dt 分层的工程实践印证了"UI 类型 / DB 类型"应独立建模。
- ✅ `isVirtualCol()` / 独立的 `LinkToAnotherRecordColumn` / `LookupColumn` / `RollupColumn` 对应 pneuma 的 AdapterBacked / Derived / Hybrid 四种 source 类型，方向一致。
- ❓ **需要补 `ref-row-list<Table>` CellType**（已在 OPEN-QUESTIONS 里记录）。NocoDB 的 `Links` 列（一个 cell 含多个关联 row）已证明这是常用模式；`LinkToAnotherRecord` 的 `type='hm'|'mm'|'oo'` 六种还暗示关系基数要被显式编码。
- ❓ **AIColumn 值不值得给 CellType 留个位**？即 `ai-derived<CellType>` 是不是特殊的 Derived cell？我倾向"不是新 CellType，是 Transform 的 impl='prompt' 自然承载"（符合 ADR-0003），但应该在 Transform sugar 里提供开箱即用的 AI 列快捷方式。
- ❓ **NocoDB 的 `internal_meta` vs `meta` 二分**值得模仿。pneuma 目前 cell 的 metadata 只有一层，没区分 "API-exposed vs internal constraint"。

### ADR-0003 Transform 作为 first-class 原语，与 Adapter 分开

- ✅ NocoDB 的 `FormulaColumn` 独立 entity + AST 预解析 + `DependencyTracker` 印证了"计算字段是独立的 domain object"。
- ❓ **NocoDB 的 Formula 是 SQL 侧执行**（性能考虑）。pneuma Transform 当前的语义是"output cell = f(input cells)"，没明确说执行侧是 agent-runtime 还是 store-pushdown。对于 `impl='code'` 的简单 Transform，值不值得下推到 store？**这是 ADR-0003 的 follow-up 候选**。
- ❓ **AST cache / versioning**：NocoDB 的 `parsed_tree` 缓存机制（parse 一次，改 formula 才 re-parse）对应 pneuma Transform 的 prompt 预编译 / 指纹缓存——应当作为 ADR-0003 amend 纳入。
- 🆕 **Dependency tracking**：NocoDB 的 `DependencyTracker.ts` 是"改 B 列时自动级联失效 Formula A"的基础设施。pneuma 的 Transform 需要类似设施（可能叫 `TransformDependencyGraph`）。这是**现有 ADR 没有展开的 missing piece**。

### ADR-0004 Adapter 协议由 framework 定义，marketplace 在 meta-app

- ✅ NocoDB 的 `Integration.ts` + `Plugin.ts` + `IntegrationStore.ts` 印证了"connector 协议 + 凭据存储 + marketplace"应该拆开建模。
- ❓ **Integration 与 Source 分离**（凭据独立于使用）——pneuma ADR-0011 可以 amend：credential object 应当有独立生命周期（rotate / revoke / share-to-N-adapters），而不是 per-adapter 的字段。
- ❓ **是否 pneuma 应该学 NocoDB 暴露 MCP token**？即 pneuma-app 应当天然是一个 MCP server 吗？这对"pneuma-app 被其他 agent 消费"的场景很重要。值得新 ADR。

### ADR-0005 Adapter 能力声明与框架自动映射 cell 写操作

- ✅ NocoDB 的 `is_schema_readonly` / `is_data_readonly` 二维 flag 是 capability 声明的简化版，印证了方向。
- ❓ **Capability 应拆得更细**：NocoDB 只有"schema writable / data writable"两位，不够 granular。pneuma 已经比这细（row CUD × column set × 条件），方向对。
- 🆕 **Capability + NestJS guard** 的 imperative 模式 vs pneuma 的 declarative capability 映射——NocoDB 反面教材印证我们方向。

### ADR-0006 权限粒度 — Table + Row + Column

- ✅ NocoDB 的 Table Permission / Field Permission / Record Permission（RLS）三层正好对应。
- ⚠️ NocoDB 的 Table Permission **只管 Create/Delete**，Read/Update 由 role 管——这是他们的缺陷，pneuma 不要学。我们的 ADR-0006 把 Read/Update/Create/Delete 都当 action 处理，方向更正。
- ❓ **"计算字段不可配 field permission"** 是隐式约束，应纳入 pneuma ADR-0006 的明文约束。

### ADR-0007 权限 DSL — 封闭词汇表的三元组 YAML

- ✅ NocoDB 的 Filter 树（`logical_op`、`is_group`、`children`、`comparison_op`）就是一个**成熟的谓词 AST 形态**，印证 pneuma 的封闭词汇 YAML 方向是合理的。
- ❓ **Filter 实体可挂在 view / hook / rls-policy / button / link 多处**——复用通用谓词。pneuma 的 predicate 也应该共享，不要每处重新设计。
- ❓ **`enforce_for_form` / `enforce_for_automation` 旗标**提示 pneuma policy 需要"执行上下文"维度，即 policy 在 agent / UI / API / scheduled / webhook 各路径可分别启用。这是 ADR-0007 的 amend 候选。
- 🆕 **NocoDB 的 `comparison_sub_op`（如 "today" / "oneWeekAgo" / 特化日期谓词）** 是 UX 友好的 shortcut；pneuma 的 predicate vocabulary 可以考虑引入这种 sugar。
- ❓ **Rule precedence**：NocoDB 没有显式声明，但 NestJS guard 的 chain 顺序决定。pneuma ADR-0007 amend 要澄清（OPEN-QUESTIONS 已记）。

### ADR-0008 NL 双向（evaluatePolicy / who_can）

- ⚠️ NocoDB 完全没有这个能力——Permission.isAllowed() 是 stub，policy 没有 queryable 表示。这恰恰是 pneuma 的**差异化优势**，不是反面教材。
- 🆕 **NocoDB 的缺失成为 pneuma 的 selling point 证据**：Airtable / NocoDB 类产品的管理员痛点之一就是"我也不知道这条规则谁看得到谁看不到"；pneuma 的 NL 双向能直接解决。

### ADR-0009 权限默认姿态 — Public 基线

- ⚠️ NocoDB 的默认是 **"invite-only"**（创建 workspace 后只有 owner，显式邀请才扩）。这与 pneuma "public baseline" 相反。
- 这是**产品假设决定的**：NocoDB 假设企业私有数据；pneuma ADR-0009 假设 Builder 先做原型、后收紧。两边都有道理。但注意：**pneuma 如果做企业 pneuma-app**，default 要能改为 invite-only（通过 template 设置）。

### ADR-0010 User-id grants 与 role 并列

- ✅ NocoDB 的 Table Permission / Field Permission 都支持 "Selected members or teams"——和 role 并列，印证方向。
- 🆕 **Team / Group 层**：NocoDB 有 team 概念（Enterprise，Workspace 下可以建 team），允许 grant subject = team。pneuma ADR-0010 当前只谈 user-id，应扩到 team/group。

### ADR-0011 Adapter credential 模式

- ✅ NocoDB 的 Integration 独立于 Source，credential 独立建模，印证方向。
- ❓ **Integration 被多 consumer 共享**（Source、AIColumn、Hook 都能引用同一个 Integration）——这在 pneuma 中也应该成立。credential 与 adapter 实例 1:N，不是 1:1。

### ADR-0012 Agent 权限 — Build-phase owner / Runtime 继承

- 🆕 **NocoDB 的 Script.ts / AIColumn / Webhook 没有独立的"agent principal"概念**——它们的执行是以"创建者"身份进行的（或匿名 system）。pneuma 把 agent 作为独立 principal（Build-phase = owner / Runtime = 继承 end user）是更清洁的设计。NocoDB 的 webhook 身份问题在 GitHub issue 里能搜到（"以 system 身份执行绕过权限"）。
- ❓ **Build-phase agent 的 trusted input 边界**（E12 记的）在 NocoDB 里的对应是"Script 的沙箱"——但 NocoDB Script 是 stub 还没做。我们可以预见这是一个实现难点。

### ADR-0013 遥测事件模型 — 5 类事件 + PermissionContext 传播

- ✅ NocoDB 有 `Audit.ts` + `HookLog.ts` + `SyncLogs.ts`，印证"不同事件类别要独立 sink"的方向。
- ❓ **NocoDB 的 Audit 是 append-only single table**（合规友好）。pneuma ADR-0014 方向对。
- 🆕 **HookLog 的 retry count / 失败 response payload** 提示 pneuma event model 需要 natively 带 "execution 结果结构化字段"（不只 status 码）。

### ADR-0014 审计子集

- ✅ NocoDB 有 Audit 独立 entity，方向印证。
- ❓ **NocoDB Audit 具体字段**（调研未深入）——可以后续补看 `Audit.ts` 确认字段对 pneuma 的启发。

### ADR-0015 Sinks + Trace

- ⚠️ NocoDB 没有显式的"sink 抽象"。Audit / HookLog / SyncLogs 都存在 meta DB 的对应表里，没有 "pluggable destination" 概念。
- pneuma 的 sink 抽象**领先 NocoDB**，没什么要反思的。

### ADR-0016 Dev = Prod 快照沙箱

- ⚠️ NocoDB 完全没有 "dev vs prod" 概念——它就是一个 production-running 产品，schema 改了就改了，手动 restore 靠 DB backup。
- 🆕 **NocoDB 不需要 dev/prod 分离**，因为它的 builder = end-user =同一批人，没有"构建 vs 运行"两阶段。这反过来说明 pneuma ADR-0016 的 dev/prod 分离**是 AI-native 构建流所独有的需求**——不是 gridboard 产品都需要的。
- ❓ **对"直接生产 pneuma-app"单人场景**（Developer = Builder = End User），pneuma 能否 gracefully 退化为"没有 dev/prod 分离"？ADR-0016 值得补一个 "degenerate mode" 子节。

### ADR-0017 Rollback 数据语义

- ⚠️ NocoDB 的 "rollback" 基本不存在——你改了 schema 就改了，数据删了就删了。依赖 DB 层 backup / transaction。
- 这是 pneuma 对 NocoDB 类产品的**显著优势**，不要丢。

### ADR-0018 Operation 作为 first-class primitive（UI + Agent 双绑）

- 🆕 **这是最值得对比的一条**。NocoDB 完全没有"Operation"抽象：
  - UI 侧：一行的 CRUD 按钮 = hardcoded 在 grid view 里，没有"自定义 row-level action"
  - Agent 侧：AIColumn 是列级能力，没有 "agent 触发 table 级 action"
  - Webhook 侧：Hook 是 "trigger → send HTTP"，不是"用户调用的 action"
  - Automation 侧：Script / Workflow 是 stub
  - 唯一接近的是 **Button column**（一行上出现一个按钮，点了可以跳转 URL / 触发 webhook / 生成 AI 文本）——这是一个 **per-row action primitive**，但只是 column 的一种变体，没有 Operation 的**三重绑定**（UI / Agent / Audit）
- ✅ pneuma 的 Operation primitive 是**更 ambitious 的抽象**。如果我们做对了，它把 NocoDB 分散在 Button / Hook / Script / Workflow / AIColumn 里的能力**统一**成了一个原语。这是一条 differentiation 线。
- ❓ **Operation vs Button column 的边界**：Button column 是"一个 column 的 cell 是 button"——pneuma 要不要也支持"cell 本身是 operation trigger"（即 Operation 的一个 UIBinding kind）？我倾向于支持，但作为 OperationUIBinding 的 flavor，不是独立 CellType。

### 综合

| ADR | 印证 | 反思 / Amend 需求 |
|---|---|---|
| 0001 | ✅ gridboard 产品验证 | Archetype 扩展路径（dashboard / doc） |
| 0002 | ✅ UIDT 分层印证 | `ref-row-list` / AI-cell / internal_meta |
| 0003 | ✅ Formula 独立印证 | **DependencyTracker**（缺失！）/ SQL pushdown / AST cache |
| 0004 | ✅ marketplace 分离 | MCP-as-pneuma-app / Integration 拆分 |
| 0005 | ✅ capability 声明 | - |
| 0006 | ✅ 三层粒度 | Read/Update 可配（不学 NocoDB 缺陷） |
| 0007 | ✅ 谓词 AST | `enforce_for_*` / `comparison_sub_op` / rule precedence |
| 0008 | 🆕 pneuma 差异化 | 对外 pitch 此优势 |
| 0009 | ⚠️ 产品假设差异 | template 可改 default |
| 0010 | ✅ subject 多态 | **Team / Group 层** |
| 0011 | ✅ credential 独立 | 1:N 复用 |
| 0012 | 🆕 principal 清洁 | untrusted input sandbox |
| 0013 | ✅ 多 sink 类别 | retry/response structured |
| 0014 | ✅ append-only | - |
| 0015 | ⚠️ pneuma 领先 | - |
| 0016 | ⚠️ 差异场景 | degenerate mode |
| 0017 | ⚠️ 差异场景 | pitch 优势 |
| 0018 | 🆕 大优势 | Button column 作为 UIBinding flavor |

---

## 5. 层 4 — 对 Query DSL (0019) 和 View System (0020) 的启示

### 5.1 对 ADR-0019 Query DSL 的直接启示

**Q-focus 1: Query 表达形态（code / 声明式 / 混合）**

NocoDB 给出了一个完整的**声明式 filter + sort + limit/offset 的 URL-query 形态**：

```
?where=(name,eq,Alice)~or(age,gt,30)
&sort=-created_at
&limit=25&offset=50
&fields=id,name,email
```

这个形态的**优点**（pneuma 可学）：

- 足够覆盖 80% 场景
- 序列化友好（可以存成 view.meta 里的 JSON）
- AI 可读可写
- 可以从 URL-string 往 AST 双向

这个形态的**缺点**（pneuma 要避开）：

- 嵌套深时可读性差（pneuma YAML 形态可避免）
- 不支持复杂 join（Lookup/Rollup 是**预定义**而非 query-time join）
- 不支持聚合（`group_by` / `having` 不在 query 里，要靠 RollupColumn 或 Dashboard 聚合）

**推荐倾向（给 ADR-0019）**：
- **Option C（混合）**：声明式 YAML 表达 filter/sort/fields/with；复杂 case 允许 `handler: <ts file>` 但**要强制 outputSchema 声明**（便于 agent 理解返回形状）
- **借 NocoDB 的 comparison_op 词汇表**：eq / neq / gt / gte / lt / lte / like / nlike / in / nin / btw / nbtw / null / notnull / empty / notempty，加上**日期 sub_op**（today / yesterday / thisWeek / lastNDays / nextNDays / etc）
- **`logical_op: and|or|not` + `is_group + children`** 直接抄 NocoDB Filter 的递归 AST

**具体示范（YAML 形态，推荐给 ADR-0019）**：

```yaml
# pneuma query 示例
query: list_pending_bookmarks
reads_only: true
output_schema: { ref: row-list<Bookmark> }
where:
  logical_op: and
  children:
    - column: status
      op: eq
      value: pending
    - logical_op: or
      children:
        - column: created_at
          op: date
          sub_op: lastNDays
          value: 7
        - column: pinned
          op: eq
          value: true
sort:
  - column: created_at
    direction: desc
fields: [id, title, url, created_at, status]
with:
  - interpretations        # 预定义 relation，带出 lens 产物
cursor: { size: 25 }
```

**与 NocoDB 的差异（pneuma 做得更好的地方）**：

- YAML 可读性远胜 URL query `(col,op,val)~and(...)` 这种 flat string
- `with: [interpretations]` 明确对应"预定义 relation 引用"（NocoDB 需要 Lookup/Rollup 列先占位）
- `output_schema` 强制声明让 agent 无需猜返回结构
- `reads_only: true` 和 ADR-0018 的 Operation primitive 对齐（NocoDB 里 query 与 write action 没统一）

**与 NocoDB 一致（直接复用的地方）**：

- `logical_op: and|or|not` + `children` 递归结构
- `op: eq|gt|in|btw|...` 词汇
- `sub_op: today|lastNDays|thisWeek|...` 词汇
- `fields` projection 概念
- cursor 与 `size` 关联

**Q-focus 2: 跨表关系（join）**

NocoDB 完全**不做 query-time join**。所有跨表展示必须先通过 `LinkToAnotherRecord` + `Lookup` / `Rollup` **在 schema 层预定义**。这强烈印证了 pneuma OPEN-QUESTIONS 里的倾向：**"预定义 relation + 引用"**。

**具体建议**：

- Table schema 里声明关系列（类似 NocoDB LinkToAnotherRecord），含反向引用（`bookmarks.interpretations`）
- Query DSL 里用 `with: [interpretations]` 指示"带上这个关系的相关 rows"
- **不支持** query-time 任意 join（保持简单 + 安全 + 可缓存）
- 复杂 join 场景走 **Derived Table**（pneuma ADR-0002 已支持）

**Q-focus 3: 聚合能力**

NocoDB 的聚合能力全在 **RollupColumn**（count / sum / avg / min / max / concat），**不在 query 里**。即：

- 要聚合 → 先建 Rollup 列 → 然后 query 读这列（或者后来的 Dashboard aggregate）
- query 本身不支持 `GROUP BY / HAVING`

**推荐倾向（给 ADR-0019）**：

- MVP **只支持列级聚合**（和 NocoDB 一致）
- 需要 group_by / cosine similarity 的场景走 **Derived Table**
- **特殊：cosine similarity / embedding search 不作为 query operator，而是作为 Adapter 能力**（vector DB adapter 提供 similarity-typed cell）

**Q-focus 4: Query 构造方**

NocoDB 的 **view filter / sort 是 Builder 配置**（通过 GUI）；同时 **REST API 允许任意 filter string** 传入（安全由 permission 层兜底）。这是"双模式"。

**推荐倾向（给 ADR-0019）**：

- Builder 预定义 query（存在 view.meta 里）—— **主路径**
- End User 临时 override（如 UI 加 filter）—— **只在内存 / URL，不落盘**（V-focus 4 的倾向）
- **不支持**完全任意的 ad-hoc query from End User（避免性能 / 安全问题）
- Runtime Agent 可以在其 tool surface 内发起 query（tool surface 由 Builder 定义）

**Q-focus 5: Pagination**

NocoDB 用 **offset/limit**——大表性能差（offset 扫描），但足以 cover Airtable-level 规模。

**推荐倾向（给 ADR-0019）**：

- **MVP cursor-based 优先**（sorted by id + last_seen_id）
- offset 作为 fallback（小集合 / pagination UI 友好）

**新增 Q-focus（NocoDB 启发）**：

- **Q-focus 6: Fields selection**（projection）。NocoDB 的 `fields=a,b,c` 是最基本的省流量方式。pneuma 的 query 也该支持，特别是 adapter-backed 表（减少远程调用成本）。
- **Q-focus 7: Filter AST 的复用**。NocoDB 的 Filter 实体同时被 view / hook / rls-policy / button / link 复用。pneuma 应当把 `where_clause` 设计为独立 AST 类型，可以挂在 query / policy predicate / trigger condition / view preset 任何地方。
- **Q-focus 8: Query 的 cache & dependency**。Formula 能 cache AST（NocoDB parsed_tree），query 可以更强：带 `cache_ttl` / `invalidation_dependencies` 声明。这是 AI-native 的特色——允许 transform 的输出缓存跨 session 复用。

### 5.2 对 ADR-0020 View System 的直接启示

**V-focus 1: 内置 view kind**

NocoDB 7 种：**Grid / Gallery / Kanban / Form / Calendar / Map / List**。每种都有专属的 `*ViewColumn.ts` 存储 view-level 的列配置。

**观察**：

- 7 种里 **Form / Grid / Gallery** 是真正高频；Kanban / Calendar / Map 是 niche-但-必要；List 是新增（document-style）
- pneuma 当前倾向 "MVP 4 个：grid / card-list / detail / custom"——**基本一致**（pneuma 的 card-list 可近似 gallery）
- **Form 是 NocoDB 独立 view kind**，pneuma 不要忽视——"builder 建的 form 给 end user 填"是一个超常见的 archetype，不能只靠 custom view 实现

**推荐倾向（给 ADR-0020）**：

- MVP = **grid / card-list / form / detail / custom** —— 5 个，加 `form` 回来
- Kanban / Calendar / Map **作为 custom view 实现示例**，不内置
- Form 要是内置，因为：（a）高频；（b）form 的"schema → UI auto-gen" 和 pneuma agent 能力天然契合；（c）form 的 submit action 天然对接 Operation（ADR-0018）

**V-focus 2: View 挂载 Operation 语法**

NocoDB 的 view 没有 "operation binding" 概念（§3.3 反思），但 **Button column** 是最接近的 analog。Button column 的数据（一行一个 button）可以触发 URL / webhook / AI 生成——**这是 per-row action 的原型**。

**推荐倾向（给 ADR-0020）**：

- **引用式**：view 声明 `operations: [op-id-1, op-id-2]`（按 id 引用，不重定义）
- **挂载位置**：`operations.row_level: [delete, share]` / `operations.table_level: [import, add_row]` / `operations.field_level[col_id]: [transcribe]`
- **Button column 映射**：一个 OperationUIBinding 的 flavor 是 "in_cell_button"，即某个列在 grid 里渲染成按钮，按钮触发 operation——这是一个纯装饰，不是独立 CellType

**V-focus 3: Custom view 数据契约**

NocoDB 完全没有 custom view（唯一接近是 Extension，但 stub）。所以参考不了。

**推荐倾向（给 ADR-0020）**：

- `{ rows, operations, ctx: { user, view_config, table_schema } }` —— 保持 pneuma OPEN-QUESTIONS 的倾向

**V-focus 4: End User 临时 override view**

NocoDB 允许 End User（Editor+）临时改 filter/sort，**会保存到 view**（默认）或保存到 personal view（如果是 personal lock）。即：**view 有 "personal copy" 概念**。

**推荐倾向（给 ADR-0020）**：

- 默认：临时 override **只在内存 / URL**，不落盘
- Post-MVP：支持 **personal view fork**（类似 NocoDB personal lock）——End User 在原 view 基础上创建个人 copy

**V-focus 5: View 与 Policy 的关系**

NocoDB：view 本身没有独立 policy 资源；view 能看到的行由 `ModelRoleVisibility` + `Filter`（含 RLS）级联过滤。**但 shared view 有独立的 `uuid / password` 配置**，形成事实上的 "view:<uuid>" 资源。

**推荐倾向（给 ADR-0020）**：

- `view:<id>` 作为 policy resource（ADR-0007 已支持）**独立**于 table policy
- **View 内的行仍过 row-level policy**（两层过滤）
- **NocoDB 的 lock_type 三档借鉴**：`collaborative` / `locked` / `personal` 作为 view 的一个 meta 属性，policy 可以直接引用（`where view.lock_type = 'personal' and user != view.owner then deny`）

**新增 V-focus（NocoDB 启发）**：

- **V-focus 6: Shared view public access**。NocoDB 的 shared view（uuid + password）是**匿名访问**通路——没登录的人也能看。pneuma 的 End User runtime 权限模型应该显式支持"匿名 share"作为一等概念。
- **V-focus 7: View columns 独立于 Model columns**。NocoDB 的 7 个 `*ViewColumn.ts` 表明"view-level column config（width / hidden / order / rename）"是独立存储的。pneuma 应该同样：view 里对同一个 column 可有 override 的 title / width / visibility，不影响 schema。
- **V-focus 8: Row coloring**。NocoDB 的 `RowColorCondition.ts` + `row_coloring_mode` 提供"按 filter 条件染色行"。这是 view 的一个特殊"装饰层"——值得在 pneuma view meta 里有对应 slot（"visual hints"）。

### 5.3 案例对比：在 NocoDB vs pneuma 里做"分享书签"这件事

场景：书签 table 有一个"分享给 friend"的 per-row action。End User 点按钮 → 弹 dialog 选 friend → 系统发通知 → row 上记录 "shared_with"。

**NocoDB 做法（基于当前能力拼装）**：

1. 在表里加一个 `ButtonColumn`，配置"点击触发 webhook"
2. 在 webhook 里配置 HTTP POST 到外部 URL（必须自己部署一个 service）
3. 外部 service 接收 webhook → 处理通知 → 再调 NocoDB REST API 写 shared_with
4. 或者：在 NocoDB 里加一个 AIColumn 当作 hack 的执行器（因为 AIColumn 可以根据 prompt 修改别的列）— 但这是非正交的 hack
5. Audit trail：webhook 执行记录在 `HookLog` 里，shared_with 写记录在 `Audit` 里，两套日志分裂
6. Agent 想触发同样行为：只能通过 REST API（model 给 agent 一个 curl 命令），没有 semantic tool
7. 权限：webhook 执行用 system identity；agent 执行用 api-token 的 user identity；UI 点击用当前登录 user——**三套 identity 难协调**

**pneuma 做法（基于 ADR-0018 Operation primitive）**：

```yaml
# 一个 Operation 定义覆盖所有入口
operation: share_bookmark
reads_only: false
input_schema:
  bookmark_id: { ref: row<Bookmark> }
  friend_user_id: { ref: user }
handler: ./handlers/share-bookmark.ts
ui_bindings:
  - kind: row_action
    view: bookmarks_grid
    label: "Share"
    icon: share
audit:
  op_type: share
  op_sub_type: bookmark_share
policy:
  # user 必须拥有 bookmark 才能 share
  - subject: user
    where: bookmark.owner == user.id
    action: execute
agent_tool:
  description: "Share a bookmark with a specific friend"
```

一份声明：
- UI 按钮自动出现在 grid view 的行 action 里（ui_bindings）
- Agent 自动获得同名 semantic tool（agent_tool）
- API endpoint 自动可用（同逻辑）
- Audit 自动发出对应事件（audit 块）
- 权限自动应用（policy 块）
- Identity 统一由 caller context 带入（ADR-0012）

**差异的根本**：NocoDB 的"触发点（UI / agent / API / webhook / schedule）"是**异构的 5 类不同实体**；pneuma 的 Operation 是**统一的 1 类**，通过 `ui_bindings` / `agent_tool` / `triggers` 声明它在各入口是否可触发。

**这是 pneuma 的代际优势**——不是"AI 更智能"，而是"抽象更统一"。AI-native 的最深层意义不是"一切都用 AI 做"，而是"**UI、Agent、API、Automation 四种 caller 在同一个抽象下对接**"。

### 5.4 综合结论

（§5.3 是一个案例对比的说明，不是新的决策。下面综合 §5.1-5.3。）

**ADR-0019 的起草方向（受 NocoDB 启发后）**：

1. **声明式 YAML + 必要时 handler escape hatch**（Option C）
2. **复用 NocoDB Filter AST 形态**（logical_op / is_group / children / comparison_op + sub_op）
3. **关系预定义，不 query-time join**
4. **Projection (`fields`) + cursor pagination + cache_ttl** 都要有
5. **query 的 where clause 是独立 AST 类型**，可在 policy / trigger / query 共享

**ADR-0020 的起草方向（受 NocoDB 启发后）**：

1. **MVP 5 view kind：grid / card-list / form / detail / custom**
2. **View columns 独立存储**，view-level override schema-level
3. **Lock type 三档**（collaborative / locked / personal）
4. **Operation 按 id 挂载**，含 `table_level / row_level / field_level` 三个位置
5. **Shared view 独立 uuid + 可选密码 + policy resource `view:<uuid>`**
6. **Row coloring / visual hints 作为 view meta 的一个 slot**

---

## 附加：核心维度 side-by-side 对照

该表是"给想快速抓差异的读者"的一页速查。每一行是一个原语 / 能力维度。

| 维度 | NocoDB | pneuma | 对齐度 | 备注 |
|---|---|---|---|---|
| **产品形态** | 完整 app（NestJS + Vue） | library / runtime（写 template 用） | 不同 | NocoDB 可嵌入只有 iframe / REST；pneuma 是 infra |
| **核心数据单位** | Model (Table) + Column（UIDT 47 种） | typed cell + data-ref（4 种 Table source） | 不同 | NocoDB 自上而下（DB → UI）；pneuma 以 cell 为起点 |
| **DB 层多样性** | 7 种 SQL dialect（Knex） | 由 adapter 决定 | 不同 | NocoDB "透传 SQL"，pneuma "over any store" |
| **多 source/base 组合** | 一 Base N Source（M:1） | 一 pneuma-app 可声明多 adapter | 相近 | 设计哲学一致 |
| **Schema migration** | `version-upgrader/` 管 meta；用户数据靠手动 | ADR-0016/0017 双模式 + snapshot | pneuma 领先 | NocoDB 无 dev/prod 概念 |
| **Cell 计算** | Formula / Lookup / Rollup 各独立 entity，SQL 侧执行 | Transform primitive（impl=code\|prompt） | 方向同 | pneuma 更灵活（支持 prompt），缺少 dependency graph |
| **Relation 模型** | LinkToAnotherRecord（6 种 type：hm/bt/mm/oo/om/mo） | 预定义 relation + with 引用（ADR-0019 倾向） | pneuma 将抄 | 基数编码值得抄 |
| **Formula AST** | `parsed_tree` JSON 缓存 | Transform 未说明 AST cache | pneuma 补 | ADR-0003 amend 方向 |
| **Query DSL** | URL param：`(col,op,val)~and(col2,op,val2)` + sort + limit/offset + fields | ADR-0019 起草中 | pneuma 将抄词汇表 | Option C 混合 |
| **Filter AST** | 递归 tree：logical_op / is_group / children / comparison_op + sub_op，挂在 view/hook/rls-policy/button/link | 未统一（分散在 policy predicate 等处） | pneuma 应统一 | §5.1 Q-focus 7 |
| **Join 能力** | 无 query-time join；Lookup/Rollup 预声明 | 同（ADR-0019 倾向） | 一致 | 印证 |
| **聚合** | RollupColumn（count/sum/avg/...），非 query-time | MVP 列级聚合 + Derived table | 一致 | 印证 |
| **Pagination** | offset/limit | cursor-based（ADR-0019 倾向） | pneuma 领先 | offset 不 scale |
| **View kinds 内置** | 7 个（grid/form/gallery/kanban/calendar/map/list） + Dashboard/Widget 新 | 倾向 4，建议 5（grid/card-list/form/detail/custom） | 近 | 增补 form |
| **View-level column override** | `*ViewColumn.ts` 拆 7 个 entity | ADR-0020 未明确 | pneuma 补 | R3 |
| **View lock type** | collaborative / locked / personal 三档 | 未内建 | pneuma 补 | R4 |
| **Shared / anonymous view** | uuid + optional password | 未设计 | pneuma 补 | R5 / §6.8 |
| **Row coloring / visual hint** | `RowColorCondition.ts` + `row_coloring_mode` | 未设计 | pneuma 可补 | §6.10 |
| **Custom URL** | `CustomUrl.ts` | 未设计 | 可借鉴 | §6.12 |
| **Operation primitive（UI + Agent 双绑）** | 不存在；Button column + Hook + Script 分裂 | ADR-0018 统一 | pneuma 代际领先 | 差异化护城河 |
| **Button column / in-cell action** | `ButtonColumn.ts` / Button column type | 待定 | 建议作为 OperationUIBinding 的 "in_cell_button" flavor | R12 |
| **权限 role 枚举** | Owner/Creator/Editor/Commenter/Viewer/NoAccess + Inherit | ADR-0006 + ADR-0007 DSL（没固定 role） | 不同 | pneuma 让 template 定 role |
| **权限粒度** | workspace / base / table / field / record（RLS） | table / row / column（ADR-0006） | 一致 | 三层对应 |
| **权限 DSL** | 无，imperative（NestJS guards） | 三元组 YAML（ADR-0007） | pneuma 领先 | |
| **权限 NL 双向** | 无 | evaluatePolicy / who_can（ADR-0008） | pneuma 独有 | 差异化护城河 |
| **权限 rule precedence** | 未文档化 | OPEN-QUESTIONS 待补 | 都未明确 | 共同弱点 |
| **enforce_for (入口维度)** | `enforce_for_form` / `enforce_for_automation` | 无（PermissionContext 有但非 predicate） | pneuma 补 | R9 |
| **Subject 多态** | user + team + role | user + role（ADR-0010） | pneuma 补 team | R10 |
| **Credential 存储** | Integration 独立实体，可被多 consumer 共享 | ADR-0011 字段式 | pneuma amend | R8 |
| **MCP support** | `MCPToken.ts` 内置 | 未讨论 | pneuma 建议补 | R15 |
| **Webhook / Hook** | Hook entity + async + retries + timeout + condition filter | 未单独设计，ADR-0018 Operation 覆盖 | 需映射 | R14（Operation triggers） |
| **Audit** | `Audit.ts`：fk_user_id / op_type / details / ip / user_agent / row_id / versioned | ADR-0014 append-only | 一致方向 | NocoDB 结构值得抄字段清单 |
| **Dev/Prod 分离** | 无 | ADR-0016 第一类 | pneuma 独有 | AI-native 构建流的结果 |
| **Rollback** | 无（依赖 DB backup） | ADR-0017 时间倒流 | pneuma 独有 | |
| **AI / LLM 接入** | AIColumn（LongText + prompt + integration） | ADR-0003 Transform.impl=prompt | 两种哲学 | NocoDB = 列填空；pneuma = 全面 first-class |
| **Script / Extension** | 规划中 (stub) | 由 Developer 写 pneuma-app template 覆盖 | 不同 | NocoDB "产品内"脚本；pneuma "产品即模板" |
| **Multi-tenancy** | Org（Enterprise）/ Workspace / Base 三层 | 当前单层（ADR-0001 A+B scope） | NocoDB 领先 | pneuma 长期要补 |

---

## 6. 新视角 / 我们漏掉的维度

以下是 NocoDB 有、pneuma 现有 ADR 没有或不充分的维度：

### 6.1 Dependency graph of derived columns（严重缺失）

NocoDB 的 `DependencyTracker.ts` 跟踪"Formula A 依赖 Column B"。pneuma Transform（ADR-0003）目前假设每个 transform 是独立的，没有系统性的依赖图。当：

- Schema 改了（删一列 / 改类型），所有依赖的 transform 要级联失效或重跑
- 一个 row 被改了，所有依赖 cell 的 derived cell 要重算
- Derived table A 依赖 Transform B，B 的 prompt 改了，A 怎么办（OPEN-QUESTIONS 里的 E4）

**建议**：新 ADR "Transform / Derived Cell Dependency Graph"。

### 6.2 View-level column override（pneuma ADR-0020 当前没明说）

NocoDB 的 `*ViewColumn.ts` 让每个 view 存自己的 column config（width / hidden / rename / order）。pneuma 目前没明确哪些属性归 schema、哪些归 view。

**建议**：ADR-0020 起草时明确 view-level column override 的属性集。

### 6.3 Form 作为独立 view kind（pneuma MVP 候选里遗漏）

Form 是"schema → auto-generated UI for insert / update one row at a time"。高频、AI-agent 友好（schema 改了，form 自动同步）、Operation 自然对接（submit = trigger operation）。

**建议**：ADR-0020 把 form 加回 MVP 4 个里（变成 5 个）。

### 6.4 Dashboard / Widget 作为另一级 primitive（2026 新增趋势）

NocoDB 2026-04 新增 Dashboard + Widget。方向是"多 view / 多 table 的聚合画布"。pneuma 当前 view 都是单 table-based——多 view 组合的场景（一个 pneuma-app 主页展示 3 张表的摘要）**目前没有 primitive 支持**。

**建议**：OPEN-QUESTIONS 新增候选 "Composition primitive (page / dashboard / layout)"。

### 6.5 Integration 作为独立 entity（与 Credential 的 Source 解耦）

Integration = (provider 类型 + 凭据 + 元信息)，可被 N 个 Source / N 个 AIColumn / N 个 Hook 共享。pneuma ADR-0011 把 credential 看成 adapter 的字段，没有独立 Integration entity。

**建议**：ADR-0011 amend 或新 ADR，把 Credential / Integration 独立建模。

### 6.6 `enforce_for_*` 维度（policy 按入口区分）

NocoDB 的 `Permission.enforce_for_form` / `enforce_for_automation` 让同一条 policy 在"表单提交"和"自动化触发"时可独立开关。pneuma 的 PermissionContext（ADR-0013）可以做到这个，但没明确把"入口类型"作为一等 predicate。

**建议**：ADR-0007 amend，`enforce_for: [ui | agent | api | webhook | scheduled]` 作为 policy 的一等属性。

### 6.7 Team / Group 层（user-id grants 的上层）

NocoDB workspace 下可以建 team，grant subject 可以是 team。pneuma ADR-0010 当前只谈 user-id，实际企业用户马上会要 team/group。

**建议**：ADR-0010 amend 或新 ADR "Group / Team as permission subject"。

### 6.8 Shared view 匿名 URL 作为一等 access pattern

NocoDB 的 uuid + password shared view 是"不登录就能看"的匿名入口。pneuma 的权限模型偏 authenticated（所有 request 都有 user）——匿名 shared view / form 是**产品上必须的功能**（想想看谁没填过 Google Form）。

**建议**：ADR-0010 amend 或新 ADR "Anonymous / share-link access"。

### 6.9 Lock type 三档（collaborative / locked / personal）

NocoDB view 的三档 lock 是一个**微观权限维度**，pneuma 可能可以 simpler 地用 policy DSL 表达，但 **UX 上的简单词汇（锁 / 个人）**对 Builder 友好。

**建议**：ADR-0020 view meta 里内建 `lock_type` 字段，policy 可以引用。

### 6.10 Row coloring / visual hints

小功能但覆盖率高。NocoDB `RowColorCondition.ts` 独立实体。pneuma 可以在 view meta 里简单地 support。

### 6.11 MCP-as-native

NocoDB 已经有 `MCPToken.ts`——NocoDB 自己可作为 MCP server 被其他 agent 消费。pneuma-framework 可以把"pneuma-app 自动暴露为 MCP server"作为内建特性——这样一个 pneuma-app 不只是"给 end user 用"，还是"给其他 agent 集成"。

**建议**：新 ADR "pneuma-app as MCP server"。

### 6.12 Custom URL / 多路径路由

NocoDB `CustomUrl.ts` 允许 view 挂自定义路径。pneuma viewer 的 URL 规划目前没讨论。

### 6.13 Hook / Operation 的 trigger 维度扩展

NocoDB Hook 可以 async / retries / timeout / schedule（scheduled 推测）。pneuma Operation 的 trigger 维度目前只有 "user-initiated"——要扩。

**建议**：ADR-0018 amend 或新 ADR "Operation triggers (user / schedule / change / external)"。

---

## 7. 推荐行动项

### 立即（起草 ADR-0019 / 0020 时必须参考）

| # | 行动 | 依据 |
|---|---|---|
| R1 | **ADR-0019 Query DSL** 起草时直接借鉴 NocoDB Filter AST 词汇表（logical_op / is_group / comparison_op / sub_op）、方向定 Option C（混合） | §3.3, §5.1 |
| R2 | **ADR-0020 View System** 把 **form** 加回 MVP（5 view kind 而不是 4） | §5.2 V-focus 1 |
| R3 | **ADR-0020** 显式 view-level column override 存储（抄 `*ViewColumn.ts` 拆分） | §3.3 / 6.2 |
| R4 | **ADR-0020** 引入 **lock_type（collaborative / locked / personal）** | §3.3 / 6.9 |
| R5 | **ADR-0020** 引入 **shared view uuid + password 匿名通路 + policy resource** | §6.8 |
| R6 | **ADR-0019 / 0007** 约定 where-clause AST 独立类型，共享给 query / policy / trigger | §5.1 Q-focus 7 |

### 短期（M5 启动前补齐）

| # | 行动 | 依据 |
|---|---|---|
| R7 | 新 ADR：**Transform / Derived Dependency Graph** | §6.1 |
| R8 | ADR-0011 amend 或新 ADR：**Integration 实体独立于 Source / Adapter 实例** | §6.5 |
| R9 | ADR-0007 amend：**`enforce_for: [ui / agent / api / webhook / scheduled]`** | §6.6 |
| R10 | ADR-0010 amend 或新 ADR：**Team / Group as subject** | §6.7 |
| R11 | ADR-0002 amend：**`ref-row-list<Table>` CellType**（OPEN-QUESTIONS 已记）+ **`internal_meta` 二分** | §4 ADR-0002 |
| R12 | ADR-0018 amend：**Button column = OperationUIBinding flavor "in_cell_button"** | §4 ADR-0018 |

### 中期（M5/M6 实施时）

| # | 行动 | 依据 |
|---|---|---|
| R13 | 原型 `pneuma-adapter-nocodb`，验证 Adapter 协议能吃下 NocoDB REST API | §2 |
| R14 | 新 ADR 候选：**Operation triggers（user / schedule / change / external）** | §6.13 |
| R15 | 新 ADR 候选：**pneuma-app as MCP server** | §6.11 |
| R16 | 新 ADR 候选：**Composition primitive（page / dashboard）** | §6.4 |
| R17 | ADR-0009 amend：**template 可 override default posture** | §4 ADR-0009 |
| R18 | ADR-0003 amend：**Transform AST 预编译 + 指纹缓存 + SQL pushdown 讨论** | §4 ADR-0003 |

### 远期 / 观察

| # | 行动 | 依据 |
|---|---|---|
| R19 | 跟踪 NocoDB Dashboard / Widget 完整 schema 落地后的形态，对比 pneuma composition | §3.9 / 6.4 |
| R20 | 跟踪 NocoDB RLS 完整发布（目前 placeholder），对比 pneuma policy 成熟度 | §3.4 |

---

## 附录 — 研究方法

### 资料来源

1. **GitHub repo** `github.com/nocodb/nocodb` @ master 分支
   - 顶层结构：WebFetch `https://github.com/nocodb/nocodb`
   - Backend 结构：WebFetch `https://github.com/nocodb/nocodb/tree/master/packages/nocodb/src`
   - Models 清单：WebFetch `https://github.com/nocodb/nocodb/tree/master/packages/nocodb/src/models`
   - 单文件（raw）：`https://raw.githubusercontent.com/nocodb/nocodb/master/packages/nocodb/src/models/<File>.ts`
     - 本次读过：Column / View / Source / Model / Permission / Filter / Hook / FormulaColumn / AIColumn / LinkToAnotherRecordColumn / Dashboard / Script
   - SDK UITypes：`packages/nocodb-sdk/src/lib/UITypes.ts`

2. **官方文档** `nocodb.com/docs/product-docs`
   - `roles-and-permissions`
   - `roles-and-permissions/table-permissions`
   - `roles-and-permissions/field-permissions`
   - `developer-resources/rest-apis`
   - `data-sources/data-source-overview`
   - （404 的若干页：record-level-security / types-of-views / field-types/overview / embedding-nocodb / webhooks/create-webhook — 说明对应页面 URL 有变化或在迁移中）

3. **Web search**（覆盖没直接找到文档的主题）
   - Record-level security
   - SDK / embed / iframe
   - Roles 概览

### 方法论

- **自上而下 + 按目录清单驱动**：先拿 repo 顶层结构 → models 清单 → 针对性读单文件。避免迷失。
- **文档 + 源码交叉印证**：若一个 feature 文档说支持但源码是 placeholder（如 `Permission.isAllowed`、`Script.*`），明确标 "产品已宣布 / 实现尚未完成"。
- **按 ADR 索引逐条映射**：确保 18 条都有 pass-through，不遗漏。
- **承认不确定**：对未直接读的源文件（DependencyTracker / version-upgrader 等），写"推断"并标记待核实。

### 置信度

| 主题 | 置信度 |
|---|---|
| UIDT 字段类型清单 | 高（UITypes.ts WebFetch） |
| View 体系结构 | 高（7 个特化文件都有） |
| Permission 层次和 role 清单 | 高（官方 docs） |
| RLS 具体实现 | 低（文档 404 + 源码 placeholder） |
| Hook 实现 | 中（Hook.ts 读过，但 Filter 挂载细节不够） |
| Formula 执行引擎 | 低（本次未读 helpers/formulaFnHelper.ts） |
| Dashboard / Widget 细节 | 低（2026 新增，Dashboard.ts 读到是 stub） |
| Script / Extension 实际形态 | 低（都是 stub） |
| 整体架构判断（能否做 backend） | 高（结合定位 + API 形态 + 抽象层次） |

### 不足 / 未竟

- `packages/nocodb-sdk/src/formulaParser/` 未读——如果要深挖 formula AST，这里是关键
- `packages/nocodb/src/modules/` 各 feature 模块内部的 service 逻辑未读——例如 view 的 filter evaluation 完整流程
- `packages/nc-gui` 前端如何消费后端 API 没看——对"UI composition 如何借鉴"有损失
- 没看 `version-upgrader/` → Meta DB 迁移策略不清
- NocoDB 性能 / 规模 benchmark 未调查
