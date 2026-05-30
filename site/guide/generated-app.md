# 1 · The Generated App

*Idea → design.* Before any agent touches anything, the Developer builds a
complete, useful `v0` and declares its **profile contract**. A profile is a real
product stack, bounded so a Host can instantiate it, let an agent evolve it
behind guardrails, and publish it safely.

> Source: `examples/clean-room-release-board`.

## A complete v0, not a mock

The Generated App is a full-stack Release Operations Board:

| Layer | Choice |
|---|---|
| Runtime | Bun |
| API | Hono — `/api/health`, `/api/summary`, `/api/items`, `/api/items/:id/transition`, … |
| Contracts | Zod — one source of truth, inferred into the client |
| Data | Drizzle schema in a dedicated `release_board` Postgres namespace |
| Cloud DB | Neon Postgres |
| Deploy | Vercel (Edge function + static) and Docker |
| UI | React — a product surface, with local primitives |

The stack is a **deliberate choice**, not a framework requirement. The point is
that it is *declared, tested, and bounded* — so an agent can change it without
breaking the contract.

Persistence is chosen from the environment: with `DATABASE_URL` set it runs on
Neon; without it, on an in-memory repository (preview / local dev). The two
behave identically and are both covered by tests.

## The profile contract

The single most important file is the Developer-authored declaration the Host
consumes (`src/profile/stack-profile.ts`):

```ts
export const releaseBoardProfile = {
  generatedArtifact: {
    editableRoots: [
      "src/shared", "src/server/app.ts", "src/db/schema.ts",
      "src/db/neon-repository.ts", "src/client", "drizzle", "test",
    ],
    protectedRoots: [
      "api", "Dockerfile", "vercel.json", "package.json", "tsconfig.json",
      "src/db/client.ts", "src/db/migrate.ts", "src/profile", ".env",
    ],
    verifyCommand: ["bun", "run", "verify"],   // the pre-proposal gate
    migrateCommand: ["bun", "run", "db:migrate"],
    buildCommand: ["bun", "run", "build"],
    healthPath: "/api/health",
    itemsPath: "/api/items",
  },
  deployTargets: ["local", "docker", "vercel"],
};
```

Two ideas do all the work here:

- **Editable roots** are what an agent may change (the contract, schema,
  repositories, UI, migrations, tests).
- **Protected roots** are what it must never change — deployment, infra, and
  contract files. A draft that touches one is rejected *before* verify even runs.

## The `verify` gate

The scaffold owns its own definition of "correct":

```json
{ "verify": "bun run typecheck && bun run test && bun run build" }
```

This single command is what the Host uses as the **pre-proposal gate**. The
framework never decides whether your app is valid — your scaffold does. Keep
`verify` honest and fast, because every agent turn is gated by it.

## Schema discipline

A few rules keep evolution safe and observable:

- **Migrations are additive & idempotent** — `CREATE TABLE IF NOT EXISTS`,
  `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. There are no down-migrations.
- **Forward-compatible reads** — the repository selects only columns it knows,
  so an extra column from a newer version is harmless.
- **A schema signature** derived from the contract (not hand-written) lets the
  Host watch the data model change across applied versions.

With a complete, bounded `v0` in hand, the next step is to put it behind a
Creation Host. → **[2 · The Creation Host](./creation-host)**
