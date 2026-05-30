# Build a Host, from the goal down

The fastest way to understand the framework is to build a Creation Host with it.
This guide does that — but not bottom-up from primitives. It works the way a real
project works: **start from the goal, then walk down** to the decisions that
realize it.

## Start from the goal

Here is what we are going to have built:

![A Creation Host studio where a Builder talks to an agent, with Preview/Approve/Publish/Rollback controls, publishing to a live Neon-backed Release Operations Board that End Users open](/diagrams/guide-goal.png)

A Builder ("Bob") opens a studio and creates a **Release Operations Board** — a
real full-stack app. The `v0` already works. Bob previews it, then asks a code
agent to evolve it — *"add an environment field to every release"* — and the
change is checked before he sees it, applied only on his approval, and published
to a real cloud URL backed by a real database. End Users open that Published App
and never see the build loop. When something is wrong, Bob rolls back.

That is the whole product. Everything below is the path from *that picture* to
*running code* — and most of the path is **choosing** and **wiring**, not
inventing.

## The path down

We descend through five stages. Each answers one question the stage above it
raised:

| Stage | The question it answers |
|---|---|
| **[1 · Scope & stack](./scope-and-stack)** | What is in the product, and what stack realizes it? |
| **[2 · Design the Generated App](./generated-app)** | What is the bounded `v0` an agent can safely evolve? |
| **[3 · Assemble the Host](./creation-host)** | How do you wire the governed loop by *consuming* the framework? |
| **[4 · Run the loop](./end-to-end)** | Does it actually work end-to-end against real services? |

The example we follow ships in the repo, so every claim is runnable:

```text
examples/clean-room-release-board   the Generated Application scaffold
examples/clean-room-release-host    the Creation Host studio
```

## The principle to carry down

Keep one sentence in view the whole way down:

> **The framework owns sequencing and governance; you own every effect.**

You will notice the Host is mostly **closures wired to framework contracts**, not
re-implemented plumbing. The stack, the domain, and the UI are yours; the order
of the loop and its gates are the framework's. If you ever feel like you are
*re-deriving* the governed loop, stop — you are meant to *consume* it. The
[ownership litmus test](/architecture/boundaries) is the tool for telling the two
apart.

Begin the descent → **[1 · Scope & stack](./scope-and-stack)**
