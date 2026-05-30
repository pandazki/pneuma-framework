# Preview 与数据演练

**preview** 是一个用完即弃的运行时。它唯一的硬规则:绝不写生产数据。听起来简单,直到
一个变更改了 *schema*——此刻"安全预览它"就需要的不止一个内存副本,框架转而求助于
**数据演练**。

![一个用完即弃的 preview 运行时:简单变更用内存副本支撑,改 schema 的变更用隔离的数据库分支,停止时删除](/diagrams/preview-rehearsal.png)

## 用完即弃规则

preview 存在,是为了让 Builder 检视当前或待定版本——schema、数据、operation、日志——
而无后果。不变量:

> preview 绝不写生产数据。

对大多数变更,这由一个**内存副本**或一个隔离的工作数据库满足:起一个运行时,让 Builder
点一点,拆掉。参考 profile 的 preview 正是如此——一个用完即弃的内存沙箱。preview 停止时
它就没了,它做的任何事都没到达真实后端。

## 为什么 schema 变更需要演练

内存副本在一个重要情形下失效:一个**改 schema** 且需要*对真实数据*预览的变更。你无法在
一个空的内存数据库上演练"我的新 `environment` 列能对着现有的 10000 行干净迁移吗?"
——而你也绝不能对生产数据库演练,因为迁移会改动线上数据。

这就是 **Preview Data Rehearsal** 的情形:对着一份*真实数据的隔离副本*预览。

## 数据库分支,copy-on-write

参考机制是 Neon 的分支:生产数据库的一个 **copy-on-write 分支**。分支起步是真实数据的
一个逻辑副本,迁移**以 additive 方式**应用到*分支*上,Builder 对着它预览,而分支在
**preview 停止时被删除**。生产从未被触碰。

```text
生产 DB ──分支 (copy-on-write)──▶ preview 分支
                                    │  在这里应用 additive 迁移
                                    │  对着真实形状的数据预览
                                    ▼
                                  停止时删除  (生产未动)
```

几个属性让它诚实:

- **copy-on-write** 意味着分支廉价——你不是为预览复制整个数据库。
- 分支上的 **additive 迁移**精确镜像 [publish](./publish-and-receipts) 将要真做的事,
  所以演练有代表性。
- **停止时删除**让 preview 保持用完即弃——分支与 preview 运行时同生命期。

::: warning 数据不会合并回去
preview 分支是一次*演练*,不是一个 staging 区。你无法把分支数据合并回生产——而且你不该
想这么做。分支存在,是为了证明迁移并让 Builder 看;真正的 schema 变更只通过一次已批准的
[publish](./publish-and-receipts)到达生产,绝不靠提升分支。
:::

## 控制面是 Host 的事

分支需要 provider 的控制面——对 Neon 是一个 API key 和一个 project id——它住在
`@pneuma-framework/adapter-neon` 参考 adapter 后面,而非框架核心。框架拥有那个*想法*
(preview 用完即弃;改 schema 的变更对着隔离的真实形状数据演练)与那个*顺序*;让分支
廉价的 provider,和其他每个效应一样,是 [Host 拥有的](/zh/architecture/boundaries)。

这就走完了循环。要退回到 agent 真正操作的领域模型,从[两种变更模型](./change-models)
开始。
