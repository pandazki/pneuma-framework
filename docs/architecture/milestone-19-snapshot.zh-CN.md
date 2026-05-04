# Milestone 19 Snapshot：Release Candidate Review

**日期：** 2026-05-04
**状态：** RC review 已关闭；RC tag 暂缓，等待一个 pre-RC 边界决策
**读者：** 评估 Pneuma 是否可以进入 candidate release 的团队成员
**范围：** M1-M18 之后的顶层目标对齐、package/API 边界、文档健康度、全量验证、浏览器证据、第三方 review。
**English version:** [Milestone 19 Snapshot](./milestone-19-snapshot.md)

## 摘要

M19 从项目顶层目标重新 review：

> Developer 能不能用 pneuma-framework 做出一个 AI-native Creation Host，让 Builder 通过 governed agent loop 共创可部署应用？

结论是：很接近，但今天还不应该打 release tag。

强证据：

- 四制品模型已经在当前文档中基本一致；
- M16 证明 schema-driven generated apps 的完整 Creation Host workflow；
- M17 关闭了主要安全与治理接受问题；
- M18 证明 Host workflow 可以承载 non-table-first Personal Focus Site；
- 修正旧治理语义断言后，全量测试已绿；
- browser E2E 仍能发现真实 integration defect，并且这些 defect 已补测试。

剩余 pre-RC blocker：

> M18 的 open-ended UI/module evolution 是 Host-governed，不是 framework `definition.apply_change_set` governance。

这可能是正确边界，但必须在 candidate release 前明确。Pneuma 不能误导性地声称任意 open-ended UI/module artifact 已经和 Table、Operation、View、PolicyRule 一样进入 framework-governed app-definition rows。

## 决策

M19 决策：

```text
GO：进入 pre-RC closure work。
NO-GO：今天不打 RC tag。
```

candidate release 应该等一个很小但关键的 M20 gate：

```text
M20: Open-ended definition governance boundary
  -> 决定并记录 open-ended UI/module artifact 属于：
     A. Host-owned artifact + Host-level approval，或
     B. 通过新 primitive / extension lane 进入 framework-governed definition rows。
  -> 让 M18/M16 examples 和 docs 与该 contract 对齐。
```

这不是推倒重来，而是 candidate release 前最后一次边界收紧。

## M19 修了什么

M19 没有加大功能，只修了 RC review 暴露出来的验证与边界问题：

| 范围 | 发现的问题 | 处理 |
|---|---|---|
| Creation Host core contract | `packages/core/src/creation-host.ts` 暴露了 reference-stack 假设：`sqlite_path`、`runtime: "bun-typescript"`、`persistence: "sqlite"`、`read_operation_id`、`data_table_id`。 | Core contract 改为通用 `stack_id`、`capabilities`、opaque JSON `metadata`；具体 SQLite path 和 read/data operation id 留在 reference examples。 |
| M18 transcript 准确性 | M18 transcript 写了 `definition.apply_change_set`，但实现是直接改 `site-definition.json`。 | transcript 改为 `host.apply_open_ended_evolution`，并标注 `governance_scope: "host_approval"`；M18 文档明确这不是 framework `definition.apply_change_set` 证据。 |
| Rollout evidence 形状 | Browser E2E 发现 M18 release checks 是字符串，被 clone 成字符索引对象。 | health checks 改成真正的 `ReleaseRolloutCheck` 对象，并在 M18 browser-flow test 中断言。 |
| 过期治理测试 | M5/M6/M9 和 `definition-apply` tests 仍按旧的 4-change Priority Queue 与 public query/view 默认值断言。 | 测试已对齐当前 fail-closed governance model 和 5-change capability proposal。 |
| Onboarding docs | 根目录 `README.md` 缺失，`PRODUCT.md` 过期，AGENTS/CLAUDE local pointer 看起来像必需文件。 | 新增 root README，重写 PRODUCT，并说明 local 文件是 optional/git-ignored。 |
| ADR template link health | ADR template 里有 wildcard sample link，导致 markdown link check 失败。 | 改成具体示例引用。 |

