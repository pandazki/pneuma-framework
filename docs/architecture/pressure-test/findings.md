# Pressure Test 综合发现与行动项

> 基于 [e-scenarios.md](./e-scenarios.md)（12 个应力场景）与 [c-redesign.md](./c-redesign.md)（ai-bookmarks 重设计）的综合发现。
> 本文是 pressure test 的最终 deliverable：列出 **ADR 要改什么、要新写什么、哪些是健康的、以及下一步的建议方向**。

---

## TL;DR

15 条 ADR 经过一次正式的应力测试（12 个场景 + 1 个完整应用重画），结果：

- **6 条 ADR 是健康的**（被重复 exercise，表达力足够，无需大动）—— 0001 / 0009 / 0013 / 0014 / 0015（带小 amend）/ 0002 主体
- **8 条 ADR 需要 amend**（有缝隙、shape 不精确、或 edge case 未覆盖）—— 0002 / 0003 / 0005 / 0007 / 0008 / 0012 / 0013 / 0014
- **10 条新 ADR 是必要的**（现有 ADR 无法覆盖的重要空白）——下面列出
- **2 条 ADR 是轻度的 scope 收紧建议**，没大动 —— 0006 / 0011

**整体判断**：ADR **总框架站得住**，但当前状态**不够作为实施 spec**——在开始 M5 实施之前应当补完至少 3-4 条高优先级的新 ADR + 做几处关键 amend。

---

## 新 ADR 候选清单（按优先级排序）

| # | 标题 | 起源 | 优先级 |
|---|---|---|---|
| 1 | **Dev vs Release data isolation** | E8 | 🔴 P0 |
| 2 | **Rollback data semantics** | E9 | 🔴 P0 |
| 3 | **View system**（内置 kinds / custom view / 数据源声明） | C1 | 🔴 P0 |
| 4 | **Query language / Derived DSL** | C2 + C1 互相依赖 | 🔴 P0 |
| 5 | **Transform versioning & rerun semantics** | E4 | 🟠 P1 |
| 6 | **Hybrid table model**（adapter-backed + 本地扩展字段） | E5 | 🟠 P1 |
| 7 | **Transform pipeline / composition** | C3 | 🟠 P1 |
| 8 | **Destructive action confirmation**（框架级） | E11 | 🟠 P1 |
| 9 | **Prompt injection threat model** | E12 | 🟠 P1 |
| 10 | **声明式层 vs 代码层边界** | C6 | 🟡 P2 |
| 11 | **Internal (framework-managed) tables**（users/roles/events/_migrations） | C8 | 🟡 P2 |
| 12 | **Transform pipeline failure semantics** | E6 | 🟡 P2 |
| 13 | **Mutation ordering with external systems**（adapter + audit 一致性） | E7 | 🟡 P2 |
| 14 | **Rule precedence & deny support** | E2 follow-up | 🟢 P3（future） |
| 15 | **Denial disclosure policy**（End User 被拒解释） | E3 | 🟢 P3 |
| 16 | **Policy change impact analysis** | E10 + C7 | 🟢 P3 |

**P0 = 开 M5 之前必须有答案的**（关乎框架 identity / 数据安全）。
**P1 = M5 实施前应该有答案的**（不然落代码会打补丁，积技术债）。
**P2 = 可以 M5 做到一半再补**（边角但真实的问题）。
**P3 = 架构成熟后再敲**（或已有 flag 在 follow-up 里）。

---

## 现有 ADR 的 amend 清单

### [ADR-0002](../adr/0002-storage-typed-cells.md) — Storage core
- 加 `ref-row-list<Table>` CellType（E1）
- `Hybrid` source 详细形态拆到新 ADR（C5 / Hybrid table model）
- `Derived` source 的具体表达拆到新 ADR（C2 / Query language）

### [ADR-0003](../adr/0003-transform-primitive.md) — Transform
- `purity` 字段细化为 `pure | pure-with-ttl | impure`（C4）
- 明确 Transform 是 sandbox：不能调 adapter / fetch / DB write（E12）
- `outputSchema` 强约束：LLM 不符 schema → 重试或失败（E12）
- Transform 作为 event 类别的归属澄清（C5 / [ADR-0013] amend）

### [ADR-0005](../adr/0005-adapter-capabilities.md) — Adapter capabilities
- 写操作与 audit emit 的顺序与失败策略（E7 → 可能直接依赖 Mutation ordering 新 ADR）

### [ADR-0007](../adr/0007-permission-dsl.md) — Permission DSL
- `in` 操作符扩展支持 `ref-list.contains(value)` 子谓词（E1）
- Rule precedence 声明"任一 allow 命中即允许，暂不支持 deny"（E2），把 open question 从 follow-up 提到 Decision

### [ADR-0008](../adr/0008-nl-bidirectional.md) — NL bidirectional
- `PolicyDecision.reason` 枚举里 `"explicit-deny"` 注释为"shape 保留未来用，MVP 不触达"（E2）
- 区分 `explain_for_builder()` 与 `explain_for_denied_user()`（E3）
- Policy edit flow 要求 agent 主动调 `who_can` 做 impact analysis（E10 / C7）

### [ADR-0012](../adr/0012-agent-permissions.md) — Agent permissions
- Build-phase agent 区分 "trusted input"（Builder 对话文字）vs "untrusted input"（adapter 返回数据）（E12）

### [ADR-0013](../adr/0013-telemetry-event-model.md) — Telemetry
- 加 `transform` event category 或明确 transform 归 `agent`（C5）
- Event payload 补 failure case（`error_kind / error_message / retryable / partial_result`）（E6）
- `AgentPayload` 里 `agent_id` 语义——transform 也 fit 这个字段吗？（C5）

