# Production Generated App Profile

**Status:** M52 scaffold-first pressure artifact.
**Chinese version:** [production-generated-app-profile.zh-CN.md](./production-generated-app-profile.zh-CN.md)

This guide describes a concrete Generated Application stack profile that a Developer can offer from a Creation Host:

```text
Bun + Hono + React + Drizzle + Zod
Persistence: Neon Postgres
Deploy targets: Docker and Vercel
UI baseline: React product UI with shadcn-style local primitives and lucide icons
```

This is a **Developer-authored profile**, not a framework mandate. Pneuma should make this kind of profile governable and testable, but it should not absorb Hono, React, Neon, Drizzle, Vercel, or Docker as core semantics.

## Why This Exists

M45-M51 proved a Creation Host can coordinate code-agent edits, checks, proposal, approval, preview, publish, and rollback. The next risk is different:

> Can a Developer start from a real product stack scaffold, prove it works, and only then let the Build-phase Agent evolve it?

M52 answers that with a scaffold-first slice. The profile lives in:

```text
examples/production-generated-app-profile/
```

## Artifact Contract

The generated artifact contains:

| Area | Files |
|---|---|
| API | `src/server/app.ts`, `api/index.ts`, `src/server/local.ts` |
| UI | `src/client/App.tsx`, `src/client/styles.css`, local `components/ui/*` |
| Data | `src/db/schema.ts`, `src/db/client.ts`, `drizzle/0000_initial_release_operations.sql` |
| Contracts | `src/shared/contracts.ts`, `src/profile/stack-profile.ts` |
| Deployment | `Dockerfile`, `.dockerignore`, `vercel.json`, `.env.example` |
| Tests | `test/api.test.ts`, `test/deployment-shape.test.ts`, `test/design-contract.test.ts`, `test/profile.test.ts` |

The profile declares these boundaries in `src/profile/stack-profile.ts`:

- editable roots: product source, schema, shared contracts, migrations;
- protected roots: deployment entrypoints and profile configuration;
- required files: the minimum generated-app artifact surface;
- required checks: typecheck, API/UI tests, build, and optional Neon smoke.

## Demo Slices

The scaffold intentionally has small demo slices before it becomes part of a bigger Creation Host workflow:

1. **Minimum CRUD:** Hono API + Zod validation + React form.
2. **Workflow depth:** status transitions, risk/SLA vocabulary, summary metrics, and event timeline.
3. **Deployment shape:** Docker runtime, Vercel API entry, Drizzle migration, and Neon env boundary.
4. **Visual baseline:** restrained light product UI, local shadcn-style primitives, lucide icons, no raw browser selects.

These demos stabilize the scaffold. They are not meant to prove the whole Creation Host workflow by themselves.

## Verification

```bash
bun install
bun run --cwd examples/production-generated-app-profile verify
docker build -t pneuma-production-generated-app-profile:local examples/production-generated-app-profile
docker run --rm -p 8912:8911 pneuma-production-generated-app-profile:local
```

Optional Neon smoke:

```bash
DATABASE_URL="postgresql://..." bun run --cwd examples/production-generated-app-profile neon:smoke
```

Never commit a real Neon credential. Use runtime env injection, Vercel environment variables, or local `.env` files that remain ignored.

## Design Quality Bar

The scaffold includes `DESIGN_CONTRACT.md` because UI quality is part of the Developer contract. If a Builder cannot understand the generated product because it looks like a rough demo, the framework evidence is weaker.

The baseline requires:

- light product UI for operator readability;
- calm teal/sky/slate palette with OKLCH tokens;
- clear information density and stable controls;
- shadcn-style primitives and lucide icons;
- no unstyled native select controls;
- no raw `#000` or `#fff` tokens;
- no decorative card nesting.

## Framework Boundary

Framework should learn from this profile:

- stack profiles need executable artifact contracts;
- generated apps need deployment-shape evidence;
- design expectations can be part of a scaffold;
- Build-phase Agents should modify declared roots and produce checked proposals.

Framework should not absorb:

- Hono, React, Drizzle, Neon, Vercel, or Docker as required choices;
- product UI decisions;
- provider credentials;
- business-specific release workflow vocabulary.

## Next Integration Step

After the scaffold is stable, the Creation Host can use it as a profile:

```text
Builder selects profile
  -> Host copies scaffold into a draft workspace
  -> code agent edits declared roots
  -> checks run
  -> passing draft becomes a proposal
  -> Builder approves
  -> Host applies, previews, publishes, and can roll back
```

That next step should prove the end-to-end flow. M52 only makes sure the profile is worth building on.
