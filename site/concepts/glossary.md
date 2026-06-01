# Glossary

The framework leans on a small vocabulary, and each word carries a precise
meaning. This page is the one-line version of every term — enough to read any
other page without getting stuck. Each entry links to where it is treated in
full.

## The four layers & the people

**pneuma-framework** — the library/runtime in this repo: primitives, the governed
loop, the contracts. The thing you build *on*, never the product you ship.
→ [The model](/architecture/)

**Creation Host** — the Builder-facing product *you* (the Developer) build with the
framework. It owns project creation, preview, inspection, publish, and rollback.
→ [The model](/architecture/)

**Generated Application** — the app a Builder creates and evolves *inside* a Host.
It owns its definition, data, versions, and release history.

**Published Application** — a single Generated App version, live for End Users.

**Developer / Builder / End User** — who builds the Host / who creates apps inside
it by talking / who opens what's published. In a solo project, one person; in a
SaaS, three constituencies. → [Three populations](/architecture/)

**Build-phase Agent** — the agent that talks to the Builder during construction.
The framework always provides it. Distinct from a **Runtime Agent**, which a
Published App may or may not embed for End Users.

## The governed loop, step by step

**profile** — a Developer-authored choice set (stack, deploy target, agent backend)
plus a scaffold, packaged so "create" yields a complete, runnable `v0`.
→ [Profile & scaffold](./profile-and-scaffold)

**scaffold** — the generated app's starting source tree, with a manifest declaring
what an agent may touch and what it may not. → [Profile & scaffold](./profile-and-scaffold)

**writable roots / protected paths** — the parts of the scaffold an agent may edit,
and the parts it never may (framework wiring, deploy config, the manifest itself).
The scaffold manifest names these `writable_roots` / `protected_paths`; an example
Host's profile may expose the same idea as `editableRoots` / `protectedRoots`.
→ [Profile & scaffold](./profile-and-scaffold)

**draft** — a throwaway copy of the active version that the agent edits. The live
app is never the agent's workspace. → [Draft & the verify gate](./verify-gate)

**verify gate** — the scaffold's *own* check (typecheck + tests + build) that a draft
must pass before it can become a proposal. Not a linter the framework imposes — the
one gate that decides "done". → [Draft & the verify gate](./verify-gate)

**proposal** — a checked, single-intent change a human can approve: changed paths,
a readable diff, the verify output, and the schema/bundle deltas. One prompt → one
proposal. → [Proposal & evidence](./proposal-and-evidence)

**apply** — moving the active pointer to a new immutable version *after* approval.
Mutation never happens before the human says yes. → [Apply & versions](./apply-and-versions)

**version (`vNext`)** — an immutable snapshot of the generated app's source on disk.
Apply creates the next one; the active pointer moves; the old one stays.
→ [Apply & versions](./apply-and-versions)

**publish** — migrate the schema, *then* serve the new version, and return a
structured receipt. Migrate-then-serve, never the reverse. → [Publish & receipts](./publish-and-receipts)

**receipt** — the structured record a publish produces: target, version, URL,
persistence, deployment id, schema. Proof of *what happened*, not a log line.
→ [Publish & receipts](./publish-and-receipts)

**rollback** — moving the active pointer back to a previous version. Code-only:
data and the live deployment do **not** revert by themselves. → [Rollback](./rollback)

**preview / data rehearsal** — a disposable runtime that never writes production
data; for a schema change, an isolated copy-on-write branch of real data lets you
rehearse the migration. → [Preview & data rehearsal](./preview-and-rehearsal)

## The domain model

**definition-as-data** — the app's structure (tables, columns, operations, views,
policies) lives as governed *rows* in system-owned tables, not as code migrations.
Changing structure runs through the same pipeline as changing data.
→ [Definition as data](./definition-as-data)

**two change models (Lane A / Lane B)** — Lane A changes *definition data* (rows, via
`definition.apply`); Lane B changes *source code* (files, via draft → verify →
proposal → apply). The test: is it a structural primitive the framework models, or
open-ended source? → [Two change models](./change-models)

**Operation** — one declaration that becomes a UI button, an agent tool, an audit
event, and a policy checkpoint all at once. → [Definition as data](./definition-as-data)

**BuildThread** — the framework-owned semantic transcript of the build conversation
(intent, proposal, decision, receipt). The portable source of truth; the agent
backend's own session is just a cache. → [BuildThread](./build-thread)

## Words that trip people up

**effect** — in "the Host owns every effect", this means *the things that actually
happen*: running the agent, building, migrating, deploying, the UI, the data. Not
"side effect" in the functional-programming sense. The framework owns the *order*
and the *gates*; the effects are yours.

**fail-closed** — when a signal is missing or ambiguous, block rather than assume
success. A timeout is not success; a check that did not run did not pass.

**forward-compatible (reads)** — code that selects only the columns it knows about,
so an extra column added by a newer version is simply ignored — which is what makes
code-only rollback safe.

**additive migration** — a schema change that only *adds* (a column, a table) and is
idempotent and forward-only. Destructive change is never part of a normal change.

**stale base** — proposal evidence is computed against a snapshot of the active
source; if that source drifts before apply, the proposal is rejected rather than
applied against a base that no longer holds.
