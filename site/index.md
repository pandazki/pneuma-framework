---
layout: home

hero:
  name: pneuma-framework
  text: Build the tool where users create apps by talking
  tagline: >-
    On its own, such a tool can't just "change code" — it has to manage drafts,
    previews, checks, proposals, approval, publishing, and rollback.
    pneuma-framework pulls that dangerous, repetitive plumbing out, so you focus
    on the product, the domain, and the experience.
  actions:
    - theme: brand
      text: Understand the model
      link: /architecture/
    - theme: alt
      text: Build a Host
      link: /guide/
    - theme: alt
      text: For coding agents
      link: /agents/

features:
  - title: A four-layer model
    details: >-
      Framework → Creation Host → Generated App → Published App. You build the
      Host; Builders create apps inside it; End Users open what's published. The
      framework owns the order and the gates — you own every effect: stack,
      domain, UI, data, deploy target.
  - title: A loop that can't skip a step
    details: >-
      Create from a template, preview, let the agent draft a change, check it,
      approve, apply, publish, roll back. Nothing reaches users unchecked — and a
      check that didn't run never counts as having passed.
  - title: Consume the plumbing, keep your product
    details: >-
      Ready-made helpers and optional adapters (Codex, Vercel, Neon) make a real
      Host run out of the box. The core never depends on them — swap any piece
      for your own.
---

## What this is

![Framework → Creation Host → Generated Application → Published Application, with Developer / Builder / End User roles](/diagrams/four-layer-model.png)

`pneuma-framework` is the primitive layer for **Creation Hosts**: Builder-facing
products where applications are co-created in-session through dialogue with a
Build-phase Agent, rather than only by clicking and coding.

> **The analogy:** `pneuma-framework : React :: Creation Host : an app-builder
> product :: Generated Application : an app produced by that builder.`

It is **not** an app template, and it does not prescribe your stack, your
domain, your UI, or your database. It gives you the governed loop — the part
that is subtle and easy to get wrong — and leaves the product to you.

## Four ways in

- **[Architecture](/architecture/)** — top-down: the problem it solves, the
  four-layer model, the governed loop, and where the boundary sits.
- **[Concepts](/concepts/)** — the deep dives: each loop step and each domain
  primitive (definition-as-data, BuildThread, the two change models) up close,
  one diagram at a time.
- **[Build a Host](/guide/)** — a goal-driven worked example from a finished
  product down to running code: scope, stack, profile, assembly, and the full
  loop against a real code agent, database branching, and a cloud deploy.
- **[For coding agents](/agents/)** — a router and standing-rules sheet for
  Claude Code / Codex when they build or extend a Host.
