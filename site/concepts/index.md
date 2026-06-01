# Concepts, in depth

The [Architecture](/architecture/) section gives you the high-level shape: the
[four-layer model](/architecture/), the [governed loop](/architecture/governed-loop),
and the [boundary](/architecture/boundaries) between framework and Host. That is
enough to know *what* the framework does.

New to the words themselves? The [Glossary](./glossary) is the one-line version
of every term on these pages — keep it open in a tab.

This section is for *how*. Each concept that reads as one word on the overview —
"proposal", "verify", "rollback", "publish" — is, up close, a small domain model
with its own invariants, its own failure modes, and its own reason to exist. The
[Rollback](./rollback) page is the template for the treatment: one verb,
three layers, three different answers.

::: tip Read the overview first
These pages assume you have read [the governed loop](/architecture/governed-loop).
They do not re-explain the loop; they go *underneath* each step.
:::

## Two ways to think about it

The deep dives split into two groups, because there are two different kinds of
"how" worth understanding.

![The governed loop sits on top of a domain model: profile, draft, proposal, version, receipt above; BuildThread, definition-as-data, operations, semantic tools below](/diagrams/concepts-map.png)

### The loop, in depth

Walk the governed loop one stage at a time and look at what each stage actually
guarantees:

- **[Profile & scaffold](./profile-and-scaffold)** — the Developer-authored source
  boundary that makes a generated app safe for an agent to touch.
- **[Draft & the verify gate](./verify-gate)** — why a draft is never the live app,
  and why the scaffold's own `verify` is the one gate that matters.
- **[Proposal & evidence](./proposal-and-evidence)** — what turns an agent's edit
  into a checked, single-intent decision a human can make.
- **[Apply & versions](./apply-and-versions)** — how approval becomes an immutable
  `vNext`, and what observation evidence is captured.
- **[Publish & receipts](./publish-and-receipts)** — migration, the structured
  receipt, and why "deployed" is not "reachable".
- **[Rollback semantics](./rollback)** — three layers, not one.
- **[Preview & data rehearsal](./preview-and-rehearsal)** — a runtime that is safe
  to throw away, and how a schema-changing change is rehearsed against real data.

### The domain model, in depth

Underneath the loop sits the part of the framework that has nothing to do with
files on disk — the governed-data model the Build-phase Agent actually operates
on:

- **[Two change models](./change-models)** — the single most important
  distinction: changing *definition data* versus changing *source code*, and when
  each applies.
- **[Definition as data](./definition-as-data)** — app structure (tables,
  operations, views, policies) as governed rows, not migrations; and the
  Operation primitive that unifies UI and agent tool from one declaration.
- **[BuildThread](./build-thread)** — the framework-owned semantic transcript that
  is the portable source of truth for the whole conversation, independent of any
  agent backend.
