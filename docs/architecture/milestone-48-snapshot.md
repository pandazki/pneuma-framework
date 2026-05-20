# Milestone 48 Snapshot

**Milestone:** M48, Real Creation Host Example
**Status:** Closed
**Date:** 2026-05-20
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

## Real Opencode Evidence

The final E2E started the Host with:

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

The final runtime page proved the published application rendered legal review, due date, and SLA status. Screenshot: `/tmp/workflow-real-opencode-e2e-8908.png`.

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

The real path uses `opencode run` as a CLI code-agent runner. The existing `backend-opencode` SDK/session path remains useful for framework Operation-style interaction, but this milestone found its completion semantics insufficient for the code-change lane. The follow-up is not to weaken this example; it is to harden the backend adapter so a future Host can use the same source-boundary workflow without custom CLI orchestration.

## Verification

Focused tests:

```bash
bun test examples/workflow-app-studio/workflow-app.test.ts examples/workflow-app-studio/workflow-studio.test.ts
```

Result:

```text
9 pass / 0 fail
```

Live E2E:

```text
Host: PNEUMA_WORKFLOW_STUDIO_AGENT=opencode
Browser driver: Playwright
Requests: legal review, SLA tracking
Changed files: src/app.ts only
Final published route: /app/workflow-app?lang=zh
```

This closes the goal for M48: real opencode modifies Generated App source, while the Host owns governance and the published app proves the changes at runtime.
