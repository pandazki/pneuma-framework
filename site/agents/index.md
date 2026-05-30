# Building a Host with a coding agent

Increasingly the developer extending a Creation Host is itself a **coding agent**
— Claude Code, Codex, or similar. This page is written for that audience:
contract-first, imperative, and self-checkable. If you are a human, it doubles as
the rules of the road.

::: tip Point your agent here
Give your coding agent this page (and the repo's `CLAUDE.md` / `CONTEXT.md`) as
context before it writes Host code. The full version lives at
`docs/developer/host-builder-agent-guide.md`.
:::

## Obey these before writing Host code

1. **Keep the four layers visible.** Framework → Creation Host → Generated
   Application → Published Application. If a task says "the pneuma app", resolve
   which layer it means first.
2. **Run the [ownership litmus test](/architecture/boundaries).** Touches stack /
   domain / UI / data / deploy / identity → Host-owned (contract or slot only).
   Pure sequencing / governance / mechanics → reach for the framework helper.
3. **Honor the [governed loop invariants](/architecture/governed-loop).** They
   encode the framework's reason for existing; prefer them over your instinct.

## The non-negotiable invariants

1. The scaffold's `verify` is the pre-proposal gate. No proposal without it.
2. **Fail-closed everywhere.** A missing/ambiguous signal blocks, never passes. A
   timeout is not success — kill, verify, proceed only if checks pass.
3. Approval gates mutation; deny *before* mutating, never after.
4. Migrations are additive / forward-only / idempotent. No destructive
   down-migration in rollback.
5. Rollback is code-only. Data is forward-compatible; reverting it is a separate
   *explicit corrective proposal*, never an auto-drop.
6. The code agent edits a **draft**, never the active source.

## Real-world gotchas (you will hit these)

- **Completion-event drift.** A code-agent backend may signal "turn done" via a
  *set* of events (e.g. `turn/completed` **or** a `thread/status` idle), not a
  single one. Match the set; a fail-closed timeout makes a missed signal safe.
- **Variable turn duration.** The same prompt can finish well under, or over, a
  short cap. Use a generous, configurable timeout.
- **Cloud deploy protection.** A fresh deploy target may gate every URL behind
  auth (a `READY` deployment returning `401`). A receipt needs an access path,
  not just a URL — "deployed" ≠ "reachable".
- **Control plane vs connection string.** A Postgres URL cannot drive branching /
  admin (e.g. a database needs an API key, and org-scoped keys need an explicit
  project id).
- **Port allocation.** Pick a genuinely free port for ephemeral runtimes; a fixed
  counter collides with orphans and a stale process can answer your health check.

## Self-check before emitting a proposal or claiming "done"

1. Did the scaffold's `verify` actually pass on the draft? (Not "the agent said so.")
2. Did the change touch only editable roots? (Check the diff.)
3. Is the schema change additive / idempotent, with a forward migration?
4. Did I capture before/after schema + bundle evidence?
5. Is preview / rehearsal isolated from production data?
6. Does any "deployed" claim include a *reachable* check, not just a URL?
7. Am I pushing anything stack/domain/UI/data-shaped into the framework? If so,
   stop — make it a Host contract instead.
8. If something failed or was skipped, did I say so plainly (fail-closed), instead
   of reporting success?

## Anti-patterns to refuse

- "Just edit the active app directly, it's faster." → No; draft + verify + approval.
- "Rollback should also drop the new column." → No; additive + explicit corrective proposal.
- "The deploy returned an ID, call it published." → No; smoke a reachable endpoint.
- "Add a Vercel/Neon/Bun dependency to the framework." → No; reference adapter, opt-in, core never depends on it.
- "Preview against the production database to use real data." → No; branch or in-memory rehearsal.

---

Internalize the [litmus test](/architecture/boundaries) and the
[loop invariants](/architecture/governed-loop) and you will rarely go wrong; the
rest is detail. The framework owns sequencing and governance; you own every
effect through closures and adapters.
