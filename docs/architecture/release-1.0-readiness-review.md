# Release 1.0 Readiness Review

**Date:** 2026-05-29
**Reviewer pass:** whole-project review after M53 closure, oriented toward a 1.0 release decision.
**Chinese version:** [release-1.0-readiness-review.zh-CN.md](./release-1.0-readiness-review.zh-CN.md)

## 1.0 definition adopted for this review

This review evaluates readiness against **Definition A** (the chosen target):

> **pneuma-framework 1.0 is a stable, Bun-resident implementation framework and contract set for Developers building single-Builder or team-organized Creation Hosts.** Multi-tenant identity, production credential vaults, distributed/concurrent governance, deployment abstraction, and compliance audit backends are **explicitly Host-owned and out of 1.0 scope.**

Definition A is achievable. The work that remains is mostly **release engineering and boundary declaration**, not new framework primitives. A separate, far larger "anyone ships a production app by talking" claim (Definition B) is *not* what 1.0 asserts and is left to post-1.0 milestones.

## Verified health (measured this pass)

These were run, not assumed:

| Check | Result |
|---|---|
| `bun run typecheck` (13 tsconfigs) | ✅ pass |
| `bun test packages/` (~142 test files) | ✅ pass |
| `examples/production-profile-host` tests | ✅ 4 pass / 0 fail (after `bun install`) |
| `examples/production-generated-app-profile` verify | ✅ 14 pass + build |
| Branch state | ✅ `HEAD == main`, clean tree |
| Test discipline | ✅ no stray `.only` / `.skip` / `.todo` (one intentional `skipIf(!HAS_PYTHON)`) |
| **CI** | ❌ **none** — no `.github/`, no workflow; 600 commits verified manually only |

**Takeaway:** the code is healthy, but there is **no automated gate**. For a 1.0 train this is the first thing to fix, because every subsequent step needs something to enforce it.

> Operational note already folded into CLAUDE.md: examples use local dependency-linking (no committed `node_modules`). Run `bun install` at the repo root before testing any example, or harnesses fail closed with "dependencies are missing."

## Completeness: the 8 framework in-scope responsibilities

| # | Responsibility | Maturity | Evidence |
|---|---|---|---|
| 1 | Lifecycle verb set + script protocol | **FULL** | `packages/core/src/lifecycle.ts`, `env.ts`, `markers.ts`, `artifact.ts` — 7 verbs, stdout markers, exit/artifact conventions |
| 2 | Program-level process management | **FULL** | `packages/core/src/process-manager.ts` — process groups, log streaming, crash observation, on-demand restart |
| 3 | Semantic tool API for the Build-phase Agent | **FULL** | `packages/core/src/tools/*` + `mcp-server.ts` — 20+ governed tools (definition / observation / checkpoint / release) |
| 4 | Framework-state observation | **FULL** | `tools/observation.ts` — `lifecycle.state`, `lifecycle.logs`, `workspace.tree` |
| 5 | Build-preview loop + SDKs | **PARTIAL** | `packages/core/src/wire-protocol/*` + `packages/viewer-react/*`. Wire protocol and **React SDK are complete; the promised Vanilla JS SDK was never implemented** (the manifest enum `sdk: "react" \| "vanilla" \| "custom"` allows declaring it, but no implementation ships). |
| 6 | AgentBackend abstraction | **FULL** | `packages/core/src/agent-backend/*` + `backend-opencode` — claude-code / codex / opencode / fake, `runTurn` contract |
| 7 | Shadow-git / checkpoint / replay | **FULL** | `packages/core/src/shadow-git.ts` + `tools/checkpoint.ts` — JSONL index, rewind safeguards |
| 8 | Creation Host / profile contract | **FULL** | `TemplateManifest` (`schemaVersion: 1`) in `core/src/types.ts` + `host-kit/*` helpers |

**Takeaway:** the core primitives are mature, coherent, and pressure-tested across M1–M53. The only *implementation* gap is the **Vanilla SDK** (item 5) — promised in the framework charter, never built.

## Distribution model (important — corrects a common misread)

