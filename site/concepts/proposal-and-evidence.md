# Proposal & evidence

A **proposal** is the moment a pile of agent edits becomes something a human can
decide on. The word is precise: it means *checked, single-intent, and backed by
evidence* — not "the agent guessed something and you should look at it."

![A proposal bundling changed paths, a unified diff, the verify tail, and schema/bundle before-and-after deltas, presented as one approval decision](/diagrams/proposal-evidence.png)

## What a proposal carries

The framework defines the *shape*; the Host fills it. The proposal is computed
against the **active version**, so it shows the full accumulated delta a Builder
would be approving:

```ts
Proposal = {
  changedPaths,           // which files moved
  diff,                   // a readable, line-based unified diff
  verifyTail,             // the tail of the passing verify run
  schema:  { before, after },   // what the DB schema becomes
  bundle:  { before, after },   // what the build output becomes
  agentNote,              // the agent's own summary of intent
}
```

Two of these deserve emphasis:

- **`diff` is line-based and readable.** A downstream Host asked for this
  explicitly (ADR-0026 era): a proposal a Builder cannot read is not a decision
  they can make. The diff is unified and human-scale, not a blob.
- **`schema` and `bundle` are before/after.** This is what makes a *data* or
  *bundle* consequence visible at decision time. "This change adds a
  `release_checklist_items` table" and "this change grows the client bundle by
  40 KB" are facts the Builder should see *before* approving, not discover after
  publishing.

## Single intent, by construction

A proposal answers exactly one Builder intent. This is not a style preference —
it is what makes the approval meaningful. If one prompt produced five unrelated
changes, "approve" would be a blank check. The
[change-set](./definition-as-data) discipline on the definition side, and the
single-draft discipline on the code side, both exist to keep the unit of approval
equal to the unit of intent.

## Evidence is concrete, not asserted

The defining property of a proposal is that its claims are *checked*, not
*stated*. The agent does not say "I added validation"; the diff shows the lines,
the verify tail shows the tests passing, the schema-after shows the column. This
is why the [verify gate](./verify-gate) runs first: a proposal can only exist on
top of evidence that already passed.

The framework also captures **observation evidence** at apply time —
`{ appSchemaSignature, bundleManifest, dbSchema }` — so an evolution's effect is
recorded as a fact, not an assertion. That is covered in
[Apply & versions](./apply-and-versions).

## Stale-base rejection: evidence has an expiry

A proposal's evidence was computed against a specific snapshot of the active
source. If the active source moves between *preparing* the proposal and
*applying* it, the evidence is stale — the diff no longer means what it said. The
framework refuses to apply a proposal whose base has shifted:

- `base-snapshot-unchanged` fails the apply if the active source changed.
- A drifted **draft** (edited after evidence was prepared) is rejected too.

Both fail **before any mutation**. A stale proposal is not silently re-based and
applied; it is rejected, and a fresh proposal must be prepared. This is what keeps
"approve" honest: you are approving the evidence you saw, or nothing.

Next: what approval does — [apply & versions](./apply-and-versions).
