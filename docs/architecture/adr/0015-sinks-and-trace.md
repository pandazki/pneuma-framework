# ADR-0015: 可插拔 Sink 架构 + Trace scope 层级

**Status**: Accepted
**Date**: 2026-04-23
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: telemetry, architecture

---

## Context

[ADR-0013 事件模型](./0013-telemetry-event-model.md) 定义了 event，[ADR-0014 Audit subset](./0014-audit-subset.md) 定义了 audit 分道。但还有两个未解问题：

1. **Event 发射出去后往哪里流？** MVP 只需要 stdout + NDJSON，但生产会要 OTEL / Datadog / Honeycomb / 自建 logstash。sink 抽象必须 day 1 设计好。
2. **Trace_id 的 scope 多大？** 单个 HTTP 请求是一个 trace，还是一次 Builder 对话 turn 是一个 trace，还是一次 `deploy` verb 从开始到结束是一个 trace？这决定"查一次 deploy 的全链路事件" 这种查询是否可能。

这两件是遥测基础设施收尾事——敲完 sink 与 trace，遥测层就 MVP-ready。

---

## Options considered

### Sink 架构

**Option Q1: 单 sink**
MVP 硬编码到 stdout，不允许替换。

- **Pro**: 简单
- **Con**: 生产没路走；OTEL 接入要改框架

**Option Q2: 多 sink fan-out（内置列表）**
框架内置 stdout / file / OTEL，配置文件决定 enable 哪些。

- **Pro**: 不用做插件系统
- **Con**: 新 sink（Datadog / Honeycomb）要改框架

**Option Q3（最终选择）: 可插拔 sink adapter**
定义 `DebugSink` / `AuditSink` 接口；MVP 内置 stdout / NDJSON / audit-ndjson；其他（OTEL / Datadog / ...）作为独立 package 实现该接口。

- **Pro**: 框架核心小；生态可扩展；同时内置几个够用的；archetype C/D 上 observability 是"装包 + 改配置"不是改业务代码
- **Con**: 要设计稳定的 sink 接口

### Trace Scope

**Option S1**：trace = 单次 HTTP 请求（标准 W3C trace-context）

- **Pro**: 标准；跟 OTEL 兼容
- **Con**: Builder 对话一个 turn 跨多个工具调用，每个工具一个 HTTP → trace 割裂

**Option S2**：trace = S1 + Builder 对话 turn 也是 trace

- **Pro**: 一个对话 turn 内的因果链可见
- **Con**: Builder turn 概念怎么落？agent session 语义

**Option S3（最终选择）**：trace = S2 + lifecycle verb 也是 trace（`deploy` 从开始到结束包括 build.sh 子进程）

- **Pro**: "一次 deploy 的全貌"查询可能；archetype C/D 的 incident debugging 价值高
- **Con**: 需要 trace 嵌套；`deploy` 内部的 HTTP 请求、build.sh stdout、build 事件，都要挂到同一 trace 下

---

## Decision

### Sink 接口

```typescript
// 通用 sink 契约
interface Sink {
  readonly id: string;
  configure(config: Record<string, unknown>): Promise<void>;
  close(): Promise<void>;
}

// Debug-oriented sink（宽松，可丢，可采样）
interface DebugSink extends Sink {
  emit(event: PneumaEvent): void | Promise<void>;
  flush?(): Promise<void>;
}

// Audit sink（严格，append-only；见 ADR-0014）
interface AuditSink extends Sink {
  append(event: PneumaEvent): Promise<void>;
  // 无 update / delete / truncate
}
```

### MVP 内置 Sinks

| Sink | 类型 | 用途 |
|---|---|---|
| `stdout-sink` | Debug | dev 默认；JSON lines 到 process stdout |
| `ndjson-file-sink` | Debug | 生产 dev 默认；按日轮转 `.pneuma-debug/YYYYMMDD.ndjson` |
| `audit-ndjson-sink` | Audit | 所有 audit events append 到 `.pneuma-audit/audit.ndjson` |

### 后续（post-MVP）Sink Adapters

| Sink | 类型 | 交付时机 |
|---|---|---|
| `otel-sink` | Debug | M6+（可选 package） |
| `datadog-sink` | Debug | 社区包 |
| `honeycomb-sink` | Debug | 社区包 |
| `s3-object-lock-audit-sink` | Audit | 合规级部署需要时 |
| `vault-audit-sink` | Audit | 合规级部署需要时 |

