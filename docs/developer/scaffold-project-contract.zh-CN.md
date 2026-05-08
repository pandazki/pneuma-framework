# Scaffold Project Contract 中文版

**读者：** 正在构建 Creation Host，并希望 Build-phase Agent 可以修改 Generated Application source artifacts 的 Developer。  
**English version:** [scaffold-project-contract.md](./scaffold-project-contract.md)  
**相关 ADR:** [ADR-0033](../architecture/adr/0033-scaffold-project-contract.md)

## 为什么需要它

schema-driven change 可以走 framework definition rows 和 `definition.apply_change_set`。但 open-ended generated app 还会有 code、routes、styles、modules、lifecycle scripts。这些 artifact 在 RC v0 里仍然是 Host-owned，但每个真实 Creation Host 都需要同样的 code-change discipline：

```text
Builder intent
  -> Build Agent 在有边界的 workspace 里起草代码
  -> Host 在 approval 前跑检查
  -> Builder 批准一个完整 proposal
  -> Host apply、verify，并记录 evidence
```

`pneuma.scaffold.json` 是 Developer 编写的 contract，用来让 framework 和 Host 对 draft/code boundary 达成一致。

它不是让 framework 拥有你的 app template。它只是告诉 framework：你拥有的 scaffold 应该如何被校验、如何被理解。

## 最小形状

```ts
import {
  validateScaffoldProjectManifest,
  type ScaffoldProjectManifest,
} from "@pneuma-framework/core";

const scaffold: ScaffoldProjectManifest = {
  schema_version: 1,
  scaffold_id: "dev-board-scaffold",
  version: "0.1.0",
  display_name: "Dev Board Scaffold",
  materialization: {
    strategy: "copy",
    source_roots: ["./scaffold"],
    exclude: ["node_modules", ".env", ".pneuma"],
  },
  artifact_boundary: {
    writable_roots: ["src/app", "src/generated"],
    protected_paths: ["scripts/publish.sh", "src/framework", "pneuma.scaffold.json"],
    generated_roots: ["src/generated"],
    share_include: ["src/app", "src/generated", "package.json"],
    share_exclude: [".env", "data", "node_modules", ".pneuma"],
  },
  agent_contract: {
    allowed_tasks: ["Modify Generated Application source files inside writable roots."],
    forbidden_tasks: ["Modify framework integration files.", "Modify publish scripts."],
    system_prompt_fragments: ["Only edit files under writable_roots."],
    tool_policy: "draft-workspace-only",
  },
  guardrails: {
    pre_proposal: [
      {
        id: "typecheck",
        kind: "command",
        command: "bun run typecheck",
        description: "Typecheck the draft before asking for approval.",
      },
    ],
    pre_apply: [
      {
        id: "base-snapshot",
        kind: "framework",
        framework_check: "base-snapshot-unchanged",
        description: "Ensure the approved draft still applies to the same base.",
      },
    ],
    post_apply: [
      {
        id: "preview-health",
        kind: "framework",
        framework_check: "preview-health",
        description: "Ensure the applied version can still start preview.",
      },
    ],
  },
  lifecycle: {
    preview: { command: "bun run dev" },
    build: { command: "bun run build" },
    test: [{ command: "bun test" }],
    publish: { command: "bun run publish" },
  },
  evidence: {
    diff: true,
    checks: true,
    changed_files: true,
    preview_url: true,
  },
};

const check = validateScaffoldProjectManifest(scaffold);
if (!check.ok) throw new Error(JSON.stringify(check.issues, null, 2));
```

## Approval rule

关键规则是：

> `pre_proposal` guardrails 通过之前，不应该请求 Builder approval。

如果 typecheck 失败、protected files 被改了、或者 diff 算不出来，Host 应该把工作留在 draft state，并把失败反馈给 Build-phase Agent 或 Builder。Approval 应该对应“一个带 evidence 的完整 change”，而不是让用户批准一个坏掉的 draft。

## Doctor 会检查什么

`doctor-host` 可以接收 scaffold contract：

```bash
pneuma-framework doctor-host \
  --workspace ./.pneuma-workspace \
  --profiles ./profiles.json \
  --scaffold-project ./pneuma.scaffold.json \
  --agent-package ./agent-package.json \
  --provider-capabilities ./provider-capabilities.json \
  --share-artifact ./share-artifact.example.json \
  --sharing-governance ./sharing-governance.example.json \
  --credential-rebinding ./credential-rebinding.example.json
```

它会验证：

- scaffold id、version、display name；
- source roots 是相对路径，不能 path escape；当 scaffold root 本身就是 source root 时，允许 `source_roots: ["."]`；
- exclude files 非空；
- writable roots 和 protected paths；
- protected directories 不能和 writable roots 重叠；
- 允许 writable root 内部的 file-level protected carve-out，例如 `src/generated-modules/registry.ts` 位于 `src/generated-modules` 内；
- 只要 `share_exclude` 数组存在，validator 会自动把 `.env` normalize 进去，避免 share/fork artifacts 携带本地 credential；
- Build Agent allowed/forbidden tasks 和 prompt fragments；
- `tool_policy: "draft-workspace-only"`；
- pre-proposal、pre-apply、post-apply guardrails；
- preview/build/test lifecycle commands；
- diff、checks、changed-files evidence requirements；
- manifest 里不能有 raw secret material。

合法的 framework guardrail check ids：

| Check | 作用 |
|---|---|
| `diff-computable` | approval 前必须有具体 code diff。 |
| `protected-paths-unchanged` | 拒绝改动 protected paths 的 changed files。 |
| `base-snapshot-unchanged` | source files 在 proposal evidence 生成后又变化时拒绝 apply。 |
| `preview-health` | 交给 Host 提供的 `framework_check_runner` 做 preview health 检查。 |

如果使用了未知 `framework_check`，validator diagnostic 会列出这组合法值。

## Writable Roots 和 Protected Carve-Outs

目录级 protected overlap 仍然 fail-closed：

```ts
artifact_boundary: {
  writable_roots: ["src"],
  protected_paths: ["src/framework"], // rejected
}
```

M26 放宽的是更窄也更常见的 Host 形状：一个 writable extension directory
里可以有少数 host-authored protected files，只要这些 protected paths 看起来是文件而不是目录。

```ts
artifact_boundary: {
  writable_roots: ["src/generated-modules"],
  protected_paths: [
    "src/generated-modules/registry.ts",
    "src/generated-modules/types.ts",
  ],
}
```

这样 Host 可以把 agent-authored extension files 和 host-authored registry / type-contract files 放近一点，而不用为了避开 validator 把文件树设计得很别扭。

## 和其他 contract 的关系

`BuildAgentPackageManifest` 告诉 framework：Build Agent package 使用哪些 semantic tools、instructions、provider policy、credential boundary 和 verification hooks。

`ScaffoldProjectManifest` 告诉 framework：哪些 code 可以 draft，哪些文件被保护，哪些检查会 gate approval/apply。

`BuildThread` 记录 semantic conversation：Builder intent、Agent proposal、Builder decision、Host execution receipt。

它们组合起来，形成 RC 0.1.3 governed code-change executor 的最小形状：

```text
Build Agent Package
  + Scaffold Project
  + BuildThread
  -> governed code-change lane
```

当 Host 希望 framework 从 draft workspace 生成 proposal evidence、运行 guardrails、应用 approved draft、验证、在 post-apply 失败时回滚，并写入 BuildThread receipt 时，继续阅读 [Code Change Lane 中文版](./code-change-lane.zh-CN.md)。
