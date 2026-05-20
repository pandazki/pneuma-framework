# 真实 Creation Host Example Brief

**状态：** M48 implemented brief，真实 opencode code-agent E2E 已完成
**English version:** [real-creation-host-example.md](./real-creation-host-example.md)

M47 已经把 Dev Board Builder 作为压力样本关闭。下一版 example 不应该继续打磨这个样本，而应该从 Alice 真的可能交付的产品开始。

选定产品是 **Workflow App Studio**。

## 产品论点

Alice 构建一个用于小型业务流程应用的 Creation Host。Bob 用它创建 Vendor Intake Portal。Charlie 可以把 Bob 分享的 artifact fork 成另一个 workflow app。End User 使用 published app，不需要看到 Builder workbench。

这个 example 应证明这条链：

```text
pneuma-framework
  -> Workflow App Studio
  -> Vendor Intake Portal
  -> published Vendor Intake Portal vN
```

## 为什么是这个产品

Workflow apps 比继续做另一个 board 更适合作为真实 Creation Host 压力目标：

- 它们有真实领域语义：fields、forms、queues、stages、actions、role gates 和 history；
- stages 或 fields 变化时会强迫 data carry-forward；
- actions 会修改 records，因此 preview 变得有意义；
- End User 需要稳定 workflow surface，因此 publish 变得有意义；
- Charlie 可以把同一个 artifact 改造成另一套流程，因此 fork 变得有意义。

## 第一版 App 故事

```text
Bob: "I need a vendor intake portal for software and service purchases."

v0:
  Vendor request form
  Submitted and Business review queue
  Approve / reject actions
  Record detail and history

Bob later asks:
  "Add legal review before approval and require contract value for high-risk vendors."

v1:
  legal_review stage
  contract_value field
  send_to_legal_review action
  legal_approve action
  existing records carried forward
```

## 验收标准

M48 垂直切片已完成，因为浏览器用户现在可以做到：

1. 创建一个 Workflow App Studio project。
2. 请求 Build-phase Agent 添加 legal-review change。
3. Review agent interpretation、precise proposal、source diff、opencode log 和 data carry-forward evidence。
4. 以 Builder 身份批准 change。
5. 将 preview 作为独立 app 页面打开。
6. 在 preview 中创建或流转 workflow records，且不影响 published data。
7. 发布一个 version。
8. 以 End User 视角打开 published app。
9. 导出 no-secret share artifact。
10. 将 artifact fork 成第二个 app，并独立演进。

当前验证证据：

- Unit/domain tests：`bun test --cwd examples/workflow-app-studio`。
- Browser E2E：Playwright 驱动本地 Host 完成 create、preview、publish、runtime record mutation、legal-review evolution、v1 publish、share artifact export、fork，以及 fork 的独立 SLA evolution。
- 本地验证截图：`/tmp/workflow-app-studio-e2e.png`。
- 真实 opencode E2E：`PNEUMA_WORKFLOW_STUDIO_AGENT=opencode` 驱动两次 code-agent change，只修改 `src/app.ts`：legal review 和 SLA tracking。两次 change 都产出 review packet，通过 guardrails，需要 Builder approval，发布后 runtime 出现新增 fields/views。
- 本地验证截图：`/tmp/workflow-real-opencode-e2e-8908.png`。

## 非目标

M48 不应尝试：

- production login；
- hosted credential storage；
- real OAuth provider setup；
- cloud deployment；
- marketplace transport；
- 超出受控 `src/app.ts` patch module 的任意 generated React/TypeScript editing。

自动化测试仍保留 deterministic 和 fake-backend draft path，以保证可重复。milestone close-out 也证明了真实 opencode CLI path 可以在 Host guardrails 下修改 Generated App source。backend-opencode SDK/session adapter 仍是后续工作，因为这次收口时它的 completion semantics 对 code-change lane 还不够可靠。

第一版仍应使用受控 Generated App source，但 source 应比 Dev Board 更丰富：

```text
src/app.ts
```

## 设计规则

每个实现决策都应该回答：

```text
这是否帮助 Alice 构建 Creation Host 产品，
还是只是让另一个 demo 更容易串起来？
```

如果它只帮助 demo，就不要把它提升成 framework-facing design。
