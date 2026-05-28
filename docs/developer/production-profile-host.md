# Production Profile Host Example

**Status:** M53 product-shaped Creation Host example.
**Chinese version:** [production-profile-host.zh-CN.md](./production-profile-host.zh-CN.md)

This document explains the full example behind:

```text
examples/production-generated-app-profile/
examples/production-profile-host/
```

The pair is intentionally split:

- `production-generated-app-profile` is Alice's Developer-authored Generated Application scaffold.
- `production-profile-host` is the Creation Host harness that lets Bob create, preview, evolve, approve, publish, and roll back that scaffold as a Generated Application.

The goal is not to make Bun, Hono, React, Drizzle, Neon, Vercel, or Codex mandatory framework choices. The goal is to show that a Developer can prepare a real product stack, give it to a Creation Host, let a real code agent evolve it behind guardrails, and publish a real app backed by a real database.

## Why This Example Matters

Earlier examples proved the framework model in narrower slices: governed definition rows, Builder approval, code-change lanes, release rollout state, Host Kit, and agent debug loops.

This example combines those ideas into a more recognizable product path:

```text
Developer prepares a production stack profile
  -> Builder creates a complete v0 app from that profile
  -> Builder can preview or publish v0 immediately
  -> Builder asks a real code agent for a product evolution
  -> Host verifies the generated app before showing a proposal
  -> Builder approves one checked proposal
  -> Host applies vNext, previews it, publishes it to Vercel, and can roll back
```

That makes the example representative in a way a small mock cannot be:

- the Generated App has a real full-stack shape;
- the Creation Host and Published App have different product surfaces;
- preview is disposable and does not write production data;
- publish runs migration and cloud deployment;
- Neon is the source of truth for published data;
- Vercel deployment returns structured evidence;
- Codex app-server can make real source edits, but only inside the scaffold boundary;
- the Host keeps proposal, approval, verification, publish, and rollback explicit.

## Product Story

Alice is the Developer. She wants her Creation Host to offer a "Production Generated App" profile.

Bob is the Builder. He opens the Host and creates a **Release Operations Board**. The v0 app is already usable. Bob can preview it locally, publish it, or ask the Build-phase Agent to evolve it.

End Users open the Published Application. They do not need to understand the build loop. They see a normal release-operations product with queue, evidence, data entry, transitions, and a production database.

## Technology Stack

### Generated Application

The generated product profile uses:

| Layer | Choice | Purpose |
|---|---|---|
| Runtime | Bun | Single TypeScript runtime for local, Docker, and Vercel-oriented flows. |
| API | Hono | Small typed HTTP surface for health, summary, items, events, and transitions. |
| UI | React | Product UI with local shadcn-style primitives and lucide icons. |
| Contracts | Zod | Shared API validation and TypeScript inference. |
| Data | Drizzle + Postgres schema | Explicit relational schema and migration artifact. |
| Cloud DB | Neon Postgres | Real remote persistence for Published Application data. |
| Deploy | Vercel + Docker target | Two concrete deployment shapes, without making either a framework primitive. |
| Design | `DESIGN_CONTRACT.md` + OKLCH CSS | Developer-authored visual quality bar for generated apps. |

The important point is not the stack itself. The important point is that the stack is declared, tested, and bounded as a **profile contract**.

### Creation Host

The Host uses:

| Layer | Choice | Purpose |
|---|---|---|
| Host runtime | Bun TypeScript server | Small local Creation Host control plane. |
| Host UI | React | Builder-facing studio for lifecycle, request, proposal, trace, and evidence. |
| Code agent | Codex app-server, deterministic fallback | Real generated-source edits, plus stable tests without live AI. |
| Preview | Local disposable runtime copy | Safe sandbox for Builder inspection before publish. |
| Publish | Vercel REST API adapter | Host-owned cloud deployment lane with deployment receipt. |
| Published data | Neon Postgres | Remote production database used by the Published App. |
| Tests | Bun tests + browser E2E | Copy, draft, verify, proposal, apply, preview, publish, rollback. |

