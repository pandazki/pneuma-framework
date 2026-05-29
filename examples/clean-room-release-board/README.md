# Release Operations Board — Generated App scaffold

A complete, full-stack Generated Application profile: a release operations board
built on **Bun + Hono + React + Drizzle + Zod**, persisted to **Neon Postgres**,
and deployable to **Vercel** or **Docker**.

This is the *Generated Application* layer of a clean-room rebuild of the M53
"production profile" exercise. It is authored to be evolved by a code agent
behind a Creation Host (see `../clean-room-release-host`), but it is also a
complete, runnable product on its own.

> Built clean-room: the goal (a Developer-authored production stack profile that
> a Host can instantiate, let an agent evolve, and publish to a real database)
> was re-derived and re-implemented independently. The stack is a deliberate
> choice, not a framework requirement.

## What it is

A release manager's "deck": release items move through `queued → in_progress →
blocked → shipped`, each carries priority / risk / owner / SLA, and every state
change is recorded as an event on a timeline.

| Layer | Choice |
|---|---|
| Runtime | Bun |
| API | Hono (`/api/health`, `/api/summary`, `/api/items`, `/api/items/:id`, `/api/items/:id/transition`, `/api/events`) |
| Contracts | Zod (single source of truth, inferred into the client) |
| UI | React + Vite — a dark editorial "flight deck" |
| Data | Drizzle schema in a dedicated `release_board` Postgres namespace |
| Cloud DB | Neon Postgres (published data) |
| Deploy | Vercel (Edge function + static) and Docker |

Persistence is chosen from the environment: with `DATABASE_URL` set it runs on
Neon; without it, it runs on an in-memory repository (preview / local dev). The
two implementations behave identically and are both exercised by the tests.

## Run

```bash
bun install                 # at the repo root (deps are workspace-linked)
bun run --cwd examples/clean-room-release-board verify   # typecheck + tests + build
```

Local, in-memory:

```bash
bun run --cwd examples/clean-room-release-board build
PORT=8801 bun run --cwd examples/clean-room-release-board start
# → http://127.0.0.1:8801
```

Local, backed by Neon:

```bash
cp examples/clean-room-release-board/.env.example examples/clean-room-release-board/.env
# set DATABASE_URL=... in that .env (gitignored)
bun run --cwd examples/clean-room-release-board db:migrate   # idempotent: schema + seed
PORT=8801 bun run --cwd examples/clean-room-release-board start
```

`/api/health` reports `persistence: "neon" | "memory"` and a `schemaSignature`
derived from the contract — the Creation Host watches that signature change
across applied versions.

## The profile contract

`src/profile/stack-profile.ts` is the Developer-authored declaration the Host
consumes:

- **editable roots** a code agent may change (contracts, schema, repositories,
  client, migrations, tests);
- **protected roots** that must never change in a draft (`api/`, `Dockerfile`,
  `vercel.json`, `package.json`, `src/db/client.ts`, `src/db/migrate.ts`,
  `src/profile`, `.env*`);
- the `verify` / `db:migrate` / `build` commands and the health/items paths.

## Layout

```
src/shared/contracts.ts      Zod contracts + schema signature
src/shared/demo-data.ts      seed stories (real rows, not request-time fallback)
src/db/schema.ts             Drizzle schema (release_board namespace)
src/db/client.ts             Neon HTTP drizzle client
src/db/neon-repository.ts    Neon-backed repository
src/db/migrate.ts            idempotent migrations + seed-if-empty
drizzle/*.sql                migration statements
src/server/app.ts            Hono API (persistence-agnostic)
src/server/repository.ts     repository contract + in-memory implementation
src/server/local.ts          Bun entry (API + static)
api/index.ts                 Vercel Edge entry
src/client/*                 React flight-deck UI
```

## Boundary

This scaffold proves one product shape. Bun / Hono / React / Drizzle / Zod /
Neon / Vercel are the Developer's choices for *this* profile — the framework
should make such a profile possible, inspectable, and governable, not mandate
the stack.
