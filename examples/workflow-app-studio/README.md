# Workflow App Studio

**Status:** M48 real Creation Host example, M49 Agent Debug Loop integration in progress
**Chinese version:** [README.zh-CN.md](./README.zh-CN.md)

Workflow App Studio is the next example after the closed Product Creation Host pressure sample. It starts from a clean product brief instead of extending Dev Board Builder.

Alice, the Developer, ships a local Creation Host for building small business workflow applications. Bob, the Builder, uses the Host to create a real app such as **Vendor Intake Portal**. The Generated Application has forms, queues, record detail, stages, role-gated actions, preview data, publish state, share artifacts, and fork lineage. Charlie can fork Bob's shared app and evolve a separate version.

## Product Goal

The product is not "an agent edits arbitrary files." The product is:

```text
Builder describes a business workflow
  -> Build-phase Agent proposes a workflow app shape
  -> Builder reviews source diff, data migration, and runtime impact
  -> Host applies the change through guarded lanes
  -> Builder previews the generated app with disposable data
  -> Builder publishes a usable workflow app
  -> another Builder can fork the artifact and evolve a new lineage
```

This is a stronger pressure target than Dev Board because the generated app must model:

- entities and fields;
- forms and queues;
- stage graphs;
- role-gated actions;
- record history;
- data carry-forward when the workflow changes;
- preview versus published data behavior.

## Implemented Vertical Slice

The implemented slice is intentionally domain-first and test-first:

```text
WorkflowAppDefinition
  -> fields
  -> stages
  -> actions
  -> views
  -> records
  -> transitions
  -> migration/carry-forward
```

Covered story:

```text
Bob creates Vendor Intake Portal.
Bob asks the agent to add legal review before approval.
The definition gains legal_review, contract_value, and legal actions.
Existing records carry forward without data loss.
Runtime transitions enforce role and stage requirements.
```

Host UI implementation:

- React browser entry at `src/ui/App.tsx`;
- lucide icons for actions, tabs, project switching, and state;
- shadcn-style local component classes for buttons, popovers, cards, tabs, and templates;
- no native browser `select` in the Builder-facing Host surface.

Run tests:

```bash
bun test --cwd examples/workflow-app-studio
```

Run the local Creation Host. By default it uses the Codex app-server code-agent lane:

```bash
PORT=8898 bun run --cwd examples/workflow-app-studio serve
```

`PNEUMA_WORKFLOW_STUDIO_MODEL` is optional for the Codex lane. When omitted, Codex app-server uses the local Codex CLI configuration. This lane uses the same draft workspace, `src/app.ts` source boundary, Builder approval, data carry-forward rehearsal, and Host guardrails as the opencode lane. Its purpose is backend substitutability: the Creation Host should not depend on opencode-specific event or session semantics.

Run the deterministic draft generator for repeatable local/CI checks:

```bash
PORT=8898 \
PNEUMA_WORKFLOW_STUDIO_AGENT=deterministic \
bun run --cwd examples/workflow-app-studio serve
```

Run the same Host with the real opencode code-agent lane:

```bash
PORT=8898 \
PNEUMA_WORKFLOW_STUDIO_AGENT=opencode \
PNEUMA_WORKFLOW_STUDIO_MODEL=openrouter/anthropic/claude-opus-4.7 \
PNEUMA_WORKFLOW_STUDIO_AGENT_TIMEOUT_MS=600000 \
bun run --cwd examples/workflow-app-studio serve
```

The opencode lane is deliberately narrow. The agent edits only `src/app.ts` inside the Generated App draft workspace. That file exports a literal `workflowPatch`, and the Host materializes the runtime workflow from that source after guardrails pass. The agent does not edit Host code, derived `workflow.json`, release state, or framework internals.

You can also spell the default Codex lane explicitly:

```bash
PORT=8898 \
PNEUMA_WORKFLOW_STUDIO_AGENT=codex-app-server \
PNEUMA_WORKFLOW_STUDIO_AGENT_TIMEOUT_MS=600000 \
bun run --cwd examples/workflow-app-studio serve
```

## Acceptance Target

Workflow App Studio now supports this end-to-end browser workflow:

