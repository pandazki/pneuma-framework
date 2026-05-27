# Milestone 50 快照

**Milestone:** M50, Workflow App Studio Lifecycle UX Hardening
**状态：** 已关闭
**日期：** 2026-05-27
**英文版：** [milestone-50-snapshot.md](./milestone-50-snapshot.md)

## 决策

M50 没有新增 framework primitive。它的目标是让 M48/M49 的 example 真正像一个 Creation Host，而不是技术演示控制台。

产品边界是：

```text
Builder surface
  -> 向 Build-phase Agent 提出变更
  -> 看到理解、proposal、证据、生命周期控制

Generated Application surface
  -> 作为 preview 或 published app 独立运行
  -> End User 使用时打开自己的 route
```

这件事重要，因为 example 应该通过交互本身解释四层模型，而不是依赖旁边堆很多说明文字。

## 变更内容

Workflow App Studio 现在把 build loop 表达为两个清晰表面：

- 左侧是 Generated Application runtime surface；
- 右侧是 Builder conversation 和 approval workflow；
- 故事和背景材料退到次级位置，不再主导交互；
- lifecycle buttons 会根据状态启用/禁用，而不是一直可点的 demo 按钮；
- preview 和 published use 是不同动作；
- raw code-agent logs 可以检查，但不会压垮主流程；
- 中文和英文 UI 路径都可用。

M50 也清理了固定 Host evidence、proposal 文案、generated-app labels、workflow fields、stage labels、action labels 和 runtime route text，让中文同事可以直接阅读同一条流程。

## 为什么需要这一步

M50 之前，example 技术上能演示闭环，但体感仍像 demo console。这会让几个项目边界变得难懂：

- Builder 不是 End User。
- Builder approval 不是 app 使用。
- Preview 不是 publish。
- Host 拥有 lifecycle controls。
- Generated Application 应该像真实 app surface，而不是 inline artifact dump。

M50 把这些边界收进交互本身。

## 验证

Workflow App Studio tests：

```bash
bun test examples/workflow-app-studio/workflow-studio.test.ts examples/workflow-app-studio/workflow-app.test.ts
```

结果：

```text
14 pass
0 fail
85 expect() calls
```

UI bundle：

```bash
bun build examples/workflow-app-studio/src/ui/App.tsx --target browser --outfile /tmp/workflow-app-studio-m50.js
```

结果：

```text
browser bundle built successfully
```

Browser checks 覆盖：

```text
create project
ask code agent
inspect progress
approve proposal
start preview
publish
open published app route
create a published runtime record
switch Chinese UI copy
```

## 边界 Review

### Framework-Relevant Learning

- Creation Host example 需要可见 lifecycle state，而不是只有 working endpoints。
- Agent progress 应该作为结构化产品证据暴露，而不只是 raw logs。
- Approval 应该在 Builder conversation/workflow 中出现，而不是分离的 admin panel。
- Preview/publish 分离是解释产品模型的关键。

### Host-Owned

- 视觉设计系统。
- Product copy 和本地化。
- 具体 generated-app rendering。
- 暴露多少 raw backend log detail。
- Host 使用 React、vanilla JS、shadcn 或其他 UI stack。

## 不声明什么

M50 不声明已经有最终 design system 或 production-grade UI kit。它声明的是：reference example 已经足够清楚地展示 Creation Host / Generated Application / Published Application 的边界，可以用于团队 review 和后续产品压力测试。
