# 场景验证清单 — `@pneuma-framework/core-domain`

> 本文是 step 5 + 6 "原语组合验证" 的最终盘点。每条场景 → 测试代码位置 → 它证明哪条 ADR 承诺。
> 按 "读完就知道哪些设计承诺被代码 / 哪些还是纸面" 组织。
>
> **状态（2026-04-24）**：**278 tests / 20 files / 4 integration 场景文件 / 全绿 / typecheck clean**.

---

## 一图流盘点

```
Integration 场景 (4 文件 · 34 个 scenario)
  ├─ delete-bookmark.test.ts              5 scenarios    ADR-0018 pipeline
  ├─ weekly-linear-digest.test.ts         7 scenarios    ADR-0021 admin_delegated
  ├─ ai-bookmarks-lens.test.ts            6 scenarios    ADR-0003 purity + composition
  ├─ policy-edge-cases.test.ts            8 scenarios    ADR-0007/0009/0010
  └─ data-integrity.test.ts              15 scenarios    ADR-0002 + system_owned + cascade

Unit 测试 (16 文件 · 244 个 test)
  value-objects: 102   (CellType/Cell/Ref/WhereClause/PermissionContext)
  aggregates:    106   (Table/Row/Operation/Transform/Adapter/PolicySet/EventStream)
  services:       21   (AdapterInvoker/TransformRunner)
```

---

## 场景明细

### § delete-bookmark end-to-end (`test/integration/delete-bookmark.test.ts`)

一条破坏性 Operation 从 UI 点击 和 Agent tool call 两条入口汇合到同一 pipeline。

| # | 场景 | 证明的 ADR 承诺 |
|---|---|---|
| 1 | alice confirmed=true → bookmark + interpretations 级联删除 | [ADR-0018](../adr/0018-operations-as-primitive.md) pipeline + [ADR-0002](../adr/0002-storage-typed-cells.md) cascade_on_target_delete |
| 2 | bob 未被授权 → `PolicyDeniedError` + audit access-deny 事件 | [ADR-0007](../adr/0007-permission-dsl.md) 封闭词汇表 rule precedence |
| 3 | alice confirmed=false → `ConfirmationRequiredError` 不执行 handler | [ADR-0018](../adr/0018-operations-as-primitive.md) destructive 强制 gate |
| 4 | `invoked_via` 字段传播（"ui"）但其它字段不变 | [ADR-0013](../adr/0013-telemetry-event-model.md) ctx 显式传播 |
| 5 | **UI invoke ≡ Agent invoke**：output + audit event payload 形状完全相同 | [ADR-0018](../adr/0018-operations-as-primitive.md) UI↔Agent 对等 **计算级证明** |

---

### § weekly-linear-digest end-to-end (`test/integration/weekly-linear-digest.test.ts`)

一个真 archetype B 团队工具：Linear admin_delegated + per-user 身份绑定 + row-level policy。

| # | 场景 | 证明的 ADR 承诺 |
|---|---|---|
| 1 | alice generate_weekly_digest：pushdown 带 LIN-alice，fake Linear 返回 alice 的 2 条 issue，digest 入库，started/completed 审计 | [ADR-0021](../adr/0021-admin-delegated-credential.md) admin_delegated + [ADR-0005](../adr/0005-adapter-capabilities.md) filter_pushdown |
| 2 | bob 同 Operation 拿自己 1 条 issue — 跨用户隔离 | [ADR-0021](../adr/0021-admin-delegated-credential.md) 安全契约端到端 |
| 3 | 忘了加 user 绑定 filter → `admin_delegated safety contract violated` **fail-closed** | [ADR-0021](../adr/0021-admin-delegated-credential.md) 第 2 条契约，代码强制 |
| 4 | alice / bob 各自只能 query my_digests 拿到自己的 digest | [ADR-0019](../adr/0019-where-clause-ast.md) `row.user_id.id == user.id` ref 路径穿透 |
| 5 | bob 没 digest 时 my_digests 返回空 | row-level filter 正确作用 |
| 6 | 单 Operation 原子串 Query + Transform + Storage，trace_id 一致 | [ADR-0018](../adr/0018-operations-as-primitive.md) composition + [ADR-0013](../adr/0013-telemetry-event-model.md) span 传播 |
| 7 | 同输入第二次调用 Transform → LLM 未被调用（cache 命中） | [ADR-0003](../adr/0003-transform-primitive.md) purity 分级 |

