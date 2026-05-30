# 2 · Creation Host

*设计 → 实现。* Host 把受治理循环串起来。它最惊人之处是写的管道极少:它**消费**框架
与 reference adapter,并把副作用作为闭包提供。

> 源码:`examples/clean-room-release-host`。

## 它消费什么

```text
@pneuma-framework/host-kit/workspace         copy / list / diff / protected-root 检查
@pneuma-framework/host-kit/governed-change   buildGovernedProposal —— fail-closed 门禁
@pneuma-framework/backend-codex              Codex app-server 代码代理 lane
@pneuma-framework/adapter-vercel             Vercel REST 部署 lane
@pneuma-framework/adapter-neon               Neon 分支(Preview Data Rehearsal)
```

Host 只保留真正属于它自己的:项目/版本状态、profile 读取、运行时/预览进程管理,以及
它的产品 UI。

## 提案门禁,以闭包表达

循环的核心是 `buildGovernedProposal`。框架拥有顺序与 fail-closed 门禁;Host 传入副作用:

```ts
import { buildGovernedProposal } from "@pneuma-framework/host-kit/governed-change";
import { runCodexAgent, isCodexTurnCompletionTimeout } from "@pneuma-framework/backend-codex";

const proposal = await buildGovernedProposal({
  draftId, activeRoot, draftRoot,
  protectedRoots: profile.protectedRoots,

  // 对 draft 跑一个 agent 回合(可能因超时抛错)
  runAgent: (root) => runCodexAgent({ draftRoot: root, prompt, baseInstructions }),
  isAgentTimeout: isCodexTurnCompletionTimeout,

  // scaffold 自带的 verify 即门禁(+ 一次运行时 smoke)
  verify: (root) => runVerify(root),

  // 采集前后的 schema + bundle 证据
  observe: (root) => gatherEvidence(root),
});
```

框架替你保证(这样你不必记住):

1. 可恢复的 agent **超时会兜底进**验证(fail-closed);其他错误中止,
2. **空改动**被拒,
3. 碰 **protected root** 的改动被拒——对 diff 检查,而非信 agent 的承诺,
4. **verify 失败**的 draft 被拒,
5. 只有这之后,才用**前后证据**装配出 proposal。

## 两个界面

studio(Host)与已发布应用(Generated App)有意采用不同的视觉语言——一个是*浅色运维
控制台*,另一个是应用自己的产品 UI——使观看者始终知道自己在看哪一框架层:是 Builder
在治理应用,还是 End User 在使用它。

## 预览,两种方式

- **一次性内存预览** —— 在无数据库的一次性运行时上启动 active(或 draft)版本。随便点,
  什么都不写。
- **Neon 分支上的 Preview Data Rehearsal** —— `adapter-neon` 从生产 copy-on-write 出一个
  分支(因此带*真实数据*),Host 对**分支**跑草稿迁移并据此预览。预演期间的写入只进
  分支;生产不受影响;预览停止时分支被删除。数据从不回灌——只有验证过的 forward 迁移
  在发布时进入生产。

## 发布,带回执

`adapter-vercel` 以内容寻址的两阶段上传执行部署,轮询到 `READY`,返回结构化回执
(deployment id、url、文件数)。Host 先跑 Neon 迁移,smoke 一个*可达*端点,并记录回执
——因为"已部署"不等于"可访问"。

## 迭代到满意

proposal 不是一次性的。proposal 未应用时,再次让 agent 干活会在同一草稿上**叠加**修复
(每个回合都重过 `verify`);你可以在批准前**预览草稿**;应用或回滚后过期的预览会被
停掉。循环是*演进 → 预览/预演 → 打磨 → 批准 → 发布*。

现在把这一切真跑一遍。→ **[3 · 端到端](./end-to-end)**
