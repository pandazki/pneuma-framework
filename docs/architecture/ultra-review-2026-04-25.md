# Ultra-Review — 主线 A 收尾后的 Vision 对齐回顾

**Date:** 2026-04-25（Day 2 结束时）
**Reviewers:** 4 并行 subagent, 各一个 lens (vision alignment / primitives coherence / template-as-demo / trajectory & opportunity cost)
**Scope:** 16 commits on `feat/embedding-graph-ai-bookmarks` 分支 + 2 天的整体节奏

---

## TL;DR

**4 个独立 reviewer 同向结论**：主线 A 做得干净（tests / review loops / 类型 / commits 都合格），但**选题是错的**。Day 2 一整天投入到 ai-bookmarks 一个 template 的 feature 开发（embedding + graph），**零推进** pneuma 最独特的承诺——"Builder 跟 Build-phase Agent 对话构建 app"。

**如果只能记一件事**：Day 3 应该是 **主线 C (wire protocol Operation tool-call → viewer + 真 agent 在 loop)**，不是主线 B（第三个 app）。

---

## 每个 Lens 的核心判断

### Lens 1 — Vision 对齐 (north-star)

**Verdict:** 部分对齐。框架层 ok, template 层 drift。

- ✅ `EmbeddingProvider` 落在 `core-domain` 作为 `LLMProvider` 的 peer — 正确的层次
- ✅ `OpenRouterEmbeddingProvider` 落在 provider-openrouter — 层次正确
- ✅ `embed_text` 用 `pure-with-ttl=7d` 验证了 Transform purity 对 embedding workflow 适用
- ❌ `related_bookmarks` / `bookmark_graph` 是纯 application-level 计算 feature, 零新 primitive 验证, 在普通 Express app 里也能一样写
- ❌ 150+ 行手搓 SVG graph viewer — 纯产品代码, 没 exercise wire protocol / Operation tool-call / Builder-in-dialogue 任何一项
- ❌ 16 commits 结束, **框架最独特的主张（agent-in-loop）跟昨天结束时一样 undemonstrated**

### Lens 2 — Primitives 一致性

**Verdict:** Principled 扩展 + 3 个 moderate 结构性 gap。

| Gap | 严重度 | 判断 |
|---|---|---|
| `EmbeddingProvider` 靠 template 闭包注入, 不是 `AppConfig` first-class slot (跟 `LLMProvider` 不对称) | Moderate | 等第二个 template 需要时再上升 |
| **`Operation` 不变量 `reads_only:true ⇒ handler.kind === "query"` 没有"code-handler 但 read-only"的位置** | **Moderate / 结构性** | **值得一条 ADR-0018 amend**: 加 `reads_only_computed: true` 变体 |
| `OperationOutput` 没有 `derived` / `graph` 类型 — 被迫用 `void` + TODO | Moderate | 等第二个 template 碰到再加 |
| 代码 handler 直接 `storage.listRowsByTable(...)` bypass row-level policy | Moderate 今天, 结构性 once row-level policy 上 | 提前记到 ADR-0007 follow-up |
| `EmbeddingProviderError` 在 core-domain, `LLMProviderError` 在 provider-openrouter 本地 — 位置不一致 | Cosmetic | 下次 sweep 时统一 |

**已吸收良好**：vector CellType 直接就位 (不用新 kind), Transform purity 吸收 embedding 的稳定性假设干净, content-addressed cache key 给 cross-session 去重免费。这部分是 DDD 模型胜利。

### Lens 3 — Template 作为 demo

**Verdict:** 略更 feature-rich, **并没有更 AI-native**。

- Related 面板的 `score: 0.847` 是"算法结果"而不是"it gets me"的 moment
- Graph 默认是 no-lens 聚类 → **稀释了 lens 这个整个 template 最核心的抽象**（"three lenses, three takes" 被平均掉）
- 圆形 SVG layout 5-10 节点能看, 再多就 hairball
- 最该加但没加的 — 每条 edge 一句 Sonnet 生成的"为什么相关"说明 ("both argue network effects don't predict moat durability at layer 3")
- Lens 之间视觉上没区分, 都是 monospace 纯文本, "三个透镜三种读法"的核心卖点从视觉层面落不了地

**Demo 建议**: 不要打开 Graph（节点少时它像坏的）。路径应该是: 空仓 → 输 URL → 看 3 个 lens 产出 3 份不同解读（核心 moment）→ 删 lens 看 428 destructive gate（框架独特）→ 加第二个 URL 看 Related panel。

### Lens 4 — Trajectory & Opportunity Cost

**Verdict:** Decelerating.

- Day 1: 26 commits — 21 ADRs + DDD + runtime + 3 templates + 2 真 app
- Day 2: 16 commits — 1 个 template 的 1 个 feature
- **4x scope compression, zero framework-level unlock**
- 主线 A 本身的 stated promise 是 "recall-by-vibe" (AI-native 典型能力), 但交付的是 UI 里一个 cosine 按钮, 没有 "Builder / agent 对话地用 recall-by-vibe" 的任何 moment
- 如果今天做的是主线 C, Day 2 结束时会有: agent 在 loop + viewer 实时同步 + 可演示的"Builder 说话 → app 变"瞬间。这才是 pneuma 独特的

**blocking demo 的空缺** (假设明天要 5 分钟 demo):
1. 没有 agent-in-loop (opencode 没跟任何新 template 接起来)
2. 没有 conversation 持久化 (ADR-0025 未写)
3. 没有 Builder persona 的完整 flow (所有 example 都是 developer-level, 跑 script 看 SQLite)
4. Wire protocol 设计已经就绪但没跟 viewer Operation 实际 bind

