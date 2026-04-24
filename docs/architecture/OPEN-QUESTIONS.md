# Open Questions — 待议题 / 未决 / 未写 ADR

> 本文是 pneuma-framework 设计路径的 roadmap + todo。所有"下次继续"要回到的点都记在这里。
> 同一问题被敲定 → 写成 ADR → 从这里删除（留存在 git 历史）。

**最后更新**：2026-04-24（P0 Operation Semantics Cleanup 完成；0018 + 0026 各加一条 amendment）

---

## 当前位置

已完成：
- 24 条 ADR（0001-0021 + 0025 / 0026 / 0027；0022-0024 仍在 P0 候选）
- **12 条 amend**（0005 filter_pushdown / 0009 template default_posture / 0013 access event MVP + operation 类别路由 / 0017 app_history schema v1 蓝本 / **0019 target namespace + input ValueRef (2 条)** / 0020 cache key auto-derive / 0002 ref-row-list + json CellType + reserved-name 放宽 / 0003 purity 三档正式化 / **0018 P0 semantics cleanup — reads_only+code / derived-list / graph / object** / **0026 output_schema symmetry**）
- Pressure-test（12 场景 + ai-bookmarks 重设计 + findings）
- **2 份深度调研**：NocoDB（1129 行）+ ToolJet（1043 行）
- **Step 4 DDD**：domain-model.md（667 行，8 aggregate roots + 6 value objects + 5 domain services）+ 8 张架构图
- **Step 5 + 6 MVP**：`packages/core-domain/` — 5 integration 场景文件 + scenario-validation.md checklist
- **阶段 B 全部完成**：runtime / 2 新模板 / 2 真 example (见下)

### Packages (6 个 workspace 包)

| 包 | 用途 |
|---|---|
| `@pneuma-framework/core-domain` | 8 aggregates + 6 VOs + 6 services + B1 基础设施 (SQLite Row / NDJSON audit / app_history / file adapter) |
| `@pneuma-framework/runtime` | 把 AppConfig 声明 → Bun.serve HTTP app；新增 `/api/config` (ADR-0026) + **SSE `/api/events/stream`** (ADR-0027) + **EventBroadcaster** |
| `@pneuma-framework/adapter-linear` | Linear Adapter: GraphQL client + admin_delegated impl + email_match binding |
| `@pneuma-framework/provider-openrouter` | LLMProvider 实现 (Sonnet 4.6 via OpenRouter) |
| `@pneuma-framework/core` (2.x 继承 + Day 3-5 新增) | LifecycleOrchestrator + process-manager + wire-protocol + agent-backend + MCP bridge + **OperationToolBridge** (ADR-0026) + **template-mcp-bridge 独立 stdio 进程** (ADR-0026) + **session-index** (ADR-0025) |
| `@pneuma-framework/cli` (2.x 继承) | `pneuma-framework dev <template>` |

### Templates (2 新 + 3 既有)

| Template | 状态 | 用什么 |
|---|---|---|
| `templates/bookmarks-core-domain` (新) | ✅ dogfood pass | runtime + core-domain (in-memory Operations demo) |
| `templates/weekly-linear-digest` (新) | ✅ real Linear + Sonnet 4.6 跑通 | runtime + core-domain + adapter-linear + provider-openrouter |
| `templates/ai-bookmarks-core-domain` (新) | ✅ real Jina + Sonnet 4.6 跑通 | runtime + core-domain + provider-openrouter (3-lens interpretation) |
| `templates/ai-bookmarks` (M4 既有) | 🟡 可归档 | 手写 server (未用 core-domain) — 已被 ai-bookmarks-core-domain 取代 |
| `templates/minimal` / `templates/doc` (M4 既有) | ✅ 保留 | smoke-test templates |

### Examples (2 新 + 既有)

| Example | 需要 key |
|---|---|
| `examples/bookmarks-dogfood` (新) | 无 |
| `examples/weekly-linear-digest-real` (新) | LINEAR_API_KEY + OPENROUTER_API_KEY |
| `examples/ai-bookmarks-real` (新) | OPENROUTER_API_KEY |
| `examples/opencode-chat` (既有) | OPENROUTER_API_KEY (opencode backend) |

### 两个真 AI-native app 在本地可跑

