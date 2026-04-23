# ADR-0014: 审计子集 — Append-only, 独立 sink 通路

**Status**: Accepted
**Date**: 2026-04-23
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: telemetry, audit, security, compliance

---

## Context

[ADR-0013 事件模型](./0013-telemetry-event-model.md) 定义了 5 类事件。但 Pandazki 明确：

> 一方面要服务于 debug，另一方面要服务于审计。

Debug 和审计对事件的要求**差异很大**：

| 维度 | Debug 事件 | 审计事件 |
|---|---|---|
| 采样 | 可采样（高频 request 采 10%） | **绝对不能采样**，必须完整 |
| Retention | 短（几小时到几天） | 长（数月到数年） |
| Sink 行为 | 可丢（stdout 够） | 必须持久化 + tamper-evident |
| 修改 | 允许 update/delete | **append-only**，不可修改不可删除 |
| 查询 | 开发者即时用 | 合规审计偶发用 |

把所有事件都按审计标准处理太贵；按 debug 标准处理又不合规。必须**区分 subset**。

Pandazki 接受："audit 子集 + 独立 sink 通路" 的架构。

---

## Options considered

### Option A: 所有事件都是审计事件
没有 debug 子集的概念，全部持久化 + tamper-evident。

- **Pro**: 概念简单
- **Con**: 存储膨胀（request 事件每秒可能成百上千）；性能压力大；大多数事件没审计价值

### Option B（最终选择）: 基于 `audit: true` 标记区分 subset，两轨 sink
Event 带 `audit` 字段；框架自动给某些类别打标；审计事件额外流入 append-only sink。

- **Pro**: 概念清晰；存储和性能按实际需求分层；审计 sink 可独立升级为合规级
- **Con**: 需要定义"哪些自动打 audit 标"的规则

### Option C: 完全分离审计与 debug，两套 event schema
Debug event 与 audit event 是两种不同类型。

- **Pro**: 最清晰
- **Con**: 代码路径双倍；同一次 mutation 要 emit 两次；查询工具也双倍

---

## Decision

### Audit 标记规则

以下事件**自动打 `audit: true`**（框架层固定规则，Builder 不能关）：

| Category | Audit? | 原因 |
|---|---|---|
| `lifecycle` (deploy / rollback / migrate / fork) | ✅ | 运营关键动作，必须留痕 |
| `lifecycle` (setup / dev-start / dev-stop) | ❌ | Dev 级动作，不影响生产数据 |
| `access` | ✅ | "谁被允许/拒绝" 是审计根据 |
| `mutation` | ✅ | 数据变更必须全留痕 |
| `agent` | ✅ | AI 动作不留痕 = 黑盒，合规不接受 |
| `request` | ❌ | HTTP 级噪声，debug 用 |

此外还有一类 **permission-change**——对 policies.yaml 的修改本身是权限变更动作。MVP 作为 `mutation` 的子类处理（tags 含 `permission-change`），且强制 audit。

### 独立 Sink Channel

```
所有事件 → DebugSink (stdout / NDJSON / 可选 OTEL)
audit:true 事件 → AuditSink (audit.ndjson / 可选 S3 Object Lock / Vault Audit)
```

两条 channel 的 sink 可以完全独立实现（比如 debug 走 stdout，audit 走文件；或 debug 走 Honeycomb，audit 走 WORM 存储）。Event 被 emit 一次，框架内部分发到两个 sink channel。

### Append-only 语义

Audit sink 的接口：

```typescript
interface AuditSink {
  append(event: PneumaEvent): Promise<void>;
  // 不提供 update / delete / truncate 方法 —— 接口级禁止
}
```

MVP 实现 `AuditSink` 为：

```
.pneuma-audit/
  audit.ndjson        # 每行一个 event，append-only
  .lock               # 写锁
```

每条 event 带一个 **monotonic sequence number**（从 0 递增），写入时追加；永不覆盖；不允许 truncate。文件删除 / 覆盖需要外部手段（运维层），与 sink 协议无关。

### 可选增强（post-MVP）

- **Hash chaining**：每条 event 的 hash 把前一条的 hash 纳入输入，形成不可篡改链（删一条就破坏整个链）
- **External immutable storage**：S3 Object Lock / GCP retention policies / HashiCorp Vault Audit backend
- **Digital signatures**：每条 event 签名，签名私钥只在部署时注入

MVP 的 NDJSON 文件虽然不是真正不可篡改，但"协议层不提供修改接口"已经让合规级扩展成可能——切到 S3 Object Lock 只是换 sink adapter。

### Debug Sink 的宽松度

Debug sink 只需实现 `emit(event)`，可丢、可采样、可有 retention：

```typescript
interface DebugSink {
  emit(event: PneumaEvent): void | Promise<void>;
  // 可选的 close / flush / configure 方法
}
```

MVP 实现：
- `StdoutSink`：events 打到 stdout（JSON lines），dev 模式默认
- `NdjsonFileSink`：每日轮转的 `.pneuma-debug/YYYYMMDD.ndjson`

### 查询的分道扬镳

Builder 的 telemetry 查询（[ADR-0015](./0015-sinks-and-trace.md)）默认查两路：

```typescript
query({
  categories: ["mutation", "agent"],
  user: "alice",
  // ...
});
// → 读 debug sink 的高频记录 + audit sink 的持久记录，合并去重
```

但**查 audit 专属记录**（比如合规审计员查"近一年所有的 deploy 操作"）走专属 path：

```typescript
auditQuery({
  since: "2025-01-01",
  until: "2025-12-31",
  categories: ["lifecycle"],
  // ...
});
// → 只读 audit sink
```

`auditQuery` 是受限 API，需要 audit 读权限（后期可加 role admin）。

---

## Consequences

### Positive
- **Audit 事件有独立生命周期**——不会被 debug 的采样 / 丢弃策略影响
- **合规路径清晰**——MVP NDJSON 到 S3 Object Lock 是 sink 换，不改业务代码
- **Hash chaining / 签名等增强都向后兼容**
- **查询 UX 可以统一**：默认合并两路，需要时可 drill 到审计专属

### Negative / Risks
- **Audit NDJSON 文件会无限增长**——MVP 没自动分卷 / 归档；运维需要外部手段轮转。
- **Audit 标记规则写死在框架**——如果 Builder 希望某个 mutation **不** audit（比如脱敏测试写），目前没 opt-out。考虑未来加"明确标记为 non-audit"的 opt-out（但默认值永远是 audit）
- **Hash chaining 的断链修复**——MVP 没 hash chain，未来加时要定 "从什么时候开始 chain"。

### Follow-ups
- [ADR-0015 Sinks + trace scope](./0015-sinks-and-trace.md)：sink 抽象的完整实现
- **ADR-TBD: Audit file 归档 / 轮转**
- **ADR-TBD: Hash chain / signing**
- **ADR-TBD: Audit query permission model**——谁能查审计（role:audit-reader？SecurityOfficer？）
- 进 `open-questions.md`：是否允许 End User 查看自己相关的 audit events（我的 GDPR 数据访问权）；涉及透明度 vs 安全性权衡
