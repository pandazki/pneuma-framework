# Clean-room production rebuild — evidence & findings

**Date:** 2026-05-29
**Chinese version:** [clean-room-production-rebuild.zh-CN.md](./clean-room-production-rebuild.zh-CN.md)

An independent, clean-room rebuild of the M53 "production profile" exercise: the
same goal and the same stack (Bun + Hono + React + Drizzle + Zod + Neon +
Vercel + Codex), re-derived from the *target* and re-implemented without reading
the existing example's product code. It doubles as a real test of the 1.0
question "can the framework's core promise be rebuilt from the goal?"

Artifacts:

- `examples/clean-room-release-board/` — the Generated Application scaffold (a
  Release Operations Board), with a dark "flight deck" product UI.
- `examples/clean-room-release-host/` — the Creation Host studio, with a light
  operational control-plane UI.

The Codex app-server transport and the Vercel REST deploy adapter were the only
parts allowed to consult the existing example — for *integration mechanics only*
(protocol, endpoints, env), not product logic.

## What was proven, end to end, with real services

Driven through the browser studio (`http://127.0.0.1:8870`):

1. **Create from profile** → a complete `v0` Release Operations Board.
2. **Evolve with real Codex** → `codex app-server` edited a draft workspace and
   added an `environment` field (production / staging / development) **end to
   end**: Zod contract, Drizzle schema, a new idempotent migration, both
   repositories, the React UI (status chip + a new composer select), and the
   tests — 8 files.
3. **Pre-proposal verify gate** → the scaffold's own `bun run verify` is the
   gate; only a passing draft became a Builder-visible proposal.
4. **Apply v1** → the studio recorded the observed deltas:
   - app contract schema signature: `…risk,owner…` → `…risk,environment,owner…`
   - packaged client bundle: 211.4 kB · `4d0ce8d8f5f4` → 211.8 kB · `c1efd5cee3e4`
5. **Publish v1 to Vercel** → ran the Neon migration first (adding the
   `environment` column to the real `release_board.release_items` table), then a
   real Vercel REST deployment (`dpl_…`, 27 files, READY), and smoke-tested it.
6. **Live, Neon-backed, evolved** → the published Vercel app reports
   `persistence: neon`, a schema signature including `environment`, and serves
   real Neon rows carrying `environment: production`. The Codex UI edit (the
   `env` chip and the ENVIRONMENT select) is live in production.

Schema and bundle changes were observed **after each apply** (studio "Version
history" + "Proposal" cards), and the Neon column delta after publish (the
receipt highlights the newly added `release_items.environment`).

## Findings that feed the 1.0 review

This rebuild confirmed the framework's shape is reproducible from the goal, and
surfaced three concrete, real-world gaps worth recording:

1. **Code-agent turn-completion event drift (root cause found; fix added).**
   `codex` CLI 0.128 emits `turn/completed` for short turns but, for longer
   turns, signals completion only via `thread/status/changed` with
   `status.type === "idle"`. The lane first matched `turn/completed` only, so a
   long run never detected completion and waited out the full 600s timeout
   before the **fail-closed** verify path took over — correct, but ~10 min slow.
   A protocol probe captured the exact payloads (`{type:"active"}` at turn
   start, `{type:"idle"}` at end); the lane now resolves on `turn/completed`
   **or** an `idle` status that follows an `active` for the same thread, with the
   fail-closed timeout retained as a backstop. There was also a second factor:
   codex turn duration is **variable** and sits near the cap for moderately
   complex changes (the same prompt finished in 363s on one run and exceeded
   600s on another), so the cap was raised 600s → 900s to absorb the variance.
   An instrumented run then confirmed the path end to end: `status=active` at
   turn start, `status=idle` at end (~353s), resolved via "turn completed via
   thread/status idle", `agentNote: "codex turn completed"`. Lesson for the
   framework: a code-agent lane contract should treat "turn done" as a
   backend-specific signal *set* with a generous, configurable cap, and a
   fail-closed timeout is what keeps a missed signal (or a genuinely oversized
   turn) safe rather than wrong.

2. **Cloud deploy protection is real.** A fresh Vercel project ships with
   Deployment Protection on, so the deployment was `READY` but returned `401`
   to the post-deploy smoke. A publish/deploy-receipt contract needs a first-
   class notion of an access/bypass credential, not just a URL — otherwise
   "deployed" and "reachable" diverge.

3. **Host state restore is a real UX requirement.** The first studio build did
   not reload the active project on refresh, so a page reload looked like "no
   project." Any real Creation Host needs durable project/session restore, not
   just in-memory state.

## Follow-up: the biggest finding, acted on

The strongest signal from this rebuild was that the Host harness was built
*without consuming the framework's packages* — the framework supplied the ideas,
not the reach-for-it code. As a first step toward closing that gap, the
stack-agnostic backbone was promoted into `@pneuma-framework/host-kit`:

- `@pneuma-framework/host-kit/workspace` — copy / list / hash / `diffTrees` /
  `isProtected` tree mechanics.
- `@pneuma-framework/host-kit/governed-change` — `buildGovernedProposal`, a
  closure-driven, fail-closed proposal backbone (the host supplies `runAgent` /
  `isAgentTimeout` / `verify` / `observe`; the framework owns the sequencing and
  the gating). Unit-tested for the no-change / protected-root / verify-failed /
  fail-closed-timeout invariants.

`examples/clean-room-release-host` now consumes `host-kit/workspace` instead of
its own copy — proving the path is *consume*, not *re-derive*. The deeper
mechanics (code-agent debug loop, publish/rollback, Preview Data Rehearsal)
already exist in Host Kit (`runHostKitCodeAgentDebugLoop`, `publishVerifiedVersion`,
`runPreviewDataRehearsal`) and are the natural next things for a Host to adopt.

## How to reproduce

```bash
bun install   # repo root

# Generated App on its own (Neon optional)
bun run --cwd examples/clean-room-release-board verify

# Creation Host studio, deterministic lane (offline)
bun test --cwd examples/clean-room-release-host

# Full real flow: build studio, serve with Codex + Neon + Vercel, drive in browser
bun run --cwd examples/clean-room-release-host build
DATABASE_URL=… VERCEL_TOKEN=… VERCEL_PROJECT=… \
PORT=8870 PNEUMA_AGENT=codex-app-server \
  bun run --cwd examples/clean-room-release-host serve
```

See the example READMEs for the full surface and boundary notes:
[`examples/clean-room-release-board/README.md`](../../examples/clean-room-release-board/README.md),
[`examples/clean-room-release-host/README.md`](../../examples/clean-room-release-host/README.md).

## Boundary

The framework should learn the *shapes* this rebuild exercised — lifecycle
vocabulary, scaffold `verify` as a pre-proposal gate, fail-closed code-agent
timeouts, structured publish/deploy receipts (with access credentials), and
schema/bundle observation. It should not absorb the release-operations domain,
the Bun/Hono/React/Drizzle/Zod stack, or Neon/Vercel as required choices.
