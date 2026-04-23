# Pressure Test — 对 15 条 ADR 的应力测试

> 完成时间：2026-04-23
> 执行者：Pandazki + Claude (Opus 4.7)

## 本目录的三份文档

| 文件 | 内容 |
|---|---|
| [e-scenarios.md](./e-scenarios.md) | **12 个具体应力场景**对 ADR 的压力测试，每场景给出结论（✅ / ⚠️ / ❌）+ 修改建议 |
| [c-redesign.md](./c-redesign.md) | 用新 ADR **重新纸面设计 ai-bookmarks**，验证各 ADR 是否真被 exercise + 发现 8 个盲点 |
| [findings.md](./findings.md) | **综合发现 & 行动项** — 新 ADR 候选清单（P0-P3）+ 现有 ADR 的 amend 清单 + 下一步路径推荐 |

建议阅读顺序：先 `e-scenarios` 再 `c-redesign`，最后看 `findings` 综合。如果只读一份，读 `findings.md`。

## 核心产出

- **6 条 ADR 健康**（0001 / 0004 / 0006 / 0009 / 0010 / 0011，以及 0013-0015 主体）
- **8 条 ADR 需 amend**（0002 / 0003 / 0005 / 0007 / 0008 / 0012 / 0013 / 0014）
- **16 条新 ADR 候选**（其中 4 条 P0 优先）：
  1. 🔴 Dev vs Release data isolation
  2. 🔴 Rollback data semantics
  3. 🔴 View system
  4. 🔴 Query language / Derived DSL
  - 其余 12 条详见 [findings.md](./findings.md)

## 整体结论

**ADR 的总框架站得住，但不足以作为 M5 实施 spec**——需要先补 P0 新 ADR + 关键 amend，然后才适合落代码。

推荐下一步：**Path β — P0 新 ADR + 关键 amend 同时进行，然后 M5 开小口子（Storage + Transform + Permission + Telemetry 四层，不含视图）**。
