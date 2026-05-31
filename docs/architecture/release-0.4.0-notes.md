# Release Notes: pneuma-framework 0.4.0

**Status:** released
**Date:** 2026-05-31
**Chinese version:** [release-0.4.0-notes.zh-CN.md](./release-0.4.0-notes.zh-CN.md)
**Previous train:** [pneuma-rc-0.3.0 snapshot](./release-candidate-0.3.0-snapshot.md)
**Changelog:** [CHANGELOG.md](../../CHANGELOG.md)

`0.4.0` is the first version published as a plain release rather than a
release-candidate. Where 0.1–0.3 pinned developer contracts, the assurance lane,
and a minimum enterprise-governance vocabulary, **0.4.0 is the
implementation-framework train**: a real, full-stack Creation Host now *consumes*
the framework instead of re-deriving the governed loop — and the whole loop is
proven end-to-end against a real code agent, a real database, and a real cloud
deploy.

## Decision

Ship `0.4.0` as the implementation-framework release:

- keep the four-layer product model and every boundary unchanged;
- promote the governed-loop backbone and workspace mechanics into a consumable
  **Host Kit** package, so a Host wires closures rather than re-implementing
  sequencing;
- ship the real-world plumbing (code agent, deploy, database branching) as
  **opt-in reference adapters** the core never depends on;
- prove the lot with two clean-room examples driven end-to-end against live
  services;
- pin a developer-facing documentation site as the canonical entry point.

## What 0.4.0 ships

| Area | What is now part of the 0.4.0 surface |
|---|---|
| Host Kit | `@pneuma-framework/host-kit` — workspace mechanics + `buildGovernedProposal` fail-closed governed-change backbone (M45). |
| Reference adapters | `backend-codex`, `adapter-vercel`, `adapter-neon` — opt-in, batteries-included, core-independent. |
| Production profile | A Developer-authored Bun/Hono/React/Drizzle/Zod scaffold profile with Neon + Docker/Vercel targets (M52). |
| Production-host integration | Create → preview → code-agent draft → verify gate → proposal → approve/apply → publish (Neon + Vercel) → rollback, deterministic and real-Codex lanes (M53). |
| Workflow studio + debug loop | Workflow App Studio reference line (M48) and the pre-proposal Agent Debug Loop (M49). |
| Documentation site | `site/` — bilingual VitePress: Architecture, Concepts deep-dives, goal-driven Build-a-Host, agent router, `llms.txt`. |
| Clean-room examples | `examples/clean-room-release-board` + `examples/clean-room-release-host`. |

## Verification

- Full package test suite green; root typecheck green; `bun run docs:build` green.
- The production-host loop was driven against **live** services for one
  end-to-end change (adding an `environment` field): real Codex edited the draft
  across multiple files behind the `verify` gate; apply captured schema + bundle
  deltas; a Neon copy-on-write branch rehearsed the migration on real-shaped data;
  publish ran the Neon migration and a Vercel deployment that served the new field;
  rollback returned the active code version while the additive column persisted.

## Consumption notes

- Distribution is **Bun-source** by design: packages are consumed via `file:`/git,
  `main`/`types` point at `src/*.ts`. A Host must state this Bun-only constraint.
- Examples use local dependency-linking with no committed `node_modules`: run
  `bun install` at the repo root before `bun test`/`verify` on any example, or the
  harnesses fail closed with "dependencies are missing".

## Still Host-owned / deferred past 0.4.0

The boundary is intact: multi-tenant identity, hosted secret vaults, zero-downtime
deploy, and compliance audit backends remain Host-owned. Vercel/Neon and the
structured deploy receipt stay Host/example-local; promoting a structured
publish/deploy-receipt contract into a framework package is a candidate post-0.4.0
lane, not a 0.4.0 gap. See the
[1.0 readiness review](./release-1.0-readiness-review.md) for the path forward.
