# Milestone 47 Snapshot

**Milestone:** M47, Product Host Expansion
**Status:** Closed
**Date:** 2026-05-17
**Close-out addendum:** 2026-05-20
**Chinese version:** [milestone-47-snapshot.zh-CN.md](./milestone-47-snapshot.zh-CN.md)

## Decision

M47 keeps the M46 product-shaped Creation Host, but expands it enough to review the project from an outside user's perspective.

M46 proved that Dev Board Builder could create, evolve, preview, publish, share, fork, and use a Generated Application. M47 asked a sharper question:

```text
If Alice built this Creation Host,
can Bob and Charlie understand what they are doing,
can they see which layer changed,
and can we tell what belongs in the framework versus the Host product?
```

The answer is clearer now, but the line is also closed. Dev Board Builder should be treated as a pressure example, not as the next product foundation.

## What Changed

### Alice's Contract Became Visible

The workbench exposed the boundary between framework concerns and Alice's Host choices:

- framework-owned: BuildThread transcript, code-change review packet, approval route evaluation, preview data rehearsal receipt, release rollout state;
- Host-owned: Dev Board domain modules, generated-app runtime UI, local SQLite workspace layout, share artifact surface, and provider-specific mappings.

This matters because a Creation Host is not just an app builder UI. It is the Developer's productized policy about what the Build-phase Agent may change and what the Host must verify.

### Bob And Charlie Got Product Lineage

The product surfaced the four-layer path:

```text
Alice ships the Creation Host contract
  -> Bob creates / evolves / publishes
  -> Charlie installs or forks the shared artifact
  -> End Users open the active published release
```

The app exposed version cards, fork source, active version, current working version, preview URL, and published URL. That separation made Builder preview and End User release easier to reason about.

### The Generated App Became Interactive

The generated Dev Board runtime stopped being read-only:

- End Users can add items.
- Items can advance status.
- Items can be raised to P1.
- Preview app clicks write only to preview data copies.
- Published app clicks write to the active published app data.

The close-out iteration also added a controlled runtime extension lane:

- `src/board.json` describes modules, fields, theme, and sample data.
- `src/runtime.json` describes app-specific item actions.
- A real opencode task added `edit_owner` to `src/runtime.json`.
- The published app then allowed changing an item's owner.

This is a meaningful pressure result because it proves a real Build-phase Agent can alter generated-app behavior through a governed source boundary. It does not prove arbitrary runtime code editing.

### Rollback Became Product-Visible

The workbench has rollback as a product action. The browser E2E published v0, evolved to v1, shared v1, then rolled Bob back to v0 while Charlie could still fork the v1 artifact. That distinction is important:

```text
release rollback changes Bob's active Published Application
share artifact lineage remains a portable artifact decision
```

## Close-Out Evidence

The final scope should be read as:

```text
M47 proves a product-shaped Creation Host pressure sample
  -> with controlled generated source artifacts
  -> with real opencode proposal generation
  -> with Builder approval and execution receipts
  -> with preview/publish/share/fork/rollback evidence
```

It should not be read as:

```text
M47 proves a complete real Creation Host product
M47 proves arbitrary React/TypeScript generated runtime editing
M47 proves production identity, provider OAuth, cloud deploy, or marketplace transport
```

## External-View E2E

The browser and scripted validation covered these product paths:

```text
Bob creates Engineering Dev Board
  -> publishes v0
  -> asks agent for review queue
  -> Builder approval applies the governed proposal
  -> preview v1 shows Review queue and needs_review data
  -> publish v1
  -> share v1
  -> rollback Bob active release to v0
  -> Charlie forks Bob's v1 artifact
  -> Charlie evolves a separate lineage
  -> preview and publish Charlie's version
  -> End User uses the published app
```

Final real-agent close-out:

```text
Builder request: allow direct owner editing
opencode changed: src/runtime.json
proposal: Add direct owner editing to the Dev Board
runtime action: edit_owner
approval: Builder approved
published check: owner changed from Bob to Alice through the app runtime
```

## Boundary Review

### Framework-Worthy

The expanded flow suggests these are reusable framework or Host Kit concerns:

- BuildThread and proposal / decision / execution receipt transcript.
- Code-change review packets and approval route evaluation.
- Controlled source-boundary validation for generated artifacts.
- Preview data rehearsal before publishing data-affecting changes.
- Preview data copy semantics for interactive runtime checks.
- Release rollout state, active/previous version tracking, and rollback receipts.
- A normalized version / lineage projection helper for Creation Hosts.
- Guardrail hooks before proposal, before apply, and after apply.

### Host-Owned

These should remain Developer / Host product choices:

- Dev Board domain model and item lifecycle.
- Generated-app runtime UI and app-specific interactions.
- `src/board.json` and `src/runtime.json` schema choices.
- The exact share/fork product surface and copy.
- Provider-specific mapping such as GitHub attention.
- SQLite workspace layout and local process implementation.
- Whether the Host uses deterministic draft logic, opencode, Anthropic direct, or another backend.

### Current Product Gap

The largest remaining gap is no longer this example. The next useful step is a fresh real Creation Host example with a clean product brief.

Known M47 limits:

- identity is still a demo selector;
- credentials and provider auth are mocked or public-data only;
- deployment is still local process based;
- no Runtime Agent is embedded in the Published Application;
- generated app runtime editing is controlled JSON extension, not arbitrary UI/code editing;
- the Dev Board product is useful for pressure, but too narrow to be the next foundation.

## Verification

Focused example suite:

```bash
bun test ./examples/product-creation-host/product-host.test.ts ./examples/product-creation-host/ui-state.test.ts ./examples/product-creation-host/dev-board-domain.test.ts ./examples/product-creation-host/server-preview.test.ts
```

Result:

```text
14 pass / 0 fail
```

Diff hygiene:

```bash
git diff --check
```

Result:

```text
clean
```

Real opencode evidence:

```text
changed_files: ["src/runtime.json"]
runtime action: edit_owner
published owner patch: Bob -> Alice
```

## Next Step

Stop extending Dev Board Builder. Use M47 as evidence and start a new real Creation Host example from a product brief:

```text
not "how do we make this demo prettier?"
but "what product can Alice actually ship so Bob can create useful apps?"
```

That next example should use the lessons from M47, especially the controlled source boundary, preview data copy, proposal packet, real-agent feedback, and clear separation between Builder workbench and Published Application.
