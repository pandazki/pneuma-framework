# ADR-0003: Transform 作为 first-class 原语，与 Adapter 分开

**Status**: Accepted
**Date**: 2026-04-23
**Last amended**: 2026-04-24（`purity` 三档正式化；详见文末 Amendments）
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: storage, agent, ai-native

---

## Context

在讨论 [ADR-0002 typed cells](./0002-storage-typed-cells.md) 的类型系统时，浮出一个关键需求：如何让**任意输入**（视频、Linear 项目、自然语言文档）转换为框架已知的典型 CellType（Text / RichText / Vector / ...）？

Pandazki 最初把这个需求叫"动态 Adapter"——但仔细辨析后发现这是**两个正交的概念**叠在同一个词下：

1. **Adapter** = 对外部系统的 ingress/egress 层，带 auth、带网络、带写回（见 [ADR-0004](./0004-adapter-protocol.md)）
2. **Transform** = 从任意输入到典型 CellType 的**类型强制**，无状态、无 auth

把它们分开非常重要——因为它们的实现面、生命周期、复用范围都不同：Adapter 有成百上千个且每个都有自己的复杂状态；Transform 是**纯函数**，可以被缓存、被组合、被 AI 生成。

这个决策还开启了 pneuma 的 AI-native 本质之一——**很多 Transform 的 impl 不是代码而是 prompt**。

---

## Options considered

### Option A: 合并 Adapter + Transform 为一个"动态 Adapter"概念
Pandazki 最初的直觉表述。

- **Pro**: 词汇简单，Builder 只学一个概念
- **Con**: 两种概念本质不同（状态 vs 纯函数、auth vs 无 auth、外部集成 vs 类型强制），合并会让其中一个被错误治理——比如 AI prompt-based transform 会被塞进 adapter 的 auth/credential 机制里，完全错位

### Option B: 只有 Adapter，Transform 作为 Adapter 内部实现细节
Transform 不是顶层原语，每个需要做类型强制的地方由 Adapter 内部处理。

- **Pro**: 外部概念更少
- **Con**: 重复劳动（每个 adapter 都要自己写 "Linear issue → 自然语言介绍" 这种逻辑）；无法复用；AI prompt-driven transform 无处安放

### Option C（最终选择）: Transform 与 Adapter 分开，都是 first-class 原语

---

## Decision

**Transform 是 first-class 原语**，定义如下：

```typescript
type Transform<In, Out extends CellType> = {
  id: string;
  in: TransformInputShape;    // any: CellValue | ExternalResource | CompositeRecord
  out: Out;                    // 必须是已注册的 CellType（primitive / vector / blob / ref-row / ref-external / derived）
  impl: CodeImpl | PromptImpl;
  purity: "pure" | "impure";   // pure = 相同 input 总返回相同 output（可缓存）
};

type CodeImpl = {
  kind: "code";
  fn: (input: unknown) => Promise<unknown>;   // 在框架已知运行时执行
};

type PromptImpl = {
  kind: "prompt";
  model: string;                               // e.g. "anthropic/claude-sonnet-4-6"
  system: string;                              // agent 生成的 system prompt
  outputSchema: JsonSchema;                    // 强约束 LLM 结构化输出
};
```

### 两个 impl 的本质差异

- **CodeImpl**：框架加载函数、执行、缓存结果（按 input hash）。适合确定性转换、数据解析、数学计算。
- **PromptImpl**：框架调 LLM、用 outputSchema 约束结构化输出、缓存结果。适合自然语言理解、摘要、风格改写、跨模态（图 / 视频 → 文本）。Pneuma 原生支持。

### Transform 的组合

Transform 可以被**流水线化**：`LinearAdapter.list() → TransformA<LinearIssue, RichText> → TransformB<RichText, Vector>`。流水线本身是 `Derived` CellType 的形态（[ADR-0002 引用](./0002-storage-typed-cells.md)）。

### 典型使用样例

**例 1**：Builder 说"把 bookmarks.body 列转成 150 字介绍"
agent 生成：
```yaml
transforms:
  - id: summarize-body-150
    in: { from: table:bookmarks.column:body, type: RichText }
    out: { kind: primitive, of: Text }
    impl:
      kind: prompt
      model: anthropic/claude-haiku-4-5
      system: "Summarize the input into exactly 150 Chinese characters..."
      outputSchema: { type: string, maxLength: 200 }
    purity: pure
```

