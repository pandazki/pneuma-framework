# Open Questions

**Last updated:** 2026-04-29
**Purpose:** only track unsettled questions. Closed history belongs in ADRs or milestone docs.

Current canonical state:

- [milestone-1-snapshot.md](./milestone-1-snapshot.md) — closed milestone (M1, governed app evolution); contains "What Is Proven", verification matrix, and P-slice ledger.
- [milestone-2-snapshot.md](./milestone-2-snapshot.md) — current draft milestone snapshot (M2, enterprise governance evidence).
- [roadmap.md](./roadmap.md) — Stage 0–8 phasing.
- [team-share-demo.md](./team-share-demo.md) — team-share runbook.
- ADRs remain the source of durable architectural decisions.

> M1 closed scope is documented in [milestone-1-snapshot.md](./milestone-1-snapshot.md). This file only tracks **unresolved** questions going forward.

## View Rendering

ADR-0022 settles the MVP View primitive:

```text
pneuma_views system-owned Table
add_view framework Operation
MVP View source = existing read Operation
MVP View presentation = title + columns + empty_state
restart rediscovery
rollback removes View rows
```

ADR-0024 settles the MVP View visibility policy:

```text
/api/config.views is request-scoped
visible iff read view:<id> and invoke source operation both allow
hidden Views are omitted, not reported as denials
query-backed HTTP invocation evaluates invoke operation:<id> using app policy posture
```

The first rendering slice is now closed: the demo no longer hard-codes `review_queue`; it consumes `/api/config.views`, the normalized View presentation, the source Operation output, and the reusable `PneumaViewRenderer` exported by `@pneuma-framework/viewer-react`.

Remaining questions:

| Question | Current leaning |
|---|---|
| How are custom components distributed? | Defer until the declarative renderer is boring and stable. |
| Do non-React viewers need a renderer SDK? | Keep the contract framework-level; extract non-React helpers only when a second viewer needs them. |
| Can a View mount multiple Operations? | Defer; single-source Operation-backed View is enough for the first milestone. |
| Should View changes hot-load without process restart? | Later UX optimization; not a primitive blocker. |

## Hot Reload After Restart Protocol

Current milestone accepts restart. ADR-0028 settles the first protocol polish layer:

```text
wire-protocol carries a2v framework-event
definition.apply phases are broadcast while the tool is running
rollback.prepare / rollback.execute phases use the same channel
viewer-react stores these events in PneumaViewerState.frameworkEvents
```

Remaining questions:

- Is session resume enough, or do in-flight agent tool calls need a stronger protocol across a hard process restart?
- Which definition changes can be hot-loaded later: Operations, Views, Policies, Table schema?
- Should operation tool-list reload emit a dedicated framework event after `/api/config` refresh?
- Should framework events be persisted so a reconnecting viewer can replay the restart timeline?

MVP leaning:

- keep restart for schema and Operation changes.
- use framework-event envelopes to make restart visible before making demos more complex.
- hot reload is a later performance/UX improvement, not a primitive blocker.

## Definition Meta-Model

We now have five system-owned definition sources:

```text
pneuma_tables
pneuma_table_columns
pneuma_operations
pneuma_views
pneuma_policy_rules
```

Questions:

- What is the uniform row shape for richer `pneuma_policies`, `pneuma_transforms`, and future custom renderer definitions?
- Should all definition rows share `created_by_kind`, `created_by_id`, `definition_version`, `description`, and `source` fields?
- Should `app_history` snapshots store all definition tables in one envelope forever?
- When do we need a migration path from per-source snapshots to a versioned `definition_overlay_snapshot` schema?

MVP leaning:

- continue system-owned Tables.
- avoid JSON overlay files.
- keep one combined `definition_overlay_snapshot`.

## Governance Gaps

Known gaps before enterprise claims:

| Gap | Why it matters |
|---|---|
| Framework-injected operations are now classified as internal, but still have permissive MVP policy in places | Multi-user / public deployments need Builder/Agent-scoped authorization. |
| Additive allow PolicyRules are Builder-editable rows, but policy lifecycle is still narrow | Enterprise admins need deny semantics, edit/delete, default posture changes, explanation, and stronger scope controls. |
| Cross-DB transaction boundary between storage and history | Enterprise needs atomic definition row + history write. |
| Concurrent definition writes can race on `definition_version` | Multiple agents/builders need serialization or database constraints. |
| M2.3 has a lightweight governance evidence loop, but production Permission Center remains open | Enterprise viewer should eventually expose searchable pending/resolved approvals, filters, retention policy, assignment, and admin workflows. |

## Operation / API Contract

Open contract decisions:

- decide when `/api/config` becomes a versioned external client contract.
- decide whether `reads_only` must also sandbox non-storage side effects (today the read-only storage facade only blocks storage writes).

## Later ADR Candidates

| Candidate | Trigger |
|---|---|
| Dashboard primitive | After single View primitive works. |
| Application environment model | When Dev/Staging/Prod semantics affect permissions or data sources. |
| Transform versioning and rerun | When prompt changes need historical data updates. |
| Hybrid table model | When adapter-backed rows need local extension fields. |
| Prompt injection threat model | Before untrusted web/document content can feed build-time transforms. |
| Builder team collaboration | When multiple Builders edit one app concurrently. |
| AI usage metering | Hosted / enterprise billing scenario. |

## Documentation Hygiene

Do not add a new long report for every slice.

Use:

- ADR for decisions.
- milestone doc for durable state.
- demo doc for team-share narrative.
- this file for open questions only.

When a question is settled, move it into the right durable home and remove it from this file.
