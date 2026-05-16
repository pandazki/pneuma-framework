# Milestone 46 Snapshot

**Milestone:** M46，Product Creation Host
**状态：** Closed
**日期：** 2026-05-16
**English version:** [milestone-46-snapshot.md](./milestone-46-snapshot.md)

## 决策

M46 关闭了第一版基于 M45 Host Kit 的产品型 Creation Host 压力验证。

M45 证明了可复用 implementation loop。M46 证明这条 loop 可以放进一个真正面向 Builder 的产品里，而不是退化成一键 demo：

```text
Developer builds a Creation Host product
  -> Builder creates and evolves a Generated Application
  -> Builder publishes a usable Published Application
  -> Builder shares a portable artifact
  -> another Builder forks, evolves, and publishes their own version
```

这个产品是 **Dev Board Builder**：

```text
examples/product-creation-host/
```

## 交付内容

### Product Workbench

workbench 是三栏 Creation Host：

- 左侧：project creation、project list、share artifacts；
- 中间：selected Generated Application、Builder conversation、proposal、approval route；
- 右侧：preview、schema、data、evidence、agent log inspection。

没有 scenario-runner buttons。每个 action 都对应真实 product operation：create board、ask agent、approve as current role、preview、publish、share、fork、use published app。

### Product Store

M46 使用真实本地存储：

```text
ProductHostStore
  -> SQLite via bun:sqlite
  -> projects
  -> versions
  -> pending_evolutions
  -> agent_logs
  -> share_artifacts
```

Generated app source 存在 Scaffold Project 中：

```text
projects/:appId/source/src/board.json
projects/:appId/draft
projects/:appId/published/:versionId/items.json
```

### Generated And Published Apps

Host 提供 preview 和 published routes：

```text
/preview/:appId
/app/:appId
```

published route 可以被 End User 使用。浏览器 E2E 打开了 `/app/charlie-s-dev-board`，并新增了一条可见 follow-up item。

### Share And Fork

share artifact 是 portable 且 no-secret 的。它包含：

- app/version references；
- board definition；
- source snapshot；
- init recipe；
- provider requirements。

Charlie 从 Bob 的 share artifact fork，然后通过同一条治理 lane 演进自己的版本。

### Real Code Agent

live code-agent path 使用：

```text
opencode + openrouter/anthropic/claude-opus-4.7
```

真实 agent 为两个不同 board 写入 draft `src/board.json`：

- Engineering Dev Board：增加 `review_queue`。
- Personal Focus Dev Board：增加 `priority_lane` 和 `github_attention`。

code agent 只写 draft。Host verification、review packet、reviewer approval、guarded apply、data rehearsal、preview、publish 和 evidence 仍然是 Host/Host Kit 的职责。

## Browser E2E Evidence

完整浏览器流程已通过 Chrome UI 完成：

```text
Bob creates Engineering Dev Board
  -> asks agent for review queue
  -> Bob self-approval is recorded but blocked
  -> Reviewer approves
  -> Host applies source/data change
  -> preview shows Review queue
  -> publish active v1
  -> share artifact exported
  -> Charlie forks artifact
  -> Charlie asks for GitHub attention + priority lane
  -> Charlie self-approval is recorded but blocked
  -> Reviewer approves
  -> preview shows GitHub attention + Priority lane
  -> publish active v1
  -> End User opens /app/charlie-s-dev-board
  -> End User adds "Follow up on Linux deploy target"
```

## 验证

focused test suite：

```bash
bun test ./examples/product-creation-host/product-host.test.ts ./examples/product-creation-host/ui-state.test.ts
```

结果：

```text
3 pass
0 fail
27 expect() calls
```

monorepo typecheck：

```bash
bun run typecheck
```

结果：

```text
pass
```

真实 opencode smoke：

```bash
PNEUMA_PRODUCT_HOST_WORKSPACE=/tmp/pneuma-product-host-real-agent \
PNEUMA_KEEP_PRODUCT_HOST_WORKSPACE=1 \
PNEUMA_PRODUCT_HOST_AGENT_TIMEOUT_MS=240000 \
bun run --cwd examples/product-creation-host real-agent
```

观察结果：

```text
model: openrouter/anthropic/claude-opus-4.7
engineering-dev-board: published v1, modules watchlist / review_queue / release_checklist
personal-focus-dev-board: published v1, modules daily_plan / priority_lane / github_attention / notes
```

## M46 证明了什么

M46 证明当前 0.4.0 implementation-framework 方向在产品层是有用的：

- Host Kit 可以支撑一个 Creation Host product，而不只是最小 conformance example。
- Builder experience 可以通过 role governance 被约束，而不用把 framework internals 暴露成主要 UX。
- Generated Application 可以拥有 source、versions、preview、published runtime、share artifact、fork lineage。
- 真实 opencode 可以作为写代码的 draft agent 参与，而不绕过 approval 或 publish gates。
- End User 可以在 Builder creation/publish 之后使用 Published Application。

## 仍然不在范围内

M46 明确不声称：

- production login 或 tenant isolation；
- production credential vault；
- 真实 GitHub/Linear OAuth；
- 广泛 cloud deploy；
- marketplace transport；
- arbitrary app builder；
- Published Application 内的 Runtime Agent；
- long-lived generated app process 的 hot reload。

这些是 productization lanes。它们不再阻塞 Host Kit 的 product-shape proof。
