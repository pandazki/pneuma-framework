# 下游项目升级到 pneuma-rc-0.1.3

**读者：** 当前使用 `pneuma-rc-0.1.2` 的下游 Creation Host 项目  
**English version:** [upgrading-to-rc-0.1.3.md](./upgrading-to-rc-0.1.3.md)

`pneuma-rc-0.1.3` 是一个 additive Code Change Lane patch。它不替代 BuildThread、Scaffold Project、release rollout 或 Host-owned agent backend。它给 Host 一个 framework helper：把 draft workspace 变成 proposal evidence，然后在 Builder approve 后带 guardrails apply draft，并记录 receipt evidence。

## 1. 更新本地 framework 路径

如果你的下游项目在 `package.json` 里引用本地 RC checkout，把所有 `@pneuma-framework/*` 路径从：

```json
"file:/Users/pandazki/Codes/pneuma-framework-rc-0.1.2/packages/core"
```

改成：

```json
"file:/Users/pandazki/Codes/pneuma-framework-rc-0.1.3/packages/core"
```

每个 package 使用对应目录：

```text
/Users/pandazki/Codes/pneuma-framework-rc-0.1.3/packages/core
/Users/pandazki/Codes/pneuma-framework-rc-0.1.3/packages/core-domain
/Users/pandazki/Codes/pneuma-framework-rc-0.1.3/packages/runtime
/Users/pandazki/Codes/pneuma-framework-rc-0.1.3/packages/cli
/Users/pandazki/Codes/pneuma-framework-rc-0.1.3/packages/viewer-react
```

然后重新安装：

```bash
bun install
```

## 2. 保留你的 draft workspace 策略

RC 0.1.3 不会替你创建 draft workspace。

继续保留 Host-owned 策略：

```text
source version workspace
  -> copy / fork / checkout
  -> draft workspace
  -> code agent edits draft
```

新的 framework helper 从 draft 已经存在之后开始工作。

## 3. 在 approval 前准备 proposal evidence

用 `prepareCodeChangeProposal` 替换手写 diff/check 收集：

```ts
import { prepareCodeChangeProposal } from "@pneuma-framework/core";

const prepared = await prepareCodeChangeProposal({
  manifest: scaffoldManifest,
  source_root: sourceWorkspaceDir,
  draft_root: draftWorkspaceDir,
  thread_store: buildThreadStore,
  thread_id,
  proposal_id,
  summary,
  rationale,
});

if (!prepared.ok) {
  // 不要展示 approval prompt。把 failed checks 返回给 agent 或 Builder。
  return prepared;
}
```

展示给 Builder 的核心字段：

- `prepared.proposal.evidence.changed_files`
- `prepared.proposal.evidence.diff`
- `prepared.proposal.evidence.checks`

## 4. 只在 Builder approve 后 apply

approval 之后：

```ts
import { applyCodeChangeProposal } from "@pneuma-framework/core";

const applied = await applyCodeChangeProposal({
  manifest: scaffoldManifest,
  source_root: sourceWorkspaceDir,
  draft_root: draftWorkspaceDir,
  proposal: prepared.proposal,
  decision: "approved",
  thread_store: buildThreadStore,
  thread_id,
});
```

预期结果：

- 成功 apply 后：`ok: true` 且 `receipt.status === "completed"`；
- base snapshot 或 writable-root checks 在 mutation 前失败：`ok: false`、`phase: "pre_apply"`；
- post-apply checks 在 mutation 后失败并回滚：`ok: false`、`phase: "post_apply"`、`receipt.status === "failed_validate_rolled_back"`。

## 5. 接入 Host-specific framework checks

内置 checks 覆盖：

- `diff-computable`
- `protected-paths-unchanged`
- `base-snapshot-unchanged`

如果 manifest 使用 `preview-health`，传入 Host-specific runner：

```ts
await applyCodeChangeProposal({
  manifest,
  source_root,
  draft_root,
  proposal,
  decision: "approved",
  framework_check_runner: async ({ check }) => {
    if (check !== "preview-health") return undefined;
    const ok = await waitForPreviewHealth(previewUrl);
    return { ok, output: ok ? "preview healthy" : "preview failed health check" };
  },
});
```

## 6. 删除或缩小 Host-owned glue

通常可以删掉或缩小这些 Host 代码：

- source 和 draft 之间的 changed files 计算；
- 基本文本 diff 渲染；
- protected path 拦截；
- apply 前 stale source 检查；
- 从 draft 复制 changed files 到 source；
- post-apply checks 失败后的 source rollback；
- 手动 append proposal / decision / receipt turns。

继续保留这些 Host 代码：

- 创建 draft workspaces；
- 启动 code agent；
- 渲染 approval UI；
- 实现产品特定 checks；
- publish versions 和 release rollout。

## 7. 运行下游验证

推荐最低验证：

```bash
bun install
bun run typecheck
bun test
```

建议补回归测试：

- failed `pre_proposal` 不展示 approval；
- protected path edits 被拒绝；
- approval 只 apply `writable_roots` 内文件；
- stale source 在 mutation 前失败；
- proposal evidence 后发生的 draft changes 在 mutation 前失败；
- post-apply failure 会回滚 source；
- BuildThread 中 proposal、decision、receipt turns 顺序正确。

## 8. 预期影响

预期：

- Host-owned code-change glue 更少；
- proposal-level approval evidence 更强；
- generated-app code 失败时 rollback evidence 更清楚；
- 简单 Bun + TypeScript + JS app 的下游接入路径更清楚。

不预期：

- 还没有 opencode launch abstraction；
- 还没有自动 draft workspace creation；
- 还没有浏览器 approval component；
- 还不是 production-grade merge engine。
