# 问题与模型

## 问题

一类新产品正在出现:你**通过与 agent 对话来创建应用**。你描述想要什么,agent 塑造
schema、UI、行为;你预览、在对话中打磨、发布,出问题时回滚。

每个做这类产品的团队都在重写同一套管道:

- 把对话变成具体改动的 **agent 循环**,
- 带版本、草稿、diff、checkpoint 的**工作区**,
- 一个可安全丢弃的**预览**,
- 一条**受治理的变更**流程——提议、审查、批准、应用——使 agent 无法静默破坏应用,
- 带真实持久化与真实部署目标的**发布 / 回滚**。

这部分微妙且容易出错(改动何时算"完成"?回滚时数据怎么办?怎么防止 agent 改到线上
应用?)。`pneuma-framework` 拥有这部分,把产品——栈、领域、UI——留给你。

> **类比。** `pneuma-framework : React :: Creation Host : 一个 app-builder 产品 ::
> Generated Application : 该 builder 产出的 app。` 框架是原语;Creation Host 与其
> generated app 是产品。

## 四层模型

![Framework → Creation Host → Generated Application → Published Application,以及 Developer / Builder / End User 三种角色](/diagrams/four-layer-model.png)

在你做的每件事里都让这个模型保持清晰。它是第一页的心智模型:

```text
pneuma-framework      原语、治理、agent 循环、契约
  → Creation Host     你用框架构建的、面向 Builder 的产品
    → Generated App   Builder 在 Host 里创建并演进的应用
      → Published App  End User 打开的、已发布的活动版本
```

| 层 | 是什么 | 拥有 |
|---|---|---|
| **pneuma-framework** | 库/运行时——本仓库。 | 原语、受治理循环、契约。 |
| **Creation Host** | Developer 构建的、面向 Builder 的产品。 | 项目创建、profile、预览、检视、发布、监控、回滚。 |
| **Generated Application** | 通过 Host 创建的应用。 | 自身的定义、数据、运行时形态、版本、发布历史。 |
| **Published Application** | End User 打开的已发布版本。 | 活动发布。 |

不要把这些坍缩回"一个开发者写了个 pneuma app"。任务若说 *"那个 pneuma app"*,先判定
它指 **Creation Host**、**Generated Application** 还是 **Published Application**,
再设计工作。

## 三种人群(可以是一个人)

```text
Developer  构建或配置 Creation Host
Builder    用 Creation Host 创建并演进 Generated Application
End User    使用 Published Application
```

在个人场景(有人给自己做个番茄钟)里三者坍缩为一人。在企业 SaaS 场景里往往是三种
不同群体。框架始终提供构建期与 Builder 对话的 **Build-phase Agent**;Published App
里是否内嵌 **Runtime Agent** 是 Host/profile 的决定。

## 主旨

一句话承载整个设计:

> **框架拥有时序与治理;Host 拥有一切副作用。**

那些"副作用"——跑 agent、构建、迁移、部署、UI、数据——全是你的,以闭包与 adapter
提供。框架拥有**顺序**与**门禁**:草稿何时成为提案、提案何时可被应用、发布必须产出
什么证据、回滚动什么不动什么。

正是这一处反转,让框架有价值却不绑架你。接下来两页把它具体化:
**[受治理循环](./governed-loop)** 是主心骨,**[边界与所有权](./boundaries)** 是
判断什么归哪里的判据。
