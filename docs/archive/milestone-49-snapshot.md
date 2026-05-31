# Milestone 49 Snapshot

**Milestone:** M49, Agent Debug Loop
**Status:** Closed
**Date:** 2026-05-27
**Chinese version:** [milestone-49-snapshot.zh-CN.md](./milestone-49-snapshot.zh-CN.md)

## Decision

M49 makes the AI coding debug loop explicit and places it before Builder approval:

```text
Builder intent
  -> code agent edits a draft workspace
  -> Host runs Developer-declared checks
  -> failed checks become feedback to the agent
  -> agent repairs within a budget
  -> passing draft becomes a Code Change Lane proposal
  -> Builder approves one coherent change set
```

The important boundary is:

- **pre-proposal:** the code agent may iterate under a declared attempt/time/output budget;
- **proposal:** the Builder sees a checked candidate, diff, highlights, and impact evidence;
- **post-apply:** Host/framework run deterministic checks and rollback if needed;
- **repair after apply:** new Builder intent, new debug loop, new proposal.

This prevents the system from asking a Builder to approve an untested draft while also avoiding silent agent repair after approval.

## What Changed

### Framework Primitive

`@pneuma-framework/core` now exposes `runAgentDebugLoop` through the new subpath:

```ts
import { runAgentDebugLoop } from "@pneuma-framework/core/agent-debug-loop";
```

The primitive records BuildThread `host_event` turns:

- `agent_debug_attempt`
- `agent_debug_session`

It never writes an `agent_proposal`. Proposal creation remains owned by Code Change Lane after the debug loop passes.

### Host Kit Wrapper

`@pneuma-framework/host-kit` now exposes `runHostKitCodeAgentDebugLoop`.

The wrapper:

- calls `AgentBackend.runTurn` per attempt;
- feeds failed check summaries back into the next attempt;
- keeps concrete draft verification, workspace creation, and product-specific checks Host-owned.

### Workflow App Studio Integration

Workflow App Studio now runs the default Codex app-server lane through Agent Debug Loop before showing a proposal.

The UI also makes the lifecycle clearer:

- Builder request and generated app remain separate surfaces;
- agent progress shows draft workspace, backend start, source inspection, controlled edit, draft verification, and proposal creation;
- raw backend logs remain available behind a details panel;
- lifecycle buttons reflect draft / awaiting approval / previewing / published state;
- Chinese UI now translates fixed Host evidence and built-in workflow labels without changing the source diff.

## Real Code-Agent Evidence

Live browser E2E ran the Host with the default real Codex app-server lane:

```bash
PORT=8898 \
PNEUMA_WORKFLOW_STUDIO_AGENT=codex-app-server \
PNEUMA_WORKFLOW_STUDIO_AGENT_TIMEOUT_MS=600000 \
bun run --cwd examples/workflow-app-studio serve
```

Builder request:

```text
Add SLA due date, SLA status, and an SLA watch queue for overdue items.
Preserve existing records and do not modify Host code.
```

Observed result:

```text
backend: codex-app-server
changed files: src/app.ts
debug attempts: 1
debug check: draft-verification passed
proposal: Add SLA tracking to the workflow
published v1 fields: due_date, sla_status
published v1 view: sla_watch
published app record creation: passed
```

The actual Codex log included:

```text
Starting Codex app-server debug loop.
Codex debug attempt 1/2 started.
Running debug check draft-verification for attempt 1.
Draft verification passed after 1 debug attempt(s). Changed paths: src/app.ts.
Building governed code-change review packet for Builder approval.
Proposal is ready for Builder approval.
```

The published app then accepted a new record on the v1 route with the SLA fields rendered in the runtime form.

## Failure Evidence

Automated fake-Codex coverage proves the repair path:

```text
attempt 1: fake Codex writes an incomplete src/app.ts
check: draft-verification fails
attempt 2: prompt includes previous_debug_failure
fake Codex repairs src/app.ts
check: passes
proposal: appears only after repair
BuildThread: agent_debug_session recorded
```

This is the core M49 claim: failed drafts do not become Builder approval prompts.

## Verification

Typecheck:

```bash
bun run typecheck
```

Result:

```text
passed
```

Focused package tests:

```bash
bun test packages/core/test packages/host-kit/test
```

Result:

```text
492 pass
0 fail
1700 expect() calls
```

Workflow App Studio tests:

```bash
bun test examples/workflow-app-studio/workflow-studio.test.ts examples/workflow-app-studio/workflow-app.test.ts
```

Result:

```text
14 pass
0 fail
85 expect() calls
```

Combined verification gate:

```bash
bun test packages/core/test packages/host-kit/test examples/workflow-app-studio/workflow-studio.test.ts examples/workflow-app-studio/workflow-app.test.ts
```

Result:

```text
506 pass
0 fail
1785 expect() calls
```

Browser E2E:

```text
deterministic lane: create -> ask agent -> approve -> preview -> publish -> open published app
real Codex lane: create -> ask agent -> debug loop -> approve -> preview -> publish -> create published record
```

Bundle check:

```bash
bun build examples/workflow-app-studio/src/ui/App.tsx --target browser --outfile /tmp/workflow-app-studio-m50.js
```

Result:

```text
browser bundle built successfully
```

## Boundary Review

### Framework / Host Kit Worthy

- Budgeted debug attempts before proposal.
- Failed-check feedback as structured agent input.
- BuildThread evidence for attempts and sessions.
- Backend-neutral summary vocabulary: attempt, check, session, proposal-ready.
- Host Kit wrapper for common code-agent draft workflows.

### Host-Owned

- Concrete code-agent prompt text.
- Draft workspace creation and cleanup.
- Product-specific validation such as workflow field/stage/view consistency.
- UI copy and visual design.
- Runtime rendering and localized workflow labels.

## What This Does Not Claim

M49 does not claim:

- the agent's final draft is risk-free;
- post-apply failures are impossible;
- the framework should auto-repair after approval;
- all backend event shapes are normalized;
- arbitrary generated React/TypeScript applications are supported.

The claim is narrower and stronger: a Creation Host can require AI coding attempts to converge through declared checks before asking the Builder to approve a coherent change set.
