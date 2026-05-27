# Milestone 51 快照

**Milestone:** M51, Agent Debug Loop Close-Out Review
**状态：** 已关闭
**日期：** 2026-05-27
**英文版：** [milestone-51-snapshot.md](./milestone-51-snapshot.md)

## 决策

M51 是 M49/M50 这一条线的收口 gate。它不引入新的 product 或 primitive，而是确认 Agent Debug Loop、Workflow App Studio lifecycle UX、真实 Codex 路径和文档已经一致到可以作为下一次团队对齐 baseline。

接受的模型是：

```text
proposal 是通过检查的候选
  不是未经验证的 agent draft
  也不是保证后续 apply/publish 永远不会失败

post-apply failure
  -> 确定性证据
  -> 能回滚则回滚
  -> 修复必须进入新的 Builder intent
```

## Review 了什么

M51 从三个方向 review 这条线：

1. **领域模型：** 工作仍然遵守 Framework -> Creation Host -> Generated Application -> Published Application。
2. **工程边界：** debug loop 属于 proposal 之前；post-apply repair 不会静默重新让 code agent 介入。
3. **Example 证据：** Workflow App Studio 同时通过 deterministic tests 和真实 Codex app-server browser run 证明流程。

## 验证

Typecheck：

```bash
bun run typecheck
```

结果：

```text
passed
```

Combined test gate：

```bash
bun test packages/core/test packages/host-kit/test examples/workflow-app-studio/workflow-studio.test.ts examples/workflow-app-studio/workflow-app.test.ts
```

结果：

```text
506 pass
0 fail
1785 expect() calls
```

Whitespace / patch hygiene：

```bash
git diff --check
```

结果：

```text
passed
```

真实浏览器 E2E：

```text
Host: Workflow App Studio
Backend: codex-app-server
Request: add SLA due date, SLA status, and SLA watch queue
Flow: create -> ask agent -> debug loop -> approve -> preview -> publish -> open published app -> create published runtime record
Changed source: src/app.ts
Observed runtime fields: due_date, sla_status
Observed runtime view: sla_watch
```

## Paperwork 更新

M51 同步了：

- `AGENTS.md`
- `docs/architecture/README.md`
- `docs/architecture/roadmap.md`
- `docs/developer/start-here.md`
- `docs/developer/start-here.zh-CN.md`
- `examples/workflow-app-studio/README.md`
- `examples/workflow-app-studio/README.zh-CN.md`
- M49/M50/M51 双语 snapshots

## 剩余风险

这一条线是健康的，但下一步不应该假装 framework 已经完整：

- backend-neutral progress event normalization 仍然偏薄；
- post-apply deterministic recovery 还能更强；
- generated-runtime code support 仍然刻意很窄；
- production deployment/profile adapters 仍然主要是 Host-owned；
- 任意 UI generation 还没有被证明。

## 下一步工作

推荐后续 lane：

1. post-apply deterministic verification and recovery hardening；
2. backend-neutral code-agent progress events；
3. 更宽的 generated-runtime code support，但要有明确 scaffold boundaries；
4. production deployment/profile adapters，同时避免把 framework 变成 deployment platform。

M51 关闭当前工作线，并把这些后续 lane 变成显式选择，而不是隐藏的未完成工作。