1. Alice's Host exposes stack/profile and scaffold constraints.
2. Bob creates a Vendor Intake Portal from a product goal.
3. Bob asks the Build-phase Agent for a meaningful workflow change.
4. The agent edits controlled Generated App source, not Host code.
5. The Host shows interpretation, proposal, diff, migration impact, and confirmation.
6. Builder approval applies the proposal.
7. Preview opens as a separate app page with disposable data.
8. Published app opens as a separate End User page.
9. End Users create records and move them through role-gated workflow actions.
10. Bob exports a no-secret share artifact.
11. Charlie forks the artifact into a separate app and evolves it.

The current E2E path verifies:

- Bob creates and previews `Vendor Intake Portal@v0`.
- Preview data is disposable and separate from the published app.
- Bob publishes v0 and an End User creates / transitions a real workflow record.
- Bob asks for legal review, reviews proposal evidence, approves, previews, and publishes v1.
- The generated app form is driven by workflow definition fields, so `contract_value` appears in the runtime app after v1.
- Bob exports a no-secret share artifact.
- Charlie forks the artifact and independently evolves the fork with SLA tracking.
- The default Codex app-server lane can produce a governed source change:
  - SLA tracking: `due_date`, `sla_status`, `sla_watch`;
- The Codex app-server lane now runs through Agent Debug Loop before proposal:
  - a failed first draft check is fed back into the next attempt;
  - Builder approval is shown only after the debug checks pass;
  - debug evidence is recorded as BuildThread `agent_debug_attempt` / `agent_debug_session` host events.
- The alternate opencode lane can produce two governed source changes:
  - legal review: `contract_value`, `legal_review`, `legal_queue`;
  - SLA tracking: `due_date`, `sla_status`, `sla_watch`.

## Real Code-Agent Evidence

The stabilization E2E ran a local Host with the default Codex app-server lane and drove the browser through a Builder request:

- Codex modified Generated App source under the allowed path `src/app.ts`;
- the Host rejected any draft touching files outside that boundary;
- the Host computed the source diff and review packet before approval;
- Builder approval applied the source through the Host Kit code-change lane;
- preview/publish used the materialized workflow from the changed source;
- the published app rendered the new fields, stages, and views.

Verification snapshot:

```text
proposal: Add SLA tracking with due dates and overdue status
backend: codex-app-server
changed files: src/app.ts
published v1 fields: due_date, sla_status
published v1 views: sla_watch
```

Screenshots from the Codex default run:

```text
/tmp/workflow-codex-default-final-ui.png
/tmp/workflow-codex-default-published.png
```

The earlier opencode E2E remains useful alternate-backend evidence:

```text
proposal 1: Add legal review before approval
backend: opencode
changed files: src/app.ts
published v1 fields: contract_value
published v1 stages: legal_review
published v1 views: legal_queue

proposal 2: Add SLA tracking with due dates and overdue status
backend: opencode
changed files: src/app.ts
published v2 fields: due_date, sla_status
published v2 views: sla_watch
```

Screenshot from the earlier opencode run: `/tmp/workflow-real-opencode-e2e-8908.png`.

## Boundary

Framework / Host Kit should own:

- BuildThread and proposal receipts;
- source-boundary and guardrail orchestration;
- approval route evaluation;
- preview data rehearsal semantics;
- publish / rollback state;
- durable evidence vocabulary.

Workflow App Studio should own:

- workflow app domain model;
- generated app renderer;
- local SQLite workspace layout;
- concrete profile choices;
- product copy and UX;
- provider integrations when the product later needs them.

## What This Does Not Claim Yet

The automated tests still use deterministic and fake-backend draft agents for repeatability. The manual/live E2E now proves both the default Codex app-server lane and the alternate opencode CLI lane can edit controlled Generated App source and pass the same Host guardrail / approval / apply path.

This does not yet claim hosted auth, cloud deployment, marketplace transport, broad provider integrations, arbitrary generated React/TypeScript editing, or production-grade backend lifecycle semantics. One useful framework gap surfaced here: code-change lanes need a backend-neutral progress/turn contract, because opencode CLI and Codex app-server expose different event shapes while the Host wants the same evidence and guardrail semantics.
