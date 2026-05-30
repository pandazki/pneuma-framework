# The governed loop

The governed loop is the framework's central primitive — the backbone that turns
a conversation into safe, reviewable change to a Generated Application.

![create → preview → agent draft → verify gate (fail-closed) → proposal → approve & apply → publish → rollback, as a cycle](/diagrams/governed-loop.png)

```text
create-from-profile → preview → code-agent draft → VERIFY GATE
  → proposal → approve / apply (vNext) → publish (+ receipt) → rollback
```

## The steps

1. **Create from profile.** Instantiating a profile yields a complete `v0`
   Generated App. Preview or publish it immediately — agent work is *optional
   evolution*, never a prerequisite.
2. **Preview.** A disposable runtime to inspect the current (or proposed)
   version. It must never write production data — use an in-memory copy or an
   isolated database branch (*Preview Data Rehearsal*).
3. **Code-agent draft.** A Build-phase Agent edits a **draft workspace** — a copy
   of the active source, never the live app — inside the profile's declared
   editable roots.
4. **Verify gate.** The scaffold's own `verify` (typecheck + tests + build) is
   the pre-proposal gate. A draft becomes a Builder-visible proposal **only if
   verify passes.**
5. **Proposal.** A checked, single-intent disclosure: changed paths, schema and
   bundle deltas, the verify tail. "Proposal" means *checked and ready for a
   human decision*, not "the agent guessed something."
6. **Approve / apply.** On approval, the draft is materialized as `vNext`.
7. **Publish.** Run migration, then serve or deploy the active version, returning
   a **structured receipt** (url, deployment id, persistence, schema).
8. **Rollback.** Restore the previous **code** version.

## The invariants (non-negotiable)

These are what the framework enforces so you cannot get them subtly wrong:

1. **The scaffold's `verify` is the gate.** No proposal without a passing verify.
2. **Fail-closed everywhere.** A missing or ambiguous signal — an agent timeout, a
   check that did not run, a protected file touched — must *block*, not pass. A
   timeout is **not** success: kill the agent, verify the workspace, and proceed
   only if checks still pass.
3. **Approval gates mutation.** Apply only after explicit approval; deny *before*
   any mutation.
4. **Migrations are additive / forward-only / idempotent.** Never author a
   destructive down-migration as part of rollback.
5. **Rollback is code-only.** It does not revert the database and does not
   redeploy. Reverting the live deployment is a re-publish of the rolled-back
   version; reverting data, if ever wanted, is a separate *explicit corrective
   proposal* — never an automatic drop. (Forward-compatible code simply ignores
   an extra column or table.)
6. **The code agent edits a draft, never the active source.**

::: tip Why fail-closed earns its keep
In a real run, the Codex backend finished its edits but never emitted the
completion event the host was watching for. The fail-closed timeout caught it:
the host killed the process, ran `verify`, it passed, and a correct proposal was
built anyway. Fail-closed is what makes a *missed signal* safe rather than wrong.
:::

## The contracts you fill

The framework defines the *shapes*; the Host fills them. These are the
vocabulary — do not invent parallel ones:

- **Proposal** — `{ changedPaths, diff, verifyTail, schema before/after,
  bundle before/after, agentNote }`, computed against the active version so it
  shows the full accumulated delta.
- **Publish / Deploy receipt** — `{ target, versionId, url, persistence,
  deploymentId?, files?, dbSchema, migrateTail }`. A publish returns structured
  evidence including an *access path* — "deployed" ≠ "reachable".
- **Runtime / Data receipt** — evidence of what happened to runtime/provider data
  after an approved change.
- **Observation evidence** — after each apply, capture `{ appSchemaSignature,
  bundleManifest, dbSchema }` so an evolution's effect is concrete, not asserted.
- **Editable vs protected roots** — the profile declares both; a draft touching a
  protected path is rejected *before* verify runs, enforced on the diff.

## Where it lives in code

The closure-driven backbone ships in Host Kit:
`@pneuma-framework/host-kit/governed-change` exposes `buildGovernedProposal` —
you pass `runAgent` / `isAgentTimeout` / `verify` / `observe` as closures, and
it owns the sequencing and the fail-closed gating. See
**[Build a Host](/guide/creation-host)** for it in use.
