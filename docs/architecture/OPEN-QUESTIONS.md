# Open Questions — 待议题 / 未决 / 未写 ADR

> 本文是 pneuma-framework 设计路径的 roadmap + todo。所有"下次继续"要回到的点都记在这里。
> 同一问题被敲定 → 写成 ADR → 从这里删除（留存在 git 历史）。

**最后更新**：2026-04-24（post nocodb 调研 + 场景演练 + 3 条 amend）

---

## 当前位置

已完成：
- 21 条 ADR（0001-0021）
- 3 条 amend（0005 filter_pushdown / 0019 target namespace / 0020 cache key auto-derive）
- Pressure-test（12 场景 + ai-bookmarks 重设计 + findings）
- NocoDB 深度调研（1129 行）

**下一步**：M5 implementation。不再继续纸面设计 ADR（已到 ROI 递减点）；改由**实施驱动的 DDD 过程**继续发现 ADR。计划见下。

---

## M5 实施计划骨架（Pandazki 定义的 6 步）

```
1. 整理讨论和决策 → 新人看文档知道做啥         ← 刚完成
2. Compact 对话 → 新 session                  ← 即将
3. 新 session 回答：现有 ADR 是否足够启动原型
4. 若够：启动 DDD 过程（domain model + 聚合根先行）
5. 规划 MVP：
   - Domain model 完备，抽象准确
   - 测试先行：只有抽象时跑通完整测试
   - 实现端：本地文件系统 + 全量内存加载，无重依赖
   - 实现到全测试通过
6. 场景验证：例子从易到难，验证原语排列组合够用
```

---

## M5 之前必须确认的 1 条
**"第一个真实 pneuma-app" 候选**：ai-bookmarks 不触及 adapter，验证不充分。建议挑一个**真实触碰 Linear / Notion / GitHub 等外部系统**的小应用作为 primary 验证 target。Pandazki 在新 session 里决定。

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

---

## P1 — 实施过程中大概率要回头敲的 ADR

来自 [pressure-test findings](./pressure-test/findings.md)、[ADR 0018-0021 follow-ups](./adr/)、[nocodb report](./research/nocodb-analysis.md) 推荐：

| 候选 | 触发源 | 优先级 |
|---|---|---|
| **Transform versioning & rerun** | E4 场景：prompt 改了历史数据怎么办 | 🟠 M5 前中期 |
| **Hybrid table model** | E5 场景：adapter-backed + 本地字段 | 🟠 M5 中期 |
| **Transform pipeline / composition** | C3：transform 链式编排声明 | 🟠 M5 中期 |
| **Transform DependencyGraph** | nocodb DependencyTracker 印证 | 🟠 M5 中期（大概率与 versioning 合并） |
| **Prompt injection threat model** | E12：transform sandbox + 信任边界 | 🟡 实施过半 |
| **Transform pipeline failure** | E6：部分 lens 成功部分失败 | 🟡 实施里遇到再写 |
| **Mutation ordering with external** | E7：adapter write + audit emit 一致性 | 🟡 同上 |
| **Internal framework tables** | C8：users / roles / events / _migrations | 🟠 M5 前中期（影响 DDD 聚合根边界） |
| **声明式层 vs 代码层边界** | C6：agent 操作配置 vs 文件 | 🟠 M5 前期（DDD 决定） |
| **Schema-Policy-Data 协同 flow** | C7：加 owner 概念同时改 schema+policy | 🟡 实施到该场景时写 |
| **Team / Group subject** | nocodb 启示 | 🟡 archetype B 真实需求出现时 |
| **匿名 share-link subject** | nocodb 启示 | 🟡 同上 |
| **Policy `enforce_for` 维度** | nocodb 启示 | 🟡 post-MVP |

---

## 远期 ADR（架构成熟后）

| 候选 | 触发源 |
|---|---|
| Rule precedence & deny support | E2 |
| Denial disclosure policy | E3 |
| Policy change impact analysis | E10 |
| Hot-fix branch (archetype C/D) | ADR-0016 follow-up |
| Multi-builder collaboration | ADR-0016 follow-up |
| Identity provider pluggability (OIDC/SAML) | ADR-0010 follow-up |
| Multi-tenancy data model（真正多租户） | ADR-0001 follow-up |
| Operation composition syntax | ADR-0018 follow-up |
| UI binding component set | ADR-0018 follow-up |
| `oauth_prove` binding strategy | ADR-0021 follow-up |
| `sso_derived` binding strategy | ADR-0021 follow-up |
| Admin credential lifecycle | ADR-0021 follow-up |
| Rollback incremental snapshot | ADR-0017 follow-up |
| Snapshot retention policy | ADR-0017 follow-up |

---

## 已知需要 amend 的 ADR（待批量 sweep）

3 条已完成（不在表里）：0005 filter_pushdown / 0019 target / 0020 cache key。

尚未做：

| ADR | 要改什么 | 来源 | 优先级 |
|---|---|---|---|
| [0002 storage](./adr/0002-storage-typed-cells.md) | 加 `ref-row-list<Table>` CellType；Hybrid / Derived 形态拆新 ADR | E1 / E5 | 🟠 影响 0022 |
| [0003 transform](./adr/0003-transform-primitive.md) | `purity` 细化为 `pure / pure-with-ttl / impure`；sandbox + outputSchema 强约束 | C4 / E12 | 🟡 实施时补 |
| [0005 adapter capabilities](./adr/0005-adapter-capabilities.md) | Capabilities 自动派生 Operation 的具体规则（Gap #4b） | Scenario walkthrough | 🟠 0022 写时顺手补 |
| [0007 permission DSL](./adr/0007-permission-dsl.md) | Resource 加 `operation:<id>`；predicate `ref-list.contains`；rule precedence 澄清 | E1 / E2 / 0018 / 0019 | 🟠 0022 依赖 |
| [0008 NL bidirectional](./adr/0008-nl-bidirectional.md) | `reason` 枚举澄清；`explain_for_denied_user` 区分；policy-edit impact analysis 强制 flow | E2 / E3 / E10 | 🟡 |
| [0011 adapter credential](./adr/0011-adapter-credential-modes.md) | 升级到三 mode；交叉引用 0021 | 0021 follow-up | 🟡 |
| [0012 agent permissions](./adr/0012-agent-permissions.md) | Build-phase agent 区分 trusted/untrusted input | E12 | 🟡 |
| [0013 telemetry](./adr/0013-telemetry-event-model.md) | `operation` 作 event category；payload 补 failure case | 0018 / E6 | 🟡 |
| [0014 audit](./adr/0014-audit-subset.md) | Audit emit 失败的行为 | E7 | 🟡 |
| [0015 sinks + trace](./adr/0015-sinks-and-trace.md) | Span 嵌套；transform chain 是 span 不是 trace | C5 | 🟡 |

---

## 非 ADR 待办

- ✅ **NocoDB 深度调研**（完成 2026-04-24）：[report](./research/nocodb-analysis.md)
- 📝 **M5 implementation plan**：compact 后新 session 起草
- 🎯 **"真实" pneuma-app 候选**：compact 后敲
- 🔬 未来可能补调研：Airtable 官方文档 / Supabase / SpiceDB（Zanzibar）/ Notion 公开架构
