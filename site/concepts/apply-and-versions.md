# Apply & versions

Approval is the only moment in the loop where a mutation happens. Everything
before it is reversible-by-doing-nothing: a draft is thrown away, a proposal is
discarded. **Apply** is the hinge — and the framework treats it with matching
care.

![Approval converts a proposal into an immutable vNext directory; the active pointer moves; observation evidence is captured](/diagrams/apply-versions.png)

## Approval gates mutation

The invariant is blunt:

> Apply only after explicit approval; deny *before* any mutation.

A denied proposal touches nothing. There is no "applied 3 of 5 files then the
Builder said no" — the decision is recorded first
([BuildThread](./build-thread) gets a `user_decision` turn), and only an
`approved` decision proceeds to mutation. A `rejected` decision produces a
`host_execution_receipt` with status `rejected` and stops.

This is the same gate whether the change is *source code* (the
[Code Change Lane](./change-models)) or *definition data* (a
`definition.apply_change_set` — see [definition as data](./definition-as-data)).
One Builder intent, one approval, then mutation.

## Apply re-checks the boundary it was promised

Approval is necessary but not sufficient. Before copying a single file, apply
re-runs the safety checks, because the world may have moved since the proposal was
prepared:

1. **`pre_apply` guardrails** run against the active source.
2. **Writable-roots enforcement** — any changed file outside `writable_roots` is
   rejected. Approval does not grant the agent new territory.
3. **Stale-base / stale-draft rejection** — if the active source or the draft
   moved since [evidence was prepared](./proposal-and-evidence), apply refuses.

Only after all three pass are the changed files copied from the draft into a new
version.

## A version is immutable; the pointer moves

Apply materializes the change as **`vNext`** — a new, immutable version directory.
The previous version is not edited in place; it stays exactly as it was. What
changes is a single pointer: the *active version* now points at `vNext`.

This is the structural reason [rollback is cheap and code-only](./rollback): the
prior `vN` is still sitting on disk, fully materialized. "Rolling back" is just
moving the active pointer back — no rebuild, no reconstruction, no risk.

```text
v0  ──apply──▶  v1  ──apply──▶  v2     (immutable, all on disk)
                                 ▲
                          active pointer
        rollback ◀── just moves the pointer; nothing is rebuilt
```

## Post-apply checks can roll back the apply itself

Copying files is not the end. The `post_apply` guardrails run against the
now-mutated source. If they fail, the apply does **not** stand: the framework
restores the backup and records a `host_execution_receipt` with status
`failed_validate_rolled_back`. A bad apply leaves the active version exactly where
it was — fail-closed extends all the way through mutation.

## Observation evidence: effect as fact

After a successful apply, the framework captures **observation evidence** —
`{ appSchemaSignature, bundleManifest, dbSchema }`. This is deliberate: it turns
"the change did what we expected" from an assertion into a recorded fact. You can
diff the schema signature across two versions and *see* that `v1` added a table;
you can diff the bundle manifest and *see* what the build output became. The same
evidence the [proposal](./proposal-and-evidence) previewed as before/after is now
captured as the actual after.

Next: turning an applied version into something End Users can open —
[publish & receipts](./publish-and-receipts).
