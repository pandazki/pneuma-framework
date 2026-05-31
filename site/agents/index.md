# For coding agents

You can already write code, run a test suite, read a stack trace, retry a flaky
call, and find a free port. This page covers none of that — you've got it.

It covers the one thing you **cannot** infer from your training data: the specific
model this framework imposes, and the handful of places where being a *competent*
coding agent will lead you confidently in the wrong direction. Load this page and
[`llms.txt`](/llms.txt) into context before you touch a Host. The rest you'll work
out on your own.

## Fetch the index, pull pages on demand

[`llms.txt`](/llms.txt) at the site root is the machine index: every page, one
line each. Use it to fetch the exact page a task needs instead of guessing from
weights — these docs are the source of truth, your priors are not.

## The model to hold

Four layers, and they are not interchangeable:

> **Framework → Creation Host → Generated Application → Published Application.**

The framework owns **sequencing and governance**; the Host owns **every effect**
(stack, domain, UI, data, deploy, identity). When an instruction says "the pneuma
app", resolve *which layer* before acting.

There are **two change models**, never one
([detail](/concepts/change-models)) — using the wrong one is a category error you
won't catch by testing:

- **Definition-as-data** — structural changes (table / column / operation / view /
  policy) are governed *rows* mutated via `definition.apply`. They are not files.
- **Code change lane** — open-ended *source* changes flow through
  draft → verify → proposal → apply.

## The invariants — hard constraints, not advice

These are load-bearing; they *are* the reason the framework exists, so they win
whenever they conflict with a default instinct:

1. The scaffold's `verify` is the only pre-proposal gate — no proposal without a pass.
2. Fail-closed — a missing or ambiguous signal blocks; a timeout is not success.
3. Approval gates mutation — deny *before* mutating.
4. Migrations are additive / forward-only / idempotent — no down-migration.
5. Rollback is code-only — data and deployment never revert by themselves.
6. The agent edits a **draft**, never the active source.

## Where your defaults are wrong here

This is the part worth your attention. Each instinct below is *correct in general*
and *wrong in this framework* — which is exactly why it's dangerous: nothing in
your training flags it.

| Your default | Here |
|---|---|
| "I finished the edits, so the change is done." | Done means the scaffold's `verify` passed. Your own judgement does not gate a proposal. |
| "Edit the app directly — it's faster." | You edit a draft copy. The live app is never your workspace. |
| "Rollback should undo everything I did." | Rollback is code-only. Additive data stays (it's forward-compatible); reverting it is a separate, explicit proposal. |
| "It returned 200 / a deployment id, so it's live." | A receipt must prove a *reachable* path. "Deployed" ≠ "reachable". |
| "This helper is generic — lift it into the framework." | If it touches stack / domain / UI / data / deploy / identity, it's Host-owned. The framework takes a contract, not an implementation. |
| "Drop or rename the column to keep the schema clean." | Additive only. A destructive migration is never part of a normal change. |
| "The signal's ambiguous — assume it worked and move on." | Fail closed: kill, run `verify`, proceed only if checks pass. |

Everything else — a backend that signals completion oddly, a deploy provider that
gates URLs, a port that's already taken — is ordinary work. Handle it the way you'd
handle it anywhere; the framework has no opinion about it.

## Routing — the right page for the task

| When you're about to… | Pull |
|---|---|
| reason about framework-vs-yours | [Boundaries & ownership](/architecture/boundaries) |
| implement or debug the create→publish loop | [The governed loop](/architecture/governed-loop) + [Assemble the Host](/guide/creation-host) |
| bound a generated app for agent edits | [Profile & scaffold](/concepts/profile-and-scaffold) |
| decide when a draft becomes a proposal | [Draft & the verify gate](/concepts/verify-gate) |
| assemble proposal evidence | [Proposal & evidence](/concepts/proposal-and-evidence) |
| materialize a version / capture observation | [Apply & versions](/concepts/apply-and-versions) |
| produce a publish/deploy receipt | [Publish & receipts](/concepts/publish-and-receipts) |
| get rollback semantics right | [Rollback](/concepts/rollback) |
| preview against real-shaped data | [Preview & data rehearsal](/concepts/preview-and-rehearsal) |
| change tables / operations / views / policies | [Definition as data](/concepts/definition-as-data) |
| persist the build conversation portably | [BuildThread](/concepts/build-thread) |
| build a whole Host from scratch | [Build a Host](/guide/) |

Then read the repo's `CLAUDE.md` / `CONTEXT.md` for project specifics.

---

If you hold the four-layer boundary and the six invariants, you will rarely go
wrong here; the rest is detail you already know how to handle.