---

### § ai-bookmarks lens pipeline (`test/integration/ai-bookmarks-lens.test.ts`)

个人 AI-native 应用：一个 bookmark 用 N 个 lens 生成 N 份 interpretation。

| # | 场景 | 证明的 ADR 承诺 |
|---|---|---|
| 1 | 3 lenses × 1 bookmark → 3 interpretations，每条正确 lens_id ref | [ADR-0018](../adr/0018-operations-as-primitive.md) handler 循环编排 + [ADR-0002](../adr/0002-storage-typed-cells.md) ref-row |
| 2 | Transform 相同 (body, lens_prompt) → 第二次调用 LLM 0 次 + 幂等无重复 row | [ADR-0003](../adr/0003-transform-primitive.md) purity + cache + handler 幂等 |
| 3 | 加 1 个 lens + 重新调用 → 只对新 lens 调 LLM，旧的 cache 命中 | cache key per (input-hash, impl-hash) 正确分桶 |
| 4 | 两个不同 bookmark → 独立 cache 桶 → 独立 LLM 调用 | 同上 |
| 5 | Operation handler 原子串 Query + Transform(多次) + Storage | [ADR-0018](../adr/0018-operations-as-primitive.md) composition |
| 6 | 传不存在的 bookmark_id → handler 抛 "not found" | 跨 aggregate 引用完整性 |

---

### § policy 边界场景 (`test/integration/policy-edge-cases.test.ts`)

Role / column / anonymous / default_posture / when-input 的 5 类权限边角。

| # | 场景 | 证明的 ADR 承诺 |
|---|---|---|
| 1 | role:admin 可 invoke operation，role:viewer 同 operation 被拒 | [ADR-0007](../adr/0007-permission-dsl.md) role subject + [ADR-0010](../adr/0010-user-id-grants.md) |
| 2 | 同 resource 多条 allow rule：任一命中即允许（alice self / bob admin / carol 被拒） | [ADR-0007](../adr/0007-permission-dsl.md) rule precedence MVP 策略 |
| 3 | column `private_notes`：self read 允，others deny | [ADR-0006](../adr/0006-permission-granularity.md) column 级粒度 |
| 4 | `title` column 的 default_access=public → 匿名读允 | [ADR-0009](../adr/0009-permission-default-posture.md) 默认姿态 |
| 5 | 匿名 user 调 Operation → 默认被拒 | [ADR-0018](../adr/0018-operations-as-primitive.md) operation default_access=restricted 的 framework invariant |
| 6 | `anonymous` subject 显式允许公共资源读 → 匿名拿到内容 | [ADR-0007](../adr/0007-permission-dsl.md) anonymous subject |
| 7 | app 级 default_posture=public 但 Operation invoke 仍强制 restricted | [ADR-0018](../adr/0018-operations-as-primitive.md) 安全前置条件 |
| 8 | self 语义：alice 改自己 row 允，改 bob row 拒 | [ADR-0007](../adr/0007-permission-dsl.md) self vs owner |

---

### § 数据完整性边界 (`test/integration/data-integrity.test.ts`)

schema 强制、ref-row 完整性、级联删除、system_owned 保护、空结果、failure 审计。

