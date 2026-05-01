# M5 Implementation Plan: Builder Evolves Knowledge Inbox

> **Execution rule:** tests first for every behavior-changing slice. Snapshot paperwork comes last, after full review and e2e.

## Goal / 目标

Prove that the M4 Knowledge Inbox can be evolved by a Builder/Agent loop through governed app-definition changes, without relying on direct code edits or a flaky real LLM in CI.

中文：证明 Builder 可以通过 Agent loop 改变 Knowledge Inbox 的 app definition；framework 负责治理、审批、执行、重启、证据链和重新发现。

## Delivery Boundary / 交付边界

M5 closes when:

- a deterministic Builder-Agent harness proposes a priority review capability;
- the harness applies the capability through `definition.apply` with approval;
- the app restarts and `/api/config` exposes the new column, Operation, View, and PolicyRule;
- the new query-backed Operation can be invoked through the public API;
- the M5 demo runner shows before/proposal/approval/after as a coherent story;
- full review and e2e pass before milestone snapshot docs are written.

M5 does not require:

- real LLM output in automated tests;
- Postgres/Qdrant;
- hot reload;
- production auth/IAM;
- full Knowledge Inbox product completeness.

## File Map / 文件边界

- Create `examples/m5-knowledge-inbox-builder-evolution/capability-plan.ts`
  - Deterministic Builder-Agent proposal fixture for the priority capability.
- Create `examples/m5-knowledge-inbox-builder-evolution/evolve.test.ts`
  - Focused TDD proof: proposal -> approval -> `definition.apply` sequence -> restart rediscovery -> API invocation.
- Create `examples/m5-knowledge-inbox-builder-evolution/run.ts`
  - Live runner with seeded Knowledge Inbox workspace and scenario state for the viewer.
- Create `examples/m5-knowledge-inbox-builder-evolution/README.md`
  - Runbook for team demos.
- Modify `templates/knowledge-inbox-core-domain/viewer/index.html`
  - Add M5 scenario mode without breaking the default M4 app.
- Modify `templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts`
  - Contract tests for the M5 scenario surface.
- Modify `AGENTS.md` and `CLAUDE.md`
  - Move local session guidance from M3 to M4 closed / M5 active.
- Modify `docs/architecture/README.md` and `docs/architecture/roadmap.md` if status text still stops at M4.
- Create later, only after review/e2e:
  - `docs/architecture/milestone-5-snapshot.md`
  - `docs/architecture/milestone-5-snapshot.zh-CN.md`
  - `docs/architecture/spec/images/m5-*.svg`
  - rendered PNG versions for the snapshot.

## Task 0: Documentation Hygiene / 文档清理

- [ ] Update `AGENTS.md` and `CLAUDE.md` to say M4 is closed and M5 is active.
- [ ] Update architecture navigation if it still presents M4 as the next decision gate.
- [ ] Run markdown link checks or targeted `rg` checks for stale M3/M4 status claims.
- [ ] Commit as a small docs-only slice.

## Task 1: RED - Priority Capability Plan Fixture

Write the failing test first in `examples/m5-knowledge-inbox-builder-evolution/evolve.test.ts`.

Test should assert that the plan fixture contains exactly four framework definition changes:

1. `add_table_column` for `inbox_items.priority`;
2. `add_operation` for `list_priority_queue`;
3. `add_view` for `priority_queue`;
4. `add_policy_rule` for `anyone-read-priority-queue`.

Expected RED: import fails because `capability-plan.ts` does not exist.

## Task 2: GREEN - Capability Plan Fixture

Create `capability-plan.ts` with:

- `builderRequest`;
- `agentProposal`;
- `priorityCapabilityChanges`;
- utility metadata for the demo timeline.

Keep it deterministic and app-specific. Do not introduce generic planning abstractions until a second app needs them.

## Task 3: RED/GREEN - Governed Definition Evolution

Extend `evolve.test.ts` to boot a real Knowledge Inbox framework instance:

- create a temp workspace;
- start `templates/knowledge-inbox-core-domain` through `createPneumaFramework`;
- auto-respond to the framework permission prompt with allow;
- apply the four changes through `fw.toolRegistry.call("definition.apply", { require_approval: true, ...change })`;
- assert each result includes requested `build_agent`, execution `framework_system`, and allowed authorization metadata;
- assert final `fw.state.dev.tables`, `operations`, and `views` include the priority capability.

Expected RED before implementation: missing helper or scenario code.

## Task 4: RED/GREEN - Public API Invocation After Evolution

Extend the test to seed rows through `capture_item`, then call:

```text
GET /api/operations/list_priority_queue
```

Assertions:

- HTTP 200;
- rows include `priority` column in shape;
- operation is query-backed and uses GET;
- no direct framework-internal operation is exposed as an end-user View.

If existing query sorting cannot express semantic priority order, accept lexicographic priority for M5 and state that explicitly in the demo copy.

## Task 5: RED/GREEN - Live Runner

Add `run.ts`:

- starts the Knowledge Inbox template with a temp or supplied workspace;
- seeds demo rows;
- applies or previews the M5 capability based on CLI flags;
- prints ready URL and workspace;
- supports `--smoke-exit` for CI-friendly verification.

Test through a focused runner test before manual browser use.

## Task 6: Viewer Scenario Surface

Modify `viewer/index.html` in scenario mode only:

- default M4 app remains usable at `/`;
- `?scenario=builder-evolution` shows the M5 split narrative;
- left: app/data tabs for Knowledge Inbox;
- right: Builder request, Agent proposal, Governance timeline, Substrate delta;
- after evolution, Priority Queue appears as a first-class capability.

Apply the impeccable/UI bar used in M4: polished app surface, not a wireframe; no explanatory clutter inside the product panel.

## Task 7: Full Review and E2E Gate

Before snapshot docs:

- [ ] focused M5 tests;
- [ ] M4 focused tests;
- [ ] relevant core definition.apply tests if touched;
- [ ] `bun run typecheck`;
- [ ] `git diff --check`;
- [ ] browser e2e on the live M5 runner;
- [ ] collect screenshots and notes for snapshot evidence.

If any bug is found, fix before moving to Task 8.

## Task 8: M5 Snapshot Paperwork

Only after Task 7 passes:

- write `milestone-5-snapshot.md`;
- write `milestone-5-snapshot.zh-CN.md`;
- create English and Chinese diagrams;
- update `docs/architecture/README.md` navigation;
- tag the final commit as `pneuma-m5-builder-evolution`.

