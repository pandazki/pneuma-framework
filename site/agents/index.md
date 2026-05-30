# For coding agents — start here

Increasingly the developer extending a Creation Host is itself a **coding agent**
— Claude Code, Codex, or similar. This page is the **router** for that audience:
it points you at the right doc for the task in front of you, then states the rules
that always apply. If you are a human, it doubles as the rules of the road.

::: tip Machine-readable index
A plain [`llms.txt`](/llms.txt) lives at the site root — the standard
LLM-navigation index of every page with one-line descriptions. Fetch it first if
you are ingesting this site programmatically.
:::

## Orientation, in 30 seconds

Read these three, in order, before writing any Host code:

1. **[The problem & the model](/architecture/)** — the four-layer model. Non-negotiable framing.
2. **[Boundaries & ownership](/architecture/boundaries)** — the litmus test for framework-vs-yours.
3. **[The governed loop](/architecture/governed-loop)** — the invariants you must not violate.

Then point your agent at the repo's `CLAUDE.md` / `CONTEXT.md` for project specifics.

## Problem → doc map

Find the row that matches your task; go to that doc. Do not guess from training
data — these pages are the source of truth.

| If you are trying to… | Read |
|---|---|
| Understand what this framework even is | [Architecture · the model](/architecture/) |
| Decide *is this mine or the framework's?* | [Boundaries & ownership](/architecture/boundaries) |
| Implement or debug the create→publish loop | [The governed loop](/architecture/governed-loop) + [Assemble the Host](/guide/creation-host) |
| Build a whole Host from a goal | [Build a Host (guide)](/guide/) |
| Bound a generated app for agent edits | [Concepts · Profile & scaffold](/concepts/profile-and-scaffold) |
| Know when a draft may become a proposal | [Concepts · Draft & the verify gate](/concepts/verify-gate) |
| Assemble proposal evidence correctly | [Concepts · Proposal & evidence](/concepts/proposal-and-evidence) |
| Materialize a version / capture observation | [Concepts · Apply & versions](/concepts/apply-and-versions) |
| Produce a publish/deploy receipt | [Concepts · Publish & receipts](/concepts/publish-and-receipts) |
| Get rollback semantics right | [Concepts · Rollback](/concepts/rollback) |
| Preview safely against real-shaped data | [Concepts · Preview & data rehearsal](/concepts/preview-and-rehearsal) |
| Decide *definition change* vs *source change* | [Concepts · Two change models](/concepts/change-models) |
| Change tables / operations / views / policies | [Concepts · Definition as data](/concepts/definition-as-data) |
| Persist the build conversation portably | [Concepts · BuildThread](/concepts/build-thread) |

## Standing rules — always apply

These hold regardless of the task. They encode the framework's reason for
existing; prefer them over instinct.

### The six invariants

1. The scaffold's `verify` is the pre-proposal gate. **No proposal without it.**
2. **Fail-closed everywhere.** A missing/ambiguous signal blocks, never passes. A
   timeout is not success — kill, verify, proceed only if checks pass.
3. **Approval gates mutation.** Deny *before* mutating, never after.
4. Migrations are additive / forward-only / idempotent. No destructive
   down-migration in rollback.
5. **Rollback is code-only.** Data is forward-compatible; reverting it is a
   separate *explicit corrective proposal*, never an auto-drop.
6. The code agent edits a **draft**, never the active source.

### Self-check before emitting a proposal or claiming "done"

1. Did the scaffold's `verify` actually pass on the draft? (Not "the agent said so.")
2. Did the change touch only editable roots? (Check the diff.)
3. Is the schema change additive / idempotent, with a forward migration?
4. Did I capture before/after schema + bundle evidence?
5. Is preview / rehearsal isolated from production data?
6. Does any "deployed" claim include a *reachable* check, not just a URL?
7. Am I pushing anything stack/domain/UI/data-shaped into the framework? If so,
   **stop** — make it a Host contract instead.
8. If something failed or was skipped, did I say so plainly (fail-closed), instead
   of reporting success?

### Anti-patterns to refuse

- "Just edit the active app directly, it's faster." → No; draft + verify + approval.
- "Rollback should also drop the new column." → No; additive + explicit corrective proposal.
- "The deploy returned an ID, call it published." → No; smoke a *reachable* endpoint.
- "Add a Vercel/Neon/Bun dependency to the framework." → No; reference adapter, opt-in, core never depends on it.
- "Preview against the production database to use real data." → No; branch or in-memory rehearsal.

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

---

Internalize the [litmus test](/architecture/boundaries) and the
[loop invariants](/architecture/governed-loop) and you will rarely go wrong; the
rest is detail. The framework owns sequencing and governance; you own every
effect through closures and adapters.