## How It Was Built

The example was built in two stages.

### Stage 1: Build The Generated App Profile First

The scaffold lives in:

```text
examples/production-generated-app-profile/
```

It was built as a complete app before being connected to the Host:

1. Define the release-operations domain: item, event, priority, status, risk, SLA, summary.
2. Implement Hono API routes and Zod validation.
3. Add memory repository for local/preview mode.
4. Add Drizzle schema and migration for Neon/Postgres.
5. Build a React product UI with local primitives, not raw browser controls.
6. Add Docker and Vercel entrypoints.
7. Add verification tests and `bun run verify`.
8. Document protected files and editable product roots in the stack profile.

This stage is Developer work. Alice proves the scaffold is useful before any agent touches it.

### Stage 2: Put The Profile Behind A Creation Host

The Host lives in:

```text
examples/production-profile-host/
```

The Host then wraps the scaffold in a governed lifecycle:

```text
Create from profile
  -> copy scaffold into Host workspace as source v0
  -> copy source into versions/v0
  -> preview v0 from a disposable runtime copy
  -> publish v0 locally or through Vercel
  -> prepare draft workspace
  -> run deterministic or Codex code-agent lane
  -> run generated app verify
  -> build proposal only if checks pass
  -> Builder approves
  -> apply draft as vNext
  -> publish active version
  -> rollback to previous version
```

The Host deliberately does not ask the agent to "make an app from nothing." Creating from the profile already gives Bob a complete v0 app. Agent work is optional evolution.

## The Framework Ideas Being Exercised

This example is not using every framework primitive, but it exercises the key post-RC shape.

| Framework idea | How the example uses it |
|---|---|
| Four-layer model | Framework -> Creation Host -> Generated Application -> Published Application remains visible. |
| Scaffold Project boundary | The agent edits a draft workspace copied from a Developer-authored scaffold. |
| Code Change Lane | Host treats source edits as governed draft changes, not direct production mutation. |
| Agent Debug Loop | Draft verification happens before proposal; timeout or failed checks do not silently become success. |
| Build Change Assurance | Proposal is shown only after generated-app verification, changed paths, and runtime evidence exist. |
| Preview vs publish separation | Preview uses disposable local data; publish uses the active version and real persistence target. |
| Release / rollback | Versions are materialized as `v0`, `v1`, `v2`; rollback copies the previous version back to source. |
| Host-owned provider adapter | Vercel deployment is an adapter in the Host example, not a framework requirement. |
| Runtime / data governance pressure | Published App uses Neon as the data source; demo rows are real rows, not request-time fallback. |

## Data Model And Seed Discipline

The Generated App owns two business tables:

```text
release_items
release_events
```

For local preview, the memory repository can use demo data because preview is disposable.

For Neon/Vercel recording and realistic operation, use the database as the source of truth:

1. Run migrations against Neon.
2. Insert initial rows into `release_items` and `release_events`.
3. Do not rely on request-time auto seed or fallback data in the Published Application.
4. Let user actions create and transition real rows in Neon.

This distinction matters. "Demo data as real seed rows" is acceptable. "Runtime silently fabricates rows when the production table is empty" hides the provider boundary and weakens the example.

## Cloud Publish Flow

When the Host runs in Vercel API mode:

```text
Publish runtime
  -> run generated-app db:migrate against Neon
  -> collect active version files
  -> upload missing file blobs to Vercel
  -> create production deployment through Vercel REST API
  -> wait for READY
  -> smoke /api/health
  -> smoke /api/items
  -> return deployment id, URL, file count, and READY state as evidence
```

The Host is responsible for this adapter. The framework should learn the shape of "structured publish receipt," but it should not hard-code Vercel as the only deploy target.

## UI Split

The two browser surfaces intentionally use different visual languages.

