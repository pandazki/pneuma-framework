# Pressure Test (C): 用 ADR 重新设计 ai-bookmarks（纸面）

> 目的：把 ai-bookmarks（当前基于 SQLite + 手写 REST 的 MVP 模板）用 [15 条 ADR](../adr/) 的新模型重画一遍。**不写代码**，只画出在新模型下它长什么样。
> 过程里回答两个问题：
> 1. 每个 ADR 真用得上吗？（真用 = 用上、过度设计 = 从来没触及）
> 2. 重画的过程里有什么地方**新模型描述不出来**？（这些是 ADR 的盲点）

---

## 当前 ai-bookmarks 的功能一览

1. **核心数据**：bookmarks、interpretations、lenses（配置）、_migrations
2. **外部调用**：Jina Reader 抓 URL 正文；OpenRouter /chat 做每个 lens 的解读；Jina/OpenAI embeddings 做向量
3. **视图**：Timeline（卡片列表）+ Graph（react-flow 相似度网络）
4. **Agent**：Build-phase（opencode）可改 lenses.json / 加字段 / 改 viewer
5. **生命周期**：setup / dev / build / deploy / migrate / fork / stop

---

## 在新模型下的重画

### 1. Tables 与 CellType（[ADR-0002](../adr/0002-storage-typed-cells.md)）

```yaml
tables:
  - id: bookmarks
    source: { kind: stored }
    default_access: public
    columns:
      - name: id
        type: { kind: primitive, of: Number }
      - name: url
        type: { kind: primitive, of: URL }
      - name: title
        type: { kind: primitive, of: Text }
        nullable: true
      - name: fetched_at
        type: { kind: primitive, of: Date }
      - name: raw_text
        type: { kind: primitive, of: RichText }   # Jina Reader 输出的 markdown
        nullable: true
      # 未来可加：
      # - name: owner_id
      #   type: { kind: ref-row, table: users }
      # - name: shared_with
      #   type: { kind: ref-row-list, table: users }   # 见 E1 发现

  - id: interpretations
    source: { kind: stored }
    default_access: public
    columns:
      - name: id
        type: { kind: primitive, of: Number }
      - name: bookmark_id
        type: { kind: ref-row, table: bookmarks }
      - name: lens_name
        type: { kind: primitive, of: Text }
      - name: body
        type: { kind: primitive, of: RichText }
      - name: embedding
        type: { kind: vector, dim: 1024 }          # Jina v3 == 1024 维
      - name: created_at
        type: { kind: primitive, of: Date }

  - id: lenses
    source: { kind: stored }
    default_access: public
    columns:
      - name: name
        type: { kind: primitive, of: Text }        # kebab-case 主键
      - name: display_name
        type: { kind: primitive, of: Text }
      - name: prompt
        type: { kind: primitive, of: RichText }
      - name: model
        type: { kind: primitive, of: Text }
        nullable: true                              # 可选覆盖默认 chat model
```

#### 观察

- **乡愿**：三张表都是 Stored，**没有 AdapterBacked 也没有 Hybrid**。当前 ai-bookmarks 没有外部数据源集成需求。→ Adapter 在当前 ai-bookmarks 是**没用到的** ADR（但 URL 抓取见下文，算是"外部"）
- **raw_text 的大尺寸**：Jina Reader 返回可能 30KB+ 的 markdown。存为 RichText cell 没问题但要注意 index（fetched_at 索引就够）
- **_migrations 表**：当前实现自己维护的内置 meta 表——新模型下这应该由 framework 的 internal tables（[ADR-0010](../adr/0010-user-id-grants.md) 提到过）提供，Builder 视角看不见

### 2. Transforms（[ADR-0003](../adr/0003-transform-primitive.md)）

```yaml
transforms:
  - id: fetch-readable
    description: "URL → 可读正文与标题（通过 Jina Reader）"
    in:  { kind: primitive, of: URL }
    out: { kind: record, fields: { title: Text?, body: RichText } }
    impl:
      kind: code
      module: "@pneuma/transforms-web/fetch-readable"
    purity: pure    # Jina Reader 对同 URL 返回稳定

  - id: interpret-by-lens
    description: "(bookmark, lens) → 该 lens 视角下的解读"
    in:
      kind: record
      fields:
        url: URL
        title: Text?
        body: RichText
        lens_prompt: RichText
    out: { kind: primitive, of: RichText }
    impl:
      kind: prompt
      model: "${env.OPENROUTER_CHAT_MODEL:-anthropic/claude-opus-4.7}"
      system: "{{ lens_prompt }}"
      user:   |
        URL: {{ url }}
        Title: {{ title }}
        Content:
        {{ body }}
      outputSchema: { type: string }    # 可 ParsedAsMarkdown 严格约束
    purity: pure

  - id: embed-text
    description: "Text → 1024-dim embedding"
    in:  { kind: primitive, of: RichText }
    out: { kind: vector, dim: 1024 }
    impl:
      kind: code
      module: "@pneuma/transforms-embed/jina"
      config: { model: "jina-embeddings-v3", task: "retrieval.passage" }
    purity: pure
```

