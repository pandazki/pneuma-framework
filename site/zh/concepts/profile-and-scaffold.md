# Profile 与 scaffold

在 agent 能安全改动一个 generated app 之前,得有人决定*agent 被允许碰什么*。这个决定
就是 **scaffold project**——一份 Developer 编写的源码边界;而 **profile** 是把它
实例化成一个全新 `v0` 的东西。

![一个 scaffold project,分成 agent 可编辑的 writable roots 和不可碰的 protected paths,manifest 声明 verify 与 lifecycle 命令](/diagrams/profile-scaffold.png)

## 边界为什么存在

一个 generated app 是真实的源码:server、schema、client、lifecycle 脚本,以及把它接进
Host 的框架集成代码。如果把这一切原样交给 code agent,有两件事会出错:agent 可能改坏
框架接线(然后什么都不工作、没人知道为什么);而且你没有一个稳定的面去做 diff。
scaffold 同时修好两者——*预先*画一条显式的线,由 Developer 编写,而非每次变更现谈。

这由 **ADR-0033(Scaffold Project Contract)** 钉死。契约写在一份 manifest 里——
`pneuma.scaffold.json`——并由 `doctor-host` 校验。

## manifest 声明了什么

`ScaffoldProjectManifest` 很小,但举足轻重:

```jsonc
{
  "artifact_boundary": {
    "writable_roots":  ["src/app/**"],   // agent 只能改这里
    "protected_paths": ["src/framework/**", "scripts/**"],
    "generated_roots": ["dist/**"],
    "share_exclude":   [".env"]          // 密钥绝不随分享外传
  },
  "agent_contract": {
    "allowed_tasks":   ["..."],
    "forbidden_tasks": ["..."],
    "tool_policy":     "draft-workspace-only"
  },
  "guardrails": {
    "pre_proposal": [ /* 在请求批准之前跑 */ ],
    "pre_apply":    [ /* 批准之后、变更之前跑 */ ],
    "post_apply":   [ /* 文件拷贝之后跑 */ ]
  },
  "lifecycle": { "preview": "...", "build": "...", "test": "...", "publish": "..." }
}
```

两个字段承载了大部分重量:

- **`writable_roots`** —— draft *唯一*可改的路径。任何之外的改动在被展示给 Builder
  之前就被拒。`protected_paths` 不得与 `writable_roots` 重叠;重叠则 `doctor-host`
  让 manifest 失败。
- **`guardrails`** —— 三个具名阶段,[verify 门禁](./verify-gate)和
  [apply](./apply-and-versions)挂在它们上面。`pre_proposal` 就是那道决定一个 draft
  是否有资格成为 proposal 的门禁。

## profile = 造出一个 `v0` 的东西

**profile** 是一份 Developer 编写、开箱即跑的 generated-app 模板,加上它的 scaffold
manifest。实例化一个 profile 就得到一个*完整*的 `v0`——立即可预览、可发布,无需任何
agent 工作。agent 演进是可选的;一个跑起来之前还得先来一轮 agent 的 profile,是坏的
profile。

端到端验证过的参考 profile 是一套生产栈——Bun + Hono + React + Drizzle + Zod,
带 Neon 持久化边界与 Docker/Vercel 部署目标。但这些都不是框架语义:栈、领域、UI
**全是 Host/profile 的选择**(见[边界](/zh/architecture/boundaries))。框架只在乎
manifest 声明了一条可写边界,以及一个它能当门禁用的 `verify` 命令。

## 为什么由 Developer 拥有,而非 agent

scaffold 是循环里唯一一个 agent *不被允许*编写的产物。它是 agent 运作所依据的宪法:
它定义 agent 的权力(writable roots)、它的边界(protected paths、forbidden tasks),
以及它必须通过的考试(guardrails)。让 agent 改写自己的宪法,就违背了初衷。所以
Developer 把 scaffold 写一次;Builder 和 agent 此后永远*在其内*演进这个 app。

下一篇:draft 工作区与 `pre_proposal` guardrail 驱动的 [verify 门禁](./verify-gate)。
