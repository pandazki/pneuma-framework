# Open Questions

**Last updated:** 2026-11-24
**Purpose:** only track unsettled questions. Closed history belongs in ADRs or milestone docs.

> **M54 framing note (2026-11-24):** `v0.5.0` is tagged (2026-06-23). Milestone 54 is closed and sits in `CHANGELOG.md` under `[Unreleased]`; no release has been cut for it, which is the owner's decision. M54 closed scope is documented in the [M54 snapshot](../archive/milestone-54-snapshot.md). The older question tables below pre-date the M45-M54 band but remain individually valid as **open** questions; they were re-anchored, not re-litigated. If any reads as settled, raise it for review rather than assuming so.

Current canonical state (after M54):

- [../archive/milestone-54-snapshot.md](../archive/milestone-54-snapshot.md) / [中文版](../archive/milestone-54-snapshot.zh-CN.md) — current milestone (an out-of-the-box governed loop on PneumaSpace): what is proven, what is not, the recommended next phase, and the team decision gate.
- [roadmap.md](./roadmap.md) — stage list, M54 and the recommended next stage.
- [team-share-demo.md](./team-share-demo.md) / [中文版](./team-share-demo.zh-CN.md) — team-share runbook.
- [adr/0039-change-record-floor-and-declared-reversibility.md](./adr/0039-change-record-floor-and-declared-reversibility.md) — the change record floor and declared reversibility (Accepted 2026-11-24).
- [../../examples/space-all-in-one/README.md](../../examples/space-all-in-one/README.md) — the runnable example and the record of its live runs and gaps.
- [../../CHANGELOG.md](../../CHANGELOG.md) — version history.
- [spec/global-alignment-review-0.4.md](./spec/global-alignment-review-0.4.md) / [中文版](./spec/global-alignment-review-0.4.zh-CN.md) — top-level review after Host Kit, Workflow App Studio, and Agent Debug Loop.
- [spec/ai-build-assurance-domain-review.md](./spec/ai-build-assurance-domain-review.md) / [中文版](./spec/ai-build-assurance-domain-review.zh-CN.md) — current Build Assurance domain anchor.
- [spec/creation-host-model.md](./spec/creation-host-model.md) / [中文版](./spec/creation-host-model.zh-CN.md) — durable four-artifact product/domain boundary.

Earlier canonical state (still valid as history):

- [release-0.4.0-notes.md](./release-0.4.0-notes.md) — 0.4.0 release evidence and the proven governed loop (Codex/Neon/Vercel).
- [milestone-1-snapshot.md](../archive/milestone-1-snapshot.md) — closed milestone (M1, governed app evolution); contains "What Is Proven", verification matrix, and P-slice ledger.
- [milestone-2-snapshot.md](../archive/milestone-2-snapshot.md) — closed milestone (M2, enterprise governance evidence).
- [milestone-3-snapshot.md](../archive/milestone-3-snapshot.md) — closed milestone (M3, deployable app substrate).
- [milestone-20-snapshot.md](../archive/milestone-20-snapshot.md) — closed milestone (M20, open-ended definition artifact boundary).
- [milestone-21-snapshot.md](../archive/milestone-21-snapshot.md) — closed milestone (M21, developer onboarding).
- [milestone-22-snapshot.md](../archive/milestone-22-snapshot.md) — closed milestone (M22, Creation Host Authoring Kit).
- [milestone-23-snapshot.md](../archive/milestone-23-snapshot.md) — closed milestone (M23, Sharing Governance contract).
- [milestone-37-snapshot.md](../archive/milestone-37-snapshot.md) — closed milestone (M37, post-RC assurance readiness checkpoint).
- [milestone-40-snapshot.md](../archive/milestone-40-snapshot.md) — closed milestone (M40, production readiness boundary; baseline for RC 0.3.0).
- `spec/creation-host-authoring-and-sharing.md` (+ `.zh-CN.md`) — working frame that led to M22 and M23; its conclusions live in the M22/M23 snapshots, the Creation Host DDD review and the Creation Host Contract guide. Read it from git history: `git show 32a469a:docs/architecture/spec/creation-host-authoring-and-sharing.md`.
- [spec/creation-host-ddd-review.md](./spec/creation-host-ddd-review.md) / [中文版](./spec/creation-host-ddd-review.zh-CN.md) — post-M21 DDD review for core language, bounded contexts, aggregate candidates, and shared-contract promotion rules.
- [adr/0031-open-ended-definition-artifact-boundary.md](./adr/0031-open-ended-definition-artifact-boundary.md) — M20 accepted boundary for Host-owned open-ended UI/module artifacts.
- [spec/production-readiness-boundary.md](./spec/production-readiness-boundary.md) / [中文版](./spec/production-readiness-boundary.zh-CN.md) — baseline (M40 / RC 0.3.0) production-readiness boundary for minimum enterprise governance; superseded by the 0.4.0 state above.
- ADRs remain the source of durable architectural decisions.