#### 观察

- **Transform 完全表达了现有 interpret.ts**：ingest → fetch-readable → for each lens → interpret-by-lens → embed-text。非常干净
- **PromptImpl 是明星**：`interpret-by-lens` 是一个 prompt transform，ADR-0003 里说的 "AI-native 的自然延伸"在这里落地得很漂亮
- **纯函数假设**：`fetch-readable` 被标为 pure——但同一 URL 在不同时间爬取内容可能变。这是**一个真实问题**：Web 内容**不是**真 pure。问题是 pure 在 pneuma 里的语义是"按 input hash 缓存"——对于 URL 抓取，缓存多久？
  - Fix: 引入 `cache_ttl` 字段。pure 但 TTL（见 Finding 中的 amend）
- **Chain 的组合表达**：当前 `interpret.ts` 把三步串起来是 if/for 代码。新模型下这应该能声明式表达——但 [ADR-0003](../adr/0003-transform-primitive.md) 没写如何"**声明**一个 pipeline"。只说单个 Transform。
  - 这是个 **新 ADR 候选：Transform pipeline / composition syntax**

### 3. Views（[ADR-0002](../adr/0002-storage-typed-cells.md) 提到但未详细定义）

Timeline view：
```yaml
views:
  - id: timeline
    kind: grid                                  # 内置的 view kind
    on_table: bookmarks
    sort_by: fetched_at DESC
    columns: [title, url, fetched_at]
    row_expansion:
      join: interpretations                     # join 表
      join_on: bookmarks.id == interpretations.bookmark_id
      group_by: lens_name
      show: [lens_name, body]
```

Graph view：
```yaml
views:
  - id: graph
    kind: custom                                # 模板提供渲染
    on_table: bookmarks
    render: "./src/GraphView.tsx"               # React 组件
    data_source:
      nodes: bookmarks
      edges:
        from: interpretations
        compute: "cosine similarity on embedding column"
        threshold: "${env.BOOKMARKS_EDGE_THRESHOLD:-0.5}"
```

#### 观察

- **View system 完全没定义在 ADR**。我只能靠猜。
- 至少两种 view kind：
  - **内置 kind**（grid / timeline / kanban / card-list）——框架提供渲染，模板只声明数据来源
  - **custom kind**——模板提供 React 组件 + 数据来源