| # | 场景 | 证明的 ADR 承诺 |
|---|---|---|
| 1 | ref-row 指向不存在目标 → `StorageError` | [ADR-0002](../adr/0002-storage-typed-cells.md) 跨 aggregate ref 完整性 |
| 2 | `checkRefIntegrity: false` 允许跳过（bulk 导入用） | 同上的 opt-out |
| 3 | ref-row 的 `Ref.table` 与 column 声明 table 不一致 → 拒 | Cell 值类型校验（`isValidCellValue`） |
| 4 | required 列缺失 → `StorageError` | Table.columns[].nullable MVP 语义 |
| 5 | cell 值类型不匹配（Text 列塞 number）→ 拒 | [ADR-0002](../adr/0002-storage-typed-cells.md) 类型封闭 + cell 校验 |
| 6 | cell key 不在 columns 里 → 拒 | schema 严格性 |
| 7 | 3 级级联：删 A → B（cascade）→ C（cascade） | cascade_on_target_delete 链式传播 |
| 8 | cascade_on_target_delete=false → 不级联，孤儿 row 保留 | 显式 opt-in 的 cascade 语义 |
| 9 | ref-row-list cascade：列表里任意一项指向被删 row → 行级联 | [ADR-0002 amend (a)](../adr/0002-storage-typed-cells.md#amendments) ref-row-list |
| 10 | `createIdentitySystemTables` 产出 system_owned = true | decision 3 Option A |
| 11-13 | system_owned 表：addColumn / dropColumn / changeColumn 全被拒 | Table.system_owned schema 锁 |
| 14 | 空 query 结果 → 返回 `{ rows: [] }` 不抛错 | [ADR-0020](../adr/0020-query-dsl.md) QueryExecutor 正常路径 |
| 15 | Operation handler 抛错 → `operation.failed` audit 事件带 error，再抛 | [ADR-0013](../adr/0013-telemetry-event-model.md) failure 记录 + [ADR-0014](../adr/0014-audit-subset.md) audit=true |

---

## 反向索引：ADR ↔ 被哪些场景验证

> 空单元格 ≠ 设计错，而是本轮 scope 外 / 待后续场景触发。

| ADR | 关键承诺 | 被验证的场景 |
|---|---|---|
| [0001](../adr/0001-archetype-scope.md) Archetype scope | A/B 场景落地 | delete-bookmark (A) · weekly-linear-digest (B) |
| [0002](../adr/0002-storage-typed-cells.md) Typed cells | 封闭 CellType + ref-row 完整性 | integrity 1-9, ai-bookmarks-lens 1/6 |
| [0002 amend (a)](../adr/0002-storage-typed-cells.md#amendments) ref-row-list | list 级联 | integrity 9 |
| [0002 amend (b)](../adr/0002-storage-typed-cells.md#amendments) json CellType | (单元测试覆盖 cell.test.ts) | unit only — 未 integration |
| [0002 amend (c)](../adr/0002-storage-typed-cells.md#amendments) reserved-name 放宽 | adapter-backed 允许 `id` | (单元 table.test.ts) — integration 未用 |
| [0003](../adr/0003-transform-primitive.md) Transform 原语 | purity + cache + sandbox | weekly-linear-digest 7, ai-bookmarks-lens 2/3/4 |
| [0004](../adr/0004-adapter-protocol.md) Adapter 协议 | 外部系统接入 | weekly-linear-digest 全 · ai-bookmarks-lens (间接) |
| [0005](../adr/0005-adapter-capabilities.md) Adapter capabilities + filter_pushdown | 声明式下推 | weekly-linear-digest 1/2/3 |
| [0006](../adr/0006-permission-granularity.md) Permission granularity | table / row / column 三档 | policy 3 (column), delete-bookmark 1 (row), weekly-linear-digest 4/5 (row) |
| [0007](../adr/0007-permission-dsl.md) Permission DSL | subject / action / resource 封闭 | policy 1/2/6/8, delete-bookmark 2 |
| [0008](../adr/0008-nl-bidirectional.md) NL bidirectional | explain / who_can | **⏳ 待 agent 对话实际接入** |
| [0009](../adr/0009-permission-default-posture.md) Default posture | per-resource public/restricted | policy 4, 7 |
| [0009 amend](../adr/0009-permission-default-posture.md#amendments) template default_posture | template 决定起始姿态 | **⏳ 待 template 机制实装** |
| [0010](../adr/0010-user-id-grants.md) User-id grants | user:X / role:Y | policy 1 |
| [0011](../adr/0011-adapter-credential-modes.md) Credential modes | shared / per-user / admin_delegated | weekly-linear-digest (admin_delegated) — shared/per-user 也在 adapter-invoker 单测 |
| [0012](../adr/0012-agent-permissions.md) Agent permissions | agent 独立视角 | **⏳ 待 AgentBackend 接入** |
| [0013](../adr/0013-telemetry-event-model.md) Telemetry 5 类事件 | category + ctx 传播 | delete-bookmark 4, weekly-linear-digest 6, integrity 15 |
| [0013 amend](../adr/0013-telemetry-event-model.md#amendments) access event MVP 策略 | deny 发 / allow 不发 | delete-bookmark 2 (deny 事件存在) + policy 全部（allow 路径无事件） |
| [0014](../adr/0014-audit-subset.md) Audit subset | append-only + audit 独立 sink | integrity 15 (failure audit) + delete-bookmark / weekly-linear-digest 所有 audit 路径 |
| [0015](../adr/0015-sinks-and-trace.md) Sinks + trace | 多 sink / trace_id | delete-bookmark 4, weekly-linear-digest 6 |
| [0016](../adr/0016-dev-prod-data-isolation.md) Dev = Prod snapshot sandbox | linear history + containment | **⏳ 待 lifecycle 脚本实装** |
| [0017](../adr/0017-rollback-data-semantics.md) Rollback | destructive + impact disclosure | **⏳ 待 deploy/rollback 流程实装** |
| [0017 amend](../adr/0017-rollback-data-semantics.md#amendments) app_history schema v1 | snapshot+delta+retention | **⏳ 待持久化层实装** |
| [0018](../adr/0018-operations-as-primitive.md) Operation primitive | UI↔Agent 对等 + pipeline | delete-bookmark 全 · weekly-linear-digest 6 · ai-bookmarks-lens 5 |
| [0019](../adr/0019-where-clause-ast.md) WhereClause AST | 跨 policy/query 共享 | policy 8 + weekly-linear-digest 4 + where-clause unit |
| [0019 amend](../adr/0019-where-clause-ast.md#amendments) target namespace | operation policy 的 target | **⏳ 待有 target policy 场景** |
| [0020](../adr/0020-query-dsl.md) Query DSL | filter/sort/fields/pagination + cache key | weekly-linear-digest 4/5, ai-bookmarks-lens 1, integrity 14 |
| [0020 amend](../adr/0020-query-dsl.md#amendments) cache key 自动派生 | **⏳ QueryExecutor 未做 cache，等实装** |
| [0021](../adr/0021-admin-delegated-credential.md) admin_delegated | admin token + per-user binding + fail-closed | weekly-linear-digest 1/2/3 |

---

## ⏳ 未验证清单（非缺陷，属场景未触发）

这些 ADR 承诺**代码里 shape 对**但本轮 integration 未触发实际路径，等下面这些任务激活：

1. [ADR-0008] NL 双向翻译 (`explain` / `who_can`) — 实际 agent 对话场景未接入
2. [ADR-0012] Agent permissions — `AgentBackend` 抽象未实装
3. [ADR-0016/0017] Dev/Prod snapshot + Rollback — lifecycle 脚本层未实装
4. [ADR-0020 amend] Query cache key 自动派生 — QueryExecutor 未加 cache 层
5. [ADR-0009 amend] template `default_posture` — Template 机制未实装
6. [ADR-0019 amend] target namespace — 需要 Operation 写入 ref-row input 的 policy 场景
7. 强合规场景：SOX / HIPAA actor-level audit（per-user mode）
8. `per-user` credential mode 的端到端绑定流程（目前只单测）

全部进 [OPEN-QUESTIONS](../OPEN-QUESTIONS.md) 跟踪。

---

## 阅读顺序建议

看场景 = 看 pneuma 设计怎么落地：

1. 先 **delete-bookmark** — 证明 UI↔Agent 对等（最独特的承诺）
2. 再 **weekly-linear-digest** — 证明 admin_delegated 跨用户隔离（最复杂的承诺）
3. 最后 **ai-bookmarks-lens** — 证明 Transform composition（最 AI-native 的承诺）
4. **policy / integrity** 做横向补证（边界 / 失败路径）

---

## 如何运行

```bash
# 全套
bun test packages/core-domain

# 单文件
bun test packages/core-domain/test/integration/weekly-linear-digest.test.ts

# 某一 describe / test（bun 支持 pattern）
bun test packages/core-domain -t "UI invoke ≡ Agent invoke"

# typecheck 跨 workspace
bun run typecheck
```
