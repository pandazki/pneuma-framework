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

## Next Decision: View Policy And Rendering

ADR-0022 settles the MVP View primitive:

```text
pneuma_views system-owned Table
add_view framework Operation
MVP View source = existing read Operation
restart rediscovery
rollback removes View rows
```

The open questions have moved one level deeper:

| Question | Current leaning |
|---|---|
| Does View need policy of its own? | Probably yes: `view:<id>` plus underlying Operation/table policy. |
| Where does View rendering live? | MVP demo renders known views in the host app; a reusable renderer contract is still open. |
| How are custom components distributed? | Defer until a table/list/detail renderer is boring and stable. |
| Can a View mount multiple Operations? | Defer; single-source Operation-backed View is enough for the first milestone. |
| Should View changes hot-load without process restart? | Later UX optimization; not a primitive blocker. |

## Restart Protocol vs Hot Reload

Current milestone accepts restart. The unresolved product/runtime question is how the Builder and Agent experience that restart.

Questions:

- Does `definition.apply` return a framework-visible restart event that the Agent can reason about?
- Should the viewer show `restarting`, `rediscovered`, and `failed` states explicitly?
- Is session resume enough, or do in-flight agent tool calls need a stronger protocol?
- Which definition changes can be hot-loaded later: Operations, Views, Policies, Table schema?

MVP leaning:

- keep restart for schema and Operation changes.
- add a clearer restart event model before making demos more complex.
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
| Framework-injected operations still have permissive MVP policy in places | Multi-user / public deployments need Builder/Agent-scoped authorization. |
| `reads_only` on code handlers is declaration, not sandbox | UIs and audits can use it as intent, but it is not enforcement. |
| Cross-DB transaction boundary between storage and history | Enterprise needs atomic definition row + history write. |
| Concurrent definition writes can race on `definition_version` | Multiple agents/builders need serialization or database constraints. |
| Approval prompt is live, but consumer surface is still demo-level | Product viewer needs a durable permission center / pending-state model. |

## Operation Contract Cleanup

Some earlier review risks remain intentionally deferred:

- operation `output_schema` must stay aligned with handler return values.
- HTTP should distinguish `query-backed GET` from `reads_only code POST`.
- clients may need explicit `invocation_method` in `/api/config`.
- code-handler `reads_only` isolation needs a read-only storage facade or stronger docs.

These are not blockers for the current demo, but they are blockers for a stable public client contract.

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
