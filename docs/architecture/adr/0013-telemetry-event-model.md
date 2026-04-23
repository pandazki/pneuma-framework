# ADR-0013: 遥测事件模型 — 5 类事件 + PermissionContext 全程传播

**Status**: Accepted
**Date**: 2026-04-23
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: telemetry, debug, audit

---

## Context

[ADR-0001](./0001-archetype-scope.md) 确定 archetype B 以上都需要遥测能力，且 Pandazki 明确指出：

> 整个部署方案就要一套遥测协议……如果不在早期定义概念，后面就很难再加进去了。
> 一方面要服务于 debug，另一方面要服务于审计。

遥测要同时服务两个诉求：

- **Debug**：定位"为什么 X 失败"，需要完整事件链（request → mutation → side-effects）
- **Audit**：谁做了什么、谁被拒绝、什么时候、持久化到不可篡改 sink

好消息：[ADR-0002](./0002-storage-typed-cells.md) 的 mutation、[ADR-0007](./0007-permission-dsl.md) 的 policy decision，这些都是"框架内部已经发生的事件"。遥测不是**额外**加的东西，是**"不要把这些事件扔掉"**的那一层。

关键设计决策是：事件模型长什么样、类型有哪些、context 如何贯穿。

---

## Options considered

### Option A: 自由 key/value blob 事件
每个 event 是一个 `{ kind: string, payload: any }`，不做强 schema。

- **Pro**: 实现简单；易于扩展
- **Con**: 查询困难；不同模块 event 格式漂移；难以统一 sink 接口

### Option B（最终选择）: 强类型事件 + 封闭类别集合
预定义 5 个 event category，每类有明确 payload schema；事件共享 envelope（ts, trace_id, ctx）。

- **Pro**: 查询、sink、index 都能基于类型做优化；agent 可针对类别生成 NL 查询（"昨天 Alice 被拒的操作"）
- **Con**: 新增类别是 framework 变更（但封闭集是有意为之）

### Option C: OpenTelemetry 原生
直接用 OTEL span / log / metric 模型。

- **Pro**: 行业标准；生态好
- **Con**: 过度抽象化；pneuma 领域事件（lifecycle verb, policy decision, agent turn）没有合适的 OTEL 原生类型，得自己映射；MVP 上 OTEL 太重

---

## Decision

### 5 类事件（封闭集）

```typescript
type EventCategory =
  | "lifecycle"    // setup / dev-start / build / deploy / rollback / migrate
  | "access"       // 每次 evaluatePolicy 的决策
  | "mutation"     // 每次 Table 的 insert/update/delete
  | "agent"        // Build-phase / Runtime agent 的工具调用
  | "request";     // HTTP/RPC 请求入口
```

### 统一 Envelope

```typescript
interface PneumaEvent {
  id: string;                    // 全局唯一 ULID（可排序）
  ts: number;                    // unix ms
  category: EventCategory;
  ctx: PermissionContext;        // 见 ADR-0006 / 0010
  trace_id: string;              // 跨 event 因果链（见 ADR-0015）
  span_id?: string;              // 当前 span（可嵌套）
  parent_span_id?: string;       // 父 span
  payload: EventPayload;         // 按 category 分形状
  audit?: boolean;               // true = 审计子集（见 ADR-0014）
  tags?: string[];               // 自由标签，用于过滤
}
```

### 各 category 的 Payload schema

```typescript
// lifecycle
interface LifecyclePayload {
  verb: "setup" | "dev-start" | "dev-stop" | "build" | "deploy" | "rollback" | "migrate" | "fork";
  phase: "start" | "progress" | "end";
  exit_code?: number;
  target?: string;              // deploy target / build target
  version?: string;             // app version
  details?: Record<string, unknown>;
}

// access
interface AccessPayload {
  decision: "allow" | "deny";
  action: Action;
  resource: Resource;
  matched_rules_count: number;
  reason: "default-public" | "default-restricted-no-match" | "explicit-allow" | "explicit-deny";
  rule_ids?: string[];          // 命中规则 id
}

// mutation
interface MutationPayload {
  op: "insert" | "update" | "delete";
  table: string;
  row_id?: string;
  diff?: Record<string, { before: unknown; after: unknown }>;
  source: "stored" | "adapter-backed";
  adapter?: string;             // 如果是 adapter write
}

// agent
interface AgentPayload {
  agent_id: string;             // build-phase agent 的 backend id / runtime agent instance
  agent_mode: "build-phase" | "runtime";
  tool: string;                 // e.g. "lifecycle.deploy.run"
  params?: Record<string, unknown>;   // 调用参数（可能含敏感，audit 时需 redact）
  result_summary?: string;
  tokens_input?: number;
  tokens_output?: number;
  cost_usd?: number;
}

// request
interface RequestPayload {
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  bytes_in?: number;
  bytes_out?: number;
}
```

