# 4 · Run the loop

*Everything is wired — now drive it.* This is the payoff: the full loop driven
through the studio, against real services — a real code agent, a real database
branch, a real cloud deploy. No mocks.

![The governed loop as a cycle: create → preview → agent draft → verify gate → proposal → approve & apply → publish → rollback](/diagrams/governed-loop.png)

## The flow

```text
Create from profile        → a complete v0
Evolve with real Codex      → an end-to-end change (contract + schema +
                               migration + repositories + UI), behind the gate
Rehearse on a Neon branch   → preview the change on real data, production untouched
Approve & apply             → vNext, with schema + bundle deltas observed
Publish to Vercel           → Neon migration, then a real deployment
Verify live                 → the evolved app, Neon-backed, reachable
Rollback                    → back to the previous code version
```

## What actually happened

Driving exactly this against the live services produced, for one change (adding
an `environment` field end to end):

- **Real Codex** edited the draft across 8 files (Zod contract, Drizzle schema, a
  new idempotent migration, both repositories, the React UI, the tests) and the
  draft passed `verify` before any proposal appeared.
- **The studio recorded the deltas** at apply time — the app schema signature
  `…risk,owner…` → `…risk,environment,owner…`, and the client bundle
  `211.4 kB` → `211.8 kB`.
- **The Neon branch rehearsal** showed the new column on a branch carrying real
  production rows, while production itself still lacked it — then the branch was
  deleted on stop.
- **Publish** ran the migration against Neon (adding the column to production)
  and created a Vercel deployment that reported `READY`; the live app served
  `persistence: neon` with the new field present.
- **Rollback** moved the active version back; the additive column stayed in the
  database (forward-compatible), and re-publishing the previous version reverted
  the live deployment — the [rollback semantics](/concepts/rollback)
  in practice.

::: tip A real lesson, captured
On a longer turn, Codex finished its edits but the completion event the host
matched never arrived; the run hit the timeout. That is exactly when fail-closed
earns its keep — the host killed the process, ran `verify`, it passed, and a
correct proposal was built. (The lane now also resolves on the backend's `idle`
signal, and uses a generous timeout, so normal turns finish promptly.)
:::

## Run it yourself

Install once (examples use local dependency-linking, so `bun install` at the
repo root is required before testing any example):

```bash
bun install
```

The Generated App on its own:

```bash
bun run --cwd examples/clean-room-release-board verify
```

The Creation Host studio — deterministic lane, fully offline, no credentials:

```bash
bun test --cwd examples/clean-room-release-host
bun run --cwd examples/clean-room-release-host build
PORT=8870 bun run --cwd examples/clean-room-release-host serve   # → http://127.0.0.1:8870
```

The full real flow — Codex code agent, Neon branching, Vercel deploy — via env
(keep credentials in a gitignored `.env`):

```bash
DATABASE_URL=…  \
VERCEL_TOKEN=…  VERCEL_PROJECT=…  \
NEON_API_KEY=…  NEON_PROJECT_ID=…  \
PORT=8870 PNEUMA_AGENT=codex-app-server \
  bun run --cwd examples/clean-room-release-host serve
```

Then open the studio and walk the pipeline: **Create from profile → Run/Refine
agent → Preview draft or Rehearse on Neon branch → Approve & apply → Publish →
Rollback.**

## What you proved

A Builder created and evolved a real application by talking to an agent — and the
Host that made it possible was mostly closures wired to framework contracts and
opt-in adapters. That is the framework's promise, demonstrated: you get the
governed loop; you keep your product.
