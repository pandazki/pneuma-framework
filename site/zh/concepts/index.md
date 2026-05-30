# 概念深入

[架构](/zh/architecture/)章节给你高层轮廓:[四层模型](/zh/architecture/)、
[受治理循环](/zh/architecture/governed-loop),以及框架与 Host 之间的
[边界](/zh/architecture/boundaries)。知道框架*做什么*,那一章就够了。

这一章讲*怎么做*。在总览里读作一个词的每个概念——"proposal""verify""rollback"
"publish"——凑近看,都是一个有自己不变量、自己失败模式、自己存在理由的小领域模型。
[回滚](./rollback)页是这种处理方式的范本:一个动词,三层,三个不同的答案。

::: tip 先读总览
这些页面假设你已读过[受治理循环](/zh/architecture/governed-loop)。它们不重述循环,
而是钻到每一步*底下*。
:::

## 两种"怎么做"

深入内容分两组,因为有两类值得理解的"怎么做"。

![受治理循环坐落在一套领域模型之上:上层是 profile、draft、proposal、版本、回执;下层是 BuildThread、定义即数据、operation、语义工具](/diagrams/concepts-map.png)

### 循环细节

沿受治理循环一步步走,看每一步实际保证了什么:

- **[Profile 与 scaffold](./profile-and-scaffold)** —— Developer 编写的源码边界,
  让一个 generated app 可以被 agent 安全触碰。
- **[Draft 与 verify gate](./verify-gate)** —— 为什么 draft 永远不是线上应用,
  以及为什么 scaffold 自带的 `verify` 是唯一重要的门禁。
- **[Proposal 与证据](./proposal-and-evidence)** —— 是什么把 agent 的编辑变成
  一个人能做的、受检的、单意图的决策。
- **[Apply 与版本](./apply-and-versions)** —— 批准如何变成不可变的 `vNext`,
  以及采集了哪些观察证据。
- **[Publish 与回执](./publish-and-receipts)** —— 迁移、结构化回执,
  以及为什么"已部署"不等于"可访问"。
- **[Rollback 语义](./rollback)** —— 三层,而非一层。
- **[Preview 与数据演练](./preview-and-rehearsal)** —— 一个用完即弃的运行时,
  以及改 schema 的变更如何对真实数据演练。

### 领域模型细节

循环底下,坐着框架里与磁盘文件无关的那部分——Build-phase Agent 真正操作的
受治理数据模型:

- **[两种变更模型](./change-models)** —— 最重要的那条区分:改*定义数据* vs
  改*源码*,以及各自何时适用。
- **[定义即数据](./definition-as-data)** —— app 结构(表、operation、view、policy)
  作为受治理的行而非迁移;以及把 UI 与 agent 工具从一个声明统一出来的 Operation 原语。
- **[BuildThread](./build-thread)** —— 框架拥有的语义记录,是整段对话的可移植
  事实源,独立于任何 agent backend。
