# ADR-0018: Operation 作为 first-class primitive — UI 与 Agent 的双绑定

**Status**: Accepted
**Date**: 2026-04-23
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: primitive, ui, agent, ai-native, architecture

---

**Amendments:** ADR-0023 adds `Operation.surface` to distinguish agent tool exposure from end-user app surface eligibility.

## Context

Pandazki 在 pressure test 后的讨论里抛出一条关键约束：

> 所有 query / operate 很有可能 UI 和 Agent 需要同时使用，所以应该要有一套语义对等的体系，让界面功能和 agent 能力能永远匹配。

这条约束其实揭示了 **pneuma 之所以是 AI-native 框架的根本条件**：如果"UI 能做的事"和"Agent 能做的事"是两个分开维护的集合，框架就退化回"传统 web app + 旁挂一个聊天机器人"——两个路径各自实现、权限各管各、审计不对等、Builder 要手工保持同步。

在当前 v0 实现里已经能看到这个分叉：

- UI 的 `DELETE /api/bookmarks/:id` 走 HTTP handler + 服务端检查
- Agent 的 "delete_bookmark" tool 走另一个代码路径
- 两条路径**可能**走同一个 checkPolicy，但没有任何机制**强制**它们走同一个
- Telemetry 对不齐——UI click 记 `request` event，agent call 记 `agent` event，但语义上是同一次 "删除"

这违反 pneuma 的根本承诺：**对话能做的事 ≡ 界面能做的事**。必须用一个统一的 primitive 把它们从"两件事的巧合协同"变成"一件事的两种表达"。

---

## Options considered

### Option A: 放任两条路径，靠规约保持同步
UI handler 和 agent tool 各写一遍，Builder 手动保证一致。

- **Pro**: 实现自由度高
- **Con**: 必然漂移；Builder 加功能容易只加一半；权限/审计/披露不统一

### Option B: 共享 handler 函数，UI 和 agent 各自调用
同一个 `handleDeleteBookmark(ctx, params)` 被 HTTP 层和 agent tool 各调一次。

- **Pro**: 核心逻辑统一
- **Con**: UI 绑定（按钮位置、confirm 对话、表单）和 agent 绑定（tool 描述、参数 schema、示例）仍是两处维护；权限规则各自声明；披露机制各自实现

### Option C（最终选择）: Operation 作为 first-class primitive，框架据单一声明自动派生双绑定
Builder 声明一个 Operation（包含 input schema、side-effects、handler、UI hints、agent hints）；框架**自动**：
- 注册 agent tool（名字 + 参数 schema + 描述）
- 渲染 UI 入口（在声明的 view 上生成按钮/菜单）
- 挂 policy check
- 挂 telemetry event
- 挂 impact disclosure（destructive 强制确认）

**同一次调用**走的是同一个 handler、同一次 policy check、同一个 event 类别、同一个 audit log 条目。Builder 声明一次，两种表达自动一致。

- **Pro**: 语义等价成为**框架不变量**而非约束习惯；Builder 对话流最自然（"让 alice 可以加评论"→ 一句话生成 4 件事）；复用 [ADR-0008](./0008-nl-bidirectional.md) / [ADR-0017](./0017-rollback-data-semantics.md) 的披露机制
- **Con**: 框架多一个核心 primitive；需要 UI 绑定的框架化组件（按钮、菜单、表单）；后向 amend 几个已有 ADR

---

## Decision

Operation 是 pneuma 的**第六个** first-class primitive（与 Table / CellType / Adapter / Transform / Ref 并列），也是 UI ↔ Agent 语义对等的唯一实现机制。

### Operation 定义