- **weekly-linear-digest**: 用 admin_delegated Linear API 把你这周创建的 issue 用 Sonnet 4.6 总结成 markdown 周报。fail-closed 契约在真 Linear 边界成立（Pandazki 账号实测 44 条 issue, Sonnet 输出按模块分组 + themes + next action）
- **ai-bookmarks-core-domain**（+ 主线 A 2026-04-24）: URL → Jina Reader → 3 个 lens × Sonnet 4.6 → 各自 interpretation + 1536-dim embedding。Transform purity cache 保证同 URL + 同 lens 不重烧 LLM。新增: `related_bookmarks` + `bookmark_graph` Operations 在内存里做 cosine 相似度 + per-lens 聚类。viewer 有 "Related" 面板 + SVG "Graph" 切换。

**下一步**：主线 A + C 都已完成（见下）。demo 可在 2 分钟内重现（见 [`examples/opencode-tools-demo/demo.md`](../../examples/opencode-tools-demo/demo.md)）。剩余候选见"## Post-compact 候选"。

---

## 6 步计划进度（Pandazki 定义）

```
1. 整理讨论和决策 → 新人看文档知道做啥                              ✅ Done
2. Compact 对话 → 新 session                                        ✅ Done
3. 新 session 回答：现有 ADR 是否足够启动原型                         ✅ Done
4. 若够：启动 DDD 过程(domain model + 聚合根先行)                    ✅ Done
5. 规划 MVP:                                                        ✅ Done
   - Domain model 完备,抽象准确                                      ✅
   - 测试先行: 只有抽象时跑通完整测试                                ✅ 249 tests
   - 实现端: 本地文件系统 + 全量内存加载, 无重依赖                    ✅ InMemoryRepository only
   - 实现到全测试通过                                                ✅
6. 场景验证: 例子从易到难,验证原语排列组合够用                        ✅ Done
   - delete_bookmark end-to-end (5 scenarios)                        ✅
   - weekly-linear-digest end-to-end (7 scenarios)                   ✅
   - ai-bookmarks lens pipeline                                      📝 可选, 推后
```

---

## Step 5 前需敲定的 v1 spec 缺口（借 ToolJet 报告触发）

**来源**：[ToolJet 深度调研 §15.C](./research/tooljet-analysis.md)。这 3 条是"ADR 定了 primitive 但具体 wire 字段没列"，step 5 起 workspace 时当即碰到。不写新 ADR，直接在 code 里落实 + 在 domain-model.md amend 记录：

| Spec 缺口 | 说明 | 建议处理 |
|---|---|---|
| **CellType 物理存储映射** | [ADR-0002](./adr/0002-storage-typed-cells.md) 的 semantic CellType 落到 SQLite/Postgres 的哪种物理列 / jsonb path | MVP 用 in-memory，不需要映射；真落盘时一张"semantic→physical"表 |
| **Operation 的 wire schema** | [ADR-0018](./adr/0018-operations-as-primitive.md) 给了 primitive，但具体字段集（id / inputSchema / sideEffects / handler ref / UI hints / Agent hints / audit category / confirmOverride / policyRef）未枚举齐 | step 5 写 TypeScript interface 时 bake 出最小可行集 |
| **Adapter capability 具体词表** | [ADR-0005](./adr/0005-adapter-capabilities.md) 说要 capability，词表未定。建议最少：`read / list / createOne / updateOne / deleteOne / filterPushdown / paginate / orderBy / textSearch / schemaIntrospect` | step 5 首个 in-memory reference adapter 实现时落实 |

---

## P0 — 未决 ADR（实施过程中可能被迫写）

### ADR-0022: View System

依赖 [ADR-0018](./adr/0018-operations-as-primitive.md) / [0020](./adr/0020-query-dsl.md) / [0021](./adr/0021-admin-delegated-credential.md)。

**未决问题（已经有倾向；等实施验证）**：

