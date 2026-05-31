# Milestone 48 Snapshot

**Milestone:** M48, Real Creation Host Example
**Status:** Closed, stabilized after Codex app-server default
**Date:** 2026-05-20
**Stabilization date:** 2026-05-26
**Chinese version:** [milestone-48-snapshot.zh-CN.md](./milestone-48-snapshot.zh-CN.md)

## Decision

M48 starts a cleaner real-product line after the Dev Board pressure sample. The target is **Workflow App Studio**:

```text
pneuma-framework
  -> Workflow App Studio
  -> Vendor Intake Portal
  -> published Vendor Intake Portal vN
```

The important shift is that the example is no longer a click-through demo or deterministic-only storyboard. It proves that a real code agent can modify Generated App source while the Host keeps control of source boundaries, guardrails, review packets, Builder approval, apply, preview, and publish.

## What Changed

Workflow App Studio now models a small business workflow app with:

- workflow fields, stages, actions, views, records, and record history;
- preview data copies that can be mutated and discarded;
- published app state opened on a separate end-user route;
- share artifact export and fork lineage;
- data carry-forward when workflow definitions change;
- a controlled Generated App source module at `src/app.ts`.

The code-agent lane is intentionally narrow. The Build-phase Agent may edit only `src/app.ts`, which exports a literal `workflowPatch`. The Host materializes runtime workflow definition from that source after guardrails pass. Derived workflow JSON, Host code, release state, and framework internals are not agent-writable.

## Real Code-Agent Evidence

M48 now treats **Codex app-server** as the default real code-agent lane for Workflow App Studio. A plain local server start uses Codex unless the Developer explicitly asks for deterministic or opencode mode:

```bash
PORT=8898 bun run --cwd examples/workflow-app-studio serve
```

The default Codex path drove this browser E2E:

```text
Request: Add SLA tracking with due dates and overdue status.
Backend: codex-app-server
Changed files: src/app.ts
Published v1 fields: due_date, sla_status
Published v1 active route: /app/vendor-intake-portal
```

The UI now surfaces backend work as a Builder-readable progress summary (draft workspace, code-agent start, source inspection, controlled edit, verification, proposal) while keeping raw stdout/stderr/tool events collapsed for inspection. Screenshots from the stabilization run:

```text
/tmp/workflow-codex-default-final-ui.png
/tmp/workflow-codex-default-published.png
```

The earlier opencode path remains a supported alternate backend and proved the two-change pressure path:

The earlier opencode E2E started the Host with:

```bash
PNEUMA_WORKFLOW_STUDIO_AGENT=opencode
PNEUMA_WORKFLOW_STUDIO_MODEL=openrouter/anthropic/claude-opus-4.7
PNEUMA_WORKFLOW_STUDIO_AGENT_TIMEOUT_MS=600000
```

Playwright then drove two Builder requests through the browser:

```text
1. Add legal review before approval.
   opencode changed: src/app.ts
   published v1 fields: contract_value
   published v1 stages: legal_review
   published v1 views: legal_queue

2. Add SLA tracking with due dates and overdue status.
   opencode changed: src/app.ts
   published v2 fields: due_date, sla_status
   published v2 views: sla_watch
```

That runtime page proved the published application rendered legal review, due date, and SLA status. Screenshot: `/tmp/workflow-real-opencode-e2e-8908.png`.

## Boundary Review

### Framework / Host Kit Worthy

- Source boundary declarations and protected-path checks.
- Guardrail orchestration before proposal, before apply, and after apply.
- Code-change review packets with diff, changed files, and execution evidence.
- BuildThread turns for proposal, Builder decision, and execution receipt.
- Preview rehearsal and data carry-forward evidence.
- Fail-closed handling when a draft touches unauthorized files.

### Host-Owned

- Workflow domain model.
- The shape of `workflowPatch`.
- Runtime rendering of forms, queues, stages, actions, and history.
- SQLite workspace layout.
- Product copy, UX, share/fork surface, and later provider integrations.

## Gap Surfaced

M48 now has two real backend shapes: opencode CLI and Codex app-server JSON-RPC. The shared Host surface wants the same proposal, progress, evidence, and guardrail semantics regardless of backend event shape. This reinforces the next framework need: a backend-neutral code-agent progress / turn contract for Code Change Lane work, rather than Host-specific log parsing.

## Verification

Focused tests after stabilization:

```bash
bun test --cwd examples/workflow-app-studio
bun build examples/workflow-app-studio/src/ui/App.tsx --target browser --outfile /tmp/workflow-app-studio-react.js
```

Result:

```text
13 pass / 0 fail
browser bundle built successfully
```

Live E2E:

```text
Host: default agent mode, codex-app-server
Browser driver: Playwright
Request: SLA tracking
Changed files: src/app.ts only
Final published route: /app/vendor-intake-portal
```

This stabilizes the M48 goal: a real code agent modifies Generated App source, while the Host owns governance and the published app proves the changes at runtime. Codex app-server is the default lane; opencode remains alternate pressure evidence.
