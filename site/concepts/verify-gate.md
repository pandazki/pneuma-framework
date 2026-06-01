# Draft & the verify gate

Two ideas do almost all the safety work in the loop: the agent edits a **draft**,
never the live app; and a draft becomes a proposal **only if `verify` passes**.
Everything else is detail on top of these two.

![A draft workspace copied from active source; the agent edits it; the verify gate passes the draft to a proposal or fails it back to draft](/diagrams/verify-gate.png)

## The draft is a copy, not the app

When a Build-phase Agent starts work, it does not touch the active source. It
edits a **draft workspace** — a copy of the active version's source, confined to
the profile's `writable_roots`. This single indirection buys a lot:

- The live app keeps running and previewing while the agent works.
- A broken or abandoned draft costs nothing — it is thrown away.
- There is a stable base (the active source) to diff the draft against, which is
  what makes a [proposal](./proposal-and-evidence) concrete.

This is the invariant *"the code agent edits a draft, never the active source."*
It is not a convention; the apply step enforces it by re-checking the boundary
before any mutation.

::: details Why not let the agent edit the live app directly, with undo?
Because the agent's "done" cannot be trusted, and an undo stack is the wrong
safety net.

- **Signals lie.** A backend can finish editing and never emit a completion event
  (this happened with Codex). Direct-edit-with-undo trusts that forward signal; the
  draft gate trusts only a passing `verify` — see *fail-closed* below.
- **Direct edits make the semantics diverge.** Editing files in place scatters UI
  action, agent tool-call, policy, approval evidence, audit history, rollback, and
  release across the system — there is no single recorded decision point. The draft
  → proposal → approval path keeps that chain unified and inspectable.
- **Undo is fragile; versions are not.** Apply materializes an immutable
  [`vNext`](./apply-and-versions); rollback is a pointer move — crash-safe and
  durable. An undo stack is ephemeral, lost on crash and replayed state by state.
- **Deny happens *before* mutation.** A rejected proposal touches nothing; there is
  no "applied 3 of 5 files, then the Builder said no."
:::

## `verify` is the gate — the scaffold's own check

The gate is not a framework-supplied linter. It is **the scaffold's own `verify`
command** — typecheck, tests, build — declared in the manifest's `pre_proposal`
guardrails. The rule, stated by ADR-0034 and the Code Change Lane:

> Do not ask the Builder to approve a code-change proposal until `pre_proposal`
> guardrails pass.

A draft that fails typecheck, touches a protected path, or produces no computable
diff is a **draft failure**, not an approval question. It goes back to the agent
(or the Builder) as feedback, never forward to a human as "do you approve this?"
Approval is for a coherent, checked change — not for debugging a broken draft.

The framework ships three built-in checks that run alongside the scaffold's own:

| Check | What it asserts |
|---|---|
| `diff-computable` | At least one changed file; a diff can be produced. |
| `protected-paths-unchanged` | No change overlaps `protected_paths`. |
| `base-snapshot-unchanged` | The active source has not moved since evidence was prepared. |

## The Agent Debug Loop happens *before* the gate

Real agents do not write passing code on the first try. **ADR-0049 (Agent Debug
Loop)** puts a budgeted repair loop *before* proposal creation: the agent gets a
bounded number of attempts, sees the failed-check output, and tries again. The
debug evidence is recorded on the [BuildThread](./build-thread). If the budget is
exhausted and checks still fail, the loop ends **fail-closed**: no proposal is
created. Post-apply repair is a *new proposal*, never a silent fix.

So the gate is binary by design: either a draft passes and earns a proposal, or it
does not and stays a draft. There is no "approve with known failures" path.

## Fail-closed is the whole point

The reason `verify` is the gate — and not, say, "the agent says it's done" — is
that signals lie. In a real run, the Codex backend finished its edits but never
emitted the completion event the host was watching for. Treating the missing
signal as success would have shipped unreviewed work. Treating it as failure —
**fail-closed** — meant the host killed the process, ran `verify`, found it
passing, and built a correct proposal anyway.

> A timeout is not success. A check that did not run did not pass. An ambiguous
> signal blocks.

That posture is what lets you trust the gate even when the agent backend
misbehaves. Next: what a passing draft becomes — [proposal & evidence](./proposal-and-evidence).
