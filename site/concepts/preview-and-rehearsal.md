# Preview & data rehearsal

**Preview** is a runtime that is safe to throw away. Its one hard rule: it must
never write production data. That sounds simple until a change alters the *schema*
— at which point "preview it safely" requires more than an in-memory copy, and the
framework reaches for **data rehearsal**.

![A disposable preview runtime backed by an in-memory copy for simple changes, or an isolated database branch for schema-changing changes, deleted on stop](/diagrams/preview-rehearsal.png)

## The disposable-runtime rule

A preview exists so a Builder can inspect the current or proposed version —
schema, data, operations, logs — without consequence. The invariant:

> Preview must never write production data.

For most changes that is satisfied by an **in-memory copy** or an isolated
working database: spin a runtime, let the Builder click around, tear it down. The
reference profile's preview is exactly this — a disposable in-memory sandbox. When
the preview stops, it is gone, and nothing it did reached the real backend.

## Why schema changes need rehearsal

The in-memory copy breaks down for one important case: a change that **alters the
schema** and needs to be previewed *against realistic data*. You cannot rehearse
"does my new `environment` column migrate cleanly against the existing 10,000
rows?" on an empty in-memory database — and you must not rehearse it against the
production database, because the migration would mutate live data.

This is the case for **Preview Data Rehearsal**: preview against an *isolated copy
of real data*.

## Database branching, copy-on-write

The reference mechanism is Neon's branching: a **copy-on-write branch** of the
production database. The branch starts as a logical copy of real data, the
migration is applied **additively** to the *branch*, the Builder previews against
it, and the branch is **deleted when preview stops**. Production is never touched.

```text
production DB ──branch (copy-on-write)──▶ preview branch
                                            │  apply additive migration here
                                            │  preview against real-shaped data
                                            ▼
                                          delete on stop  (production untouched)
```

A few properties make this honest:

- **Copy-on-write** means branching is cheap — you are not duplicating the whole
  database to preview.
- **Additive migration** on the branch mirrors exactly what
  [publish](./publish-and-receipts) will do for real, so the rehearsal is
  representative.
- **Delete on stop** keeps preview disposable — the branch has the same lifetime
  as the preview runtime.

::: warning Data does not merge back
A preview branch is a *rehearsal*, not a staging area. You cannot merge branch
data back into production — and you should not want to. The branch exists to prove
the migration and let the Builder look; the real schema change reaches production
only through an approved [publish](./publish-and-receipts), never by promoting the
branch.
:::

## The control plane is a Host concern

Branching needs the provider's control plane — for Neon, an API key and a project
id — which lives behind the `@pneuma-framework/adapter-neon` reference adapter,
not the framework core. The framework owns the *idea* (preview is disposable;
schema changes rehearse against isolated real-shaped data) and the *sequence*; the
provider that makes branching cheap is, like every other effect,
[Host-owned](/architecture/boundaries).

This closes the loop walk. To step back up to the domain model the agent actually
operates on, start with [two change models](./change-models).
