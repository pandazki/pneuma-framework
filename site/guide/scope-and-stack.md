# 1 · Scope & stack

*From the goal, the first two decisions.* The [goal picture](./) shows a Builder
evolving a Release Operations Board and publishing it live. Before any code, two
questions fall out of that picture: **what is in the product**, and **what stack
realizes it**. Get these explicit and the rest of the build is mechanical.

## Scope: draw the box first

Scope is what keeps the example honest — small enough to build end-to-end, real
enough to exercise every part of the loop.

| In scope | Out of scope (deliberately) |
|---|---|
| A working `v0` Release Operations Board (releases, statuses, transitions) | Multi-tenant identity / real auth |
| One agent-driven evolution, end-to-end (contract → schema → migration → UI) | A marketplace of profiles |
| Preview, approve, publish, rollback | Hosted secret vaults, org RBAC |
| Real database + real cloud deploy | Zero-downtime / blue-green deploy |

The out-of-scope column is not laziness — it is the
[boundary](/architecture/boundaries) at work. Identity, secret vaults, and
zero-downtime deploy are things a production Host owns; the framework deliberately
does not. Naming them as out-of-scope *now* is what stops the example from
quietly turning into a hosting platform.

## Stack: a cascade of Host choices

Everything in the stack is **your** choice. The framework prescribes no
framework, no database, no deploy target. So "pick the stack" is a cascade of
independent decisions — each one a slot the framework leaves open:

![A top-down decision cascade: Frontend → React; Backend → Hono on Bun; Persistence → Drizzle + Neon Postgres; Deploy target → Vercel + Docker; Agent backend → Codex app-server; all marked Host/profile choices, not framework](/diagrams/guide-stack-cascade.png)

| Decision | This example's choice | Why it is *only* an example |
|---|---|---|
| Frontend framework | React | The framework never renders your UI. |
| Backend presence + runtime | Hono on Bun | A Host may be backend-less; this one is not. |
| Contracts | Zod | One source of truth, inferred into the client. |
| Persistence | Drizzle + Neon Postgres | Swap for SQLite, R2, anything — it is a slot. |
| Deploy target | Vercel (+ Docker) | Reference adapter; fork or replace freely. |
| Agent backend | Codex app-server | `AgentBackend` is pluggable; opencode is alt evidence. |

::: tip None of this is framework semantics
Read the right-hand column twice. Bun, Hono, React, Drizzle, Neon, Vercel, Codex
— *every one* is a choice this profile makes, not a thing the framework requires.
The framework only asks that whatever you pick is **declared, bounded, and
gated** — which is exactly what the next stage does.
:::

## What the two decisions produce

Scope tells you *what the `v0` must do*. The stack tells you *what files exist to
do it*. Together they define the surface an agent will later be allowed to
evolve — and therefore the surface you must bound. That bounding is the profile
contract, and it is the next stage.

Down one more level → **[2 · Design the Generated App](./generated-app)**
