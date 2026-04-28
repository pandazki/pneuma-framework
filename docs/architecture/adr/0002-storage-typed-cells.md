# ADR-0002: Storage 核心 — 类型化 Cell 构成的 Table，类型集合封闭可扩展

**Status**: Accepted
**Date**: 2026-04-23
**Last amended**: 2026-04-24（3 处：`ref-row-list` + `json` CellType + reserved-name 放宽，详见文末 Amendments）
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: storage, data-model

---

## Context

Pneuma 要让 Builder 用对话方式创造应用。Builder 不是软件工程师——没有事务 / ACID / 并发 / 索引 / 锁的概念（见 [ADR-0001](./0001-archetype-scope.md) 的 archetype B 约束）。传统 web 框架的数据层（Rails migration / Prisma schema / Django model）都假设有一个懂 SQL 的工程师在场。把这套搬到 Builder 面前就是把复杂度转嫁给不该承担它的人。

但完全无类型（纯 JSON blob）也不行——没有类型，框架无法为每种"东西"预置高质量可视化组件、无法做性能优化、无法做 schema 迁移的确定性计算。

我们需要一个**既让 Builder 感觉是"在一张表里加字段"、又让框架内部类型严谨**的数据原语。

---

## Options considered

### Option X: JSON document + schema-on-read
每个实体是 JSON blob，存在 SQLite JSON / PG JSONB。字段按需读，不存在时补默认值。

- **Pro**: Builder 加字段无成本；无迁移概念
- **Con**: 约束弱（无 FK、无 NOT NULL）；无法预置类型化组件；性能优化难

### Option Y: 类型化 Collections + Transformer 流水线
表面类似 Airtable（Builder 看"集合 + 字段"），内部严格类型；每次模型变更产生一个 Transformer（自动 / 手工）；部署时应用、回滚时反向。

- **Pro**: 类型严谨；迁移可计算；回滚语义干净
- **Con**: 需要实现 Transformer 自动生成与反向生成；更复杂

### Option Z: Event-sourced
Storage = append-only event 流；state = projection。"改 schema" = 改 projection。

- **Pro**: 免费的时间旅行 + audit log
- **Con**: 对 Builder 过于抽象；projection 物化成本高；不适合 OLTP 场景

### Option W: Airtable-like Universal Table
所有东西都是一张大表，Builder 只加字段不建表。

- **Pro**: Builder 友好度极高；平台侧一张表管所有
- **Con**: 放弃关系能力；嵌套 / 一对多要重新发明；scope 爆炸（等于重做一个 Airtable）

### Option V（最终选择）: 类型化 Cell + 多态 data-ref 作为 first-class cell 类型
结合 Y 的内部严格类型 + 允许 cell 装 `ref<任意已注册类型>`（包括外部资源）。表的 source 可以是 Stored / AdapterBacked / Derived / Hybrid。这一选项在讨论过程中由 V 浮现（见上游 conversation session），是对 Y 和 W 的真正综合——Y 保证严格类型，W 的"一切皆可用"则通过 data-ref 实现。

- **Pro**: Builder 认知模型仍是"表 + 字段"，但字段可指任意东西；adapter-backed 虚表天然并入；类型严谨不放弃关系
- **Con**: 需要为每种可 ref 的类型内置 canonical 可视化；适配层（Adapter / Transform）得分开设计

---

## Decision

采用 **Option V**：类型化 Cell + 多态 data-ref，作为 pneuma 存储的核心原语。

### 核心数据类型

```typescript
type Table = {
  id: string;                        // e.g. "bookmarks"
  columns: Column[];
  source: Stored | AdapterBacked | Derived | Hybrid;
};

type Column = {
  name: string;                      // e.g. "url"
  type: CellType;
  nullable?: boolean;
  default_access?: "public" | "restricted";   // 后续 ADR-0009 使用
};

type CellType =
  | { kind: "primitive"; of: "Text" | "RichText" | "Number" | "Bool" | "Date" | "Duration" | "URL" }
  | { kind: "vector"; dim: number }
  | { kind: "blob"; mime: string }                      // e.g. "image/*"
  | { kind: "ref-row"; table: string }                  // intra-pneuma row ref
  | { kind: "ref-external"; adapter: string }           // e.g. Linear issue, Obsidian page
  | { kind: "derived"; transform: string; output: CellType };  // 见 ADR-0003

type Stored = { kind: "stored" };
type AdapterBacked = { kind: "adapter-backed"; adapter: string; config: Record<string, unknown> };
type Derived = { kind: "derived"; expression: unknown };   // TBD: derivation DSL
type Hybrid = { kind: "hybrid"; storedColumns: string[]; refColumns: string[] };
```