```typescript
interface Operation {
  id: string;                         // app 内唯一，e.g. "delete_bookmark"
  name: string;                       // 人类可读，UI tooltip + agent tool 说明
  description: string;                // 详细描述，Agent 生成参数时读

  input: InputSchema;                 // 封闭类型 schema（复用 ADR-0002 CellType）
  output: CellType | "void";          // 返回值；查询类返回数据，变更类 void

  affects: AffectDeclaration;         // 这次操作会改哪些 table / 调哪些 adapter / 是否 destructive

  handler: HandlerRef;                // code 引用（MVP 只支持 code；prompt 由 Transform 承担）

  ui_binding?: UIBinding;             // 可选——未指定时框架用默认（按 affects 推断位置）
  agent_tool?: AgentToolConfig;       // 可选——未指定时框架用 id/description 自动生成
  impact?: ImpactDescriptor;          // 可选——destructive=true 时必填（用于披露流程）
}

interface AffectDeclaration {
  mutations: TableRef[];              // 会 insert/update/delete 哪些表的数据
  adapter_writes: AdapterRef[];       // 会触发哪些 adapter 的写回
  destructive: boolean;                // 是否触发 UI 强制 confirm + agent 披露流
  reads_only: boolean;                 // 是否只读（Query 类 operation 为 true）
}

interface UIBinding {
  visible_on: Array<{                  // 在哪些 view 上渲染入口
    view: string;                      // view id
    placement: "row_menu" | "header_action" | "inline_button" | "context_menu";
    label?: string;                    // 默认从 operation.name 派生
    icon?: string;
    style?: "default" | "primary" | "destructive";
  }>;
  form?: FormOverride;                 // 可选——表单自定义（默认从 input schema 自动生成）
  confirm_dialog?: boolean;            // destructive 时默认 true
}

interface AgentToolConfig {
  name?: string;                        // 默认 = operation.id
  parameter_descriptions?: Record<string, string>;
  examples?: Array<{
    utterance: string;                  // 例句："删除那篇关于 Bun 的 bookmark"
    resolved_params: unknown;           // agent 应当生成的参数
  }>;
}

interface ImpactDescriptor {
  compute: HandlerRef;                  // 给定 input 计算具体 impact（行数 / 外部副作用）
  disclosure_template: string;          // NL 模板，供 agent 翻译给 Builder/User
                                        // 例："将删除 {{bookmark.title}} 及其 {{count}} 条解读"
}
```

### 声明示例（ai-bookmarks 的 delete_bookmark）

```yaml
operations:
  - id: delete_bookmark
    name: 删除书签
    description: 从 timeline 和 graph 中永久移除一个 bookmark 及其全部解读

    input:
      type: record
      fields:
        bookmark_id:
          type: { kind: ref-row, table: bookmarks }
          required: true

    output: void

    affects:
      mutations: [bookmarks, interpretations]   # interpretations 通过 FK cascade 删
      adapter_writes: []
      destructive: true
      reads_only: false

    handler:
      kind: code
      ref: ./operations/delete_bookmark.ts

    ui_binding:
      visible_on:
        - view: timeline
          placement: row_menu
          label: 删除
          style: destructive
        - view: bookmark_detail
          placement: header_action

    agent_tool:
      examples:
        - utterance: "删除那篇关于 Bun v1.3 的 bookmark"
          resolved_params: { bookmark_id: "agent resolves via lookup" }

    impact:
      compute: ./operations/delete_bookmark.impact.ts
      disclosure_template: |
        将删除 bookmark「{{bookmark.title}}」（URL: {{bookmark.url}}）
        以及它的 {{interpretation_count}} 条 lens 解读
```

### 统一调用路径

UI 按钮点击 和 agent tool 调用在框架内部汇合到**同一个 pipeline**：

```
Caller (UI click / Agent tool invoke)
  │
  ├─ 1. PermissionContext 构造 (ADR-0010)
  │
  ├─ 2. checkPolicy(ctx, invoke, operation:<id>) ── ADR-0007 / 0008
  │     │ deny → 返回错误 + audit access deny event
  │     ▼
  │
  ├─ 3. impact = operation.impact.compute(input)    # destructive=true 时必做
  │
  ├─ 4. 若 destructive → 要求确认 (UI 弹框 / agent NL 披露)
  │     │ rejected → 返回错误 + audit event
  │     ▼
  │
  ├─ 5. emit "operation.started" telemetry event
  │
  ├─ 6. operation.handler(ctx, input) 执行
  │     │ 内部调 Table write / Adapter call / Transform / 其他 Operation
  │     ▼
  │
  ├─ 7. emit "operation.completed" (audit: true) + operation.output
  │
  └─ 8. UI 刷新 / Agent 组 response
```

**关键保证**：UI 和 Agent 走进同一个 pipeline 的 step 2 之后**完全对等**。不存在"UI 有检查、agent 绕过"或者"agent 做了审计、UI 没做"。

### Operation 作为权限 resource ([ADR-0007](./0007-permission-dsl.md) amend)

Permission DSL 的 resource path 加一类：

```
operation:<id>
```

Action 为 `invoke`：

```yaml
- allow: user:alice
  do:    invoke
  on:    operation:delete_bookmark
```

这**简化了权限声明**——原来"alice 可删除 bookmarks 但不可删除 interpretations"要写两条 rule；现在 Operation 把这两件事封装成一个 atomic "delete_bookmark"，rule 写在 operation 层。

