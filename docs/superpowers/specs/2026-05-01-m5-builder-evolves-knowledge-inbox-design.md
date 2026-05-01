# M5 Design Input: Builder Evolves Knowledge Inbox

> 中文版穿插在每节后面。M5 的目标不是把 Knowledge Inbox 做成完整产品，而是把 M1-M4 的 primitive 接进一个真实 app 的 Builder loop。

## Thesis

M1 proved that app definition can be governed data. M2 proved that enterprise governance can leave an explainable evidence chain. M3 proved that the substrate can be deployed with real SQLite persistence and Docker restart. M4 proved that the substrate can carry a product-shaped reference app.

M5 should prove the next question:

> Can a Builder change a running pneuma-app by talking to a Build-phase Agent, with the framework governing the definition mutation and the app surfacing the new capability after restart?

中文：

M5 要证明的不是“Knowledge Inbox 又多了一个功能”，而是：

> Builder 可以通过 Build-phase Agent 改变一个真实运行中的 pneuma-app；这个改变经过 framework 治理，重启后变成 app 的新能力，并且能被 App / Data / Substrate 三层看见。

## Why Priority Queue

The smallest credible product pressure is priority-based review:

```text
Builder: "I want to review inbox items by priority."
Agent: understands the app definition, proposes a capability change.
Framework: asks for Builder approval and records the permission evidence.
Runtime: applies definition rows, restarts, rediscovers the app definition.
End-user app: now shows a Priority Queue capability.
Data/Substrate: show the new column, operation, view, policy, history, and ledger evidence.
```

This is better than adding semantic search first because priority exercises app definition evolution directly:

- add a column on an existing app table;
- add a query-backed read Operation;
- add an Operation-backed View;
- add a PolicyRule for the new surface;
- prove restart rediscovery through the same deployable substrate as M4.

中文：

Priority Queue 是刻意选择的“小但完整”的压力测试。它不是最酷的知识管理功能，但它刚好能同时压到 schema、Operation、View、Policy、history、approval、restart rediscovery 和 demo narrative。

## Non-Goals

M5 must not overclaim:

- no production-grade LLM reliability requirement;
- no Postgres/Qdrant adapter;
- no runtime end-user agent;
- no hot-reload definition mutation;
- no full knowledge-management feature set;
- no production identity/IAM system.

中文：

M5 仍然是“完整定义和抽象 + 基本可用概念实现”的阶段。我们不会把它包装成生产级企业安全，也不会让真实 LLM 成为 CI 的不稳定依赖。

## Implementation Shape

M5 should introduce a new example instead of rewriting the closed M4 sample:

```text
examples/m5-knowledge-inbox-builder-evolution/
  capability-plan.ts       deterministic Agent proposal fixture
  evolve.test.ts           TDD proof of governed definition.apply sequence
  run.ts                   live demo runner
  README.md                demo runbook
```

The deterministic "agent" in M5 is a fixture-backed Build-phase Agent simulation. It is allowed to be scripted because the primitive under test is not LLM cleverness; the primitive is the framework-mediated builder evolution loop. A real backend can be attached later to produce the same tool calls.

中文：

M5 里的 Agent 路径应该是“可被 Agent 触发、可被测试稳定复现”的 Builder evolution harness。真实模型可以后接，但不能把里程碑建立在随机模型输出上。

## Capability Definition

The M5 priority capability is composed of four governed definition changes:

1. `add_table_column`
   - table: `inbox_items`
   - column: `priority`
   - cell type: `Text`
   - nullable: `true`

2. `add_operation`
   - operation: `list_priority_queue`
   - handler: query on `inbox_items`
   - fields: `url`, `title`, `source`, `summary`, `status`, `priority`, `created_at_cell`
   - sort: `priority asc`, `created_at_cell desc`
   - output: row-list of `inbox_items`

3. `add_view`
   - view: `priority_queue`
   - kind: `table`
   - source operation: `list_priority_queue`
   - presentation columns include the new `priority` field

4. `add_policy_rule`
   - rule: `anyone-read-priority-queue`
   - allow: anyone / anonymous
   - actions: `read`
   - resource: view `priority_queue`

中文：

这四步的意义是：M5 不只是“加一个列”，而是把这个列变成一个可读的产品 surface，并把权限和治理证据一起带出来。

## Demo Narrative

The live demo should be understandable without prior Pneuma knowledge.

Recommended structure:

- left side: End-user Knowledge Inbox, with App and Data tabs;
- right side: Builder + Agent + Governance timeline;
- lower or side inspector: Substrate facts, showing schema / domain service / API / policy / history;
- scenario stages:
  1. before: Knowledge Inbox has capture + triage, no priority review;
  2. request: Builder asks for priority review;
  3. proposal: Agent displays concrete definition changes;
  4. approval: Framework prompt explains impact;
  5. apply/restart: Timeline shows governed mutation and rediscovery;
  6. after: App/Data/Substrate all show `priority_queue`.

中文：

观众不应该先理解 Pneuma primitive 才能理解 demo。Demo 应该先讲一个产品故事：用户想按优先级处理信息；Builder 用对话改了 app；然后系统解释“这到底改了什么、为什么安全、为什么可回滚/可审计”。

## Release Gate

Before M5 snapshot paperwork, run a full review and e2e gate:

- focused unit/integration tests for M5;
- existing M4 focused suite;
- `bun run typecheck`;
- `git diff --check`;
- live browser e2e on the M5 runner;
- collect screenshots/materials for the milestone snapshot.

中文：

M5 的 snapshot 只能在 review + e2e 之后写。否则文档会变成愿景，而不是 milestone evidence。