| 问题 | 已有倾向 |
|---|---|
| **V-focus 1**：内置 view kind | **MVP 5 个**：grid / card-list / detail / form / custom（补 form 源自 nocodb 启示） |
| **V-focus 2**：View 挂载 Operation 语法 | operation id 引用，复用 [ADR-0018](./adr/0018-operations-as-primitive.md) UIBinding |
| **V-focus 3**：Custom view 数据契约 | `{ rows, operations, ctx }` 传入 React 组件 |
| **V-focus 4**：End User 临时 override | 可 sort/filter override 不落盘（URL query 携带） |
| **V-focus 5**：View 与 Policy 关系 | `view:<id>` 独立 resource + row policy 两层叠加 |
| **V-add 6 (nocodb)**：view-level column override | 独立存储（每 view 字段顺序/宽度/显隐） |
| **V-add 7 (nocodb)**：lock_type | 三档 collaborative / locked / personal |
| **V-add 8 (nocodb)**：shared-view uuid | 匿名分享作为一级 access pattern |
| **V-add 9**：auto_refresh | view 声明轮询间隔（client-side 行为） |

### ADR-0023: Dashboard primitive

多个 View 组合容器，独立 entity。NocoDB 2026 新增印证。View 之后做。

### ADR-0024: Application Environment Model（ToolJet 暴露的新维度）

**触发**：[ToolJet 调研 §13.2](./research/tooljet-analysis.md)。ToolJet 的 `app_environments` + `AppVersionStatus` 枚举（`DRAFT` / `PUBLISHED` / `RELEASED`）+ 环境级权限（`can_access_development` / `staging` / `production` / `released`）揭示：**多环境不是纯 infra 概念，是影响权限 + data source options + commit 行为的应用层一等公民**。

pneuma CLAUDE.md 目前只有 Dev / Release 两档，可能需要 4 档：
- `Dev` —— Builder 构建中
- `Staging` —— Builder 还能碰、但 End-User 也能看
- `Production` —— 冻结，End-User 使用
- `Released` —— 已 publish 的某个版本，允许 Production 同时跑 Released 版本 + 新 dev

**要回答**：
1. archetype A/B 够不够 2 档，不需要 Staging？（倾向 MVP 只做 Dev/Prod，3/4 档等 archetype C 真实需求）
2. `AppVersionStatus` vs pneuma 现有"deploy version" 的概念差异
3. 环境级权限（`can_access_production`）的语法——是 `policy on: env:production` 还是 subject `role:prod-viewer`

**优先级**：🟠 M5 中后期（MVP 先只做 Dev 即可，Prod 语义在 step 6 场景验证时触发）

### ~~ADR-0025: AI Conversation Persistence~~ → 已写 ✅

Day 5 已落地 Option B (thin pointer, opencode owns content): [ADR-0025](./adr/0025-agent-conversation-persistence.md)。跨重启 resume 已 demo 验证。PRD approval gate 等并入 ADR-TBD（见该 ADR Follow-ups）。

---

## P1 — 实施过程中大概率要回头敲的 ADR

来自 [pressure-test findings](./pressure-test/findings.md)、[ADR 0018-0021 follow-ups](./adr/)、[nocodb report](./research/nocodb-analysis.md) 和 [tooljet report](./research/tooljet-analysis.md) 推荐：

| 候选 | 触发源 | 优先级 |
|---|---|---|
| **Transform versioning & rerun** | E4 场景：prompt 改了历史数据怎么办 | 🟠 M5 前中期 |
| **Hybrid table model** | E5 场景：adapter-backed + 本地字段 | 🟠 M5 中期 |
| **Transform pipeline / composition** | C3：transform 链式编排声明 | 🟠 M5 中期 |
| **Transform DependencyGraph** | nocodb DependencyTracker 印证 | 🟠 M5 中期（大概率与 versioning 合并） |
| **Prompt injection threat model** | E12：transform sandbox + 信任边界 | 🟡 实施过半 |
| **Transform pipeline failure** | E6：部分 lens 成功部分失败 | 🟡 实施里遇到再写 |
| **Mutation ordering with external** | E7：adapter write + audit emit 一致性 | 🟡 同上 |
| **Internal framework tables** | C8 + step 4 决策 3：users / roles / memberships = system_owned Tables；已吸收进 domain-model.md | ✅ 已在 DDD 阶段吸收 |
| **声明式层 vs 代码层边界** | C6：agent 操作配置 vs 文件 | 🟠 M5 前期（DDD 决定） |
| **Schema-Policy-Data 协同 flow** | C7：加 owner 概念同时改 schema+policy | 🟡 实施到该场景时写 |
| **Team / Group subject** | nocodb 启示 | 🟡 archetype B 真实需求出现时 |
| **匿名 share-link subject** | nocodb 启示 | 🟡 同上 |
| **Policy `enforce_for` 维度** | nocodb 启示 | 🟡 post-MVP |

