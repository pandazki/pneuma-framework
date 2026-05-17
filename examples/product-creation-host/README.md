# Product Creation Host

**Status:** M47 expanded product-shaped Creation Host pressure example
**Chinese version:** [README.zh-CN.md](./README.zh-CN.md)

This example is not a milestone demo with scenario buttons. It is a small product a Developer could plausibly ship: **Dev Board Builder**.

The product lets a Builder create a local development board, ask a Build-phase Agent to evolve it, route the proposal through reviewer approval, preview the generated app, publish it, export a share artifact, and let another Builder fork and evolve their own version.

## What It Proves

M45 proved the Host Kit loop in a canonical Reference Host. M46 proved the first product-shaped layer. M47 expands the product so an outside reader can see Alice's Host contract, Bob's active version, Charlie's fork lineage, and End User runtime interactions:

```text
Developer builds a Creation Host product
  -> Builder creates and evolves a Generated Application
  -> Builder publishes a usable Published Application
  -> Builder shares a portable artifact
  -> another Builder forks, evolves, and publishes their own version
```

The generated app is a Dev Board with modules such as watchlist, review queue, release checklist, GitHub attention, priority lane, daily plan, and notes. End Users can add items, advance status, and raise priority inside the Published Application.

## Run

```bash
PORT=8896 bun run --cwd examples/product-creation-host serve
```

Open:

```text
http://127.0.0.1:8896/
```

The UI uses role selection instead of login:

- `user:bob` creates and publishes the first board.
- `role:reviewer` approves source/data-risk changes.
- `user:charlie` forks a share artifact and publishes a modified board.
- `user:end-user` represents the published-app user.

## Product Flow

1. Create **Engineering Dev Board**.
2. Publish v0 so Bob has a real active release before evolution.
3. Ask the agent to add a review queue.
4. Builder self-approval is recorded but blocked.
5. Reviewer approval applies the Code Change Lane proposal and data rehearsal.
6. Preview the generated app.
7. Publish v1 as the active version.
8. Export a no-secret share artifact.
9. Roll Bob back to v0 to prove release rollback is separate from artifact lineage.
10. Fork the v1 artifact into **Charlie's Dev Board**.
11. Ask the agent to add GitHub attention and a priority lane.
12. Route through the same reviewer approval.
13. Preview and publish Charlie's fork.
14. Open `/app/charlie-s-dev-board`, add a visible follow-up item as an End User, advance its status, and raise priority.

## External View

The workbench deliberately surfaces the three populations:

- **Alice / Developer:** owns the Host contract, stack profile, generated-app runtime UI, and provider-specific choices.
- **Bob / Builder:** creates, evolves, approves through the configured route, previews, publishes, shares, and rolls back his Generated Application.
- **Charlie / Builder:** forks Bob's portable artifact, evolves it under the same Host contract, and publishes his own active release.
- **End User:** uses the active Published Application and mutates runtime data through app-specific interactions.

The right pane includes a Versions tab and evidence tab so reviewers can see which version is current, which version is active, what was approved, and what boundary Alice chose.

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

The real-agent smoke builds two different boards:

- Engineering Dev Board with `review_queue`.
- Personal Focus Dev Board with `priority_lane` and `github_attention`.

The code agent only writes the draft `src/board.json`. The Host still owns verification, review packet creation, approval, guarded apply, data rehearsal, preview, publish, and evidence.

## Test

```bash
bun test examples/product-creation-host/product-host.test.ts examples/product-creation-host/ui-state.test.ts
```

## Architecture Shape

```text
Bun server
  -> ProductHostStore (SQLite)
  -> Scaffold Project source: projects/:appId/source/src/board.json
  -> Draft workspace: projects/:appId/draft
  -> Host Kit code-change / approval / rehearsal / publish loop
  -> Preview route: /preview/:appId
  -> Published route: /app/:appId
  -> Share artifact: no secrets, source snapshot + definition + provider requirements
```

## What It Does Not Claim

M47 does not claim production login, production isolation, cloud deployment, real provider OAuth, marketplace transport, or arbitrary app generation.

It does claim that Host Kit is sufficient to build a product-shaped Creation Host where Builders can create, govern, publish, roll back, use, share, and fork Generated Applications without relying on demo-only control buttons.