| Surface | Design intent |
|---|---|
| Builder / Host UI | Studio/control-plane surface: lifecycle controls, proposal, trace, profile facts, publish evidence. |
| Published App UI | End-user product surface: release queue, metrics, selected work, timeline, create form. |

This is not decorative. It helps the viewer understand which layer they are looking at:

- Builder is creating and governing the app.
- End User is using the app.

## How To Run

Install once:

```bash
bun install
```

Verify the generated app profile:

```bash
bun run --cwd examples/production-generated-app-profile verify
```

Run the Host locally with deterministic agent and local publish:

```bash
bun run --cwd examples/production-profile-host build
PORT=8900 bun run --cwd examples/production-profile-host serve
```

Run the Host with real Codex app-server:

```bash
PORT=8900 \
PNEUMA_PRODUCTION_PROFILE_AGENT=codex-app-server \
  bun run --cwd examples/production-profile-host serve
```

Run the Host with Neon + Vercel publish:

```bash
PNEUMA_PRODUCTION_PROFILE_DATABASE_URL="$DATABASE_URL" \
PNEUMA_VERCEL_TOKEN="$VERCEL_TOKEN" \
PNEUMA_VERCEL_PROJECT=production-generated-app-profile \
PNEUMA_PRODUCTION_PROFILE_DEPLOY=vercel-api \
PNEUMA_PRODUCTION_PROFILE_AGENT=codex-app-server \
PORT=8900 \
  bun run --cwd examples/production-profile-host serve
```

Open:

```text
http://127.0.0.1:8900/
```

Do not commit credentials. Use local env injection, a secret manager, or platform environment variables.

## Suggested Recording Flow

For a team demo or screen recording:

1. Start the Host with `PNEUMA_PRODUCTION_PROFILE_DEPLOY=vercel-api`, Neon URL, and Vercel token.
2. Ensure Neon has real seed rows in `release_items` and `release_events`.
3. Open the Builder UI.
4. Click `Create from profile`.
5. Click `Start preview`, then open the preview to show complete v0.
6. Ask the code agent for an evolution.
7. Watch the trace and proposal.
8. Approve and apply.
9. Publish runtime.
10. Open the Vercel URL and show the Published App using Neon data.
11. Return to the Host and show rollback availability.

The narrative to say out loud is:

```text
Alice provided the profile.
Bob created a complete app from it.
The agent evolved the app only after Bob asked.
The Host checked the draft before asking for approval.
Publish produced a real Vercel app backed by Neon.
Rollback remains a Host-controlled lifecycle action.
```

## What This Should Teach Framework Development

The example supports several framework conclusions:

- a real Creation Host needs a complete profile before agent evolution;
- code-agent work should happen in a draft workspace, not directly against the active app;
- proposal means "checked and ready for human decision," not "agent guessed something";
- cloud publish should return structured receipts;
- preview and production data must be separated;
- visual distinction between Builder surface and Published App surface is part of comprehension;
- provider choices should remain Host/profile concerns until a repeated pattern earns promotion.

It also exposes remaining production concerns:

- Vercel and Neon are still reference choices, not generic provider abstractions;
- credential handling is process-level for the example, not a hosted secret product;
- publish is acceptable as stop-and-deploy, not zero-downtime rollout;
- multi-user auth is intentionally out of scope for this slice;
- the example proves one product profile, not arbitrary app generation.

## Boundary

Framework should absorb:

- lifecycle vocabulary;
- scaffold boundary validation;
- code-agent attempt / debug-loop shape;
- proposal and approval semantics;
- publish evidence and rollback evidence contracts.

Framework should not absorb:

- Release Operations as a business domain;
- Bun/Hono/React/Drizzle/Zod as required stack choices;
- Neon or Vercel credentials;
- the exact Host UI;
- the exact Generated App UI.

This is the main lesson of the example: the framework should make this kind of Creation Host possible, inspectable, and governable, while leaving Alice free to choose the stack and product shape.