### Sink 配置

```yaml
# app.yaml / manifest 的 telemetry 字段
telemetry:
  debug:
    sinks:
      - type: stdout-sink
        config: { pretty: true }
      - type: ndjson-file-sink
        config: { path: ./logs/events }
  audit:
    sinks:
      - type: audit-ndjson-sink
        config: { path: ./audit }
  sampling:
    # MVP 不采样；保留 shape 供后期
    access_events: 1.0
    request_events: 1.0
```

### Trace Scope 层级（S3 实现）

三级 trace root：

```
lifecycle trace (最高层)
  ↓
  http-request trace
    ↓
    builder-turn trace (当请求来自 agent backend 时)
```

具体规则：

1. **Lifecycle verb**（`deploy`, `build`, `migrate`, etc.）：进入 verb 时生成 `trace_id = lifecycle-<ulid>`；该 verb 下所有子事件（子进程、API 调用、mutation）都继承
2. **HTTP request**：请求入口若**已在 lifecycle verb context 里**，trace 继承；否则生成新 `trace_id = http-<ulid>`
3. **Builder turn**：agent 处理一个 Builder message 时，若在 HTTP context 下，span 继承 trace；同时为这个 turn 生成 `turn_span_id` 用于聚合"agent 这一 turn 内的所有工具调用"

### Trace Context 传播

- **进程内**：通过显式参数（event emit 带 `trace_id` / `span_id` / `parent_span_id`），不依赖 AsyncLocalStorage
- **跨进程**（比如 `deploy` spawn build.sh 子进程）：通过环境变量 `PNEUMA_TRACE_ID` 传递
- **跨 HTTP**（agent backend 调 framework tool）：HTTP header `X-Pneuma-Trace-Id` / `X-Pneuma-Span-Id`

### Query API（[ADR-0013](./0013-telemetry-event-model.md) 的补完）

```typescript
interface Telemetry {
  // ...

  // 结构化查询
  query(filter: EventFilter): Promise<PneumaEvent[]>;

  // 按 trace 取全链
  traceOf(trace_id: string): Promise<PneumaEvent[]>;

  // 按 span 树取
  spanTree(trace_id: string, span_id?: string): Promise<SpanTreeNode>;
}

interface EventFilter {
  categories?: EventCategory[];
  since?: number;                // unix ms
  until?: number;
  user_id?: string;
  tenant_id?: string;
  trace_id?: string;
  tags?: string[];
  audit_only?: boolean;          // 只查 audit sink
  limit?: number;
}
```

### Agent NL Query Skill

Build-phase Agent skill 里提供 `query_events_nl(nl_query, lang)`：

```
Builder: 昨天那次 deploy 到底卡在哪一步？
Agent:   (识别意图 → 构造 EventFilter { category: "lifecycle", verb: "deploy", since: yesterday } → traceOf(最近的 deploy trace) → 分析 span tree → 翻译成中文)
         你昨天 22:13 的 deploy 在 `build.sh` 里跑了 90 秒 docker build 成功，
         但在 deploy.sh 里 docker push 时网络超时了（trace_id: lifecycle-abc）。
         要我 retry 吗？
```

---

## Consequences

### Positive
- **Framework 核心不绑定任何 observability 栈**——stdout + NDJSON 够 MVP 跑
- **生态扩展路径清晰**——社区 sink packages 只要实现接口
- **三级 trace 让 "一次 deploy 的全貌" 可查**——archetype C/D 调试利器
- **AI-native 查询体验**——agent 把 NL 问题翻译成 EventFilter，回答带具体 event 引用

### Negative / Risks
- **Trace 传播跨进程的健壮性**——子进程丢 env、HTTP 间丢 header 都会造成 trace 断链。需要详细日志（"trace 断链在 X 位置"）和 schema 测试
- **NDJSON sink 在高并发下的写锁竞争**——MVP 不优化，需要时上 queue + flush loop
- **Sampling 的 shape 就位但无实现**——防止 later 紧急加 sampling 时影响事件模型

### Follow-ups
- **ADR-TBD: Event sampling implementation**（access / request 的采样策略）
- **ADR-TBD: Cross-process trace propagation**（env / header / correlation id 的统一）
- **ADR-TBD: NL query → EventFilter 的 prompt engineering**
- 进 `open-questions.md`：是否把 AsyncLocalStorage 作为显式传参的替代（开发便利 vs 可测性权衡）
