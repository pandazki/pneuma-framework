# Real Creation Host Example Brief

**Status:** M48 implemented brief, real opencode code-agent E2E complete
**Chinese version:** [real-creation-host-example.zh-CN.md](./real-creation-host-example.zh-CN.md)

M47 closed Dev Board Builder as a pressure sample. The next example should not continue polishing that sample. It should start from a product Alice could plausibly ship.

The chosen product is **Workflow App Studio**.

## Product Thesis

Alice builds a Creation Host for small business workflow applications. Bob uses it to create a Vendor Intake Portal. Charlie can fork Bob's shared artifact into a different workflow app. End Users operate the published app without seeing the Builder workbench.

The example should prove this chain:

```text
pneuma-framework
  -> Workflow App Studio
  -> Vendor Intake Portal
  -> published Vendor Intake Portal vN
```

## Why This Product

Workflow apps are a better real Creation Host pressure target than another board:

- they have real domain semantics: fields, forms, queues, stages, actions, role gates, and history;
- they force data carry-forward when stages or fields change;
- they make preview meaningful because actions mutate records;
- they make publish meaningful because End Users need a stable workflow surface;
- they make fork meaningful because Charlie can adapt the same artifact to a new process.

## First App Story

```text
Bob: "I need a vendor intake portal for software and service purchases."

v0:
  Vendor request form
  Submitted and Business review queue
  Approve / reject actions
  Record detail and history

Bob later asks:
  "Add legal review before approval and require contract value for high-risk vendors."

v1:
  legal_review stage
  contract_value field
  send_to_legal_review action
  legal_approve action
  existing records carried forward
```

## Acceptance Criteria

The implemented example is considered complete for the M48 vertical slice because a browser user can:

1. Create a Workflow App Studio project.
2. Ask the Build-phase Agent for the legal-review change.
3. Review the agent's interpretation, precise proposal, source diff, opencode log, and data carry-forward evidence.
4. Approve the change as Builder.
5. Open preview as a separate app page.
6. Create or transition workflow records in preview without affecting published data.
7. Publish a version.
8. Open the published app as an End User.
9. Export a no-secret share artifact.
10. Fork the artifact into a second app and evolve it separately.

Current verification evidence:

- Unit/domain tests: `bun test --cwd examples/workflow-app-studio`.
- Browser E2E: Playwright drove the local Host through create, preview, publish, runtime record mutation, legal-review evolution, v1 publish, share artifact export, fork, and independent SLA evolution.
- Captured screenshot: `/tmp/workflow-app-studio-e2e.png` during local verification.
- Real opencode E2E: `PNEUMA_WORKFLOW_STUDIO_AGENT=opencode` drove two code-agent changes through `src/app.ts` only: legal review and SLA tracking. Both produced review packets, passed guardrails, required Builder approval, published new runtime fields/views, and rendered in the final app.
- Captured screenshot: `/tmp/workflow-real-opencode-e2e-8908.png`.

## Non-Goals

M48 should not attempt:

- production login;
- hosted credential storage;
- real OAuth provider setup;
- cloud deployment;
- marketplace transport;
- arbitrary generated React/TypeScript editing beyond the controlled `src/app.ts` patch module.

The automated test suite keeps deterministic and fake-backend draft paths for repeatability. The milestone close-out also proves a real opencode CLI path can modify Generated App source under Host guardrails. The opencode SDK/session adapter remains a follow-up because its completion semantics were not reliable enough for this code-change lane during the close-out.

The first version should still use controlled Generated App source, but the source should be richer than Dev Board:

```text
src/app.ts
```

## Design Rule

Every implementation decision should answer:

```text
Does this help Alice build a Creation Host product,
or are we just making another demo easier to operate?
```

If it only helps the demo, keep it out of the framework-facing design.
