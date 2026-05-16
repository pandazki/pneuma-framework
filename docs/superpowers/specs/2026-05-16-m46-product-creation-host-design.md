# M46 Product Creation Host Design

Milestone: M46
Status: Closed
Date: 2026-05-16

## Goal

Build a product-shaped Creation Host reference example that a Developer could plausibly ship to Builders.

M45 proved the Host Kit implementation loop. M46 must prove the next layer:

```text
Developer builds a Creation Host product
  -> Builder creates and evolves a Generated Application
  -> Builder publishes a usable Published Application
  -> Builder shares a portable artifact
  -> another Builder forks, evolves, and publishes their own version
```

The example is intentionally concrete: **Dev Board Builder**. It lets Builders create local development dashboards with watchlists, review queues, GitHub-attention modules, priority lanes, release checklists, and notes.

## Non-Goals

- No login or production identity. The workbench uses a role selector.
- No production security or multi-tenant isolation.
- No cloud deployment target. Local publish is the default; Docker remains an adapter smoke later.
- No marketplace. Sharing is a local portable artifact inside the Host workspace.
- No arbitrary application builder. Dev Board Builder is a constrained product profile.
- No real provider OAuth. GitHub/Linear-like information is represented through public/mock provider modules and profile metadata.

## Capability Boundary

Framework / Host Kit owns:

- BuildThread transcript;
- backend code-agent draft handoff;
- Code Change Lane diff/review/apply;
- enterprise reviewer-route approval;
- Preview Data Rehearsal;
- publish readiness and Runtime/Data receipts;
- release rollout state;
- evidence vocabulary.

Creation Host owns:

- workbench UX;
- project/version/share/fork product model;
- generated-app source layout;
- generated-app runtime renderer;
- SQLite Host store;
- data migration implementation;
- provider/profile metadata;
- local publish URL strategy.

## Technical Choices

| Area | M46 choice | Why |
|---|---|---|
| Host backend | Bun + TypeScript HTTP server | Matches current repo, low install friction, can run real opencode path. |
| Host database | SQLite via `bun:sqlite` with explicit SQL migrations | Real persistence without adding ORM ceremony to the reference; future Hosts may use Drizzle/PG behind the same Host-owned boundary. |
| Workbench frontend | Static HTML/CSS/JS served by Bun | Keeps the reference inspectable and framework-independent while still allowing product-grade UI. |
| Generated app source | `src/board.json` inside a Scaffold Project | Code-agent can edit source through Code Change Lane; runtime can render the result deterministically. |
| Generated app runtime | Host-served preview/published routes | Makes published apps actually usable in browser without adding process-manager noise to the product story. |
| Agent backend | deterministic backend for CI, real opencode/OpenRouter for smoke | Tests remain stable; real opencode must build at least two different boards before closure. |
| Deployment | local published route with release receipt | Enough to prove publish/restart/rollback semantics at M46; cloud deploy remains adapter work. |
| Share/fork | no-secret artifact with definition, init recipe, provider requirements, source snapshot | Exercises the Alice/Bob/Charlie product story without treating a database file as the portable unit. |

## Required End-to-End Flow

The browser E2E must complete the real product workflow, not a one-click script:

1. Select Builder role.
2. Create an Engineering Dev Board.
3. Ask the agent to add a review queue.
4. Observe agent log and review packet.
5. Attempt Builder approval and see it blocked.
6. Switch to Reviewer role and approve.
7. Preview the evolved app.
8. Publish it.
9. Open the Published Application and use it.
10. Export a share artifact.
11. Switch to Charlie role.
12. Fork/import from the artifact.
13. Ask the agent to add a different capability.
14. Reviewer approves.
15. Preview and publish Charlie's fork.

The real opencode smoke must independently build at least two different boards:

- an Engineering Dev Board with `review_queue`;
- a Personal Focus Dev Board with `github_attention` and/or `priority_lane`.

## Design Register

This is product UI. The interface should feel like a serious workbench:

- dense but readable;
- no decorative hero treatment;
- no demo-only "run scenario" buttons;
- every action maps to a real product operation;
- preview, data, schema, evidence, and agent logs stay visible without modal churn;
- role switching is explicit because auth is out of scope.

## Closure Criteria

M46 is closed because:

1. `examples/product-creation-host/` is runnable.
2. Host state persists in SQLite.
3. Bob can create, evolve, approve via reviewer, preview, publish, use, and share.
4. Charlie can fork/import, evolve, approve, preview, publish, and use.
5. Browser E2E exercises the workflow through the UI.
6. Real opencode builds at least two different boards.
7. Tests cover backend flow, UI contract, and share/fork behavior.
8. Docs/snapshot explain what M46 proves and what remains out of scope.
