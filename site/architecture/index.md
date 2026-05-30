# The problem & the model

## The problem

A new class of product is appearing: tools where you **create the application by
talking to an agent**. You describe what you want, an agent shapes the schema,
the UI, the behavior; you preview it, refine it in dialogue, publish it, and roll
it back when something is wrong.

Every team that builds one of these rebuilds the same plumbing:

- an **agent loop** that turns a conversation into concrete changes,
- a **workspace** with versions, drafts, diffs, and checkpoints,
- a **preview** that is safe to throw away,
- a **governed change** flow — propose, review, approve, apply — so the agent
  cannot silently break the app,
- **publish / rollback** with real persistence and a real deploy target.

This is the part that is subtle and easy to get wrong (when is a change "done"?
what happens to data on rollback? how do you keep an agent from editing the live
app?). `pneuma-framework` owns that part, and leaves the product — the stack, the
domain, the UI — to you.

> **Analogy.** `pneuma-framework : React :: Creation Host : an app-builder
> product :: Generated Application : an app produced by that builder.` The
> framework is the primitive; Creation Hosts and their generated apps are the
> products.

## The four-layer model

![Framework → Creation Host → Generated Application → Published Application, with Developer / Builder / End User roles](/diagrams/four-layer-model.png)

Keep this model explicit in everything you build. It is the first-page mental
model:

```text
pneuma-framework      primitives, governance, the agent loop, contracts
  → Creation Host     the Builder-facing product you build with the framework
    → Generated App   the app a Builder creates and evolves inside the Host
      → Published App  an active released version that End Users open
```

| Layer | What it is | Owns |
|---|---|---|
| **pneuma-framework** | The library/runtime — this repo. | Primitives, the governed loop, contracts. |
| **Creation Host** | The Builder-facing product a Developer builds. | Project creation, profiles, preview, inspect, publish, monitor, rollback. |
| **Generated Application** | The app created through a Host. | Its definition, data, runtime surface, versions, release history. |
| **Published Application** | A published version End Users open. | The active release. |

Do not collapse these back into "a developer writes a pneuma app." If a task
says *"the pneuma app"*, resolve whether it means the **Creation Host**, the
**Generated Application**, or the **Published Application** before designing the
work.

## Three populations (which can be one person)

```text
Developer  builds or configures the Creation Host
Builder    uses the Creation Host to create & evolve a Generated Application
End User   uses a Published Application
```

In a solo scenario (someone building their own tomato-clock) all three collapse
into one person. In an enterprise SaaS scenario they are three different
constituencies. The framework always provides the **Build-phase Agent** that
talks to the Builder during construction; whether a **Runtime Agent** ships
inside the Published App is a Host/profile decision.

## The thesis

One sentence carries the whole design:

> **The framework owns sequencing and governance; the Host owns every effect.**

The "effects" — running the agent, building, migrating, deploying, the UI, the
data — are all yours, supplied as closures and adapters. The framework owns the
*order* and the *gates*: when a draft becomes a proposal, when a proposal may be
applied, what evidence a publish must produce, what rollback does and does not
touch.

That single inversion is what makes the framework valuable without constraining
you. The next two pages make it concrete: **[the governed loop](./governed-loop)**
is the backbone, and **[boundaries & ownership](./boundaries)** is the litmus
test for what belongs where.
