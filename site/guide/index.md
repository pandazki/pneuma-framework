# Build a governed project

This guide builds one thing end to end: a Creation Host where a Builder creates
and evolves a real, full-stack application by talking to a code agent — and then
publishes it to a real database and a real cloud deploy, with every change
reviewed and reversible.

We follow a worked example that ships in the repo:

```text
examples/clean-room-release-board   the Generated Application scaffold
examples/clean-room-release-host    the Creation Host studio
```

## What we are building

A Builder ("Bob") opens the Host and creates a **Release Operations Board** — a
full-stack app (Bun + Hono + React + Drizzle + Zod, Neon Postgres, Vercel). The
`v0` is already usable. Bob can preview it, publish it, or ask the Build-phase
Agent to evolve it — add a field, a table, a new endpoint, restyle the UI. Each
evolution is checked before he sees it, applied only on approval, and published
with a structured receipt. End Users open the Published App and never see the
build loop.

## The shape of the work

The example was built — and this guide is organized — in the order a real
project goes:

1. **[The Generated App](./generated-app)** — *idea → design.* Define the app and
   its **profile contract**: the editable and protected roots, the `verify`
   gate, the deploy targets. This is Developer work; prove the scaffold is a
   useful, complete `v0` before any agent touches it.
2. **[The Creation Host](./creation-host)** — *design → implementation.* Assemble
   the governed loop by **consuming** the framework: Host Kit for the
   workspace + proposal backbone, and reference adapters for the code agent,
   the deploy, and database branching.
3. **[End to end](./end-to-end)** — *run it for real.* Create → preview /
   rehearse on a database branch → evolve with a real code agent → review the
   proposal → approve & apply → publish to the cloud → roll back. With the
   actual evidence captured along the way.

## The principle to carry

You will notice the Host is mostly **wiring closures to framework contracts**,
not re-implementing plumbing. That is the point: a real Host *consumes* the
governed loop and the adapters; it does not re-derive them. Keep the
[ownership litmus test](/architecture/boundaries) in view as you go — the stack,
the domain, and the UI are yours; the sequencing and the gates are the
framework's.
