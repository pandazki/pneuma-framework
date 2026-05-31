# 面向 coding agent

你已经会写代码、跑测试、读 stack trace、重试抖动的调用、找空闲端口——这些本页一概不讲,
你自己行。

本页只讲一件你**无法**从训练数据里推出来的事:这个框架强加的特定模型,以及少数几个
"作为一个*称职的* coding agent,你的直觉恰好会把你带偏"的地方。动 Host 之前,把本页和
[`llms.txt`](/llms.txt) 装进上下文。其余的你自己能搞定。

## 先取索引,按需拉页面

站点根的 [`llms.txt`](/llms.txt) 是机器索引:每个页面一行。用它按任务拉对应页面,而不是
凭权重猜——这些文档是真源,你的先验不是。

## 要握住的模型

四层,且彼此不可互换:

> **Framework → Creation Host → Generated Application → Published Application。**

框架拥有**时序与治理**;Host 拥有**一切副作用**(栈、领域、UI、数据、部署、身份)。当
指令说"那个 pneuma app"时,先判定*哪一层*再动手。

有**两种变更模型**,绝非一种([详见](/zh/concepts/change-models))——用错是个测试也测
不出来的类别错误:

- **定义即数据** —— 结构性变更(表 / 列 / operation / view / policy)是经 `definition.apply`
  改动的受治理*行*。它们不是文件。
- **代码变更 lane** —— 开放式*源码*变更走 draft → verify → proposal → apply。

## 不变量 —— 硬约束,不是建议

它们是承重的;它们*就是*框架存在的理由,所以一旦与某个默认直觉冲突,以它们为准:

1. scaffold 的 `verify` 是唯一的提案前门禁——没通过就没 proposal。
2. fail-closed —— 缺失或含糊的信号阻断;超时不是成功。
3. 批准守护变更——拒绝发生在变更*之前*。
4. 迁移是 additive / forward-only / 幂等——没有 down-migration。
5. 回滚只回代码——数据和部署永不自行回退。
6. agent 编辑 **draft**,绝非 active 源。

## 你的默认直觉在这里恰好是错的

这才是值得你注意的部分。下面每条直觉*在一般情况下都对*,*在这个框架里却错*——这正是
它危险的原因:你的训练不会给你任何提示。

| 你的默认 | 这里 |
|---|---|
| "改完了,所以这个变更就完成了。" | 完成 = scaffold 的 `verify` 通过了。你自己的判断不构成提案门禁。 |
| "直接改应用更快。" | 你只改一份 draft 副本。线上应用永远不是你的工作区。 |
| "回滚就该把我改的全撤了。" | 回滚只回代码。additive 数据留着(它前向兼容);回退它是一次独立、显式的 proposal。 |
| "它返回了 200 / 一个 deployment id,所以上线了。" | 回执必须证明一条*可达*路径。"已部署" ≠ "可达"。 |
| "这个 helper 很通用——提到框架里去。" | 只要它碰 栈/领域/UI/数据/部署/身份,就归 Host。框架要的是契约,不是实现。 |
| "把列 drop 或 rename 一下,让 schema 干净点。" | 只能 additive。破坏性迁移绝不属于一次普通变更。 |
| "信号含糊——就当成功了,继续往下走。" | fail-closed:kill、跑 `verify`、只有检查通过才继续。 |

其余一切——某个 backend 完成信号发得古怪、某个部署 provider 把 URL 挡在鉴权后、某个端口
被占了——都是普通活儿。怎么平时处理就怎么处理,框架对此没有意见。

## 路由 —— 按任务找对页面

| 当你准备…… | 拉 |
|---|---|
| 推理 框架 vs 你的 | [边界与所有权](/zh/architecture/boundaries) |
| 实现或调试 创建→发布 循环 | [受治理循环](/zh/architecture/governed-loop) + [组装 Host](/zh/guide/creation-host) |
| 为 agent 编辑给 generated app 划界 | [Profile 与 scaffold](/zh/concepts/profile-and-scaffold) |
| 判断 draft 何时成为 proposal | [Draft 与 verify gate](/zh/concepts/verify-gate) |
| 装配 proposal 证据 | [Proposal 与证据](/zh/concepts/proposal-and-evidence) |
| 物化版本 / 采集观察证据 | [Apply 与版本](/zh/concepts/apply-and-versions) |
| 产出 publish/deploy 回执 | [Publish 与回执](/zh/concepts/publish-and-receipts) |
| 把回滚语义弄对 | [Rollback](/zh/concepts/rollback) |
| 对真实形状数据预览 | [Preview 与数据演练](/zh/concepts/preview-and-rehearsal) |
| 改 表 / operation / view / policy | [定义即数据](/zh/concepts/definition-as-data) |
| 可移植地持久化构建对话 | [BuildThread](/zh/concepts/build-thread) |
| 从零构建整个 Host | [构建 Host](/zh/guide/) |

然后读仓库的 `CLAUDE.md` / `CONTEXT.md` 看项目细节。

---

握住四层边界与六条不变量,你在这里基本不会出错;其余是你早就会处理的细节。