### 关键设计承诺

1. **CellType 是封闭集 + 可扩展**：上面枚举是内置类型；`ref-external` 的 `adapter` 字段可由 adapter 注册新类型，但注册本身是有契约的（见 [ADR-0004](./0004-adapter-protocol.md)）
2. **每种 CellType 框架内置 canonical renderer**：Text 是可编辑文本、RichText 是 markdown 区、Blob<image/*> 是缩略图+灯箱、RefExternal<linear-issue> 是 Linear 风格卡片
3. **Builder 永远不触 SQL**：无论底层存储是 SQLite / PG / 其他，Builder 的心智模型只有 `table + column + cell`
4. **关系能力通过 `ref-row` 表达**：不是 SQL FK 而是 typed reference，框架层维护引用完整性

### 底层存储引擎

MVP 使用 **SQLite JSON1**，每个 Table 落地为一张 SQLite 表，每行的 JSON 列存 cell 数据。向量字段存 BLOB。Adapter-backed 表不持久化数据（查询时 live-adapter）。引擎是实现细节，Builder 视角不可见；后期切 Postgres / 自研引擎是 provider 换，不是架构换。

---

## Consequences

### Positive
- Builder 的心智模型极简：表 + 字段 + 单元格，没有 SQL、没有迁移脚本
- 类型封闭让框架能为每种 CellType 提供高质量 canonical UI——省去每个模板自己造 date picker / markdown editor 的重复劳动
- `ref-external` 让 adapter 生态（Linear / Obsidian / ...）可以**天然并入**，而不是贴膏药
- 为 [ADR-0003 Transform](./0003-transform-primitive.md) 和 [ADR-0004 Adapter](./0004-adapter-protocol.md) 留下干净的接入点

### Negative / Risks
- **关系能力受限**：没有 SQL JOIN 的完整能力；复杂查询可能需要多次 ref resolve
- **查询语言 TBD**：Builder 怎么查"本月加的、属于某 lens 的 bookmark"？Method chain 还是小 DSL？留给后续 ADR
- **性能边界待验证**：JSON1 + ref resolve 在千万级数据上的性能需要压测
- **新增内置类型是 framework release**——不是 app-level 扩展。扩展只能通过 adapter 注册外部 ref 类型或 transform 产出已知类型

### Follow-ups
- [ADR-0003 Transform](./0003-transform-primitive.md)：任意输入 → 典型 CellType 输出的 first-class 原语
- [ADR-0004 Adapter protocol](./0004-adapter-protocol.md)：`ref-external` 的背后契约
- **ADR-TBD: 查询语言**：method chain / 小 DSL / GraphQL 混合？
- **ADR-TBD: Migration semantics**：Column 增 / 删 / 改类型分别对应什么 transformer，部署编排、回滚路径
- 进 `open-questions.md`：大规模数据下的引擎边界（何时从 SQLite 迁 PG）

---

## Amendments

### 2026-04-24 — Step-6 integration 暴露的 3 处细节 refinement

**触发**：step 6 的 [weekly-linear-digest integration test](../spec/domain-model.md) 落代码时暴露 3 个可用性问题（非架构，属于 CellType/Table 的字段粒度），借此 amend。

---

#### Amend (a) — `ref-row-list<Table>` CellType 加入封闭集（追认 E1 pressure test 建议）

**背景**：archived pressure-test findings（git history: `git show 107ec17:docs/architecture/pressure-test/findings.md`）的 E1 场景早就提过"需要 ref-row-list"，未写进 ADR 正文。step 5 实现时我直接把它加进 `CellType` 封闭集里（`cell-type.ts`）——这条 amend 是**把事实正式化**。

**Decision**：`CellType` 封闭集正式加入 `ref-row-list`：

```typescript
type CellType =
  | ...                                        // 原有
  | { kind: "ref-row-list"; table: string };   // 新
```

**语义**：cell 值为 `Ref[]`，每个 `Ref` 必须 `kind==="row"` 且 `table===type.table`（同构数组）。

**与 `ref-row` 不同**：
- `ref-row` 是**单值**，可以 nullable；
- `ref-row-list` 是**数组**，允许空数组（empty list 合法），等价于 "这行目前没关联到任何目标 row"。

**常见用例**（E1 / E5 都有）：
- `bookmark.tags: ref-row-list<tags>` —— 一个 bookmark 多个 tag；
- `user.favorite_bookmarks: ref-row-list<bookmarks>` —— 用户收藏集合。

---

#### Amend (b) — `json` CellType 加入封闭集

**问题**：`users.attrs` 这种"非结构化 JSON" 字段在原 kinds 里无对应——只能用 `RichText` 存 JSON 字符串 + 手工 parse/stringify。typed cells 的初衷被绕过。

**Decision**：`CellType` 封闭集增加 `json`：

```typescript
type CellType =
  | { kind: "primitive"; of: PrimitiveCellType }
  | { kind: "vector"; dim: number }
  | { kind: "blob"; mime: string }
  | { kind: "json"; schema?: unknown }          // 新增
  | { kind: "ref-row"; table: string }
  | { kind: "ref-row-list"; table: string }
  | { kind: "ref-external"; adapter: string; externalType: string }
  | { kind: "derived"; transform: string; output: CellType };
```

**语义**：
- 值必须是 JSON-serializable：primitive / plain object / array / null；
- 拒绝：`undefined`、`Date` / `Uint8Array` / `Map` / `Set` / `RegExp` 等 built-ins（避免 round-trip 丢信息）；
- `schema` 字段 optional，未来可塞 JSON Schema 做验证；MVP **不强制校验** schema（只校验 "是 JSON"）；
- 典型用例：`users.attrs` / `adapter.config` / `operation.metadata` / 任何 "非 ref 又非 primitive" 的结构化数据。

**何时用 `json` vs `RichText`**：
- `json`：结构化数据，程序读写（`user.attrs.linear_user_id`）。
- `RichText`：给人看的富文本 markdown。

**向后兼容**：`json` 是纯新增，原代码 / 原 ADR 引用的 kinds 都不受影响。

---

#### Amend (c) — reserved column names 仅对 stored 表生效

**问题**：原 ADR 把 `id / created_at / updated_at / owner_id` 作为 framework 级保留列名，**对所有 Table 一刀切**。但 adapter-backed 表的列名经常由外部系统决定——Linear 的 `id` 就叫 `id`，GitHub 的 `created_at` 就叫 `created_at`。强制改名（`external_id` / `remote_created_at`）是不自然的语义偏移。

**Decision**：

```
reserved names { id, created_at, updated_at, owner_id }
  仅对 source.kind === "stored" 的 Table 生效
  (stored 表这些名字是框架的 Row aggregate 字段, 必须保留).

  adapter-backed / derived / hybrid 表允许这些列名,
  因为对这些表来说 "row 的 aggregate 级 id" 就是外部系统的 id,
  不存在分歧.
```

**实际影响**：
- 以前必须写 `linear_issues.external_id`，现在直接 `linear_issues.id`，跟 Linear schema 贴平。
- stored 表不变——仍保留 4 个名字是 framework-owned。

**跨 aggregate 影响**：Row aggregate 的 `id: string` 字段读逻辑不变——对 adapter-backed 的外部行，Row 不会被实际构造；它们只是 `ExternalRow` record 返回。这 amend 只放松 Table schema 的列名检查，不触 Row 类。

---

**关联**：
- [ADR-0002 原主体]: 封闭 CellType 集合扩一位、Table 列名保留策略变更。
- [ADR-0004 Adapter protocol](./0004-adapter-protocol.md): externalTypes.columns 现在可以用原生 `id / created_at / updated_at` 命名, 不需硬改名。
- Follow-up: **未来可能再加 `xml` / `yaml` / `markdown` 结构化文档 CellType**——但在真正用例出现之前不加。
