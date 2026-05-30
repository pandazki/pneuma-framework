# 从目标往下构建一个 Host

理解框架最快的方式,是用它构建一个 Creation Host。本指南正是如此——但不是自底向上从
原语堆起,而是按真实项目的方式来:**从目标出发,再往下走**到实现它的那些决策。

## 从目标出发

这是我们将要建成的东西:

![一个 Creation Host studio,Builder 与 agent 对话,带 Preview/Approve/Publish/Rollback 控件,发布到一个 Neon 支撑、End User 打开的线上 Release Operations Board](/diagrams/guide-goal.png)

一个 Builder("Bob")打开一个 studio,创建一个 **Release Operations Board**——一个真实的
全栈应用。`v0` 已经能用。Bob 预览它,然后请一个代码代理演进它——*"给每个 release 加一个
environment 字段"*——改动在他看到之前就被检查,只有他批准才应用,然后被发布到一个由真实
数据库支撑的真实云 URL。End User 打开那个 Published App,从不看见构建循环。出错时,Bob
回滚。

这就是整个产品。下面的一切,是从*那张图*到*运行的代码*的路径——而这条路径的大部分是
**选择**与**接线**,不是发明。

## 往下的路径

我们经五个阶段下降。每个阶段回答它上一阶段提出的一个问题:

| 阶段 | 它回答的问题 |
|---|---|
| **[1 · 范围与选型](./scope-and-stack)** | 产品里有什么,用什么栈来实现? |
| **[2 · 设计 Generated App](./generated-app)** | agent 能安全演进的那个有界 `v0` 是什么? |
| **[3 · 组装 Host](./creation-host)** | 怎么通过*消费*框架来接出受治理循环? |
| **[4 · 跑通循环](./end-to-end)** | 它真能对着真实服务端到端工作吗? |

我们跟随的 example 在仓库里随附,所以每条主张都可运行:

```text
examples/clean-room-release-board   Generated Application 脚手架
examples/clean-room-release-host    Creation Host studio
```

## 一路带下去的原则

一路往下,把一句话放在眼前:

> **框架拥有时序与治理;你拥有每一个副作用。**

你会注意到,Host 大多是**接到框架契约上的闭包**,而非重新实现的管道。栈、领域、UI 是
你的;循环的顺序与门禁是框架的。如果你某刻觉得自己在*重新推导*受治理循环,停下——你本该
*消费*它。[所有权 litmus 判据](/zh/architecture/boundaries)就是分辨两者的工具。

开始下降 → **[1 · 范围与选型](./scope-and-stack)**
