# Proposal 与证据

**proposal** 是一堆 agent 编辑变成一个人能据以决策之物的那一刻。这个词是精确的:它
意味着*受检的、单意图的、有证据支撑的*——而非"agent 猜了点什么,你看看吧"。

![一个 proposal,打包 changed paths、unified diff、verify 尾部,以及 schema/bundle 前后增量,作为一个批准决策呈现](/diagrams/proposal-evidence.png)

## 一个 proposal 携带什么

框架定义*形状*;Host 来填。proposal 相对 **active 版本**计算,因此展示 Builder 将要
批准的完整累计增量:

```ts
Proposal = {
  changedPaths,           // 哪些文件动了
  diff,                   // 可读的、基于行的 unified diff
  verifyTail,             // 通过的 verify 运行的尾部
  schema:  { before, after },   // DB schema 将变成什么
  bundle:  { before, after },   // 构建产物将变成什么
  agentNote,              // agent 自己对意图的总结
}
```

其中两项值得强调:

- **`diff` 基于行且可读。** 一个下游 Host 明确要过这个(ADR-0026 时期):一个 Builder
  读不懂的 proposal,不是他们能做的决策。diff 是 unified、人类尺度的,不是一团 blob。
- **`schema` 与 `bundle` 是 before/after。** 这正是让一次*数据*或*bundle* 后果在决策时
  就可见的东西。"这个变更加了一张 `release_checklist_items` 表""这个变更让 client
  bundle 涨了 40 KB"是 Builder 应在批准*之前*看到的事实,而非发布后才发现。

## 单意图,按构造保证

一个 proposal 恰好回答一个 Builder 意图。这不是风格偏好——这是让批准有意义的前提。
如果一个 prompt 产出五个不相关的变更,"批准"就成了一张空白支票。定义侧的
[change-set](./definition-as-data)纪律,与代码侧的单 draft 纪律,都为了让批准单元
等于意图单元。

## 证据是具体的,不是断言

一个 proposal 的决定性属性,是它的主张被*核查*过,而非被*陈述*。agent 不是说"我加了
校验";diff 展示那些行,verify 尾部展示测试通过,schema-after 展示那一列。这正是
[verify 门禁](./verify-gate)先跑的原因:一个 proposal 只能建在已经通过的证据之上。

框架还在 apply 时采集**观察证据**——`{ appSchemaSignature, bundleManifest, dbSchema }`
——让一次演进的效果被记录为事实,而非断言。这在 [Apply 与版本](./apply-and-versions)
里详述。

## stale-base 拒绝:证据有有效期

一个 proposal 的证据,是相对 active 源的某个特定快照算出来的。如果 active 源在*准备*
proposal 与*应用*它之间移动了,证据就过期了——diff 不再是它当初说的意思。框架拒绝
应用一个基已经漂移的 proposal:

- `base-snapshot-unchanged` 在 active 源变了时让 apply 失败。
- 一个漂移的 **draft**(证据准备后又被编辑)同样被拒。

两者都在**任何变更之前**失败。一个过期的 proposal 不会被悄悄 re-base 再应用;它被拒,
必须重新准备一个新 proposal。这正是让"批准"诚实的东西:你批准的是你看到的证据,
否则什么都不批。

下一篇:批准做了什么——[apply 与版本](./apply-and-versions)。