The framework deliberately ships **TypeScript source consumed by Bun via `file:`/git**, not built `dist` artifacts published to the npm registry. `scripts/check-local-package-consumption.ts` consumes packages by `file:` and imports straight from `.../cli/src/index.ts`, filtering out `dist`. So `main`/`types` pointing at `src/*.ts` is **intended**, not a defect.

Consequences to declare explicitly at 1.0:

- **Bun-only.** Non-Bun / Node consumers are unsupported. This must be stated in the README, because it bounds "anyone can build."
- No npm-registry publishing flow is part of 1.0; consumption is `file:`/git source.

## Gaps that bear on 1.0, grouped

### A. Must-fix release engineering (independent of product scope)

1. **No CI gate.** Add automation for `typecheck` + `bun test` + `test:package-consumption` + at least one example `bun install` + test. Land this first.
2. **Public API surface is not frozen.** `core` exposes ~85 root exports across 19 subpaths; `core-domain` re-exports everything via 41 `export *` star exports. This makes internal modules part of the public contract and blocks post-1.0 refactoring without breakage. 1.0 should **curate and freeze** the public surface (explicit allow-list, hide internals).
3. **No CHANGELOG / semver policy / deprecation timeline.** `packages/core/src/build-thread.ts` still exports 5 `@deprecated` helpers. At 1.0, either remove them or commit to a documented support window.
4. **Vanilla SDK decision.** Either implement it to honor the "two built-in SDKs" charter, or **explicitly downgrade the promise** to "React SDK + open wire protocol; vanilla is bring-your-own."

### B. Scope boundaries to declare (resolved by Definition A)

Under Definition A these are not blockers — they are **boundary statements** the README/spec must make explicit so the 1.0 claim is honest:

5. Multi-user / concurrent definition writes, production IAM, credential vaults, compliance audit retention → **Host-owned, out of 1.0.** (Framework provides vocabulary + reference helpers only; see `OPEN-QUESTIONS.md`.)
6. Deployment abstraction → **Host-owned.** Framework "should learn the shape of a structured publish/deploy receipt" (M53 snapshot) but has not; Vercel/Neon live only in the M53 example. Either promote a minimal receipt *contract* (no provider lock-in) or state deployment is Host-owned.
7. Bun-only runtime constraint → state it.

### C. External validation (the largest cognition gap)

8. **The core promise is proven only by curated internal examples — no external Developer has built a Host from zero using only the docs.** `docs/developer/downstream-validation-brief.md` exists but has never been executed. `scaffold-host` produces an ~8-line stub, and there is **no documented "scaffold → runnable Host" small-step sequence** — a newcomer must reverse-engineer 2K–4K-line examples. This is the single most important thing to close before claiming 1.0 credibility.

## Proposed 1.0 gate (Definition A)

A focused closure milestone, in dependency order:

1. **CI** — automate the verified checks above so every later step is enforced.
2. **Freeze the public API** — curate `core` / `core-domain` exports into an explicit public surface; resolve the `@deprecated` BuildThread helpers; add CHANGELOG + a one-page semver/stability policy.
3. **Vanilla SDK decision** + README boundary section (Bun-only; Host-owned production concerns; deployment ownership).
4. **"Scaffold → runnable Host" walkthrough** — a documented small-step path from `scaffold-host` to a Host that creates, previews, evolves, approves, publishes, and rolls back, linking (not requiring the reading of) the large examples.
5. **One real external validation run** of the downstream brief; collect gaps; fix the top few.
6. **Tag `pneuma-1.0.0`** with the boundary explicitly stated.

## Bottom line

- **Framework primitives:** 1.0-grade (7 of 8 in-scope items FULL; only the Vanilla SDK is an open implementation promise).
- **Release engineering:** not yet 1.0-grade (no CI, unfrozen API surface, no changelog/semver discipline).
- **External-developer onboarding:** unproven (no zero-context external build; scaffold-to-Host path undocumented).

Definition A 1.0 is reachable through a single focused closure milestone whose work is mostly engineering hygiene, boundary declaration, and one external validation — not new primitives.
