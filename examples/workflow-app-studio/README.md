# Workflow App Studio

**Status:** M48 real Creation Host example, browser E2E vertical slice complete
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

Run tests:

```bash
bun test --cwd examples/workflow-app-studio
```

Run the local Creation Host:

```bash
PORT=8898 bun run --cwd examples/workflow-app-studio serve
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

This slice still uses a deterministic Build-phase Agent implementation for repeatable tests. It does not yet claim real opencode, hosted auth, cloud deployment, marketplace transport, or arbitrary generated React/TypeScript editing.
