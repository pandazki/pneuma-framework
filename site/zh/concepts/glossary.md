# 术语表

框架只靠一小撮词,但每个都有确切含义。这一页是它们各自的一句话版本——足够你读任何
其它页时不卡壳。每条都链到它被完整讲清的地方。

## 四层与三类人

**pneuma-framework** —— 本仓库这个库/运行时:原语、受治理循环、那些契约。你构建*于其上*
的东西,而非你交付的产品。→ [模型](/zh/architecture/)

**Creation Host** —— 你(Developer)用框架构建的、面向 Builder 的产品。它掌管项目创建、
预览、检视、发布与回滚。→ [模型](/zh/architecture/)

**Generated Application** —— Builder 在 Host *内部*创建并演进的应用。它拥有自己的定义、
数据、版本与发布历史。

**Published Application** —— Generated App 的某个版本,对 End User 上线的那一个。

**Developer / Builder / End User** —— 谁构建 Host / 谁在里面靠对话造应用 / 谁打开已发布的
那一版。单人项目里是一个人,SaaS 里是三拨人。
→ [三类人](/zh/architecture/)

**Build-phase Agent** —— 构建期间与 Builder 对话的那个 agent,框架始终提供。它不同于
**Runtime Agent**——后者是否随 Published App 一起面向 End User,由 Host 决定。

## 受治理循环,逐步看

**profile** —— Developer 编写的一组选择(栈、部署目标、agent backend)加一份 scaffold,
打包成"一创建就得到一个完整可跑的 `v0`"。→ [Profile 与 scaffold](./profile-and-scaffold)

**scaffold** —— generated app 的初始源码树,附一份 manifest,声明 agent 能碰什么、不能
碰什么。→ [Profile 与 scaffold](./profile-and-scaffold)

**writable roots / protected paths** —— scaffold 里 agent 可改的部分,和它绝不能动的部分
(框架接线、部署配置、manifest 自身)。scaffold manifest 把它们叫 `writable_roots` /
`protected_paths`;示例 Host 的 profile 里可能把同一概念写作 `editableRoots` /
`protectedRoots`。→ [Profile 与 scaffold](./profile-and-scaffold)

**draft** —— active 版本的一份用完即弃的副本,供 agent 编辑。线上应用永远不是 agent 的
工作区。→ [Draft 与 verify gate](./verify-gate)

**verify gate** —— scaffold *自带*的检查(类型检查 + 测试 + 构建),draft 必须先过它才能
成为 proposal。这不是框架强加的 linter,而是判定"完成没有"的唯一门禁。
→ [Draft 与 verify gate](./verify-gate)

**proposal** —— 一个人能批准的、受检的、单意图的变更:改了哪些路径、一份可读 diff、
verify 输出、以及 schema/bundle 的增量。一句话 → 一个 proposal。
→ [Proposal 与证据](./proposal-and-evidence)

**apply** —— 批准*之后*,把 active 指针挪到一个新的不可变版本。人点头前绝不发生任何
改动。→ [Apply 与版本](./apply-and-versions)

**version(`vNext`)** —— generated app 源码在磁盘上的一份不可变快照。apply 造出下一份,
active 指针挪过去,旧的留在原地。→ [Apply 与版本](./apply-and-versions)

**publish** —— 先迁移 schema,*再*服务新版本,并返回一份结构化回执。先迁移后服务,
顺序不可颠倒。→ [Publish 与回执](./publish-and-receipts)

**receipt(回执)** —— 一次 publish 产出的结构化记录:目标、版本、URL、持久化、部署 id、
schema。它是*发生了什么*的凭据,而非一行日志。→ [Publish 与回执](./publish-and-receipts)

**rollback** —— 把 active 指针挪回先前版本。只回滚代码:数据与线上部署**不会**自己回去。
→ [Rollback 语义](./rollback)

**preview / 数据演练** —— 一个绝不写生产数据的、用完即弃的运行时;改 schema 时,用真实
数据的一份写时复制分支,让你把迁移先演练一遍。→ [Preview 与数据演练](./preview-and-rehearsal)

## 领域模型

**定义即数据(definition-as-data)** —— 应用的结构(表、列、operation、view、policy)以
受治理的*行*存在系统表里,而非代码迁移。改结构走的是和改数据同一条管线。
→ [定义即数据](./definition-as-data)

**两种变更模型(Lane A / Lane B)** —— Lane A 改*定义数据*(行,经 `definition.apply`);
Lane B 改*源码*(文件,经 draft → verify → proposal → apply)。判别法:它是框架建模的
结构原语,还是开放式源码?→ [两种变更模型](./change-models)

**Operation** —— 一份声明同时变成 UI 按钮、agent 工具、审计事件与策略检查点。
→ [定义即数据](./definition-as-data)

**BuildThread** —— 框架拥有的、构建对话的语义记录(意图、proposal、决策、回执)。它是
可移植的事实源;agent backend 自己的会话只是缓存。→ [BuildThread](./build-thread)

## 容易绊住人的词

**effect(副作用 / 职责)** —— "Host 掌管一切 effect"里,指*真正发生的事*:跑 agent、构建、
迁移、部署、UI、数据。不是函数式编程里"副作用"那个意思。框架掌管*次序*与*门禁*,
effect 归你。

**fail-closed(失败即关闭)** —— 信号缺失或含糊时,宁可拦下,也不假定成功。超时不算成功;
没跑起来的检查,就是没通过。

**forward-compatible(向前兼容的读取)** —— 代码只取它认识的列,于是新版本加的多余列被
直接忽略——这正是"只回滚代码"得以安全的原因。

**additive migration(增量迁移)** —— 只做*加法*(加一列、加一张表)、幂等、且只向前的
schema 变更。破坏性变更从不属于常规变更的一部分。

**stale base(过期基线)** —— proposal 的证据是对着 active 源码的某份快照算出来的;若 apply
前源码已漂移,proposal 会被拒,而不是拿一个已不成立的基线去 apply。
