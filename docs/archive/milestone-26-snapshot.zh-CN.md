# Milestone 26 Snapshot 中文版 — Code Change Lane Hardening

**日期：** 2026-05-08  
**状态：** 作为 post-RC stabilization milestone 关闭。它不是 `pneuma-rc-0.1.4` release tag。  
**输入：** DevBoard Studio 上游实践报告，尤其是 gap log #38、#40，以及 V6/V7 Code Change Lane 反馈。

## M26 证明了什么

`pneuma-rc-0.1.3` 让 Code Change Lane 变成可执行。M26 让同一条 lane 对真实 Creation Host 更可 review、更少别扭。

这个 milestone 刻意不扩张模型，仍然在原有边界内：

```text
Scaffold Project Manifest
  + BuildThread
  + Builder approval
  -> governed source-code change
```

它没有引入 HostExtension、runtime diagnostics、distribution packaging 或 `AgentBackend.runTurn`。这些都是后续 lane。

## 关闭的反馈

| 反馈 | M26 结果 |
|---|---|
| 现有文件修改的 diff 是整文件 `-/+`，不可读（#38） | `proposal.evidence.diff` 现在渲染为行级 unified diff；wire shape 仍然是 string。 |
| Builder reject 复用了 `failed_framework` | Code Change Lane 和 BuildThread receipt 都支持 `status: "rejected"`。 |
| reject 也要传完整 apply 参数 | 新增 `rejectCodeChangeProposal({ proposal, reason, thread_store, thread_id })`。 |
| framework 合成的 `agent_proposal` 可能和 Host domain proposal turn 重复 | `prepareCodeChangeProposal` 新增 `record_agent_proposal_turn: false` opt-out。 |
| writable root 内的 file-level protected carve-out 被拒（#40） | validator 允许看起来像文件的 protected path 位于 writable root 内；protected directory 仍然 fail-closed。 |
| `source_roots: ["."]` 被拒 | scaffold materialization source roots 允许 `"."` 表示 workspace root。 |
| `share_exclude` 少 `.env` 会 hard-fail | 如果 `share_exclude` 数组存在，validator 自动把 `.env` normalize 进去。 |
| 未知 `framework_check` 的诊断太短 | validator diagnostic 现在列出合法 framework check ids。 |

## 边界决定

M26 不把 agent-generated source code 打包进可移植 share/install/fork artifact。那是后续 HostExtension / distribution lane，不是 hardening patch。

M26 也不把 DevBoard 的 widget runtime hook 直接升格为 framework primitive。更准确的 framework 概念应该是 extension slots 和 bundles；DevBoard widget 只是一个 reference Host shape。

## Developer-facing 变化

更新的 guide：

- [Code Change Lane](../developer/code-change-lane.md) / [中文版](../developer/code-change-lane.zh-CN.md)
- [Scaffold Project Contract](../developer/scaffold-project-contract.md) / [中文版](../developer/scaffold-project-contract.zh-CN.md)

对下游最重要的实际变化是：Host 可以把 host-authored registry/type files 放在 agent-authored generated files 附近；Builder 能 review 更小的 modify-existing diff；拒绝 proposal 会成为一等 audit outcome。

## 验证

在 M26 worktree 里运行：

```bash
bun test packages/core/test/build-thread.test.ts packages/core/test/code-change-lane.test.ts packages/core/test/host-authoring.test.ts
bun run typecheck
tmp_config=$(mktemp -d) && printf '{"auths":{}}\n' > "$tmp_config/config.json" && DOCKER_CONFIG="$tmp_config" bun test
```

结果：

- Targeted contract tests：`36 pass`，`0 fail`，`105 expect() calls`。
- Typecheck：通过。
- 临时 Docker config 下全量测试：`1225 pass`，`0 fail`，`4556 expect() calls`，`184 files`。

为什么使用临时 Docker config：本机 Docker Desktop credential helper 在第一次 full-suite 尝试中阻塞了 `docker build`。使用只包含 `{"auths":{}}` 的 `DOCKER_CONFIG` 单独复跑 Docker smoke 通过；同样环境下 full suite 也通过。

## 下一步

建议顺序保持不变：

1. M27 — Runtime diagnostic surface。
2. M28 — HostExtension / extension slot distribution primitive。
3. M29 — `AgentBackend.runTurn` 和 receipt automation。

M26 先把现有 Code Change Lane 的摩擦降下来，让后面更大的 lane 建在更干净的基座上。
