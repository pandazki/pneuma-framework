# Release Host — Creation Studio

A clean-room Creation Host that wires the `../clean-room-release-board`
production profile into a full governed lifecycle:

```text
create-from-profile → preview/publish v0
  → code-agent draft (deterministic | Codex app-server)
  → scaffold `verify` as the pre-proposal gate
  → proposal → approve/apply vNext
  → publish (local Bun | Vercel REST) with Neon migration
  → rollback
```

It exists to prove the framework idea end to end: a Developer prepares a real
stack profile, a Builder creates a complete app from it, a **real code agent**
evolves it behind guardrails, and the result is published to a **real database**
and a **real cloud deployment** — with the database schema and packaged bundle
change made visible after every apply.

> Built clean-room from the M53 goal. The Codex app-server transport and the
> Vercel REST adapter are re-implemented here from the published integration
> shape, not copied from the existing example's product code.

## The two surfaces

Theme polarity tells you which framework layer you are looking at:

- **Creation Host (this app)** — a *light* operational console. The hero is a
  7-stage lifecycle pipeline; evidence (version ids, schema signatures, deploy
  receipts) reads as monospace data.
- **Generated Application** (`../clean-room-release-board`) — a *dark* editorial
  flight deck for End Users.

## Run

```bash
bun install   # at repo root

# build the studio UI, then serve the control plane
bun run --cwd examples/clean-room-release-host build
PORT=8870 bun run --cwd examples/clean-room-release-host serve
# → http://127.0.0.1:8870
```

Agent lane (default is the deterministic, no-AI lane used by tests/CI):

```bash
PORT=8870 PNEUMA_AGENT=codex-app-server \
  bun run --cwd examples/clean-room-release-host serve
```

The Codex lane drives the local `codex app-server` over JSON-RPC against a draft
workspace. It detects turn completion on either a `turn/completed` event or a
`thread/status/changed` → `idle` (codex 0.128 emits the latter for longer
turns). If neither arrives before the host timeout, the host does **not** trust
the transcript: it kills the process, verifies the draft, and only continues to
a proposal when the scaffold's own `verify` still passes (fail-closed).

Publish to Neon + Vercel (credentials via env / a gitignored `.env`):

```bash
DATABASE_URL=postgresql://… \
VERCEL_TOKEN=… VERCEL_PROJECT=clean-room-release-board \
PORT=8870 PNEUMA_AGENT=codex-app-server \
  bun run --cwd examples/clean-room-release-host serve
```

Offline harness test (deterministic lane, no network):

```bash
bun test --cwd examples/clean-room-release-host
```

## What the Host observes

After every applied version the studio records three deltas so an evolution's
effect is concrete, not asserted:

1. **App contract schema signature** — `release_items(… )` before → after.
2. **Packaged client bundle** — total size + content signature before → after.
3. **Neon schema** — `information_schema` columns in the `release_board`
   namespace after the publish migration (a newly added column is highlighted).

## Lifecycle mechanics

- **Preview** runs from a disposable in-memory copy of the active version — it
  never writes the production database.
- **Publish** runs the scaffold's `db:migrate` against Neon *first*, then either
  serves a local Bun runtime backed by Neon or deploys the version through the
  Vercel REST API (content-addressed two-phase upload → poll READY → smoke
  `/api/health` + `/api/items`). It returns a structured receipt.
- **Apply** materializes the draft as `versions/vN`; **rollback** restores the
  previous version.
- The agent may only change the profile's declared **editable roots**; a draft
  that touches a **protected** path (deploy/infra/contract files) is rejected
  before verify even runs.

## Interactive build loop

The studio supports an iterate-until-satisfied loop, not just one-shot changes:

- **Iterative proposals** — while a proposal is un-applied, running the agent
  again stacks fixes/additions onto the *same* draft (it does not restart from
  the active version). The button reads "Refine proposal"; every turn is
  re-gated by the scaffold's `verify`.
- **Preview the draft** — preview the pending proposal before approving, from a
  disposable in-memory copy ("Preview draft").
- **Preview Data Rehearsal on a Neon branch** — "Rehearse on Neon branch"
  creates a copy-on-write Neon branch from production (real data), runs the
  draft's migration against the *branch*, and previews against it. Writes during
  the rehearsal hit the branch only; production is untouched. The branch is
  deleted when the preview stops. Data is never merged back — only the verified
  forward migration reaches production at publish time. Requires `NEON_API_KEY`
  (and `NEON_PROJECT_ID` for org-scoped keys); the Postgres connection string
  alone cannot drive Neon's control plane.
- After **apply** or **rollback**, a running preview is stopped so the UI never
  shows a stale version.

## What it consumes from the framework

Rather than re-implement the plumbing, this Host consumes framework packages —
the point being that a real Host *consumes*, it does not re-derive:

| Package | Used for |
|---|---|
| `@pneuma-framework/host-kit/workspace` | copy / list / hash / `diffTrees` / `isProtected` |
| `@pneuma-framework/host-kit/governed-change` | `buildGovernedProposal` — the fail-closed proposal gate |
| `@pneuma-framework/backend-codex` | the Codex app-server code-agent lane (signal-set completion) |
| `@pneuma-framework/adapter-vercel` | the Vercel REST deploy lane (structured receipt) |
| `@pneuma-framework/adapter-neon` | Neon branching for Preview Data Rehearsal |

Those packages are reference adapters / Host Kit helpers — opt-in, swappable,
and never depended on by the framework core.

## Layout

```
src/host.ts              lifecycle orchestration + schema/bundle observation
                         (consumes host-kit governed-change + the adapters above)
src/workspace.ts         linkDependencies (Bun-specific) + re-export host-kit/workspace
src/run.ts               run commands, start disposable Bun runtimes
src/observe.ts           Neon schema inspection + client bundle manifest
src/agents/deterministic.ts   no-AI lane (used by tests/CI)
src/server.ts            control-plane JSON API + studio UI host
src/ui/*                 light operational console (React)
```

## Boundary

The framework should learn the *shapes* exercised here — lifecycle vocabulary,
scaffold verify as a pre-proposal gate, fail-closed agent timeouts, structured
publish/deploy receipts, schema/bundle observation. It should not absorb the
release-operations domain, the Bun/Hono/React/Drizzle/Zod stack, or Neon/Vercel
as required choices. Those stay Host- and profile-owned.
