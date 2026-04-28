# Open Questions

**Last updated:** 2026-04-27
**Purpose:** only track unsettled questions. Closed history belongs in ADRs or milestone docs.

Current canonical state:

- [app-definition-milestone.md](./app-definition-milestone.md) records the latest working milestone.
- [team-share-demo.md](./team-share-demo.md) records the recommended team-share demo.
- ADRs remain the source of durable architectural decisions.

## Current Milestone

Closed:

```text
definition.apply(add_table_column)
definition.apply(add_table)
definition.apply(add_operation query/read-only)
definition.apply(add_view Operation-backed)
viewer approval for apply and rollback
rollback.validate / prepare / execute
rollback for removed overlay Tables, columns, query-backed Operations, and Operation-backed Views
replayable live browser demo
Operation surface contract (`agent_callable`, `public_surface`, `view_mountable`, `framework_internal`)
View visibility policy (`read view:<id>` plus `invoke operation:<source>`)
Framework event protocol for definition restart phases (`a2v framework-event`)
View presentation contract (`title`, `columns`, `empty_state`) plus `PneumaViewRenderer` in `@pneuma-framework/viewer-react`
```

The current demo proves:

```text
source inbox app
  -> Builder asks Agent to expose selected URLs
  -> framework adds a query Operation definition
  -> runtime discovers the new API surface after restart
  -> framework adds a View definition mounted on that Operation
  -> runtime discovers the end-user app surface after restart
  -> rollback removes the capability and View definitions
  -> business data remains
```

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

We now have four system-owned definition sources:

```text
pneuma_tables
pneuma_table_columns
pneuma_operations
pneuma_views
```

Questions:

- What is the uniform row shape for `pneuma_policies`, `pneuma_transforms`, and future custom renderer definitions?
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
| Policy definitions are not yet Builder-editable app-definition rows | Enterprise admins need governed changes to `view:<id>` and Operation rules, not code-only policy edits. |
| Cross-DB transaction boundary between storage and history | Enterprise needs atomic definition row + history write. |
| Concurrent definition writes can race on `definition_version` | Multiple agents/builders need serialization or database constraints. |
| Approval prompt is live, but consumer surface is still demo-level | Product viewer needs a durable permission center / pending-state model. |

## Operation Contract Cleanup

Resolved in P23:

- reference templates now pin object `output` declarations to handler return payloads.
- `/api/config.operations[]` exposes `invocation_method: "GET" | "POST"`.
- query-backed Operations use GET; code handlers, including `reads_only` computed code, use POST.
- `reads_only` code handlers receive a read-only storage facade that blocks `saveRow`, `saveRowUnchecked`, and `deleteRow`.

Remaining contract work belongs in ADR/API versioning, not this cleanup bucket:

- decide when `/api/config` becomes a versioned external client contract.
- decide whether `reads_only` must also sandbox non-storage side effects.

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
