# ADR-0029: v0 design spec 被 supersede — primitive 中心从 lifecycle scripts 迁到 Operation

**Status**: Accepted
**Date**: 2026-04-28
**Deciders**: Pandazki, Claude (Opus 4.7)
**Tags**: scope, vision, framework-architecture, doc-hygiene
**Supersedes**: `docs/superpowers/specs/2026-04-21-pneuma-framework-v0-design.md`（squash 后从 working tree 移除，git history 保留）

---

## Context

2026-04-21 的 v0 design spec 把 framework 解读为 **lifecycle-script orchestrator**：

- Build-phase Agent 通过 MCP 调 `lifecycle.dev.start / build.run / deploy.run` 等语义工具。
- 模板（template）是部署单元，shell scripts 是 sovereign code。
- M0–M6 roadmap：M0 skeleton → M1 lifecycle core → M2 agent + tools → M3 viewer wire + React SDK → M4 procfile-fullstack → M5 vanilla SDK + codex → M6 Pneuma 3.0 dogfood。

这套框架观的隐含心智模型是：「Builder 通过对话让 Agent 改文件；framework 负责跑这些文件。」它把"对话生成 app"的核心承诺**外包**给了"Agent 编辑文件"，framework 自己只负责进程编排。

之后两周的工作（28 条 ADR + 1 次 pressure test + 23 个实施 slice）发现了一个**更深的 primitive**：

- [ADR-0018](./0018-operations-as-primitive.md) — Operation 作为 first-class primitive：UI 点按钮 = Agent 调 tool 是同一个声明派生。
- [ADR-0023](./0023-operation-surface-contract.md) — Operation surface contract：`agent_callable / public_surface / view_mountable / framework_internal` 让 framework Operation 与 Builder 暴露的 app surface 在同一个抽象里区分。
- P1–P23 工作把 `definition.apply(add_table / add_table_column / add_operation / add_view / add_policy_rule)` 落成一组**语义 Operation**，复用 `PermissionContext / app_history / approval / rollback / restart` 这一整套既有 primitive 通路。

后果是：**app definition mutation 走 framework 既有 primitive 通路**，不需要 lifecycle script 这一层间接。Agent 不再"通过 dev.sh 重启来让改动生效"——Agent 调 `definition.apply`，framework 写定义行 + 重启 + rediscover；这条路对 Builder/Agent 完全不可见地变成 governable 操作。

v0 spec 在以下几条上仍然成立、值得保留：

- **shell-based lifecycle** （`dev.sh / build.sh / deploy.sh`）作为 **runtime 子系统**仍然有用——pneuma-app 总要被启动 / 构建 / 部署。
- `##pneuma:` stdout marker、process group 管理、`build.manifest.json` 等技术细节仍在代码里成立。
- viewer SDK / wire protocol / agent backend 抽象的方向不变（在 ADR-0025/0026/0027/0028 里更精细化）。

但 v0 spec 的 **roadmap、核心 primitive 选择、模板与 framework 的边界**已被 ADR-0001 / 0018 / 0023 + P1–P23 工作推翻。继续把它当作"已被用户审过的权威设计"会让新 contributor 走错路。

---

## Options considered

### Option A: 保留 v0 spec 为 canonical，把后续工作记为 "M1 内部"

不诚实。v0 的 M1 是 lifecycle core；当前 M1 是 governed app-definition primitive。两者既不是同一件事，也没有渐进路径——是**模型替换**，不是模型扩展。

- **Pro**：表面连续性。
- **Con**：让"v0 M1"和"当前 M1"变成两个相互冲突的故事，对外讲故事时绊倒所有人。

### Option B: 直接删除 v0 spec，假装它没存在过

短视。v0 spec 有重要的"为什么这条路被否掉"的推理价值；future contributor 需要它来理解为什么不能简单"让 Agent 改文件就好"。删了等于丢失架构 detective story。

- **Pro**：仓库一干二净。
- **Con**：丢失推理资产；将来同类 design idea 重新冒头时没参照。

### Option C: v0 spec 被 supersede，留 git history、不留 working tree；ADR-0029 记录 supersedure 推理

保留推理资产、清干净 working tree、新 contributor 从 milestone snapshot 起步。

- **Pro**：working tree 反映当前真相；git history 仍然可查；supersedure 的推理在 ADR 里固定。
- **Con**：lifecycle 子系统的协议细节（marker / artifact / process）尚未在 ADR 里固定；将来要正式化得从 git history 取 v0 spec §4–§6。

**选 Option C**。

---

## Decision

1. **`docs/superpowers/specs/2026-04-21-pneuma-framework-v0-design.md` 从 working tree 移除**（squash commit 与本 ADR 同期落地）。git history 仍可查。
2. **v0 spec 的 M0–M6 roadmap 被废止**；项目当前 roadmap 见 [`docs/architecture/roadmap.md`](../roadmap.md)。
3. **lifecycle 子系统保留**：`packages/core/lifecycle.ts / manifest.ts / markers.ts / process-manager.ts` 等仍是 framework runtime 的一部分，支撑 pneuma-app 的启动 / 构建 / 部署；只是不再是 framework 的核心 primitive 入口。
4. **`CLAUDE.md` / `AGENTS.md` 不再把 v0 spec 列为 canonical 起步读物**；改为指向 [`milestone-1-snapshot.md`](../../archive/milestone-1-snapshot.md) 与本目录 README。
5. **新 contributor 阅读路径**：`docs/architecture/README.md` → `milestone-1-snapshot.md` → ADRs（按需）→ `roadmap.md`。
6. **lifecycle 子系统协议**（脚本 marker、artifact handoff、env vars 等）目前**没有 ADR 锁定**——这是一个 known gap。一旦该子系统第一次被生产环境认真使用，写 ADR-0030+ 把 v0 spec §4–§6 正式化。

---

## Consequences

### Positive

- 文档树小一档，对外讲故事时不会被"为什么 v0 spec 和 M1 snapshot 不一样"绊倒。
- `lifecycle-script as core` 与 `Operation as core` 这两套**互不兼容的 framework 心智模型**只剩一个被保留为 canonical。
- 给 ADR-0030+ 的工作（policy lifecycle / authorization / permission center / hot reload / lifecycle 子系统正式化）腾出一个干净的命名空间。

### Negative / Risks

- v0 spec 里有一些细节尚未在 ADR 里固定下来（如 `##pneuma:needs-confirm` 的 stdin 响应协议、`build.manifest.json` 的精确字段、`PNEUMA_*` env var 的语义）。这些**仍在代码里成立**，但**没有 ADR 锁定**。如果未来 lifecycle 子系统需要正式化，要从 git history 取回 v0 spec §4–§6 作为起草材料。
- 新 contributor 看到 `packages/core/lifecycle.ts` 等文件时可能困惑——为什么有这一套但不在 milestone 故事里。`README.md` 与 `roadmap.md` 已加说明："lifecycle 是 runtime 子系统，不是 primitive 入口"。

### Follow-ups

- `docs/architecture/roadmap.md` 写出 Stage 0–8 的当前现实路径（伴随 ADR-0029 落地）。
- README.md 的"项目状态"段移除 v0 spec 引用（伴随 ADR-0029 落地）。
- ADR-TBD: lifecycle 子系统协议正式化（marker / artifact / env vars / process group），触发条件 = 生产部署 demo 第一次认真用。
- 进 OPEN-QUESTIONS：lifecycle 子系统的 hot reload / 跨 verb 状态机定义是否值得在 ADR 里 pin。
