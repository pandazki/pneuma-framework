# Boundaries & ownership

The framework is only valuable if it stays out of your way. This page is the
litmus test for what belongs to the framework versus your Host.

## The litmus test

For any piece of functionality, ask one question:

> **Does it touch the stack, the domain, the UI, the data shape, the deploy
> target, or identity?**

- **Yes → it is Host- or profile-owned.** The framework gives you a *contract or
  a slot*, never an implementation. Do not push it into framework packages.
- **No (pure sequencing / governance / mechanics) → it may be framework-owned**,
  and you should reach for the framework's helper instead of re-implementing.

![Framework owns sequencing, gating, contracts, workspace mechanics; Host owns stack, domain, UI, data, deploy, identity](/diagrams/boundaries.png)

| Framework owns | Host owns |
|---|---|
| The lifecycle state machine & sequencing | The stack (Bun/Hono/React/Drizzle, …) |
| Fail-closed gating, verify-as-gate | The business domain |
| Proposal / receipt / evidence shapes | The product UI |
| Workspace / version / diff mechanics | The persistence backend |
| The code-agent-lane contract | Identity / auth / multi-tenancy |
| (reference) adapters — opt-in | The deploy target & credentials |

## Three tiers of "valuable but non-constraining"

Not everything useful belongs in the same place. The framework ships value at
three tiers:

1. **Import-as-library (pure mechanics).** Things you would rewrite and resent
   rewriting, with zero opinion about your stack: the governed-loop backbone,
   workspace/version/diff machinery, the fail-closed proposal builder, the
   typed receipt/observation contracts. These live in **Host Kit**
   (`@pneuma-framework/host-kit`).
2. **Opt-in reference adapters.** The real-world plumbing tax — a code-agent
   backend's quirks, a deploy provider's upload protocol, a database's branching
   API. These are *separate packages you can fork or swap*, and the framework
   core never depends on them:
   `@pneuma-framework/backend-codex`, `@pneuma-framework/adapter-vercel`,
   `@pneuma-framework/adapter-neon`.
3. **Contract / slot only (never an implementation).** The stack, domain, UI,
   data shape, identity, deploy target. The framework defines the slot; you
   bring the implementation.

## How the value is delivered

The most useful infrastructure is *consumed*, not re-derived. The framework
leans on:

- **Contracts + a test surface** over a runtime that runs your app.
- **À la carte modules** — take the version/diff mechanics without the agent
  loop; take the proposal gate without an opinion on your stack.
- **Reference adapters as code you own and can read** — opt-in packages, not a
  black box.

::: warning Distribution is Bun-source, by design
The framework ships TypeScript source consumed by Bun (via `file:`/git), not
built `dist` artifacts on the npm registry. `main`/`types` point at `src/*.ts`
on purpose. That makes it **Bun-only**, which a Host must state. The published
package surface and a CI gate are the work between today and a 1.0.
:::

## What stays out

A real Creation Host will need things the framework deliberately does not own —
multi-tenant identity, hosted secret vaults, distributed concurrency control,
zero-downtime deploy, compliance audit backends. The framework gives you the
*vocabulary and reference helpers*; production implementations are Host-owned.
Treat that as a feature, not a gap: it is what keeps the framework from becoming
a hosting platform that constrains your product.