---

## 综合结论

**主线 A 的技术执行无可挑剔**：11 tasks, 16 commits, 2-stage review per task, 589 tests green, 6 个 amendments + TODOs 都诚实记录。Subagent-driven-development 流程本身也证实可用。

**但选题的战略 ROI 是负的**：

- 它没有让"Builder 对话构建 app"更近一步
- 它没有让 runtime agent / wire protocol 被任何活的 agent 碰过
- 它给 ai-bookmarks 加了个 feature, 但 ai-bookmarks 不差这个 feature (最核心的卖点是 lens 不同视角, 不是 similarity)
- 它**用 primitive 组合验证了一个 happy path**, 但那个 happy path 今天本来也不会有人 doubt — 真 doubt 的是 "Builder 怎么通过对话创造一个 Operation 出来", 这条没动

**最大担忧 (4 个 reviewer 都提了)**: 如果继续这个节奏做 feature work — 第三个 app、graph 优化、更多 similarity tools — 仓库会长成"一个能干的、但没有 agent 的数据框架"， 正是 vision 明确说不想做的那种东西。

---

## Day 3-5 推荐

基于 4 个 reviewer 的 converging recommendation, 优先级:

### Day 3 — 把 agent 接进一个真 template（核心解锁）

选一个已有 template (推荐 `ai-bookmarks-core-domain` 或 `weekly-linear-digest`), 用 `pneuma-framework dev` + opencode backend 真跑起来。目标不是漂亮, 是**一次完整 round-trip**:
- Builder 在 chat 里说 "给我加个 URL 关于 Rust lifetimes"
- agent 通过 tool-call 调 `add_bookmark`
- viewer 自动刷新

需要: CLI + LifecycleOrchestrator 能把新 runtime template 拉起来, opencode 能 discover 并调 `AppConfig` 里声明的 Operations。不 work 的地方修到 work。

**Why first**: 这是 north star 的 MVP 版。其他所有事情 (embedding 精度 / graph 可视化 / 第三个 app) 都无关紧要 until this loop closes.

### Day 4 — Viewer ↔ Agent 事件广播（主线 C 最薄切片）

Agent 进 loop 之后, 把 Operation 执行 broadcast 到 viewer WS (事件类型 `operation-executed`), viewer 不再需要 polling。**不加 confirmation dialog**, 就广播 + auto-refresh。

**Why second**: 这是第一个"看起来像 AI-native 不像普通带 chatbox 的 REST app"的瞬间。

### Day 5 — ADR-0025 conversation 持久化 MVP + demo script

最小 schema: conversation + messages 两张表, scope 是 app+builder, 不做 PRD gate。验证 session 能跨重启保留。然后写 5 分钟 demo script (`demo.md`):

> 空仓库 → Builder 说"我想要一个 bookmark app 配一个 technical lens" → agent 创建 lens → Builder 粘 URL → agent 加 bookmark (触发 embedding) → Builder 说"跟这条相关的有哪些" → agent 调 `related_bookmarks` → viewer 展示

让主线 A 的工作在这个 demo 里**被 agent 调起来**, 而不是 UI 按钮手点。这也是主线 A 真正兑现"AI-native"承诺的方式。

### 该砍的

- **主线 B (第三个 app)** — 4 个 reviewer 里 3 个点名砍。在 agent-in-loop 证实之前, 第 N 个 template 只会增维护面, 不增 vision 进度。已有的 2 个真 app 足够。

---

## 具体 ADR amendments 建议

基于 primitives reviewer 的识别, 进 Day 3 之前可以顺手做这几条 (都是小 amend, 1-2 行改动):

1. **ADR-0018** — `AffectDeclaration` 加 `reads_only_computed: true` 变体, 允许 `handler.kind === "code"` 同时 `mutations === [] && adapter_writes === []`。现在 `related_bookmarks` / `bookmark_graph` 被迫声明 `reads_only: false` 是 semantically wrong。
2. **ADR-0018** — `OperationOutput` 记一条 follow-up: 需要 `{kind: "derived"; schema}` 变体。现在 void + TODO 是 honest placeholder 但会 mislead agent tool-call schema generation。
3. **ADR-0003** — 代码里 `purity` 已经是 `pure / pure-with-ttl / impure` 三档, ADR 文字只说 `pure / impure`。同步。
4. **ADR-0007** — follow-up: 代码 handler 调 `storage.listRowsByTable` bypass row-level policy。row-level policy 真来的时候要加 policy-aware list helper。
5. **ADR-0002** — `cosineSimilarity` 是否升成 core-domain 的 helper。目前 2 份 duplication (M4 ai-bookmarks + M4 重构版)。答案倾向不升, 等 M4 归档。

---

## 当前 branch 状态

`feat/embedding-graph-ai-bookmarks` 没 merge 到 main。16 commits, 所有 tests green, 所有 reviews pass 2 stage. OPEN-QUESTIONS.md 里 ✅ 已完成主线 section 里记了主线 A 完工。

**选项**:
- (a) Merge 到 main — 保留今天的成果, 虽然 ROI 不高但技术上干净
- (b) 保 branch 不 merge, 先做 Day 3 的 agent-in-loop — 如果 agent 接入揭示 ai-bookmarks 需要调整, 这些 commits 还可以改
- (c) 挑 framework-layer pieces (Task 1+2+3 = EmbeddingProvider + OpenRouter impl + cosine helper) 提取合并, template-layer 暂留 branch

个人倾向 (a) — 现在的 template work 也不会反噬什么, 而 Day 3 需要一个干净的 main。

但**最重要的不是这个**——是 Day 3 不要再选一个 feature 做。
