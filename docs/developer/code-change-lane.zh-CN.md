# Code Change Lane 中文版

**读者：** 正在构建 Creation Host，并允许 Build-phase Agent draft Generated Application source code 的 Developer  
**English version:** [code-change-lane.md](./code-change-lane.md)  
**引入版本：** `pneuma-rc-0.1.3`

Code Change Lane 是三份 framework contract 之间的第一个可执行桥：

```text
Scaffold Project Manifest
  + BuildThread
  + Builder approval
  -> governed source-code change
```

它不是让 framework 拥有你的 app template，也不是让 framework 拥有你的 agent backend。它给 Host 一个最小 executor，用来处理一个所有真实 Creation Host 都会遇到的流程：

1. Build-phase Agent 在 **draft workspace** 里改代码；
2. Host 调用 `prepareCodeChangeProposal`；
3. framework 生成 changed files、diff、checks、base snapshot 和 draft snapshot；
4. Builder 审批一个完整 proposal；
5. Host 调用 `applyCodeChangeProposal`；
6. framework 检查 stale base / writable roots，复制文件，运行 post-apply checks，验证失败时回滚，并记录 BuildThread receipt。

## 最小用法

```ts
import {
  applyCodeChangeProposal,
  prepareCodeChangeProposal,
  createFileBuildThreadStore,
  type ScaffoldProjectManifest,
} from "@pneuma-framework/core";

const threadStore = createFileBuildThreadStore({ workspace: hostWorkspaceDir });
const thread = await threadStore.startThread({
  profile_id: "simple-bun-ts",
  app_id: "app-123",
  builder_user_id: "bob",
});

const prepared = await prepareCodeChangeProposal({
  manifest: scaffoldManifest,
  source_root: "/path/to/generated-app/source",
  draft_root: "/path/to/generated-app/draft",
  thread_store: threadStore,
  thread_id: thread.thread_id,
  proposal_id: "proposal-1",
  summary: "Update the home screen",
  rationale: "Builder asked for a clearer first-run experience.",
});

if (!prepared.ok) {
  // 不要请求 Builder approval。把失败 checks 返回给 agent 或 Builder。
  return prepared;
}

// 把 prepared.proposal.evidence.diff、changed_files、checks 展示给 Builder。
// Builder approve 之后：

const applied = await applyCodeChangeProposal({
  manifest: scaffoldManifest,
  source_root: "/path/to/generated-app/source",
  draft_root: "/path/to/generated-app/draft",
  proposal: prepared.proposal,
  decision: "approved",
  thread_store: threadStore,
  thread_id: thread.thread_id,
});
```

## Executor 保证什么

- **坏 draft 不进入 approval。** `pre_proposal` checks 失败会返回 `ok: false`；Host 不应该请求 Builder approve。
- **Proposal evidence 是具体的。** prepared proposal 包含 `changed_files`、文本 diff、guardrail check evidence、base snapshot 和 draft snapshot。
- **Stale base 在 mutation 前失败。** `base-snapshot-unchanged` 会发现 proposal evidence 生成后 source 又被改过。
- **未审批的 draft 后续编辑在 mutation 前失败。** apply path 会拒绝 Builder 看过 proposal evidence 之后又被修改的 draft files。
- **Apply 时强制 writable roots。** 不在 `artifact_boundary.writable_roots` 内的 changed file 会在 mutation 前被拒绝。
- **Post-apply validation 失败会回滚。** 如果复制文件后 `post_apply` checks 失败，executor 会恢复旧文件，并记录 `failed_validate_rolled_back`。
- **有 BuildThread 时自动记录 receipt。** 如果传入 `thread_store` 和 `thread_id`，executor 会 append `agent_proposal`、`user_decision` 和 `host_execution_receipt` turns。

## Guardrail 语义

Command guardrails 通过 `/bin/sh -lc` 运行：

- `pre_proposal` commands 在 `draft_root` 里运行；
- `pre_apply` 和 `post_apply` commands 在 `source_root` 里运行。

内置 framework checks：

| Check | 语义 |
|---|---|
| `diff-computable` | draft 至少有一个 changed file，并且可以生成 diff。 |
| `protected-paths-unchanged` | changed files 不与 `artifact_boundary.protected_paths` 重叠。 |
| `base-snapshot-unchanged` | source files 仍然和 proposal evidence 生成时一致。 |
| `preview-health` | 需要 Host 提供 `framework_check_runner`；framework 不知道你的 preview health endpoint。 |

如果 Host 有更丰富的检查，比如 preview server health、视觉 smoke check、产品特定 static analyzer，就通过 `framework_check_runner` 接入。

## 它放在哪一层

schema/definition rows 继续走 governed Operations，例如 `definition.apply_change_set`。

Host-owned open-ended source artifacts 走 Code Change Lane：

```text
Agent drafts files in draft_root
  -> prepareCodeChangeProposal()
  -> Builder approval
  -> applyCodeChangeProposal()
  -> BuildThread receipt
```

这保持了 RC 的核心边界：framework 治理 lane 和 evidence；Host 仍然拥有 template、source tree、preview process 和产品特定检查。

## 当前限制

- 它还不创建 draft workspace。Host 仍然决定如何 clone/copy/source-control drafts。
- 它不启动 opencode 或其他 code agent。它假设 Host 已经产出了 draft workspace。
- 它不处理复杂 semantic merge conflict，只做 stale base detection。
- 它不提供浏览器 approval UI。Host 自己渲染 `proposal.evidence`。
- 它不替代 release rollout、preview lifecycle 或 share/fork artifacts。

这些是刻意的限制。RC 0.1.3 让 lane 变成可执行，但不把 Creation Host 的产品职责吞进 framework。