> M1/M2/M3 closed scopes are documented in their milestone snapshots. This file only tracks **unresolved** questions going forward.

## Product Questions After M54

These come from the M54 review and from the owner's discussion of 2026-11-23. Before M54 they were recorded nowhere in either repository. Four of them are the team decision gate of the [M54 snapshot](../archive/milestone-54-snapshot.md).

| Question | What is known |
|---|---|
| One product or two? Is PneumaSpace the entry and the governed loop a layer on top, under one name, or do the two stay separate products? | The leaning stated in the 2026-11-23 discussion is one name, two layers, PneumaSpace as the entry. The owner has not decided. Decision gate question 2. |
| Who is the first design partner, and is it an individual-developer audience or an agent-product team? | Unanswered. The answer decides whether isolation or the integration surface comes first. Decision gate question 4. |
| How is the pre-assembled Host (layer 3) designed as a package a product imports? | Today an integrator copies `examples/space-all-in-one`. Its `src/host.ts` holds the release-and-settle logic (publish, probe, put the address back, what serves now, previews), and the review rounds kept finding defects there without converging, because the Host infers facts the runtime owns. The recommended next phase moves that logic into host-kit and has PneumaSpace report those facts. Input: the gap list at the end of the example README. Decision gate question 1. |
| Should undo bring stored data back by default? | Not on the default stack today: it declares no snapshot capability, and the only practice, `postgres-template`, is opt-in and leaves snapshots nothing ends ([framework #14](https://github.com/pandazki/pneuma-framework/issues/14)). A default promise commits PneumaSpace to a snapshot at the release quiescent point for files plus SQLite. Decision gate question 3. |
| Who is the owner on a single machine? | Nobody is authenticated: `approve` asks for a terminal, and the owner page asks for a link the agent could read. Both are a speed bump. Under `local` mode PneumaSpace's admin API also accepts cross-site writes from any web page ([pneuma-space #43](https://github.com/pandazki/pneuma-space/issues/43)), so the answer has to cover the runtime's front door as well. |
| Can one preset span build time and run time? | Build-time presets (the framework Profile, the risk policy file) and run-time presets (PneumaSpace Policy, tenant quota) are still two halves. |
| What is the project called outward, and what is the entry project? | Positioning, naming, packaging and promotion have not started. The term "agent native" is in use elsewhere for a different idea. The owner deferred the entry project on 2026-11-23. |

Open issues carried out of M54:

| Issue | What it asks |
|---|---|
| [framework #14](https://github.com/pandazki/pneuma-framework/issues/14) | Who ends a data snapshot, and how a Host learns that a capability does not cover an app (see "Change Record After ADR-0039" below). |
| [framework #17](https://github.com/pandazki/pneuma-framework/issues/17) | The no-context trial of 2026-11-24 passed; it lists four frictions: where stored data lives, an idle app's sleep not explained to the agent, the app's share of the tests unknown in the host-driven lane, and the Host's raw words on the page after a failed go-back. |
| [pneuma-space #41](https://github.com/pandazki/pneuma-space/issues/41) | Four small runtime items. One needs a decision first: whether the app-id precondition `discard` gained should extend to PneumaSpace's other destructive writes, which in multi-replica operation still authorise against a view that may lag. |
| [pneuma-space #43](https://github.com/pandazki/pneuma-space/issues/43) | Under `local` mode the admin API accepts cross-site writes from any web page. |

## Team / Org Sharing And Enterprise Governance

M23 closes the first framework-level contract for Charlie/Dave style sharing/forking:

```text
SharingGovernanceManifest
  -> owner / maintainers / operators / explicit grants
  -> source artifact/app/version lineage
  -> share/fork/install/approve/publish/rollback/revoke rights
  -> revocation status
  -> required credential rebinding policy

CredentialRebindingEvidence
  -> no secrets
  -> subject/app/artifact binding status
  -> requirement refs and provider account refs
```

The remaining questions are product/integration problems that should not be treated as already solved by M23.

Open questions:

| Question | Current leaning |
|---|---|
| How should inherited default policies behave after fork/install? | Likely copy as reviewable initial policy proposals, not silent permanent permissions. |
| Is share artifact signing needed? | Not for local RC, but likely required before team/org distribution claims. M23 does not sign artifacts. |
| How do real identities map into `user:*`, `role:*`, `team:*`, and `org:*` subject refs? | Keep M23's subject ref syntax; defer enterprise IdP mapping to a later Host/meta-app layer. |
| Who owns production credential storage, encryption, refresh, rotation, and account-linking UX? | Host/meta-app product concern. M30 provides local/reference session, OAuth state, callback binding, credential-ref, and no-secret evidence utilities; M31 proves a downstream Host can adopt them. This is still not production IAM. |
| What is the org/admin UI for grants, delegated approvals, and revoked artifacts? | Product concern for a Creation Host or marketplace, not a framework primitive yet. |
| How should audit export and retention work for sharing governance decisions? | M23 gives decision output and diagnostics; durable org audit packaging is later. |
| How does cross-host artifact import establish trust? | Needs signing/provenance plus Host compatibility checks before marketplace claims. |

This remains a distribution question. It should not be confused with the
post-M37 Build Assurance lane, which is about Builder + Build Agent
business-change control inside a Creation Host.

## RC 0.3.0 Enterprise Governance

M40 pins the minimum production-readiness boundary for enterprise-governed Builder + Build Agent changes.

Remaining questions:

| Question | Current leaning |
|---|---|
| Which real providers should pressure the 0.3.0 demo? | GitHub public-read plus mock Linear is the minimum. |
| Should Reviewer/Owner/Operator be framework principals or Host identities? | Framework owns role vocabulary and route evaluation; Host maps real identities. |
| Should approval routing become a workflow engine? | No for 0.3.0; keep it as deterministic evaluation plus evidence. |
| What should block publish in the first enterprise slice? | Missing required governance approval, failed Build Assurance checks, or missing migration/recovery evidence. |
| How far should production readiness go before real Host product work? | Stop at framework contracts, evidence, and one reference demo; leave IAM, vaulting, retention, and workflow productization to Host/meta-app layers. |

## AI Build Assurance After M37

M32-M37 close the first assurance lane:

```text
BuildChangeReviewPacket
  -> BuildChangeAssuranceCase
  -> BuildChangeAssuranceCaseStore
  -> BuildChangeRecoveryDrillScenario
  -> Build Assurance Adoption Guide
```

Remaining questions:

| Question | Current leaning |
|---|---|
| How much migration evidence should be framework-required versus Host-declared? | Keep the vocabulary framework-owned; require only the narrow evidence needed to prevent unexplained half-success. |
| When should assurance cases move from local/reference files to production retention? | Only when a concrete multi-user Host needs retention policy, assignment, or export. Do not promote a compliance backend prematurely. |
| How should Permission Center compose with assurance cases? | Permission Center should show approval requests; assurance cases should explain build-change readiness. Link them by evidence refs rather than merging them. |
| How should corrective proposals and superseded decisions appear in product UI? | Host-owned UX, but framework should preserve first-class `superseded`, `rolled_back`, and failure readiness vocabulary. |
| Which downstream Host should validate the M37 adoption guide from zero context? | Use the next from-scratch downstream project rather than adding another framework-only demo. |

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

## Change Record After ADR-0039

[ADR-0039](./adr/0039-change-record-floor-and-declared-reversibility.md) (Accepted 2026-11-24) makes the change record the floor under every mode and makes the reach of an undo a declared capability. Who marks a change one-way when nothing classifies risk is settled there: the caller, as a plain statement.

Open questions:

| Question | Current leaning |
|---|---|
| Should guarantee names stay open strings or become a controlled vocabulary? | Keep them open until a second Host adds its own; the four agreed names are constants in `host-kit/change-record`. |
| Should `buildGovernedProposal` take a change record and write the entry itself? | Not yet. The example Host writes the entry after its release succeeds; promote that only when a second Host repeats it. |
| Who ends a data snapshot, and how does a Host learn before it promises anything that a capability does not cover an app? | Open: [framework #14](https://github.com/pandazki/pneuma-framework/issues/14). `DataSnapshotCapability` has `snapshot`, `restore` and `check`, and nothing that lets a snapshot go; the issue lists an optional `discard`, a practice-level prune, or a different owner for what the practice leaves behind, and asks for a `covers`-style answer as well. |
| Should shadow-git become a storage backend for the record? | Later ADR. Directory copies are the only backend today; `createCheckpoint` still has no production caller. |

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
