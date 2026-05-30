---
layout: home

hero:
  name: pneuma-framework
  text: Build apps by talking to an agent
  tagline: >-
    Infrastructure for AI-native creation tools. Let a Builder create, evolve,
    preview, publish, and roll back a real application by talking to an agent —
    without reinventing the agent loop, workspace, checkpoint, preview, and
    deploy plumbing.
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
      Framework → Creation Host → Generated Application → Published Application.
      The framework owns sequencing and governance; the Host owns every effect —
      stack, domain, UI, data, and deploy target.
  - title: One governed loop
    details: >-
      create-from-profile → preview → code-agent draft → verify gate → proposal →
      approve/apply → publish → rollback. Fail-closed at every step; the
      scaffold's own verify is the gate.
  - title: Consume, don't re-derive
    details: >-
      Host Kit helpers and opt-in reference adapters (Codex, Vercel, Neon) ship
      the plumbing so a real Host is batteries-included — the framework core
      never depends on them.
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

## Three ways in

- **[Architecture](/architecture/)** — top-down: the problem it solves, the
  four-layer model, the governed loop, and where the boundary sits.
- **[Build a Host](/guide/)** — a worked example from idea to a live app:
  design a Generated App profile, assemble a Creation Host, and drive the full
  loop with a real code agent, database branching, and a cloud deploy.
- **[For coding agents](/agents/)** — a contract-first, self-checkable guide for
  Claude Code / Codex when they build or extend a Host.
