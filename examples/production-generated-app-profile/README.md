# Production Generated App Profile

**Status:** M52 scaffold-first production artifact pressure.
**Stack profile:** Bun + Hono + React + Drizzle + Zod + Neon.
**Design register:** product UI, guided by `impeccable`.

This example is Alice's Developer-side scaffold for a Generated Application, not the Creation Host itself. The goal is to prove that a Host can offer a real product stack before asking a Build-phase Agent to modify it.

## What This Proves First

The scaffold is intentionally verified before it is wired into the full Pneuma workflow:

1. A generated product can have a full-stack TypeScript shape.
2. The Hono API, React UI, Zod contracts, Drizzle schema, and deployment files live in one portable artifact.
3. Docker and Vercel are both represented as deployment targets.
4. Neon is configured as a provider through `DATABASE_URL`, never committed as a secret.
5. The UI has a product-grade design contract instead of inheriting rough demo aesthetics.

## Run

Install workspace dependencies after adding this example:

```bash
bun install
```

Run the checks:

```bash
bun test --cwd examples/production-generated-app-profile
bun run --cwd examples/production-generated-app-profile build
```

Run the local server after building the client:

```bash
PORT=8911 bun run --cwd examples/production-generated-app-profile serve
```

Open:

```text
http://127.0.0.1:8911/
```

Optional Neon smoke:

```bash
DATABASE_URL="postgresql://..." bun run --cwd examples/production-generated-app-profile neon:smoke
```

Do not commit real Neon credentials. Use `.env.example`, Vercel environment variables, or Docker runtime env injection.

## Stack Profile Contract

The profile is declared in `src/profile/stack-profile.ts`.

Generated artifact:

- `src/server/app.ts`: Hono app and API routes.
- `api/index.ts`: Vercel Hono function entry.
- `src/server/local.ts`: local Docker/Bun server entry.
- `src/client/*`: React product UI with local shadcn-style primitives and lucide icons.
- `src/db/schema.ts`: Drizzle schema for Neon/Postgres.
- `src/shared/contracts.ts`: Zod validation and shared types.
- `drizzle/*`: migration SQL.
- `Dockerfile`: container target.
- `.dockerignore`: keeps workspace installs and secrets out of image context.
- `vercel.json`: Vercel target.

Protected deployment files should not be casually rewritten by a Build-phase Agent. Future Host workflow should let the agent modify product code inside declared editable roots, run checks, then produce a proposal only after checks pass.

## Scaffold Demo Slices

Alice should validate this profile before wiring a real Build-phase Agent into it. The demo slices in
`src/profile/scaffold-demos.ts` are small product stories that exercise the scaffold without requiring any
agent magic:

- Critical security release: P0/critical work moves through blocked, in progress, and ready for release.
- Staging rehearsal: high-risk migration work proves transition and summary behavior.
- Release notes closeout: lower-risk release work reaches the released state.

They run inside `test/scaffold-demos.test.ts` and prove the same API, Zod validation, repository behavior,
and summary semantics that the React UI consumes. These are intentionally ordinary product cases: if they
fail, the scaffold is not ready for code-agent pressure.

Additional slices:

- Product UI contract: no raw native selects, local primitives, lucide icons, OKLCH tokens.
- Deployment shape: Docker/Vercel/Neon boundaries exist as first-class scaffold files.

## Boundary

Framework should learn from this scaffold:

- Stack profiles need explicit artifact contracts.
- Generated apps need deployment-shape evidence.
- Design contracts should be part of the scaffold, because visual quality affects whether Builders understand product value.

Framework should not absorb:

- Hono, React, Neon, Drizzle, or Vercel as core semantics;
- product UI choices;
- provider credentials;
- business domain models.
