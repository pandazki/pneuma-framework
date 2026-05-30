# Rollback: three layers, not one

A Builder clicks **Rollback**. What, exactly, goes back? The honest answer is
that a deployed change lives in three places at once, and rollback deliberately
touches only one of them.

![Rollback affects code instantly, leaves additive data in place, and leaves the deployment until re-publish](/diagrams/rollback-semantics.png)

## The three layers

| Layer | What rollback does | Why |
|---|---|---|
| **Code** | Reverts immediately — the active version pointer moves `v2 → v1`. | The previous version was already materialized; switching back is safe and instant. |
| **Data** | **Nothing.** The additive column/table stays in the database. | Dropping it is irreversible data loss. v1's code is forward-compatible and ignores it. |
| **Deployment** | **Nothing** until you re-publish. The live URL still serves v2. | Deploy is an explicit, credentialed action; rollback is a local version decision. |

## Why code-only is the safe default

The temptation is to make rollback "undo everything." That is exactly the wrong
default, because the three layers have different reversibility:

- **Code is cheaply reversible.** Versions are materialized as `vN` directories;
  the prior one is right there. Moving the active pointer back is lossless.
- **Data is not.** If `v2` added an `environment` column and End Users wrote
  values into it, a rollback that "undoes the schema" would silently delete that
  data. The framework refuses to make destructive data changes implicit. This is
  why [migrations are additive and forward-only](/architecture/governed-loop) in
  the first place — there is no down-migration to run.
- **Deployment is an outward-facing effect.** Re-pointing a live URL at an older
  build is a real deploy with real credentials and a real receipt. Rollback is a
  Builder's local decision about which version is *active*; it does not
  unilaterally redeploy.

Forward compatibility is what makes "leave the data" safe: v1's repository selects
only the columns it knows, so the leftover `environment` column is inert. We
verified exactly this — after a rollback, the live v0 app served correctly while
the `release_checklist_items` table from v1 still sat in the database, untouched.

## So how do you actually revert?

Each layer has an explicit, governed path — never a silent one:

1. **Revert the live app** → re-publish the rolled-back version. Publishing `v1`
   creates a new deployment from `v1` and returns a receipt; the live URL now
   serves `v1` again.
2. **Revert the schema/data** (rare, and usually you should not) → author a
   **corrective proposal**: a *new, forward* migration that drops the column,
   reviewed and approved like any other change. It is a deliberate, evidenced
   act — not a hidden side effect of clicking Rollback.

The rule, stated once:

> Code rolls back instantly. **Data and deployment never revert by themselves** —
> reverting them is always an explicit, governed step.

## What this tells you about the framework

This is the shape of the whole domain model. A concept that reads as one verb
("rollback") decomposes into three layers with different invariants
(reversible / additive / outward-facing), each with its own governed path. The
framework's job is to make those distinctions impossible to get wrong by accident
— which is why "rollback is code-only" is an invariant, not a preference.

See also: [Publish & receipts](./publish-and-receipts) for the re-publish path,
and [Apply & versions](./apply-and-versions) for how `vN` directories are
materialized in the first place.
