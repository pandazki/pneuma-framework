# ADR-NNNN: <决策标题>

> 复制这个文件为 `adr/NNNN-kebab-case-title.md` 开始写。保留本文件的所有章节，不要跳过任何一节（哪怕写"N/A"也好过省略）。

**Status**: Proposed | Accepted | Superseded by ADR-XXXX | Deprecated
**Date**: YYYY-MM-DD
**Deciders**: <决策参与者姓名 / handle>
**Tags**: <逗号分隔，如 `storage, permission, lifecycle`>

---

## Context

本决策的背景。**这一节要回答的问题**：

- 为什么此刻必须做这个决定？不做会怎样？
- 它要解决的问题是什么？与之相关的前置 ADR / 外部约束？
- 读者看完这节应能理解"这个决策是一个真实存在的架构分叉点"而不是"闲着没事选一下"。

引用相关 ADR 时用链接：`see [ADR-0003](./0003-*.md)`。

---

## Options considered

本决策曾经考虑过的备选方案。**每条备选至少 2-3 句描述 + 主要优劣**。

这一节是 ADR 区别于普通设计文档的核心——我们**明确写下了没选的路**以及为什么。将来读者如果想推翻这个决策，他能看到当年是否已经考虑过他正在想的替代方案。

### Option A: <方案 A 名字>
<方案描述，2-3 句>

- **Pro**: <主要优点>
- **Con**: <主要缺点>

### Option B: <方案 B 名字>
<描述>

- **Pro**: ...
- **Con**: ...

### Option C: <方案 C 名字>
<描述>

- **Pro**: ...
- **Con**: ...

（如果只有两个备选，列出两个即可；三个以上同理。**至少要有一个备选**——如果真的没有任何备选，那这个"决策"可能只是一个"事实"，不需要 ADR。）

---

## Decision

最终选了哪个方案 + **具体落地形状**。

落地形状应当具体到可以由此派生代码或 schema，例如：

- 类型定义 / interface
- YAML / JSON schema 示例
- API 签名
- 枚举值集合
- 表格定义

这一节是未来实施的 source of truth，因此越具体越好。

---

## Consequences

本决策带来的后果。分三类列：

### Positive
- <这决策解锁了什么能力 / 好处>
- ...

### Negative / Risks
- <代价 / 将来可能踩的坑 / 已知的局限性>
- ...

### Follow-ups
- <这决策引发的新问题，会在哪些未来 ADR 或 open questions 里继续处理>
- ADR-TBD: <未写的后续 ADR 预告>
- 进 `open-questions.md`：<还不能决定的问题>