### Operation 的 telemetry 形态 ([ADR-0013](./0013-telemetry-event-model.md) amend)

Operation 调用 emit 专门的 event（建议把现有 `request + agent + mutation` 在特定情况下整合为）：

```typescript
{
  category: "operation",              // 新建类别（取代 request 和 mutation 在 operation 层面）
  payload: {
    operation_id: "delete_bookmark",
    invoked_via: "ui-click" | "agent-tool" | "cli" | "webhook",
    input: { bookmark_id: 42 },
    impact: { rows_affected: 4 },
    duration_ms: 23,
    decision: "allowed",
  },
  ctx: PermissionContext,
  audit: true,                        // operation 自动 audit（除非 reads_only=true）
}
```

无论 UI 还是 Agent 触发，event 长得**一模一样**，只有 `invoked_via` 字段不同——审计里一个 operation 的 "谁通过什么方式触发了多少次" 就是一个 filter 查询的事。

### Operation 与其他 primitives 的关系

- **Table / Cell**：Operation 的 handler 里通过 Table API 做数据变更
- **Adapter**：[ADR-0005](./0005-adapter-capabilities.md) 的 adapter capabilities **自动派生 operation**——Adapter 声明 `update: true` + `updatableColumns: [state, priority]` → 框架自动注册 `update_linear_issue_state` 和 `update_linear_issue_priority` 两个 Operation，绑定到 viewer 对应列的编辑 UI
- **Transform**：Operation 可以**调用** Transform 作为实现的一部分（例如 "interpret_new_url" Operation 内部调 fetch-readable transform + interpret-by-lens transform + embed-text transform）
- **Policy**：Operation 是 resource，policy 用 `operation:<id>` 控制谁能 invoke
- **Telemetry**：Operation 调用是 first-class event，自动 audit

### Composition（不是 MVP 必做，但预留 shape）

Operation 可以由多个 Operation 组合：

```yaml
- id: delete_all_bookmarks_by_tag
  input:
    type: record
    fields:
      tag: { type: Text, required: true }
  affects:
    mutations: [bookmarks, interpretations]
    destructive: true
  composition:
    steps:
      - call: list_bookmarks
        with: { filter: { has: { row_tags: "$input.tag" } } }
        as: targets
      - for_each: targets
        as: bm
        call: delete_bookmark
        with: { bookmark_id: "$bm.id" }
  impact:
    disclosure_template: "将删除 {{targets.length}} 条带有标签 \"{{input.tag}}\" 的 bookmark"
```

**MVP 阶段**，`composition` 字段未实现——handler 只能是 `code`。但 schema 预留让 post-MVP 可平滑扩展。

### 边界

Operation 覆盖**用户或 agent 主动触发的动作**。**不包括**：

- 框架内部后台行为（`ensureSchema` / `startFileWatcher` / `adapterTokenRefresh`）
- 事件驱动的 reactor（"新 bookmark 入库后自动 embed"——这是 Transform pipeline 或 trigger，不是 Operation）
- Lifecycle verb 本身（setup/dev/build/deploy/rollback 是框架生命周期，不是 app-level operation）

这些仍然 emit telemetry event，但不走 Operation pipeline。

---

## Consequences

### Positive
- **语义等价成为框架不变量**——UI 和 Agent 永远看到同一组能力，不存在漂移
- **Builder 对话流最自然**——"让 alice 可以加评论"一句话 = UI 按钮 + agent tool + 权限规则 + 审计埋点**同时**落地
- **Adapter capabilities 与 UI/Agent 自动打通**（amend [ADR-0005](./0005-adapter-capabilities.md)）
- **权限 DSL 维度对齐**——resource `operation:<id>` 统一了"做某件事"的权限概念
- **审计一元化**——一个 operation 的调用历史不论来源，同 event 类别、同字段、同查询
- **Impact disclosure 机制复用**——destructive operation 走跟 [ADR-0017 Rollback](./0017-rollback-data-semantics.md) 相同的 "如实告知" 协议
- **为 Query 和 View ADR 清出骨架**——Query 成为一种 `reads_only: true` 的 Operation；View 成为挂载 Operation 的 UI composition

### Negative / Risks
- **框架复杂度增加** —— 多一个核心 primitive 要实现、文档、维护
- **UI 绑定 framework 化** —— 框架要提供一套通用 UI 组件（按钮、菜单位置、动态表单），否则 `visible_on` + `placement` 字段是空壳
- **向后 amend 多条 ADR** —— 0005/0007/0008/0013 都要改，工作量集中
- **Handler 只支持 code，Prompt 不能作 handler** —— 某些"一句话做一件事"（如"总结我本周读了什么"）更像 prompt，但这种应归为 Transform 或 Operation 内部调 Transform，不是 handler 直接用 prompt

