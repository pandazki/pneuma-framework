# 构建一个受治理的项目

本指南端到端构建一件事:一个 Creation Host,Builder 在其中通过与代码代理对话来创建并
演进一个真实的全栈应用——然后把它发布到真实数据库与真实云部署,每次改动都经审查、可
回退。

我们跟随仓库里的一个完整范例:

```text
examples/clean-room-release-board   Generated Application 脚手架
examples/clean-room-release-host    Creation Host studio
```

## 我们在构建什么

Builder("Bob")打开 Host,创建一个 **Release Operations Board**——一个全栈应用(Bun
+ Hono + React + Drizzle + Zod、Neon Postgres、Vercel)。`v0` 已经可用。Bob 可以预览、
发布,或让 Build-phase Agent 演进它——加字段、加表、加端点、改 UI 风格。每次演进在他
看到之前都被检查,只有批准才应用,并带结构化回执发布。End User 打开 Published App,
永远看不到构建循环。

## 工作的形状

这个范例是按一个真实项目的顺序构建的,本指南也照此组织:

1. **[Generated App](./generated-app)** —— *构思 → 设计。* 定义应用及其 **profile
   契约**:editable 与 protected roots、`verify` 门禁、部署目标。这是 Developer 的活;
   在任何 agent 接手之前,先证明脚手架是个有用、完整的 `v0`。
2. **[Creation Host](./creation-host)** —— *设计 → 实现。* 通过**消费**框架来组装受
   治理循环:用 Host Kit 拿工作区 + 提案骨架,用 reference adapter 拿代码代理、部署与
   数据库分支。
3. **[端到端](./end-to-end)** —— *真跑一遍。* 创建 → 在数据库分支上预览/预演 → 用真实
   代码代理演进 → 审查 proposal → 批准并应用 → 发布到云 → 回滚。并带上沿途采集的真实
   证据。

## 要带着的原则

你会注意到 Host 大多是**把闭包接到框架契约上**,而非重新实现管道。这正是要点:真实
Host *消费*受治理循环与 adapter,而非重新推导。一路上把
[所有权判据](/zh/architecture/boundaries)放在眼前——栈、领域、UI 是你的;时序与门禁
是框架的。
