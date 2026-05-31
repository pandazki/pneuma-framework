# Milestone 46 Snapshot

**Milestone:** M46, Product Creation Host
**Status:** Closed
**Date:** 2026-05-16
**Chinese version:** [milestone-46-snapshot.zh-CN.md](./milestone-46-snapshot.zh-CN.md)

## Decision

M46 closes the first product-shaped Creation Host pressure on top of M45 Host Kit.

M45 proved the reusable implementation loop. M46 proves that the loop can sit inside a real Builder-facing product without collapsing into a one-click demo:

```text
Developer builds a Creation Host product
  -> Builder creates and evolves a Generated Application
  -> Builder publishes a usable Published Application
  -> Builder shares a portable artifact
  -> another Builder forks, evolves, and publishes their own version
```

The product is **Dev Board Builder**:

```text
examples/product-creation-host/
```

## What Shipped

### Product Workbench

The workbench is a three-pane Creation Host:

- left: project creation, project list, share artifacts;
- center: selected Generated Application, Builder conversation, proposal, approval route;
- right: preview, schema, data, evidence, and agent log inspection.

There are no scenario-runner buttons. Every action maps to a product operation: create board, ask agent, approve as current role, preview, publish, share, fork, and use a published app.

### Product Store

M46 uses a real local store:

```text
ProductHostStore
  -> SQLite via bun:sqlite
  -> projects
  -> versions
  -> pending_evolutions
  -> agent_logs
  -> share_artifacts
```

Generated app source lives in a Scaffold Project:

```text
projects/:appId/source/src/board.json
projects/:appId/draft
projects/:appId/published/:versionId/items.json
```

### Generated And Published Apps

The Host serves both preview and published routes:

```text
/preview/:appId
/app/:appId
```

The published route is usable by an End User. The browser E2E opened `/app/charlie-s-dev-board` and added a visible follow-up item.

### Share And Fork

The share artifact is portable and no-secret. It carries:

- app/version references;
- board definition;
- source snapshot;
- init recipe;
- provider requirements.

Charlie forks from Bob's share artifact and evolves the fork through the same governance lane.

### Real Code Agent

The live code-agent path uses:

```text
opencode + openrouter/anthropic/claude-opus-4.7
```

The real agent wrote draft `src/board.json` for two different boards:

- Engineering Dev Board: adds `review_queue`.
- Personal Focus Dev Board: adds `priority_lane` and `github_attention`.

The code agent only writes the draft. Host verification, review packet creation, reviewer approval, guarded apply, data rehearsal, preview, publish, and evidence remain Host/Host Kit responsibilities.

## Browser E2E Evidence

The full browser flow was completed through Chrome UI:

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

## Verification

Focused test suite:

```bash
bun test ./examples/product-creation-host/product-host.test.ts ./examples/product-creation-host/ui-state.test.ts
```

Result:

```text
3 pass
0 fail
27 expect() calls
```

Monorepo typecheck:

```bash
bun run typecheck
```

Result:

```text
pass
```

Real opencode smoke:

```bash
PNEUMA_PRODUCT_HOST_WORKSPACE=/tmp/pneuma-product-host-real-agent \
PNEUMA_KEEP_PRODUCT_HOST_WORKSPACE=1 \
PNEUMA_PRODUCT_HOST_AGENT_TIMEOUT_MS=240000 \
bun run --cwd examples/product-creation-host real-agent
```

Observed result:

```text
model: openrouter/anthropic/claude-opus-4.7
engineering-dev-board: published v1, modules watchlist / review_queue / release_checklist
personal-focus-dev-board: published v1, modules daily_plan / priority_lane / github_attention / notes
```

## What M46 Proves

M46 proves that the current 0.4.0 implementation-framework direction is useful at the product layer:

- Host Kit can support a Creation Host product, not only a minimal conformance example.
- The Builder experience can be role-governed without exposing framework internals as the main UX.
- The Generated Application can have source, versions, preview, published runtime, share artifact, and fork lineage.
- Real opencode can participate as a code-writing draft agent without bypassing approval or publish gates.
- End Users can use the published app after Builder creation and publish.

## What Remains Out Of Scope

M46 deliberately does not claim:

- production login or tenant isolation;
- production credential vault;
- real GitHub/Linear OAuth;
- broad cloud deploy;
- marketplace transport;
- arbitrary app builder;
- Runtime Agent inside the published app;
- hot reload for long-lived generated app processes.

These are productization lanes. They are no longer blockers for the Host Kit product-shape proof.
