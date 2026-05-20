# Workflow App Studio

**状态：** M48 真实 Creation Host example，第一条切片进行中
**English version:** [README.md](./README.md)

Workflow App Studio 是 Product Creation Host 压力样本关闭之后的新 example。它从干净的产品 brief 开始，而不是继续扩展 Dev Board Builder。

Alice 作为 Developer，交付一个用于构建小型业务流程应用的本地 Creation Host。Bob 作为 Builder，用这个 Host 创建真实应用，例如 **Vendor Intake Portal**。Generated Application 拥有 forms、queues、record detail、stages、role-gated actions、preview data、publish state、share artifacts 和 fork lineage。Charlie 可以 fork Bob 分享的 app，并演进出自己的独立版本。

## 产品目标

这个产品不是“让 agent 任意改文件”。这个产品是：

```text
Builder describes a business workflow
  -> Build-phase Agent proposes a workflow app shape
  -> Builder reviews source diff, data migration, and runtime impact
  -> Host applies the change through guarded lanes
  -> Builder previews the generated app with disposable data
  -> Builder publishes a usable workflow app
  -> another Builder can fork the artifact and evolve a new lineage
```

它比 Dev Board 更适合作为下一阶段压力目标，因为 generated app 必须建模：

- entities 和 fields；
- forms 和 queues；
- stage graphs；
- role-gated actions；
- record history；
- workflow 变化后的 data carry-forward；
- preview data 和 published data 的不同语义。

## 第一条垂直切片

第一条切片刻意 domain-first、test-first：

```text
WorkflowAppDefinition
  -> fields
  -> stages
  -> actions
  -> views
  -> records
  -> transitions
  -> migration/carry-forward
```

当前覆盖的故事：

```text
Bob creates Vendor Intake Portal.
Bob asks the agent to add legal review before approval.
The definition gains legal_review, contract_value, and legal actions.
Existing records carry forward without data loss.
Runtime transitions enforce role and stage requirements.
```

运行当前切片：

```bash
bun test examples/workflow-app-studio/workflow-app.test.ts
```

## 验收目标

Workflow App Studio 最终应该支持一条端到端浏览器工作流：

1. Alice 的 Host 暴露 stack/profile 和 scaffold constraints。
2. Bob 从产品目标创建 Vendor Intake Portal。
3. Bob 请求 Build-phase Agent 做一个有意义的 workflow change。
4. Agent 修改受控 Generated App source，而不是 Host code。
5. Host 展示 interpretation、proposal、diff、migration impact 和 confirmation。
6. Builder approval 应用 proposal。
7. Preview 作为独立 app 页面打开，并使用 disposable data。
8. Published app 作为独立 End User 页面打开。
9. End User 创建 records，并通过 role-gated workflow actions 推进状态。
10. Bob 导出 no-secret share artifact。
11. Charlie fork artifact 成独立 app，并继续演进。

## 边界

Framework / Host Kit 应拥有：

- BuildThread 和 proposal receipts；
- source-boundary 与 guardrail orchestration；
- approval route evaluation；
- preview data rehearsal semantics；
- publish / rollback state；
- durable evidence vocabulary。

Workflow App Studio 应拥有：

- workflow app domain model；
- generated app renderer；
- local SQLite workspace layout；
- concrete profile choices；
- product copy 和 UX；
- 未来产品需要的 provider integrations。

## 目前还不声称什么

第一条切片还不包含 browser workbench、真实 opencode、publish routes、share/fork routes 或 generated runtime UI。它先建立 generated application's domain contract，再围绕它构建 Host surface。