- Custom view 的"数据来源"描述需要一个**微型 query DSL**（[ADR-0002 follow-up](../adr/0002-storage-typed-cells.md#follow-ups) 已 flag "ADR-TBD: 查询语言"）
- Graph view 的 "edges computed from embedding cosine" 这种**派生关系**是 Derived 的一种特例——ADR-0002 的 Derived 字段只是个名字，具体怎么写没定

**重大 ADR 候选**：
- **View system 设计**（内置 kinds / custom kind 接入 / 数据源语法）
- **Query language / Derived expression**（哪怕 MVP 只有 sort / filter / join / aggregate 几个）

### 4. Policies（[ADR-0007 / 0009](../adr/0007-permission-dsl.md)）

ai-bookmarks MVP 单用户 → 默认 public 姿态，**policies.yaml 基本为空**。但如果我们开始考虑团队用：

```yaml
policies:
  # 默认 app / table / column 全部 public
  # 加 owner 概念：bookmark 归创建者所有
  - allow: self
    do: [read, write, delete]
    on: table:bookmarks.row
    when: row.owner_id == user.id

  - allow: role:team
    do: read
    on: table:bookmarks.row
    when: row.visibility == "shared"

  - allow: role:admin
    do: "*"
    on: app
```

#### 观察

- **DSL 表达力充足**——ai-bookmarks 的典型 policy 都能写出来
- **但现在 ai-bookmarks 的 schema 里没有 `owner_id` 和 `visibility` 字段**——加这些字段意味着需要 Builder **同时修改 schema 和 policy**。这是常见 flow 但 ADR 没涵盖：
  - Agent 对话时"加一个 owner 概念，让每个 bookmark 归创建者私有" 应同时产生 schema 变更 + policy 变更
  - 这是**"由权限诉求驱动数据建模"**的场景，很真实
- **哪些 policy 规则应由 Builder agent dialogue 触发，哪些应由模板作者预设？** MVP 模板 shipped policies.yaml 里要不要带 owner 概念默认开？

### 5. Telemetry events（[ADR-0013](../adr/0013-telemetry-event-model.md)）

ai-bookmarks 运行时会产生这些 event：

| 时机 | Category | Audit? |
|---|---|---|
| `pneuma-framework build` 开始/结束 | lifecycle | ✅ |
| `pneuma-framework deploy` 开始/结束 | lifecycle | ✅ |
| `migrate` 应用一个 .sql 文件 | lifecycle | ✅ |
| Viewer 发 `POST /api/bookmarks` | request | ❌ |
| `checkPolicy(ctx, read, bookmarks)` | access | ✅ |
| 插入 bookmark 行 | mutation | ✅ |
| 运行 `interpret-by-lens` transform | agent | ✅ |
| 运行 `embed-text` transform | agent | ✅ |
| 插入 interpretation 行 | mutation | ✅ |
| Build-phase agent 调 `lifecycle.migrate.run` | agent | ✅ |

#### 观察

- 模型 cover 得上，**但 Transform 应该是 `agent` category 还是另一类？**
  - 当前设计：prompt transform 归 `agent`（涉及 LLM 调用）、code transform 归...？
  - [ADR-0013](../adr/0013-telemetry-event-model.md) 的 `AgentPayload` 假设有 `agent_id`——但 transform 不是 agent。这里 shape 不够准确。
  - **Fix**: 建议加一个 `transform` event category，或者允许 agent payload 的 agent_id 是 transform 名
- **Trace 嵌套真实发生**：`POST /api/bookmarks` 触发一系列 transform + mutation event，这些应当挂同一 trace 下。[ADR-0015](../adr/0015-sinks-and-trace.md) 的三级 trace scope 覆盖 HTTP + turn + lifecycle，但**HTTP request 里的 transform chain 是第四层**？还是它作为 span 而非独立 trace？
  - Fix: [ADR-0015] amend——明确 transform 是 span 不是 trace。并补 **span 嵌套**的语义（span can be parent of span within same trace）

### 6. Lifecycle 与 Agent（[ADR-0012](../adr/0012-agent-permissions.md) / [M4 plan](../../superpowers/plans/2026-04-22-pneuma-framework-m4.md)）

Build-phase Agent 在 dev 模式下做的事在新模型下：
- 改 lens → 修改 `lenses` table 的一行数据（mutation event audit:true）
- 加字段到 bookmarks → 改 `tables.bookmarks.columns` 定义（schema mutation，特殊类别的 mutation，带 `permission-change` 级别 audit）
- 改 viewer 代码 → **这是什么？**

**"改 viewer 代码" 在新模型下是**：
- 如果 view 是声明式（grid / kanban），Agent 改 `views.timeline.xxx` 定义——数据操作
- 如果 view 是 custom（GraphView.tsx），Agent 改文件内容——**代码操作**，不是数据操作

但新模型的 Table 只存"数据"——源代码文件不在 Table 里。

所以 ai-bookmarks 里同时存在：
- **声明式部分**（tables / transforms / views 之内置 kind / policies）——在 Table 里或者 yaml 里，Agent 改的是结构化配置
- **代码部分**（custom view 的 .tsx / server-side logic）——在文件里，Agent 改的是文件

**ADR 完全没覆盖"代码部分"**。当前 v0 framework 靠 shadow-git + file-watcher，但新模型下这部分如何定位？

→ **这是一个盲点**：新模型对**声明式层**很清晰，但**"Agent 写代码" 这条路**没定义

### 7. 从 v0 到新模型的切换成本

如果要按新模型重构 ai-bookmarks：
- `server/db.ts` → 被 framework 的 TableStore 替代（核心工作）
- `server/lenses.ts` → lenses 变成一个 table 由 framework 管
- `server/interpret.ts` → 拆成三个 Transform 声明
- `server/server.ts` → 90% 被 framework auto-generated API 替代，仅剩自定义路由
- `viewer/` 的 `TimelineView.tsx` → 大概变成 grid view 的配置
- `viewer/` 的 `GraphView.tsx` → 仍是 custom view，保留
- `migrations/` → 被 transformer pipeline 替代

**这是一次重写**，不是 increment。

---

## ADR 使用情况汇总

| ADR | 在 ai-bookmarks 重设计里用到了吗 | 备注 |
|---|---|---|
| [0001 archetype](../adr/0001-archetype-scope.md) | 用到（定场景） | — |
| [0002 storage](../adr/0002-storage-typed-cells.md) | **重用** | 三张 Stored 表 |
| [0003 transform](../adr/0003-transform-primitive.md) | **重用** | 三个 transform |
| [0004 adapter](../adr/0004-adapter-protocol.md) | **没用到** | ai-bookmarks 没外部系统集成 |
| [0005 adapter capabilities](../adr/0005-adapter-capabilities.md) | **没用到** | 同上 |
| [0006 permission granularity](../adr/0006-permission-granularity.md) | 用到（MVP 默认 public） | MVP 里几乎不 exercise |
| [0007 permission DSL](../adr/0007-permission-dsl.md) | 用到（扩展到 team 场景） | 当 MVP 加 owner 时 exercise |
| [0008 NL bidirectional](../adr/0008-nl-bidirectional.md) | 用到（Builder dialog） | 问 "谁能看 X" |
| [0009 default posture](../adr/0009-permission-default-posture.md) | **重用** | MVP 全 public 就是 0009 的 default |
| [0010 user-id grants](../adr/0010-user-id-grants.md) | 暂未用到 | ai-bookmarks MVP 单用户 |
| [0011 adapter credential](../adr/0011-adapter-credential-modes.md) | **没用到** | 无 adapter |
| [0012 agent permissions](../adr/0012-agent-permissions.md) | 用到（Build-phase） | Runtime 未用 |
| [0013 telemetry events](../adr/0013-telemetry-event-model.md) | **重用** | 5 类 event 都触发 |
| [0014 audit subset](../adr/0014-audit-subset.md) | **重用** | mutation + lifecycle 都 audit |
| [0015 sinks + trace](../adr/0015-sinks-and-trace.md) | 用到（trace scope） | — |

### 结论

- **核心 ADR（0002/0003/0009/0013/0014）在 ai-bookmarks 重设计中被重用**——说明这几个是**实用 abstraction**
- **Adapter 相关 ADR（0004/0005/0011）在 ai-bookmarks 里没触及**——不是过度设计（archetype B 的真实场景会用），只是 ai-bookmarks 本身没集成需求
- **权限相关 ADR（0006-0008/0010）在 MVP 下几乎不 exercise**，但扩展到 team 场景立即激活——合理

---

## 重画过程中暴露的 ADR 盲点（未在 E-scenarios 里涉及的）

这些是 pressure-test 过程里**新发现**的问题（E 场景集没覆盖）：

### Finding C1: View system 完全没 ADR
Timeline / Graph / 其他 view kind 的形态、内置 kind 集合、custom view 如何声明数据来源——[ADR-0002](../adr/0002-storage-typed-cells.md) 仅提到"view 是 first-class"但没设计。

→ **新 ADR（高优先级）: View system**

### Finding C2: Derived 字段 / Query 表达未定义
ADR-0002 的 `Derived` / `Hybrid` 都是只有名字的占位。Graph view 的 "cosine similarity edges" 需要表达查询——没有 DSL。

→ **新 ADR（高优先级）: Query language / derivation DSL**

### Finding C3: Transform pipeline 语法
单个 transform 有定义，但"把 transform 串起来成 ingest pipeline"的声明式语法没定义。现在 ai-bookmarks 的 interpret.ts 是手写 for 循环。

→ **新 ADR: Transform composition / pipeline**

### Finding C4: "Pure" transform 对外部数据不精确
Jina Reader 对同 URL 可能返回不同内容（页面被更新了）。ADR-0003 的 `purity: pure` 语义"按 input hash 可缓存"不精确——需要 TTL 或显式"impure but idempotent"区分。

→ **[ADR-0003] amend**：purity 字段细化为 `pure | pure-with-ttl | impure`

### Finding C5: Transform 归属 `agent` event 类别不够精确
[ADR-0013](../adr/0013-telemetry-event-model.md) 的 `agent` payload 假设有 `agent_id`，但 transform 不是 agent。

→ **[ADR-0013] amend**：加 `transform` event category 或扩展 agent payload

### Finding C6: 声明式层 vs 代码层的边界未定
新模型下 Table / Transform / View 部分是声明式数据结构；但 custom view / 模板代码仍是源码文件。Agent 操作两者的机制不同。

→ **新 ADR: 模板的声明式层 vs 代码层边界**——agent 如何操作两者、file watcher 如何整合、rollback 如何处理两者

### Finding C7: 由权限诉求驱动的 schema 变更
E10 的反面：Builder 说"让 bookmark 有 owner 概念"——agent 要同时改 schema 与 policy。flow 没有 ADR。

→ **[ADR-0008] amend** 或**新 ADR**：dialog flow 里"schema 诉求 → policy 诉求 → data migration 诉求"的 co-planning

### Finding C8: 内置 meta 表（users / roles / _migrations / events）
[ADR-0010](../adr/0010-user-id-grants.md) 提到内置 Table 概念（users / roles / role_memberships），但还要加 _migrations / events。这些内置表的 schema、是否对 Builder agent 可见、能否 alter，都没说清。

→ **新 ADR: Internal (framework-managed) tables**
