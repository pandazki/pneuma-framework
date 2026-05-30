---
layout: home

hero:
  name: pneuma-framework
  text: 通过与 agent 对话来构建应用
  tagline: >-
    AI 原生创造工具的基础设施。让 Builder 通过与 agent 对话来创建、演进、预览、
    发布、回滚一个真实应用——无需重新发明 agent 循环、工作区、checkpoint、预览与
    部署这些管道。
  actions:
    - theme: brand
      text: 理解模型
      link: /zh/architecture/
    - theme: alt
      text: 构建 Host
      link: /zh/guide/
    - theme: alt
      text: 面向 coding agent
      link: /zh/agents/

features:
  - title: 四层模型
    details: >-
      Framework → Creation Host → Generated Application → Published Application。
      框架拥有时序与治理;Host 拥有一切副作用——栈、领域、UI、数据、部署目标。
  - title: 一条受治理的循环
    details: >-
      从 profile 创建 → 预览 → code-agent 改 draft → verify 门禁 → proposal →
      批准/应用 → 发布 → 回滚。处处 fail-closed;scaffold 自带的 verify 即门禁。
  - title: 消费,而非重写
    details: >-
      Host Kit helper 与 opt-in reference adapter(Codex、Vercel、Neon)提供管道,
      让真实 Host 开箱即用——框架 core 永不依赖它们。
---

## 这是什么

![Framework → Creation Host → Generated Application → Published Application,以及 Developer / Builder / End User 三种角色](/diagrams/four-layer-model.png)

`pneuma-framework` 是 **Creation Host** 的原语层:一种面向 Builder 的产品,应用在
会话中通过与 Build-phase Agent 对话被共同创造,而不只是点选与编码。

> **类比:** `pneuma-framework : React :: Creation Host : 一个 app-builder 产品 ::
> Generated Application : 该 builder 产出的 app。` 框架是原语;Creation Host 与其
> generated app 是产品。

它**不是**一个应用模板,也不规定你的栈、领域、UI 或数据库。它给你那条**受治理的
循环**——那部分微妙且容易出错——把产品本身留给你。

## 四个入口

- **[架构](/zh/architecture/)** —— 自上而下:它解决什么问题、四层模型、受治理循环、
  以及边界落在哪里。
- **[概念](/zh/concepts/)** —— 深入:循环的每一步、每个领域原语(定义即数据、
  BuildThread、两种变更模型)凑近看,一次一张图。
- **[构建 Host](/zh/guide/)** —— 从一个成品往下到运行代码的目标驱动范例:范围、
  选型、profile、组装,以及对着真实代码代理 + 数据库分支 + 云部署的整条循环。
- **[面向 coding agent](/zh/agents/)** —— 给 Claude Code / Codex 构建或扩展 Host
  时用的路由器与规则清单。