### Follow-ups
- **ADR-TBD: Query DSL**（基于 Operation，`reads_only: true` 的子类）
- **ADR-TBD: View System**（挂载 Operation 的 UI composition）
- **[ADR-0005 adapter capabilities] amend**: Adapter capabilities 自动派生 Operation 的具体规则
- **[ADR-0007 permission DSL] amend**: `operation:<id>` 加入 resource path 语法
- **[ADR-0008 NL bidirectional] amend**: `who_can(invoke, operation:X)` 与 `explain(invoke, operation:X)` 成为 first-class 查询
- **[ADR-0013 telemetry] amend**: `operation` 作为新 event category，整合 request / mutation 在 operation 层的事件
- **ADR-TBD: Operation composition syntax**（post-MVP）
- **ADR-TBD: UI binding component set**（框架提供的通用 UI 组件）
- 进 `open-questions.md`：Operation 的版本化（Builder 改了 delete_bookmark 的 side-effects 声明，历史 event 里记录的是旧版还是新版？）

---

## Amendments

### 2026-04-24 — P0 Operation Semantics Cleanup

**触发**：[Phase 3 priority plan](../../superpowers/plans/2026-04-24-phase-3-priority-plan.md) 的 P0 + 主线 A ultra-review 留下的两个 follow-up：

1. `reads_only: true ⇒ handler.kind === "query"` 过严；read-only 计算类 handler（cosine 相似度、图聚合）语义上是读但实现上需要代码而非 query body。
2. `OperationOutput` 只有 `CellType | void | row-list`，导致一些真实 Operation（`related_bookmarks`、`bookmark_graph`）只能用 `{ kind: "void" }` 占位，弱化 `/api/config`、MCP bridge 工具描述、以及未来 UI 生成。

**Decision**：

1. **放宽 reads_only 不变量**：`affects.reads_only: true` 现在允许两种 handler 形态：
   - `QueryBody`（原有）：走 `QueryExecutor`。
   - `code handler + mutations: [] + adapter_writes: []`（新增）："reads-only computed"，跟其他 code handler 一样走 `OperationExecutor`；`isQuery()` 仍返回 `false`。HTTP dispatch 保持在 `POST /api/operations/:id`。

   `reads_only: true` 的 code handler 带非空 `mutations` 或 `adapter_writes` 会被拒（自相矛盾）。

2. **扩展 OperationOutput union**：新增三种变体：

   ```typescript
   type OperationOutput =
     | CellType
     | { kind: "void" }
     | { kind: "row-list"; row_type: string }
     | { kind: "derived-list"; item_schema: unknown }   // 新增
     | { kind: "graph"; node_schema?: unknown; edge_schema?: unknown }  // 新增
     | { kind: "object"; schema: unknown };             // 新增
   ```

   `item_schema` / `node_schema` / `edge_schema` / `schema` 在 core-domain 里都是 `unknown`——JSON Schema 是 HTTP 边界的事，core-domain 不引入 runtime 类型。`packages/runtime` 提供 `outputSchemaToJsonSchema` 翻译器（对称于已有的 `inputSchemaToJsonSchema`），`/api/config` 上以 `output_schema` 字段发出。

3. **MCP bridge 传播**：两条 MCP bridge（stdio `template-mcp-bridge.ts` + in-process `OperationToolBridge`）都把 output kind 带到工具描述里；MCP 规范支持的场合还把 `outputSchema` 挂到工具描述符上。

**迁移的 Operation**：
- `templates/ai-bookmarks-core-domain/server/config.ts`：`related_bookmarks` → `reads_only: true` + `derived-list`；`bookmark_graph` → `reads_only: true` + `graph`。

**范围限制**：
- `CellType` 仍是框架唯一内在知其形的 output 变体；`derived-list` / `graph` / `object` 的 schema payload 由 template 作者提供。
- 本 amendment **不**新增 reads-only code handler 的 GET 路由——所有 code handler 继续走 POST。未来 amendment 可为可缓存的 reads-only code handler 暴露 GET。

### 2026-04-25 — reads_only 的语义边界澄清

