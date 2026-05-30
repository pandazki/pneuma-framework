# Publish & receipts

[Apply](./apply-and-versions) makes a new version *exist*. **Publish** makes a
version *reachable* — it runs the migration and serves or deploys the version to
End Users, returning a **structured receipt** as evidence. The receipt is the
point: a publish that cannot prove what it did is not a publish you can govern.

![Publish runs an additive migration, deploys the version, and returns a receipt with target, url, persistence, deployment id, and schema](/diagrams/publish-receipts.png)

## Publish is migrate-then-serve

A publish is two acts in a fixed order:

1. **Migrate.** Apply the version's schema changes to the real persistence
   backend. Migrations are **additive, forward-only, and idempotent** — the same
   property that makes [rollback safe](./rollback). There is no destructive
   down-migration anywhere in the system.
2. **Serve or deploy.** Either serve the active version locally, or deploy it
   through a Host-owned adapter (the reference is a Vercel REST adapter) to a real
   URL backed by real persistence (the reference is Neon).

The order matters: schema before traffic. End Users never hit a deployment whose
database has not caught up.

## The receipt is structured, not a log line

The framework defines the receipt *shape*; the Host fills it with real values:

```ts
PublishReceipt = {
  target,          // "local" | "vercel" | ...
  versionId,       // which version is now live
  url,             // the access path End Users open
  persistence,     // where the data lives (e.g. the Neon branch/role)
  deploymentId?,   // the provider's deployment handle
  files?,          // what was uploaded
  dbSchema,        // the schema that is now live
  migrateTail,     // the tail of the migration run
}
```

The receipt is what makes publish *auditable*: months later you can answer "what
exactly is serving v2, against which database, deployed when, with what schema?"
from a stored object — not by SSH-ing into a box.

## "Deployed" is not "reachable"

The receipt carries an **access path** (`url`) on purpose. A deploy that returns
`200 deployed` but `401` to an actual visitor has not published anything useful.
We hit this for real: a fresh Vercel project shipped with Deployment Protection
on, so the deployment was live but every request got a `401`. The fix was a Host
concern — `PATCH` the project to disable SSO protection — and the lesson is in the
contract:

> A publish returns evidence including an access path. "Deployed" ≠ "reachable" —
> the receipt has to prove the second, not just the first.

## Persistence outlives the deployment

The receipt separates `url`/`deploymentId` (the deployment) from `persistence`
(the data). They have different lifetimes, and that separation is exactly what
[rollback](./rollback) relies on: you can re-point or re-deploy the live URL
without touching the data, and the data keeps accumulating across versions because
migrations only ever add.

## Where the framework stops

Publish is the clearest place to see [the boundary](/architecture/boundaries). The
framework owns the *sequence* (migrate-then-serve), the *receipt shape*, and the
*fail-closed gating*. It does **not** own Vercel, Neon, Docker, or any deploy
target — those are opt-in reference adapters
(`@pneuma-framework/adapter-vercel`, `@pneuma-framework/adapter-neon`) that a Host
consumes or replaces. The structured deploy receipt is currently Host/example
local; promoting it into a framework package is exactly the kind of post-RC
decision the boundary leaves open.

Next: how the same persistence is rehearsed safely before a schema-changing
publish — [preview & data rehearsal](./preview-and-rehearsal).
