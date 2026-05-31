# Milestone 52 Snapshot

**Milestone:** M52, Production Generated App Profile Scaffold
**Status:** In progress, scaffold baseline verified
**Date:** 2026-05-28
**Chinese version:** [milestone-52-snapshot.zh-CN.md](./milestone-52-snapshot.zh-CN.md)

## Decision

Before wiring the next end-to-end Creation Host workflow, we need to act as Alice the Developer and prepare a real generated-product stack profile first.

M52 introduces `examples/production-generated-app-profile/` as a scaffold-first artifact:

```text
Bun + Hono + React + Drizzle + Zod
Neon Postgres provider boundary
Docker + Vercel deployment targets
React product UI with shadcn-style local primitives and lucide icons
```

This does not change framework semantics. It proves that a Developer can define a concrete profile with checks, deployment shape, persistence boundary, and visual quality before a Build-phase Agent is allowed to evolve it.

## Why This Matters

The previous Workflow App Studio line proved the governed Builder/Agent loop. The user correctly identified a different risk: if the starting scaffold is weak, the full workflow becomes a demo path instead of a product path.

M52 therefore moves one step earlier:

```text
Developer chooses stack
  -> Developer prepares scaffold
  -> scaffold proves API / UI / data / deployment / visual baseline
  -> only then Host asks code agent to evolve it
```

## What Was Added

New example:

```text
examples/production-generated-app-profile/
```

Core files:

- `src/server/app.ts`: Hono API with health, summary, item creation, transitions, and event timeline.
- `src/client/App.tsx`: React product UI for a release-operations board.
- `src/client/components/ui/*`: local shadcn-style Button, Badge, Field/Input/Textarea primitives.
- `src/shared/contracts.ts`: Zod schemas shared by client/server.
- `src/db/schema.ts`: Drizzle schema for Neon/Postgres.
- `drizzle/0000_initial_release_operations.sql`: explicit Postgres migration.
- `api/index.ts`: Vercel Hono entry.
- `Dockerfile`: Bun local server container target.
- `DESIGN_CONTRACT.md`: visual baseline guided by the `impeccable` product register.
- `src/profile/stack-profile.ts`: generated artifact contract, editable/protected roots, checks, and design bans.
- `src/profile/scaffold-demos.ts`: Alice-authored product demo slices that validate the scaffold before agent pressure.

Developer guide:

- [Production Generated App Profile](../developer/production-generated-app-profile.md)
- [中文版](../developer/production-generated-app-profile.zh-CN.md)

## Demo Slices

The scaffold now has small, independently verifiable slices:

1. **Minimum CRUD:** API validation, create form, and local repository.
2. **Workflow depth:** risk/SLA/status vocabulary, transition actions, summary metrics, event timeline.
3. **Deployment shape:** Vercel entry, Docker target, Drizzle migration, Neon env boundary.
4. **Visual baseline:** restrained light product UI, local primitives, lucide icons, no raw browser select.
5. **Alice's demo stories:** critical security release, staging rehearsal, and release-notes closeout run as product scenarios through Hono + Zod + repository tests.

## Verification

Local verify:

```bash
bun run --cwd examples/production-generated-app-profile verify
```

Result:

```text
typecheck passed
14 tests passed
vite build passed
```

Docker build and runtime smoke:

```bash
docker build -t pneuma-production-generated-app-profile:local examples/production-generated-app-profile
docker run --rm -d --name pneuma-production-scaffold-smoke -p 8912:8911 pneuma-production-generated-app-profile:local
curl http://127.0.0.1:8912/api/health
```

Observed result:

```json
{"ok":true,"runtime":"bun","persistence":"memory-demo"}
```

Neon provider smoke:

```bash
DATABASE_URL="postgresql://..." bun run --cwd examples/production-generated-app-profile neon:smoke
```

Observed result:

```text
passed against the demo Neon database
```

The credential was not committed.

Browser visual check:

```text
http://127.0.0.1:8911/
```

Evidence screenshot:

```text
/tmp/pneuma-m52-production-scaffold.png
```

## Boundary Review

Framework should learn:

- stack profiles need executable artifact contracts;
- scaffold quality should include deployment and visual evidence;
- Build-phase Agents need a high-quality starting point before code-change proposals;
- design contracts are legitimate Developer-authored guardrails.

Framework should not absorb:

- Hono, React, Neon, Drizzle, Docker, or Vercel as framework choices;
- product UI layout or color choices;
- provider credentials;
- business-specific release-operations vocabulary.

## Remaining Work

M52 is not the full end-to-end Creation Host flow. The next step is to connect this profile back into the Creation Host loop:

```text
Builder selects production profile
  -> Host creates draft workspace from scaffold
  -> code agent changes real generated source
  -> checks and debug loop run
  -> passing draft becomes proposal
  -> Builder approves
  -> preview / publish / rollback prove the generated product
```

Until that is complete, the broader goal remains active.
