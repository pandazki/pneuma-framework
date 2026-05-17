# Milestone 47 Snapshot

**Milestone:** M47，Product Host Expansion
**状态：** Closed
**日期：** 2026-05-17
**English version:** [milestone-47-snapshot.md](./milestone-47-snapshot.md)

## 决策

M47 保留 M46 的产品型 Creation Host，但把它扩展到足够从外部用户视角 review。

M46 证明 Dev Board Builder 可以 create、evolve、approve、preview、publish、share、fork、use 一个 Generated Application。M47 问的是更尖锐的问题：

```text
如果 Alice 构建了这个 Creation Host，
Bob 和 Charlie 能不能理解自己正在做什么，
他们能不能看到系统到底是哪一层发生了变化，
我们能不能判断哪些能力应该进入 framework，哪些应该由 Host product 完成？
```

现在答案更清楚了。

## 变化内容

### Alice 的契约可见

workbench 现在展示 “Alice's contract / Host boundary” 面板。它说明：

- framework 拥有什么：BuildThread transcript、code-change review packet、approval route evaluation、preview data rehearsal receipt、release rollout state；
- Alice 的 Host 拥有什么：Dev Board domain modules、generated-app runtime UI、SQLite workspace layout、share artifact surface、public GitHub attention mapping。

这很重要，因为 Creation Host 不只是一个 app builder UI。它是 Developer 对 Build-phase Agent 能改什么、Host 必须验证什么的产品化表达。

### Bob 和 Charlie 有产品 lineage

选中的 project 现在有 external story panel：

```text
Alice ships the Creation Host contract
  -> Bob creates / evolves / publishes
  -> Charlie installs or forks the shared artifact
  -> End Users open the active published release
```

app 还展示 version cards、fork source、active version、current working version 和 published URL。这样 Builder preview 和 End User release 不再混在一起。

### Generated App 更像真实可用的应用

生成的 Dev Board runtime 不再只是只读：

- End User 可以新增 item，并指定 owner。
- item 可以推进 status。
- item 可以提升到 P1。
- review queue 和 priority lane 的变化会同时体现在 app、schema、data、version 面板里。

它仍然刻意保持小，但已经更像真实应用，而不是单纯证明屏幕。

### Rollback 变成产品动作

workbench 现在有 rollback action。浏览器 E2E 会发布 v0，演进到 v1，分享 v1，然后把 Bob 的 active release 回滚到 v0，同时 Charlie 仍然可以 fork v1 artifact。这个区别很关键：

```text
release rollback 改变 Bob 的 active Published Application
share artifact lineage 仍然是一个 portable artifact 决策
```

## 外部视角 E2E

完整流程通过真实 Chrome UI 完成：

```text
Bob creates Engineering Dev Board
  -> publishes v0
  -> asks agent for review queue
  -> Bob approval is recorded but blocked
  -> reviewer approves
  -> preview v1 shows Review queue and needs_review data
  -> publish v1
  -> share v1
  -> rollback Bob active release to v0
  -> Charlie forks Bob's v1 artifact
  -> Charlie asks for GitHub attention + priority lane
  -> reviewer approves
  -> preview v1 shows GitHub attention, Priority lane, and Review queue
  -> publish Charlie v1
  -> End User adds "Review Linux deploy target"
  -> End User advances the new item to doing
```

这条产品差异现在不需要 scenario-only buttons 就能看懂：Alice 定义 Host contract，Bob 构建和运营 Generated Application，Charlie 从 share artifact fork，End User 使用 Published Application。

## 边界 Review

### 更像 framework 应该拥有的部分

扩展后的流程说明这些能力具有较强的 framework / Host Kit 复用价值：

- BuildThread 以及 proposal / decision / execution receipt transcript。
- Code-change review packets 和 approval route evaluation。
- 发布数据影响型变更前的 preview data rehearsal。
- Release rollout state、active/previous version tracking 和 rollback receipts。
- Creation Host 可复用的 version / lineage projection helper。
- 文档化的 Developer responsibility map，即使最终产品展示仍由 Host 拥有。

### 应继续由 Host 拥有的部分

这些应保持为 Developer / Host product choices：

- Dev Board domain model 和 item lifecycle。
- Generated-app runtime UI 和 app-specific interactions。
- share/fork 的具体产品表面和文案。
- public GitHub attention mapping 以及任何 provider-specific semantics。
- SQLite workspace layout 和 local process implementation。
- Host 使用 deterministic draft logic、opencode、Anthropic direct，还是其他 backend。

### 当前产品缺口

最大的剩余缺口不是再发明一个 primitive，而是产品完整度：

- identity / profile selection 仍然是 demo selector；
- credentials 和 provider auth 仍然是 mock 或 public-data only；
- deployment 仍然是 local process；
- Published Application 内没有 Runtime Agent；
- generated app UI 仍然刻意简单。

这些缺口现在更容易讨论，因为四层边界已经在产品里显性化了。

## 验证

focused suite：

```bash
bun test ./examples/product-creation-host/product-host.test.ts ./examples/product-creation-host/ui-state.test.ts
```

monorepo typecheck：

```bash
bun run typecheck
```

browser E2E：

```bash
PORT=8897 PNEUMA_PRODUCT_HOST_WORKSPACE=/tmp/pneuma-product-host-m47-browser \
bun run --cwd examples/product-creation-host serve
```

浏览器流程使用真实 UI interaction，不依赖 scenario-runner button。

