# Product Creation Host

**Status:** M47 closed pressure example for a product-shaped Creation Host
**Chinese version:** [README.zh-CN.md](./README.zh-CN.md)

This example is not the next real Creation Host product. It is a deliberately bounded pressure sample for **Dev Board Builder**, used to test whether Host Kit can support a product-shaped Builder workflow without falling back to scenario-only demo buttons.

It should now be treated as closed evidence. The next real Creation Host example should start from a clean product problem instead of extending this Dev Board experiment.

## What It Proved

M45 proved the Host Kit loop in a canonical Reference Host. M46 shaped the first product surface. M47 expanded that surface enough to review the four-layer model from outside:

```text
Developer builds a Creation Host product
  -> Builder creates and evolves a Generated Application
  -> Builder previews and publishes a usable Published Application
  -> Builder shares a portable artifact
  -> another Builder forks, evolves, and publishes their own version
```

The example proved these specific claims:

- Bob can create, evolve, preview, publish, share, roll back, and use a Dev Board generated app.
- Charlie can fork Bob's share artifact, evolve a separate lineage, preview it, publish it, and use it.
- Preview behaves like a checkout: each preview starts from a fresh sandbox data copy and is destroyed when preview ends.
- Runtime app interactions are real enough to mutate data in preview and published modes.
- A real opencode backend can produce a governed proposal against controlled Generated App source.
- The Host can expose a clear proposal packet: original request, agent interpretation, precise proposal, highlights, diff, confirmation, receipt, preview, publish, and rollback evidence.

## Controlled Source Boundary

This example intentionally narrows the code-change surface to two generated source artifacts:

```text
projects/:appId/source/src/board.json
projects/:appId/source/src/runtime.json
projects/:appId/draft/src/board.json
projects/:appId/draft/src/runtime.json
```

`src/board.json` describes the Dev Board definition: modules, fields, theme, and sample data.

`src/runtime.json` describes controlled runtime item actions. The owner-edit task is the important validation: opencode changed `src/runtime.json` to add an `edit_owner` action, the Host validated it, Builder approval applied it, preview showed it, publish carried it forward, and the published app accepted an owner change.

This is not arbitrary React or TypeScript runtime editing. It is a Host-owned runtime extension lane with explicit validation. That boundary is the useful lesson.

## Product Flow

1. Create **Engineering Dev Board**.
2. Publish v0 so the Builder has a real active release before evolution.
3. Ask the agent for a fuzzy change, such as adding a review queue or allowing owner edits.
4. The agent turns the request into an interpretation, a precise proposal, key-change highlights, and a diff.
5. Builder confirmation applies the guarded Code Change Lane proposal and data rehearsal.
6. Start preview. The app is fully interactive, but writes only to a preview data copy.
7. Publish the checked version as the active Published Application.
8. Export a no-secret share artifact.
9. Roll back the active release to prove release rollback is separate from artifact lineage.
10. Fork the artifact into a second board and repeat the same governed loop.

The product intentionally separates Builder workbench and app runtime. Preview and published app routes open as app surfaces; the Builder workbench remains the place where conversation, approval, evidence, publish, share, and rollback happen.

## Run

```bash
PORT=8896 bun run --cwd examples/product-creation-host serve
```

Open:

```text
http://127.0.0.1:8896/
```

The UI uses a simple Builder identity selector instead of production login. Authentication, provider OAuth, and hosted authorization are outside this example.

## Real opencode Smoke

Run the live code-agent path:

```bash
PNEUMA_PRODUCT_HOST_WORKSPACE=/tmp/pneuma-product-host-real-agent \
PNEUMA_KEEP_PRODUCT_HOST_WORKSPACE=1 \
bun run --cwd examples/product-creation-host real-agent
```

The default live model is:

```text
openrouter/anthropic/claude-opus-4.7
```

The real-agent path validates controlled source changes, not demo-only state mutation. Current covered behaviors include:

- adding generated app modules through `src/board.json`;
- adding the owner-edit runtime action through `src/runtime.json`;
- rejecting unsupported draft file changes;
- carrying the accepted runtime extension into preview and published app behavior.

## Test

```bash
bun test ./examples/product-creation-host/product-host.test.ts ./examples/product-creation-host/ui-state.test.ts ./examples/product-creation-host/dev-board-domain.test.ts ./examples/product-creation-host/server-preview.test.ts
```

The last close-out run passed the full example package suite:

```text
14 pass / 0 fail
```

## Architecture Shape

```text
Bun server
  -> ProductHostStore (SQLite)
  -> Generated source: source/src/board.json + source/src/runtime.json
  -> Draft workspace: draft/src/board.json + draft/src/runtime.json
  -> Host Kit code-change / approval / rehearsal / publish loop
  -> Runtime extension validation for app-specific item actions
  -> Preview route: /preview/:appId?preview_id=:sandboxId
  -> Preview sandbox data copy: per Start preview, discarded on end/publish/rollback/TTL
  -> Published route: /app/:appId
  -> Share artifact: no secrets, source snapshot + runtime extension + provider requirements
```

## Boundary Review

Framework or Host Kit worthy:

- source-boundary validation for controlled generated artifacts;
- proposal packets that bind request, diff, highlights, approval, and receipt;
- preview data copy semantics before publishing;
- release rollout, restart, rollback, and lineage projections;
- reusable guardrail hooks for Host-owned generated source.

Host-owned:

- Dev Board domain model and runtime UI;
- `src/board.json` and `src/runtime.json` schemas;
- app-specific item actions such as owner editing;
- share/fork product copy and visual design;
- local SQLite workspace layout and Bun process choices.

## What It Does Not Claim

M47 does not claim production login, cloud deployment, real provider OAuth, marketplace transport, broad app generation, or arbitrary generated-app code editing.

It does claim that Host Kit is sufficient to build a product-shaped Creation Host pressure sample where Builders can create, govern, preview, publish, roll back, use, share, and fork Generated Applications through a controlled Build-phase Agent loop.

Next step: start a new real Creation Host example from a clean product brief, with this experiment treated as evidence and not as the product foundation.
