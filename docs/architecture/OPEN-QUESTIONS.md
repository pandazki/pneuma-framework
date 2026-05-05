# Open Questions

**Last updated:** 2026-05-05
**Purpose:** only track unsettled questions. Closed history belongs in ADRs or milestone docs.

Current canonical state:

- [milestone-1-snapshot.md](./milestone-1-snapshot.md) — closed milestone (M1, governed app evolution); contains "What Is Proven", verification matrix, and P-slice ledger.
- [milestone-2-snapshot.md](./milestone-2-snapshot.md) — closed milestone (M2, enterprise governance evidence).
- [milestone-3-snapshot.md](./milestone-3-snapshot.md) — current closed milestone (M3, deployable app substrate).
- [milestone-20-snapshot.md](./milestone-20-snapshot.md) — current closed milestone (M20, open-ended definition artifact boundary).
- [milestone-21-snapshot.md](./milestone-21-snapshot.md) — current closed milestone (M21, developer onboarding).
- [spec/creation-host-authoring-and-sharing.md](./spec/creation-host-authoring-and-sharing.md) / [中文版](./spec/creation-host-authoring-and-sharing.zh-CN.md) — working frame for the next two large problems: Creation Host Authoring Kit, then team/org sharing governance.
- [roadmap.md](./roadmap.md) — Stage 0–9 phasing.
- [adr/0031-open-ended-definition-artifact-boundary.md](./adr/0031-open-ended-definition-artifact-boundary.md) — M20 accepted boundary for Host-owned open-ended UI/module artifacts.
- [team-share-demo.md](./team-share-demo.md) / [中文版](./team-share-demo.zh-CN.md) — current zero-prep team-share package from project goal to RC decision.
- ADRs remain the source of durable architectural decisions.

> M1/M2/M3 closed scopes are documented in their milestone snapshots. This file only tracks **unresolved** questions going forward.

## Creation Host Authoring Kit

Post-M21 framing: a Developer such as Alice should be able to build a product like `mawidget`, whose Builders receive per-app Build Agent Sessions created from Alice's versioned Build Agent Package.

Working frame: [creation-host-authoring-and-sharing.md](./spec/creation-host-authoring-and-sharing.md) / [中文版](./spec/creation-host-authoring-and-sharing.zh-CN.md).

Open questions:

| Question | Current leaning |
|---|---|
| Is Build Agent Package a first-class framework concept? | Likely yes, after one Authoring Kit slice proves the shape. |
| What is the minimum machine-readable Host authoring manifest? | Start with Host-owned `profiles`, `provider-capabilities`, `agent-policy`, `tool-allowlist`, `share-recipe.schema`, and contract tests. |
| Should provider parity tests live in core? | Provide a framework test-kit, but keep concrete SQLite/Postgres implementations Host-owned. |
| How hard should framework enforce "agent must not provider-special-case"? | Enforce through tool allowlists, review checks, and generated tests; keep provider implementation in Developer/adapter-authoring mode. |
| How does a Host Authoring Assistant relate to Codex/Claude skills? | Treat it as a domain-specific Developer assistant that compiles Alice's Host choices into Build Agent Package artifacts. |

## Team / Org Sharing And Enterprise Governance

This is the next large problem after Creation Host authoring. It covers Charlie/Dave style sharing/forking and later organization safety.

Open questions:

| Question | Current leaning |
|---|---|
| What exactly is inside a share artifact? | App definition, version manifest, provider requirements/scopes, init recipe, default views/policies; no secrets and no private derived cache. |
| How are credentials re-bound after share/fork? | Share artifacts contain credential requirements and refs only; each installer/forker authorizes their own provider accounts. |
| Is SQLite-to-Postgres a DB migration? | Prefer re-materialization from app definition + init recipe + provider re-sync, not raw SQLite dump. |
| Who may share/fork/approve/publish/deploy/revoke in org settings? | Needs organization identity, ownership, delegated approval, audit retention, revocation, and deployment target governance. |
| Is share artifact signing needed? | Not for local RC, but likely required before team/org distribution claims. |

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

We now have six system-owned definition sources:

```text
pneuma_tables
pneuma_table_columns
pneuma_operations
pneuma_views
pneuma_policy_rules
pneuma_policy_settings
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
| Framework-injected operations are now classified and kernel-gated, but product/admin policy around who may request or approve which change is still narrow | Multi-user / public deployments need Builder/Reviewer/Admin workflows, not only one Builder approval. |
| Policy semantics are now explicit, but the product/admin surface is still narrow | Enterprise admins need authoring/review workflows, assignment, retention, and stronger scope controls around policy changes. |
| Cross-DB transaction boundary between storage and history | M2.6 detects and blocks ambiguous post-mutation failure, but enterprise production may need stronger atomicity or compare-and-swap around definition row + history writes. |
| Rollback execution transactionality | M17 adds a durable `definition_rollback_failed` history snapshot after the pre-rollback backup if rollback mutation fails, but this is still recovery evidence rather than a cross-store atomic transaction. |
| Distributed concurrent definition writes | M2.6 serializes one running framework process, but multiple runtimes/builders still need database constraints, distributed lock, or optimistic concurrency semantics. |
| M2.7 has Permission Center v0, but production Permission Center remains open | Enterprise viewer now has searchable/filterable pending/resolved approval inspection; retention policy, assignment, bulk actions, admin workflows, policy authoring, and repair workflows remain open. |

## Definition Mutation Recovery

M2.6 settles the MVP recovery boundary:

```text
single in-process writer
+ durable mutation guard
+ post-mutation verification
+ dirty-state blocking
+ definition.repair.status / definition.repair.reset_to_last_good
```

This deliberately does **not** claim cross-store ACID or distributed collaboration. It only claims that a failed definition mutation cannot silently leave the app in an ambiguous state while later mutations continue.

Remaining questions:

| Question | Current leaning |
|---|---|
| Should `reset_to_last_good` eventually restore the full overlay, not just clear dirty when observed state already matches last-known-good? | Yes, but only after the overlay restore path has tests for every definition table and rollback-supported surface. |
| Should definition mutation use database compare-and-swap on `definition_version`? | Likely yes for hosted/multi-runtime deployments; not required for current local dev milestone. |
| How deeply should dirty repair integrate into Permission Center? | v0 can render dirty repair state, but production still needs repair workflow ownership, failed repair ledger events, and admin routing. |
| Should failed repair attempts append their own ledger events? | Likely yes once Permission Center becomes the product surface. |

## Operation / API Contract

Open contract decisions:

- decide when `/api/config` becomes a versioned external client contract.
- decide whether `reads_only` must also sandbox non-storage side effects (today the read-only storage facade only blocks storage writes).

## Deployable Substrate After M3

M3 closed the first substrate proof:

```text
SQLite app.db
release manifest
Docker image
mounted /data volume
restart-persistent data + Builder-created capability
```

Remaining questions:

| Question | Current leaning |
|---|---|
| Should full `definition.apply` approval chain run inside the Docker release smoke next? | Yes, but as a targeted gap closure; M3 already proves substrate persistence. |
| When does Docker become a deploy adapter abstraction instead of template-local files? | After the next prototype shows whether deploy variance is real or speculative. |
| Should Postgres be introduced before the next reference app? | No; use the reference app to discover pressure first, then port if the pressure is concrete. |
| Where does semantic search live? | As a derived `SemanticIndexAdapter`; relational storage remains source of truth. |
| Should release mode include a Runtime Agent? | Defer until the reference app has a clear end-user runtime-agent job. |

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
