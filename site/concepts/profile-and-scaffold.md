# Profile & scaffold

Before an agent can safely change a generated app, someone has to decide *what an
agent is allowed to touch*. That decision is the **scaffold project** — a
Developer-authored source boundary — and a **profile** is the thing that
instantiates one into a fresh `v0`.

![A scaffold project split into writable roots the agent may edit and protected paths it may not, with a manifest declaring verify and lifecycle commands](/diagrams/profile-scaffold.png)

## Why the boundary exists

A generated app is real source code: a server, a schema, a client, lifecycle
scripts, and the framework integration that wires it into the Host. If you hand
all of that to a code agent, two things go wrong. The agent can break the
framework wiring (and now nothing works and nobody knows why), and you have no
stable surface to diff against. The scaffold fixes both by drawing an explicit
line *up front*, authored by the Developer, not negotiated per-change.

This is pinned by **ADR-0033 (Scaffold Project Contract)**. The contract lives in
a manifest — `pneuma.scaffold.json` — and `doctor-host` validates it.

## What the manifest declares

The `ScaffoldProjectManifest` is small but load-bearing:

```jsonc
{
  "artifact_boundary": {
    "writable_roots":  ["src/app/**"],   // the agent may edit only here
    "protected_paths": ["src/framework/**", "scripts/**"],
    "generated_roots": ["dist/**"],
    "share_exclude":   [".env"]          // secrets never travel in a share
  },
  "agent_contract": {
    "allowed_tasks":   ["..."],
    "forbidden_tasks": ["..."],
    "tool_policy":     "draft-workspace-only"
  },
  "guardrails": {
    "pre_proposal": [ /* run before we ask for approval */ ],
    "pre_apply":    [ /* run after approval, before mutating */ ],
    "post_apply":   [ /* run after files are copied */ ]
  },
  "lifecycle": { "preview": "...", "build": "...", "test": "...", "publish": "..." }
}
```

Two fields carry most of the weight:

- **`writable_roots`** — the *only* paths a draft may change. Anything outside is
  rejected before the change is ever shown to the Builder. `protected_paths` must
  not overlap `writable_roots`; `doctor-host` fails the manifest if they do.
- **`guardrails`** — three named phases that the [verify gate](./verify-gate) and
  [apply](./apply-and-versions) hang off of. `pre_proposal` is the gate that
  decides whether a draft is even allowed to become a proposal.

## Profile = the thing that makes a `v0`

A **profile** is a Developer-authored, ready-to-run generated-app template plus
its scaffold manifest. Instantiating a profile yields a *complete* `v0` — it
previews and publishes immediately, with no agent work required. Agent evolution
is optional; a profile that needs an agent turn before it runs is a broken
profile.

The reference profile proven end-to-end is a production stack —
Bun + Hono + React + Drizzle + Zod, with a Neon persistence boundary and
Docker/Vercel deploy targets. But none of that is framework semantics: the stack,
the domain, and the UI are **all Host/profile choices** (see
[Boundaries](/architecture/boundaries)). The framework only cares that the
manifest declares a writable boundary and a `verify` command it can use as a gate.

## Why a Developer owns it, not the agent

The scaffold is the one artifact in the loop the agent is *not* allowed to author.
It is the constitution the agent operates under: it defines the agent's powers
(writable roots), its limits (protected paths, forbidden tasks), and the test it
must pass (guardrails). Letting the agent rewrite its own constitution would
defeat the purpose. So the Developer writes the scaffold once; the Builder and
the agent then evolve the app *within* it, forever.

Next: the draft workspace and [the verify gate](./verify-gate) that the
`pre_proposal` guardrail drives.