## 验证证据

全量测试：

```text
bun test

1136 pass
0 fail
4261 expect() calls
Ran 1136 tests across 173 files. [75.33s]
```

Typecheck：

```text
bun run typecheck
exit 0
```

Whitespace / diff check：

```text
git diff --check
exit 0
```

Architecture markdown link check：

```text
checked 77 architecture markdown files
exit 0
```

修复后的 focused checks：

```text
bun test packages/core/test/creation-host.test.ts \
  examples/m16-reference-creation-host/run.test.ts \
  examples/m18-open-ended-personal-focus-site

10 pass
0 fail
94 expect() calls
```

Live browser review：

```text
http://127.0.0.1:8885/

Create -> Preview -> Inspect -> Evolve -> Transcript
  transcript 包含 host.apply_open_ended_evolution
  governance_scope 是 host_approval

Allow -> Publish v0 -> Publish v1 -> Rollback -> Rollout
  active release 回到 pandazki-focus-site-v0
  release checks 是结构化 health/site_api ReleaseRolloutCheck 对象
  app console error count: 0
```

## 第三方 Review

独立 reviewer 在最终修复前给出 **go-with-blockers**。

关键意见是对的：

| Finding | M19 处理 |
|---|---|
| M18 绕过 framework `definition.apply_change_set`，但 transcript 声称用了它。 | 接受。transcript 和文档已修正；边界作为 M20 决策保留。 |
| Core Creation Host contract 泄漏 Bun/SQLite/reference app 假设。 | 接受，已在 `packages/core/src/creation-host.ts` 修复。 |
| `AGENTS.local.md` 被写成必读，但 worktree 里没有。 | 接受，已改为 optional。 |
| RC 前需要 fresh full-suite evidence。 | 接受，全量 `bun test` 已绿。 |

## 健康的部分

M19 之后，项目结构比之前更健康：

- 当前文档能解释 Framework -> Creation Host -> Generated Application -> Published Application，不再退回旧 template-only 模型；
- framework core 不再暴露 reference Creation Host 的 SQLite/Bun inspection details；
- M17 安全修复仍被 runtime / framework operation tests 覆盖；
- query-backed reads 仍然 fail-closed，除非有显式 invoke policy；
- framework-internal definition Operations 仍拒绝 direct/spoofed external HTTP calls；
- M16 和 M18 都可以运行，也可以用浏览器验证；
- adapter/provider implementation packages 被标成 reference integrations，而不是 core semantics。

## 剩余 RC Blocker

唯一 blocker 是概念边界，不是 failing test：

```text
Open-ended app definition governance 尚未 pin 住。
```

M1-M17 对 framework primitives 的 governance 很强：

```text
Table
Column
Operation
View
PolicyRule
PolicySetting
Rollback
```

M18 引入了另一种 definition：

```text
routes
sections
style tokens
dynamic modules
GitHub attention ranking config
```

今天这些内容存在 Host-owned `site-definition.json`。这只有在 framework 明确声明下面边界时才是可接受的：

```text
Host-owned open-ended artifacts 不属于 framework definition-as-data v0。
它们仍然可以使用 Host approval、release、inspection、rollback evidence。
```

如果这个边界不可接受，M20 就必须在 RC 前引入 framework-governed extension lane。

## 推荐 M20

M20 应该很小：

1. 写 ADR-0031：Open-ended definition artifact boundary。
2. 二选一：
   - Host-owned artifact + Host approval 允许用于 open-ended generated apps；或
   - 新增 framework primitive / extension row 表达 open-ended definition artifacts。
3. 更新 M18，使其与 contract 一致。
4. 跑 M16/M18 browser path 和 full verification。
5. 如果全绿，再打 release candidate tag。

## Bottom Line

M19 做到了它应该做的事：阻止过早 release claim，同时证明 repo 已经非常接近。

项目现在没有继续漂移，只剩一个清晰可见的 pre-RC 边界决策。