### [ADR-0014](../adr/0014-audit-subset.md) — Audit subset
- Audit sink emit 失败的行为——倾向"阻断 mutation"，可配置（E7）

### [ADR-0015](../adr/0015-sinks-and-trace.md) — Sinks + trace
- Span 嵌套语义显式化——HTTP request 内部的 transform chain 是 span 嵌套，不是新 trace（C5）

---

## 现有 ADR 健康度确认

下面这几条经 pressure test 基本不需大改：

- **[ADR-0001 Archetype scope](../adr/0001-archetype-scope.md)**——所有后续场景都能从它找到 archetype 依据；scope 划分正确。
- **[ADR-0004 Adapter protocol](../adr/0004-adapter-protocol.md)**——ai-bookmarks 没用到不代表过度设计；future 场景（如 "集成 Linear"）会激活它。协议 shape 合理。
- **[ADR-0006 Permission granularity](../adr/0006-permission-granularity.md)**——H3 三层对 ai-bookmarks + team 场景都够用。
- **[ADR-0009 Default posture](../adr/0009-permission-default-posture.md)**——"渐进收紧"的模型在实际 flow 里很舒服。
- **[ADR-0010 User-id grants](../adr/0010-user-id-grants.md)**——user + role 并列的决定正确。
- **[ADR-0011 Adapter credential modes](../adr/0011-adapter-credential-modes.md)**——三种 mode 都有对应真实场景。

---

## 按发现深度总结 ADR 的健壮度

| 层 | 健壮度 | 核心发现 |
|---|---|---|
| **愿景 / Archetype**（0001） | 🟢 强 | 场景都能 trace 回档位 |
| **存储 Primitives**（0002/0003） | 🟡 中 | CellType 主体好，但 `Hybrid` / `Derived` 是空壳；Transform pipeline 未定义；purity 语义太简 |
| **Adapter**（0004/0005/0011） | 🟡 中 | 协议 shape 合理，但写回 + audit 的一致性未定 |
| **权限 DSL**（0006/0007/0008/0009/0010） | 🟢 强 | Triple DSL 表达力足够；NL 双向能真用；default 姿态合理 |
| **权限边界 case**（E1/E3/E10） | 🟠 弱 | 分享模型、denial 解释、变更影响评估都未严谨 |
| **Agent**（0012） | 🟡 中 | 核心决策正确，但 trusted/untrusted 输入未分 |
| **Telemetry**（0013/0014/0015） | 🟢 强 | 事件模型、audit 子集、sink、trace 都 exercise 得上 |
| **生命周期 / 双模式**（无 ADR） | 🔴 弱 | Dev/Release isolation、rollback、schema-policy-data 协同、都没 ADR |
| **视图 / 查询**（无 ADR） | 🔴 弱 | View system、Query DSL 都是空白 |

---

## 推荐的下一步三选

### Path α: 先补 P0 新 ADR（最保守）
把 Dev/Release isolation、Rollback semantics、View system、Query DSL 四条写完，再考虑 M5。**耗时：~1-2 天纸面**。优势：M5 实施时地基稳。风险：继续纸面可能又发新盲点。

### Path β: P0 + 关键 amend 同时，M5 开小口子
P0 新 ADR 写完 + 核心 amend 完成后，挑一个**最小 MVP scope** 开始 M5 实施（比如"只实现 Storage Primitives + 权限 + 遥测，暂不做视图系统"），把实施当作下一轮 pressure test。

### Path γ: 直接开 M5 小口子 scope
忽略 P0 新 ADR，直接挑一个与现有 ADR 强 coverage 的 scope 落地（例如"只做 Storage 层 + Transform 原语"）。先写代码验证。风险：view / query / rollback 的缺失会在实施过程中被迫"现场设计"。

### 我的推荐：**Path β**

理由：

1. **四条 P0 新 ADR**（Dev/Release isolation / Rollback / View system / Query DSL）**关系到框架 identity**，不敲就实施等于在沙上盖房
2. **Amend 部分**多数是字段级修正（~半页）
3. 然后 M5 scope 精准——**Storage + Transform + Permission + Telemetry 这四层**（都是"强 coverage"的 ADR）。视图 / 查询 / 生命周期升级单独排后续 M
4. 这样实施本身成为第三轮 pressure test——很多纸面上想不到的问题会在 3-5 天的实施里冒出来

**估算**：
- P0 新 ADR（4 条）：~1 天
- 核心 amend（0002/0003/0007/0008/0012/0013/0014）：~0.5 天
- M5 scope 设计（基于上面的更新）：~1 天
- 然后进实施

---

## 对你（Pandazki）的问题

1. **Path α/β/γ 你选哪个？** 我倾向 β。
2. **Archetype 确认**：实施时你会用什么真实 pneuma-app 验证？ai-bookmarks 已经被我们玩完——C-redesign 里揭示它其实不触及 Adapter，所以对**archetype B 带集成的场景**覆盖不到。第一个"真实目标 pneuma-app"最好是你个人真需要 + 触及 Adapter 的东西（比如"个人读过的 Linear issue 评注 + 周报总结" 这种）。
3. **View system / Query DSL 是大 ADR**：如果走 Path α/β，我写这两条时会需要你比前几条更密集的讨论——它们决定 Builder viewer 长啥样。
4. **Pressure test 的"场景集"本身**要不要再跑一轮？这轮我选了 12 个，偏**错误处理 / 冲突 / 边界**——但没深入 **规模** 场景（万级数据、百级并发、跨租户）。这些可能在 archetype C/D 推进时需要。
