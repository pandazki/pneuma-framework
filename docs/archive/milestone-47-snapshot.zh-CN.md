# Milestone 47 Snapshot

**Milestone:** M47，Product Host Expansion
**状态：** Closed
**日期：** 2026-05-17
**收尾补充：** 2026-05-20
**English version:** [milestone-47-snapshot.md](./milestone-47-snapshot.md)

## 决策

M47 保留 M46 的产品型 Creation Host，但把它扩展到足够从外部用户视角 review。

M46 证明 Dev Board Builder 可以 create、evolve、preview、publish、share、fork、use 一个 Generated Application。M47 问的是更尖锐的问题：

```text
如果 Alice 构建了这个 Creation Host，
Bob 和 Charlie 能不能理解自己正在做什么，
他们能不能看到系统到底是哪一层发生了变化，
我们能不能判断哪些能力应该进入 framework，哪些应该由 Host product 完成？
```

现在答案更清楚了，但这条线也应该关闭。Dev Board Builder 应作为压力样本，而不是下一阶段真实产品地基。

## 变化内容

### Alice 的契约变得可见

workbench 展示了 framework concern 和 Alice 的 Host choices 之间的边界：

- framework-owned：BuildThread transcript、code-change review packet、approval route evaluation、preview data rehearsal receipt、release rollout state；
- Host-owned：Dev Board domain modules、generated-app runtime UI、local SQLite workspace layout、share artifact surface，以及 provider-specific mappings。

这很重要，因为 Creation Host 不只是一个 app builder UI。它是 Developer 对 Build-phase Agent 能改什么、Host 必须验证什么的产品化表达。

### Bob 和 Charlie 拥有产品 lineage

产品显式展示四层路径：

```text
Alice ships the Creation Host contract
  -> Bob creates / evolves / publishes
  -> Charlie installs or forks the shared artifact
  -> End Users open the active published release
```

app 展示了 version cards、fork source、active version、current working version、preview URL 和 published URL。这样 Builder preview 和 End User release 更容易区分。

### Generated App 变成可交互应用

生成的 Dev Board runtime 不再只是只读：

- End User 可以新增 item。
- item 可以推进 status。
- item 可以提升到 P1。
- preview app 点击只写入 preview data copy。
- published app 点击写入 active published app data。

收尾迭代还加入了一条受控 runtime extension lane：

- `src/board.json` 描述 modules、fields、theme 和 sample data。
- `src/runtime.json` 描述 app-specific item actions。
- 一个真实 opencode 任务向 `src/runtime.json` 添加了 `edit_owner`。
- published app 随后允许修改 item owner。

这是有意义的压力结果，因为它证明真实 Build-phase Agent 可以通过受治理的 source boundary 改变 generated-app behavior。但它不证明任意 runtime code editing。

### Rollback 变成产品动作

workbench 有 rollback action。浏览器 E2E 发布 v0，演进到 v1，分享 v1，然后把 Bob 回滚到 v0，同时 Charlie 仍然可以 fork v1 artifact。这个区别很关键：

```text
release rollback changes Bob's active Published Application
share artifact lineage remains a portable artifact decision
```

## 收尾证据

最终 scope 应该这样理解：

```text
M47 proves a product-shaped Creation Host pressure sample
  -> with controlled generated source artifacts
  -> with real opencode proposal generation
  -> with Builder approval and execution receipts
  -> with preview/publish/share/fork/rollback evidence
```

不应该这样理解：

```text
M47 proves a complete real Creation Host product
M47 proves arbitrary React/TypeScript generated runtime editing
M47 proves production identity, provider OAuth, cloud deploy, or marketplace transport
```

## 外部视角 E2E

浏览器和脚本验证覆盖了这些产品路径：

```text
Bob creates Engineering Dev Board
  -> publishes v0
  -> asks agent for review queue
  -> Builder approval applies the governed proposal
  -> preview v1 shows Review queue and needs_review data
  -> publish v1
  -> share v1
  -> rollback Bob active release to v0
  -> Charlie forks Bob's v1 artifact
  -> Charlie evolves a separate lineage
  -> preview and publish Charlie's version
  -> End User uses the published app
```

最终真实 agent 收尾证据：

```text
Builder request: allow direct owner editing
opencode changed: src/runtime.json
proposal: Add direct owner editing to the Dev Board
runtime action: edit_owner
approval: Builder approved
published check: owner changed from Bob to Alice through the app runtime
```

## 边界 Review

### 更像 framework 应该拥有的部分

扩展后的流程说明这些能力具有 framework / Host Kit 复用价值：

- BuildThread 以及 proposal / decision / execution receipt transcript。
- Code-change review packets 和 approval route evaluation。
- generated artifacts 的 controlled source-boundary validation。
- 发布数据影响型变更前的 preview data rehearsal。
- 用于交互式 runtime 检查的 preview data copy semantics。
- Release rollout state、active/previous version tracking 和 rollback receipts。
- Creation Host 可复用的 version / lineage projection helper。
- proposal 前、apply 前、apply 后的 guardrail hooks。

### 应继续由 Host 拥有的部分

这些应保持为 Developer / Host product choices：

- Dev Board domain model 和 item lifecycle。
- Generated-app runtime UI 和 app-specific interactions。
- `src/board.json` 和 `src/runtime.json` schema choices。
- share/fork 的具体产品表面和文案。
- GitHub attention 这类 provider-specific mapping。
- SQLite workspace layout 和 local process implementation。
- Host 使用 deterministic draft logic、opencode、Anthropic direct，还是其他 backend。

### 当前产品缺口

最大的剩余缺口已经不是继续打磨这个 example。下一步更有价值的是基于干净产品 brief 启动一个新的真实 Creation Host example。

M47 已知限制：

- identity 仍然是 demo selector；
- credentials 和 provider auth 仍然是 mock 或 public-data only；
- deployment 仍然是 local process；
- Published Application 内没有 Runtime Agent；
- generated app runtime editing 是受控 JSON extension，不是任意 UI/code editing；
- Dev Board 产品适合压力测试，但太窄，不适合作为下一阶段地基。

## 验证

focused example suite：

```bash
bun test ./examples/product-creation-host/product-host.test.ts ./examples/product-creation-host/ui-state.test.ts ./examples/product-creation-host/dev-board-domain.test.ts ./examples/product-creation-host/server-preview.test.ts
```

结果：

```text
14 pass / 0 fail
```

diff hygiene：

```bash
git diff --check
```

结果：

```text
clean
```

真实 opencode evidence：

```text
changed_files: ["src/runtime.json"]
runtime action: edit_owner
published owner patch: Bob -> Alice
```

## 下一步

停止继续扩展 Dev Board Builder。把 M47 当作证据，然后从产品 brief 重新启动一个真实 Creation Host example：

```text
不是“怎么把这个 demo 继续美化？”
而是“什么产品能让 Alice 真的交付，让 Bob 真的创造有用的软件？”
```

下一版 example 应该吸收 M47 的经验，尤其是 controlled source boundary、preview data copy、proposal packet、real-agent feedback，以及 Builder workbench 和 Published Application 的清晰分离。