**触发**：2026-04-25 codex review 指出 P0 放宽后，`OperationExecutor.invoke` 仍把完整 `StorageService`（含 `saveRow` / `deleteRow`）传给 `reads_only: true + code handler`。运行时不截断能力。若后续 governance（UI 确认、审计、permission）用 `reads_only` 做门禁决策，当前实现不成立。

**Decision**：`reads_only` 是**声明**（declaration）加一条框架 storage 写入边界，不是完整 JavaScript **沙箱**（sandbox）。

具体边界：

1. **框架使用 `reads_only`**：
   - `/api/config.action` 派生（`reads_only → "read"`），给客户端 / agent tool 元数据。
   - Audit event 分类（未来可按 `reads_only` 过滤只读调用）。
   - MCP bridge 工具描述（agent 可区分"读"和"写"）。
2. **框架使用 `reads_only` 做运行时 storage 边界**：
   - `reads_only: true + code handler` 通过 `OperationExecutor` 执行时，handler 收到 read-only `OperationHandlerStorage` facade。
   - facade 允许 `getTable` / `requireTable` / `getRow` / `listRowsByTable` / `listTables` 等读取。
   - facade 阻止 `saveRow` / `saveRowUnchecked` / `deleteRow`，并抛 `OperationExecutionError(kind="read_only_storage_write")`。
3. **框架 NOT 使用 `reads_only`**：
   - 不把 arbitrary JS code 变成系统级沙箱；文件、网络、进程等非 StorageService side effect 仍属于代码信任边界。
   - 不单独做 row-level policy 豁免。
   - 不跳过 confirmation gate（P3b destructive 确认独立决策）。

**合约要求**：Operation 作者仍需保证 `reads_only: true` 的 handler 没有其它外部 side effect；框架现在只强制 StorageService 层的写入隔离。

**Follow-up**：
- 若未来 template code 可以由 agent 任意生成，需要单独的 code sandbox / capability membrane ADR；read-only storage facade 不是这个问题的完整答案。
- `reads_only + code + empty mutations + empty adapter_writes` 现在保证 StorageService 不可写，但仍不保证 handler 内没有非 storage side effect。

### 2026-04-25 — Framework-injected Operations（Phase 3 P1）

**触发**：Phase 3 P1 需要一个 agent 可调用的"给已有 Table 加列"入口。若让 template 作者在每个 template 的 config.ts 里手写这个 Operation，就违背 ADR-0018 的一致性约束（所有 template 都得 reimplement 同一件事）。解法：framework 在 `bootAppRuntime` 时把这类 Operation **自动 merge** 进每个 `AppConfig.operations`。

**Decision**：

1. **Framework-injected Operation 定义**：由 `packages/runtime` 提供的 Operation（目前只有 `add_table_column`），`bootAppRuntime` 里的 `applyFrameworkInjections(config)` 把它 merge 进 `config.operations`、把 handler merge 进 `config.handlers`、把 system-owned Table（`pneuma_table_columns`）merge 进 `config.tables`、把 allow-invoke policy 规则 merge 进 `config.policy`。
2. **pipeline 与 template Operation 完全相同**：PolicyEvaluator 闸门、audit event emit、`/api/config` 暴露、MCP bridge 翻译全部一致。framework op 唯一区别是 handler ref 使用 `framework://` 前缀命名空间，避免与 template 相对路径冲突。
3. **handler 通过 `HandlerServices.history`（新）访问 AppHistoryStore**：不 import 到 Operation aggregate，runtime 注入。template handler 若用到 history 也可以访问，但目前没消费者。
4. **policy rule 目前是 anyone+anonymous allow-invoke**（MVP 姿态）；Phase 3 P2（attribution）会引入 Builder / Agent 身份后再收紧。
5. **idempotent merge**：template 若已声明同 id 的 Operation / Table，framework 不覆盖（先声明者胜）。目前没 template 这么做，但这条是未来扩展的兼容保证。

**范围限制**：
- P1 只加 `add_table_column` 一个 framework Op；其它定义维度（operations / transforms / lenses / policies）各自走独立 `pneuma_definition_*` Table + 独立 framework Op，由 Phase 3 后续阶段补。
- Framework Op 目前没有 destructive 能力；增 column 是非破坏性的（老 row 的新 column 自动 null）。未来 `drop_table_column` 会是 destructive，走 ADR-0018 + ADR-0017 的 impact disclosure 流程。

**Follow-up**：
- `drop_table_column` / `change_column_type`（destructive）作为 Phase 3 P3b 之后的候选。
- framework Operation 与 template Operation 之间的命名空间（`framework://` 前缀）是否固化为正式规范，等第二个 framework Op 出现再定。