---

## 远期 ADR（架构成熟后）

> **号段说明**: ADR-0026 / 0027 已被 2026-04-25 新 ADR 占用 (Agent Tool-Call Binding / Live Event Stream)。下列 Builder Team Collaboration + AI Usage Metering 本来挂这两号，现统一改为 ADR-TBD，未来写时自行分配下一个号。

| 候选 | 触发源 |
|---|---|
| **ADR-TBD Builder Team Collaboration**（WS broadcast + Yjs-like CRDT） | ToolJet §13.3：多 Builder 协同编辑 + `EventsGateway` + `YjsGateway` 印证；[ADR-0016](./adr/0016-dev-prod-data-isolation.md) follow-up |
| **ADR-TBD AI Usage Metering**（credits / cost / model-rate） | ToolJet `organization_ai_credit_history` 印证；hosted 才需要 |
| Rule precedence & deny support | E2 |
| Denial disclosure policy | E3 |
| Policy change impact analysis | E10 |
| Hot-fix branch (archetype C/D) | ADR-0016 follow-up |
| Identity provider pluggability (OIDC/SAML) | ADR-0010 follow-up |
| Multi-tenancy data model（真正多租户） | ADR-0001 follow-up |
| Operation composition syntax | ADR-0018 follow-up |
| UI binding component set | ADR-0018 follow-up |
| `oauth_prove` binding strategy | ADR-0021 follow-up |
| `sso_derived` binding strategy | ADR-0021 follow-up |
| Admin credential lifecycle | ADR-0021 follow-up |
| Snapshot retention policy | ADR-0017 follow-up（已被 [ADR-0017 Amendment 2026-04-24](./adr/0017-rollback-data-semantics.md#amendments) 吸收大半） |

---

## 已知需要 amend 的 ADR（待批量 sweep）

**9 条已完成**（不在表里）：0005 filter_pushdown / 0019 target + input ValueRef / 0020 cache key / 0009 template default_posture / 0017 app_history schema / **0002 ref-row-list + json + reserved-name-relaxation** / **0013 access event MVP 策略 + operation 类别路由** / **0003 purity 三档正式化**.

尚未做：

| ADR | 要改什么 | 来源 | 优先级 |
|---|---|---|---|
| [0002 storage](./adr/0002-storage-typed-cells.md) | Hybrid / Derived 形态拆新 ADR；正式加 `relations` 字段（[ADR-0020](./adr/0020-query-dsl.md) 依赖） | E5 / 0020 | 🟡 真正 Hybrid / Derived 场景触发时做 |
| [0003 transform](./adr/0003-transform-primitive.md) | sandbox runtime 强约束仍待补（purity 三档已 amend） | E12 | 🟡 |
| [0005 adapter capabilities](./adr/0005-adapter-capabilities.md) | Capabilities 自动派生 Operation 的具体规则（Gap #4b）；capability 词表（tooljet §15.C 推荐至少 10 种） | Scenario walkthrough + tooljet | 🟡 |
| [0007 permission DSL](./adr/0007-permission-dsl.md) | Resource 加 `operation:<id>` (代码已做)；predicate `ref-list.contains`；rule precedence 澄清 | E1 / E2 / 0018 / 0019 | 🟡 |
| [0008 NL bidirectional](./adr/0008-nl-bidirectional.md) | `reason` 枚举澄清；`explain_for_denied_user` 区分；policy-edit impact analysis 强制 flow；**PRD approval gate**（tooljet 启示） | E2 / E3 / E10 / tooljet §15.A | 🟡 实施对话式 agent 时补 |
| [0011 adapter credential](./adr/0011-adapter-credential-modes.md) | 升级到三 mode；交叉引用 0021 | 0021 follow-up | 🟡 |
| [0012 agent permissions](./adr/0012-agent-permissions.md) | Build-phase agent 区分 trusted/untrusted input；Transform sandbox runtime enforcement | E12 | 🟡 |
| [0013 telemetry](./adr/0013-telemetry-event-model.md) | payload 补 failure case（operation 类别已 amend） | E6 | 🟡 |
| [0014 audit](./adr/0014-audit-subset.md) | `is_ai_generated` / `actor_kind` 字段对齐 0017 amendment | 0017 amend | 🟡 |
| [0015 sinks + trace](./adr/0015-sinks-and-trace.md) | Span 嵌套；transform chain 是 span 不是 trace；SSE vs audit sink 区分（ADR-0027 Follow-up） | C5 / 0027 | 🟡 |
| [0018 operations](./adr/0018-operations-as-primitive.md) | `agent_tool` 加专用 metadata（hint text, example input）区别于 `ui_binding`；`OperationOutput` 加 "derived row list" / "graph" kind（主线 A + ADR-0026 Follow-up） | 主线 A + 0026 | 🟡 |

---

## 非 ADR 待办

- ✅ **NocoDB 深度调研**（2026-04-24）：[report](./research/nocodb-analysis.md)
- ✅ **ToolJet 深度调研**（2026-04-24）：[report](./research/tooljet-analysis.md)
- ✅ **Step 4 DDD domain model + 6 架构图**（2026-04-24）：[domain-model.md](./spec/domain-model.md)
- ✅ **Step 5 + 6 MVP 实现**（2026-04-24）：`packages/core-domain/`, 249 tests green
- 🔬 未来可能补调研：Airtable 官方文档 / Supabase / SpiceDB（Zanzibar）/ Notion 公开架构

---

## Step 5 + 6 结果 snapshot（2026-04-24）

实施过程中对"原语组合是否够用"的结论：

### 证实足够 ✅
- ADR-0018 Operation primitive（UI↔Agent 双绑定、pipeline、confirmation gate）
- ADR-0019 WhereClause AST（跨 policy/query 共享求值 + 静态分析 + ref 路径穿透）
- ADR-0021 admin_delegated credential（fail-closed 安全契约在 AdapterInvoker 里可落地）
- ADR-0017 app_history rollback schema（借用 ToolJet，本次 step 5 未触发但 schema 已 bake）
- Row-level policy via `row.<ref-col>.id == user.id` 这条 ref-path 模式
- Transform purity + cache (pure / pure-with-ttl / impure) 三档分级
- IdentityRegistry = 3 system-owned Tables 的决策（Option A）

### 实施中发现的小缺口（已 amend）
- ref-row-list 在 CellType 里没正式列——补到 ADR-0002 amend(a)
- JSON 结构化字段缺类型——ADR-0002 amend(b) 加 `json` CellType
- `id` 等 reserved 列对 adapter-backed 表反感——ADR-0002 amend(c) 放宽
- `access` 事件 allow vs deny 发射策略未定——ADR-0013 amend

### 仍待实施时再验证的（暂无证据但也无反证）
- Hybrid Table（adapter-backed + 本地扩展字段）
- Derived Table（query 物化视图）
- Query 的 `with` 嵌套关系查询
- Transform 链式/复合
- 多环境（Dev/Staging/Prod）app 一等公民 (ADR-0024 候选)

---

## 阶段 B 入口（core-domain 就绪 → framework 化）

core-domain 已不只是 in-memory 纯抽象层；B1 完成后有真持久化 + 真 IO 能力。

- **✅ B1 基础设施**（2026-04-24 完成）:
  - ✅ Bun SQLite Row persistence (`BunSqliteRowRepository` + cell-codec 保型)
  - ✅ NDJSON AuditSink (真 append-only 文件 + Reader + fail-closed 联动 EventStream)
  - ✅ app_history SQLite store (ADR-0017 amend v1 schema, CHECK 约束齐全, snapshot-only MVP, retention 裁剪)
  - ✅ File reference AdapterImpl (真 filesystem IO + filter pushdown, 证明 Adapter 协议能接真外部系统)
- **✅ B2 Lifecycle**（2026-04-24 完成 — 大部分 2.x 已成熟）:
  - ✅ `packages/core` 的 LifecycleOrchestrator + process-manager + markers 协议 (shell 脚本 + env 变量 + `##pneuma:*` markers 完整) — 2.x 继承; 95% 覆盖 B2
  - ✅ 语义 tool API (lifecycle.dev.start/stop/restart/build/deploy/migrate/fork + workspace.tree + checkpoint.*) 在 tools/registry — 100% 完成
  - ✅ MCP bridge (`mcp-server.ts`) — 100%
- **✅ B3 Agent + Wire**（2026-04-24 完成 — 大部分 2.x 已成熟）:
  - ✅ AgentBackend 抽象 + registry + opencode 适配 — 100%, 事件流 + permission gate 可用
  - ✅ Wire protocol 双向 (focus / action / permission-prompt) — 95%, viewer 里 Operation tool-call 绑定留给后续 scenario 触发
- **✅ B4 Template 契约**（2026-04-24 完成）:
  - ✅ `packages/core/src/manifest.ts` schema v1 — 100% 字段完整 + 校验
  - ✅ **新** `packages/runtime`: 把 core-domain 声明 → Bun.serve HTTP app (17 tests 覆盖 boot / 路由 / 持久化 roundtrip / Bun.serve 真 HTTP)
  - ✅ **新** `templates/bookmarks-core-domain`: 第一个用 runtime + core-domain 的参考模板 (schema + 3 Operations + policy + 4 scripts)
  - ✅ **新** `examples/bookmarks-dogfood`: 一键端到端 dogfood (LifecycleOrchestrator → dev.sh → AppRuntime → Bun.serve, SQLite + NDJSON 真持久化)

**阶段 B 整体完成** —— `pneuma-framework` 现在能:
- 接收一个 AppConfig 声明 (`packages/runtime`) → 装起 core-domain 所有 service + B1 基础设施 → 暴露 HTTP
- 通过 `packages/cli` 或 `examples/bookmarks-dogfood/run.ts` 用 lifecycle 脚本协议拉起
- 持久化跨重启; 审计追溯可查; destructive op 有 impact disclosure 闸门

待做 (等 scenario 触发):
- 🟡 Wire protocol 的 Operation tool-call → viewer 绑定 (M3 scope)
- 🟡 真 auth / session 层 (替换 `X-Pneuma-User-Id` header)
- 🟡 deploy + rollback 流程跟 app_history store 联动
- 🟡 更多 reference templates (gridboard-like, dashboard, ...)

---

## ✅ 已完成主线

### 主线 A — Embedding + Graph for ai-bookmarks（2026-04-24 → 2026-04-25）

Plan: [2026-04-24-embedding-graph-ai-bookmarks.md](../superpowers/plans/2026-04-24-embedding-graph-ai-bookmarks.md).

Shipped:
- `EmbeddingProvider` interface in core-domain + `OpenRouterEmbeddingProvider` in provider-openrouter
- `embed_text` Transform (`pure-with-ttl=7d`, in/out: RichText → vector[1536])
- nullable `embedding` column on `interpretations` table
- `add_bookmark` now embeds each interpretation body (graceful degradation on provider error)
- `related_bookmarks` Operation: top-K candidates by cosine similarity (MAX aggregation across lenses when `lens_slug` omitted)
- `bookmark_graph` Operation: per-lens edges above threshold (one edge per lens when pair is close under multiple lenses)
- Viewer inline "Related" panel per bookmark + "Graph" toggle with hand-rolled SVG circle layout
- 11 tasks / 14 commits / subagent-driven-development workflow with 2-stage review (spec + quality) per task

Known follow-ups surfaced but deferred:
- ~~`OperationOutput` type has no "derived row list" or "graph" shape (`void` is placeholder; TODO notes in code)~~ ✅ Resolved by P0 2026-04-24 (ADR-0018 amend)
- `LLMProviderError` is local to provider-openrouter while `EmbeddingProviderError` is in core-domain — asymmetry that reviewer of Task 2 recommended unifying
- `TransformRunner` cache returns shared references (potential mutation footgun if any consumer does in-place math; Task 5 reviewer flagged)
- Code handlers bypass row-level policy via `storage.listRowsByTable` — needs a policy-aware list helper when row-level policy lands
- ~~Code-handler reads-only-in-practice Operations (`related_bookmarks`, `bookmark_graph`) have no declarative `reads_only` slot because `Operation` invariant forces `reads_only: true` ⇒ `handler.kind === "query"`~~ ✅ Resolved by P0 2026-04-24 (ADR-0018 amend)
- Viewer `refreshBookmarks` can re-render while async per-card fetches are in flight → stale-write; not a visible bug at current scale
- Duplicate cosine helper between `templates/ai-bookmarks-core-domain/server/cosine.ts` and M4 `templates/ai-bookmarks/server/db.ts:142` — dedupe when M4 is archived

### 主线 C — **Agent in loop: MCP bridge + live viewer + session resume**（2026-04-25）

Plan 无正式 planning doc — 探路式增量开发。Research: [探路 Phase 1](../architecture/ultra-review-2026-04-25.md) + Day 5-A 研究（研究结论在 commit message 里）。

Shipped (13 commits, `f94cdeb` → `0d15da4`)：
- **ADR-0026 [Agent Tool-Call Binding](./adr/0026-agent-tool-call-binding.md)**: runtime 加 `GET /api/config` 暴露 Operation 元数据 → LifecycleOrchestrator 在 `##pneuma:service-ready` 之后拉取 → 独立 stdio MCP bridge (`packages/core/bin/template-mcp-bridge.ts`) 把 Operation 翻成 MCP tool → opencode 通过 `config.mcp` 挂载。Agent 通过 `op.add_bookmark` 真正调 Operation，SQLite 真落行。
- **ADR-0027 [Live Event Stream](./adr/0027-live-event-stream-sse.md)**: runtime 加 SSE `/api/events/stream`，OperationExecutor 完成后 emit `operation-executed` 事件，viewer 用 `EventSource` 订阅 + 300ms debounce 刷新。viewer 右上角 `● live / reconnecting / offline` 指示器。
- **ADR-0025 [Agent Conversation Persistence](./adr/0025-agent-conversation-persistence.md)** (Day 5): 轻量 session-index JSON 在 `workspace/.pneuma/sessions.json`，记 `(backend_session_id, app_id, builder_id, initial_prompt, timestamps)`；opencode 自己管对话内容（`~/.local/share/opencode/opencode.db`）。`PNEUMA_RESUME=1 agent-only.ts` 跨重启 demo 验证：agent 记得之前加的 Anthropic "Building Effective Agents" bookmark。
- Agent stdout streaming 修复（Day 5-C）：原 `part.time?.start` 过滤器漏掉所有 delta event，改用 delta-print 策略让 agent 文字真正在 terminal 流出。
- **5-min demo script** [`examples/opencode-tools-demo/demo.md`](../../examples/opencode-tools-demo/demo.md)：Act 1 起 server + 浏览器 → Act 2 agent 加 bookmark + viewer 实时更新 → Act 3 kill+restart+resume。Pandazki 本人亲自跑通 2 次。

Known follow-ups：
- SSE reconnect 在 <5s kill+restart 下透明切换 (browser EventSource 原生 retry 快到肉眼看不见 `● reconnecting`) — 是好的 UX 但 demo 戏剧性弱，demo.md 加了说明
- `packages/core` 的 wire-protocol WS (agent↔Builder 对话 channel) **仍未被任何 viewer 真正消费**；ADR-0027 明确 SSE 跟 wire-protocol 是两条独立 channel，后者等 Phase 3 ("Builder 对话构建 app") 真需求触发再做
- `/api/config` 不在 `http.ts` 头部注释里 — 小 doc gap
- `resolveBridgePath()` 用相对路径遍历 (`../../core/bin/template-mcp-bridge.ts`) — monorepo 现状 OK，将来目录深度变了会断
- `OperationToolBridge` (in-process，给未来非 opencode consumer 用) 目前零 consumer — 是投资，不是代码债

---

## Post-compact 候选

主线 A ✅ + 主线 C ✅ 后，剩下这些：

### 主线 B — **第三个 app（让 Pandazki 自己挑）**（仍候选）

已有 2 个真 app。想进一步验证 primitive 组合够用，得挑第三个真需求。候选思路：

- **Daily note**：每天一条笔记 → 每周 / 每月自动聚合 → LLM 帮改思路
- **Reading log**：正在读的书 + 进度 + 摘录 + Sonnet 4.6 思考提问
- **Review tracker**：每周把 weekly-linear-digest + ai-bookmarks 的输出合并回顾，生成下周重点
- **第二人视角**：Pandazki 另一 Linear 账号真 bind 进 weekly-linear-digest，验证 `admin_delegated` 在多用户隔离

**ROI**: 每个新场景都是对 primitive 组合的真实验证。但 ultra-review (2026-04-25) 的 4 个 reviewer 有 3 个点名砍 — 在 agent-in-loop 证实之前新 app 只会扩表面，不会推动愿景。现在 agent-in-loop 已证实，主线 B 重新可讨论。

### 主线 D — **Phase 3: Builder 通过对话构建 app 本身**（新的深水区）

Phase 1 (UI 驱动 data ops) ✅ + Phase 2 (Agent 驱动 data ops) ✅ 之后，Phase 3 是真正的 pneuma 差异化: **agent 通过对话新增/改动 Operation / Schema / Lens / Policy**。比如：

- "给 interpretation 加一列 tags" → agent 改 Table schema
- "做一个新 lens 叫 anti-hype，prompt 是..." → agent 新增一行 lens 数据（今天可以做） **或更远**: 新增一个 Operation 类型
- "加一个 Operation 'summarize_this_month'" → agent 生成 + 注册新 Operation

触及：
- Runtime 热重载（新 Operation 声明不用重启 server）
- Schema 版本化 (ADR-0017 `app_history` 实际 write path 要激活)
- Agent permission 信任边界 (ADR-0012 amend 的 "trusted vs untrusted input" 需真做)
- Agent 输出代码 / 声明 的安全沙箱

**ROI**: pneuma 真正的 raison d'être。但比 Day 1-5 加起来都深，建议先 brainstorm scope 再动手。

### 主线 E — **Wire protocol agent↔Builder 对话 channel**

今天的 SSE (ADR-0027) 是 server→client 单向观察。真正的 "agent 说'准备做 X，确认吗？' → Builder 在 viewer 里批准" 要走 `packages/core/src/wire-protocol/` (WebSocket 双向 + permission/focus/action envelope)。Phase 3 的前置之一。

### 收尾类 / 清理

- **归档 M4 ai-bookmarks** — 跟 ai-bookmarks-core-domain 功能重叠了；写个 DEPRECATED.md 说明迁移路径，等再有一阵观察期后 delete
- **app_history 实际 append** — 目前 SQLite 表创好了但没 Operation 写过一行。接 deploy/rollback 流程时激活（主线 D 会触发）
- **amend sweep 剩余 8 条** — 见上面表格，都是 🟡 等场景触发
- **CellType→JSON Schema 翻译完整** — 今天 `derived` / `json` 无 schema 等 fall through 到 `{}`（agent 只能信任，验证不了）；ADR-0026 Follow-up

### 注意事项（给下次 session）

1. **server 是否在跑**: 今天的 demo 已用 `lsof -ti:8765 | xargs kill` 停掉；`~/.pneuma-bookmarks` 工作目录保留（有 5 bookmarks + 15 interpretations + 3 lenses + 4 session records）。
2. **API keys 不要进 commit**：`LINEAR_API_KEY=lin_api_...` 和 `OPENROUTER_API_KEY=sk-or-v1-...` 是真 key, 以 env var 形式传入, 文件里只有 placeholder。
3. **今天 commit 量**：主线 C 13 个 + Day 5 4 个 + Day 4 3 个 + 本次文档同步 + 3 个新 ADR + 3 个 amendment + OPEN-QUESTIONS 自身更新 ≈ 30+ commit（`git log --oneline --since="24 hours ago"` 看全貌）。
4. **Bun ESM 注意**：workspace dep 要 `bun install` 之后才能 resolve；新加包别忘了跑一次。
5. **typecheck 路径**：新加 package 记得 append 到根 `package.json` `typecheck` 里 (`tsc --noEmit -p packages/NEW/tsconfig.json && ...`)。
6. **demo 如何复现**：[`examples/opencode-tools-demo/demo.md`](../../examples/opencode-tools-demo/demo.md) 三幕剧。带上 `OPENROUTER_API_KEY` 就能跑。