**例 2**：Builder 说"把 Linear 项目的起止时间转成自然语言段落"
agent 生成：
```yaml
transforms:
  - id: linear-timeline-prose
    in: { from: adapter:linear, type: LinearProject }
    out: { kind: primitive, of: RichText }
    impl:
      kind: prompt
      model: anthropic/claude-haiku-4-5
      system: "Given a Linear project with start_date and end_date..."
    purity: pure
```

### 与 Adapter 的契约边界

- Adapter 负责：auth / 网络 / 取回结构化数据
- Transform 负责：结构化数据 → CellType 的类型强制

流水线：`adapter.list() → [LinearIssue]` → `transform(LinearIssue) → RichText` → 存为 Text cell

---

## Consequences

### Positive
- **AI-native 落在具体抽象上**：Transform 不是额外加的 "AI 集成"，而是原生 primitive 的一个 impl 变体。Builder 要什么转换——如果语言化能描述，prompt impl 就是 first class。
- **纯函数的力量**：`purity: pure` 的 Transform 可按 input hash 缓存，反复调用不产生成本（尤其 prompt 调用不重复烧 token）
- **Adapter 可聚焦自己的职责**：auth 与写回，不必担心每个外部资源的类型强制
- **Builder 对话体验顺畅**：说"把 X 转成 Y"对应 `Transform<X, Y>` 一个对象，agent 生成容易、人类读得懂

### Negative / Risks
- **Prompt impl 的版本化**：prompt 内容改了但是 transform id 不变，是否要生成新 transform？部署时如何处理在旧 prompt 下缓存的结果？（进 follow-up）
- **成本边界**：PromptImpl 涉及 LLM 调用，大批量数据的 transform 可能很贵。需要在框架里提供"dry-run 估算 token + 成本"能力
- **outputSchema 的 LLM 兼容**：不是每个模型 / provider 都支持结构化输出；需要 fallback 到 "text + parse" 并做错误修复

### Follow-ups
- [ADR-0004 Adapter protocol](./0004-adapter-protocol.md)：Adapter 作为 Transform 的典型输入源
- **ADR-TBD: Transform 缓存语义**：按 input hash + impl hash 缓存；prompt 改变时 invalidation 策略
- **ADR-TBD: Transform 版本化 & 部署**：prompt 改变是否产生新 transform id；回滚如何保留旧 transform
- **ADR-TBD: Cost estimation**：prompt transform 的 token 预算、dry-run UI、大批量保护闸
- 进 `open-questions.md`：自定义用户类型（custom CellType）是否允许由 Transform 产出——MVP 明确不允许（输出必须是内置 CellType 或 adapter 注册的 ref 类型）

---

## Amendments

### 2026-04-24 — `purity` 三档正式化

**触发**：step 5 / step 6 实现 `TransformRunner` 时发现 `pure | impure` 两档不够用：`embed_text` 这类 transform 的模型版本固定时输出稳定，但模型若 silent-update 结果可能漂移——既不是"永远不变"也不是"每次都重算"，需要第三档。

**Before**：`purity` 为 `"pure" | "impure"` 两值。

**After**：三档，对应缓存策略：

- **`pure`** — 相同 input 永远返回相同 output。缓存 key = `(transform.id + impl_hash + input_hash)`，无 TTL。适合：确定性数学/解析类转换。
- **`pure-with-ttl`** — 在时间窗口内等同于 pure（例：`embed_text` 在模型版本固定的 7 天内结果稳定）。缓存 key 同 `pure` + TTL wrapper；需在 Transform 声明上带 `ttl_seconds: number`。适合：依赖外部模型但版本稳定的 transform。
- **`impure`** — 不缓存，每次重新执行（例：`current_timestamp`、有副作用的 fetch）。框架执行但不持久化缓存。

**对应 Transform 类型**：

```typescript
class Transform {
  purity: "pure" | "pure-with-ttl" | "impure";
  ttl_seconds?: number;   // purity === "pure-with-ttl" 时必填
}
```

**不变量追加**：`purity === "pure-with-ttl"` ⟹ `ttl_seconds` 必须为正整数；违反时注册 Transform 报错。

**实现参考**：`packages/core-domain/src/services/transform-runner.ts`。

**与原 ADR 关系**：`pure` / `impure` 语义不变；`pure-with-ttl` 是新插入的中间档，不改变两端档位的承诺。