### 发射接口

```typescript
interface Telemetry {
  emit(category: EventCategory, payload: EventPayload, opts?: EmitOptions): void;

  // 便捷方法
  lifecycle(payload: LifecyclePayload): void;
  access(payload: AccessPayload): void;
  mutation(payload: MutationPayload): void;
  agent(payload: AgentPayload): void;
  request(payload: RequestPayload): void;

  // 查询（ADR-0015 详述）
  query(filter: EventFilter): Promise<PneumaEvent[]>;
}

interface EmitOptions {
  audit?: boolean;
  tags?: string[];
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string;
}
```

### Framework 内部自动埋点

Framework 在固定位置**自动 emit**，Builder/agent 不需要手动调：

| 位置 | Event |
|---|---|
| `lifecycle.*` tool | `lifecycle` 的 start + end（exit code） |
| `evaluatePolicy` | `access` 事件（允许 sampling） |
| Table 的 insert/update/delete | `mutation` 事件 |
| Agent backend 的 tool call | `agent` 事件 |
| HTTP server 请求入口 | `request` 事件 |

模板作者或 Runtime Agent **可以主动 emit 自定义事件**，但必须落在这 5 个类别之一（没有 "custom" 类别）。通过 `tags` 字段区分业务子类。

### PermissionContext 全程传播

所有 event 都挂 ctx（见 [ADR-0010 definition](./0010-user-id-grants.md)）。这让"谁做了什么"在每个 event 里都可追踪。

Context 的传播路径：

```
HTTP middleware 构造 ctx
   ↓
请求处理函数拿到 ctx
   ↓
调 checkPolicy / mutation / adapter / transform 时，ctx 显式 pass
   ↓
这些内部调用 emit event 时，自动从调用参数取 ctx
   ↓
Event 写入 sink
```

整条链 ctx 传递是**显式参数**而不是线程局部存储（AsyncLocalStorage）——显式更可测试、错误更好定位。虽然代码里参数多一个，但值得。

---

## Consequences

### Positive
- **事件模型是框架的一等原语**——Builder 从 day 1 就能查"谁做了什么"
- **Debug 与审计共用一套基础设施**——审计事件只是部分 event 的子集（见 [ADR-0014](./0014-audit-subset.md)）
- **AI-native 的自然延伸**——agent 能查 `query({category: "mutation", user: "alice"})` 回答 "alice 改了哪些数据"
- **封闭类别集合带来的好处**：schema 稳定、sink 可针对类型优化、NL 查询的 vocabulary 小（"agent 事件 / access 事件 / ..."）

### Negative / Risks
- **Envelope 字段可能过重**——尤其 `ctx` 是一个对象，每个 event 都复制一份。缓解：sink 层可做 ctx dedup 压缩（同一 session 的 ctx 引用即可）
- **Framework 自动埋点可能吵**——尤其 access 事件（每次 policy check 一个 event），需要 sampling（MVP 全 emit，后期加采样）
- **PermissionContext 的显式传参**增加 API 参数——但为了可测可追，值得

### Follow-ups
- [ADR-0014 Audit subset](./0014-audit-subset.md)：event 子集带 `audit: true` 的附加语义
- [ADR-0015 Sinks + trace scope](./0015-sinks-and-trace.md)：事件往哪里发、trace_id 的层次
- **ADR-TBD: Event sampling**：高频 event 的采样策略
- **ADR-TBD: Redaction**：payload 里敏感字段（adapter params / row diff）的脱敏机制
- 进 `open-questions.md`：是否允许模板注册 custom event category（MVP 明确不允许）
