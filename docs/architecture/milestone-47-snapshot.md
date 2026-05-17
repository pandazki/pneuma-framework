# Milestone 47 Snapshot

**Milestone:** M47, Product Host Expansion
**Status:** Closed
**Date:** 2026-05-17
**Chinese version:** [milestone-47-snapshot.zh-CN.md](./milestone-47-snapshot.zh-CN.md)

## Decision

M47 keeps the M46 product-shaped Creation Host, but expands it enough to review the project from an outside user's perspective.

M46 proved that Dev Board Builder could create, evolve, approve, preview, publish, share, fork, and use a Generated Application. M47 asks a sharper question:

```text
If Alice built this Creation Host,
can Bob and Charlie understand what they are doing,
can they see which layer changed,
and can we tell what belongs in the framework versus the Host product?
```

The answer is now meaningfully clearer.

## What Changed

### Alice's Contract Is Visible

The workbench now exposes an "Alice's contract / Host boundary" panel. It shows:

- what the framework owns: BuildThread transcript, code-change review packet, approval route evaluation, preview data rehearsal receipt, release rollout state;
- what Alice's Host owns: Dev Board domain modules, generated-app runtime UI, SQLite workspace layout, share artifact surface, public GitHub attention mapping.

This matters because a Creation Host is not just an app builder UI. It is the Developer's productized policy about what the Build-phase Agent may change and what the Host must verify.

### Bob And Charlie Have A Product Lineage

The selected project now has an external story panel:

```text
Alice ships the Creation Host contract
  -> Bob creates / evolves / publishes
  -> Charlie installs or forks the shared artifact
  -> End Users open the active published release
```

The app also exposes version cards, fork source, active version, current working version, and published URL. This separates Builder preview from End User release.

### The Generated App Is More Usable

The generated Dev Board runtime is no longer read-only:

- End Users can add items with an owner.
- Items can advance status.
- Items can be raised to P1.
- Review queue and priority lane changes remain visible in the app, schema, data, and version panels.

This is still intentionally small, but it now behaves like a real application surface rather than only a proof screen.

### Rollback Is Product-Visible

The workbench now has a rollback action. The browser E2E publishes v0, evolves to v1, shares v1, then rolls Bob back to v0 while Charlie can still fork the v1 artifact. That distinction is important:

```text
release rollback changes Bob's active Published Application
share artifact lineage remains a portable artifact decision
```

## External-View E2E

The browser flow was completed through the actual Chrome UI:

```text
Bob creates Engineering Dev Board
  -> publishes v0
  -> asks agent for review queue
  -> Bob approval is recorded but blocked
  -> reviewer approves
  -> preview v1 shows Review queue and needs_review data
  -> publish v1
  -> share v1
  -> rollback Bob active release to v0
  -> Charlie forks Bob's v1 artifact
  -> Charlie asks for GitHub attention + priority lane
  -> reviewer approves
  -> preview v1 shows GitHub attention, Priority lane, and Review queue
  -> publish Charlie v1
  -> End User adds "Review Linux deploy target"
  -> End User advances the new item to doing
```

The key product distinction is now visible without scenario-only buttons: Alice defines the Host contract, Bob builds and operates a Generated Application, Charlie forks from a share artifact, and End Users interact with the Published Application.

## Boundary Review

### Framework-Worthy

The expanded flow suggests these are broadly reusable framework or Host Kit concerns:

- BuildThread and proposal / decision / execution receipt transcript.
- Code-change review packets and approval route evaluation.
- Preview data rehearsal before publishing data-affecting changes.
- Release rollout state, active/previous version tracking, and rollback receipts.
- A normalized version / lineage projection helper for Creation Hosts.
- A documented Developer responsibility map, even if the product rendering stays Host-owned.

### Host-Owned

These should remain Developer / Host product choices:

- The Dev Board domain model and item lifecycle.
- Generated-app runtime UI and app-specific interactions.
- The exact share/fork product surface and copy.
- Public GitHub attention mapping and any provider-specific semantics.
- SQLite workspace layout and local process implementation.
- Whether the Host uses deterministic draft logic, opencode, Anthropic direct, or another backend.

### Current Product Gap

The largest remaining gap is not another primitive. It is product breadth:

- identity / profile selection is still a demo selector;
- credentials and provider auth are still mocked or public-data only;
- deployment is still local process based;
- no Runtime Agent is embedded in the Published Application;
- generated app UI is intentionally simple.

Those gaps are now easier to reason about because the four-layer boundary is visible inside the product.

## Verification

Focused suite:

```bash
bun test ./examples/product-creation-host/product-host.test.ts ./examples/product-creation-host/ui-state.test.ts
```

Monorepo typecheck:

```bash
bun run typecheck
```

Browser E2E:

```bash
PORT=8897 PNEUMA_PRODUCT_HOST_WORKSPACE=/tmp/pneuma-product-host-m47-browser \
bun run --cwd examples/product-creation-host serve
```

The browser run used real UI interactions, not a scenario-runner button.

